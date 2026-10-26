// The generated reference supplies only the lower central rim; preserve the rest
// of the selected palette artwork, including its original chevrons and alpha.
export function releaseBeamEndsArtwork(originalPng, generatedPng, { sourceSize, crop }) {
  const dataUrl = bytes => `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 400 80" data-release-beam-ends="84 116">
<defs>
  <linearGradient id="beam-end-horizontal" gradientUnits="userSpaceOnUse" x1="130" x2="270"><stop stop-color="black"/><stop offset=".1" stop-color="white"/><stop offset=".9" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>
  <linearGradient id="beam-end-vertical" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="52" y2="77"><stop stop-color="black"/><stop offset=".2" stop-color="white"/><stop offset=".84" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>
  <mask id="beam-end-y" maskUnits="userSpaceOnUse" x="130" y="52" width="140" height="25"><rect x="130" y="52" width="140" height="25" fill="url(#beam-end-vertical)"/></mask>
  <mask id="beam-end-patch" maskUnits="userSpaceOnUse" x="130" y="52" width="140" height="25"><rect x="130" y="52" width="140" height="25" fill="url(#beam-end-horizontal)" mask="url(#beam-end-y)"/></mask>
  <filter id="beam-end-composite" filterUnits="userSpaceOnUse" x="0" y="0" width="400" height="80" color-interpolation-filters="sRGB">
    <feImage href="${dataUrl(originalPng)}" x="0" y="0" width="400" height="80" preserveAspectRatio="none" result="original"/>
    <feComposite in="SourceGraphic" in2="original" operator="atop"/>
  </filter>
</defs>
<g filter="url(#beam-end-composite)"><g mask="url(#beam-end-patch)">
  <svg width="400" height="80" viewBox="${crop.join(' ')}" preserveAspectRatio="none"><image width="${sourceSize[0]}" height="${sourceSize[1]}" href="${dataUrl(generatedPng)}"/></svg>
</g></g>
</svg>`;
}
