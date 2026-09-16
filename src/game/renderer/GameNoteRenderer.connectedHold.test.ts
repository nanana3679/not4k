import { describe, it, expect, vi, beforeEach } from "vitest";

// supabase mock — shared barrel에서 useAuth 재export 시 supabase client 초기화 방지
vi.mock("../../supabase/client", () => ({
  supabase: {},
}));

// PixiJS mock — GameNoteRenderer 내부에서 사용하는 최소한의 인터페이스만 모킹
vi.mock("pixi.js", () => {
  class Container {
    children: unknown[] = [];
    addChild(child: unknown) {
      this.children.push(child);
    }
  }
  class Graphics {
    x = 0;
    y = 0;
    clear() { return this; }
    rect() { return this; }
    fill() { return this; }
    poly() { return this; }
    roundRect() { return this; }
    stroke() { return this; }
  }
  class Sprite {
    x = 0;
    y = 0;
    tint = 0xffffff;
    alpha = 1;
    width = 0;
    height = 0;
    texture: unknown = null;
    scale = { x: 1, y: 1 };
    static from() { return new Sprite(); }
    constructor(tex?: unknown) { this.texture = tex ?? null; }
  }
  class NineSliceSprite {
    x = 0;
    y = 0;
    width = 0;
    height = 0;
    tint = 0xffffff;
    alpha = 1;
    texture: unknown;
    constructor(options: { texture: unknown }) { this.texture = options.texture; }
  }
  class FillGradient {
    constructor() {}
    destroy() {}
  }
  return { Container, Graphics, Sprite, NineSliceSprite, FillGradient };
});

import { Container } from "pixi.js";
import { GameNoteRenderer, type JudgmentBodyStateView, type JudgmentBodyUnitView } from "./GameNoteRenderer";
import type { SkinManager } from "../skin";
import type { NoteEntity } from "../../shared";
import { body, createHarness, down, up } from "../judgment/noteJudgmentTestHarness";
import { SessionRendererAdapter } from "../judgment/SessionRendererAdapter";

/**
 * 이어진 롱노트 held(불 들어옴) 전파 검증.
 *
 * 기하: judgmentLineY=500, scrollSpeed=1000, NOTE_HEIGHT=20.
 *   calculateNoteY(t, song) = 500 - (t - song)
 *   롱노트 머리가 판정선에 닿는(own held) 조건: 시작 시간 <= songTime
 * songTime=500을 쓰면 시작 0인 앞 롱노트만 own held이고, 시작 1000인 뒤 롱노트는 own held 아님.
 */

const SONG_TIME = 500;

function longNote(lane: 1 | 2 | 3 | 4): NoteEntity & { endBeat: unknown } {
  return { type: "long", lane, beat: 0, endBeat: 4 } as unknown as NoteEntity & { endBeat: unknown };
}

function createRenderer() {
  const bodyLayer = new Container();
  const endLayer = new Container();
  const headLayer = new Container();
  const noteLayer = new Container();
  const getTexture = vi.fn((key: string) => ({ key }));
  const skinManager = {
    getTexture,
    getHalfCapTexture: vi.fn(() => ({})),
    getTheme: vi.fn(() => ({ longNoteTerminalMode: "split-cap" })),
    hasTexture: vi.fn(() => false),
  } as unknown as SkinManager;

  const renderer = new GameNoteRenderer(
    bodyLayer,
    endLayer,
    headLayer,
    noteLayer,
    skinManager,
    500, // judgmentLineY
    1000, // scrollSpeed
    0, // laneAreaX
    600, // height
  );

  return { renderer, getTexture, bodyLayer, skinManager };
}

/** getTexture가 특정 texKey로 호출됐는지 */
function calledWithTex(getTexture: ReturnType<typeof vi.fn>, key: string): boolean {
  return getTexture.mock.calls.some((c) => c[0] === key);
}

