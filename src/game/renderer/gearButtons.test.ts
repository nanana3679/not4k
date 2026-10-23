import { describe, expect, it } from 'vitest';
import { Container, Sprite, Texture, TextureSource } from 'pixi.js';
import {
  GEAR_BUTTON_COLORS,
  GEAR_BUTTON_GEOMETRY,
  GearButtonState,
  GearButtons,
  gearButtonColorForHoldCount,
  gearButtonReleaseLook,
  type GearButtonLook,
} from './gearButtons';

const RELEASE = GEAR_BUTTON_GEOMETRY.release;
const look = (): GearButtonLook => ({ tint: 0, glow: 0, cap: 0 });

describe('GEAR_BUTTON_GEOMETRY — 생성기(prepare-gear-buttons-v22.mjs)가 적은 기어 버튼 atlas frame', () => {
  it('네 버튼 모두 glow·tint의 싱글·더블과 cap atlas frame이 있고, 기어 그림 좌표·아틀라스 좌표·크기가 모두 16px 정렬이며 아틀라스 816×3072 안이다', () => {
    expect(GEAR_BUTTON_GEOMETRY.buttons).toHaveLength(4);
    expect([GEAR_BUTTON_GEOMETRY.atlasWidth, GEAR_BUTTON_GEOMETRY.atlasHeight]).toEqual([816, 3072]);
    for (const button of GEAR_BUTTON_GEOMETRY.buttons) {
      const frames = [...GEAR_BUTTON_COLORS.flatMap((color) => [...button.glow[color], button.tint[color]]), button.cap];
      for (const frame of frames) {
        for (const value of [frame.x, frame.y, frame.width, frame.height, frame.atlasX, frame.atlasY]) expect(value % 16).toBe(0);
        expect(frame.atlasX + frame.width).toBeLessThanOrEqual(GEAR_BUTTON_GEOMETRY.atlasWidth);
        expect(frame.atlasY + frame.height).toBeLessThanOrEqual(GEAR_BUTTON_GEOMETRY.atlasHeight);
      }
    }
  });

  it('버튼은 왼쪽부터 레인 1~4 순서로 위치하고(1번 glow x 192, 4번 x 640), 키 덱 위끝(1088행)보다 위로 나가지 않는다', () => {
    const glowX = GEAR_BUTTON_GEOMETRY.buttons.map((button) => button.glow.single[0].x);
    expect(glowX).toEqual([192, 352, 496, 640]);
    for (const button of GEAR_BUTTON_GEOMETRY.buttons) expect(button.glow.single[0].y).toBeGreaterThanOrEqual(1088);
  });

  it('네 버튼은 두 색 각각 15·20·25·30px glow를 가지며 모든 깊이의 기어 좌표·크기가 같다', () => {
    expect(GEAR_BUTTON_GEOMETRY.depths).toEqual([15, 20, 25, 30]);
    for (const button of GEAR_BUTTON_GEOMETRY.buttons) {
      const { x, y, width, height } = button.glow.single[0];
      for (const color of GEAR_BUTTON_COLORS) {
        expect(button.glow[color]).toHaveLength(4);
        for (const frame of button.glow[color]) expect(frame).toMatchObject({ x, y, width, height });
      }
    }
  });

  it('떼는 시간은 cap 40ms·흰빛 53ms·남는 빛 150ms이고, 곡선은 cap cubic-bezier(0.2, 0.6, 0.3, 1)·빛 ease-out(0, 0, 0.58, 1)이다', () => {
    expect(RELEASE).toEqual({ capMs: 40, whiteMs: 53, glowMs: 150, capEasing: [0.2, 0.6, 0.3, 1], glowEasing: [0, 0, 0.58, 1] });
  });

});

describe('gearButtonColorForHoldCount — 같은 레인의 실제 hold 수', () => {
  it('hold 수 1개는 연파랑, 2개·3개·4개는 금색이다', () => {
    expect([1, 2, 3, 4].map(gearButtonColorForHoldCount)).toEqual(['single', 'double', 'double', 'double']);
  });
});

