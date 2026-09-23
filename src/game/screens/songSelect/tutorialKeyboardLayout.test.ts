import { describe, expect, it } from 'vitest';
import { PRESET_BINDINGS } from '../../stores';
import { beat } from '../../../shared/types/beat';
import { getTutorialInputTimings, TUTORIAL_PREVIEWS, type TutorialInputTiming } from './tutorialPreviewChart';
import {
  getTutorialKeyboardLayout,
  resolveTutorialKeyboardBindings,
  resolveTutorialInputTimingsForKeyboard,
  sortLaneKeysForLabel,
} from './tutorialKeyboardLayout';

function bindingTimings(...keyCodes: string[]): TutorialInputTiming[] {
  return keyCodes.map((keyCode, index) => ({
    event: { type: 'tutorialInput', beat: beat(index), endBeat: beat(index + 1), lane: 1, keyCode },
    startMs: index * 500,
    endMs: (index + 1) * 500,
  }));
}

describe('tutorialKeyboardLayout', () => {
  it('8키 배치의 C와 Comma가 이미 설정에 있으면 손배치 시연에 불필요한 세 번째 키를 추가하지 않는다', () => {
    const bindings = {
      lane1: ['KeyQ', 'KeyW'], lane2: ['KeyE', 'KeyC'], lane3: ['KeyP', 'Comma'], lane4: ['BracketLeft', 'BracketRight'],
    };
    const result = resolveTutorialKeyboardBindings(
      getTutorialInputTimings(TUTORIAL_PREVIEWS[0].chart), bindings, 'tkl',
    );
    expect(result.bindings).toEqual(bindings);
    expect(result.supplementedLanes).toEqual([]);
  });

  it('TKL 프리셋이면 손배치 튜토리얼 입력은 Q/W/E/C와 P/[/]/,로 매핑', () => {
    const timings = resolveTutorialInputTimingsForKeyboard(
      getTutorialInputTimings(TUTORIAL_PREVIEWS[0].chart),
      PRESET_BINDINGS.tkl,
    );

    expect(timings.map(({ event }) => event.keyCode)).toEqual([
      'KeyQ',
      'KeyW',
      'KeyE',
      'KeyC',
      'KeyP',
      'BracketLeft',
      'BracketRight',
      'Comma',
    ]);
  });

  it('Numpad 프리셋이면 손배치 튜토리얼의 반대손 입력은 Numpad7/Numpad8/Numpad9/Numpad1로 매핑', () => {
    const timings = resolveTutorialInputTimingsForKeyboard(
      getTutorialInputTimings(TUTORIAL_PREVIEWS[0].chart),
      PRESET_BINDINGS.numpad,
    );

    expect(timings.map(({ event }) => event.keyCode)).toEqual([
      'KeyQ',
      'KeyW',
      'KeyE',
      'KeyC',
      'Numpad7',
      'Numpad8',
      'Numpad9',
      'Numpad1',
    ]);
  });

  it('TKL 프리셋이면 더블 노트의 71·89 숫자 조합은 같은 슬롯 관계인 P/,와 [/]로 매핑', () => {
    const doublePreview = TUTORIAL_PREVIEWS.find((preview) => preview.id === 'double-note');
    const timings = resolveTutorialInputTimingsForKeyboard(
      getTutorialInputTimings(doublePreview?.chart),
      PRESET_BINDINGS.tkl,
    );

    expect(timings.map(({ event }) => event.keyCode)).toEqual([
      'KeyQ',
      'KeyW',
      'KeyE',
      'KeyC',
      'KeyP',
      'Comma',
      'BracketLeft',
      'BracketRight',
    ]);
  });

  it('TKL 프리셋이면 수평·수직 이동의 Numpad 전용 키는 같은 바인딩 슬롯의 TKL 키로 매핑', () => {
    const horizontalPreview = TUTORIAL_PREVIEWS.find((preview) => preview.id === 'horizontal-movement');
    const verticalPreview = TUTORIAL_PREVIEWS.find((preview) => preview.id === 'vertical-movement');
    const horizontalTimings = resolveTutorialInputTimingsForKeyboard(
      getTutorialInputTimings(horizontalPreview?.chart),
      PRESET_BINDINGS.tkl,
    );
    const verticalTimings = resolveTutorialInputTimingsForKeyboard(
      getTutorialInputTimings(verticalPreview?.chart),
      PRESET_BINDINGS.tkl,
    );

    expect(horizontalTimings.map(({ event }) => event.keyCode)).toEqual([
      'KeyW',
      'KeyE',
      'KeyO',
      'KeyP',
      'KeyW',
      'KeyE',
      'KeyO',
      'KeyP',
      'KeyE',
      'KeyR',
      'KeyP',
      'BracketLeft',
      'KeyE',
      'KeyR',
      'KeyP',
      'BracketLeft',
    ]);
    expect(verticalTimings.map(({ event }) => event.keyCode)).toEqual([
      'KeyW',
      'KeyE',
      'KeyS',
      'KeyD',
      'KeyW',
      'KeyE',
      'KeyS',
      'KeyD',
      'KeyP',
      'BracketLeft',
      'Comma',
      'Period',
      'KeyP',
      'BracketLeft',
      'Comma',
      'Period',
    ]);
  });

  it('Numpad 프리셋 키보드 레이아웃은 Numpad 키를 포함하고 TKL 프리셋은 제외', () => {
    const tklCodes = getTutorialKeyboardLayout('tkl').keys.map((key) => key.code);
    const numpadCodes = getTutorialKeyboardLayout('numpad').keys.map((key) => key.code);

    expect(tklCodes).not.toContain('Numpad7');
    expect(numpadCodes).toContain('Numpad7');
    expect(numpadCodes).toContain('Numpad8');
  });

  it('Numpad 같은 세로열 키 라벨은 위쪽 7보다 아래쪽 4를 먼저 표시하고 TKL 라벨 순서는 유지', () => {
    const numpadLabels = sortLaneKeysForLabel([
      { keyCode: 'Numpad7', label: '7' },
      { keyCode: 'Numpad4', label: '4' },
    ]).map((key) => key.label);
    const tklLabels = sortLaneKeysForLabel([
      { keyCode: 'KeyP', label: 'P' },
      { keyCode: 'KeyL', label: 'L' },
    ]).map((key) => key.label);

    expect(numpadLabels).toEqual(['4', '7']);
    expect(tklLabels).toEqual(['P', 'L']);
  });

  it('기본 lane1 Q/W와 2-slot 시연은 원본 binding을 복사하고 보충하지 않는다', () => {
    const bindings = { lane1: ['KeyQ', 'KeyW'], lane2: [], lane3: [], lane4: [] };
    const result = resolveTutorialKeyboardBindings(bindingTimings('Binding1', 'Binding2'), bindings, 'tkl');
    expect(result.bindings).toEqual(bindings);
    expect(result.supplementedLanes).toEqual([]);
    expect(bindings.lane1).toEqual(['KeyQ', 'KeyW']);
  });

  it('4-slot lane1 시연은 TKL 기본 Q/W에 S/X를 임시 보충하고 사용자 binding은 바꾸지 않는다', () => {
    const bindings = { lane1: ['KeyQ', 'KeyW'], lane2: [], lane3: [], lane4: [] };
    const result = resolveTutorialKeyboardBindings(
      bindingTimings('Binding1', 'Binding2', 'Binding3', 'Binding4'), bindings, 'tkl',
    );
    expect(result.bindings.lane1).toEqual(['KeyQ', 'KeyW', 'KeyS', 'KeyX']);
    expect(result.supplementedLanes).toEqual([1]);
    expect(bindings.lane1).toEqual(['KeyQ', 'KeyW']);
  });

  it('Numpad와 equivalent source slot은 preset visible key로 4개를 만들고 lane 간 중복을 피한다', () => {
    const bindings = { lane1: ['KeyQ', 'KeyW'], lane2: ['KeyS'], lane3: [], lane4: [] };
    const result = resolveTutorialKeyboardBindings(
      bindingTimings('KeyQ', 'KeyW', 'KeyS', 'KeyX'), bindings, 'numpad',
    );
    expect(new Set(Object.values(result.bindings).flat()).size).toBe(
      Object.values(result.bindings).flat().length,
    );
    expect(result.bindings.lane1).toHaveLength(4);
    expect(result.bindings.lane1).not.toContain('KeyS');
    expect(result.supplementedLanes).toEqual([1]);
  });
});
