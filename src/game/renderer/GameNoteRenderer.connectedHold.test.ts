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
  const getTexture = vi.fn(() => ({}));
  const skinManager = {
    getTexture,
    getHalfCapTexture: vi.fn(() => ({})),
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

  return { renderer, getTexture };
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
