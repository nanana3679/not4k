/** Concept 4 reflowed into 100:20 with 45° facets and continuous outer rails. */
export const TERMINAL = Object.freeze({ width: 1000, height: 200, closureTop: 194 });

function rectSection(rect, y, height) {
  return rect.replace(/\by="[^"]*"/, `y="${y}"`).replace(/\bheight="[^"]*"/, `height="${height}"`);
}

/** Shorten the straight run so both the strip and its reflections turn at 45°. */
function bendStrip(rect, right, bottom, distance) {
  const hinge = bottom - distance;
  const slope = right ? -1 : 1;
  return `${rectSection(rect, 0, hinge)}<g transform="matrix(1 0 ${slope} 1 ${-slope * hinge} 0)">${rectSection(rect, hinge, bottom - hinge)}</g>`;
}

function shapeBodyRect(rect, double) {
  const x = Number(rect.match(/\bx="([^"]+)"/)?.[1] ?? 0);
  const width = Number(rect.match(/\bwidth="([^"]+)"/)?.[1] ?? 0);
  if (width === 1000) return rect;
  const center = x + width / 2;
  const fromEdge = Math.min(center, 1000 - center);
  const right = center > 500;
  if (fromEdge < 47) return `<g data-rail="continuous">${rectSection(rect, 0, TERMINAL.closureTop)}</g>`;
  if (fromEdge < 150) return bendStrip(rect, right, 192, 150);
  if (fromEdge < 226) return bendStrip(rect, right, 178, 150);
  const coreEdge = double ? 410 : 432;
  const clip = fromEdge >= coreEdge ? 'finish-core' : `finish-field-${right ? 'right' : 'left'}`;
  return `<g clip-path="url(#${clip})">${rect}</g>`;
}

export function startTerminalSvg(body, flavor) {
  if (!body.includes('viewBox="0 0 1000 200"')) throw new Error('Terminal requires a 1000×200 body');
  const double = flavor === 'double';
  const label = `${double ? '더블' : '싱글'} 시작 터미널`;
  const bodyDefs = body.match(/<defs>([\s\S]*?)<\/defs>/)?.[1];
  if (!bodyDefs) throw new Error('Body definitions are missing');
  const left = double ? 410 : 432;
  const right = 1000 - left;
  // Every diagonal has equal horizontal and vertical travel. The double core
  // is wider, so its corners begin earlier instead of flattening its angle.
  const halfCore = 500 - left;
  const coreCorner = 158 - halfCore;
  const chevronTop = 169 - halfCore;
  const chevronBottom = 188 - halfCore;
  const chevron = `M${left} ${chevronTop}L500 169L${right} ${chevronTop}V${chevronBottom}L500 188L${left} ${chevronBottom}Z`;
  const core = `M${left} 0H${right}V${coreCorner}L500 158L${left} ${coreCorner}Z ${chevron}`;
  const fieldInnerCorner = 178 - (left - 376);
  const haloTop = chevronTop - 27;
  const accent = double ? '#ffda53' : '#54ccff';
  const light = double ? '#fff2a1' : '#9aefff';
  const floor = double ? '#17191d' : '#0d1a2c';
  const prefix = `terminal-${flavor}-`;
  let surface = body.replace(/^<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '')
    .replace(/<title>[\s\S]*?<\/title>/, '').replace(/<defs>[\s\S]*?<\/defs>/, '')
    .replace(/<rect\b[^>]*\/>/g, rect => shapeBodyRect(rect, double));
  const finish = `<g data-layer="terminal-finish">
  <g data-layer="finish-base"><path d="M0 194H1000V200H0Z" fill="${floor}"/></g>
  <g data-layer="finish-reflection"><path d="M0 194.5H1000" stroke="#8395ad" stroke-opacity=".2"/><path d="M0 199.5H1000" stroke="#070f1b"/></g>
</g>`;
  surface = surface.replace(/(<g\b[^>]*data-layer="emission"[^>]*>)/, finish + '$1');
  // Extra colored light stays in the source's light-state group. Its halo is kept
  // away from the open edge, so the complete body scanline remains unchanged.
  surface = surface.replace('<g data-light="spill">', `<g data-light="spill">
  <g clip-path="url(#finish-halo-area)"><path d="${chevron}" fill="${accent}" opacity=".38" filter="url(#finish-halo)"/></g>
  <path data-detail="closing-light" d="M0 196H1000" fill="none" stroke="${accent}" stroke-width="2"/>
  <path d="M0 195.7H1000" fill="none" stroke="${light}" stroke-width=".5" opacity=".8"/>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="200" viewBox="0 0 1000 200" role="img" aria-label="${label}" data-terminal="start" data-open-edge="top" data-concept="04" data-diagonal-angle="45">
<title>${label}</title>
<defs>${bodyDefs}
<clipPath id="finish-core" clipPathUnits="userSpaceOnUse"><path d="${core}"/></clipPath>
<clipPath id="finish-field-left" clipPathUnits="userSpaceOnUse"><path d="M226 0H${left}V${fieldInnerCorner}L376 178L226 28Z"/></clipPath>
<clipPath id="finish-field-right" clipPathUnits="userSpaceOnUse"><path d="M774 0H${right}V${fieldInnerCorner}L624 178L774 28Z"/></clipPath>
<clipPath id="finish-halo-area" clipPathUnits="userSpaceOnUse"><path d="M320 ${haloTop}H680V194H320Z"/></clipPath>
<filter id="finish-halo" filterUnits="userSpaceOnUse" x="300" y="${haloTop - 9}" width="400" height="${209 - haloTop}"><feGaussianBlur stdDeviation="9"/></filter>
</defs>
${surface}
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
