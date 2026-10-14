import type { GameRenderer } from '../game/renderer/GameRenderer';
import { labGearButtonColor } from './gearPreview';

type KeyEvent = Pick<KeyboardEvent, 'type' | 'code' | 'repeat' | 'shiftKey'>;

/** Lab 입력은 공입력이다. 눌렀을 때의 레인을 기억해 프리셋 변경 뒤에도 keyup·blur가 같은 버튼을 뗀다. */
export function createGearPreviewInput(
  target: Pick<GameRenderer, 'setKeyState' | 'setGearButtonKey'>,
  bindings: () => ReadonlyMap<string, number>,
) {
  const pressedLanes = new Map<string, number | undefined>();
  const releaseKey = (code: string) => {
    target.setKeyState(code, false);
    const lane = pressedLanes.get(code);
    if (lane !== undefined) target.setGearButtonKey(lane, code, false);
    pressedLanes.delete(code);
  };
  return {
    onKey(event: KeyEvent): void {
      if (event.type !== 'keydown') {
        releaseKey(event.code);
        return;
      }
      // 키 반복으로 마지막 누름 색을 덮거나, 바뀐 바인딩의 다른 레인까지 누르지 않는다.
      if (event.repeat || pressedLanes.has(event.code)) return;
      const lane = bindings().get(event.code);
      pressedLanes.set(event.code, lane);
      target.setKeyState(event.code, true);
      if (lane !== undefined) target.setGearButtonKey(lane, event.code, true, labGearButtonColor(event.shiftKey));
    },
    releaseAll(): void {
      for (const code of pressedLanes.keys()) releaseKey(code);
    },
  };
}
