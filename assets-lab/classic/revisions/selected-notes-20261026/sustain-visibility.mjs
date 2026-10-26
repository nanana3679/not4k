// Preserve the D knot's paths and beam centers; fit its outlined silhouette to the channel.
export function outlinedSustain(source, { markerWidth, outlineWidth = 2.4, outlineColor }) {
  // Masters use a 1000×200 viewBox displayed at 200×40. The outer D path spans 76 units.
  const scale = (markerWidth - outlineWidth) * 5 / 76;
  const strokeWidth = outlineWidth * 5 / scale;
  const outerPath = source.match(/<path d="([^"]+)"/)?.[1];
  if (!outerPath) throw new Error('유지 표식 원본의 외곽 경로가 없습니다.');
  const outline = `<path data-layer="visibility-outline" d="${outerPath}" fill="none" stroke="${outlineColor}" stroke-width="${strokeWidth.toFixed(6)}" stroke-linejoin="round"/>`;
  return source.replace(/(<g data-unit-index="\d+" transform="translate\(\d+ 100\) )scale\([\d.]+\)"\>/g,
    `$1scale(${scale.toFixed(6)})">${outline}`)
    .replace('<title>', '<title>홈 폭 확대·어두운 윤곽선 시안 · ');
}