describe('gearButtonReleaseLook — 뗀 뒤 경과 시간의 레이어 불투명도(버튼 누름 깊이 비교 시연의 CSS 전환과 같음)', () => {
  it('뗀 직후 0ms면 cap 0·glow 1·tint 1(눌린 모습 그대로)', () => {
    expect(gearButtonReleaseLook(0, RELEASE, look())).toEqual({ cap: 0, glow: 1, tint: 1 });
  });

  it('뗀 뒤 20ms면 cap 0.890·glow 0.457·tint 0.789', () => {
    const out = gearButtonReleaseLook(20, RELEASE, look());
    expect(out.cap).toBeCloseTo(0.89, 3);
    expect(out.glow).toBeCloseTo(0.4566, 3);
    expect(out.tint).toBeCloseTo(0.7889, 3);
  });

  it('뗀 뒤 40ms면 cap이 1로 대기 키캡을 다 덮고 glow는 0.090, tint는 0.599 남는다', () => {
    const out = gearButtonReleaseLook(40, RELEASE, look());
    expect(out.cap).toBe(1);
    expect(out.glow).toBeCloseTo(0.0903, 3);
    expect(out.tint).toBeCloseTo(0.5992, 3);
  });

  it('뗀 뒤 53ms면 흰빛 glow는 0으로 먼저 꺼지고 고유색 tint는 0.486 남는다', () => {
    const out = gearButtonReleaseLook(53, RELEASE, look());
    expect(out.glow).toBe(0);
    expect(out.tint).toBeCloseTo(0.4864, 3);
  });

  it('뗀 뒤 150ms면 tint까지 0으로 꺼진다', () => {
    expect(gearButtonReleaseLook(150, RELEASE, look())).toEqual({ cap: 1, glow: 0, tint: 0 });
  });

  it('넘긴 out 객체를 고쳐 그대로 돌려준다(렌더 프레임마다 새 객체를 만들지 않음)', () => {
    const out = look();
    expect(gearButtonReleaseLook(75, RELEASE, out)).toBe(out);
  });
});

