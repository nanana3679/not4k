// Re-encodes an image buffer as WebP with Chromium's canvas encoder (keeps alpha), so the gallery
// build needs no native image dependency. `page` is any Playwright page; it is only used as a canvas.
export async function encodeWebp(page, buffer, quality) {
  const dataUrl = await page.evaluate(async ({ base64, quality: q }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
    return canvas.toDataURL('image/webp', q);
  }, { base64: buffer.toString('base64'), quality });
  if (!dataUrl.startsWith('data:image/webp')) throw new Error('this Chromium cannot encode WebP');
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
}