describe("이어진 롱노트 held 전파", () => {
  let renderer: GameNoteRenderer;
  let getTexture: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const created = createRenderer();
    renderer = created.renderer;
    getTexture = created.getTexture as ReturnType<typeof vi.fn>;
  });

  it("o-o- 앞 롱노트가 held면 뒤 롱노트도 bodySingleHeld로 렌더된다", () => {
    // index 0 = 앞(0~1000), index 1 = 뒤(1000~2000), 같은 레인 → 연결
    renderer.setLongNoteConnections(
      new Map([[1, 0]]),
      new Map([[0, 0], [1, 1000]]),
    );
    // 뒤 롱노트(머리 아직 판정선 전)를 렌더
    renderer.renderLongNote(longNote(1), 1, 1000, 2000, SONG_TIME);

    expect(calledWithTex(getTexture, "bodySingleHeld")).toBe(true);
    expect(calledWithTex(getTexture, "bodySingle")).toBe(false);
  });

  it("연결 정보가 없으면 뒤 롱노트는 아직 머리가 판정선 전이라 bodySingle", () => {
    // 연결 설정 안 함 — o- o- 처럼 이어지지 않은 경우와 동일
    renderer.renderLongNote(longNote(1), 1, 1000, 2000, SONG_TIME);

    expect(calledWithTex(getTexture, "bodySingle")).toBe(true);
    expect(calledWithTex(getTexture, "bodySingleHeld")).toBe(false);
  });

  it("앞 롱노트가 miss면 연속 홀드가 끊겨 뒤 롱노트로 불이 전파되지 않는다", () => {
    renderer.setLongNoteConnections(
      new Map([[1, 0]]),
      new Map([[0, 0], [1, 1000]]),
    );
    renderer.applyNoteDisplayEffect(0, { body: null, visibility: 'missed' }); // 앞 롱노트 miss

    renderer.renderLongNote(longNote(1), 1, 1000, 2000, SONG_TIME);

    expect(calledWithTex(getTexture, "bodySingle")).toBe(true);
    expect(calledWithTex(getTexture, "bodySingleHeld")).toBe(false);
  });

  it("o-o-o- 3연쇄에서 맨 앞이 held면 세 번째 롱노트까지 bodySingleHeld", () => {
    // 0:(0~1000) 1:(1000~2000) 2:(2000~3000)
    renderer.setLongNoteConnections(
      new Map([[1, 0], [2, 1]]),
      new Map([[0, 0], [1, 1000], [2, 2000]]),
    );
    // songTime=1500: 세 번째 롱노트(시작 2000)는 머리가 아직 판정선 전이지만 화면에 보임
    renderer.renderLongNote(longNote(1), 2, 2000, 3000, 1500);

    expect(calledWithTex(getTexture, "bodySingleHeld")).toBe(true);
    expect(calledWithTex(getTexture, "bodySingle")).toBe(false);
  });
});

function unit(unitIndex = 0, overrides: Partial<JudgmentBodyUnitView> = {}): JudgmentBodyUnitView {
  return { unitIndex, active: false, failed: false, complete: false, registeredKeys: [], ...overrides };
}

function heldUnit(unitIndex = 0): JudgmentBodyUnitView {
  return unit(unitIndex, { active: true, registeredKeys: [`Key${unitIndex}`] });
}

function connectStates(renderer: GameNoteRenderer, states: JudgmentBodyStateView[], trillLongIndices: ReadonlySet<number> = new Set()) {
  renderer.setLongNoteConnections(
    new Map(states.slice(1).map((_, index) => [index + 1, index])),
    new Map(states.map((_, index) => [index, index * 200])),
    trillLongIndices,
  );
  renderer.setJudgmentBodyStateQuery(index => states[index] ?? null);
}

