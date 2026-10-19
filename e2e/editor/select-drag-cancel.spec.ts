import { test, expect, type Page } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });
// swiftshader 렌더라 드래그 프레임마다 전체 렌더가 느리다 — 부하가 큰 기계에서도 끝나도록 여유를 둔다.
test.describe.configure({ timeout: 120_000 });

// 진행 중 select 드래그가 취소 경로(Esc·모드 전환·undo·pointercancel·캔버스 밖에서 버튼 떼기·드래그 중 삭제)마다
// 끝나는지 본다.
// 노트 0 = lane 1·beat 1, 노트 1 = lane 3·beat 2. 120 BPM이라 1박 = 500ms이고, 기본 스냅(4)은 1박 단위다.
const SONG_ID = 'select-drag-cancel-check';
const chart = {
  version: 3,
  meta: { title: 'Select drag cancel check', artist: 'Offline', difficultyLabel: 'NORMAL', difficultyLevel: 5, imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
  notes: [{ type: 'single', lane: 1, beat: '1' }, { type: 'single', lane: 3, beat: '2' }],
  trillZones: [], restZones: [],
  events: [{ type: 'bpm', beat: '0', bpm: 120 }, { type: 'timeSignature', beat: '0', beatPerMeasure: '4' }],
};

type NotePosition = { lane: number; beat: number };
type ZonePosition = { lane: number; beat: number; endBeat: number };
type EditorSnapshot = {
  mode: string; notes: NotePosition[]; historyFuture: number; selectedNotes: number[]; trillZones: ZonePosition[];
};

async function openEditor(
  page: Page, baseURL: string | undefined, pageErrors: string[], chartJson: object = chart,
): Promise<void> {
  page.on('pageerror', error => pageErrors.push(error.message));
  // 모든 Supabase 요청은 로컬 응답으로 끝낸다(실제 DB/Storage 접근 없음).
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    if (/^\/(rest|storage|auth)\/v1\//.test(path)) {
      if (method === 'OPTIONS') { await route.fulfill({ status: 204 }); return; }
      if (method === 'GET' && path.endsWith(`/songs/${SONG_ID}/normal.json`)) {
        await route.fulfill({ json: chartJson }); return;
      }
      if (method === 'GET' && path.endsWith(`/songs/${SONG_ID}/normal.extra.json`)) {
        await route.fulfill({ status: 404, json: { error: 'No extra chart' } }); return;
      }
      if (method === 'GET' && path === '/rest/v1/songs') {
        await route.fulfill({ json: { audio_url: null, duration: null, gameplay_start: null, gameplay_end: null } }); return;
      }
      await route.fulfill({ status: 500, json: { error: 'Unexpected offline test request' } }); return;
    }
    if (method === 'GET' && url.origin === new URL(baseURL!).origin) {
      await route.continue(); return;
    }
    await route.abort();
  });

  await page.goto(`/editor?songId=${SONG_ID}&difficulty=normal`);
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(() => readEditor(page).then(s => s.notes.length)).toBe(2);

  // 화면 좌표 계산에 쓸 TimelineRenderer 인스턴스를 잡는다 — 캔버스 위 pointermove마다 호출되는 메서드에 건다.
  await page.evaluate(async () => {
    const path = '/src/editor/timeline/TimelineRenderer.ts';
    const url = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(name => new URL(name).pathname === path) ?? path;
    const { TimelineRenderer }: typeof import('../../src/editor/timeline/TimelineRenderer') = await import(url);
    const original = TimelineRenderer.prototype.screenXToTimelineX;
    TimelineRenderer.prototype.screenXToTimelineX = function (this: InstanceType<typeof TimelineRenderer>, screenX: number) {
      (window as unknown as Record<string, unknown>).__selectDragRenderer = this;
      return original.call(this, screenX);
    };
  });
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as Record<string, unknown>).__selectDragRenderer))).toBe(true);

  await page.keyboard.press('s');
  await expect.poll(() => readEditor(page).then(s => s.mode)).toBe('select');
}

async function readEditor(page: Page): Promise<EditorSnapshot> {
  return page.evaluate(async () => {
    const path = '/src/editor/stores/editorStore.ts';
    const url = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(name => new URL(name).pathname === path) ?? path;
    const { useEditorStore }: typeof import('../../src/editor/stores/editorStore') = await import(url);
    const state = useEditorStore.getState();
    return {
      mode: state.mode,
      notes: state.chart.notes.map(note => ({ lane: note.lane, beat: note.beat.n / note.beat.d })),
      historyFuture: state.historyFuture.length,
      selectedNotes: [...state.selection.notes].sort((a, b) => a - b),
      trillZones: state.chart.trillZones.map(zone => ({
        lane: zone.lane, beat: zone.beat.n / zone.beat.d, endBeat: zone.endBeat.n / zone.endBeat.d,
      })),
    };
  });
}

