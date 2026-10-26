// Remove the obsolete fourth edge; three surface boundaries meet at the vertex.
export function releaseCleanJunctionArtwork(originalPng, generatedCrop) {
  const dataUrl = bytes => `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 400 80" data-release-junctions="three-surface-vertex">
<defs>
  <filter id="clean-feather" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation=".65"/></filter>
  <mask id="clean-mask" maskUnits="userSpaceOnUse" x="82" y="26" width="27" height="24"><path d="M85 29H96L105 46.5L94 46.5Z" fill="white" filter="url(#clean-feather)"/></mask>
  <g id="clean-patch" mask="url(#clean-mask)"><image x="80" y="20" width="50" height="50" href="${dataUrl(generatedCrop)}"/></g>
  <filter id="clean-composite" filterUnits="userSpaceOnUse" x="0" y="0" width="400" height="80" color-interpolation-filters="sRGB">
    <feImage href="${dataUrl(originalPng)}" x="0" y="0" width="400" height="80" preserveAspectRatio="none" result="original"/>
    <feComposite in="SourceGraphic" in2="original" operator="atop"/>
  </filter>
</defs>
<g filter="url(#clean-composite)"><use href="#clean-patch"/><use href="#clean-patch" transform="translate(400 0) scale(-1 1)"/></g>
</svg>`;
}
