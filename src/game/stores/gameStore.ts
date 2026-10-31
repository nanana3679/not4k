import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Chart, PlaybackRange } from '../../shared';
import type { JudgmentMode } from '../../shared/constants/judgment';
import { prepareExplicitPlayTest } from './explicitPlayRequest';
import type { ExplicitPlayRequest, ExplicitPlayTestOptions, ObserverPlayRequest } from './explicitPlayRequest';
import type { ExplicitSessionResult } from '../judgment/ExplicitJudgmentSession';

type Screen = 'title' | 'presetSetup' | 'songSelect' | 'loading' | 'play' | 'result' | 'explicitPlay' | 'observer';
type PlayLoadTarget = 'play' | 'observer';

interface KeyBindings {
  lane1: string[];
  lane2: string[];
  lane3: string[];
  lane4: string[];
}

export interface GameSettings {
  keyBindings: KeyBindings;
  scrollSpeed: number;
  liftPercent: number;
  suddenPercent: number;
  visualOffsetMs: number;
  inputOffsetMs: number;
  preset: 'numpad' | 'tkl';
  isFirstLaunch: boolean;
  showFastSlow: boolean;
  showTimingDiff: boolean;
  skinId: string;
  bombScale: number;
  renderHeight: number;
  /** `gearMotion`(기어 위 장식 애니메이션: 광원 띠·게이지 액체 흐름과 기포·발광선·하단 바 빛). 끄면 플레이 렌더러가 `gearMotion` 객체를 만들지 않는다. 없으면 켬. */
  gearMotion: boolean;
  playSpeed: number;
  judgmentMode: JudgmentMode;
  debugMode: boolean;
  masterVolume: number;
}

interface PlayResult {
  songId: string;
  difficulty: string;
  achievementRate: number;
  rank: string;
  /** @deprecated PlayScreen compatibility; result UI does not expose combo statistics. */
  maxCombo?: number;
  isFullCombo: boolean;
  judgmentCounts: Record<string, number>;
  goodTrillCount: number;
  fastCount: number;
  slowCount: number;
  /** 구형 결과에는 없으며 새 결과는 실제 세션의 최종 분모를 사용한다. */
  finalDenominatorWeight?: number;
}

interface GameState {
  screen: Screen;
  /**
   * 설정 모달 표시 여부. 곡 선택 화면 위에 오버레이로 뜨며, Calibration도 이 모달의
   * 서브뷰라 별도 화면 전환이 없다. UI 상태이므로 영속화하지 않는다(새로고침 시 닫힘).
   */
  settingsOpen: boolean;
  /**
   * 설정 모달의 Calibration 서브뷰 활성 여부. 보정 중에는 곡 선택 프리뷰 음원을
   * 페이드아웃해 멈추고(보정음과 겹치지 않게), 보정을 나가면 페이드인으로 재개한다.
   */
  calibrationActive: boolean;
  settings: GameSettings;
  selectedSongId: string | null;
  selectedDifficulty: string | null;
  selectedAudioUrl: string | null;
  selectedPlaybackRange: PlaybackRange | null;
  lastResult: PlayResult | null;
  chartData: Chart | null;
  audioBuffer: AudioBuffer | null;
  explicitPlay: ExplicitPlayRequest | null;
  normalPlay: ExplicitPlayRequest | null;
  observerPlay: ObserverPlayRequest | null;
  /** 같은 LoadingScreen이 검증한 문서·음원을 전달할 목적지. 영속화하지 않는다. */
  playLoadTarget: PlayLoadTarget;
  /** 진입점의 새 요청만 센다. effect의 실행·취소로는 바뀌지 않는다. */
  playLoadRequestId: number;
  /** 실행 중인 로드의 소유권. cleanup 이후 StrictMode 재실행도 새 ID를 받는다. */
  playLoadId: number;
  beginPlayLoad: (target?: PlayLoadTarget) => number;
  claimPlayLoad: () => number;
  completePlayLoad: (loadId: number, request: ExplicitPlayRequest) => boolean;
  cancelPlayLoad: (loadId: number) => void;
  completeNormalPlay: (request: ExplicitPlayRequest, result: ExplicitSessionResult) => void;
  clearNormalPlay: (request: ExplicitPlayRequest) => void;
  clearObserverPlay: (request: ObserverPlayRequest) => void;
  startExplicitPlayTest: (options: ExplicitPlayTestOptions) => void;
  clearExplicitPlayTest: () => void;

  setScreen: (screen: Screen) => void;
  setSettingsOpen: (open: boolean) => void;
  setCalibrationActive: (active: boolean) => void;
  updateSettings: (partial: Partial<GameSettings>) => void;
  updateKeyBindings: (bindings: Partial<KeyBindings>) => void;
  selectSong: (songId: string, difficulty: string, audioUrl: string, playbackRange?: PlaybackRange | null) => void;
  setResult: (result: PlayResult) => void;
  completeFirstLaunch: () => void;
  setChartData: (chart: Chart | null) => void;
  setAudioBuffer: (buffer: AudioBuffer | null) => void;