describe('GearButtonState — 버튼 하나의 누름 상태', () => {
  it('대기에서 KeyD를 싱글로 누르면 pressed·싱글·누른 키 1개이고 레이어는 glow 1·tint 0·cap 0', () => {
    const state = new GearButtonState();
    expect(state.phase).toBe('idle');
    expect(state.press('KeyD')).toBe(true);
    expect([state.phase, state.color, state.heldKeys]).toEqual(['pressed', 'single', 1]);
    expect(state.look(RELEASE, look())).toEqual({ glow: 1, tint: 0, cap: 0 });
  });

  it('KeyD를 누르고 그리기 전에 떼면 releasing이 되고, 뗀 뒤 첫 렌더 프레임(16ms)은 경과 0을 유지해 눌린 모습을 한 프레임 보이고 다음 프레임(16ms)부터 16ms로 나아간다', () => {
    const state = new GearButtonState();
    state.press('KeyD');
    expect(state.release('KeyD')).toBe(true);
    expect([state.phase, state.releaseMs]).toEqual(['releasing', 0]);
    expect(state.advance(16, RELEASE)).toBe(false);
    expect(state.releaseMs).toBe(0);
    expect(state.advance(16, RELEASE)).toBe(true);
    expect(state.releaseMs).toBe(16);
  });

  it('같은 레인에서 KeyD·KeyO를 누르고 KeyD만 떼면 pressed 그대로이고, KeyO까지 떼야 releasing이 된다', () => {
    const state = new GearButtonState();
    state.press('KeyD');
    state.press('KeyO');
    expect(state.release('KeyD')).toBe(true);
    expect([state.phase, state.heldKeys]).toEqual(['pressed', 1]);
    expect(state.release('KeyO')).toBe(true);
    expect([state.phase, state.heldKeys]).toEqual(['releasing', 0]);
  });

  it('KeyD를 1000ms 동안 그린 뒤 떼면 첫 16ms 프레임부터 cap이 돌아오고 누적 40ms에 cap 1이 된다', () => {
    const state = new GearButtonState();
    state.press('KeyD');
    state.advance(1000, RELEASE);
    state.release('KeyD');
    expect(state.advance(16, RELEASE)).toBe(true);
    expect(state.releaseMs).toBe(16);
    expect(state.look(RELEASE, look()).cap).toBeCloseTo(0.818, 3);
    state.advance(24, RELEASE);
    expect(state.look(RELEASE, look()).cap).toBe(1);
  });

  it('누른 적 없는 키(KeyX)를 떼면 무시한다: 대기는 대기, 눌림은 눌림 그대로', () => {
    const state = new GearButtonState();
    expect(state.release('KeyX')).toBe(false);
    expect(state.phase).toBe('idle');
    state.press('KeyD');
    expect(state.release('KeyX')).toBe(false);
    expect(state.phase).toBe('pressed');
  });

  it('AutoPlayer 합성 키(auto_2_5_a)도 물리 키와 같이 누르고 뗀다', () => {
    const state = new GearButtonState();
    state.press('auto_2_5_a');
    expect(state.phase).toBe('pressed');
    state.release('auto_2_5_a');
    expect(state.phase).toBe('releasing');
  });

  it('돌아오는 중(경과 48ms)에 다시 누르면 전환 없이 바로 pressed·경과 0이다', () => {
    const state = new GearButtonState();
    state.press('KeyD');
    state.release('KeyD');
    state.advance(16, RELEASE);
    state.advance(48, RELEASE);
    expect(state.releaseMs).toBe(48);
    expect(state.press('KeyD')).toBe(true);
    expect([state.phase, state.releaseMs]).toEqual(['pressed', 0]);
  });

  it('뗀 뒤 렌더 프레임 간격의 합이 150ms(16ms × 9 + 6ms)에 이르면 idle로 돌아가고, 그 뒤 advance는 아무것도 바꾸지 않는다', () => {
    const state = new GearButtonState();
    state.press('KeyD');
    state.release('KeyD');
    state.advance(16, RELEASE);
    for (let frame = 0; frame < 9; frame++) state.advance(16, RELEASE);
    expect([state.phase, state.releaseMs]).toEqual(['releasing', 144]);
    expect(state.advance(6, RELEASE)).toBe(true);
    expect(state.phase).toBe('idle');
    expect(state.advance(16, RELEASE)).toBe(false);
  });

  it('뗀 뒤 deltaMs 0·−5·NaN이면 경과가 나아가지 않는다(렌더 프레임 간격으로만 나아감)', () => {
    const state = new GearButtonState();
    state.press('KeyD');
    state.release('KeyD');
    state.advance(16, RELEASE);
    for (const delta of [0, -5, Number.NaN]) expect(state.advance(delta, RELEASE)).toBe(false);
    expect([state.phase, state.releaseMs]).toEqual(['releasing', 0]);
  });

  it('KeyD·KeyO 두 키로 금색이 된 뒤 모두 떼면 hold 수는 0이고 마지막 한 키의 연파랑 잔광을 보인다', () => {
    const state = new GearButtonState();
    state.press('KeyD');
    expect(state.press('KeyO')).toBe(true);
    expect([state.phase, state.color]).toEqual(['pressed', 'double']);
    state.release('KeyD');
    state.release('KeyO');
    expect([state.phase, state.color, state.heldKeys]).toEqual(['releasing', 'single', 0]);
  });

  it('이미 싱글로 눌린 버튼을 같은 키·같은 색으로 다시 누르면(키 반복) 바뀐 것이 없어 false', () => {
    const state = new GearButtonState();
    state.press('KeyD');
    expect(state.press('KeyD')).toBe(false);
  });

  it('KeyD·KeyO·KeyC는 3개→2개에서 금색을 유지하고, 2개→1개에서 연파랑으로 바뀌며 마지막 키의 잔광도 연파랑이다', () => {
    const state = new GearButtonState();
    state.press('KeyD');
    expect(state.color).toBe('single');
    state.press('KeyO');
    expect(state.color).toBe('double');
    state.press('KeyC');
    expect(state.release('KeyC')).toBe(false);
    expect(state).toMatchObject({ phase: 'pressed', color: 'double', heldKeys: 2 });
    expect(state.release('KeyD')).toBe(true);
    expect(state).toMatchObject({ phase: 'pressed', color: 'single', heldKeys: 1, releaseMs: 0 });
    expect(state.look(RELEASE, look())).toEqual({ glow: 1, tint: 0, cap: 0 });
    expect(state.release('KeyO')).toBe(true);
    expect(state).toMatchObject({ phase: 'releasing', color: 'single', heldKeys: 0 });
  });

  it('KeyD·KeyO 뒤 KeyO 중복 down은 hold 2개와 금색을 유지하고 KeyO를 떼면 hold 1개로 연파랑이다', () => {
    const state = new GearButtonState();
    state.press('KeyD');
    state.press('KeyO');
    expect(state.press('KeyO')).toBe(false);
    expect(state.heldKeys).toBe(2);
    expect(state.release('KeyO')).toBe(true);
    expect(state).toMatchObject({ phase: 'pressed', color: 'single', heldKeys: 1 });
  });
});

