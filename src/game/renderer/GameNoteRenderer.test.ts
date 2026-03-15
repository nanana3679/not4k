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
    static from() { return new Sprite(); }
    constructor() {}
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
import { COLORS } from "./constants";

function createMockSkinManager(): SkinManager {
  return {
    getTexture: vi.fn(() => ({})),
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

describe("GameNoteRenderer 노트 상태 관리", () => {
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

  // ── markNoteMissed ──────────────────────────────────

  it("markNoteMissed 호출 후에도 포인트 노트가 계속 렌더링됨", () => {
    const entity = { type: "single", beat: 0, lane: 1 } as unknown as NoteEntity;
    renderer.markNoteMissed(0);

    // completedNotes에 없으므로 렌더링 시 noteLayer에 child가 추가됨
    renderer.renderPointNote(entity, 0, 500, 500);
    expect((noteLayer as any).children.length).toBeGreaterThan(0);
  });

  it("markNoteProcessed 호출 후에는 포인트 노트가 렌더링되지 않음", () => {
    const entity = { type: "single", beat: 0, lane: 1 } as unknown as NoteEntity;
    renderer.markNoteProcessed(0);

    renderer.renderPointNote(entity, 0, 500, 500);
    expect((noteLayer as any).children.length).toBe(0);
  });

  it("markNoteMissed는 failedBodies에도 추가됨 — 롱노트 바디가 실패 색상으로 표시", () => {
    const entity = { type: "long", beat: 0, lane: 1, endBeat: 4 } as unknown as NoteEntity & { endBeat: unknown };
    renderer.markNoteMissed(0);

    renderer.renderLongNote(entity, 0, 500, 800, 500);
    // 렌더링이 수행됨 (completedNotes에 없으므로)
    expect((bodyLayer as any).children.length).toBeGreaterThan(0);
  });

  it("miss된 포인트 노트의 tint가 LONG_BODY_FAILED(0x555555)로 설정됨", () => {
    const entity = { type: "single", beat: 0, lane: 1 } as unknown as NoteEntity;
    renderer.markNoteMissed(0);

    renderer.renderPointNote(entity, 0, 500, 500);

    // noteLayer에 추가된 sprite의 tint 확인
    const sprite = (noteLayer as any).children[0];
    expect(sprite.tint).toBe(COLORS.LONG_BODY_FAILED);
  });

  it("miss되지 않은 포인트 노트의 tint는 0xffffff(기본값)", () => {
    const entity = { type: "single", beat: 0, lane: 1 } as unknown as NoteEntity;

    renderer.renderPointNote(entity, 0, 500, 500);

    const sprite = (noteLayer as any).children[0];
    expect(sprite.tint).toBe(0xffffff);
  });

  // ── doublePartialNotes ──────────────────────────────

  it("더블 부분 입력 시 alpha가 0.7로 설정됨", () => {
    const entity = { type: "double", beat: 0, lane: 1 } as unknown as NoteEntity;
    renderer.markDoublePartial(0);

    renderer.renderPointNote(entity, 0, 500, 500);

    const sprite = (noteLayer as any).children[0];
    expect(sprite.alpha).toBe(0.7);
  });

  it("더블 부분 입력이 아닌 노트의 alpha는 1", () => {
    const entity = { type: "double", beat: 0, lane: 1 } as unknown as NoteEntity;

    renderer.renderPointNote(entity, 0, 500, 500);

    const sprite = (noteLayer as any).children[0];
    expect(sprite.alpha).toBe(1);
  });

  // ── 롱노트 miss ────────────────────────────────────

  it("miss된 롱노트 바디의 tint가 LONG_BODY_FAILED로 설정됨", () => {
    const entity = { type: "long", beat: 0, lane: 1, endBeat: 4 } as unknown as NoteEntity & { endBeat: unknown };
    renderer.markNoteMissed(0);

    renderer.renderLongNote(entity, 0, 500, 800, 500);

    const bodySprite = (bodyLayer as any).children[0];
    expect(bodySprite.tint).toBe(COLORS.LONG_BODY_FAILED);
  });

  it("miss된 롱노트 터미널의 tint가 LONG_BODY_FAILED로 설정됨", () => {
    const entity = { type: "long", beat: 0, lane: 1, endBeat: 4 } as unknown as NoteEntity & { endBeat: unknown };
    renderer.markNoteMissed(0);

    renderer.renderLongNote(entity, 0, 500, 800, 500);

    // endLayer에 터미널 추가됨 (adjustedEndY가 화면 범위 내)
    if ((endLayer as any).children.length > 0) {
      const termSprite = (endLayer as any).children[0];
      expect(termSprite.tint).toBe(COLORS.LONG_BODY_FAILED);
    }
  });

  it("miss되지 않은 롱노트 바디의 tint는 0xffffff(기본값)", () => {
    const entity = { type: "long", beat: 0, lane: 1, endBeat: 4 } as unknown as NoteEntity & { endBeat: unknown };

    renderer.renderLongNote(entity, 0, 500, 800, 500);

    const bodySprite = (bodyLayer as any).children[0];
    expect(bodySprite.tint).toBe(0xffffff);
  });

  // ── clearPools ──────────────────────────────────────

  it("clearPools 호출 후 missedNotes 상태가 초기화됨", () => {
    const entity = { type: "single", beat: 0, lane: 1 } as unknown as NoteEntity;
    renderer.markNoteMissed(0);
    renderer.clearPools();

    // clearPools 후 렌더링하면 miss 상태가 아니므로 기본 tint
    renderer.renderPointNote(entity, 0, 500, 500);
    const sprite = (noteLayer as any).children[0];
    expect(sprite.tint).toBe(0xffffff);
  });

  // ── 더블 롱노트 부분 입력 ──────────────────────────

  it("더블 롱노트 부분 입력 시 바디 alpha가 0.7로 설정됨", () => {
    const entity = { type: "doubleLong", beat: 0, lane: 1, endBeat: 4 } as unknown as NoteEntity & { endBeat: unknown };
    renderer.markDoublePartial(0);

    renderer.renderLongNote(entity, 0, 500, 800, 500);

    const bodySprite = (bodyLayer as any).children[0];
    expect(bodySprite.alpha).toBe(0.7);
  });

  // ── 더블 롱노트 부분 실패 ──────────────────────────

  it("더블 롱노트 부분 실패 시 바디 tint가 LONG_BODY_PARTIAL_FAILED(0x888888)로 설정됨", () => {
    const entity = { type: "doubleLong", beat: 0, lane: 1, endBeat: 4 } as unknown as NoteEntity & { endBeat: unknown };
    renderer.markBodyPartialFailed(0, 'left');

    renderer.renderLongNote(entity, 0, 500, 800, 500);

    const bodySprite = (bodyLayer as any).children[0];
    // skinManager.hasTexture는 false를 반환하므로 tint fallback 사용
    expect(bodySprite.tint).toBe(COLORS.LONG_BODY_PARTIAL_FAILED);
  });

  it("부분 실패 후 전체 실패 시 바디 tint가 LONG_BODY_FAILED(0x555555)로 변경됨", () => {
    const entity = { type: "doubleLong", beat: 0, lane: 1, endBeat: 4 } as unknown as NoteEntity & { endBeat: unknown };
    renderer.markBodyPartialFailed(0, 'left');
    renderer.markBodyFailed(0);

    renderer.renderLongNote(entity, 0, 500, 800, 500);

    const bodySprite = (bodyLayer as any).children[0];
    expect(bodySprite.tint).toBe(COLORS.LONG_BODY_FAILED);
  });

  it("싱글 롱노트에서는 부분 실패가 적용되지 않음 — 기본 tint 유지", () => {
    const entity = { type: "long", beat: 0, lane: 1, endBeat: 4 } as unknown as NoteEntity & { endBeat: unknown };
    renderer.markBodyPartialFailed(0, 'left');

    renderer.renderLongNote(entity, 0, 500, 800, 500);

    const bodySprite = (bodyLayer as any).children[0];
    // 싱글 롱노트는 isDouble이 false이므로 부분 실패 tint가 적용되지 않음
    expect(bodySprite.tint).toBe(0xffffff);
  });

  it("부분 실패 노트는 completedNotes에 추가되지 않아 계속 렌더링됨", () => {
    const entity = { type: "doubleLong", beat: 0, lane: 1, endBeat: 4 } as unknown as NoteEntity & { endBeat: unknown };
    renderer.markBodyPartialFailed(0, 'left');

    // 렌더링 시도 — completedNotes에 없으므로 렌더링되어야 함
    renderer.renderLongNote(entity, 0, 500, 800, 500);
    expect((bodyLayer as any).children.length).toBeGreaterThan(0);

    // markNoteProcessed를 호출하면 사라짐 — 부분 실패 시에는 호출하면 안 됨
    renderer.markNoteProcessed(0);
    (bodyLayer as any).children = [];
    renderer.renderLongNote(entity, 0, 500, 800, 500);
    expect((bodyLayer as any).children.length).toBe(0); // completedNotes에 있으므로 렌더 안 됨
  });

  it("clearPools 호출 후 partialFailedBodies 상태가 초기화됨", () => {
    const entity = { type: "doubleLong", beat: 0, lane: 1, endBeat: 4 } as unknown as NoteEntity & { endBeat: unknown };
    renderer.markBodyPartialFailed(0, 'left');
    renderer.clearPools();

    renderer.renderLongNote(entity, 0, 500, 800, 500);

    const bodySprite = (bodyLayer as any).children[0];
    expect(bodySprite.tint).toBe(0xffffff);
  });
});
