import { describe, expect, it } from "vitest";
import { Container, type Graphics } from "pixi.js";
import { OverlayRenderer, type OverlayHost } from "./OverlayRenderer";
import { createTimelineLayout, getEditorTimelineLayoutConfig, type TimelineLayout } from "./TimelineLayout";
import { beat } from "../../shared";

function hostWithLayout(layout: TimelineLayout): OverlayHost {
  return {
    layout, extraLaneCount: layout.auxiliaryLaneCount,
    chart: { meta: { title: '', artist: '', difficultyLabel: 'NORMAL', difficultyLevel: 1,
      imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 }, notes: [], events: [], trillZones: [] },
    selectedNotes: new Set(), selectedTrillZones: new Set(), selectedRestZones: new Set(),
    resizeHoverNoteIndex: null, violatingNoteIndices: new Set(), violatingTrillZoneIndices: new Set(),
    violatingRestZoneIndices: new Set(), violatingEventIndices: new Set(),
    moveOrigins: null, boxSelectRect: null, scrollY: 0, contentOffsetX: 0,
    cachedBpmChanges: [{ beat: beat(0), bpm: 120 }],
    getVisibleTimeRange: () => ({ minTimeMs: 0, maxTimeMs: 10000 }), timeToY: ms => ms / 10,
    ghostLayer: new Container(), hoverLayer: new Container(), violationLayer: new Container(),
    moveOriginLayer: new Container(), boxSelectLayer: new Container(),
    noteRenderer: {} as OverlayHost['noteRenderer'],
  };
}

describe('OverlayRenderer 가로 배치', () => {
  it('bpm 열이 x=0·폭 40px이면 1000ms BPM 고스트를 그 열에 그린다', () => {
    const host = hostWithLayout(createTimelineLayout({ auxiliaryLaneCount: 2, songCommonColumns: [{ id: 'bpm', width: 40 }] }));
    const renderer = new OverlayRenderer(host);
    renderer.showGhostEvent({ type: 'bpm' }, 1000);
    const bounds = (host.ghostLayer.children[0] as Graphics).getLocalBounds();
    expect(bounds.minX).toBe(0);
    expect(bounds.width).toBe(40);
    expect(bounds.minY).toBe(94);
    expect(bounds.height).toBe(12);
  });

  it('에디터 배치의 박자 고스트는 timeSignature 열 x=60·폭 48px에 그린다', () => {
    const host = hostWithLayout(createTimelineLayout(getEditorTimelineLayoutConfig(2)));
    new OverlayRenderer(host).showGhostEvent({ type: 'timeSignature' }, 1000);
    const bounds = (host.ghostLayer.children[0] as Graphics).getLocalBounds();
    expect(bounds.minX).toBe(60);
    expect(bounds.width).toBe(48);
  });

  it('곡 공통 열이 없는 배치의 BPM 고스트는 그리지 않고 이전 고스트도 지운다', () => {
    const host = hostWithLayout(createTimelineLayout({ auxiliaryLaneCount: 2 }));
    const renderer = new OverlayRenderer(host);
    renderer.showGhostEvent({ type: 'text' }, 1000);
    renderer.showGhostEvent({ type: 'bpm' }, 1000);
    expect(host.ghostLayer.children).toHaveLength(0);
  });
});

it('song-common 폭 120px에서 editorLane=2 text 고스트를 그리면 x=420·폭 60px이다', () => {
  const host = hostWithLayout(createTimelineLayout({ auxiliaryLaneCount: 2,
    songCommonColumns: [{ id: 'bpm', width: 60 }, { id: 'timeSignature', width: 60 }] }));
  new OverlayRenderer(host).showGhostEvent({ type: 'text', editorLane: 2 }, 1000);
  const bounds = (host.ghostLayer.children[0] as Graphics).getLocalBounds();
  expect(bounds.minX).toBe(420);
  expect(bounds.width).toBe(60);
});

it('song-common x=0·폭 40px부터 메인 1번 x=90·폭 60px까지 박스 프리뷰를 그리면 사각형 폭은 150px이다', () => {
  const host: OverlayHost = { ...hostWithLayout(createTimelineLayout({ auxiliaryLaneCount: 2,
    songCommonColumns: [{ id: 'bpm', width: 40 }, { id: 'timeSignature', width: 50 }] })),
    scrollY: 20,
    boxSelectRect: { startRange: { x: 90, width: 60 }, startY: 100,
      endRange: { x: 0, width: 40 }, endY: 200 },
  };
  new OverlayRenderer(host).renderBoxSelectRect();
  const graphics = host.boxSelectLayer.children[0] as Graphics;
  const fill = graphics.context.instructions.find(instruction => instruction.action === 'fill')!;
  const path = (fill.data as { path: import('pixi.js').GraphicsPath }).path;
  const rect = path.shapePath.shapePrimitives[0].shape as import('pixi.js').Rectangle;
  expect({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })
    .toEqual({ x: 0, y: 120, width: 150, height: 100 });
});