describe('GearButtonState — hold 수에 따른 두 단계 깊이', () => {
  it('첫 키는 즉시 15px이고 두 번째 키는 즉시 금색, 첫 프레임 뒤 60ms에 30px까지 들어간다', () => {
    const state = new GearButtonState();
    expect(state.pressDepth).toBe(0);
    state.press('D');
    expect(state.pressDepth).toBe(15);
    state.press('O');
    expect(state).toMatchObject({ pressDepth: 15, color: 'double' });
    state.advance(500, RELEASE);
    expect(state.pressDepth).toBe(15);
    state.advance(20, RELEASE);
    expect(state.pressDepth).toBeGreaterThan(15);
    expect(state.pressDepth).toBeLessThan(30);
    state.advance(40, RELEASE);
    expect(state.pressDepth).toBe(30);
    expect(state.advance(16, RELEASE)).toBe(false);
  });

  it.each(['D', 'O'])('두 키로 30px까지 누른 뒤 %s를 떼면 즉시 연파랑이고 40ms에 15px로 올라온다', (key) => {
    const state = new GearButtonState();
    state.press('D'); state.press('O');
    state.advance(16, RELEASE); state.advance(60, RELEASE);
    state.release(key);
    expect(state).toMatchObject({ pressDepth: 30, color: 'single', heldKeys: 1 });
    state.advance(16, RELEASE); state.advance(20, RELEASE);
    expect(state.pressDepth).toBeGreaterThan(15);
    expect(state.pressDepth).toBeLessThan(30);
    state.advance(20, RELEASE);
    expect(state).toMatchObject({ pressDepth: 15, phase: 'pressed' });
  });

  it('30px로 들어가는 도중 두 번째 키를 떼면 현재 깊이에서 돌아오고, 다시 누르면 현재 깊이에서 30px로 향한다', () => {
    const state = new GearButtonState();
    state.press('D'); state.press('O');
    state.advance(16, RELEASE); state.advance(20, RELEASE);
    const downDepth = state.pressDepth;
    state.release('O');
    expect(state.pressDepth).toBe(downDepth);
    state.advance(16, RELEASE); state.advance(10, RELEASE);
    const upDepth = state.pressDepth;
    expect(upDepth).toBeLessThan(downDepth);
    state.press('O');
    expect(state.pressDepth).toBe(upDepth);
    state.advance(16, RELEASE); state.advance(60, RELEASE);
    expect(state.pressDepth).toBe(30);
  });

  it('3번째 키·중복 down·3개→2개는 진행 중 60ms 전환을 다시 시작하지 않고 30px까지만 누른다', () => {
    const state = new GearButtonState();
    state.press('D'); state.press('O');
    state.advance(16, RELEASE); state.advance(20, RELEASE);
    state.press('E'); state.press('O'); state.release('E');
    state.advance(40, RELEASE);
    expect(state).toMatchObject({ pressDepth: 30, heldKeys: 2 });
  });

  it('깊이 전환 중 모두 떼면 현재 깊이에서 잔광 복귀하고, 새 첫 키는 즉시 15px로 누른다', () => {
    const state = new GearButtonState();
    state.press('D'); state.press('O');
    state.advance(16, RELEASE); state.advance(20, RELEASE);
    const depth = state.pressDepth;
    state.release('O'); state.release('D');
    state.advance(16, RELEASE);
    expect(state).toMatchObject({ pressDepth: depth, phase: 'releasing', heldKeys: 0 });
    state.press('D');
    expect(state).toMatchObject({ pressDepth: 15, phase: 'pressed', color: 'single' });
    state.release('D');
    state.advance(16, RELEASE); state.advance(150, RELEASE);
    expect(state).toMatchObject({ pressDepth: 0, phase: 'idle' });
  });
});

