import { afterEach, describe, expect, it, vi } from 'vitest';
import { Container, Texture, TextureSource, type Application, type Sprite } from 'pixi.js';
import { beat, createChartTiming } from '../../shared';
import { explicitPlaytestCharts } from '../../lab/explicitPlaytestCharts';
import { compileExplicitJudgmentChart } from '../judgment/explicitCompiledChart';
import { ExplicitJudgmentSession } from '../judgment/ExplicitJudgmentSession';
import { createExplicitPlaybackChartView } from '../judgment/explicitPlaybackChart';
import { buildExplicitSkinView } from '../skin/explicitSkin';
import type { ExplicitSkinLoader } from '../skin/ExplicitSkinLoader';
import type { SkinManager } from '../skin';
import { GameRenderer } from './GameRenderer';
import { ExplicitNoteRenderer } from './ExplicitNoteRenderer';
import type { FlightAltitudeState } from './flightAltitude';

const scenes: { renderer: GameRenderer; app: Application }[] = [];
afterEach(() => {
  for (const { renderer, app } of scenes.splice(0)) { renderer.dispose(false); app.stage.destroy({ children: true }); }
  vi.restoreAllMocks();
});

async function setup() {
  const skin = { getTheme: () => ({ bg: 0, beamColor: 0xffffff }), hasTexture: () => false, getBodyWidthScale: () => 1,
    getLoadedTextures: () => new Map(), getBombTextures: () => [] } as unknown as SkinManager;
  const renderer = new GameRenderer({ canvas: {} as HTMLCanvasElement, width: 1000, height: 600,
    skinManager: skin, gearMotion: false, showGear: false, showFlightBackground: false, showLaneKeyLabels: false });
  const scene = renderer as unknown as { app: Application; buildKeyBeams(): void; laneContentLayer: Container; noteRenderData: unknown[];
    explicitNoteRenderer: ExplicitNoteRenderer | null; noteRenderer: { renderPointNote: (...args: unknown[]) => void }; };
  const app = scene.app;
  vi.spyOn(app, 'init').mockResolvedValue(undefined);
  vi.spyOn(app, 'destroy').mockImplementation(() => {});
  vi.spyOn(scene, 'buildKeyBeams').mockImplementation(() => {});
  const initSource = vi.fn(); Object.assign(app, { renderer: { texture: { initSource } } });
  vi.spyOn(app, 'render').mockImplementation(() => {});
  await renderer.init(); scenes.push({ renderer, app });
  const view = buildExplicitSkinView('/');
  const loaded = new Map(Object.keys(view.assetsById).map(id => [id, new Texture({ source: new TextureSource({ width: 200, height: 40 }) })]));
  const explicitSkin = { view, getLoadedTextures: () => loaded, getTexture: (id: string) => loaded.get(id)! } as unknown as ExplicitSkinLoader;
  const document = structuredClone(explicitPlaytestCharts[1].chart);
  const compiled = compileExplicitJudgmentChart(document);
  const session = new ExplicitJudgmentSession(compiled);
  return { renderer, scene, explicitSkin, loaded, document, compiled, session, initSource };
}
function sprites(root: Container, layer: string): Sprite[] {
  return (root.children.find(child => child.label === `explicit-${layer}`) as Container).children as Sprite[];
}

