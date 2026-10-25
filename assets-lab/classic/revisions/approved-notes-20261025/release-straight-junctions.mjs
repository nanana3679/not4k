// Keep the original straight rim and horizontal bar; replace only the face inside them.
export const straightJunctionGeometry = {
  single: { scaleX: 1.3, offsetX: -31.9, offsetY: .4, rimX: 83.1, rimSlope: .54 },
  double: { scaleX: 1.12, offsetX: -12.3, offsetY: 1.1, rimX: 82.4, rimSlope: .52 },
};

export function releaseStraightJunctionArtwork(originalPng, generatedCrop, kind) {
  const dataUrl = bytes => `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
  const { scaleX, offsetX, offsetY, rimX, rimSlope } = straightJunctionGeometry[kind];
  const rightAt = y => rimX + rimSlope * y;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 400 80" data-release-junctions="straight-three-surface-vertex">
<defs>
  <clipPath id="straight-protected"><path d="M82 30H${rightAt(30)}L${rightAt(49)} 49H82Z"/></clipPath>
  <filter id="straight-feather" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation=".8"/></filter>
  <mask id="straight-mask" maskUnits="userSpaceOnUse" x="82" y="30" width="30" height="19"><path d="M85 32H${rightAt(32) - 1.5}L${rightAt(48) - 1.5} 48H96L91 45H85Z" fill="white" filter="url(#straight-feather)"/></mask>
  <g id="straight-patch" clip-path="url(#straight-protected)" mask="url(#straight-mask)"><image x="80" y="20" width="50" height="50" transform="matrix(${scaleX} 0 0 1 ${offsetX} ${offsetY})" href="${dataUrl(generatedCrop)}"/></g>
  <filter id="straight-composite" filterUnits="userSpaceOnUse" x="0" y="0" width="400" height="80" color-interpolation-filters="sRGB">
    <feImage href="${dataUrl(originalPng)}" x="0" y="0" width="400" height="80" preserveAspectRatio="none" result="original"/>
    <feComposite in="SourceGraphic" in2="original" operator="atop"/>
  </filter>
</defs>
<g filter="url(#straight-composite)"><use href="#straight-patch"/><use href="#straight-patch" transform="translate(400 0) scale(-1 1)"/></g>
</svg>`;
}
