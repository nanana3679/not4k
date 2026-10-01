import { existsSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as crystal from './crystal/components.jsx';
import * as prism from './prism/components.jsx';
import * as simple from './simple/components.jsx';
import { getSkinManifest } from '../src/game/skin/skins';

// export.jsx는 컴포넌트의 HELD_EFFECT가 false인 스킨의 켜짐 요소를 그리지 않아 PNG도 만들지 않는다(RFD 0028).
describe('SVG 스킨의 켜짐 효과 선언', () => {
  it.each([['crystal', crystal], ['prism', prism], ['simple', simple]] as const)(
    '%s 컴포넌트의 HELD_EFFECT(생략 시 true)는 스킨 설정의 heldEffect와 같다',
    (id, components) => {
      const declared = (components as { HELD_EFFECT?: boolean }).HELD_EFFECT ?? true;
      expect(declared).toBe(getSkinManifest(id).theme.heldEffect !== false);
    },
  );

  it('Simple 컴포넌트는 HELD_EFFECT를 false로 선언한다', () => {
    expect((simple as { HELD_EFFECT?: boolean }).HELD_EFFECT).toBe(false);
  });

  it('Simple의 public PNG(1배·@2x)에는 켜짐 이미지가 없고 부분 실패 이미지는 있다', () => {
    for (const dir of ['public/skins/simple', 'public/skins/simple/@2x']) {
      const held = readdirSync(new URL(`../${dir}/`, import.meta.url)).filter(name => name.includes('-held'));
      expect(held, dir).toEqual([]);
      expect(existsSync(new URL(`../${dir}/body-double-partial-failed-left.png`, import.meta.url)), dir).toBe(true);
    }
  });
});