async function notePosition(page: Page, index: number): Promise<NotePosition> {
  return readEditor(page).then(s => s.notes[index]);
}

/** (lane, beat) 칸 가운데의 페이지 좌표 — 120 BPM·offset 0이라 beat b = b × 500ms. */
async function pointFor(page: Page, lane: number, beat: number): Promise<{ x: number; y: number }> {
  return page.evaluate(({ lane, beat }) => {
    const renderer = (window as unknown as Record<string, unknown>).__selectDragRenderer as {
      contentOffsetX: number; scrollY: number; timeToY(timeMs: number): number;
    };
    const rect = document.querySelector('canvas')!.getBoundingClientRect();
    const LANE_WIDTH = 60;
    return {
      x: rect.left + (lane - 1) * LANE_WIDTH + LANE_WIDTH / 2 + renderer.contentOffsetX,
      y: rect.top + renderer.timeToY(beat * 500) - renderer.scrollY,
    };
  }, { lane, beat });
}

/** select 모드에서 노트 0(lane 1·beat 1)을 잡아 lane 2·beat 3으로 끈다(버튼은 누른 채로 둔다). */
async function dragNote0ToLane2Beat3(page: Page): Promise<void> {
  const from = await pointFor(page, 1, 1);
  const to = await pointFor(page, 2, 3);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 2 });
  await expect.poll(() => notePosition(page, 0)).toEqual({ lane: 2, beat: 3 });
}

test('드래그 중 Esc는 노트 0을 원위치(lane 1·beat 1)로 되돌리고, 버튼을 뗄 때까지 lane 4·beat 2로 움직여도 다시 끌지 않는다', async ({ page, baseURL }) => {
  const pageErrors: string[] = [];
  await openEditor(page, baseURL, pageErrors);
  await dragNote0ToLane2Beat3(page);

  await page.keyboard.press('Escape');
  await expect.poll(() => notePosition(page, 0)).toEqual({ lane: 1, beat: 1 });

  const elsewhere = await pointFor(page, 4, 2);
  await page.mouse.move(elsewhere.x, elsewhere.y, { steps: 2 });
  await page.mouse.up();
  expect(await notePosition(page, 0)).toEqual({ lane: 1, beat: 1 });
  expect(pageErrors).toEqual([]);
});

test('드래그 중 C로 Create 모드로 바꾸면 노트 0을 원위치로 되돌리고, S로 돌아와 버튼 없이 lane 4·beat 2로 움직여도 드래그가 이어지지 않는다', async ({ page, baseURL }) => {
  const pageErrors: string[] = [];
  await openEditor(page, baseURL, pageErrors);
  await dragNote0ToLane2Beat3(page);

  await page.keyboard.press('c');
  await expect.poll(() => readEditor(page).then(s => ({ mode: s.mode, note0: s.notes[0] })))
    .toEqual({ mode: 'create', note0: { lane: 1, beat: 1 } });
  await page.mouse.up();

  await page.keyboard.press('s');
  await expect.poll(() => readEditor(page).then(s => s.mode)).toBe('select');
  const elsewhere = await pointFor(page, 4, 2);
  await page.mouse.move(elsewhere.x, elsewhere.y, { steps: 2 });
  const after = await readEditor(page);
  expect(after.notes).toEqual([{ lane: 1, beat: 1 }, { lane: 3, beat: 2 }]);
  expect(pageErrors).toEqual([]);
});

test('드래그 중 Ctrl+Z는 드래그만 취소해 노트 0을 원위치로 되돌리고, 그 전에 ↑로 한 박 옮긴 노트 1(beat 3)은 되돌리지 않는다', async ({ page, baseURL }) => {
  const pageErrors: string[] = [];
  await openEditor(page, baseURL, pageErrors);
  const note1 = await pointFor(page, 3, 2);
  await page.mouse.click(note1.x, note1.y); // 노트 1 선택
  await page.keyboard.press('ArrowUp'); // 노트 1을 한 스냅(1박) 위로 — 드래그 전 편집
  await expect.poll(() => notePosition(page, 1)).toEqual({ lane: 3, beat: 3 });
  await dragNote0ToLane2Beat3(page);

  await page.keyboard.press('Control+z');
  await expect.poll(() => readEditor(page).then(s => ({ notes: s.notes, historyFuture: s.historyFuture })))
    .toEqual({ notes: [{ lane: 1, beat: 1 }, { lane: 3, beat: 3 }], historyFuture: 0 });

  const elsewhere = await pointFor(page, 4, 2);
  await page.mouse.move(elsewhere.x, elsewhere.y, { steps: 2 });
  await page.mouse.up();
  expect(await notePosition(page, 0)).toEqual({ lane: 1, beat: 1 });
  expect(pageErrors).toEqual([]);
});

