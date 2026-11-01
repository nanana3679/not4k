import { expect, type Page } from '@playwright/test';
import { serializeChart, serializeExtraNotes } from '../src/shared/chart';
import { auxNotesAsExtra } from '../src/shared/chart/auxAdapter';
import type { ChartDocument } from '../src/shared/types/chart';
import type { DbSong } from '../src/game/screens/songSelect/types';
import { installProbe } from './explicitPlaybackProbe';

export const SONG_ID = 'normal-explicit-e2e';
const b = (n: number) => ({ n, d: 1 });

/** 새로 저작한 E2E 문서. 저장된 구형 노트를 실행 시 변환하지 않는다. */
export function normalDocument(auto = true): ChartDocument {
  return {
    meta: { title: 'Normal explicit route', artist: 'Offline E2E', difficultyLabel: 'NORMAL', difficultyLevel: 3,
      imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
    notes: [
      { type: 'tap', kind: 'single', lane: 1, beat: b(2) },
      { type: 'body', holdCount: 1, lane: 1, beat: b(2), endBeat: b(4) },
      { type: 'tick', count: 1, lane: 1, beat: b(3) },
      { type: 'release', count: 1, lane: 1, beat: b(4) },
      { type: 'tap', kind: 'single', lane: 2, beat: b(6) },
      // aux의 구형 원문은 읽고 보존하지만 일반 플레이의 점수에는 들어가지 않는다.
      { type: 'long', lane: 5, beat: b(2), endBeat: b(4), holdOnly: true },
    ],
    trillZones: [], restZones: [],
    events: [{ type: 'bpm', beat: b(0), bpm: 120, editorLane: 1 },
      { type: 'timeSignature', beat: b(0), beatPerMeasure: b(4), editorLane: 2 },
      ...(auto ? [{ type: 'auto' as const, beat: b(0), endBeat: b(12), editorLane: 3 }] : [])],
  };
}

function silentWav(seconds: number): Buffer {
  const rate = 8000;
  const bytes = Math.ceil(rate * seconds) * 2;
  const wav = Buffer.alloc(44 + bytes);
  wav.write('RIFF'); wav.writeUInt32LE(36 + bytes, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(bytes, 40);
  return wav;
}

export interface NormalFixtureOptions {
  duration?: number;
  playSpeed?: number;
  range?: { startTime: number; endTime: number; fadeInTime: number; fadeOutTime: number };
  holdChart?: Promise<void>;
}

/** 실제 곡 선택/문서 로더 경로. 네트워크 읽기만 대체하고 play/score/clock은 그대로 실행한다. */
export async function openNormalSong(page: Page, document = normalDocument(), options: NormalFixtureOptions = {}) {
  const duration = options.duration ?? 4;
  const mainText = serializeChart({ ...document, notes: document.notes.filter(note => note.lane <= 4) });
  const auxText = serializeExtraNotes(auxNotesAsExtra(document.notes), 1);
  const reads: string[] = [];
  const unexpected: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const song: DbSong = { id: SONG_ID, title: document.meta.title, artist: document.meta.artist,
    audio_url: `songs/${SONG_ID}/audio.wav`, preview_url: `songs/${SONG_ID}/preview.wav`,
    timing: null, revision: 1,
    duration, preview_start: null, preview_end: null, jacket_url: null,
    gameplay_start: options.range?.startTime ?? null, gameplay_end: options.range?.endTime ?? null,
    gameplay_fade_in: options.range?.fadeInTime ?? null, gameplay_fade_out: options.range?.fadeOutTime ?? null,
    charts: [{ id: `${SONG_ID}-normal`, song_id: SONG_ID, difficulty_label: 'normal', difficulty_level: 3 }] };
  await page.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
    if (/^\/(rest|storage|auth)\/v1\//.test(path)) {
      reads.push(`${request.method()} ${path}`);
      if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204 }); return; }
      if (request.method() === 'GET') {
        if (path === '/rest/v1/songs') { await route.fulfill({ json: [song] }); return; }
        if (path.endsWith(`/songs/${SONG_ID}/normal.json`)) {
          await options.holdChart;
          await route.fulfill({ contentType: 'application/json', body: mainText }); return;
        }
        if (path.endsWith(`/songs/${SONG_ID}/normal.extra.json`)) {
          await route.fulfill({ contentType: 'application/json', body: auxText }); return;
        }
        if (path.endsWith(`/songs/${SONG_ID}/audio.wav`)) {
          await route.fulfill({ contentType: 'audio/wav', body: silentWav(duration) }); return;
        }
        if (/\/(preview\.wav|jacket\.[^/]+)$/.test(path)) { await route.fulfill({ status: 404 }); return; }
      }
      unexpected.push(`${request.method()} ${path}`);
      await route.fulfill({ status: 500, body: 'Unexpected offline request' }); return;
    }
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') { await route.continue(); return; }
    await route.abort();
  });
  await page.addInitScript(playSpeed => localStorage.setItem('not4k-settings', JSON.stringify({ state: { settings: {
    isFirstLaunch: false, masterVolume: 0, renderHeight: 600, scrollSpeed: 200, gearMotion: false,
    playSpeed, skinId: 'classic', inputOffsetMs: 0, visualOffsetMs: 0,
  } }, version: 0 })), options.playSpeed ?? 1);
  await page.goto('/game');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Song Select', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await installProbe(page);
  return { document, mainText, auxText, reads, unexpected, errors };
}

export async function readNormalState(page: Page) {
  return page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(url => new URL(url).pathname === '/src/game/stores/gameStore.ts') ?? '/src/game/stores/gameStore.ts';
    const { useGameStore } = await import(/* @vite-ignore */ path) as typeof import('../src/game/stores/gameStore');
    const state = useGameStore.getState();
    return { screen: state.screen, result: state.lastResult, request: state.normalPlay && {
      document: state.normalPlay.document, startTimeMs: state.normalPlay.startTimeMs,
    }, selectedSongId: state.selectedSongId, range: state.selectedPlaybackRange };
  });
}

export async function startNormalSong(page: Page) {
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByTestId('gameplay-canvas')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-phase', 'playing', { timeout: 30000 });
}
