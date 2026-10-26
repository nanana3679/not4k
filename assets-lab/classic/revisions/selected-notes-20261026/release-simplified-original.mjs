// Replace only the two outer wings; the original central face, rim and symbols stay intact.
export function releaseSimplifiedOriginalArtwork(originalPng, generatedPng, { sourceSize, crop }) {
  const dataUrl = bytes => `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 400 80" data-release-design="simplified-original">
<defs>
  <clipPath id="simplified-wings"><path d="M0 0H90L118 80H0Z M310 0H400V80H282Z"/></clipPath>
  <svg id="simplified-wing" width="118" height="80" viewBox="${crop.join(' ')}" preserveAspectRatio="none"><image width="${sourceSize[0]}" height="${sourceSize[1]}" href="${dataUrl(generatedPng)}"/></svg>
  <filter id="simplified-composite" filterUnits="userSpaceOnUse" x="0" y="0" width="400" height="80" color-interpolation-filters="sRGB">
    <feImage href="${dataUrl(originalPng)}" x="0" y="0" width="400" height="80" preserveAspectRatio="none" result="original"/>
    <feComposite in="SourceGraphic" in2="original" operator="atop"/>
  </filter>
</defs>
<g filter="url(#simplified-composite)"><g clip-path="url(#simplified-wings)"><use href="#simplified-wing"/><use href="#simplified-wing" transform="translate(400 0) scale(-1 1)"/></g></g>
</svg>`;
}
