import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Chart } from '../../shared';
import type { JudgmentMode } from '../../shared/constants/judgment';

type Screen = 'title' | 'presetSetup' | 'songSelect' | 'loading' | 'play' | 'result' | 'settings';

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
  targetFps: number;
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
  settings: GameSettings;
  selectedSongId: string | null;
  selectedDifficulty: string | null;
  selectedAudioUrl: string | null;
  lastResult: PlayResult | null;
  chartData: Chart | null;
  audioBuffer: AudioBuffer | null;

  setScreen: (screen: Screen) => void;
  updateSettings: (partial: Partial<GameSettings>) => void;
  updateKeyBindings: (bindings: Partial<KeyBindings>) => void;
  selectSong: (songId: string, difficulty: string, audioUrl: string) => void;
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
  lane2: ['KeyE', 'KeyD', 'KeyC', 'PageDown', 'KeyO'],
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
  targetFps: 60,
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
      settings: DEFAULT_SETTINGS,
      selectedSongId: null,
      selectedDifficulty: null,
      selectedAudioUrl: null,
      lastResult: null,
      chartData: null,
      audioBuffer: null,
      startTimeMs: 0,
      editorReturnUrl: null,

      setScreen: (screen) => set({ screen }),

      updateSettings: (partial) => set((state) => ({
        settings: { ...state.settings, ...partial },
      })),

      updateKeyBindings: (bindings) => set((state) => ({
        settings: {
          ...state.settings,
          keyBindings: { ...state.settings.keyBindings, ...bindings },
        },
      })),

      selectSong: (songId, difficulty, audioUrl) => set({
        selectedSongId: songId,
        selectedDifficulty: difficulty,
        selectedAudioUrl: audioUrl,
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
