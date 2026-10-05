import { afterEach, describe, expect, it, vi } from 'vitest';
import { Application, Container, Graphics, Sprite, Text, Texture, TextureSource } from 'pixi.js';
import { GameRenderer } from './GameRenderer';
import { CLASSIC_FRAME_GEOMETRY, FRAME_CLEARANCE, layoutClassicFrame } from './classicFrameLayout';
import { GAME_HEIGHT, LANE_AREA_WIDTH, NOTE_HEIGHT, liftPx } from './constants';
import { beat, createChartTiming, type ChartEvent, type NoteEntity, type RestZone, type TrillZone } from '../../shared';
import type { SkinManager } from '../skin';

interface Scene {
  app: Application;
  noteLayer: Container;
  measureLineLayer: Container;
  trillZoneLayer: Container;
  restZoneLayer: Container;
  eventMessageText: Text;
  buildKeyBeams(): void;
}

const created: Scene[] = [];
// 120 BPM: 1박 = 500ms
const EVENTS: ChartEvent[] = [
  { type: 'bpm', beat: beat(0), bpm: 120 },
  { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4) },
];

async function createRenderer({ width = 1067, resolution = 1.8, showGearFrame = true } = {}) {
  const frame = new Texture({ source: new TextureSource({ width: 1024, height: 1536 }) });
  const skinManager = {
    getTheme: () => ({ bg: 0, beamColor: 0xffffff }),
    getBodyWidthScale: () => 1,
    hasTexture: () => false,
    getTexture: (key: string) => (key === 'gearFrame' ? frame : Texture.WHITE),
    getHalfCapTexture: () => Texture.WHITE,
  } as unknown as SkinManager;
  const renderer = new GameRenderer({
    canvas: {} as HTMLCanvasElement, width, height: GAME_HEIGHT, resolution, skinManager, showGearFrame, showFlightBackground: false,
  });
  const scene = renderer as unknown as Scene;
  // GPU 초기화만 생략하고 실제 Container/Sprite/Graphics와 init·renderFrame을 사용한다.
  vi.spyOn(scene.app, 'init').mockResolvedValue(undefined);
  vi.spyOn(scene, 'buildKeyBeams').mockImplementation(() => {});
  await renderer.init();
  scene.app.renderer = {} as Application['renderer'];
  vi.spyOn(scene.app, 'render').mockImplementation(() => {});
  created.push(scene);
  return { renderer, scene };
}

function loadChart(renderer: GameRenderer, chart: { notes?: NoteEntity[]; trillZones?: TrillZone[]; restZones?: RestZone[]; durationMs?: number }) {
  const notes = chart.notes ?? [];
  const trillZones = chart.trillZones ?? [];
  const timing = createChartTiming({ notes, events: EVENTS, trillZones, meta: { offsetMs: 0 } });
  renderer.setChart(notes, trillZones, chart.restZones ?? [], EVENTS, timing, chart.durationMs ?? 0);
}

const boundsOf = (child: Container) => child.getBounds();

afterEach(() => {
  for (const scene of created.splice(0)) scene.app.stage.destroy({ children: true });
  vi.restoreAllMocks();
});

describe('놓친 노트는 판정선 아래 보이는 틈을 다 지날 때까지 그린다 (RFD 0029)', () => {
  // 1000ms(2박)의 2번 레인 싱글을 놓친 것으로 표시한다.
  const missedSingle = async () => {
    const { renderer, scene } = await createRenderer();
    loadChart(renderer, { notes: [{ type: 'single', lane: 2, beat: beat(2) } as NoteEntity] });
    renderer.applyNoteDisplayEffect(0, { body: 'failed', visibility: 'missed' });
    return { renderer, scene };
  };
  const noteSprites = (scene: Scene) => scene.noteLayer.children.filter((child): child is Sprite => child instanceof Sprite);

  it('스크롤 200px/s·리프트 20%(판정선 y 296)에서 600ms 늦은 놓친 노트는 판정선 120 아래 y 416(키 윗면 446.5 위)에 그린다', async () => {
    const { renderer, scene } = await missedSingle();
    renderer.scrollSpeed = 200;
    renderer.setLift(liftPx(20));
    renderer.renderFrame(1600);
    const [note] = noteSprites(scene);
    expect(note).toBeDefined();
    expect(note.y).toBe(416);
  });

  it('같은 조건에서 900ms 늦어 키 윗면 아래(y 476)로 완전히 내려간 노트는 더 그리지 않는다', async () => {
    const { renderer, scene } = await missedSingle();
    renderer.scrollSpeed = 200;
    renderer.setLift(liftPx(20));
    renderer.renderFrame(1900);
    expect(noteSprites(scene)).toHaveLength(0);
  });
});

describe('마디선 두께', () => {
  const measureLine = async (resolution: number) => {
    const { renderer, scene } = await createRenderer({ resolution });
    loadChart(renderer, { durationMs: 8000 });
    renderer.renderFrame(0);
    return scene.measureLineLayer.children.find((child) => child.visible) as Graphics;
  };

  it('렌더 높이 720(해상도 1.2)에서는 화면 1px이 되도록 1/1.2 ≈ 0.833 논리 단위로 그린다', async () => {
    const line = await measureLine(1.2);
    expect(line.getLocalBounds().height).toBeCloseTo(1 / 1.2, 9);
  });

  it('렌더 높이 1080(해상도 1.8)에서는 플레이필드 배율 두께 0.625(화면 1.125px)로 그린다', async () => {
    const line = await measureLine(1.8);
    expect(line.getLocalBounds().height).toBeCloseTo(0.625, 9);
  });
});

