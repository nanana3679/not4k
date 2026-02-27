import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Chart } from '../../shared';

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
  offsetMs: number;
  preset: 'numpad' | 'tkl';
  isFirstLaunch: boolean;
  showFastSlow: boolean;
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
  lane2: ['KeyE', 'KeyD', 'KeyC'],
  lane3: ['KeyP', 'KeyL', 'Comma'],
  lane4: ['BracketLeft', 'BracketRight', 'Semicolon', 'Period'],
};

const NUMPAD_BINDINGS: KeyBindings = {
  lane1: ['KeyQ', 'KeyW', 'KeyS', 'KeyX'],
  lane2: ['KeyE', 'KeyD', 'KeyC'],
  lane3: ['Numpad7', 'Numpad4', 'Numpad1'],
  lane4: ['Numpad8', 'Numpad9', 'Numpad5', 'Numpad2'],
};

const DEFAULT_SETTINGS: GameSettings = {
  keyBindings: TKL_BINDINGS,
  scrollSpeed: 800,
  liftPercent: 0,
  suddenPercent: 0,
  targetFps: 60,
  offsetMs: 0,
  preset: 'tkl',
  isFirstLaunch: true,
  showFastSlow: true,
};

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
    }
  )
);

export const PRESET_BINDINGS = {
  tkl: TKL_BINDINGS,
  numpad: NUMPAD_BINDINGS,
};
