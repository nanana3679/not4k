/** Editable vector reconstruction of the approved seamless terminal (2026-09-15). */
export const TERMINAL = Object.freeze({ width: 1000, height: 200, closureTop: 140, cornerTop: 26 });

export function startTerminalSvg(body, flavor) {
  if (!body.includes('viewBox="0 0 1000 200"')) throw new Error('Terminal requires a 1000×200 body');
  const label = `${flavor === 'double' ? '더블' : '싱글'} 시작 터미널`;
  const bodyDefs = body.match(/<defs>([\s\S]*?)<\/defs>/)?.[1];
  if (!bodyDefs) throw new Error('Body definitions are missing');
  const surface = body.replace(/^<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '')
    .replace(/<title>[\s\S]*?<\/title>/, '').replace(/<defs>[\s\S]*?<\/defs>/, '');
  const dark = flavor === 'double' ? '#30343e' : '#28364d';
  const edge = flavor === 'double' ? '#acaa96' : '#9eafc7';
  const prefix = `terminal-${flavor}-`;
  // The body is reused without scaling, tinting or a line across the open edge.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="200" viewBox="0 0 1000 200" role="img" aria-label="${label}" data-terminal="start" data-open-edge="top">
<title>${label}</title>
<defs>${bodyDefs}
<linearGradient id="finish-rail" gradientUnits="userSpaceOnUse" x1="120" y1="0" x2="880" y2="0">
  <stop stop-color="#637087"/><stop offset=".23" stop-color="#8491a8"/><stop offset=".49" stop-color="#d9e7f6"/><stop offset=".58" stop-color="#b9c9df"/><stop offset=".8" stop-color="#818da1"/><stop offset="1" stop-color="#626d81"/>
</linearGradient>
<linearGradient id="finish-corner" gradientUnits="userSpaceOnUse" x1="0" y1="30" x2="115" y2="152">
  <stop stop-color="#e3eef8"/><stop offset=".42" stop-color="#bdcce0"/><stop offset="1" stop-color="#8294ac"/>
</linearGradient>
<linearGradient id="finish-right" gradientUnits="userSpaceOnUse" x1="879" y1="40" x2="991" y2="139">
  <stop stop-color="#dce9f8"/><stop offset=".48" stop-color="#aabbd2"/><stop offset="1" stop-color="#7c8ca4"/>
</linearGradient>
<linearGradient id="finish-sheen" gradientUnits="userSpaceOnUse" x1="0" y1="140" x2="0" y2="200">
  <stop stop-color="#ecf5ff" stop-opacity=".14"/><stop offset=".18" stop-color="#ecf5ff" stop-opacity="0"/><stop offset="1" stop-color="#172131" stop-opacity=".16"/>
</linearGradient>
</defs>
${surface}
<g data-layer="terminal-finish">
  <g data-layer="finish-base">
    <path d="M115 140H885V200H115Z" fill="#4b586d"/>
    <path d="M0 26H112L126 40V174L120 200H0Z" fill="${dark}"/>
    <path d="M1000 26H888L874 40V174L880 200H1000Z" fill="${dark}"/>
  </g>
  <g data-layer="finish-reflection">
    <path d="M126 142H874L879 197H121Z" fill="url(#finish-rail)"/>
    <path d="M126 142H874L879 197H121Z" fill="url(#finish-sheen)"/>
    <path d="M4 29H111L122 41V151Z" fill="url(#finish-corner)"/>
    <path d="M996 29H889L878 41V151Z" fill="url(#finish-right)"/>
    <path d="M3 28H111L124 41V174L119 198H3Z" fill="none" stroke="${edge}" stroke-width="2"/>
    <path d="M997 28H889L876 41V174L881 198H997Z" fill="none" stroke="${edge}" stroke-width="2"/>
    <path d="M5 30H111M889 30H995" fill="none" stroke="#e2eaf3" stroke-width="1.4"/>
    <path d="M127 142H873" fill="none" stroke="#e1ecf7" stroke-width="2"/>
    <path d="M121 198H879" fill="none" stroke="#95a6be" stroke-width="1.5"/>
  </g>
</g>
</svg>\n`;
  return svg.replace(/id="([^"]+)"/g, (_, id) => `id="${prefix}${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${prefix}${id})`);
}

/** Exact vertical reflection: both geometry and highlights mirror together. */
export function endTerminalSvg(start) {
  if (!start.includes('data-terminal="start"')) throw new Error('Expected a start terminal');
  return start.replace('data-terminal="start"', 'data-terminal="end"')
    .replace('data-open-edge="top"', 'data-open-edge="bottom"')
    .replaceAll('시작 터미널', '끝 터미널')
    .replace('</defs>', '</defs><g data-mirror="vertical" transform="translate(0 200) scale(1 -1)">')
    .replace(/<\/svg>\s*$/, '</g></svg>\n');
}