describe('오른쪽 위 이벤트 문구', () => {
  it('16:9(1067)에서 줄바꿈 폭은 프레임 실루엣 오른쪽 끝 + 8부터 화면 오른쪽 여백 20까지(약 280.9)라 오른쪽 기둥과 겹치지 않는다', async () => {
    const { scene } = await createRenderer();
    const frame = layoutClassicFrame(CLASSIC_FRAME_GEOMETRY, { laneAreaX: (1067 - LANE_AREA_WIDTH) / 2, laneAreaWidth: LANE_AREA_WIDTH, height: GAME_HEIGHT });
    const text = scene.eventMessageText;
    expect(text.style.wordWrapWidth).toBeCloseTo(1067 - 20 - (frame.silhouetteRightX + FRAME_CLEARANCE), 9);
    expect(text.x - text.style.wordWrapWidth).toBeGreaterThanOrEqual(frame.silhouetteRightX + FRAME_CLEARANCE - 1e-9);
  });

  it('프레임이 없으면 레인 영역 오른쪽 끝(658.5) + 8부터 재서 줄바꿈 폭 380.5', async () => {
    const { scene } = await createRenderer({ showGearFrame: false });
    expect(scene.eventMessageText.style.wordWrapWidth).toBeCloseTo(380.5, 9);
  });

  it('빈 곳이 120보다 좁은 최소 폭 466에서도 줄바꿈 폭 120은 지킨다', async () => {
    const { scene } = await createRenderer({ width: 466 });
    expect(scene.eventMessageText.style.wordWrapWidth).toBe(120);
  });
});

describe('마디선·구간 밴드 풀', () => {
  // 곡 시각 2200ms에 모두 화면에 걸리도록: 2번 레인 트릴 구간 2~6박(1000~3000ms), 길이 0 트릴 구간 3번 레인 4박(2000ms),
  // 4번 레인 휴지 구간 2~4박(1000~2000ms), 길이 0 휴지 구간 1번 레인 5박(2500ms).
  const chart = {
    trillZones: [
      { lane: 2, beat: beat(2), endBeat: beat(6) },
      { lane: 3, beat: beat(4), endBeat: beat(4) },
    ] as TrillZone[],
    restZones: [
      { lane: 4, beat: beat(2), endBeat: beat(4) },
      { lane: 1, beat: beat(5), endBeat: beat(5) },
    ] as RestZone[],
    durationMs: 8000,
  };
  // 판정선 y 416, 800px/s → 시각 t의 y = 416 − (t − 곡 시각) × 0.8
  const yAt = (timeMs: number, songMs: number) => 416 - (timeMs - songMs) * 0.8;

  it('트릴 구간은 끝 y부터 시작 y + 노트 두께까지(길이 0이면 노트 두께 12.5), 휴지 구간은 끝 y부터 시작 y까지(길이 0이면 1)를 레인 폭 62.5로 덮는다', async () => {
    const { renderer, scene } = await createRenderer();
    loadChart(renderer, chart);
    renderer.renderFrame(2200);
    const laneX = (lane: number) => 408.5 + (lane - 1) * 62.5;
    const [trill, trillZero] = scene.trillZoneLayer.children.map(boundsOf);
    expect([trill.minX, trill.maxX]).toEqual([laneX(2), laneX(2) + 62.5]);
    expect(trill.minY).toBeCloseTo(yAt(3000, 2200), 9);
    expect(trill.maxY).toBeCloseTo(yAt(1000, 2200) + NOTE_HEIGHT, 9);
    expect(trillZero.minX).toBe(laneX(3));
    expect(trillZero.minY).toBeCloseTo(yAt(2000, 2200), 9);
    expect(trillZero.height).toBeCloseTo(NOTE_HEIGHT, 9);
    const [rest, restZero] = scene.restZoneLayer.children.map(boundsOf);
    expect(rest.minX).toBe(laneX(4));
    expect(rest.minY).toBeCloseTo(yAt(2000, 2200), 9);
    expect(rest.maxY).toBeCloseTo(yAt(1000, 2200), 9);
    expect(restZero.minX).toBe(laneX(1));
    expect(restZero.minY).toBeCloseTo(yAt(2500, 2200), 9);
    expect(restZero.height).toBeCloseTo(1, 9);
  });

  it('다음 프레임에는 같은 Graphics를 위치·세로 배율만 바꿔 다시 쓰고 clear·rect로 다시 그리지 않는다', async () => {
    const { renderer, scene } = await createRenderer();
    loadChart(renderer, chart);
    renderer.renderFrame(2200);
    const pooled = [...scene.measureLineLayer.children, ...scene.trillZoneLayer.children, ...scene.restZoneLayer.children] as Graphics[];
    // 마디선 1개(2000ms)와 트릴·휴지 밴드 2개씩이 화면에 있다.
    expect(pooled.filter((graphic) => graphic.visible)).toHaveLength(5);
    const contexts = pooled.map((graphic) => graphic.context);
    const redraws = pooled.flatMap((graphic) => [vi.spyOn(graphic, 'clear'), vi.spyOn(graphic, 'rect'), vi.spyOn(graphic, 'fill')]);
    const trillTopBefore = boundsOf(scene.trillZoneLayer.children[0]).minY;

    renderer.renderFrame(2400);

    expect([...scene.measureLineLayer.children, ...scene.trillZoneLayer.children, ...scene.restZoneLayer.children]).toEqual(pooled);
    expect(pooled.map((graphic) => graphic.context)).toEqual(contexts);
    for (const spy of redraws) expect(spy).not.toHaveBeenCalled();
    // 200ms 뒤에는 160 아래로 내려온다.
    expect(boundsOf(scene.trillZoneLayer.children[0]).minY - trillTopBefore).toBeCloseTo(160, 9);
  });
});
