import { describe, expect, it } from 'vitest';
import { Container, Sprite, Texture, TextureSource } from 'pixi.js';
import {
  GEAR_BUTTON_COLORS,
  GEAR_BUTTON_GEOMETRY,
  GearButtonState,
  GearButtons,
  gearButtonPressColor,
  gearButtonReleaseLook,
  type GearButtonLook,
} from './gearButtons';

const RELEASE = GEAR_BUTTON_GEOMETRY.release;
const look = (): GearButtonLook => ({ tint: 0, glow: 0, cap: 0 });

describe('GEAR_BUTTON_GEOMETRY — 생성기(prepare-gear-buttons-v22.mjs)가 적은 기어 버튼 atlas frame', () => {
  it('네 버튼 모두 glow·tint의 싱글·더블과 cap atlas frame이 있고, 기어 그림 좌표·아틀라스 좌표·크기가 모두 16px 정렬이며 아틀라스 816×1344 안이다', () => {
    expect(GEAR_BUTTON_GEOMETRY.buttons).toHaveLength(4);
    expect([GEAR_BUTTON_GEOMETRY.atlasWidth, GEAR_BUTTON_GEOMETRY.atlasHeight]).toEqual([816, 1344]);
    for (const button of GEAR_BUTTON_GEOMETRY.buttons) {
      const frames = [...GEAR_BUTTON_COLORS.flatMap((color) => [button.glow[color], button.tint[color]]), button.cap];
      for (const frame of frames) {
        for (const value of [frame.x, frame.y, frame.width, frame.height, frame.atlasX, frame.atlasY]) expect(value % 16).toBe(0);
        expect(frame.atlasX + frame.width).toBeLessThanOrEqual(GEAR_BUTTON_GEOMETRY.atlasWidth);
        expect(frame.atlasY + frame.height).toBeLessThanOrEqual(GEAR_BUTTON_GEOMETRY.atlasHeight);
      }
    }
  });

  it('버튼은 왼쪽부터 레인 1~4 순서로 위치하고(1번 glow x 192, 4번 x 640), 키 덱 위끝(1088행)보다 위로 나가지 않는다', () => {
    const glowX = GEAR_BUTTON_GEOMETRY.buttons.map((button) => button.glow.single.x);
    expect(glowX).toEqual([192, 352, 496, 640]);
    for (const button of GEAR_BUTTON_GEOMETRY.buttons) expect(button.glow.single.y).toBeGreaterThanOrEqual(1088);
  });

  it('떼는 시간은 cap 40ms·흰빛 53ms·남는 빛 150ms이고, 곡선은 cap cubic-bezier(0.2, 0.6, 0.3, 1)·빛 ease-out(0, 0, 0.58, 1)이다', () => {
    expect(RELEASE).toEqual({ capMs: 40, whiteMs: 53, glowMs: 150, capEasing: [0.2, 0.6, 0.3, 1], glowEasing: [0, 0, 0.58, 1] });
  });

});

