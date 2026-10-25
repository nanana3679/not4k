// Sample the reference palette, not its geometry. All processing uses sRGB.
// Each table entry keeps the input's weighted RGB intensity, so existing edges
// and highlight positions survive the color change. This is not CIE luminance.
export async function sampleArtworkPalette(dataUrl) {
  const image = new Image(); image.src = dataUrl; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const weights = [.2126, .7152, .0722];
  const bins = Array.from({ length: 256 }, () => ({ count: 0, rgb: [0, 0, 0] }));
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 250) continue;
    const rgb = [data[i], data[i + 1], data[i + 2]].map(value => value / 255);
    const intensity = rgb.reduce((sum, value, channel) => sum + value * weights[channel], 0);
    const bin = bins[Math.round(intensity * 255)];
    bin.count++;
    rgb.forEach((value, channel) => { bin.rgb[channel] += value; });
  }
  if (!bins.some(bin => bin.count)) throw new Error('팔레트 참고 이미지에 불투명 픽셀이 없습니다.');
  return Array.from({ length: 65 }, (_, step) => {
    const intensity = step / 64;
    if (step === 0 || step === 64) return [intensity, intensity, intensity];
    const sums = [0, 0, 0]; let total = 0;
    bins.forEach((bin, index) => {
      const weight = Math.exp(-.5 * ((index / 255 - intensity) / .04) ** 2);
      total += bin.count * weight;
      bin.rgb.forEach((value, channel) => { sums[channel] += value * weight; });
    });
    const rgb = sums.map(value => value / total);
    const sampledIntensity = rgb.reduce((sum, value, channel) => sum + value * weights[channel], 0);
    const chroma = rgb.map(value => value - sampledIntensity);
    // Gamut compression around neutral preserves intensity rather than clipping channels.
    const scale = Math.min(1, ...chroma.map(value => value > 0 ? (1 - intensity) / value : value < 0 ? -intensity / value : 1));
    return chroma.map(value => Number((intensity + value * scale).toFixed(6)));
  });
}

export function paletteMappedArtwork(source, table, { width = 200, height = 40 } = {}) {
  const nested = source.replace(/\bwidth="[\d.]+"/, `width="${width}"`).replace(/\bheight="[\d.]+"/, `height="${height}"`);
  const channels = ['R', 'G', 'B'].map((channel, index) => `<feFunc${channel} type="table" tableValues="${table.map(rgb => rgb[index]).join(' ')}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><filter id="release-palette" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values=".2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 0 0 0 1 0"/><feComponentTransfer>${channels}</feComponentTransfer></filter></defs><g filter="url(#release-palette)">${nested}</g></svg>`;
}
