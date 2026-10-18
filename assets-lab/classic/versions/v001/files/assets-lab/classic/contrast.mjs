
export const MATERIAL_SCALE = .64;
export const GRACE = Object.freeze({ width: 1040, height: 200, outline: 10, fade: 100, alpha: .8, padding: 120 });

/** Dim the metal layers together; the original light layer stays above them. */
export function darkBodySvg(source, flavor = 'single') {
  const label = `${flavor === 'double' ? '더블' : '싱글'} 롱노트 바디 · 어두운 금속`;
  const base = source.search(/<g\b[^>]*data-layer="base"[^>]*>/);
  const emission = source.search(/<g\b[^>]*data-layer="emission"[^>]*>/);
  if (base < 0 || emission <= base || !source.includes('</defs>')) throw new Error('Body must have base/reflection before emission');
  const filter = `<filter id="body-dark-material" filterUnits="userSpaceOnUse" x="0" y="0" width="1000" height="200" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncR type="linear" slope="${MATERIAL_SCALE}"/><feFuncG type="linear" slope="${MATERIAL_SCALE}"/><feFuncB type="linear" slope="${MATERIAL_SCALE}"/><feFuncA type="identity"/></feComponentTransfer></filter>`;
  return (source.slice(0, base).replace('</defs>', `${filter}</defs>`)
    + `<g data-material="dark" filter="url(#body-dark-material)">${source.slice(base, emission)}</g>`
    + source.slice(emission))
    .replace(/<title>[^<]*<\/title>/, `<title>${label}</title>`)
    .replace(/aria-label="[^"]*"/, `aria-label="${label}"`);
}

/** Same 1px black + 1px white outline, and 80%→0% over 10 logical px. */
export function terminalGraceSvg(terminalSource, flavor = 'single') {
  const label = `그레이스 ${flavor === 'double' ? '더블' : '싱글'} 터미널`;
  const { height: h, padding: p, fade: r, alpha } = GRACE;
  const w = Number(terminalSource.match(/viewBox="0 0 (\d+) 200"/)?.[1] ?? GRACE.width);
  const edge = GRACE.outline * 2;
  const stops = `<stop offset="0" stop-color="#fff" stop-opacity="${alpha}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>`;
  let defs = '', halo = '';
  for (const [name, x1, y1, x2, y2, x, y, width, height] of [
    ['top',0,-edge,0,-p,-edge,-p,w+edge*2,r],
    ['bottom',0,h+edge,0,h+p,-edge,h+edge,w+edge*2,r],
    ['left',-edge,0,-p,0,-p,-edge,r,h+edge*2],
    ['right',w+edge,0,w+p,0,w+edge,-edge,r,h+edge*2],
  ]) {
    defs += `<linearGradient id="new-grace-${name}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops}</linearGradient>`;
    halo += `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="url(#new-grace-${name})"/>`;
  }
  for (const [name,cx,cy,x,y] of [
    ['tl',-edge,-edge,-p,-p], ['tr',w+edge,-edge,w+edge,-p],
    ['bl',-edge,h+edge,-p,h+edge], ['br',w+edge,h+edge,w+edge,h+edge],
  ]) {
    defs += `<radialGradient id="new-grace-${name}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${r}">${stops}</radialGradient>`;
    halo += `<rect x="${x}" y="${y}" width="${r}" height="${r}" fill="url(#new-grace-${name})"/>`;
  }
  const ring = (outer, inner, fill) => `<path d="M-${outer} -${outer}H${w+outer}V${h+outer}H-${outer}Z M-${inner} -${inner}V${h+inner}H${w+inner}V-${inner}Z" fill="${fill}" fill-rule="evenodd"/>`;
  const terminal = terminalSource.replace(/^<svg\b[^>]*>\s*/, '').replace(/<\/svg>\s*$/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w+p*2}" height="${h+p*2}" viewBox="0 0 ${w+p*2} ${h+p*2}" role="img" aria-label="${label}" data-content-x="${p}" data-content-y="${p}" data-content-width="${w}" data-content-height="${h}">
<title>${label}</title><defs>${defs}</defs>
<g transform="translate(${p} ${p})"><g data-layer="grace"><g data-fade-distance="${r}" data-max-alpha="${alpha}">${halo}</g>${ring(20,10,'#fff')}${ring(10,0,'#000')}</g>${terminal}</g>
</svg>\n`;
}
