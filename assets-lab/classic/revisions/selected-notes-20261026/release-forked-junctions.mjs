// Edit the lower seam only. The original bright bar above y=32 stays intact.
export function releaseForkedJunctionArtwork(originalPng, generatedPng, { sourceSize, crop, offsetX }) {
  const dataUrl = bytes => `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
  const sides = [{ x: 87, offset: offsetX }, { x: 270, offset: -offsetX }];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 400 80" data-release-junctions="forked-lower-seam">
<defs>
  <svg id="fork-reference" width="400" height="80" viewBox="${crop.join(' ')}" preserveAspectRatio="none"><image width="${sourceSize[0]}" height="${sourceSize[1]}" href="${dataUrl(generatedPng)}"/></svg>
  <linearGradient id="fork-fade-y" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="32" y2="79"><stop stop-color="black"/><stop offset=".08" stop-color="white"/><stop offset=".92" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>
  <mask id="fork-mask-y" maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="80"><rect y="32" width="400" height="47" fill="url(#fork-fade-y)"/></mask>
  ${sides.map(({ x }, i) => `<linearGradient id="fork-fade-x-${i}" gradientUnits="userSpaceOnUse" x1="${x}" x2="${x + 43}"><stop stop-color="black"/><stop offset=".1" stop-color="white"/><stop offset=".9" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient><mask id="fork-mask-${i}" maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="80"><rect x="${x}" y="32" width="43" height="47" fill="url(#fork-fade-x-${i})" mask="url(#fork-mask-y)"/></mask>`).join('\n  ')}
  <filter id="fork-composite" filterUnits="userSpaceOnUse" x="0" y="0" width="400" height="80" color-interpolation-filters="sRGB">
    <feImage href="${dataUrl(originalPng)}" x="0" y="0" width="400" height="80" preserveAspectRatio="none" result="original"/>
    <feComposite in="SourceGraphic" in2="original" operator="atop"/>
  </filter>
</defs>
<g filter="url(#fork-composite)">${sides.map(({ offset }, i) => `<g mask="url(#fork-mask-${i})"><use href="#fork-reference" transform="translate(${offset} 0)"/></g>`).join('')}</g>
</svg>`;
}
