// State treatments for review. These SVG wrappers preserve the approved artwork.
// Gray at 45% follows the existing release failure treatment; it is a visual proposal.
const gray = '<filter id="state-gray" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="linear" slope=".45"/><feFuncG type="linear" slope=".45"/><feFuncB type="linear" slope=".45"/></feComponentTransfer></filter>';

export function stateArtwork(source, { width = 200, height = 40, failedSide, onlySide, heldCenters = [], spill = false, label = '상태 시안' } = {}) {
  // Work directly in output coordinates, including SVGs whose natural size is 200×40.
  const nested = source.replace(/\bwidth="[\d.]+"/, `width="${width}"`).replace(/\bheight="[\d.]+"/, `height="${height}"`);
  const half = width / 2;
  const clip = side => `<clipPath id="state-${side}"><rect x="${side === 'left' ? 0 : half}" width="${half}" height="${height}"/></clipPath>`;
  const use = (side, failed = false) => `<use href="#state-art"${side ? ` clip-path="url(#state-${side})"` : ''}${failed ? ' filter="url(#state-gray)"' : ''}/>`;
  let body = failedSide === 'all' ? use(null, true)
    : failedSide ? use(failedSide, true) + use(failedSide === 'left' ? 'right' : 'left')
    : use();
  // Keep the existing white-core/spill vocabulary, centered on each approved beam.
  body += heldCenters.map(center => `${spill ? `<rect x="${center - width * .16}" width="${width * .32}" height="${height}" fill="url(#state-spill)"/>` : ''}<rect data-held-center="${center}" x="${center - width * .028}" width="${width * .056}" height="${height}" fill="#fcfeff"/>`).join('');
  if (onlySide) body = `<g clip-path="url(#state-${onlySide})">${body}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}"><defs>${gray}${clip('left')}${clip('right')}<linearGradient id="state-spill"><stop stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><g id="state-art">${nested}</g></defs>${body}</svg>\n`;
}

export function rasterArtwork(bytes, width = 200, height = 40) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image width="${width}" height="${height}" href="data:image/png;base64,${bytes.toString('base64')}"/></svg>`;
}

export function halfMask(side, width = 200, height = 40) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect x="${side === 'left' ? 0 : width / 2}" width="${width / 2}" height="${height}" fill="#fff"/></svg>\n`;
}
