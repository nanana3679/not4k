import { afterEach, describe, expect, it, vi } from 'vitest';
import { Application, Container, Graphics, Sprite, Text, Texture, TextureSource } from 'pixi.js';
import { GameRenderer } from './GameRenderer';
import { GEAR_GEOMETRY, GEAR_CLEARANCE, layoutGear } from './gearLayout';
import { GAME_HEIGHT, GEAR_OFFSET_Y, LANE_AREA_WIDTH, NOTE_HEIGHT, liftPx } from './constants';
import { beat, createChartTiming, type ChartEvent, type NoteEntity, type RestZone, type TrillZone } from '../../shared';
import type { SkinManager } from '../skin';

interface Scene {
  app: Application;
  laneContentLayer: Container;
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

async function createRenderer({
  width = 1067, resolution = 1.8, showGear = true, theme = {}, textures = [],
}: { width?: number; resolution?: number; showGear?: boolean; theme?: Record<string, unknown>; textures?: string[] } = {}) {
  const gear = new Texture({ source: new TextureSource({ width: 1024, height: 1536 }) });
  const skinManager = {
    getTheme: () => ({ bg: 0, beamColor: 0xffffff, ...theme }),
    getBodyWidthScale: () => 1,
    hasTexture: (key: string) => textures.includes(key),
    getTexture: (key: string) => (key === 'gearImage' ? gear : Texture.WHITE),
    getHalfCapTexture: () => Texture.WHITE,
  } as unknown as SkinManager;
  const renderer = new GameRenderer({
    canvas: {} as HTMLCanvasElement, width, height: GAME_HEIGHT, resolution, skinManager, showGear, showFlightBackground: false,
    // `gearMotion`은 GameRenderer.gearMotion.test.ts에서 따로 본다(여기서는 공유 로더를 부르지 않는다).
    gearMotion: false,
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
/** 레인 끝 클립 사각형(`laneContentLayer.mask`)의 범위. Pixi가 캐시해 다시 쓰는 Bounds 객체 대신 숫자를 복사한다. */
const clipOf = (scene: Scene) => {
  const { minX, minY, maxX, maxY } = (scene.laneContentLayer.mask as Graphics).getLocalBounds();
  return { minX, minY, maxX, maxY };
};

afterEach(() => {
  for (const scene of created.splice(0)) scene.app.stage.destroy({ children: true });
  vi.restoreAllMocks();
});

describe('놓친 노트는 판정선 아래 레인 끝(laneEndY)까지 보이는 틈을 다 지날 때까지 그린다 (RFD 0029, #247)', () => {
  // 1000ms(2박)의 2번 레인 싱글을 놓친 것으로 표시한다. 노트 박스 가운데가 시각 위치다(#224).
  const missedSingle = async (options: Parameters<typeof createRenderer>[0] = {}) => {
    const { renderer, scene } = await createRenderer(options);
    loadChart(renderer, { notes: [{ type: 'single', lane: 2, beat: beat(2) } as NoteEntity] });
    renderer.applyNoteDisplayEffect(0, { body: 'failed', visibility: 'missed' });
    return { renderer, scene };
  };
  const noteSprites = (scene: Scene) => scene.noteLayer.children.filter((child): child is Sprite => child instanceof Sprite);
  // 게임 기어 배치(기어·판정선 10 내림, #257)에서 스크롤 200px/s·리프트 20%(판정선 y 306)의 놓친 노트 박스 윗변 = 306 + 0.2 × 늦은 ms − 6.25
  const keyRimY = layoutGear(GEAR_GEOMETRY, { laneAreaX: (1067 - LANE_AREA_WIDTH) / 2, laneAreaWidth: LANE_AREA_WIDTH, height: GAME_HEIGHT, offsetY: GEAR_OFFSET_Y }).keyRimY;

  it('스크롤 200px/s·리프트 20%(판정선 y 306)에서 600ms 늦은 놓친 노트는 가운데가 판정선 120 아래 y 426, 박스 윗변 419.75(키 윗면 456.5 위)에 그린다', async () => {
    const { renderer, scene } = await missedSingle();
    renderer.scrollSpeed = 200;
    renderer.setLift(liftPx(20));
    renderer.renderFrame(1600);
    const [note] = noteSprites(scene);
    expect(note).toBeDefined();
    expect(note.y).toBe(419.75);
    expect(note.y + NOTE_HEIGHT / 2).toBe(426);
  });

  it('같은 조건에서 780ms 늦어 박스 윗변 455.75가 아직 키 윗면(약 456.47) 위에 보이면 계속 그린다', async () => {
    const { renderer, scene } = await missedSingle();
    renderer.scrollSpeed = 200;
    renderer.setLift(liftPx(20));
    renderer.renderFrame(1780);
    const [note] = noteSprites(scene);
    expect(note).toBeDefined();
    expect(note.y).toBe(455.75);
    expect(note.y).toBeLessThan(keyRimY);
  });

  it('접촉 그림자가 없는 스킨에서는 790ms 늦어 박스 윗변 457.75가 키 윗면(약 456.47) 아래로 완전히 내려가면 더 그리지 않는다', async () => {
    const { renderer, scene } = await missedSingle();
    renderer.scrollSpeed = 200;
    renderer.setLift(liftPx(20));
    expect(306 + 0.2 * 790 - NOTE_HEIGHT / 2).toBeGreaterThan(keyRimY);
    renderer.renderFrame(1790);
    expect(noteSprites(scene)).toHaveLength(0);
  });

  // Classic처럼 포인트 위 접촉 그림자(설계 5 → 3.125)가 있으면 박스 윗변이 키 윗면을 지나도 그림자 띠가 그 위에 남는다.
  const contactShadowSkin = { theme: { pointContactShadow: { above: 5, below: 5 } }, textures: ['pointContactShadow'] };

  it('위 접촉 그림자 3.125가 있는 스킨에서 790ms 늦은 놓친 노트는 박스 윗변 457.75가 키 윗면 아래여도 그림자 윗변 454.625가 아직 보여 노트와 그림자를 계속 그린다', async () => {
    const { renderer, scene } = await missedSingle(contactShadowSkin);
    renderer.scrollSpeed = 200;
    renderer.setLift(liftPx(20));
    renderer.renderFrame(1790);
    const sprites = noteSprites(scene);
    expect(sprites.length).toBeGreaterThan(1);
    const shadowTop = Math.min(...sprites.map((sprite) => sprite.getBounds().minY));
    expect(shadowTop).toBeCloseTo(457.75 - 3.125, 9);
    expect(shadowTop).toBeLessThan(keyRimY);
  });

  it('위 접촉 그림자 3.125가 있는 스킨에서 800ms 늦어 그림자 윗변 456.625까지 키 윗면(약 456.47) 아래로 내려가면 더 그리지 않는다', async () => {
    const { renderer, scene } = await missedSingle(contactShadowSkin);
    renderer.scrollSpeed = 200;
    renderer.setLift(liftPx(20));
    expect(306 + 0.2 * 800 - NOTE_HEIGHT / 2 - 3.125).toBeGreaterThan(keyRimY);
    renderer.renderFrame(1800);
    expect(noteSprites(scene)).toHaveLength(0);
  });

  it('같은 조건에서 900ms 늦어 키 윗면 아래(가운데 y 486)로 완전히 내려간 노트는 더 그리지 않는다', async () => {
    const { renderer, scene } = await missedSingle();
    renderer.scrollSpeed = 200;
    renderer.setLift(liftPx(20));
    renderer.renderFrame(1900);
    expect(noteSprites(scene)).toHaveLength(0);
  });

  // 기어가 없는 렌더러(튜토리얼 재생기)의 레인 끝은 판정선 416 + 노트 반 칸 6.25 = 422.25다.
  // 스크롤 20px/s면 박스 윗변이 레인 끝에 닿는 시간은 (6.25 + 6.25) / 20 = 625ms로, 최소 500ms보다 길다.
  it('기어 없는 렌더러(레인 끝 422.25)에서 스크롤 20px/s면 600ms 늦은 놓친 노트는 박스 윗변 421.75가 레인 끝 위라 계속 그린다', async () => {
    const { renderer, scene } = await missedSingle({ showGear: false });
    renderer.scrollSpeed = 20;
    renderer.renderFrame(1600);
    const [note] = noteSprites(scene);
    expect(note).toBeDefined();
    expect(note.y).toBe(421.75);
  });

  it('기어 없는 렌더러에서 같은 조건으로 630ms 늦어 박스 윗변 422.35가 레인 끝 422.25 아래로 내려가면 더 그리지 않는다', async () => {
    const { renderer, scene } = await missedSingle({ showGear: false });
    renderer.scrollSpeed = 20;
    expect(416 + 0.02 * 630 - NOTE_HEIGHT / 2).toBeGreaterThan(422.25);
    renderer.renderFrame(1630);
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

  it('곡 0ms의 0ms 마디선은 두께 0.625의 가운데가 시각 위치(게임 판정선 y 426)에 와 [425.6875, 426.3125]로 판정선과 같은 가운데를 쓴다', async () => {
    const line = await measureLine(1.8);
    const bounds = line.getBounds();
    expect(bounds.minY).toBeCloseTo(426 - 0.3125, 9);
    expect(bounds.maxY).toBeCloseTo(426 + 0.3125, 9);
  });
});

describe('오른쪽 위 이벤트 문구', () => {
  it('16:9(1067)에서 줄바꿈 폭은 기어 실루엣 오른쪽 끝 + 8부터 화면 오른쪽 여백 20까지(약 280.9)라 오른쪽 기둥과 겹치지 않는다', async () => {
    const { scene } = await createRenderer();
    const gear = layoutGear(GEAR_GEOMETRY, { laneAreaX: (1067 - LANE_AREA_WIDTH) / 2, laneAreaWidth: LANE_AREA_WIDTH, height: GAME_HEIGHT });
    const text = scene.eventMessageText;
    expect(text.style.wordWrapWidth).toBeCloseTo(1067 - 20 - (gear.silhouetteRightX + GEAR_CLEARANCE), 9);
    expect(text.x - text.style.wordWrapWidth).toBeGreaterThanOrEqual(gear.silhouetteRightX + GEAR_CLEARANCE - 1e-9);
  });

  it('기어가 없으면 레인 영역 오른쪽 끝(658.5) + 8부터 재서 줄바꿈 폭 380.5', async () => {
    const { scene } = await createRenderer({ showGear: false });
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
  // 게임 판정선 y 426(기어·판정선 10 내림), 800px/s → 시각 t의 y = 426 − (t − 곡 시각) × 0.8
  const yAt = (timeMs: number, songMs: number) => 426 - (timeMs - songMs) * 0.8;

  it('트릴 구간은 롱노트 바디처럼 끝 y − 노트 반 칸부터 시작 y + 노트 반 칸까지(길이 0이면 시각에 가운데를 맞춘 노트 두께 12.5), 휴지 구간은 끝 y부터 시작 y까지(길이 0이면 1)를 레인 폭 62.5로 덮는다', async () => {
    const { renderer, scene } = await createRenderer();
    loadChart(renderer, chart);
    renderer.renderFrame(2200);
    const laneX = (lane: number) => 408.5 + (lane - 1) * 62.5;
    const [trill, trillZero] = scene.trillZoneLayer.children.map(boundsOf);
    expect([trill.minX, trill.maxX]).toEqual([laneX(2), laneX(2) + 62.5]);
    expect(trill.minY).toBeCloseTo(yAt(3000, 2200) - NOTE_HEIGHT / 2, 9);
    expect(trill.maxY).toBeCloseTo(yAt(1000, 2200) + NOTE_HEIGHT / 2, 9);
    expect(trillZero.minX).toBe(laneX(3));
    expect(trillZero.minY).toBeCloseTo(yAt(2000, 2200) - NOTE_HEIGHT / 2, 9);
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

describe('레인 끝 클립의 가로 범위 (#247)', () => {
  // 16:9(1067)에서 레인 영역은 408.5~658.5다. 클립은 양옆에 레인 폭 62.5씩 여유를 둔 346~721이다.

  // 키빔(레인마다 레인 폭 62.5 사각형)은 FillGradient가 DOM을 써 여기서 만들지 않는다.
  it('레인 1·4의 Grace 노트 글로우(레인 밖 8.75)·trillZone·restZone·마디선은 가로로 399.75~667.25 안이라 클립 사각형 346~721이 양옆을 자르지 않는다', async () => {
    const { renderer, scene } = await createRenderer();
    loadChart(renderer, {
      notes: [
        { type: 'single', lane: 1, beat: beat(5), grace: true } as NoteEntity,
        { type: 'single', lane: 4, beat: beat(5), grace: true } as NoteEntity,
      ],
      trillZones: [{ lane: 1, beat: beat(2), endBeat: beat(6) }, { lane: 4, beat: beat(2), endBeat: beat(6) }] as TrillZone[],
      restZones: [{ lane: 1, beat: beat(2), endBeat: beat(6) }, { lane: 4, beat: beat(2), endBeat: beat(6) }] as RestZone[],
      durationMs: 8000,
    });
    renderer.renderFrame(2200);

    const clip = clipOf(scene);
    expect([clip.minX, clip.maxX]).toEqual([346, 721]);
    const visible = scene.laneContentLayer.children.filter((layer) => layer.children.some((child) => child.visible));
    // restZone·마디선·trillZone·노트 레이어에 그린 것이 있다(키빔·롱노트 레이어는 이 테스트에서 비어 있다).
    expect(visible).toHaveLength(4);
    let minX = Infinity;
    let maxX = -Infinity;
    for (const layer of visible) {
      const bounds = layer.getBounds();
      minX = Math.min(minX, bounds.minX);
      maxX = Math.max(maxX, bounds.maxX);
    }
    expect(minX).toBeCloseTo(408.5 - 8.75, 9);
    expect(maxX).toBeCloseTo(658.5 + 8.75, 9);
    expect(minX).toBeGreaterThan(clip.minX);
    expect(maxX).toBeLessThan(clip.maxX);
  });
});

describe('기어 없는 렌더러의 레인 끝 값 자르기 (#247)', () => {
  // 리프트 100%(600)면 판정선은 600 − 184 − 600 = −184, 레인 끝은 −184 + 6.25 = −177.75로 화면 위쪽 밖이다.
  it('리프트 100%면 레인 끝(−177.75)을 0으로 잘라 클립과 레인 배경의 높이가 0이고, 늦은 노트 시간은 자르지 않은 값으로 판정선 + 노트 반 칸(12.5 ÷ 스크롤 20px/s = 625ms)을 쓴다', async () => {
    const { renderer, scene } = await createRenderer({ showGear: false });
    renderer.scrollSpeed = 20;
    renderer.setLift(liftPx(100));
    expect(renderer.judgmentLineY).toBe(-184);
    const clip = clipOf(scene);
    expect([clip.minY, clip.maxY]).toEqual([0, 0]);
    const lane = (scene as unknown as { backgroundLayer: Container }).backgroundLayer.children[0].getLocalBounds();
    expect(lane.maxY - lane.minY).toBe(0);
    expect(lane.maxY).toBe(0);
    // 자른 값(0)을 쓰면 (0 − (−184) + 6.25) ÷ 20 ≈ 9512ms가 된다.
    expect((renderer as unknown as { lateNoteWindowMs(): number }).lateNoteWindowMs()).toBe(625);
  });
});
