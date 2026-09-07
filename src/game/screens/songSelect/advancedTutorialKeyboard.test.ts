import { describe, expect, it } from 'vitest';
import { PRESET_BINDINGS } from '../../stores';
import { ADVANCED_TUTORIAL_PREVIEWS } from './advancedTutorialPreviews';
import { getTutorialInputTimings } from './tutorialPreviewChart';
import { createTutorialPreviewSessionController } from './tutorialPreviewSession';
import { resolveTutorialInputTimingsForKeyboard, resolveTutorialKeyboardBindings } from './tutorialKeyboardLayout';

const configurations = [
  { name: '기본 TKL', preset: 'tkl' as const, bindings: PRESET_BINDINGS.tkl },
  { name: '기본 Numpad', preset: 'numpad' as const, bindings: PRESET_BINDINGS.numpad },
  { name: '레인당 두 키만 배정한 설정', preset: 'tkl' as const, bindings: {
    lane1: ['KeyQ', 'KeyW'], lane2: ['KeyE', 'KeyC'], lane3: ['KeyP', 'Comma'], lane4: ['BracketLeft', 'BracketRight'],
  } },
  { name: '다른 레인이 S/X를 쓰는 사용자 배치', preset: 'tkl' as const, bindings: {
    lane1: ['KeyA', 'KeyF'], lane2: ['KeyS', 'KeyX'], lane3: ['KeyJ', 'KeyK'], lane4: ['KeyL', 'Semicolon'],
  } },
  { name: 'W를 첫 번째 키로 옮긴 사용자 배치', preset: 'tkl' as const, bindings: {
    lane1: ['KeyW', 'KeyA'], lane2: ['KeyE', 'KeyC'], lane3: ['KeyP', 'Comma'], lane4: ['BracketLeft', 'BracketRight'],
  } },
];

describe.each(configurations)('$name에서 Advanced 입력 시연', ({ preset, bindings }) => {
  it.each(ADVANCED_TUTORIAL_PREVIEWS)('$id를 16ms 프레임으로 재생하면 원본 시연의 판정·달성률·Full Combo가 유지된다', preview => {
    const originalBindings = structuredClone(bindings);
    const source = getTutorialInputTimings(preview.chart);
    const resolved = resolveTutorialKeyboardBindings(source, bindings, preset);
    const mapped = resolveTutorialInputTimingsForKeyboard(source, resolved.bindings);
    const original = createTutorialPreviewSessionController(preview.chart, source);
    original.advanceTo(preview.loopMs);
    const player = createTutorialPreviewSessionController(preview.chart, mapped);
    for (let time = 0; time < preview.loopMs; time += 16) player.advanceTo(time);
    player.advanceTo(preview.loopMs);
    expect(player.session.score.getState()).toEqual(original.session.score.getState());
    expect(bindings).toEqual(originalBindings);
    const keys = Object.values(resolved.bindings).flat();
    expect(new Set(keys).size).toBe(keys.length);
  });
});