  // Editor test play
  startTimeMs: number;
  editorReturnUrl: string | null;
  setStartTimeMs: (ms: number) => void;
  setEditorReturnUrl: (url: string | null) => void;
}

const TKL_BINDINGS: KeyBindings = {
  lane1: ['KeyQ', 'KeyW', 'KeyS', 'KeyX'],
  lane2: ['KeyE', 'KeyD', 'KeyC', 'KeyO'],
  lane3: ['KeyP', 'KeyL', 'Comma', 'KeyR'],
  lane4: ['BracketLeft', 'BracketRight', 'Semicolon', 'Period'],
};

const NUMPAD_BINDINGS: KeyBindings = {
  lane1: ['KeyQ', 'KeyW', 'KeyS', 'KeyX'],
  lane2: ['KeyE', 'KeyD', 'KeyC', 'PageDown'],
  lane3: ['Numpad7', 'Numpad4', 'Numpad1', 'KeyR'],
  lane4: ['Numpad8', 'Numpad9', 'Numpad5', 'Numpad2'],
};

const DEFAULT_SETTINGS: GameSettings = {
  keyBindings: TKL_BINDINGS,
  scrollSpeed: 800,
  liftPercent: 0,
  suddenPercent: 0,
  visualOffsetMs: 0,
  inputOffsetMs: 0,
  preset: 'tkl',
  isFirstLaunch: true,
  showFastSlow: true,
  showTimingDiff: false,
  skinId: 'classic',
  bombScale: 1,
  renderHeight: 1080,
  gearMotion: true,
  playSpeed: 1.0,
  judgmentMode: 'normal' as JudgmentMode,
  debugMode: false,
  masterVolume: 1.0,
};

export const TIMING_OFFSET_LIMIT_MS = 1000;

/** 입력·시각 오프셋은 실제 시간 ±1000ms로 제한하고 잘못된 값은 기본 0ms로 둔다. */
export function clampTimingOffsetMs(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(-TIMING_OFFSET_LIMIT_MS, Math.min(TIMING_OFFSET_LIMIT_MS, value))
    : 0;
}

