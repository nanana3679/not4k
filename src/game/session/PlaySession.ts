/**
 * PlaySession — 한 곡을 플레이하는 동안의 게임 루프 전체를 소유하는 deep module.
 *
 * PlayScreen.useEffect init()에 인라인돼 있던 판정/점수/오토플레이/입력 라우팅/틱 순서를
 * 한 팩토리로 응집한다. React 컴포넌트에는 관측 가능한 seam(GameClock·GameRenderer·AudioEngine·
 * DebugLogger)만 주입받고, 그 안에서 JudgmentEngine·ScoreManager·AutoPlayer·8단계 적용자·
 * 틱 순서 계약을 단독으로 조율한다. 튜토리얼 프리뷰는 다른 경로(스크립티드 재생)라 이 세션을
 * 쓰지 않는다 — PlaySession은 실제 플레이(Play) 전용이다.
 *
 * 두 순서 계약이 이 모듈의 핵심 불변이다:
 *  - 적용자 8단계 순서 (§10.1): decide → debug 기록 → score 기록 → surface → 텍스트 →
 *    accuracy(기록 "후") → bomb → noteDisplay.
 *  - 틱 순서 (§10.2): press → update(release보다 먼저) → release → renderFrame → 곡 종료 체크.
 */

import { JudgmentEngine, type JudgmentResult } from "../judgment";
import { computeConnectionSources } from "../judgment/longNoteConnection";
import { decideJudgmentEffects, type NoteDisplayEffect } from "../judgment/judgmentEffects";
import { ScoreManager, type ScoreState } from "../scoring";
import { AutoPlayer, type AutoSectionMs } from "../input";
import type { DebugLogger } from "../debug/DebugLogger";
import type { NoteEntity, ChartEvent, ChartTiming } from "../../shared";
import type { JudgmentGrade, JudgmentWindows, Lane } from "../../shared/constants";

/** 세션이 시간을 읽는 시계(GameClock). 판정/시각/입력 시간의 단일 출처. */
export interface PlaySessionClock {
  judgmentTimeMs(): number;
  visualTimeMs(): number;
  toInputTimeMs(eventTimeStamp: number): number;
}

/** 세션이 화면에 일으키는 효과(GameRenderer). 판정 sink 10종. */
export interface PlaySessionEffects {
  recordPerspectiveSurfaceJudgment(grade: JudgmentGrade): void;
  showJudgment(grade: JudgmentGrade, deltaMs: number): void;
  updateAccuracy(achievementRate: number): void;
  showBombEffect(lane: Lane): void;
  applyNoteDisplayEffect(noteIndex: number, effect: NoteDisplayEffect): void;
  updateCombo(combo: number): void;
  setKeyBeam(lane: Lane, on: boolean): void;
  setKeyState(keyCode: string, on: boolean): void;
  setHeadlessHeldFillQuery(
    query: (noteIndex: number, timeMs: number) => { filled: number; required: number } | null,
  ): void;
  // 시각 시간(판정 시간 + 오디오 출력 지연)으로 그린다 — 판정에 쓰는 songTimeMs와 다르다.
  renderFrame(visualTimeMs: number, frameDeltaMs: number): void;
}

/** 세션이 곡 종료를 감지하기 위해 읽는 오디오 상태(AudioEngine). */
export interface PlaySessionAudioStatus {
  readonly currentTimeMs: number;
  readonly duration: number;
}

export interface PlaySessionOptions {
  notes: readonly NoteEntity[];
  events: readonly ChartEvent[];
  timing: ChartTiming;
  windows: JudgmentWindows;
  startTimeMs: number;
  clock: PlaySessionClock;
  effects: PlaySessionEffects;
  audio: PlaySessionAudioStatus;
  debug?: { logger: DebugLogger; judgmentLineY: number; scrollSpeed: number };
}

/** 완주 시 결과 화면으로 넘길 스코어 스냅샷. */
export interface PlaySessionResult {
  achievementRate: number;
  rank: ScoreState["rank"];
  maxCombo: number;
  isFullCombo: boolean;
  judgmentCounts: ScoreState["judgmentCounts"];
  goodTrillCount: number;
  fastCount: number;
  slowCount: number;
}

