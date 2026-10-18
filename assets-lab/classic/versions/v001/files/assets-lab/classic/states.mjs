import { terminalGraceSvg } from './contrast.mjs';
import { startTerminalSvg, endTerminalSvg } from './terminals.mjs';

export const CLASSIC_SOURCE_NAMES = ['point-single','point-double','body-single-dark','body-double-dark','terminal-start-single','terminal-start-double',
  'point-trill','body-trill','terminal-end-trill',
  'body-trill-on','body-trill-failed','terminal-end-trill-on','terminal-end-trill-failed'];

function replaceGroup(source, attribute, value, replace, required = true) {
  const start = source.search(new RegExp(`<g\\b[^>]*${attribute}="${value}"[^>]*>`));
  if (start < 0) {
    if (required) throw new Error(`Missing ${attribute}=${value}`);
    return source;
  }
  const tags = /<g\b[^>]*>|<\/g>/g;
  tags.lastIndex = start;
  let depth = 0;
  for (let tag; (tag = tags.exec(source));) {
    depth += tag[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return source.slice(0, start) + replace(source.slice(start, tags.lastIndex))
      + replaceGroup(source.slice(tags.lastIndex), attribute, value, replace, false);
  }
  throw new Error(`Unclosed ${value} group`);
}

export function neutralize(source) {
  return source.replace(/#([0-9a-f]{6})(?=")/gi, (_, hex) => {
    const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
    return '#' + Math.round(r * .2126 + g * .7152 + b * .0722).toString(16).padStart(2, '0').repeat(3);
  });
}

export function bodyState(source, state) {
  if (state === 'on') return source;
  if (state === 'idle') return replaceGroup(source, 'data-light', 'white', group => group.replace('<g ', '<g opacity="0" '));
  if (state === 'off') return neutralize(replaceGroup(source, 'data-layer', 'emission', () => ''));
  if (state === 'partial-off') {
    let result = replaceGroup(source, 'data-light', 'spill', () => '');
    result = replaceGroup(result, 'data-light', 'yellow', () => '');
    // White edge gradients must lose the yellow cast along with the yellow light.
    const ids = new Set();
    replaceGroup(result, 'data-light', 'white', group => {
      for (const match of group.matchAll(/url\(#([^)]*)\)/g)) ids.add(match[1]);
      return group;
    });
    return result.replace(/<linearGradient id="([^"]+)"[\s\S]*?<\/linearGradient>/g,
      (gradient, id) => ids.has(id) ? gradient.replace(/stop-color="#[0-9a-f]{6}"/gi, 'stop-color="#ffffff"') : gradient);
  }
  throw new Error(`Unknown body state: ${state}`);
}

export function terminalState(source, state) {
  return bodyState(source, state === 'failed' ? 'off' : state);
}

export function buildClassicAssets(sources) {
  const assets = {};
  for (const flavor of ['single', 'double']) {
    const point = sources[`point-${flavor}`];
    assets[`note-${flavor}`] = point;
    assets[`note-${flavor}-failed`] = neutralize(replaceGroup(point, 'data-layer', 'emission', () => ''));
    const body = sources[`body-${flavor}-dark`];
    for (const state of ['idle', 'on', 'off', ...(flavor === 'double' ? ['partial-off'] : [])]) {
      assets[`body-${flavor}-${state}`] = bodyState(body, state);
    }
    const start = sources[`terminal-start-${flavor}`] ?? startTerminalSvg(body, flavor);
    const end = endTerminalSvg(start);
    for (const [direction, terminal] of [['start', start], ['end', end]]) {
      for (const state of ['on', 'idle', 'failed', ...(flavor === 'double' ? ['partial-off'] : [])]) {
        const suffix = state === 'on' ? '' : '-' + state;
        assets[`terminal-${direction}-${flavor}${suffix}`] = terminalState(terminal, state);
      }
      assets[`terminal-${direction}-${flavor}-grace`] = terminalGraceSvg(terminal, flavor);
    }
    // The renderer uses the end texture directly and vertically flips it at the start.
    for (const suffix of ['', '-idle', '-failed', '-grace', ...(flavor === 'double' ? ['-partial-off'] : [])]) {
      assets[`terminal-${flavor}${suffix}`] = assets[`terminal-end-${flavor}${suffix}`];
    }
  }
  // Quartz body and end cap share each approved state's material and internal light.
  assets['note-trill'] = sources['point-trill'];
  assets['note-trill-failed'] = neutralize(sources['point-trill']);
  assets['body-trill-idle'] = sources['body-trill'];
  assets['body-trill-on'] = sources['body-trill-on'];
  assets['body-trill-off'] = sources['body-trill-failed'];
  assets['terminal-trill'] = sources['terminal-end-trill-on'];
  assets['terminal-trill-idle'] = sources['terminal-end-trill'];
  assets['terminal-trill-failed'] = sources['terminal-end-trill-failed'];
  for (const [kind, width] of [['point',1060],['terminal',1000]]) {
    assets[`${kind}-grace-overlay`] = terminalGraceSvg(`<svg viewBox="0 0 ${width} 200"></svg>`);
  }
  assets['point-shadow'] = '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="32" viewBox="0 0 1000 32"><defs><linearGradient id="shadow" x2="0" y2="1"><stop stop-color="#020915" stop-opacity=".48"/><stop offset="1" stop-color="#020915" stop-opacity="0"/></linearGradient></defs><rect width="1000" height="32" fill="url(#shadow)"/></svg>';
  return assets;
}

export const RUNTIME_ASSET_MAP = {
  noteSingle: 'note-single', noteDouble: 'note-double',
  noteDoubleFailed: 'note-double-failed', noteTrill: 'note-trill', noteTrillFailed: 'note-trill-failed',
  noteDoublePartialFailedLeft: 'note-double', noteDoublePartialFailedRight: 'note-double',
  bodySingle: 'body-single-idle', bodyDouble: 'body-double-idle',
  bodySingleHeld: 'body-single-on', bodyDoubleHeld: 'body-double-on',
  bodySingleFailed: 'body-single-off', bodyDoubleFailed: 'body-double-off',
  bodyDoublePartialFailedLeft: 'body-double-partial-off', bodyDoublePartialFailedRight: 'body-double-partial-off',
  bodyDoublePartialHeldLeft: 'body-double-partial-off', bodyDoublePartialHeldRight: 'body-double-partial-off',
  bodyTrill: 'body-trill-idle', bodyTrillHeld: 'body-trill-on', bodyTrillFailed: 'body-trill-off',
  terminalSingle: 'terminal-single', terminalDouble: 'terminal-double',
  terminalSingleIdle: 'terminal-single-idle', terminalDoubleIdle: 'terminal-double-idle',
  terminalSingleFailed: 'terminal-single-failed', terminalDoubleFailed: 'terminal-double-failed',
  terminalDoublePartialFailedLeft: 'terminal-double-partial-off', terminalDoublePartialFailedRight: 'terminal-double-partial-off',
  terminalTrill: 'terminal-trill', terminalTrillIdle: 'terminal-trill-idle', terminalTrillFailed: 'terminal-trill-failed',
  pointGraceOverlay: 'point-grace-overlay', terminalGraceOverlay: 'terminal-grace-overlay', pointShadow: 'point-shadow',
};
