import type { Page } from '@playwright/test';

export async function canvasPosition(page: Page, lane: number, at: number) {
  const box = (await page.locator('canvas').boundingBox())!;
  return page.evaluate(async ({ box, lane, at }) => {
    const storePath = '/src/editor/stores/editorStore.ts';
    const constantsPath = '/src/editor/timeline/constants.ts';
    const viewportPath = '/src/editor/timeline/timelineViewport.ts';
    const projectionPath = '/src/editor/timeline/timelineProjection.ts';
    const geometryPath = '/src/editor/timeline/laneGeometry.ts';
    const [{ useEditorStore }, constants, viewport, projection, geometry] = await Promise.all([
      import(storePath), import(constantsPath), import(viewportPath), import(projectionPath), import(geometryPath),
    ]);
    const state = useEditorStore.getState();
    const range = state.timelineRangeMs;
    const contentHeight = Math.max(box.height, projection.getTimelineTotalHeight({ ...range, zoom: state.zoom, padding: constants.TIMELINE_PADDING }));
    const centerShiftX = viewport.getContentCenterShiftX({ viewportWidth: box.width, leftRailWidth: constants.MEASURE_LABEL_WIDTH,
      timelineWidth: constants.TIMELINE_WIDTH + state.extraLaneCount * constants.EXTRA_LANE_WIDTH, rightRailWidth: constants.MINIMAP_WIDTH });
    return {
      x: box.x + constants.MEASURE_LABEL_WIDTH + centerShiftX - state.horizontalPanX + geometry.laneToX(lane) + geometry.laneWidth(lane) / 2,
      y: box.y + projection.timeToTimelineY({ timeMs: at * 500 + state.chart.meta.offsetMs, contentHeight,
        padding: constants.TIMELINE_PADDING, zoom: state.zoom, minTimeMs: range.minTimeMs }) - state.scrollY,
    };
  }, { box, lane, at });
}

export async function drag(page: Page, lane: number, start: number, end: number, cancel = false) {
  const a = await canvasPosition(page, lane, start); const b = await canvasPosition(page, lane, end);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 5 });
  if (cancel) await page.keyboard.press('Escape');
  await page.mouse.up();
}

export async function notes(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/editor/stores/editorStore.ts';
    const chart: import('../../src/shared/types').ChartDocument = (await import(path)).useEditorStore.getState().chart;
    const beatPath = '/src/shared/types/beat.ts';
    const { beat } = await import(beatPath);
    return chart.notes.map(note => ({ ...note, beat: beat(note.beat.n, note.beat.d), ...('endBeat' in note ? { endBeat: beat(note.endBeat.n, note.endBeat.d) } : {}) }));
  });
}