describe('GameRenderer 명시 seam', () => {
  it('마지막 고도1500 뒤2000 복원에서 계산한 Miss는 표시 없이 한 번 반영하고 같은2000 재복원에도 유지한다', async () => {
    const { renderer, explicitSkin, compiled, session, document } = await setup();
    renderer.setExplicitChart(compiled, explicitSkin, () => session.snapshot, document, 8000);
    const fields = renderer as unknown as { flightAltitudeState: FlightAltitudeState };
    renderer.recordExplicitPlaybackPosition(1500);
    renderer.recordFlightJudgment('perfect'); renderer.recordExplicitPlaybackPosition(5000);
    const flight = vi.spyOn(renderer, 'recordFlightJudgment');
    const bomb = vi.spyOn(renderer, 'showBombEffect');
    const show = vi.spyOn(renderer, 'showJudgmentGroup');
    renderer.restoreExplicitPlaybackState(2000, 1, ['miss']);
    expect(fields.flightAltitudeState).toEqual({ offset: -.24, recoveryVelocityPerSecond: 0 });
    expect(flight).not.toHaveBeenCalled(); expect(bomb).not.toHaveBeenCalled(); expect(show).not.toHaveBeenCalled();
    renderer.restoreExplicitPlaybackState(2000, 1);
    expect(fields.flightAltitudeState).toEqual({ offset: -.24, recoveryVelocityPerSecond: 0 });
  });

  it('곡2000ms 고도로 복원하면4000ms Miss·bomb·판정 글자를 지우고 준비3000ms에는 고도 회복도 멈춘다', async () => {
    const { renderer, explicitSkin, compiled, session, document } = await setup();
    renderer.setExplicitChart(compiled, explicitSkin, () => session.snapshot, document, 8000);
    const fields = renderer as unknown as { flightAltitudeState: FlightAltitudeState; effectLayer: Container;
      judgmentUI: { reset(): void }; gearGauge: { update(): void; snapNext(): void; destroy(): void } };
    fields.gearGauge = { update: vi.fn(), snapNext: vi.fn(), destroy: vi.fn() };
    const show = vi.spyOn(renderer, 'showJudgmentGroup');
    const bomb = vi.spyOn(renderer, 'showBombEffect');
    const reset = vi.spyOn(fields.judgmentUI, 'reset');
    renderer.recordFlightJudgment('perfect'); renderer.renderFrame(1070, 16); renderer.recordExplicitPlaybackPosition(1000);
    renderer.renderFrame(2070, 100); renderer.recordExplicitPlaybackPosition(2000);
    const prefix = { ...fields.flightAltitudeState };
    renderer.recordFlightJudgment('miss'); renderer.renderFrame(4070, 100); renderer.recordExplicitPlaybackPosition(4000);
    expect(fields.flightAltitudeState).not.toEqual(prefix);
    const obsolete = new Container(); fields.effectLayer.addChild(obsolete);
    renderer.restoreExplicitPlaybackState(2000, 1);
    expect(fields.flightAltitudeState).toEqual(prefix);
    expect(obsolete.destroyed).toBe(true); expect(reset).toHaveBeenCalledOnce();
    expect(show).not.toHaveBeenCalled(); expect(bomb).not.toHaveBeenCalled();
    expect(fields.gearGauge.snapNext).toHaveBeenCalledOnce();
    renderer.setChartVisible(false); renderer.renderFrame(2070, 3000);
    expect(fields.flightAltitudeState).toEqual(prefix);
    renderer.setChartVisible(true); renderer.renderFrame(2080, 10);
    expect(fields.flightAltitudeState.offset).toBeGreaterThan(prefix.offset);
    renderer.recordExplicitPlaybackPosition(2010);
    renderer.restoreExplicitPlaybackState(2000, 1);
    expect(fields.flightAltitudeState).toEqual(prefix);
    renderer.restoreExplicitPlaybackState(0, 1);
    expect(fields.flightAltitudeState).toEqual({ offset: 0, recoveryVelocityPerSecond: 0 });
  });

  it('1000～2000ms 바디 뷰를1500～2000ms로 바꾸면 높이100px만 줄고 같은 renderer·고도·점수 상태를 보존한다', async () => {
    const { renderer, scene, explicitSkin, document, compiled, session } = await setup();
    renderer.setExplicitChart(compiled, explicitSkin, () => session.snapshot, document, 4000);
    renderer.scrollSpeed = 200; renderer.renderFrame(1500, 0);
    const explicit = scene.explicitNoteRenderer!;
    const beforeHeight = sprites(explicit.root, 'body')[0].height;
    renderer.recordFlightJudgment('miss');
    const field = renderer as unknown as { flightAltitudeState: unknown };
    const altitude = field.flightAltitudeState;
    const snapshot = session.snapshot;
    renderer.setExplicitPlaybackChart(createExplicitPlaybackChartView(compiled, 1500, compiled.scoreItems));
    renderer.renderFrame(1500, 0);
    expect(scene.explicitNoteRenderer).toBe(explicit);
    expect(sprites(explicit.root, 'body')[0].height).toBeCloseTo(beforeHeight - 100);
    expect(field.flightAltitudeState).toBe(altitude);
    expect(session.snapshot).toEqual(snapshot);
    expect(compiled.bodies[0].startMs).toBe(1000);
  });

  it('음악 준비 중 차트를 숨기면 snapshot을 읽지 않고 판정선·노트를 숨기며 기어·키 레이어를 유지하고 재개 때 복원한다', async () => {
    const { renderer, scene, explicitSkin, document, compiled, session } = await setup();
    const query = vi.fn(() => session.snapshot);
    renderer.setExplicitChart(compiled, explicitSkin, query, document, 4000);
    renderer.renderFrame(1000, 0); query.mockClear();
    renderer.setChartVisible(false); renderer.renderFrame(500, 16);
    expect(query).not.toHaveBeenCalled();
    expect(scene.explicitNoteRenderer!.root.visible).toBe(false);
    const layers = scene as unknown as Record<string, Container>;
    const chartLayers = ['measureLineLayer', 'restZoneLayer', 'trillZoneLayer', 'noteLayer', 'eventMessageText', 'judgmentLineGraphic'];
    for (const name of chartLayers) {
      expect(layers[name].visible).toBe(false);
    }
    expect(layers.keyBeamLayer.visible).toBe(true);
    expect(layers.gearLayer.visible).toBe(true);
    renderer.setChartVisible(true); renderer.renderFrame(1500, 0);
    expect(query).toHaveBeenCalledOnce();
    expect(scene.explicitNoteRenderer!.root.visible).toBe(true);
    for (const name of chartLayers) expect(layers[name].visible).toBe(true);
  });

  it('setExplicitChart는 G1 실제 renderer와 snapshot query를 사용하며 legacy NoteRenderData에는 새 노트를 넣지 않는다', async () => {
    const { renderer, scene, explicitSkin, document, compiled, session } = await setup();
    const query = vi.fn(() => session.snapshot);
    renderer.setExplicitChart(compiled, explicitSkin, query, document, 4000);
    renderer.scrollSpeed = 200; renderer.renderFrame(1000, 0);
    expect(scene.noteRenderData).toEqual([]);
    expect(scene.explicitNoteRenderer).toBeInstanceOf(ExplicitNoteRenderer);
    expect(query).toHaveBeenCalledOnce();
    expect(sprites(scene.explicitNoteRenderer!.root, 'body')).toHaveLength(1);
    expect(sprites(scene.explicitNoteRenderer!.root, 'tick')).toHaveLength(2);
    expect(sprites(scene.explicitNoteRenderer!.root, 'tap')).toHaveLength(2);
  });

  it('prepareForPlayback은 아직 보이지 않는 failed·Grace 포함 explicit 34개 소스를 업로드하고 dispose는 GC와 공유 원본을 보존한다', async () => {
    const { renderer, explicitSkin, document, compiled, session, loaded, initSource } = await setup();
    for (const texture of loaded.values()) texture.source.autoGarbageCollect = true;
    renderer.setExplicitChart(compiled, explicitSkin, () => session.snapshot, document, 4000);
    renderer.prepareForPlayback(0);
    expect(initSource).toHaveBeenCalledTimes(34);
    expect(new Set(initSource.mock.calls.map(call => call[0]))).toEqual(new Set([...loaded.values()].map(texture => texture.source)));
    expect([...loaded.values()].every(texture => !texture.source.autoGarbageCollect)).toBe(true);
    renderer.dispose(false);
    expect([...loaded.values()].every(texture => texture.source.autoGarbageCollect && !texture.destroyed)).toBe(true);
  });

  it('실제 double 한 키 성공·다른 몫 실패는 alpha0.7 body와 실패 tick 하나로 보이며 lift와 스크롤·culling을 따른다', async () => {
    const { renderer, scene, explicitSkin, document, compiled, session } = await setup();
    renderer.setExplicitChart(compiled, explicitSkin, () => session.snapshot, document, 4000); renderer.scrollSpeed = 200;
    session.processBatch(1000, [{ lane: 1, key: 'Q', type: 'down' }]); session.advance(1500);
    renderer.renderFrame(1500, 0);
    const explicit = scene.explicitNoteRenderer!;
    expect(session.snapshot.bodyUnits.map(unit => unit.state).sort()).toEqual(['active', 'failed']);
    expect(sprites(explicit.root, 'body')[0].alpha).toBe(1);
    expect(sprites(explicit.root, 'tick')).toHaveLength(1);
    const before = sprites(explicit.root, 'body')[0].y;
    renderer.setLift(50); renderer.renderFrame(1500, 0);
    expect(sprites(explicit.root, 'body')[0].y).toBeCloseTo(before - 50);
    renderer.renderFrame(1600, 0);
    expect(sprites(explicit.root, 'body')[0].y).toBeCloseTo(before - 30);
    session.advance(2000); renderer.renderFrame(2000, 0);
    expect(sprites(explicit.root, 'body')[0].alpha).toBe(.7);
    renderer.renderFrame(8000, 0); expect(explicit.spriteCount).toBe(0);
  });

  it('명시 차트 뒤 legacy setChart는 explicit 계층과 query를 해제하고 구형 single만 구형 renderer에 전달한다', async () => {
    const { renderer, scene, explicitSkin, document, compiled, session } = await setup();
    const query = vi.fn(() => session.snapshot);
    renderer.setExplicitChart(compiled, explicitSkin, query, document, 4000); renderer.renderFrame(0, 0);
    const explicit = scene.explicitNoteRenderer!;
    const notes = [{ type: 'single' as const, lane: 1 as const, beat: beat(2) }];
    const legacy = { ...document, notes };
    renderer.setChart(notes, [], [], legacy.events, createChartTiming(legacy), 4000);
    const render = vi.spyOn(scene.noteRenderer, 'renderPointNote').mockImplementation(() => {});
    renderer.renderFrame(1000, 0);
    expect(explicit.root.destroyed).toBe(true); expect(scene.explicitNoteRenderer).toBeNull();
    expect(query).toHaveBeenCalledOnce(); expect(render).toHaveBeenCalledWith(notes[0], 0, 1000, 1000);
  });

  it('명시 same-group 글자 갱신은 JudgmentUI로 원본 state를 전달하고 비율null은 무점수 HUD를 비운다', async () => {
    const { renderer } = await setup();
    const fields = renderer as unknown as { judgmentUI: { showJudgmentGroup: () => void }; accuracyText: { text: string } };
    const show = vi.spyOn(fields.judgmentUI, 'showJudgmentGroup');
    const session = new ExplicitJudgmentSession(compileExplicitJudgmentChart(explicitPlaytestCharts[0].chart));
    session.processBatch(1000, [{ lane: 1, key: 'Q', type: 'down' }]);
    renderer.showJudgmentGroup(session.display!);
    expect(show).toHaveBeenCalledWith(session.display);
    renderer.updateAccuracy(null); expect(fields.accuracyText.text).toBe('');
    renderer.updateAccuracy(99.5); expect(fields.accuracyText.text).toBe('99.50%');
  });
});
