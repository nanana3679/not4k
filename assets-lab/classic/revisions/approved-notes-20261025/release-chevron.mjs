// Independently control width, rise and stacking distance to compare proportions.
// Visual reference: https://lucide.dev/icons/chevrons-up (geometry drawn for this asset).
export function releaseChevron(source, { strokeWidth, kind, pathWidth = 16, chevronRise = 8, chevronOffset = 8,
  centers = kind === 'single' ? [100] : [84, 116], layerAlphas, outlineWidth = 1, outlineOpacity = 1,
  lineCap = 'square', lineJoin = 'miter' }) {
  const foreground = kind === 'single' ? '#effbff' : '#fff8df';
  const outline = kind === 'single' ? '#073b59' : '#624307';
  const halfWidth = pathWidth / 2;
  const count = layerAlphas?.length ?? 2;
  const top = 16 - (chevronRise + chevronOffset * (count - 1)) / 2;
  const paths = Array.from({ length: count }, (_, i) => {
    const y = top + i * chevronOffset;
    return `M${-halfWidth} ${y + chevronRise}L0 ${y}L${halfWidth} ${y + chevronRise}`;
  });
  const paint = path => `<path d="${path}" stroke="${outline}" stroke-width="${strokeWidth + outlineWidth * 2}"${outlineOpacity === 1 ? '' : ` opacity="${outlineOpacity}"`}/><path d="${path}" stroke="${foreground}" stroke-width="${strokeWidth}"/>`;
  // Fade each complete chevron, including its outline, so a dark lower border cannot linger.
  const artwork = layerAlphas ? paths.map((path, i) => `<g data-chevron-layer="${i}" opacity="${layerAlphas[i]}">${paint(path)}</g>`).join('') : paint(paths.join(''));
  const symbol = centers.map(center => `<g data-release-symbol="stacked-up-chevrons" transform="translate(${center} 0)" fill="none" stroke-linecap="${lineCap}" stroke-linejoin="${lineJoin}">${artwork}</g>`).join('');
  return source.replace('</svg>', `${symbol}</svg>`);
}