test('드래그 중 pointercancel이 오면 노트 0을 원위치로 되돌리고, 버튼을 누른 채 lane 4·beat 2로 움직여도 다시 끌지 않는다', async ({ page, baseURL }) => {
  const pageErrors: string[] = [];
  await openEditor(page, baseURL, pageErrors);
  await dragNote0ToLane2Beat3(page);

  await page.locator('canvas').dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', isPrimary: true });
  await expect.poll(() => notePosition(page, 0)).toEqual({ lane: 1, beat: 1 });

  const elsewhere = await pointFor(page, 4, 2);
  await page.mouse.move(elsewhere.x, elsewhere.y, { steps: 2 });
  await page.mouse.up();
  expect(await notePosition(page, 0)).toEqual({ lane: 1, beat: 1 });
  expect(pageErrors).toEqual([]);
});

test('줌 50에서 캔버스 밖(툴바 위)에서 버튼을 떼면 노트 0이 캔버스 위쪽 끝과 가장 가까운 박에 드롭되고, 캔버스로 돌아와 버튼 없이 움직여도 따라오지 않는다', async ({ page, baseURL }) => {
  const pageErrors: string[] = [];
  await openEditor(page, baseURL, pageErrors);
  // 줌 50(1박 = 25px)이면 툴바까지 나간 거리(약 55px)가 2박을 넘어, 클램프 없이 드롭한 위치와 확실히 갈린다.
  await page.evaluate(async () => {
    const path = '/src/editor/stores/editorStore.ts';
    const url = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(name => new URL(name).pathname === path) ?? path;
    const { useEditorStore }: typeof import('../../src/editor/stores/editorStore') = await import(url);
    useEditorStore.getState().setZoom(50);
  });
  await expect.poll(() => page.evaluate(() => {
    const renderer = (window as unknown as Record<string, unknown>).__selectDragRenderer as { zoom: number };
    return renderer.zoom;
  })).toBe(50);
  await dragNote0ToLane2Beat3(page);
  const canvasTopBeat = await page.evaluate(() => {
    const renderer = (window as unknown as Record<string, unknown>).__selectDragRenderer as { yToTime(y: number): number };
    return renderer.yToTime(0) / 500;
  });

  const lane2Beat3 = await pointFor(page, 2, 3);
  await page.mouse.move(lane2Beat3.x, 2, { steps: 2 }); // 캔버스 위쪽 툴바로 나간다
  await page.mouse.up();
  const dropped = await notePosition(page, 0);
  expect(dropped).toEqual({ lane: 2, beat: Math.round(canvasTopBeat) });

  const elsewhere = await pointFor(page, 4, 2);
  await page.mouse.move(elsewhere.x, elsewhere.y, { steps: 2 });
  expect(await notePosition(page, 0)).toEqual(dropped);
  expect(pageErrors).toEqual([]);
});

test('노트 0을 선택한 채 터치로 노트 0·1을 감싸는 박스를 끌다 Esc로 취소하면 선택이 노트 0으로 돌아오고, 같은 손가락의 이후 move·up이 박스를 다시 그리지 않는다', async ({ page, baseURL }) => {
  const pageErrors: string[] = [];
  await openEditor(page, baseURL, pageErrors);
  const note0 = await pointFor(page, 1, 1);
  await page.mouse.click(note0.x, note0.y);
  await expect.poll(() => readEditor(page).then(s => s.selectedNotes)).toEqual([0]);

  // CDP 터치 — touch pointermove는 애니메이션 프레임에 맞춰 전달되므로 보낼 때마다 다음 프레임까지 기다린다.
  const client = await page.context().newCDPSession(page);
  const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', point?: { x: number; y: number }) => {
    await client.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [{ x: point.x, y: point.y, id: 1 }] : [] });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  };
  const start = await pointFor(page, 4, 0.5); // 빈 곳
  const middle = await pointFor(page, 3, 1.5);
  const end = await pointFor(page, 1, 2.5); // 레인 1~4 × 박 0.5~2.5 → 노트 0·1을 감싼다
  await touch('touchStart', start);
  await touch('touchMove', middle);
  await touch('touchMove', end);
  await expect.poll(() => readEditor(page).then(s => s.selectedNotes)).toEqual([0, 1]);

  await page.keyboard.press('Escape');
  await expect.poll(() => readEditor(page).then(s => s.selectedNotes)).toEqual([0]);

  const further = await pointFor(page, 1, 3);
  await touch('touchMove', further);
  expect((await readEditor(page)).selectedNotes).toEqual([0]);
  await touch('touchEnd');
  expect((await readEditor(page)).selectedNotes).toEqual([0]);
  expect(pageErrors).toEqual([]);
});

