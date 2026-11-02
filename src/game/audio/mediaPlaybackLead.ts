export interface MediaPlaybackBrowser {
  readonly userAgent?: string;
  readonly brands?: readonly { readonly brand: string }[];
}

/**
 * Headless Chromium 145.0.7632.6, 44.1 kHz 실측 평균(명목 배속, 곡 시간 ms).
 * 500ms마다 2kHz burst를 재생하고 master 출력의 AudioWorklet onset 검출 시각에서
 * 실제 burst 곡 위치와 element.currentTime을 비교했다(엔진 시계는 currentTime의 ±3ms 이내).
 * 검출 threshold 0.05·0.3의 결과는 같고 일반 AudioBufferSourceNode는 0.25·0.5·1배속 모두 0ms였다.
 * 양수는 pitch 보존 출력이 currentTime보다 앞선다는 뜻이다. 장치 출력 지연 L₀와 별개다.
 * 배속 변경 뒤 선행량은 약 1～2초에 걸쳐 형성되므로 실행 중에는 시계 slew의 목표로만 쓴다.
 */
const CHROMIUM_LEAD_POINTS = [
  [0.25, 39.7],
  [0.3, 39.5],
  [0.4, 35.2],
  [0.5, 31.4],
  [0.6, 30.1],
  [0.7, 25.6],
  [0.75, 18.5],
  [0.8, 27.4],
  [0.9, 12.5],
  [0.95, 11.6],
  [1, 0],
] as const;

/** 브라우저 정보를 주입하는 순수 계산. 미측정 브라우저·1배속 이상은 보정하지 않는다. */
export function mediaPlaybackLeadMs(nominalRate: number, browser: MediaPlaybackBrowser): number {
  const chromium = browser.brands?.some(({ brand }) => brand === 'Chromium')
    || /\b(?:Chrome|Chromium|HeadlessChrome)\/\d/.test(browser.userAgent ?? '');
  if (!chromium || !Number.isFinite(nominalRate) || nominalRate <= 0 || nominalRate >= 1) return 0;

  // 측정 하한 아래는 가장 가까운 0.25배속 값으로 고정하고 외삽하지 않는다.
  if (nominalRate <= CHROMIUM_LEAD_POINTS[0][0]) return CHROMIUM_LEAD_POINTS[0][1];
  for (let i = 1; i < CHROMIUM_LEAD_POINTS.length; i++) {
    const [upperRate, upperLead] = CHROMIUM_LEAD_POINTS[i];
    if (nominalRate <= upperRate) {
      const [lowerRate, lowerLead] = CHROMIUM_LEAD_POINTS[i - 1];
      const fraction = (nominalRate - lowerRate) / (upperRate - lowerRate);
      return lowerLead + fraction * (upperLead - lowerLead);
    }
  }
  return 0;
}

/** navigator 접근은 이 기본 어댑터에만 둔다. navigator 없는 환경은 미측정으로 취급한다. */
export function getMediaPlaybackLeadMs(nominalRate: number): number {
  const browser = typeof navigator === 'undefined' ? undefined : navigator as Navigator & {
    readonly userAgentData?: { readonly brands: MediaPlaybackBrowser['brands'] };
  };
  return mediaPlaybackLeadMs(nominalRate, {
    userAgent: browser?.userAgent,
    brands: browser?.userAgentData?.brands,
  });
}
