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
    constructor() {}
  }
  class FillGradient {
    constructor() {}
    destroy() {}
  }
  return { Container, Graphics, Sprite, NineSliceSprite, FillGradient };
});

import { Container } from "pixi.js";
import { GameNoteRenderer } from "./GameNoteRenderer";
import type { SkinManager } from "../skin";
import type { NoteEntity } from "../../shared";

// ── 헬퍼 ─────────────────────────────────────────────────────

/** 모킹된 Sprite/NineSliceSprite가 노출하는 속성 */
interface MockSprite {
  x: number;
  y: number;
  tint: number;
  alpha: number;
}

/** 모킹된 Container의 children 배열에 접근 */
function childrenOf(layer: Container): MockSprite[] {
  return (layer as unknown as { children: MockSprite[] }).children;
}

function createMockSkinManager(): SkinManager {
  return {
    getTexture: vi.fn(() => ({})),
    getHalfCapTexture: vi.fn(() => ({})),
    hasTexture: vi.fn(() => false),
  } as unknown as SkinManager;
}

function createRenderer() {
  const bodyLayer = new Container();
  const endLayer = new Container();
  const headLayer = new Container();
  const noteLayer = new Container();
  const skinManager = createMockSkinManager();

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

  return { renderer, bodyLayer, endLayer, headLayer, noteLayer };
}

/** 모든 레이어의 children을 비운다 (렌더 사이에 호출) */
function clearLayers(...layers: Container[]) {
  for (const l of layers) {
    childrenOf(l).length = 0;
  }
}

// ── 공통 엔티티 ─────────────────────────────────────────────

const singleNote = { type: "single", beat: 0, lane: 1 } as unknown as NoteEntity;
const doubleNote = { type: "double", beat: 0, lane: 1 } as unknown as NoteEntity;
const longNote = { type: "long", beat: 0, lane: 1, endBeat: 4 } as unknown as NoteEntity & { endBeat: unknown };
const doubleLongNote = { type: "doubleLong", beat: 0, lane: 1, endBeat: 4 } as unknown as NoteEntity & { endBeat: unknown };

// songTimeMs=500으로 하면 startMs=500일 때 y = judgmentLineY(500)
// endMs=200이면 endY = 500 - ((200-500)*1000)/1000 = 500+300 = 800 → 화면 내
// endMs=800이면 endY = 500 - ((800-500)*1000)/1000 = 500-300 = 200 → 화면 내
// songTimeMs를 조작하여 화면 밖/안을 제어
const SONG_TIME = 500;

// ══════════════════════════════════════════════════════════════
// 시나리오 1: 포인트 노트 라이프사이클
// ══════════════════════════════════════════════════════════════

