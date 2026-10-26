// Export the ImageGen panel at the established note height and align its bottom light accents.
export function releaseSimpleFrameArtwork(png, { sourceSize, crop, beamCenters, detectedBeamCenters }) {
  const dataUrl = `data:image/png;base64,${Buffer.from(png).toString('base64')}`;
  const shifts = beamCenters.map((center, i) => ({ center, offset: center - detectedBeamCenters[i] }));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 200 40" data-release-design="simple-frame">
<defs>
  <svg id="simple-source" width="200" height="40" viewBox="${crop.join(' ')}" preserveAspectRatio="none"><image width="${sourceSize[0]}" height="${sourceSize[1]}" href="${dataUrl}"/></svg>
  <linearGradient id="simple-bottom-fade" x1="0" x2="0" y1="33" y2="40" gradientUnits="userSpaceOnUse"><stop stop-color="black"/><stop offset=".25" stop-color="white"/><stop offset=".85" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>
  <mask id="simple-bottom-mask"><rect y="33" width="200" height="7" fill="url(#simple-bottom-fade)"/></mask>
  ${shifts.map(({ center }, i) => `<linearGradient id="simple-side-fade-${i}" x1="${center - 12}" x2="${center + 12}" gradientUnits="userSpaceOnUse"><stop stop-color="black"/><stop offset=".2" stop-color="white"/><stop offset=".8" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient><mask id="simple-light-mask-${i}" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="40"><rect x="${center - 12}" y="33" width="24" height="7" fill="url(#simple-side-fade-${i})" mask="url(#simple-bottom-mask)"/></mask>`).join('\n  ')}
</defs>
<use href="#simple-source"/>
${shifts.map(({ offset }, i) => `<g mask="url(#simple-light-mask-${i})"><use href="#simple-source" transform="translate(${offset} 0)"/></g>`).join('\n')}
</svg>`;
}
