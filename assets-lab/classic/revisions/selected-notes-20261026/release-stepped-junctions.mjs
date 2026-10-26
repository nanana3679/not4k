// Local raster edits at the confirmed side-bar / slanted-rim junctions only.
export function releaseSteppedJunctionArtwork(originalPng, generatedPng, { sourceSize, crop }) {
  const dataUrl = bytes => `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 400 80" data-release-junctions="stepped-side-faces">
<defs>
  <linearGradient id="junction-fade-y" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="22" y2="66"><stop stop-color="black"/><stop offset=".12" stop-color="white"/><stop offset=".88" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>
  ${[82, 273].map((x, i) => `<linearGradient id="junction-fade-x-${i}" gradientUnits="userSpaceOnUse" x1="${x}" x2="${x + 45}"><stop stop-color="black"/><stop offset=".12" stop-color="white"/><stop offset=".88" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>`).join('\n  ')}
  <mask id="junction-mask-y" maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="80"><rect y="22" width="400" height="44" fill="url(#junction-fade-y)"/></mask>
  <mask id="junction-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="80"><g mask="url(#junction-mask-y)">${[82, 273].map((x, i) => `<rect x="${x}" y="22" width="45" height="44" fill="url(#junction-fade-x-${i})"/>`).join('')}</g></mask>
  <filter id="junction-composite" filterUnits="userSpaceOnUse" x="0" y="0" width="400" height="80" color-interpolation-filters="sRGB">
    <feImage href="${dataUrl(originalPng)}" x="0" y="0" width="400" height="80" preserveAspectRatio="none" result="original"/>
    <feComposite in="SourceGraphic" in2="original" operator="atop"/>
  </filter>
</defs>
<g filter="url(#junction-composite)"><g mask="url(#junction-mask)">
  <svg width="400" height="80" viewBox="${crop.join(' ')}" preserveAspectRatio="none"><image width="${sourceSize[0]}" height="${sourceSize[1]}" href="${dataUrl(generatedPng)}"/></svg>
</g></g>
</svg>`;
}
