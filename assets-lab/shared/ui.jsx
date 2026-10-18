/**
 * 공통 SVG 필터 (코어 글로우)
 */
export function SharedDefs({ glowIntensity = 3 }) {
  return (
    <defs>
      <filter id="coreGlow" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur in="SourceGraphic" stdDeviation={glowIntensity} />
      </filter>
    </defs>
  );
}
