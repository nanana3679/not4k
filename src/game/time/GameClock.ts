/**
 * GameClock — 한 플레이 세션의 시간 권위.
 *
 * 한 곡을 플레이하는 동안 "지금이 몇 ms인가"라는 질문은 의미에 따라 답이 셋이다.
 * 그 셋을 단일 출처에서 파생시켜, offset 합성 규칙이 호출자마다 흩어지지 않게 한다.
 *
 *  - 판정 시간(judgmentTimeMs): 게임 로직(롱노트 유지·미스·끝점 판정·auto)이 쓰는 순수 클럭.
 *  - 시각 시간(visualTimeMs): 판정 시간에 오디오 출력 지연을 얹어, 스피커에서 소리가 나는 순간
 *    노트가 판정선 위에 오도록 렌더 시각을 미래로 민 것.
 *  - 입력 시간(toInputTimeMs): 판정 시간에서 핸들러 지연을 빼고 입력 오프셋을 얹은 것.
 *    입력 오프셋(judgmentOffsetMs)은 입력 경로에만 적용되며, 판정/시각 시간에는 닿지 않는다.
 *
 * 의존 방향은 game → GameClock 단방향이다. 이 클럭은 게임 상태(노트·점수·일시정지·auto)를
 * 일절 보유하지 않는다. 일시정지·재생배속·인게임 구간 클램프는 audio.currentTimeMs가 이미
 * 반영하므로 여기서 재구현하지 않고 그대로 상속한다.
 *
 * 설계 배경은 `docs/spec/audio-visual-sync.md`(3개 레이턴시 경로)를 따른다.
 */

/** GameClock이 시간 기준으로 삼는 오디오 소스. 실제로는 AudioEngine 하나만 들어가며, 좁은 구조적 타입은 테스트용 fake를 위한 것이다. */
export interface ClockAudioSource {
  /** AudioContext.currentTime 기반 재생 위치(ms). 일시정지·배속·구간 클램프가 이미 반영됨. */
  readonly currentTimeMs: number;
  /** baseLatency + outputLatency(ms). 미지원 환경은 0. */
  getOutputLatencyMs(): number;
}

/** 한 플레이 세션 동안 불변인 캘리브레이션 오프셋. */
export interface ClockOffsets {
  /** 오디오 오프셋 — 음악(노래) 타임라인을 이동. 판정·시각·입력 시간 모두의 기준점. */
  readonly audioOffsetMs: number;
  /** 입력 오프셋 — 입력 타임라인만 이동(입력 장치 지연 + 개인 체감). 입력 시간에만 적용. */
  readonly judgmentOffsetMs: number;
}

export class GameClock {
  constructor(
    private readonly audio: ClockAudioSource,
    private readonly offsets: ClockOffsets,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** 판정 시간 — 게임 로직이 쓰는 순수 클럭(척추). */
  judgmentTimeMs(): number {
    return this.audio.currentTimeMs + this.offsets.audioOffsetMs;
  }

  /** 시각 시간 — 판정 시간 + 오디오 출력 지연. 출력 지연은 변동하므로 매 질의 live 읽기. */
  visualTimeMs(): number {
    return this.judgmentTimeMs() + this.audio.getOutputLatencyMs();
  }

  /**
   * 입력 시간 — 판정 시간에서 핸들러 지연을 빼고 입력 오프셋을 얹은 것.
   *
   * handlerDelay = now() − eventTimeStamp 는 둘 다 performance 클럭이라 뺄셈이 유효하다.
   * 이 짧은 delta만 오디오 "지금"에 적용하므로 두 시계의 누적 드리프트에는 영향받지 않는다.
   * eventTimeStamp가 미래면(now보다 큼) 음수 보정을 막기 위해 0으로 클램프한다.
   */
  toInputTimeMs(eventTimeStamp: number): number {
    const handlerDelay = Math.max(0, this.now() - eventTimeStamp);
    return this.judgmentTimeMs() - handlerDelay + this.offsets.judgmentOffsetMs;
  }
}
