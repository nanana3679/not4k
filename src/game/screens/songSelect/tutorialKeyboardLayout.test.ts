import { describe, expect, it } from 'vitest';
import { PRESET_BINDINGS } from '../../stores';
import { beat } from '../../../shared/types/beat';
import { getTutorialInputTimings, TUTORIAL_PREVIEWS, type TutorialInputTiming } from './tutorialPreviewChart';
import { ALL_TUTORIAL_PREVIEWS } from './tutorialCatalog';
import {
  findUnmetTutorialPracticeKeyRequirements,
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

describe('findUnmetTutorialPracticeKeyRequirements', () => {
  const TWO_KEYS_PER_LANE = {
    lane1: ['KeyQ', 'KeyW'], lane2: ['KeyE', 'KeyC'], lane3: ['KeyP', 'Comma'], lane4: ['BracketLeft', 'BracketRight'],
  };

  function previewTimings(id: string): TutorialInputTiming[] {
    const preview = ALL_TUTORIAL_PREVIEWS.find(candidate => candidate.id === id);
    if (!preview) throw new Error(`unknown tutorial preview: ${id}`);
    return getTutorialInputTimings(preview.chart);
  }

  function laneTimings(
    ...inputs: [lane: 1 | 2 | 3 | 4, keyCode: string, startMs?: number, endMs?: number][]
  ): TutorialInputTiming[] {
    return inputs.map(([lane, keyCode, startMs = 0, endMs = 500]) => ({
      event: { type: 'tutorialInput', beat: beat(startMs, 500), endBeat: beat(endMs, 500), lane, keyCode },
      startMs,
      endMs,
    }));
  }

  it.each([
    { name: 'TKL', bindings: PRESET_BINDINGS.tkl },
    { name: 'Numpad', bindings: PRESET_BINDINGS.numpad },
  ])('$name 프리셋(레인당 4키)으로 확인하면 Basic·Advanced 29개 항목의 실습 키 요건을 모두 충족한다', ({ bindings }) => {
    const unmetById = Object.fromEntries(ALL_TUTORIAL_PREVIEWS.map(preview => [
      preview.id,
      findUnmetTutorialPracticeKeyRequirements(getTutorialInputTimings(preview.chart), bindings),
    ]));

    expect(ALL_TUTORIAL_PREVIEWS).toHaveLength(29);
    expect(unmetById).toEqual(Object.fromEntries(ALL_TUTORIAL_PREVIEWS.map(preview => [preview.id, []])));
  });

  it('Basic·Advanced 29개 항목을 레인당 2키로 확인하면 1번 레인의 advanced-double-hold 4키·advanced-single-head-double 3키·advanced-double-swap 4키만 미충족', () => {
    const unmet = ALL_TUTORIAL_PREVIEWS.flatMap(preview =>
      findUnmetTutorialPracticeKeyRequirements(getTutorialInputTimings(preview.chart), TWO_KEYS_PER_LANE)
        .map(requirement => ({ id: preview.id, ...requirement })),
    );

    expect(unmet).toEqual([
      { id: 'advanced-double-hold', lane: 1, requiredKeyCount: 4, boundKeyCount: 2 },
      { id: 'advanced-double-swap', lane: 1, requiredKeyCount: 4, boundKeyCount: 2 },
      { id: 'advanced-single-head-double', lane: 1, requiredKeyCount: 3, boundKeyCount: 2 },
    ]);
  });

  it('Advanced 더블 연결(Q·W 유지, S·X 중간 탭)에서 1번 레인에 Q·W만 있으면 키 4개 요건을 2개 설정으로 미충족', () => {
    const bindings = { ...PRESET_BINDINGS.tkl, lane1: ['KeyQ', 'KeyW'] };
    const timings = previewTimings('advanced-double-hold');

    expect(timings.map(({ event, startMs, endMs }) => [event.lane, event.keyCode, startMs, endMs])).toEqual([
      [1, 'KeyQ', 2000, 3000],
      [1, 'KeyW', 2000, 3000],
      [1, 'KeyS', 2500, 2525],
      [1, 'KeyX', 2500, 2525],
    ]);
    expect(findUnmetTutorialPracticeKeyRequirements(timings, bindings)).toEqual([
      { lane: 1, requiredKeyCount: 4, boundKeyCount: 2 },
    ]);
  });

  it('손배치 시연의 2·3번 레인 Binding1·Binding3은 레인당 2키 설정으로 충족(세 번째 슬롯 키를 요구하지 않음)', () => {
    expect(findUnmetTutorialPracticeKeyRequirements(previewTimings('hand-placement'), TWO_KEYS_PER_LANE)).toEqual([]);
    expect(findUnmetTutorialPracticeKeyRequirements(
      laneTimings([1, 'Binding1'], [1, 'Binding3']),
      { lane1: ['KeyQ', 'KeyW'], lane2: [], lane3: [], lane4: [] },
    )).toEqual([]);
  });

  it('1번 레인의 Binding1·KeyQ와 3번 레인의 Numpad7·KeyP를 0ms에 동시에 눌러도 레인당 1키 설정으로 충족', () => {
    const timings = laneTimings([1, 'Binding1'], [1, 'KeyQ'], [3, 'Numpad7'], [3, 'KeyP']);

    expect(findUnmetTutorialPracticeKeyRequirements(
      timings,
      { lane1: ['KeyA'], lane2: [], lane3: ['KeyJ'], lane4: [] },
    )).toEqual([]);
  });

  it('1번 레인에서 4키를 동시에 누르면 표시용 S·X 보충 후에도 실제 Q·W 2키 설정으로 미충족', () => {
    const bindings = { lane1: ['KeyQ', 'KeyW'], lane2: [], lane3: [], lane4: [] };
    const timings = laneTimings([1, 'Binding1'], [1, 'Binding2'], [1, 'Binding3'], [1, 'Binding4']);
    const before = findUnmetTutorialPracticeKeyRequirements(timings, bindings);

    const display = resolveTutorialKeyboardBindings(timings, bindings, 'tkl');

    expect(display.supplementedLanes).toEqual([1]);
    expect(display.bindings.lane1).toHaveLength(4);
    expect(findUnmetTutorialPracticeKeyRequirements(timings, bindings)).toEqual(before);
    expect(before).toEqual([{ lane: 1, requiredKeyCount: 4, boundKeyCount: 2 }]);
    expect(bindings.lane1).toEqual(['KeyQ', 'KeyW']);
  });

  it('수직 이동 시연의 1번 레인 W·S는 Q·W 2키 설정으로 충족하고, 시연 표시용 S 보충 여부와 무관하다', () => {
    const timings = previewTimings('vertical-movement');

    expect(resolveTutorialKeyboardBindings(timings, TWO_KEYS_PER_LANE, 'tkl').supplementedLanes).toEqual([1]);
    expect(findUnmetTutorialPracticeKeyRequirements(timings, TWO_KEYS_PER_LANE)).toEqual([]);
  });

  it.each([
    { count: 1, keys: ['KeyD'] },
    { count: 2, keys: ['KeyD', 'KeyF'] },
    { count: 3, keys: ['KeyD', 'KeyF', 'KeyC'] },
  ])('싱글 노트 시연의 2번 레인 F→D→C를 확인하면 실제 $count개 키 설정으로 충족', ({ keys }) => {
    const bindings = { ...TWO_KEYS_PER_LANE, lane2: keys };

    expect(findUnmetTutorialPracticeKeyRequirements(previewTimings('single-note'), bindings)).toEqual([]);
  });

  it('1번 레인에서 0ms에 2키를 동시에 누르면 1키 설정은 미충족이고 2키 설정은 충족', () => {
    const timings = laneTimings([1, 'Binding1'], [1, 'Binding2']);

    expect(findUnmetTutorialPracticeKeyRequirements(
      timings,
      { ...TWO_KEYS_PER_LANE, lane1: ['KeyQ'] },
    )).toEqual([{ lane: 1, requiredKeyCount: 2, boundKeyCount: 1 }]);
    expect(findUnmetTutorialPracticeKeyRequirements(timings, TWO_KEYS_PER_LANE)).toEqual([]);
  });

  it('3키를 500ms·1000ms 경계에서 떼는 순간 다음 키를 누르면 키 갈아타기라 2키를 요구해 1키 설정은 미충족', () => {
    const timings = bindingTimings('Binding1', 'Binding2', 'Binding3');

    expect(findUnmetTutorialPracticeKeyRequirements(
      timings,
      { ...TWO_KEYS_PER_LANE, lane1: ['KeyQ'] },
    )).toEqual([{ lane: 1, requiredKeyCount: 2, boundKeyCount: 1 }]);
    expect(findUnmetTutorialPracticeKeyRequirements(timings, TWO_KEYS_PER_LANE)).toEqual([]);
  });

  it('4종류 키 중 3키만 500～750ms에 겹치면 입력 순서가 뒤섞여도 3키를 요구해 2키 설정은 미충족', () => {
    const timings = laneTimings(
      [1, 'KeyS', 500, 1000],
      [1, 'KeyQ', 0, 1000],
      [1, 'KeyX', 1000, 1500],
      [1, 'KeyW', 250, 750],
    );

    expect(findUnmetTutorialPracticeKeyRequirements(timings, TWO_KEYS_PER_LANE)).toEqual([
      { lane: 1, requiredKeyCount: 3, boundKeyCount: 2 },
    ]);
    expect(findUnmetTutorialPracticeKeyRequirements(
      timings,
      { ...TWO_KEYS_PER_LANE, lane1: ['KeyQ', 'KeyW', 'KeyS'] },
    )).toEqual([]);
  });

  it('1번 레인의 Q·Binding1 중 Binding1이 500ms에 끝나도 Q 유지 중 750ms W를 누르면 2키를 요구', () => {
    const timings = laneTimings([1, 'KeyQ', 0, 1500], [1, 'Binding1', 0, 500], [1, 'KeyW', 750, 1000]);

    expect(findUnmetTutorialPracticeKeyRequirements(
      timings,
      { ...TWO_KEYS_PER_LANE, lane1: ['KeyQ'] },
    )).toEqual([{ lane: 1, requiredKeyCount: 2, boundKeyCount: 1 }]);
  });

  it('1번 레인 Q·Q 중복 바인딩으로 동시 2키 시연을 확인하면 실제 1키로 세어 미충족', () => {
    expect(findUnmetTutorialPracticeKeyRequirements(
      laneTimings([1, 'Binding1'], [1, 'Binding2']),
      { ...TWO_KEYS_PER_LANE, lane1: ['KeyQ', 'KeyQ'] },
    )).toEqual([{ lane: 1, requiredKeyCount: 2, boundKeyCount: 1 }]);
  });

  it('바인딩이 0개인 2번 레인에 싱글 노트 시연 입력 F→D→C가 있으면 키 1개 요건을 미충족', () => {
    expect(findUnmetTutorialPracticeKeyRequirements(
      previewTimings('single-note'),
      { lane1: [], lane2: [], lane3: [], lane4: [] },
    )).toEqual([{ lane: 2, requiredKeyCount: 1, boundKeyCount: 0 }]);
  });

  it('1번 레인에서 Q를 500ms에 떼는 순간 Q를 다시 누르는 같은 키 재타격은 1키로 충족', () => {
    const timings = laneTimings([1, 'KeyQ', 0, 500], [1, 'KeyQ', 500, 1000]);

    expect(findUnmetTutorialPracticeKeyRequirements(
      timings,
      { ...TWO_KEYS_PER_LANE, lane1: ['KeyQ'] },
    )).toEqual([]);
  });

  it('1번 레인에 0ms 길이 입력 1개만 있어도 최소 1키를 요구해 0키 설정은 미충족', () => {
    const timings = laneTimings([1, 'KeyQ', 500, 500]);

    expect(findUnmetTutorialPracticeKeyRequirements(
      timings,
      { lane1: [], lane2: [], lane3: [], lane4: [] },
    )).toEqual([{ lane: 1, requiredKeyCount: 1, boundKeyCount: 0 }]);
  });

  it('1번 레인에서 500ms에 0ms 길이 입력 Q·W를 함께 누르면 같은 순간 두 키라 2키를 요구', () => {
    const timings = laneTimings([1, 'KeyQ', 500, 500], [1, 'KeyW', 500, 500]);

    expect(findUnmetTutorialPracticeKeyRequirements(
      timings,
      { ...TWO_KEYS_PER_LANE, lane1: ['KeyQ'] },
    )).toEqual([{ lane: 1, requiredKeyCount: 2, boundKeyCount: 1 }]);
  });

  it('4번 레인 입력이 2번 레인보다 먼저 나와도 두 레인이 모두 부족하면 레인 번호 순 2→4로 보고', () => {
    const timings = laneTimings([4, 'Binding1'], [4, 'Binding2'], [2, 'Binding1'], [2, 'Binding3']);

    expect(findUnmetTutorialPracticeKeyRequirements(
      timings,
      { lane1: [], lane2: ['KeyE'], lane3: [], lane4: ['BracketLeft'] },
    )).toEqual([
      { lane: 2, requiredKeyCount: 2, boundKeyCount: 1 },
      { lane: 4, requiredKeyCount: 2, boundKeyCount: 1 },
    ]);
  });

  it('시연 입력이 없는 레인은 바인딩이 0개여도 보고하지 않는다', () => {
    expect(findUnmetTutorialPracticeKeyRequirements(
      bindingTimings('Binding1'),
      { lane1: ['KeyQ'], lane2: [], lane3: [], lane4: [] },
    )).toEqual([]);
  });
});