describe('gearButtonPressColor — 레인 키 누름의 빛 색(2026-10-14 결정)', () => {
  it('노트를 친 누름은 그 노트가 double·doubleLong이면 더블, single·trill·long·trillLong이면 싱글이다', () => {
    expect([gearButtonPressColor('double', 1), gearButtonPressColor('doubleLong', 1)]).toEqual(['double', 'double']);
    expect(['single', 'trill', 'long', 'trillLong'].map((type) => gearButtonPressColor(type as 'single', 1))).toEqual(['single', 'single', 'single', 'single']);
  });

  it('싱글 노트를 친 누름은 그 레인에 키 3개를 누르고 있어도 싱글이고, 더블 노트를 친 누름은 키 1개여도 더블이다(노트 종류가 정함)', () => {
    expect(gearButtonPressColor('single', 3)).toBe('single');
    expect(gearButtonPressColor('double', 1)).toBe('double');
  });

  it('공입력(친 노트 null)은 그 레인에 누르고 있는 키가 1개면 싱글, 2개·3개면 더블이다', () => {
    expect([1, 2, 3].map((held) => gearButtonPressColor(null, held))).toEqual(['single', 'double', 'double']);
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
    expect(state.press('KeyD', 'single')).toBe(true);
    expect([state.phase, state.color, state.heldKeys]).toEqual(['pressed', 'single', 1]);
    expect(state.look(RELEASE, look())).toEqual({ glow: 1, tint: 0, cap: 0 });
  });

  it('KeyD를 떼면 releasing이 되고, 뗀 뒤 첫 렌더 프레임(16ms)은 경과 0을 유지해 눌린 모습을 한 프레임 보이고 다음 프레임(16ms)부터 16ms로 나아간다', () => {
    const state = new GearButtonState();
    state.press('KeyD', 'single');
    expect(state.release('KeyD')).toBe(true);
    expect([state.phase, state.releaseMs]).toEqual(['releasing', 0]);
    expect(state.advance(16, RELEASE)).toBe(false);
    expect(state.releaseMs).toBe(0);
    expect(state.advance(16, RELEASE)).toBe(true);
    expect(state.releaseMs).toBe(16);
  });

  it('같은 레인에서 KeyD·KeyO를 누르고 KeyD만 떼면 pressed 그대로이고, KeyO까지 떼야 releasing이 된다', () => {
    const state = new GearButtonState();
    state.press('KeyD', 'single');
    state.press('KeyO', 'single');
    expect(state.release('KeyD')).toBe(false);
    expect([state.phase, state.heldKeys]).toEqual(['pressed', 1]);
    expect(state.release('KeyO')).toBe(true);
    expect([state.phase, state.heldKeys]).toEqual(['releasing', 0]);
  });

  it('누른 적 없는 키(KeyX)를 떼면 무시한다: 대기는 대기, 눌림은 눌림 그대로', () => {
    const state = new GearButtonState();
    expect(state.release('KeyX')).toBe(false);
    expect(state.phase).toBe('idle');
    state.press('KeyD', 'single');
    expect(state.release('KeyX')).toBe(false);
    expect(state.phase).toBe('pressed');
  });

  it('AutoPlayer 합성 키(auto_2_5_a)도 물리 키와 같이 누르고 뗀다', () => {
    const state = new GearButtonState();
    state.press('auto_2_5_a', 'single');
    expect(state.phase).toBe('pressed');
    state.release('auto_2_5_a');
    expect(state.phase).toBe('releasing');
  });

  it('돌아오는 중(경과 48ms)에 다시 누르면 전환 없이 바로 pressed·경과 0이다', () => {
    const state = new GearButtonState();
    state.press('KeyD', 'single');
    state.release('KeyD');
    state.advance(16, RELEASE);
    state.advance(48, RELEASE);
    expect(state.releaseMs).toBe(48);
    expect(state.press('KeyD', 'single')).toBe(true);
    expect([state.phase, state.releaseMs]).toEqual(['pressed', 0]);
  });

  it('뗀 뒤 렌더 프레임 간격의 합이 150ms(16ms × 9 + 6ms)에 이르면 idle로 돌아가고, 그 뒤 advance는 아무것도 바꾸지 않는다', () => {
    const state = new GearButtonState();
    state.press('KeyD', 'single');
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
    state.press('KeyD', 'single');
    state.release('KeyD');
    state.advance(16, RELEASE);
    for (const delta of [0, -5, Number.NaN]) expect(state.advance(delta, RELEASE)).toBe(false);
    expect([state.phase, state.releaseMs]).toEqual(['releasing', 0]);
  });

  it('싱글로 누른 채 더블로 다시 누르면 색만 바로 더블로 바뀌고, 떼는 동안에도 마지막 색(더블)을 유지한다', () => {
    const state = new GearButtonState();
    state.press('KeyD', 'single');
    expect(state.press('KeyO', 'double')).toBe(true);
    expect([state.phase, state.color]).toEqual(['pressed', 'double']);
    state.release('KeyD');
    state.release('KeyO');
    expect([state.phase, state.color]).toEqual(['releasing', 'double']);
  });

  it('이미 싱글로 눌린 버튼을 같은 키·같은 색으로 다시 누르면(키 반복) 바뀐 것이 없어 false', () => {
    const state = new GearButtonState();
    state.press('KeyD', 'single');
    expect(state.press('KeyD', 'single')).toBe(false);
  });

  it('색을 주지 않은 누름은 공입력 규칙이다: KeyD만 누르면 싱글, KeyD를 누른 채 KeyO를 누르면 더블, KeyD를 떼고 KeyO만 다시 누르면 싱글', () => {
    const state = new GearButtonState();
    state.press('KeyD');
    expect(state.color).toBe('single');
    state.press('KeyO');
    expect(state.color).toBe('double');
    state.release('KeyD');
    state.release('KeyO');
    state.press('KeyO');
    expect(state.color).toBe('single');
  });

  it('resolveColor: 마지막으로 누른 KeyO의 색은 싱글로 고치고, 그 전에 누른 KeyD의 색 알림은 버튼 색을 바꾸지 않는다', () => {
    const state = new GearButtonState();
    state.press('KeyD');
    state.press('KeyO');
    expect(state.color).toBe('double');
    expect(state.resolveColor('KeyD', 'single')).toBe(false);
    expect(state.color).toBe('double');
    expect(state.resolveColor('KeyO', 'single')).toBe(true);
    expect(state.color).toBe('single');
  });

  it('resolveColor: 한 프레임 안에 눌렀다 뗀 KeyD(돌아오는 중)도 색을 더블로 고치고, 대기로 돌아간 뒤의 알림은 무시한다', () => {
    const state = new GearButtonState();
    state.press('KeyD');
    state.release('KeyD');
    expect(state.resolveColor('KeyD', 'double')).toBe(true);
    expect([state.phase, state.color]).toEqual(['releasing', 'double']);
    state.advance(16, RELEASE);
    state.advance(150, RELEASE);
    expect(state.phase).toBe('idle');
    expect(state.resolveColor('KeyD', 'single')).toBe(false);
  });
});

