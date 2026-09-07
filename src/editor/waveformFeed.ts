/**
 * 파형 적용 조율(join) — 렌더러 준비와 오디오 버퍼 도착이라는 두 비동기 완료를
 * 순서에 무관하게 합류시켜, 둘 다 갖춰진 순간 정확히 한 번 apply를 호출한다.
 *
 * 배경: 에디터 첫 로딩 시 `renderer.init()`(async)와 `loadAudioUrl()`(async)이 경쟁한다.
 * 오디오가 먼저 resolve하면 렌더러 ref가 아직 null이라 파형 적용이 통째로 스킵되고,
 * 이후 되살릴 경로가 없어 파형이 영구히 그려지지 않았다. 두 완료의 join을 ref 스냅샷
 * 가드가 아니라 이 반응형 primitive로 표현해 순서와 무관하게 정확히 적용되도록 한다.
 */

export interface WaveformFeed {
  /** 렌더러(PIXI init)가 준비됐음을 알린다. 멱등 — 중복 호출은 무시된다. */
  rendererReady(): void;
  /** 오디오 버퍼가 도착했음을 알린다(최초 로드 또는 재-import). */
  audioArrived(buffer: AudioBuffer): void;
}

/**
 * @param apply - 렌더러와 버퍼가 모두 준비된 순간 호출되는 콜백. 재-import 시 새 버퍼로 재호출된다.
 */
export function createWaveformFeed(
  apply: (buffer: AudioBuffer) => void
): WaveformFeed {
  let ready = false;
  // 렌더러 준비 전에 먼저 도착한, 아직 적용되지 않은 버퍼.
  let pending: AudioBuffer | null = null;

  return {
    rendererReady() {
      if (ready) return; // 멱등: 이미 준비됨
      ready = true;
      if (pending !== null) {
        const buffer = pending;
        pending = null;
        apply(buffer);
      }
    },
    audioArrived(buffer: AudioBuffer) {
      if (ready) {
        apply(buffer); // 렌더러가 이미 준비됨 → 즉시 적용(재-import 포함)
      } else {
        pending = buffer; // 준비 전이면 보류(마지막 버퍼가 이김)
      }
    },
  };
}
