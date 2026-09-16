/** Selected quartz concept 06, reconstructed as editable vector surfaces. */
export const TRILL_SOURCE_WIDTH = 1000;
export const TRILL_SOURCE_HEIGHT = 200;
export const TRILL_DIAMOND = 'M0 100 500 0 1000 100 500 200Z';

export const TRILL_QUARTZ_STATES = {
  idle: { label: '대기', body: 'body-trill', terminal: 'terminal-end-trill' },
  on: { label: '켜짐', body: 'body-trill-on', terminal: 'terminal-end-trill-on' },
  failed: { label: '실패', body: 'body-trill-failed', terminal: 'terminal-end-trill-failed' },
};

const surfaceDefs = (id) => `
    <linearGradient id="${id}-left-reflection" x1="0" y1="0" x2="500" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".48"/>
      <stop offset=".24" stop-color="#ffffff" stop-opacity=".19"/>
      <stop offset=".58" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset=".8" stop-color="#ffffff" stop-opacity=".04"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity=".24"/>
    </linearGradient>
    <linearGradient id="${id}-right-reflection" x1="500" y1="0" x2="1000" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".14"/>
      <stop offset=".22" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset=".42" stop-color="#ffffff" stop-opacity=".035"/>
      <stop offset=".68" stop-color="#ffffff" stop-opacity=".17"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity=".49"/>
    </linearGradient>`;

// Body and terminal use precisely the same opaque faces and reflected light.
// Every paint value depends on x only: a tile can repeat/crop at any y.
const surface = (id) => `
  <g id="${id}-base" data-layer="base">
    <path id="${id}-material-foundation" fill="#9b9ea3" d="M0 0H1000V200H0Z"/>
    <path id="${id}-right-face" fill="#878b8f" d="M500 0H1000V200H500Z"/>
  </g>
  <g id="${id}-reflections" data-layer="reflections">
    <path id="${id}-left-reflected-light" fill="url(#${id}-left-reflection)" d="M0 0H500V200H0Z"/>
    <path id="${id}-right-reflected-light" fill="url(#${id}-right-reflection)" d="M500 0H1000V200H500Z"/>
    <path id="${id}-center-edge" d="M500 0V200" fill="none" stroke="#edf0f5" stroke-opacity=".7" stroke-width="2"/>
    <path id="${id}-outer-silhouette" d="M.6 0V200M999.4 0V200" fill="none" stroke="#edf0f5" stroke-opacity=".55" stroke-width="1.2"/>
  </g>`;

// Color/opacity stops reconstruct the approved imagegen states, without the
// raster's horizontal edge artifacts. All paint remains independent of y.
const statePalettes = {
  on: {
    left: '#9da2ab', right: '#9b9fa8',
    leftReflection: [[0,.66],[.1,.42],[.2,.23],[.4,0],[1,0]],
    rightReflection: [[0,0],[.6,0],[.8,.25],[.9,.44],[1,.66]],
    centerOpacity: 0, edgeOpacity: .18,
  },
  failed: {
    left: '#4c4c4c', right: '#383838',
    leftReflection: [[0,.26],[.1,.17],[.2,.1],[.4,.05],[.6,0],[.8,.01],[.9,.06],[1,.11]],
    rightReflection: [[0,.17],[.04,.06],[.1,.045],[.2,0],[.4,.015],[.6,.065],[.8,.15],[.9,.22],[1,.3]],
    centerOpacity: .16, edgeOpacity: .08,
  },
};

