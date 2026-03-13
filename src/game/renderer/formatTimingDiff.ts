/**
 * 판정 타이밍 차이를 표시 문자열로 변환한다.
 *
 * - 양수(SLOW): "+12.34ms"
 * - 음수(FAST): "-5.67ms"
 * - 정확: "+0.00ms"
 * - miss이거나 deltaMs가 없으면 null (표시하지 않음)
 */
export function formatTimingDiff(
  deltaMs: number | undefined,
  isMiss: boolean,
): string | null {
  if (isMiss || deltaMs == null) return null;
  const sign = deltaMs >= 0 ? "+" : "";
  return `${sign}${deltaMs.toFixed(2)}ms`;
}
