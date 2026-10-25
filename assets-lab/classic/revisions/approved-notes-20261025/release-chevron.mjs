// Independently control width, rise and stacking distance to compare proportions.
// Visual reference: https://lucide.dev/icons/chevrons-up (geometry drawn for this asset).
export function releaseChevron(source, { strokeWidth, kind, pathWidth = 16, chevronRise = 8, chevronOffset = 8 }) {
  const foreground = kind === 'single' ? '#effbff' : '#fff8df';
  const outline = kind === 'single' ? '#073b59' : '#624307';
  const halfWidth = pathWidth / 2;
  const top = 16 - (chevronRise + chevronOffset) / 2;
  const path = [top, top + chevronOffset].map(y => `M${-halfWidth} ${y + chevronRise}L0 ${y}L${halfWidth} ${y + chevronRise}`).join('');
  const centers = kind === 'single' ? [100] : [84, 116];
  const symbol = centers.map(center => `<g data-release-symbol="stacked-up-chevrons" transform="translate(${center} 0)" fill="none" stroke-linecap="square" stroke-linejoin="miter"><path d="${path}" stroke="${outline}" stroke-width="${strokeWidth + 2}"/><path d="${path}" stroke="${foreground}" stroke-width="${strokeWidth}"/></g>`).join('');
  return source.replace('</svg>', `${symbol}</svg>`);
}