describe('GearButtons — 네 버튼의 Pixi 레이어', () => {
  const atlas = () => new Texture({ source: new TextureSource({ width: 816, height: 3072 }) });
  const holder = (buttons: GearButtons, lane: number) => buttons.container.children[lane - 1] as Container;
  const layers = (buttons: GearButtons, lane: number) => {
    const [tint, glow, cap] = holder(buttons, lane).children as Sprite[];
    return { tint, glow, cap };
  };

  it('만들면 버튼 4개(gear-button-1~4)가 각각 tint·glow·cap 순서로 있고 모두 숨겨져 있으며 tint만 더하기 블렌드(add)다', () => {
    const buttons = new GearButtons({ texture: atlas() });
    expect(buttons.container.label).toBe('gear-buttons');
    expect(buttons.container.children.map((child) => child.label)).toEqual(['gear-button-1', 'gear-button-2', 'gear-button-3', 'gear-button-4']);
    for (let lane = 1; lane <= 4; lane++) {
      expect(holder(buttons, lane).visible).toBe(false);
      expect(holder(buttons, lane).children.map((child) => child.label)).toEqual([`gear-button-${lane}-tint`, `gear-button-${lane}-glow`, `gear-button-${lane}-cap`]);
      const { tint, glow, cap } = layers(buttons, lane);
      expect([tint.blendMode, glow.blendMode, cap.blendMode]).toEqual(['add', 'inherit', 'inherit']);
    }
  });

  it('1번 버튼 glow는 기어 그림 (192, 1088)에 위치하고 아틀라스 (16, 16)의 192×272 frame을, cap은 (208, 1120)에 아틀라스 (16, 2896)의 160×160 frame을 쓴다', () => {
    const buttons = new GearButtons({ texture: atlas() });
    const { glow, cap } = layers(buttons, 1);
    expect([glow.x, glow.y]).toEqual([192, 1088]);
    expect([glow.texture.frame.x, glow.texture.frame.y, glow.texture.frame.width, glow.texture.frame.height]).toEqual([16, 16, 192, 272]);
    expect([cap.x, cap.y]).toEqual([208, 1120]);
    expect([cap.texture.frame.x, cap.texture.frame.y, cap.texture.frame.width, cap.texture.frame.height]).toEqual([16, 2896, 160, 160]);
  });

  it('레인 2 KeyD를 싱글로 누르면 버튼 2만 보이고 glow 알파 1, tint·cap은 숨긴다(다음 렌더 프레임에 바로 보임)', () => {
    const buttons = new GearButtons({ texture: atlas() });
    buttons.setKey(2, 'KeyD', true);
    expect([1, 2, 3, 4].map((lane) => holder(buttons, lane).visible)).toEqual([false, true, false, false]);
    const { tint, glow, cap } = layers(buttons, 2);
    expect([glow.visible, glow.alpha, tint.visible, cap.visible]).toEqual([true, 1, false, false]);
    expect(buttons.state(2)).toMatchObject({ phase: 'pressed', color: 'single', heldKeys: 1 });
  });

  it('누른 뒤 그리기 전에 떼면 첫 렌더 프레임은 tint·glow 알파 1·cap 숨김(경과 0)이고, 다음 렌더 프레임(16ms)에 cap 0.818·glow 0.552·tint 0.829가 된다', () => {
    const buttons = new GearButtons({ texture: atlas() });
    buttons.setKey(2, 'KeyD', true);
    buttons.setKey(2, 'KeyD', false);
    buttons.update(16);
    let { tint, glow, cap } = layers(buttons, 2);
    expect([tint.visible, tint.alpha, glow.visible, glow.alpha, cap.visible]).toEqual([true, 1, true, 1, false]);
    buttons.update(16);
    ({ tint, glow, cap } = layers(buttons, 2));
    expect(cap.visible).toBe(true);
    expect(cap.alpha).toBeCloseTo(0.818, 3);
    expect(glow.alpha).toBeCloseTo(0.5523, 3);
    expect(tint.alpha).toBeCloseTo(0.8292, 3);
  });

  it('뗀 뒤 렌더 프레임으로 150ms가 지나면 버튼 holder를 다시 숨기고 상태는 idle이다', () => {
    const buttons = new GearButtons({ texture: atlas() });
    buttons.setKey(3, 'KeyP', true);
    buttons.setKey(3, 'KeyP', false);
    buttons.update(16);
    for (let frame = 0; frame < 10; frame++) buttons.update(16);
    expect(holder(buttons, 3).visible).toBe(false);
    expect(buttons.state(3)?.phase).toBe('idle');
  });

  it('레인 1에 두 키를 누르면 같은 glow·tint 스프라이트가 금색 frame(y 1168·2608)으로 바뀌고 하나를 떼면 연파랑 frame으로 돌아온다', () => {
    const buttons = new GearButtons({ texture: atlas() });
    const before = layers(buttons, 1);
    buttons.setKey(1, 'KeyQ', true);
    buttons.setKey(1, 'KeyW', true);
    const after = layers(buttons, 1);
    expect(after.glow).toBe(before.glow);
    expect(after.glow.texture.frame.y).toBe(1168);
    expect(after.tint.texture.frame.y).toBe(2608);
    buttons.setKey(1, 'KeyW', false);
    expect(layers(buttons, 1).glow.texture.frame.y).toBe(16);
  });

  it('레인 2에 KeyD·KeyO를 누르면 hold 2개로 금색 frame(y 1040)이고 세 번째 KeyC도 금색을 유지한다', () => {
    const buttons = new GearButtons({ texture: atlas() });
    buttons.setKey(2, 'KeyD', true);
    expect(layers(buttons, 2).glow.texture.frame.y).toBe(16);
    buttons.setKey(2, 'KeyO', true);
    expect(layers(buttons, 2).glow.texture.frame.y).toBe(1040);
    buttons.setKey(2, 'KeyC', true);
    expect(layers(buttons, 2).glow.texture.frame.y).toBe(1040);
    expect(buttons.state(2)).toMatchObject({ phase: 'pressed', color: 'double', heldKeys: 3 });
  });

  it('두 번째 키의 60ms 눌림과 하나를 뗀 40ms 복귀는 같은 glow 스프라이트에서 깊이별 텍스처만 바꾼다', () => {
    const buttons = new GearButtons({ texture: atlas() });
    const glow = layers(buttons, 2).glow;
    const frames = GEAR_BUTTON_GEOMETRY.buttons[1].glow;
    buttons.setKey(2, 'D', true); buttons.setKey(2, 'O', true);
    expect(glow.texture.frame.y).toBe(frames.double[0].atlasY);
    buttons.update(16); buttons.update(20);
    expect(glow.texture.frame.y).not.toBe(frames.double[0].atlasY);
    expect(glow.texture.frame.y).not.toBe(frames.double[3].atlasY);
    buttons.update(40);
    expect(glow.texture.frame.y).toBe(frames.double[3].atlasY);
    buttons.setKey(2, 'O', false);
    expect(glow.texture.frame.y).toBe(frames.single[3].atlasY);
    buttons.update(16); buttons.update(40);
    expect(glow.texture.frame.y).toBe(frames.single[0].atlasY);
    expect(layers(buttons, 2).glow).toBe(glow);
    expect(holder(buttons, 2).children).toHaveLength(3);
  });

  it('KeyD·KeyO에서 KeyO만 떼면 다음 update 전부터 glow·tint가 연파랑 텍스처이고 눌림 밝기와 높이를 유지한다', () => {
    const buttons = new GearButtons({ texture: atlas() });
    buttons.setKey(2, 'KeyD', true);
    const { glow, tint, cap } = layers(buttons, 2);
    const singleGlow = glow.texture;
    const singleTint = tint.texture;
    buttons.setKey(2, 'KeyO', true);
    expect(glow.texture).not.toBe(singleGlow);
    expect(tint.texture).not.toBe(singleTint);
    buttons.update(16);
    buttons.setKey(2, 'KeyO', false);
    expect(glow.texture).toBe(singleGlow);
    expect(tint.texture).toBe(singleTint);
    expect([glow.visible, glow.alpha, tint.visible, cap.visible]).toEqual([true, 1, false, false]);
    expect(buttons.state(2)).toMatchObject({ phase: 'pressed', color: 'single', heldKeys: 1 });
  });

  it('범위 밖 레인 0·5의 입력은 무시하고 어떤 버튼도 보이지 않는다', () => {
    const buttons = new GearButtons({ texture: atlas() });
    buttons.setKey(0, 'KeyA', true);
    buttons.setKey(5, 'KeyA', true);
    expect([1, 2, 3, 4].map((lane) => holder(buttons, lane).visible)).toEqual([false, false, false, false]);
    expect(buttons.state(5)).toBeNull();
  });

  it('states는 렌더 프레임마다 같은 배열을 돌려준다(Lab·E2E가 읽어도 새 객체를 만들지 않음)', () => {
    const buttons = new GearButtons({ texture: atlas() });
    expect(buttons.states).toBe(buttons.states);
    expect(buttons.states.map((state) => state.phase)).toEqual(['idle', 'idle', 'idle', 'idle']);
  });

  it('destroy하면 컨테이너와 만든 frame 텍스처를 정리하고 받은 아틀라스 소스는 남기며, 두 번 불러도 되고 그 뒤 setKey·update는 무시한다', () => {
    const texture = atlas();
    const parent = new Container();
    const buttons = new GearButtons({ texture });
    parent.addChild(buttons.container);
    const glowTexture = layers(buttons, 1).glow.texture;
    buttons.destroy();
    buttons.destroy();
    expect(buttons.container.destroyed).toBe(true);
    expect(parent.children).toHaveLength(0);
    expect(glowTexture.destroyed).toBe(true);
    expect(texture.source.destroyed).toBe(false);
    expect(() => { buttons.setKey(1, 'KeyQ', true); buttons.update(16); }).not.toThrow();
    expect(buttons.state(1)?.phase).toBe('idle');
  });
});
