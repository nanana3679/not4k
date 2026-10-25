// A shared release cue for single and double notes. Its two chevrons do not count units.
export function releaseChevron(source, { strokeWidth, kind }) {
  const foreground = kind === 'single' ? '#effbff' : '#fff8df';
  const outline = kind === 'single' ? '#073b59' : '#624307';
  const path = 'M86 14L100 7L114 14M86 26L100 19L114 26';
  const symbol = `<g data-release-symbol="stacked-up-chevrons" fill="none" stroke-linecap="square" stroke-linejoin="miter"><path d="${path}" stroke="${outline}" stroke-width="${strokeWidth + 2}"/><path d="${path}" stroke="${foreground}" stroke-width="${strokeWidth}"/></g>`;
  return source.replace('</svg>', `${symbol}</svg>`);
}