describe("판정 상태 조회를 사용하는 연결 롱노트 표시", () => {
  it.each([
    ["long", "bodySingleHeld", "terminalSingle"],
    ["doubleLong", "bodyDoubleHeld", "terminalDouble"],
  ] as const)("%s의 첫 구간을 유지하면 시작 전인 세 번째 구간도 %s와 %s로 켜진다", (type, bodyKey, terminalKey) => {
    const { renderer, getTexture, skinManager } = createRenderer();
    vi.mocked(skinManager.hasTexture).mockReturnValue(true);
    const units = type === "doubleLong" ? [unit(), unit(1)] : [unit()];
    connectStates(renderer, [
      { units: units.map(u => heldUnit(u.unitIndex)), successorIndex: 1 },
      { units, successorIndex: 2 },
      { units },
    ]);

    renderer.renderLongNote(body(400, 600, type), 2, 400, 600, 100);

    expect(calledWithTex(getTexture, bodyKey)).toBe(true);
    expect(skinManager.getHalfCapTexture).toHaveBeenCalledWith(terminalKey);
  });

  it('트릴 3연결에서 첫 구간을 유지해도 두 번째·세 번째 바디와 터미널은 대기하고 각 구간의 실제 홀드만 켠다', () => {
    const { renderer, getTexture, bodyLayer, skinManager } = createRenderer();
    vi.mocked(skinManager.hasTexture).mockReturnValue(true);
    const states = [
      { units: [heldUnit()], successorIndex: 1 },
      { units: [unit()], successorIndex: 2 },
      { units: [unit()] },
    ];
    connectStates(renderer, states, new Set([0, 1, 2]));
    const lastTexture = () => (bodyLayer.children.at(-1) as unknown as { texture: { key: string } }).texture.key;
    for (const index of [1, 2]) {
      renderer.renderLongNote(body(index * 200, index * 200 + 200, 'trillLong'), index, index * 200, index * 200 + 200, 100);
      expect(lastTexture()).toBe('bodyTrill');
    }
    expect(calledWithTex(getTexture, 'terminalTrillIdle')).toBe(true);
    expect(calledWithTex(getTexture, 'bodyTrillHeld')).toBe(false);

    states[1].units = [heldUnit()];
    renderer.renderLongNote(body(200, 400, 'trillLong'), 1, 200, 400, 200);
    expect(lastTexture()).toBe('bodyTrillHeld');
    renderer.renderLongNote(body(400, 600, 'trillLong'), 2, 400, 600, 200);
    expect(lastTexture()).toBe('bodyTrill');
  });

  it('판정 조회가 없는 트릴도 앞 구간이 판정선에 도달했다는 이유로 다음 구간을 켜지 않는다', () => {
    const { renderer, getTexture } = createRenderer();
    renderer.setLongNoteConnections(new Map([[1, 0]]), new Map([[0, 0], [1, 200]]), new Set([0, 1]));
    renderer.renderLongNote(body(200, 400, 'trillLong'), 1, 200, 400, 100);
    expect(calledWithTex(getTexture, 'bodyTrill')).toBe(true);
    expect(calledWithTex(getTexture, 'bodyTrillHeld')).toBe(false);
  });

  it.each([false, true])('중간 트릴의 실제 홀드가 %s여도 앞 싱글의 켜짐을 트릴 너머 싱글에 전파하지 않는다', active => {
    const { renderer, getTexture } = createRenderer();
    connectStates(renderer, [
      { units: [heldUnit()], successorIndex: 1 },
      { units: [active ? heldUnit() : unit()], successorIndex: 2 },
      { units: [unit()] },
    ], new Set([1]));
    renderer.renderLongNote(body(400, 600), 2, 400, 600, 300);
    expect(calledWithTex(getTexture, 'bodySingle')).toBe(true);
    expect(calledWithTex(getTexture, 'bodySingleHeld')).toBe(false);
  });

  it.each([
    ["입력 전", unit()],
    ["등록 키를 놓친 상태", unit(0, { active: true })],
    ["실패", unit(0, { active: true, failed: true })],
    ["완료", unit(0, { active: true, complete: true, registeredKeys: ["KeyF"] })],
  ])("선행 구간이 %s이면 시작 시각을 지났어도 후속 바디는 대기 상태다", (_, predecessor) => {
    const { renderer, getTexture } = createRenderer();
    connectStates(renderer, [
      { units: [predecessor], successorIndex: 1 },
      { units: [unit()] },
    ]);

    renderer.renderLongNote(body(200, 400), 1, 200, 400, 100);

    expect(calledWithTex(getTexture, "bodySingle")).toBe(true);
    expect(calledWithTex(getTexture, "bodySingleHeld")).toBe(false);
  });

  it("첫 구간이 켜져 있어도 중간 구간이 실패하면 세 번째 구간으로 전파하지 않는다", () => {
    const { renderer, getTexture } = createRenderer();
    connectStates(renderer, [
      { units: [heldUnit()], successorIndex: 1 },
      { units: [unit(0, { failed: true })], successorIndex: 2 },
      { units: [unit()] },
    ]);

    renderer.renderLongNote(body(400, 600), 2, 400, 600, 100);

    expect(calledWithTex(getTexture, "bodySingle")).toBe(true);
    expect(calledWithTex(getTexture, "bodySingleHeld")).toBe(false);
  });

  it("첫 구간이 실패해도 두 번째 구간을 새로 유지하면 세 번째 구간이 켜진다", () => {
    const { renderer, getTexture } = createRenderer();
    connectStates(renderer, [
      { units: [unit(0, { failed: true })], successorIndex: 1 },
      { units: [heldUnit()], successorIndex: 2 },
      { units: [unit()] },
    ]);

    renderer.renderLongNote(body(400, 600), 2, 400, 600, 300);

    expect(calledWithTex(getTexture, "bodySingleHeld")).toBe(true);
  });

  it("실제 판정 세션에 다음 구간 연결이 없으면 차트 표시 연결만으로 켜지 않는다", () => {
    const { renderer, getTexture } = createRenderer();
    connectStates(renderer, [{ units: [heldUnit()] }, { units: [unit()] }]);

    renderer.renderLongNote(body(200, 400), 1, 200, 400, 100);

    expect(calledWithTex(getTexture, "bodySingle")).toBe(true);
  });

  it("더블 2개 유지→싱글→더블 연결은 마지막 더블을 1/2만 켠다", () => {
    const { renderer, getTexture } = createRenderer();
    connectStates(renderer, [
      { units: [heldUnit(), heldUnit(1)], successorIndex: 1 },
      { units: [unit()], successorIndex: 2 },
      { units: [unit(), unit(1)] },
    ]);

    renderer.renderLongNote(body(400, 600, "doubleLong"), 2, 400, 600, 100);

    expect(calledWithTex(getTexture, "bodyDoublePartialHeldLeft")).toBe(true);
    expect(calledWithTex(getTexture, "bodyDoubleHeld")).toBe(false);
  });

  it("더블의 한 unit이 실패해도 건강한 1개 유지 표시는 다음 더블에 1/2로 이어진다", () => {
    const { renderer, getTexture } = createRenderer();
    connectStates(renderer, [
      { units: [unit(0, { active: true, failed: true }), heldUnit(1)], successorIndex: 1 },
      { units: [unit(), unit(1)] },
    ]);

    renderer.renderLongNote(body(200, 400, "doubleLong"), 1, 200, 400, 100);

    expect(calledWithTex(getTexture, "bodyDoublePartialHeldLeft")).toBe(true);
    expect(calledWithTex(getTexture, "bodyDoubleFailed")).toBe(false);
  });

  it("0~1000ms 실제 홀드가 후속 바디를 켜고 500ms 중간 해제 뒤 끄며 후속 판정 unit은 활성화하지 않는다", () => {
    const { renderer, bodyLayer } = createRenderer();
    const notes = [body(0, 1000), body(1000, 2000)];
    const h = createHarness(notes);
    renderer.setLongNoteConnections(new Map([[1, 0]]), new Map([[0, 0], [1, 1000]]));
    new SessionRendererAdapter({
      notes, connections: h.compiled.connections, bodyStates: () => h.core.bodyStates,
      scoreAccuracy: () => h.score.getState().achievementRate,
      port: {
        showJudgment: vi.fn(), recordPerspectiveSurfaceJudgment: vi.fn(), showBombEffect: vi.fn(),
        updateCombo: vi.fn(), updateAccuracy: vi.fn(), applyNoteDisplayEffect: vi.fn(),
        setJudgmentBodyStateQuery: query => renderer.setJudgmentBodyStateQuery(query),
      },
    });
    const textureKey = () => (bodyLayer.children.at(-1) as unknown as { texture: { key: string } }).texture.key;
    h.at(0, down("A"));
    const beforeRender = h.core.bodyStates;
    renderer.renderLongNote(notes[1], 1, 1000, 2000, 500);
    expect(textureKey()).toBe("bodySingleHeld");
    expect(h.core.bodyStates).toEqual(beforeRender);
    expect(h.core.bodyStates.find(u => u.noteIndex === 1)?.active).toBe(false);

    h.at(500, up("A"));
    h.at(700);
    renderer.renderLongNote(notes[1], 1, 1000, 2000, 700);
    expect(textureKey()).toBe("bodySingle");
  });
});
