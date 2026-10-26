// Keep the approved outline, luminous rim and beam ends; replace only the painted faces.
export function releaseCelBalanceArtwork(originalPng, generatedPng, { sourceSize, crop }) {
  const dataUrl = bytes => `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 200 40" data-release-design="cel-balance">
<defs>
  <clipPath id="cel-faces"><path d="M1 1H44L57 38.5H1Z M156 1H199V38.5H143Z M47 1H153L139 31H61Z"/></clipPath>
  <filter id="cel-composite" filterUnits="userSpaceOnUse" x="0" y="0" width="200" height="40" color-interpolation-filters="sRGB">
    <feImage href="${dataUrl(originalPng)}" width="200" height="40" preserveAspectRatio="none" result="original"/>
    <feComposite in="SourceGraphic" in2="original" operator="atop"/>
  </filter>
</defs>
<g filter="url(#cel-composite)"><g clip-path="url(#cel-faces)"><svg width="200" height="40" viewBox="${crop.join(' ')}" preserveAspectRatio="none"><image width="${sourceSize[0]}" height="${sourceSize[1]}" href="${dataUrl(generatedPng)}"/></svg></g></g>
</svg>`;
}
