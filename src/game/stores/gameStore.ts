import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Chart, PlaybackRange } from '../../shared';
import type { JudgmentMode } from '../../shared/constants/judgment';

type Screen = 'title' | 'presetSetup' | 'songSelect' | 'loading' | 'play' | 'result';

interface KeyBindings {
  lane1: string[];
  lane2: string[];
  lane3: string[];
  lane4: string[];
}

interface GameSettings {
  keyBindings: KeyBindings;
  scrollSpeed: number;
  liftPercent: number;
  suddenPercent: number;
  audioOffsetMs: number;
  judgmentOffsetMs: number;
  preset: 'numpad' | 'tkl';
  isFirstLaunch: boolean;
  showFastSlow: boolean;
  showTimingDiff: boolean;
  skinId: string;
  renderHeight: number;
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
  maxCombo: number;
  isFullCombo: boolean;
  judgmentCounts: Record<string, number>;
  goodTrillCount: number;
  fastCount: number;
  slowCount: number;
}

interface GameState {
  screen: Screen;
  /**
   * 설정 모달 표시 여부. 곡 선택 화면 위에 오버레이로 뜨며, Calibration도 이 모달의
   * 서브뷰라 별도 화면 전환이 없다. UI 상태이므로 영속화하지 않는다(새로고침 시 닫힘).
   */
  settingsOpen: boolean;
  settings: GameSettings;
  selectedSongId: string | null;
  selectedDifficulty: string | null;
  selectedAudioUrl: string | null;
  selectedPlaybackRange: PlaybackRange | null;
  lastResult: PlayResult | null;
  chartData: Chart | null;
  audioBuffer: AudioBuffer | null;

  setScreen: (screen: Screen) => void;
  setSettingsOpen: (open: boolean) => void;
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
  audioOffsetMs: 0,
  judgmentOffsetMs: 0,
  preset: 'tkl',
  isFirstLaunch: true,
  showFastSlow: true,
  showTimingDiff: false,
  skinId: 'crystal',
  renderHeight: 1080,
  playSpeed: 1.0,
  judgmentMode: 'normal' as JudgmentMode,
  debugMode: false,
  masterVolume: 1.0,
};

/** @internal 테스트용으로 export. persist merge 콜백. */
export function mergePersistedSettings(
  persisted: unknown,
  current: unknown,
) {
  const p = persisted as { settings?: Partial<GameSettings> };
  const cur = current as GameState;
  const merged: Record<string, unknown> = { ...cur.settings, ...p.settings };
  // Migration: 기존 offsetMs → audioOffsetMs
  const raw = p.settings as Record<string, unknown> | undefined;
  if (raw && 'offsetMs' in raw && !('audioOffsetMs' in raw)) {
    merged.audioOffsetMs = raw.offsetMs;
  }
  delete merged.offsetMs;
  return {
    ...cur,
    settings: merged as unknown as GameSettings,
  };
}

export const useGameStore = create<GameState>()(
  persist(
    (set) => ({
      screen: 'title',
      settingsOpen: false,
      settings: DEFAULT_SETTINGS,
      selectedSongId: null,
      selectedDifficulty: null,
      selectedAudioUrl: null,
      selectedPlaybackRange: null,
      lastResult: null,
      chartData: null,
      audioBuffer: null,
      startTimeMs: 0,
      editorReturnUrl: null,

      // 화면을 전환하면 설정 모달은 항상 닫는다. 모달은 곡 선택 위에만 뜨는 오버레이라
      // 다른 화면으로 넘어간 채 열려 있으면 안 되고, 복귀 시 의도치 않게 재오픈되는 것도 막는다.
      setScreen: (screen) => set({ screen, settingsOpen: false }),

      setSettingsOpen: (open) => set({ settingsOpen: open }),

      updateSettings: (partial) => set((state) => ({
        settings: { ...state.settings, ...partial },
      })),

      updateKeyBindings: (bindings) => set((state) => ({
        settings: {
          ...state.settings,
          keyBindings: { ...state.settings.keyBindings, ...bindings },
        },
      })),

      selectSong: (songId, difficulty, audioUrl, playbackRange = null) => set({
        selectedSongId: songId,
        selectedDifficulty: difficulty,
        selectedAudioUrl: audioUrl,
        selectedPlaybackRange: playbackRange,
      }),

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
