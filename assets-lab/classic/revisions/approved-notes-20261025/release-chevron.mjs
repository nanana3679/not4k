// Compact 45-degree chevrons: one cue for a single note, two cues for a double.
// Visual reference: https://lucide.dev/icons/chevrons-up (geometry drawn for this asset).
export function releaseChevron(source, { strokeWidth, kind }) {
  const foreground = kind === 'single' ? '#effbff' : '#fff8df';
  const outline = kind === 'single' ? '#073b59' : '#624307';
  const path = 'M-8 16L0 8L8 16M-8 24L0 16L8 24';
  const centers = kind === 'single' ? [100] : [84, 116];
  const symbol = centers.map(center => `<g data-release-symbol="stacked-up-chevrons" transform="translate(${center} 0)" fill="none" stroke-linecap="square" stroke-linejoin="miter"><path d="${path}" stroke="${outline}" stroke-width="${strokeWidth + 2}"/><path d="${path}" stroke="${foreground}" stroke-width="${strokeWidth}"/></g>`).join('');
  return source.replace('</svg>', `${symbol}</svg>`);
}
