// Runs in the preview browser. The flattened master has no original light layer.
// Estimate its unlit paint from the adjacent side panel, then solve a source-over
// layer that reconstructs the original pixels. Opacity never changes its geometry.
export async function splitReleaseHighlight(dataUrl) {
  const image = new Image(); image.src = dataUrl; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
  const original = context.getImageData(0, 0, image.width, image.height);
  const base = context.createImageData(image.width, image.height);
  const light = context.createImageData(image.width, image.height);
  context.clearRect(0, 0, image.width, image.height);
  context.save(); context.scale(image.width / 400, image.height / 80);
  context.fillStyle = 'white';
  context.fill(new Path2D('M23 17H95L108 43H31ZM305 17H377L369 43H292Z'));
  context.restore();
  const region = context.getImageData(0, 0, image.width, image.height).data;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const i = (y * image.width + x) * 4;
    const color = [...original.data.slice(i, i + 3)];
    const white = Math.min(...color) / 255 * region[i + 3] / 255;
    const logicalX = x * 400 / image.width;
    const sampleX = Math.round((logicalX < 200 ? Math.max(40, Math.min(83, logicalX)) : Math.max(317, Math.min(360, logicalX))) * image.width / 400);
    const sampleY = Math.round(39 * image.height / 80);
    const sample = (sampleY * image.width + sampleX) * 4;
    const paint = color.map((channel, c) => Math.round(channel * (1 - white) + original.data[sample + c] * white));
    let alpha = 0;
    for (let c = 0; c < 3; c++) {
      const delta = color[c] - paint[c];
      alpha = Math.max(alpha, delta > 0 ? delta / (255 - paint[c]) : delta < 0 ? -delta / paint[c] : 0);
    }
    // Round upward so the inferred foreground remains within the RGB gamut.
    const a = Math.ceil(alpha * 255); alpha = a / 255;
    for (let c = 0; c < 3; c++) {
      base.data[i + c] = paint[c];
      light.data[i + c] = alpha ? Math.round((color[c] - paint[c] * (1 - alpha)) / alpha) : 0;
    }
    base.data[i + 3] = 255;
    light.data[i + 3] = a;
  }
  context.putImageData(base, 0, 0); const baseUrl = canvas.toDataURL('image/png');
  context.putImageData(light, 0, 0); const lightUrl = canvas.toDataURL('image/png');
  return { baseUrl, lightUrl, width: image.width, height: image.height };
}

export function releaseWideMaterialArtwork(originalPng, generatedPng, layers, { sourceSize, crop, darkColor, whiteOpacity }) {
  const dataUrl = bytes => `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
  const originalUrl = dataUrl(originalPng);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 200 40" data-release-material="wide-face-white-alpha">
<defs>
<clipPath id="wide-material-channel"><path transform="scale(.5)" d="M88 0L114 79H286L312 0H303L275 58H125L97 0Z"/></clipPath>
<clipPath id="wide-material-face"><path transform="scale(.5)" d="M92 2H308L279 65H121Z"/></clipPath>
<clipPath id="wide-material-upper"><path transform="scale(.5)" d="M12 1H88L98 22H24ZM312 1H388L376 22H302Z"/></clipPath>
<clipPath id="wide-material-stripe"><path transform="scale(.5)" d="M24 22H99L108 43H31ZM301 22H376L369 43H292Z"/></clipPath>
<radialGradient id="wide-material-keep-center"><stop offset="0" stop-color="black"/><stop offset=".45" stop-color="black"/><stop offset="1" stop-color="white"/></radialGradient>
<mask id="wide-material-center" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="40"><rect width="200" height="40" fill="white"/><ellipse cx="100" cy="33.5" rx="12" ry="5" fill="url(#wide-material-keep-center)"/></mask>
<filter id="wide-material-dark" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values=".2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 0 0 0 1 0"/><feComponentTransfer>${['R', 'G', 'B'].map((channel, index) => `<feFunc${channel} type="linear" slope="${darkColor[index] / 255 * .5}" intercept="${darkColor[index] / 255 * .75}"/>`).join('')}</feComponentTransfer></filter>
<filter id="wide-material-alpha" filterUnits="userSpaceOnUse" x="0" y="0" width="200" height="40" color-interpolation-filters="sRGB"><feImage href="${originalUrl}" x="0" y="0" width="200" height="40" preserveAspectRatio="none" result="original"/><feComposite in="SourceGraphic" in2="original" operator="atop"/></filter>
</defs>
<g filter="url(#wide-material-alpha)">
<image width="200" height="40" href="${originalUrl}"/>
<g clip-path="url(#wide-material-upper)"><svg width="200" height="40" viewBox="${crop.join(' ')}" preserveAspectRatio="none"><image width="${sourceSize[0]}" height="${sourceSize[1]}" href="${dataUrl(generatedPng)}"/></svg></g>
<g clip-path="url(#wide-material-stripe)"><image width="200" height="40" href="${layers.baseUrl}"/><image data-release-white-light="5" width="200" height="40" href="${layers.lightUrl}" opacity="${whiteOpacity}"/></g>
<g mask="url(#wide-material-center)">
<g clip-path="url(#wide-material-channel)"><svg width="200" height="40" viewBox="${crop.join(' ')}" preserveAspectRatio="none"><image width="${sourceSize[0]}" height="${sourceSize[1]}" href="${dataUrl(generatedPng)}"/></svg></g>
<g clip-path="url(#wide-material-face)"><image width="200" height="40" href="${originalUrl}" filter="url(#wide-material-dark)"/></g>
</g>
</g></svg>`;
}
