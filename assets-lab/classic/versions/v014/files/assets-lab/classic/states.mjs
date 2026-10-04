import { terminalGraceSvg } from './contrast.mjs';
import { brightBodyState } from './bright-body.mjs';

// 트릴 켜짐 바디는 반투명 사각 기둥 내부 조명 타일(body-trill-on-frosted), 끝 터미널은 에디터와 같은 회색 마름모 하나를 상태 공통으로 쓴다.
// 석영 켜짐 바디·끝 터미널 원본(body-trill-on.svg, terminal-end-trill*.svg)은 석영 미리보기 생성기(scripts/build-trill-quartz.mjs)가
// 다시 쓰는 파일이라 Classic 빌드 입력에서 뺀다.
export const CLASSIC_SOURCE_NAMES = ['point-single','point-double','body-single-bright','body-double-bright',
  'point-trill','body-trill','body-trill-on-frosted','body-trill-failed','terminal-end-trill-editor'];

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
    const body = sources[`body-${flavor}-bright`];
    for (const state of ['idle', 'on', 'off', ...(flavor === 'double' ? ['partial-off'] : [])]) {
      assets[`body-${flavor}-${state}`] = brightBodyState(body, state);
    }
    for (const direction of ['start', 'end']) {
      for (const state of ['on', 'idle', 'failed', ...(flavor === 'double' ? ['partial-off'] : [])]) {
        const suffix = state === 'on' ? '' : '-' + state;
        assets[`terminal-${direction}-${flavor}${suffix}`] = assets[`body-${flavor}-${state === 'failed' ? 'off' : state}`];
      }
      assets[`terminal-${direction}-${flavor}-grace`] = terminalGraceSvg(assets[`body-${flavor}-on`], flavor);
    }
    // The shared tile is vertically invariant, including the renderer's start flip.
    for (const suffix of ['', '-idle', '-failed', '-grace', ...(flavor === 'double' ? ['-partial-off'] : [])]) {
      assets[`terminal-${flavor}${suffix}`] = assets[`terminal-end-${flavor}${suffix}`];
    }
  }
  // 석영 포인트·대기·실패 바디는 승인한 상태별 원본을, 켜짐 바디는 반투명 기둥 내부 조명 타일을, 끝 터미널은 에디터 회색 마름모를 상태 공통으로 쓴다.
  assets['note-trill'] = sources['point-trill'];
  assets['note-trill-failed'] = neutralize(sources['point-trill']);
  assets['body-trill-idle'] = sources['body-trill'];
  assets['body-trill-on'] = sources['body-trill-on-frosted'];
  assets['body-trill-off'] = sources['body-trill-failed'];
  for (const suffix of ['', '-idle', '-failed']) assets[`terminal-trill${suffix}`] = sources['terminal-end-trill-editor'];
  for (const [kind, width] of [['point',1060],['terminal',1000]]) {
    assets[`${kind}-grace-overlay`] = terminalGraceSvg(`<svg viewBox="0 0 ${width} 200"></svg>`);
  }
  assets['point-shadow'] = '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="32" viewBox="0 0 1000 32"><defs><linearGradient id="shadow" x2="0" y2="1"><stop stop-color="#020915" stop-opacity=".48"/><stop offset="1" stop-color="#020915" stop-opacity="0"/></linearGradient></defs><rect width="1000" height="32" fill="url(#shadow)"/></svg>';
  // 싱글·더블 포인트 위아래 접촉 그림자: 윗행이 가장 짙고 아래로 사라진다. 렌더러가 위쪽은 뒤집어 그린다.
  assets['point-contact-shadow'] = '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="100" viewBox="0 0 1000 100" data-contrast="point-contact-shadow"><defs><linearGradient id="contact" x2="0" y2="1"><stop stop-color="#020915" stop-opacity=".4"/><stop offset="1" stop-color="#020915" stop-opacity="0"/></linearGradient></defs><rect width="1000" height="100" fill="url(#contact)"/></svg>';
  assets['point-contact-shadow-trill'] = trillContactShadowSvg();
  return assets;
}

/**
 * 트릴 포인트(1000×200, 5:1 마름모) 테두리를 따라 번지는 접촉 그림자. 포인트를 위아래 reach 여백 가운데에 두고,
 * 테두리에서 d만큼 떨어진 곳의 농도가 peak × (1 - d / reach)^1.3이 되도록 바깥에서 안쪽으로 커지는 마름모를 겹친다.
 * 포인트 자리는 마스크로 비우되, 불투명한 포인트의 안티에일리어싱 가장자리에서도 경계가 짙게 남도록 inset만큼 안쪽에서 자른다.
 */
function trillContactShadowSvg(reach = 50, peak = 0.7, steps = 25, inset = 10) {
  const halfWidth = 500, halfHeight = 100, centerY = halfHeight + reach, height = halfHeight * 2 + reach * 2;
  const edgeDistance = halfWidth * halfHeight / Math.hypot(halfWidth, halfHeight);
  const shade = distance => peak * Math.max(0, 1 - distance / reach) ** 1.3;
  const round = value => Number(value.toFixed(2));
  let layers = '';
  for (let step = steps; step >= 1; step--) {
    const outer = reach * step / steps, inner = reach * (step - 1) / steps;
    // 이 층까지 겹친 누적 농도가 안쪽 경계의 shade(inner)가 되도록 층 불투명도를 정한다.
    const opacity = 1 - (1 - shade(inner)) / (1 - shade(outer));
    const scale = 1 + outer / edgeDistance;
    const [left, right] = [500 - halfWidth * scale, 500 + halfWidth * scale].map(round);
    const [top, bottom] = [centerY - halfHeight * scale, centerY + halfHeight * scale].map(round);
    layers += `<path d="M${left} ${centerY} 500 ${top} ${right} ${centerY} 500 ${bottom}Z" fill-opacity="${opacity.toFixed(4)}"/>`;
  }
  // 모든 층이 포인트 마름모를 덮으므로 포인트 안쪽 농도는 peak다. 마스크는 그중 inset 바깥 띠만 남긴다.
  const cut = 1 - inset / edgeDistance;
  const [cutLeft, cutRight] = [500 - halfWidth * cut, 500 + halfWidth * cut].map(round);
  const [cutTop, cutBottom] = [centerY - halfHeight * cut, centerY + halfHeight * cut].map(round);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${height}" viewBox="0 0 1000 ${height}" data-contrast="point-contact-shadow-trill" data-reach="${reach}" data-peak="${peak}" data-inset="${inset}">`
    + `<defs><mask id="trill-contact-cut"><rect width="1000" height="${height}" fill="#fff"/><path d="M${cutLeft} ${centerY} 500 ${cutTop} ${cutRight} ${centerY} 500 ${cutBottom}Z" fill="#000"/></mask></defs>`
    + `<g mask="url(#trill-contact-cut)" fill="#020915">${layers}</g></svg>`;
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
  pointContactShadow: 'point-contact-shadow', pointContactShadowTrill: 'point-contact-shadow-trill',
};
