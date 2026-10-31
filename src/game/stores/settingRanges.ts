import type { GameSettings } from './gameStore';

interface SliderRange {
  min: number;
  max: number;
  step: number;
}

/**
 * 설정 UI 슬라이더의 범위. 설정 패널(SettingsPanel)과 저장값·서버 값의 복원 정규화(mergePersistedSettings)가
 * 함께 써서 두 곳의 범위가 어긋나지 않게 한다.
 */
export const SETTING_SLIDER_RANGES = {
  masterVolume: { min: 0, max: 1, step: 0.01 },
  playSpeed: { min: 0.5, max: 2, step: 0.05 },
  scrollSpeed: { min: 200, max: 2000, step: 50 },
  liftPercent: { min: 0, max: 100, step: 1 },
  suddenPercent: { min: 0, max: 100, step: 1 },
  bombScale: { min: 0, max: 3, step: 0.1 },
} as const satisfies Partial<Record<keyof GameSettings, SliderRange>>;

/** 설정 UI의 렌더 해상도(`renderHeight`) 선택지. */
export const RENDER_HEIGHT_OPTIONS = [720, 1080, 1440] as const;