test('노트 1을 lane 4·beat 3으로 끌던 중 Delete를 누르면 원위치(lane 3·beat 2)에서 지워지고, 이어진 움직임이 throw하지 않으며 Ctrl+Z가 노트 1을 원위치로 되살린다', async ({ page, baseURL }) => {
  const pageErrors: string[] = [];
  await openEditor(page, baseURL, pageErrors);
  const from = await pointFor(page, 3, 2);
  const to = await pointFor(page, 4, 3);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 2 });
  await expect.poll(() => notePosition(page, 1)).toEqual({ lane: 4, beat: 3 });

  await page.keyboard.press('Delete');
  await expect.poll(() => readEditor(page).then(s => s.notes)).toEqual([{ lane: 1, beat: 1 }]);
  const elsewhere = await pointFor(page, 2, 3);
  await page.mouse.move(elsewhere.x, elsewhere.y, { steps: 2 });
  await page.mouse.up();
  expect((await readEditor(page)).notes).toEqual([{ lane: 1, beat: 1 }]);

  await page.keyboard.press('Control+z');
  await expect.poll(() => readEditor(page).then(s => s.notes)).toEqual([{ lane: 1, beat: 1 }, { lane: 3, beat: 2 }]);
  expect(pageErrors).toEqual([]);
});

test('노트 1을 lane 4·beat 3으로 끌던 중 그 자리를 우클릭하면 드래그가 먼저 원위치(lane 3·beat 2)로 돌아가 아무것도 지워지지 않고, 이어진 움직임이 throw하지 않는다', async ({ page, baseURL }) => {
  const pageErrors: string[] = [];
  await openEditor(page, baseURL, pageErrors);
  const from = await pointFor(page, 3, 2);
  const to = await pointFor(page, 4, 3);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 2 });
  await expect.poll(() => notePosition(page, 1)).toEqual({ lane: 4, beat: 3 });

  await page.mouse.down({ button: 'right' });
  await page.mouse.up({ button: 'right' });
  const elsewhere = await pointFor(page, 2, 3);
  await page.mouse.move(elsewhere.x, elsewhere.y, { steps: 2 });
  await page.mouse.up();

  expect((await readEditor(page)).notes).toEqual([{ lane: 1, beat: 1 }, { lane: 3, beat: 2 }]);
  expect(pageErrors).toEqual([]);
});

/** 노트 1(lane 3·beat 2)을 클릭해 선택하고 Ctrl+C로 복사한다. 붙여넣기는 재생 커서(0박)에 들어간다. */
async function copyNote1(page: Page): Promise<void> {
  const note1 = await pointFor(page, 3, 2);
  await page.mouse.click(note1.x, note1.y);
  await expect.poll(() => readEditor(page).then(s => s.selectedNotes)).toEqual([1]);
  await page.keyboard.press('Control+c');
}

test('노트 1을 복사하고 노트 0을 끌던 중 Ctrl+V를 누르면 드래그가 먼저 원위치로 돌아가 붙여넣기만 대기하고, ↑가 붙여넣은 노트를 throw 없이 옮기며 Esc가 끌던 위치를 되살리지 않는다', async ({ page, baseURL }) => {
  const pageErrors: string[] = [];
  await openEditor(page, baseURL, pageErrors);
  await copyNote1(page);
  await dragNote0ToLane2Beat3(page);

  await page.keyboard.press('Control+v');
  await expect.poll(() => readEditor(page).then(s => s.notes))
    .toEqual([{ lane: 1, beat: 1 }, { lane: 3, beat: 2 }, { lane: 3, beat: 0 }]);
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => notePosition(page, 2)).toEqual({ lane: 3, beat: 1 });

  await page.keyboard.press('Escape');
  await expect.poll(() => readEditor(page).then(s => s.notes)).toEqual([{ lane: 1, beat: 1 }, { lane: 3, beat: 2 }]);
  await page.mouse.up();
  expect((await readEditor(page)).notes).toEqual([{ lane: 1, beat: 1 }, { lane: 3, beat: 2 }]);
  expect(pageErrors).toEqual([]);
});