describe('GearButtons — 네 버튼의 Pixi 레이어', () => {
  const atlas = () => new Texture({ source: new TextureSource({ width: 816, height: 1344 }) });
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

  it('1번 버튼 glow는 기어 그림 (192, 1088)에 위치하고 아틀라스 (16, 16)의 192×272 frame을, cap은 (208, 1120)에 아틀라스 (16, 1168)의 160×160 frame을 쓴다', () => {
    const buttons = new GearButtons({ texture: atlas() });
    const { glow, cap } = layers(buttons, 1);
    expect([glow.x, glow.y]).toEqual([192, 1088]);
    expect([glow.texture.frame.x, glow.texture.frame.y, glow.texture.frame.width, glow.texture.frame.height]).toEqual([16, 16, 192, 272]);
    expect([cap.x, cap.y]).toEqual([208, 1120]);
    expect([cap.texture.frame.x, cap.texture.frame.y, cap.texture.frame.width, cap.texture.frame.height]).toEqual([16, 1168, 160, 160]);
  });

  it('레인 2 KeyD를 싱글로 누르면 버튼 2만 보이고 glow 알파 1, tint·cap은 숨긴다(다음 렌더 프레임에 바로 보임)', () => {
    const buttons = new GearButtons({ texture: atlas() });
    buttons.setKey(2, 'KeyD', true, 'single');
    expect([1, 2, 3, 4].map((lane) => holder(buttons, lane).visible)).toEqual([false, true, false, false]);
    const { tint, glow, cap } = layers(buttons, 2);
    expect([glow.visible, glow.alpha, tint.visible, cap.visible]).toEqual([true, 1, false, false]);
    expect(buttons.state(2)).toMatchObject({ phase: 'pressed', color: 'single', heldKeys: 1 });
  });

  it('뗀 뒤 첫 렌더 프레임은 tint·glow 알파 1·cap 숨김(경과 0)이고, 다음 렌더 프레임(16ms)에 cap 0.818·glow 0.552·tint 0.829가 된다', () => {
    const buttons = new GearButtons({ texture: atlas() });
    buttons.setKey(2, 'KeyD', true, 'single');
    buttons.setKey(2, 'KeyD', false, 'single');
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
    buttons.setKey(3, 'KeyP', true, 'single');
    buttons.setKey(3, 'KeyP', false, 'single');
    buttons.update(16);
    for (let frame = 0; frame < 10; frame++) buttons.update(16);
    expect(holder(buttons, 3).visible).toBe(false);
    expect(buttons.state(3)?.phase).toBe('idle');
  });

  it('더블로 누르면 같은 glow·tint 스프라이트가 더블 frame(1번 glow 아틀라스 y 304·tint y 880)으로 텍스처만 바꾸고, 다시 싱글로 누르면 싱글 frame으로 돌아온다', () => {
    const buttons = new GearButtons({ texture: atlas() });
    const before = layers(buttons, 1);
    buttons.setKey(1, 'KeyQ', true, 'double');
    const after = layers(buttons, 1);
    expect(after.glow).toBe(before.glow);
    expect(after.glow.texture.frame.y).toBe(304);
    expect(after.tint.texture.frame.y).toBe(880);
    buttons.setKey(1, 'KeyW', true, 'single');
    expect(layers(buttons, 1).glow.texture.frame.y).toBe(16);
  });

  it('색을 주지 않고 레인 2에 KeyD·KeyO를 누르면 두 번째 누름에서 더블 frame(glow 아틀라스 y 272)으로 바뀌고, resolvePress(2, KeyO, 싱글)이면 싱글 frame(y 16)으로 돌아온다', () => {
    const buttons = new GearButtons({ texture: atlas() });
    buttons.setKey(2, 'KeyD', true);
    expect(layers(buttons, 2).glow.texture.frame.y).toBe(16);
    buttons.setKey(2, 'KeyO', true);
    expect(layers(buttons, 2).glow.texture.frame.y).toBe(272);
    buttons.resolvePress(2, 'KeyO', 'single');
    expect(layers(buttons, 2).glow.texture.frame.y).toBe(16);
    expect(buttons.state(2)).toMatchObject({ phase: 'pressed', color: 'single', heldKeys: 2 });
  });

  it('범위 밖 레인 0·5의 입력은 무시하고 어떤 버튼도 보이지 않는다', () => {
    const buttons = new GearButtons({ texture: atlas() });
    buttons.setKey(0, 'KeyA', true, 'single');
    buttons.setKey(5, 'KeyA', true, 'single');
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
    expect(() => { buttons.setKey(1, 'KeyQ', true, 'single'); buttons.update(16); }).not.toThrow();
    expect(buttons.state(1)?.phase).toBe('idle');
  });
});