/** @internal 테스트용으로 export. persist merge 콜백. */
export function mergePersistedSettings(
  persisted: unknown,
  current: unknown,
) {
  const p = persisted as { settings?: Partial<GameSettings> };
  const cur = current as GameState;
  const merged: Record<string, unknown> = { ...cur.settings, ...p.settings };
  merged.inputOffsetMs = clampTimingOffsetMs(merged.inputOffsetMs);
  merged.visualOffsetMs = clampTimingOffsetMs(merged.visualOffsetMs);
  // RFD 0031: 미출시 설정은 이전하지 않고 옛 키를 모두 버린다(차트 offsetMs와 별개).
  delete merged.audioOffsetMs;
  delete merged.judgmentOffsetMs;
  delete merged.offsetMs;
  // #231에서 설정 이름을 frameMotion → gearMotion으로 바꿨다(미출시라 값은 옮기지 않는다). 옛 키는 남기지 않는다.
  delete merged.frameMotion;
  return {
    ...cur,
    settings: merged as unknown as GameSettings,
  };
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      screen: 'title',
      settingsOpen: false,
      calibrationActive: false,
      settings: DEFAULT_SETTINGS,
      selectedSongId: null,
      selectedDifficulty: null,
      selectedAudioUrl: null,
      selectedPlaybackRange: null,
      lastResult: null,
      chartData: null,
      audioBuffer: null,
      explicitPlay: null,
      normalPlay: null,
      observerPlay: null,
      playLoadTarget: 'play',
      playLoadRequestId: 0,
      playLoadId: 0,
      beginPlayLoad: (playLoadTarget = 'play') => {
        const playLoadId = get().playLoadId + 1;
        set({ playLoadId, playLoadTarget, playLoadRequestId: get().playLoadRequestId + 1,
          normalPlay: null, observerPlay: null, explicitPlay: null, lastResult: null,
          chartData: null, audioBuffer: null, startTimeMs: 0, editorReturnUrl: null,
          screen: 'loading', settingsOpen: false, calibrationActive: false });
        return playLoadId;
      },
      claimPlayLoad: () => {
        const playLoadId = get().playLoadId + 1;
        set({ playLoadId });
        return playLoadId;
      },
      completePlayLoad: (loadId, request) => {
        if (get().playLoadId !== loadId || get().screen !== 'loading' || request.purpose !== 'play') return false;
        if (get().playLoadTarget === 'observer') {
          const { document, compiled, audioBuffer, playbackRange } = request;
          set({ observerPlay: { document, compiled, audioBuffer, playbackRange }, normalPlay: null,
            lastResult: null, screen: 'observer' });
        } else {
          set({ normalPlay: request, observerPlay: null, lastResult: null, screen: 'play' });
        }
        return true;
      },
      cancelPlayLoad: loadId => {
        if (get().playLoadId !== loadId || get().screen !== 'loading') return;
        set({ playLoadId: loadId + 1, normalPlay: null, observerPlay: null, lastResult: null, chartData: null, audioBuffer: null });
      },
      completeNormalPlay: (request, result) => {
        const state = get();
        if (state.normalPlay !== request || state.screen !== 'play') return;
        const score = result.score;
        set({ normalPlay: null, screen: 'result', lastResult: {
          songId: state.selectedSongId ?? request.document.meta.title,
          difficulty: state.selectedDifficulty ?? request.document.meta.difficultyLabel,
          achievementRate: score.achievementRate, rank: score.rank, isFullCombo: score.isFullCombo,
          judgmentCounts: { ...score.judgmentCounts }, goodTrillCount: score.goodTrillCount,
          fastCount: score.fastCount, slowCount: score.slowCount,
          finalDenominatorWeight: score.finalDenominatorWeight,
        } });
      },
      clearNormalPlay: request => {
        if (get().normalPlay !== request) return;
        set({ normalPlay: null, lastResult: null, screen: 'songSelect' });
      },
      clearObserverPlay: request => {
        if (get().observerPlay !== request) return;
        get().setScreen('songSelect');
      },
      startExplicitPlayTest: (options) => {
        const explicitPlay = prepareExplicitPlayTest(options);
        set({ explicitPlay, normalPlay: null, observerPlay: null, playLoadTarget: 'play', playLoadId: get().playLoadId + 1,
          lastResult: null, screen: 'explicitPlay', settingsOpen: false, calibrationActive: false });
      },
      clearExplicitPlayTest: () => set({ explicitPlay: null, screen: 'songSelect' }),
      startTimeMs: 0,
      editorReturnUrl: null,

      // 화면을 전환하면 설정 모달은 항상 닫는다. 모달은 곡 선택 위에만 뜨는 오버레이라
      // 다른 화면으로 넘어간 채 열려 있으면 안 되고, 복귀 시 의도치 않게 재오픈되는 것도 막는다.
      // 명시 테스트 요청(문서·음원)은 explicitPlay 화면에서만 쓰므로 다른 화면으로 가면 항상 해제한다.
      setScreen: (screen) => set(state => ({ screen, settingsOpen: false, calibrationActive: false,
        ...(screen === 'loading' ? { playLoadRequestId: state.playLoadRequestId + 1 } : {}),
        ...(screen !== 'explicitPlay' ? { explicitPlay: null } : {}),
        ...(screen !== 'observer' ? { observerPlay: null, playLoadTarget: 'play' as const } : {}),
        ...(screen !== 'play' && screen !== 'result' && screen !== 'explicitPlay' && screen !== 'observer'
          ? { normalPlay: null, explicitPlay: null, lastResult: null, chartData: null, audioBuffer: null,
            playLoadId: state.playLoadId + 1, startTimeMs: 0, editorReturnUrl: null }
          : {}),
      })),

      setSettingsOpen: (open) => set(open ? { settingsOpen: true } : { settingsOpen: false, calibrationActive: false }),
      setCalibrationActive: (active) => set({ calibrationActive: active }),

      updateSettings: (partial) => set((state) => ({
        settings: { ...state.settings, ...partial },
      })),

      updateKeyBindings: (bindings) => set((state) => ({
        settings: {
          ...state.settings,
          keyBindings: { ...state.settings.keyBindings, ...bindings },
        },
      })),

      selectSong: (songId, difficulty, audioUrl, playbackRange = null) => set(state => ({
        selectedSongId: songId,
        selectedDifficulty: difficulty,
        selectedAudioUrl: audioUrl,
        selectedPlaybackRange: playbackRange ? { ...playbackRange } : null,
        playLoadId: state.playLoadId + 1, playLoadTarget: 'play', observerPlay: null,
        normalPlay: null, explicitPlay: null, lastResult: null,
        chartData: null, audioBuffer: null, startTimeMs: 0, editorReturnUrl: null,
      })),

      setResult: (result) => set({ lastResult: result }),

      completeFirstLaunch: () => set((state) => ({
        settings: { ...state.settings, isFirstLaunch: false },
      })),

      setChartData: (chart) => set({ chartData: chart }),

      setAudioBuffer: (buffer) => set({ audioBuffer: buffer }),

      setStartTimeMs: (ms) => set({ startTimeMs: ms }),
      setEditorReturnUrl: (url) => set({ editorReturnUrl: url }),
    }),
    {
      name: 'not4k-settings',
      partialize: (state) => ({ settings: state.settings }),
      merge: mergePersistedSettings,
    }
  )
);

export const PRESET_BINDINGS = {
  tkl: TKL_BINDINGS,
  numpad: NUMPAD_BINDINGS,
};