export interface PlaySession {
  /** rAF 콜백마다 1회 호출. press → update → release → renderFrame → 곡 종료 체크. */
  tick(frameTimestampMs: number): "running" | "ended";
  onLanePress(lane: Lane, eventTimeStampMs: number, keyCode: string): void;
  onLaneRelease(lane: Lane, eventTimeStampMs: number, keyCode: string): void;
  result(): PlaySessionResult;
}

export function createPlaySession(options: PlaySessionOptions): PlaySession {
  const { notes, events, timing, windows, startTimeMs, clock, effects, audio, debug } = options;
  const { noteTimesMs, noteEndTimesMs, trillZoneStartTimesMs } = timing;
  const { totalJudgments, skippedJudgments } = timing.judgmentCounts(startTimeMs);

  // Create score manager (subtract skipped notes for editor test play)
  const scoreManager = new ScoreManager((totalJudgments - skippedJudgments) || 1);

  // 롱노트 connection 관계는 맵 로드 시 1회 계산해 주입한다 (렌더러 held 전파와 같은 소유자).
  const connectionSources = computeConnectionSources(notes, noteTimesMs, noteEndTimesMs);
  const judgmentEngine = new JudgmentEngine(
    notes,
    noteTimesMs,
    noteEndTimesMs,
    {
      onJudgment: (result: JudgmentResult) => {
        // 결정은 전부 순수 함수(판정 효과)가 소유 — 이 적용자는 effects만 해석한다.
        const effectsData = decideJudgmentEffects(result, notes[result.noteIndex]);

        // 디버그 기록 — 화면 좌표 계산은 표시 시점의 관심사라 적용자 몫.
        // 바디(끝점) 판정은 끝점(endBeat) 위치로, 헤드/포인트는 시작점 위치로 Y를 잰다.
        if (debug && effectsData.debug) {
          const posTimeMs = effectsData.debug.isBody
            ? noteEndTimesMs.get(effectsData.noteIndex)
            : noteTimesMs.get(effectsData.noteIndex);
          if (posTimeMs !== undefined) {
            const songTimeMs = clock.judgmentTimeMs();
            const noteCenterY = debug.judgmentLineY - ((posTimeMs - songTimeMs) * debug.scrollSpeed) / 1000;
            debug.logger.recordJudgment(effectsData.noteIndex, noteCenterY, effectsData.debug.grade, effectsData.debug.deltaMs, effectsData.debug.doubleSubIndex, effectsData.debug.isBody);
          }
        }

        scoreManager.recordJudgment(effectsData.scoreRecord.grade, effectsData.scoreRecord.deltaMs);
        effects.recordPerspectiveSurfaceJudgment(effectsData.judgmentText.grade);
        effects.showJudgment(effectsData.judgmentText.grade, effectsData.judgmentText.deltaMs);
        // accuracy는 기록 "후" 상태 재조회 — 적용 순서만 여기서 보장한다
        effects.updateAccuracy(scoreManager.getState().achievementRate);
        if (effectsData.bomb !== null) {
          effects.showBombEffect(effectsData.bomb);
        }
        effects.applyNoteDisplayEffect(effectsData.noteIndex, effectsData.noteDisplay);
      },
      onComboUpdate: (combo: number) => {
        effects.updateCombo(combo);
      },
    },
    windows,
    trillZoneStartTimesMs,
    connectionSources,
  );

  // 헤드없는 롱노트 held 충족 시각 피드백 — 렌더러가 엔진 술어를 그대로 조회 (이슈 #85)
  effects.setHeadlessHeldFillQuery((index, timeMs) => judgmentEngine.headlessHeldFill(index, timeMs));

  // Skip notes before startTimeMs (editor test play)
  if (startTimeMs > 0) {
    judgmentEngine.skipNotesBefore(startTimeMs);
    for (let i = 0; i < notes.length; i++) {
      const timeMs = noteTimesMs.get(i);
      if (timeMs !== undefined && timeMs < startTimeMs) {
        effects.applyNoteDisplayEffect(i, { body: null, visibility: "processed" });
      }
    }
  }

  // Auto-play: AutoEvent ms 범위 파생 (렌더러 autoEvents와 같은 소스·같은 변환의 순수 파생값)
  const autoSectionsMs: AutoSectionMs[] = [];
  for (const evt of events) {
    if (evt.type === "auto") {
      autoSectionsMs.push({
        startMs: timing.beatToMs(evt.beat),
        endMs: timing.beatToMs(evt.endBeat),
      });
    }
  }
  const autoPlayer = new AutoPlayer(notes, noteTimesMs, noteEndTimesMs, autoSectionsMs);

  // 프레임 델타 부기 — lastFrameTime은 세션이 소유하고 tick에서만 진행한다 (일시정지 중엔 안 불림).
  let lastFrameTime: number | null = null;

  return {
    tick(frameTimestampMs: number): "running" | "ended" {
      const songTimeMs = clock.judgmentTimeMs();
      const visualTimeMs = clock.visualTimeMs();

      // Record frame timing for debug logger
      const frameDeltaMs = lastFrameTime !== null ? frameTimestampMs - lastFrameTime : 16;
      if (debug && lastFrameTime !== null) {
        debug.logger.recordFrameTiming(frameDeltaMs);
      }
      lastFrameTime = frameTimestampMs;

      // Auto-play: AutoEvent의 합성 press 주입 (구간 게이팅은 AutoPlayer 내부)
      for (const p of autoPlayer.pressesAt(songTimeMs)) {
        judgmentEngine.onLanePress(p.lane, p.timeMs, p.key);
        effects.setKeyBeam(p.lane, true);
      }

      // 판정 엔진 업데이트를 release보다 먼저 호출해서 바디 노트를 auto-활성화한다.
      // (그러지 않으면 길이 0인 롱노트의 경우 press → release가 한 프레임에 일어나는데
      //  release 시점에 바디 상태가 아직 UNPROCESSED라 tryEndpointJudgmentOnRelease가 놓침)
      judgmentEngine.update(songTimeMs);

      // Auto-play: 합성 release 주입 (포인트 노트 예약 release + 롱노트 endBeat release,
      // AutoEvent이 끝나도 잡고 있던 홀드는 endBeat에서 놓는다 — 게이팅 비대칭은 AutoPlayer 내부)
      for (const r of autoPlayer.releasesAt(songTimeMs)) {
        judgmentEngine.onLaneRelease(r.lane, r.timeMs, r.key);
        effects.setKeyBeam(r.lane, false);
      }

      // Render frame (오디오 출력 레이턴시만큼 미래 시각으로 렌더링)
      effects.renderFrame(visualTimeMs, frameDeltaMs);

      // Check if song ended
      if (audio.currentTimeMs >= audio.duration && audio.duration > 0) {
        return "ended";
      }

      return "running";
    },

    onLanePress(lane: Lane, eventTimeStampMs: number, keyCode: string): void {
      judgmentEngine.onLanePress(lane, clock.toInputTimeMs(eventTimeStampMs), keyCode);
      effects.setKeyBeam(lane, true);
      effects.setKeyState(keyCode, true);
    },

    onLaneRelease(lane: Lane, eventTimeStampMs: number, keyCode: string): void {
      judgmentEngine.onLaneRelease(lane, clock.toInputTimeMs(eventTimeStampMs), keyCode);
      effects.setKeyBeam(lane, false);
      effects.setKeyState(keyCode, false);
    },

    result(): PlaySessionResult {
      const state = scoreManager.getState();
      return {
        achievementRate: state.achievementRate,
        rank: state.rank,
        maxCombo: judgmentEngine.maxCombo,
        isFullCombo: state.isFullCombo,
        judgmentCounts: state.judgmentCounts,
        goodTrillCount: state.goodTrillCount,
        fastCount: state.fastCount,
        slowCount: state.slowCount,
      };
    },
  };
}