test('노트 1을 복사하고 노트 0을 끌던 중 Ctrl+V·Enter로 붙여넣기를 확정하면, 이어진 Esc가 확정한 붙여넣기(lane 3·beat 0)를 지우지 않는다', async ({ page, baseURL }) => {
  const pageErrors: string[] = [];
  await openEditor(page, baseURL, pageErrors);
  await copyNote1(page);
  await dragNote0ToLane2Beat3(page);

  await page.keyboard.press('Control+v');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.mouse.up();

  await expect.poll(() => readEditor(page).then(s => s.notes))
    .toEqual([{ lane: 1, beat: 1 }, { lane: 3, beat: 2 }, { lane: 3, beat: 0 }]);
  expect(pageErrors).toEqual([]);
});

test('스냅 4에서 노트 0을 lane 2·beat 3으로 끈 뒤 ↑·Enter로 lane 2·beat 4를 확정하면, 버튼을 떼기 전 Esc가 확정한 위치를 되돌리지 않는다', async ({ page, baseURL }) => {
  const pageErrors: string[] = [];
  await openEditor(page, baseURL, pageErrors);
  await dragNote0ToLane2Beat3(page);

  await page.keyboard.press('ArrowUp');
  await expect.poll(() => notePosition(page, 0)).toEqual({ lane: 2, beat: 4 });
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  expect(await notePosition(page, 0)).toEqual({ lane: 2, beat: 4 });

  await page.mouse.up();
  expect(await notePosition(page, 0)).toEqual({ lane: 2, beat: 4 });
  expect(pageErrors).toEqual([]);
});

test('노트 1을 선택한 채 빈 곳에서 노트 0만 감싸는 박스를 끌다 Delete를 누르면 강조된 노트 0이 지워지고 노트 1(lane 3·beat 2)은 남는다', async ({ page, baseURL }) => {
  const pageErrors: string[] = [];
  await openEditor(page, baseURL, pageErrors);
  const note1 = await pointFor(page, 3, 2);
  await page.mouse.click(note1.x, note1.y);
  await expect.poll(() => readEditor(page).then(s => s.selectedNotes)).toEqual([1]);

  const start = await pointFor(page, 2, 0.5); // 빈 곳
  const end = await pointFor(page, 1, 1.5); // 레인 1~2 × 박 0.5~1.5 → 노트 0만 감싼다
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 2 });
  await expect.poll(() => readEditor(page).then(s => s.selectedNotes)).toEqual([0]);

  await page.keyboard.press('Delete');
  await expect.poll(() => readEditor(page).then(s => s.notes)).toEqual([{ lane: 3, beat: 2 }]);
  await page.mouse.up();
  expect((await readEditor(page)).notes).toEqual([{ lane: 3, beat: 2 }]);
  expect(pageErrors).toEqual([]);
});

test('선택한 trillZone(lane 2·beat 0~8)을 터치로 beat 2에서 3으로 끌다 Enter로 1~9에 확정하면, 손을 떼기 전 beat 4로 움직여도 확정한 드래그가 다시 시작되지 않는다', async ({ page, baseURL }) => {
  const pageErrors: string[] = [];
  await openEditor(page, baseURL, pageErrors, { ...chart, trillZones: [{ lane: 2, beat: '0', endBeat: '8' }] });
  const zoneBody = await pointFor(page, 2, 4);
  await page.mouse.click(zoneBody.x, zoneBody.y); // 미선택 몸통 탭 = 구간 유닛 선택
  await expect.poll(() => readEditor(page).then(s => s.trillZones)).toEqual([{ lane: 2, beat: 0, endBeat: 8 }]);

  // CDP 터치 — touch pointermove는 애니메이션 프레임에 맞춰 전달되므로 보낼 때마다 다음 프레임까지 기다린다.
  const client = await page.context().newCDPSession(page);
  const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', point?: { x: number; y: number }) => {
    await client.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [{ x: point.x, y: point.y, id: 1 }] : [] });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  };
  await touch('touchStart', await pointFor(page, 2, 2));
  await touch('touchMove', await pointFor(page, 2, 2.6));
  await touch('touchMove', await pointFor(page, 2, 3));
  await expect.poll(() => readEditor(page).then(s => s.trillZones)).toEqual([{ lane: 2, beat: 1, endBeat: 9 }]);

  await page.keyboard.press('Enter');
  await touch('touchMove', await pointFor(page, 2, 4));
  expect((await readEditor(page)).trillZones).toEqual([{ lane: 2, beat: 1, endBeat: 9 }]);
  await touch('touchEnd');
  expect((await readEditor(page)).trillZones).toEqual([{ lane: 2, beat: 1, endBeat: 9 }]);
  expect(pageErrors).toEqual([]);
});