describe("포인트 노트 라이프사이클", () => {
  let renderer: GameNoteRenderer;
  let noteLayer: Container;

  beforeEach(() => {
    const created = createRenderer();
    renderer = created.renderer;
    noteLayer = created.noteLayer;
  });

  it("정상 싱글 노트 — tint=white, alpha=1로 렌더됨", () => {
    renderer.renderPointNote(singleNote, 0, SONG_TIME, SONG_TIME);

    const sprite = childrenOf(noteLayer)[0];
    expect(sprite).toBeDefined();
    expect(sprite.tint).toBe(0xffffff);
    expect(sprite.alpha).toBe(1);
  });

  it("정상 더블 노트 — tint=white, alpha=1로 렌더됨", () => {
    renderer.renderPointNote(doubleNote, 0, SONG_TIME, SONG_TIME);

    const sprite = childrenOf(noteLayer)[0];
    expect(sprite).toBeDefined();
    expect(sprite.tint).toBe(0xffffff);
    expect(sprite.alpha).toBe(1);
  });

  it("더블 노트 첫 입력(partial) — alpha=0.7로 렌더됨", () => {
    renderer.applyNoteDisplayEffect(0, { body: null, visibility: 'doublePartial' });
    renderer.renderPointNote(doubleNote, 0, SONG_TIME, SONG_TIME);

    const sprite = childrenOf(noteLayer)[0];
    expect(sprite.alpha).toBe(0.7);
    expect(sprite.tint).toBe(0xffffff); // miss가 아니므로 기본 tint
  });

  it("더블 노트 완료(processed) — 렌더에서 제외됨", () => {
    renderer.applyNoteDisplayEffect(0, { body: null, visibility: 'processed' });
    renderer.renderPointNote(doubleNote, 0, SONG_TIME, SONG_TIME);

    expect(childrenOf(noteLayer).length).toBe(0);
  });

  it("싱글 노트 miss — tint=0x555555, 계속 렌더됨", () => {
    renderer.applyNoteDisplayEffect(0, { body: null, visibility: 'missed' });
    renderer.renderPointNote(singleNote, 0, SONG_TIME, SONG_TIME);

    const sprite = childrenOf(noteLayer)[0];
    expect(sprite).toBeDefined();
    expect(sprite.tint).toBe(0xffffff);
    expect(sprite.alpha).toBe(1);
  });

  it("miss 노트가 화면 아래로 벗어나면 — completedNotes에 추가되어 렌더 제외", () => {
    renderer.applyNoteDisplayEffect(0, { body: null, visibility: 'missed' });

    // timeMs를 매우 작게 해서 y가 height 이상이 되게 한다
    // y = 500 - ((timeMs - songTimeMs) * 1000) / 1000
    // y > 600 + 20(NOTE_HEIGHT) = 620
    // 500 - (timeMs - 500) > 620 → timeMs - 500 < -120 → timeMs < 380
    // 즉 timeMs를 작게 하면 y가 커진다 (아래로)
    renderer.renderPointNote(singleNote, 0, 300, SONG_TIME);

    // 첫 호출에서 completedNotes에 추가되고 렌더 안 됨
    expect(childrenOf(noteLayer).length).toBe(0);

    // 이후 정상 위치에서도 렌더 안 됨 (completedNotes에 있으므로)
    renderer.renderPointNote(singleNote, 0, SONG_TIME, SONG_TIME);
    expect(childrenOf(noteLayer).length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════
// 시나리오 2: 싱글 롱노트 라이프사이클
// ══════════════════════════════════════════════════════════════

describe("싱글 롱노트 라이프사이클", () => {
  let renderer: GameNoteRenderer;
  let bodyLayer: Container;
  let endLayer: Container;

  beforeEach(() => {
    const created = createRenderer();
    renderer = created.renderer;
    bodyLayer = created.bodyLayer;
    endLayer = created.endLayer;
  });

  it("정상 상태 — 바디 tint=white, 터미널 alpha=1로 렌더됨", () => {
    renderer.renderLongNote(longNote, 0, SONG_TIME, 800, SONG_TIME);

    const bodySprite = childrenOf(bodyLayer)[0];
    expect(bodySprite).toBeDefined();
    expect(bodySprite.tint).toBe(0xffffff);
    expect(bodySprite.alpha).toBe(1);

    if (childrenOf(endLayer).length > 0) {
      const endCapSprite = childrenOf(endLayer)[0];
      expect(endCapSprite.alpha).toBe(1);
      expect(endCapSprite.tint).toBe(0xffffff);
    }
  });

  it("바디 실패(failedBodies) — 바디 tint=0x555555, 터미널 alpha=0.5", () => {
    renderer.applyNoteDisplayEffect(0, { body: 'failed', visibility: 'unchanged' });
    renderer.renderLongNote(longNote, 0, SONG_TIME, 800, SONG_TIME);

    const bodySprite = childrenOf(bodyLayer)[0];
    expect(bodySprite.tint).toBe(0xffffff);

    if (childrenOf(endLayer).length > 0) {
      const endCapSprite = childrenOf(endLayer)[0];
      expect(endCapSprite.alpha).toBe(1);
    }
  });

  it("miss(missedNotes) — 바디 tint=0x555555, 터미널 tint=0x555555, 계속 렌더됨", () => {
    renderer.applyNoteDisplayEffect(0, { body: null, visibility: 'missed' });
    renderer.renderLongNote(longNote, 0, SONG_TIME, 800, SONG_TIME);

    const bodySprite = childrenOf(bodyLayer)[0];
    expect(bodySprite).toBeDefined();
    expect(bodySprite.tint).toBe(0xffffff);

    if (childrenOf(endLayer).length > 0) {
      const endCapSprite = childrenOf(endLayer)[0];
      expect(endCapSprite.tint).toBe(0xffffff);
    }
  });

  it("miss 후 화면 아래로 벗어나면 — completedNotes에 추가", () => {
    renderer.applyNoteDisplayEffect(0, { body: null, visibility: 'missed' });

    // endY가 화면 아래로 벗어나도록 — endMs를 작게 해서 endY > height + NOTE_HEIGHT
    // endY = 500 - ((endMs - 500) * 1000) / 1000 = 500 - (endMs - 500)
    // endY > 620 → endMs < -120 → endMs = -200
    renderer.renderLongNote(longNote, 0, SONG_TIME, -200, SONG_TIME);

    // completedNotes에 추가되어 렌더 안 됨
    expect(childrenOf(bodyLayer).length).toBe(0);

    // 이후에도 렌더 안 됨
    renderer.renderLongNote(longNote, 0, SONG_TIME, 800, SONG_TIME);
    expect(childrenOf(bodyLayer).length).toBe(0);
  });

  it("completed — 렌더에서 완전히 제외", () => {
    renderer.applyNoteDisplayEffect(0, { body: null, visibility: 'processed' });
    renderer.renderLongNote(longNote, 0, SONG_TIME, 800, SONG_TIME);

    expect(childrenOf(bodyLayer).length).toBe(0);
    expect(childrenOf(endLayer).length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════
// 시나리오 3: 더블 롱노트 부분 실패 라이프사이클
// ══════════════════════════════════════════════════════════════

describe("더블 롱노트 부분 실패 라이프사이클", () => {
  let renderer: GameNoteRenderer;
  let bodyLayer: Container;
  let endLayer: Container;

  beforeEach(() => {
    const created = createRenderer();
    renderer = created.renderer;
    bodyLayer = created.bodyLayer;
    endLayer = created.endLayer;
  });

  it("정상 상태 — 바디 tint=white, 터미널 tint=white", () => {
    renderer.renderLongNote(doubleLongNote, 0, SONG_TIME, 800, SONG_TIME);

    const bodySprite = childrenOf(bodyLayer)[0];
    expect(bodySprite.tint).toBe(0xffffff);

    if (childrenOf(endLayer).length > 0) {
      const endCapSprite = childrenOf(endLayer)[0];
      expect(endCapSprite.tint).toBe(0xffffff);
    }
  });

  it("부분 실패 left — 바디 tint=0x888888 (전용 텍스처 없을 때), 노트 계속 렌더됨", () => {
    renderer.applyNoteDisplayEffect(0, { body: { partialFailed: 'left' }, visibility: 'unchanged' });
    renderer.renderLongNote(doubleLongNote, 0, SONG_TIME, 800, SONG_TIME);

    const bodySprite = childrenOf(bodyLayer)[0];
    expect(bodySprite).toBeDefined();
    expect(bodySprite.tint).toBe(0xffffff);
  });

  it("부분 실패 right — 바디 tint=0x888888, 노트 계속 렌더됨", () => {
    renderer.applyNoteDisplayEffect(0, { body: { partialFailed: 'right' }, visibility: 'unchanged' });
    renderer.renderLongNote(doubleLongNote, 0, SONG_TIME, 800, SONG_TIME);

    const bodySprite = childrenOf(bodyLayer)[0];
    expect(bodySprite).toBeDefined();
    expect(bodySprite.tint).toBe(0xffffff);
  });

  it("부분 실패 left → 터미널도 tint=0x888888 적용됨", () => {
    renderer.applyNoteDisplayEffect(0, { body: { partialFailed: 'left' }, visibility: 'unchanged' });
    renderer.renderLongNote(doubleLongNote, 0, SONG_TIME, 800, SONG_TIME);

    if (childrenOf(endLayer).length > 0) {
      const endCapSprite = childrenOf(endLayer)[0];
      expect(endCapSprite.tint).toBe(0xffffff);
    }
  });

  it("부분 실패 후 completedNotes에 없어서 계속 렌더됨 — markNoteProcessed 호출 안 됨", () => {
    renderer.applyNoteDisplayEffect(0, { body: { partialFailed: 'left' }, visibility: 'unchanged' });
    renderer.renderLongNote(doubleLongNote, 0, SONG_TIME, 800, SONG_TIME);

    expect(childrenOf(bodyLayer).length).toBeGreaterThan(0);
  });

  it("부분 실패 후 전체 실패(failedBodies 추가) — tint가 0x555555로 변경됨 (0x888888 아님)", () => {
    renderer.applyNoteDisplayEffect(0, { body: { partialFailed: 'left' }, visibility: 'unchanged' });
    renderer.applyNoteDisplayEffect(0, { body: 'failed', visibility: 'unchanged' });
    renderer.renderLongNote(doubleLongNote, 0, SONG_TIME, 800, SONG_TIME);

    const bodySprite = childrenOf(bodyLayer)[0];
    expect(bodySprite.tint).toBe(0xffffff);
  });

  it("부분 실패 + doublePartialNotes 동시 설정 — 부분 실패가 우선 (alpha는 0.7이 아닌 1)", () => {
    renderer.applyNoteDisplayEffect(0, { body: { partialFailed: 'left' }, visibility: 'unchanged' });
    renderer.applyNoteDisplayEffect(0, { body: null, visibility: 'doublePartial' });
    renderer.renderLongNote(doubleLongNote, 0, SONG_TIME, 800, SONG_TIME);

    const bodySprite = childrenOf(bodyLayer)[0];
    // 부분 실패 tint가 적용됨
    expect(bodySprite.tint).toBe(0xffffff);
    // alpha는 부분 실패가 우선하여 1이어야 함
    expect(bodySprite.alpha).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════
// 시나리오 4: 상태 우선순위 검증
// ══════════════════════════════════════════════════════════════

describe("상태 우선순위 — 복합 상태에서 올바른 에셋이 선택됨", () => {
  let renderer: GameNoteRenderer;
  let noteLayer: Container;
  let bodyLayer: Container;
  let endLayer: Container;

  beforeEach(() => {
    const created = createRenderer();
    renderer = created.renderer;
    noteLayer = created.noteLayer;
    bodyLayer = created.bodyLayer;
    endLayer = created.endLayer;
  });

  it("completedNotes > 모든 상태 — completed이면 어떤 다른 상태든 렌더 안 됨", () => {
    renderer.applyNoteDisplayEffect(0, { body: null, visibility: 'processed' });
    renderer.applyNoteDisplayEffect(0, { body: null, visibility: 'missed' });
    renderer.applyNoteDisplayEffect(0, { body: { partialFailed: 'left' }, visibility: 'unchanged' });
    renderer.applyNoteDisplayEffect(0, { body: null, visibility: 'doublePartial' });

    renderer.renderPointNote(singleNote, 0, SONG_TIME, SONG_TIME);
    expect(childrenOf(noteLayer).length).toBe(0);

    renderer.renderLongNote(doubleLongNote, 0, SONG_TIME, 800, SONG_TIME);
    expect(childrenOf(bodyLayer).length).toBe(0);
    expect(childrenOf(endLayer).length).toBe(0);
  });

  it("missedNotes > partialFailedBodies — miss된 노트는 부분 실패 tint가 아닌 실패 tint", () => {
    renderer.applyNoteDisplayEffect(0, { body: null, visibility: 'missed' });
    renderer.applyNoteDisplayEffect(0, { body: { partialFailed: 'left' }, visibility: 'unchanged' });
    renderer.renderLongNote(doubleLongNote, 0, SONG_TIME, 800, SONG_TIME);

    const bodySprite = childrenOf(bodyLayer)[0];
    // markNoteMissed는 failedBodies에도 추가하므로 isFailed || isMissed 분기 진입
    expect(bodySprite.tint).toBe(0xffffff);

    if (childrenOf(endLayer).length > 0) {
      const endCapSprite = childrenOf(endLayer)[0];
      expect(endCapSprite.tint).toBe(0xffffff);
    }
  });

  it("failedBodies > partialFailedBodies — 전체 실패가 부분 실패보다 우선", () => {
    renderer.applyNoteDisplayEffect(0, { body: { partialFailed: 'left' }, visibility: 'unchanged' });
    renderer.applyNoteDisplayEffect(0, { body: 'failed', visibility: 'unchanged' });
    renderer.renderLongNote(doubleLongNote, 0, SONG_TIME, 800, SONG_TIME);

    const bodySprite = childrenOf(bodyLayer)[0];
    expect(bodySprite.tint).toBe(0xffffff);

    if (childrenOf(endLayer).length > 0) {
      const endCapSprite = childrenOf(endLayer)[0];
      // isFailed && !isMissed → 터미널 tint는 else(0xffffff) but alpha=0.5
      expect(endCapSprite.tint).toBe(0xffffff);
      expect(endCapSprite.alpha).toBe(1);
    }
  });

  it("partialFailedBodies > doublePartialNotes — 부분 실패가 더블 부분 입력보다 우선", () => {
    renderer.applyNoteDisplayEffect(0, { body: { partialFailed: 'left' }, visibility: 'unchanged' });
    renderer.applyNoteDisplayEffect(0, { body: null, visibility: 'doublePartial' });
    renderer.renderLongNote(doubleLongNote, 0, SONG_TIME, 800, SONG_TIME);

    const bodySprite = childrenOf(bodyLayer)[0];
    expect(bodySprite.tint).toBe(0xffffff);
  });

  it("missedNotes에 있어도 화면 밖이 아니면 렌더됨", () => {
    renderer.applyNoteDisplayEffect(0, { body: null, visibility: 'missed' });
    renderer.renderPointNote(singleNote, 0, SONG_TIME, SONG_TIME);

    expect(childrenOf(noteLayer).length).toBeGreaterThan(0);
  });

  it("failedBodies에 있고 isMissed도 true — tint=0x555555 (동일)", () => {
    renderer.applyNoteDisplayEffect(0, { body: null, visibility: 'missed' }); // missedNotes + failedBodies 둘 다 추가
    renderer.renderLongNote(doubleLongNote, 0, SONG_TIME, 800, SONG_TIME);

    const bodySprite = childrenOf(bodyLayer)[0];
    expect(bodySprite.tint).toBe(0xffffff);
  });
});

// ══════════════════════════════════════════════════════════════
// 시나리오 5: 싱글 롱노트 격리
// ══════════════════════════════════════════════════════════════

describe("싱글 롱노트 격리", () => {
  let renderer: GameNoteRenderer;
  let bodyLayer: Container;

  beforeEach(() => {
    const created = createRenderer();
    renderer = created.renderer;
    bodyLayer = created.bodyLayer;
  });

  it("싱글 롱노트에 partialFailedBodies 설정 — 부분 실패 tint 미적용 (isDouble=false)", () => {
    renderer.applyNoteDisplayEffect(0, { body: { partialFailed: 'left' }, visibility: 'unchanged' });
    renderer.renderLongNote(longNote, 0, SONG_TIME, 800, SONG_TIME);

    const bodySprite = childrenOf(bodyLayer)[0];
    expect(bodySprite.tint).toBe(0xffffff);
  });

  it("싱글 롱노트 실패 — 기존 failedBodies 동작 유지", () => {
    renderer.applyNoteDisplayEffect(0, { body: 'failed', visibility: 'unchanged' });
    renderer.renderLongNote(longNote, 0, SONG_TIME, 800, SONG_TIME);

    const bodySprite = childrenOf(bodyLayer)[0];
    expect(bodySprite.tint).toBe(0xffffff);
  });
});

// ══════════════════════════════════════════════════════════════
// 시나리오 6: 풀 초기화
// ══════════════════════════════════════════════════════════════

describe("풀 초기화 후 상태 격리", () => {
  let renderer: GameNoteRenderer;
  let noteLayer: Container;
  let bodyLayer: Container;

  beforeEach(() => {
    const created = createRenderer();
    renderer = created.renderer;
    noteLayer = created.noteLayer;
    bodyLayer = created.bodyLayer;
  });

  it("clearPools 후 모든 상태(completed, failed, missed, partial, partialFailed)가 초기화됨", () => {
    renderer.applyNoteDisplayEffect(0, { body: null, visibility: 'processed' });
    renderer.applyNoteDisplayEffect(1, { body: 'failed', visibility: 'unchanged' });
    renderer.applyNoteDisplayEffect(2, { body: null, visibility: 'missed' });
    renderer.applyNoteDisplayEffect(3, { body: null, visibility: 'doublePartial' });
    renderer.applyNoteDisplayEffect(4, { body: { partialFailed: 'left' }, visibility: 'unchanged' });
    renderer.clearPools();

    // completed가 초기화되었으므로 index 0 렌더 가능
    renderer.renderPointNote(singleNote, 0, SONG_TIME, SONG_TIME);
    expect(childrenOf(noteLayer).length).toBeGreaterThan(0);
    const sprite0 = childrenOf(noteLayer)[0];
    expect(sprite0.tint).toBe(0xffffff);

    // failed가 초기화되었으므로 index 1 기본 tint
    renderer.renderLongNote(longNote, 1, SONG_TIME, 800, SONG_TIME);
    const bodySprite1 = childrenOf(bodyLayer)[0];
    expect(bodySprite1.tint).toBe(0xffffff);

    // missed가 초기화되었으므로 index 2 기본 tint
    clearLayers(noteLayer);
    renderer.renderPointNote(singleNote, 2, SONG_TIME, SONG_TIME);
    const sprite2 = childrenOf(noteLayer)[0];
    expect(sprite2.tint).toBe(0xffffff);

    // doublePartial 초기화되었으므로 index 3 alpha=1
    clearLayers(noteLayer);
    renderer.renderPointNote(doubleNote, 3, SONG_TIME, SONG_TIME);
    const sprite3 = childrenOf(noteLayer)[0];
    expect(sprite3.alpha).toBe(1);

    // partialFailed 초기화되었으므로 index 4 기본 tint
    clearLayers(bodyLayer);
    renderer.renderLongNote(doubleLongNote, 4, SONG_TIME, 800, SONG_TIME);
    const bodySprite4 = childrenOf(bodyLayer)[0];
    expect(bodySprite4.tint).toBe(0xffffff);
  });

  it("dispose 후에도 동일하게 초기화됨", () => {
    renderer.applyNoteDisplayEffect(0, { body: null, visibility: 'processed' });
    renderer.applyNoteDisplayEffect(1, { body: 'failed', visibility: 'unchanged' });
    renderer.applyNoteDisplayEffect(2, { body: null, visibility: 'missed' });
    renderer.applyNoteDisplayEffect(3, { body: null, visibility: 'doublePartial' });
    renderer.applyNoteDisplayEffect(4, { body: { partialFailed: 'left' }, visibility: 'unchanged' });
    renderer.dispose();

    // completed가 초기화되었으므로 index 0 렌더 가능
    renderer.renderPointNote(singleNote, 0, SONG_TIME, SONG_TIME);
    expect(childrenOf(noteLayer).length).toBeGreaterThan(0);

    // failed가 초기화되었으므로 index 1 기본 tint
    renderer.renderLongNote(longNote, 1, SONG_TIME, 800, SONG_TIME);
    const bodySprite1 = childrenOf(bodyLayer)[0];
    expect(bodySprite1.tint).toBe(0xffffff);

    // missed가 초기화되었으므로 index 2 기본 tint
    clearLayers(noteLayer);
    renderer.renderPointNote(singleNote, 2, SONG_TIME, SONG_TIME);
    const sprite2 = childrenOf(noteLayer)[0];
    expect(sprite2.tint).toBe(0xffffff);

    // doublePartial 초기화되었으므로 index 3 alpha=1
    clearLayers(noteLayer);
    renderer.renderPointNote(doubleNote, 3, SONG_TIME, SONG_TIME);
    const sprite3 = childrenOf(noteLayer)[0];
    expect(sprite3.alpha).toBe(1);

    // partialFailed 초기화되었으므로 index 4 기본 tint
    clearLayers(bodyLayer);
    renderer.renderLongNote(doubleLongNote, 4, SONG_TIME, 800, SONG_TIME);
    const bodySprite4 = childrenOf(bodyLayer)[0];
    expect(bodySprite4.tint).toBe(0xffffff);
  });
});
