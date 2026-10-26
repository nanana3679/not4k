// Keep the selected sprite outside the three requested material regions.
// Coordinates refer to its 400×80 artwork; the output remains 200×40 logical pixels.
export function releaseMaterialArtwork(originalPng, generatedPng, { sourceSize, crop }) {
  const dataUrl = bytes => `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 400 80" data-release-material="body-cel-345">
<defs>
<clipPath id="release-material-regions">
  <path data-part="3" d="M88 0L114 79H286L312 0H303L275 58H125L97 0Z"/>
  <path data-part="4" d="M12 1H88L101 27H25ZM312 1H388L375 27H299Z"/>
  <path data-part="5" d="M24 22H99L109 44H32ZM301 22H376L368 44H291Z"/>
</clipPath>
<radialGradient id="release-material-keep-center"><stop offset="0" stop-color="black"/><stop offset=".45" stop-color="black"/><stop offset="1" stop-color="white"/></radialGradient>
<mask id="release-material-center" maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="80">
  <rect width="400" height="80" fill="white"/>
  <ellipse cx="200" cy="67" rx="24" ry="10" fill="url(#release-material-keep-center)"/>
</mask>
<filter id="release-material-composite" filterUnits="userSpaceOnUse" x="0" y="0" width="400" height="80" color-interpolation-filters="sRGB">
  <feImage href="${dataUrl(originalPng)}" x="0" y="0" width="400" height="80" preserveAspectRatio="none" result="original"/>
  <feComposite in="SourceGraphic" in2="original" operator="atop"/>
</filter>
</defs>
<g filter="url(#release-material-composite)"><g clip-path="url(#release-material-regions)" mask="url(#release-material-center)">
  <svg width="400" height="80" viewBox="${crop.join(' ')}" preserveAspectRatio="none"><image width="${sourceSize[0]}" height="${sourceSize[1]}" href="${dataUrl(generatedPng)}"/></svg>
</g></g>
</svg>`;
}