function materialForState(id, state) {
  if (!Object.hasOwn(TRILL_QUARTZ_STATES, state)) throw new RangeError(`Unknown quartz state: ${state}`);
  if (state === 'idle') return { defs: surfaceDefs(id), artwork: surface(id) };
  const p = statePalettes[state];
  const reflection = (side, x1, x2, stops) => `
    <linearGradient id="${id}-${side}-reflection" x1="${x1}" y1="0" x2="${x2}" y2="0" gradientUnits="userSpaceOnUse">${stops.map(([offset,opacity]) => `
      <stop offset="${offset}" stop-color="#ffffff" stop-opacity="${opacity}"/>`).join('')}
    </linearGradient>`;
  const emissionStops = [[0,0],[.2,0],[.3,.23],[.4,.68],[.45,.88],[.485,.98],[.5,.99],[.52,.94],[.55,.85],[.6,.61],[.7,.14],[.8,0],[1,0]];
  const defs = reflection('left',0,500,p.leftReflection) + reflection('right',500,1000,p.rightReflection) + (state === 'on' ? `
    <linearGradient id="${id}-internal-light" x1="0" y1="0" x2="1000" y2="0" gradientUnits="userSpaceOnUse">${emissionStops.map(([offset,opacity]) => `
      <stop offset="${offset}" stop-color="#ffffff" stop-opacity="${opacity}"/>`).join('')}
    </linearGradient>` : '');
  const artwork = `
  <g id="${id}-base" data-layer="base">
    <path id="${id}-material-foundation" fill="${p.left}" d="M0 0H1000V200H0Z"/>
    <path id="${id}-right-face" fill="${p.right}" d="M500 0H1000V200H500Z"/>
  </g>
  <g id="${id}-reflections" data-layer="reflections">
    <path fill="url(#${id}-left-reflection)" d="M0 0H500V200H0Z"/>
    <path fill="url(#${id}-right-reflection)" d="M500 0H1000V200H500Z"/>
    <path d="M500 0V200" fill="none" stroke="#ffffff" stroke-opacity="${p.centerOpacity}" stroke-width="2"/>
    <path d="M.6 0V200M999.4 0V200" fill="none" stroke="#ffffff" stroke-opacity="${p.edgeOpacity}" stroke-width="1.2"/>
  </g>${state === 'on' ? `
  <g id="${id}-emission" data-layer="emission" data-light="white">
    <path fill="url(#${id}-internal-light)" d="M0 0H1000V200H0Z"/>
  </g>` : ''}`;
  return { defs, artwork };
}

const root = (role, title, defs, artwork, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="200" viewBox="0 0 1000 200" fill="none" data-artwork="trill-quartz-06" data-role="${role}" ${extra}>
  <title>${title}</title>
  <desc>Editable vector artwork. Shared width 1000; point and terminal have a vertically symmetric 5:1 diamond silhouette. No embedded raster image.</desc>
  <defs>${defs}
  </defs>${artwork}
</svg>\n`;

export function trillBodySvg(state = 'idle') {
  const material = materialForState('quartz-body', state);
  return root('body', 'Trill · 석영 바디', material.defs, material.artwork, `data-repeat="y"${state === 'idle' ? '' : ` data-state="${state}"`}`);
}

export function trillTerminalSvg(state = 'idle') {
  const material = materialForState('quartz-terminal', state);
  return root('terminal-end', 'Trill · 바디 재질의 마름모 끝 터미널', `${material.defs}
    <clipPath id="quartz-terminal-diamond" clipPathUnits="userSpaceOnUse"><path d="${TRILL_DIAMOND}"/></clipPath>`, `
  <g id="quartz-terminal-silhouette" clip-path="url(#quartz-terminal-diamond)">${material.artwork}
  </g>`, state === 'idle' ? '' : `data-state="${state}"`);
}

export function trillPointSvg() {
  return root('point', 'Trill · 6번 흰 석영 포인트', `
    <clipPath id="quartz-point-diamond" clipPathUnits="userSpaceOnUse"><path d="${TRILL_DIAMOND}"/></clipPath>
    <linearGradient id="quartz-point-center-left" x1="475" y1="5" x2="330" y2="200" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ffffff"/><stop offset=".42" stop-color="#fafbfe"/><stop offset="1" stop-color="#e7eaf1"/>
    </linearGradient>
    <linearGradient id="quartz-point-center-right" x1="500" y1="0" x2="740" y2="180" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ffffff"/><stop offset=".56" stop-color="#e8eaf0"/><stop offset="1" stop-color="#d8dce5"/>
    </linearGradient>
    <linearGradient id="quartz-point-cut-left" x1="170" y1="120" x2="500" y2="0" gradientUnits="userSpaceOnUse">
      <stop stop-color="#b9bdc7"/><stop offset=".6" stop-color="#c8ccd5"/><stop offset="1" stop-color="#f6f7fb"/>
    </linearGradient>
    <linearGradient id="quartz-point-cut-right" x1="840" y1="122" x2="500" y2="0" gradientUnits="userSpaceOnUse">
      <stop stop-color="#afb4bf"/><stop offset=".57" stop-color="#c3c8d2"/><stop offset="1" stop-color="#f4f6fa"/>
    </linearGradient>
    <linearGradient id="quartz-point-lower-left" x1="90" y1="100" x2="500" y2="200" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ffffff"/><stop offset=".7" stop-color="#e9ecf3"/><stop offset="1" stop-color="#fbfcff"/>
    </linearGradient>
    <linearGradient id="quartz-point-lower-right" x1="920" y1="100" x2="500" y2="200" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ffffff"/><stop offset=".64" stop-color="#e1e5ef"/><stop offset="1" stop-color="#fafbff"/>
    </linearGradient>
    <linearGradient id="quartz-point-upper-reflection" x1="0" y1="0" x2="0" y2="200" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ffffff" stop-opacity=".9"/><stop offset=".5" stop-color="#ffffff" stop-opacity=".12"/><stop offset="1" stop-color="#ffffff" stop-opacity=".25"/>
    </linearGradient>`, `
  <g id="quartz-point-silhouette" clip-path="url(#quartz-point-diamond)">
    <g id="quartz-point-base" data-layer="base">
      <path id="quartz-point-solid-white" fill="#f5f7fc" d="${TRILL_DIAMOND}"/>
    </g>
    <g id="quartz-point-facets" data-layer="facets">
      <path id="quartz-point-upper-left" fill="#ffffff" d="M0 100 500 0 160 104Z"/>
      <path id="quartz-point-upper-right" fill="#fbfcff" d="M500 0 1000 100 845 104Z"/>
      <path id="quartz-point-cut-left-face" fill="url(#quartz-point-cut-left)" d="M160 104 500 0 282 120Z"/>
      <path id="quartz-point-cut-right-face" fill="url(#quartz-point-cut-right)" d="M500 0 845 104 714 120Z"/>
      <path id="quartz-point-center-left-face" fill="url(#quartz-point-center-left)" d="M500 0 282 120 500 200Z"/>
      <path id="quartz-point-center-right-face" fill="url(#quartz-point-center-right)" d="M500 0 714 120 500 200Z"/>
      <path id="quartz-point-lower-left-face" fill="url(#quartz-point-lower-left)" d="M0 100 160 104 282 120 500 200Z"/>
      <path id="quartz-point-lower-right-face" fill="url(#quartz-point-lower-right)" d="M1000 100 845 104 714 120 500 200Z"/>
    </g>
    <g id="quartz-point-reflections" data-layer="reflections">
      <path id="quartz-point-edge-reflection" d="${TRILL_DIAMOND}" fill="none" stroke="url(#quartz-point-upper-reflection)" stroke-width="5"/>
      <path id="quartz-point-center-reflection" d="M500 0V200" fill="none" stroke="#ffffff" stroke-opacity=".78" stroke-width="3"/>
      <path id="quartz-point-cut-reflection" d="M0 100 282 120 500 200 714 120 1000 100" fill="none" stroke="#ffffff" stroke-opacity=".28" stroke-width="1.8"/>
    </g>
  </g>`);
}

export function buildTrillQuartzAssets() {
  const assets = { 'point-trill': trillPointSvg() };
  for (const [state,names] of Object.entries(TRILL_QUARTZ_STATES)) {
    assets[names.body] = trillBodySvg(state);
    assets[names.terminal] = trillTerminalSvg(state);
  }
  return assets;
}

/** Preview geometry only; length measures the separation of the two diamond centers. */
export function trillAssemblyLayout(width, length) {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(length) || length < 0) {
    throw new RangeError('너비는 양수, 바디 길이는 0 이상의 유한한 수여야 합니다.');
  }
  const capHeight = width / 5;
  return { width, capHeight, bodyTop: capHeight / 2, bodyHeight: length, pointTop: length, height: length + capHeight };
}

export function trillAssemblySvg(width = 300, length = 300, state = 'idle') {
  const p = trillAssemblyLayout(width, length);
  const nested = (svg, y = 0) => svg.replace('width="1000" height="200"', `x="0" y="${y}" width="${width}" height="${p.capHeight}"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${p.height}" viewBox="0 0 ${width} ${p.height}" data-role="assembly">
  <title>Trill · 포인트·바디·끝 터미널 조립</title>
  <defs><pattern id="quartz-body-tile" x="0" y="${p.bodyTop}" width="${width}" height="${p.capHeight}" patternUnits="userSpaceOnUse">${nested(trillBodySvg(state))}</pattern></defs>
  <rect x="0" y="${p.bodyTop}" width="${width}" height="${p.bodyHeight}" fill="url(#quartz-body-tile)"/>
  ${nested(trillTerminalSvg(state))}
  ${nested(trillPointSvg(), p.pointTop)}
</svg>\n`;
}
