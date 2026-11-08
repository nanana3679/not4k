import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Children, createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MetaEditModal } from './components/MetaEditModal';
import { openEditorChart } from './openEditorChart';
import { loadEditorChartAsset } from './chartAssetLoad';
import { toSavedChartJson } from './savedChart';
import { selectCanUndo, useEditorStore } from './stores/editorStore';
import { isSongDirty } from './songState';
import { saveEditorSong } from './saveEditorSong';
import { editSongAudio, editSongJacket, editPreviewRange, discardSongInfoChanges, editSongTitle } from './songInfoEditing';
import { SONG_SAVE_COPY } from './editorCopy';
import type { LoadedSongSharedData } from '../supabase/songSharedData';

const api = vi.hoisted(() => ({ rpc: vi.fn(), upload: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn() }));
vi.mock('../supabase/client', () => ({ supabase: {
  rpc: api.rpc, from: api.from,
  storage: { from: () => ({ upload: api.upload, getPublicUrl: (path: string) => ({ data: { publicUrl: `https://offline.test/${path}` } }) }) },
} }));
vi.mock('../shared/toast', () => ({ showToast: vi.fn() }));
import { showToast } from '../shared/toast';
const state = () => useEditorStore.getState();
const base = useEditorStore.getInitialState().chart;
const song = { title: '곡', artist: '작곡가', jacketUrl: 'old.jpg', audioUrl: 'old.ogg', duration: 120,
  previewUrl: 'old.wav', previewStart: 10, previewEnd: 20, gameplayStart: 2, gameplayEnd: 110,
  gameplayFadeIn: 1, gameplayFadeOut: 3, timing: { bpmChanges: [{ beat: '0', bpm: 120 }],
    timeSignatureChanges: [{ beat: '0', beatPerMeasure: '4' }], offsetMs: 25 }, revision: 42 };
function open(timing: unknown = song.timing) {
  const loaded = { ...song, timing };
  openEditorChart(loadEditorChartAsset(toSavedChartJson(base, 2).chartJson, null, loaded), loaded);
  state().setActiveSongId('song');
}
const editTitle = (title: string) => state().setChart({ ...state().chart, meta: { ...state().chart.meta, title } });
const dirty = () => isSongDirty(state().chart, state().song);
const audioBufferOf = (seconds: number) => ({ duration: seconds, length: seconds * 10, sampleRate: 10, numberOfChannels: 1,
  getChannelData: () => new Float32Array(seconds * 10) }) as unknown as AudioBuffer;
const previewRange = (startTime: number, endTime: number) => ({ startTime, endTime, fadeInTime: 0, fadeOutTime: 0 });
/** 곡 행을 다시 열어 그 행의 값으로 시작한다. */
function reopen(row: Partial<LoadedSongSharedData>) {
  const loaded = { ...song, ...row };
  openEditorChart(loadEditorChartAsset(toSavedChartJson(base, 2).chartJson, null, loaded), loaded);
  state().setActiveSongId('song');
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

beforeEach(() => {
  vi.resetAllMocks();
  useEditorStore.setState(useEditorStore.getInitialState(), true);
  api.rpc.mockResolvedValue({ data: 57, error: null });
  api.upload.mockResolvedValue({ error: null });
  api.from.mockReturnValue(api); api.select.mockReturnValue(api);
  api.eq.mockResolvedValue({ data: [], error: null });
  open();
});

describe('saveEditorSong', () => {
  it('Offset 25→45에서 다른 차트 2개 안내를 취소하면 RPC·자켓 업로드 0회이고 리비전 42와 편집을 유지한다', async () => {
    state().setChart({ ...state().chart, meta: { ...state().chart.meta, offsetMs: 45 } });
    state().setSong({ ...state().song!, pendingJacketFile: new File(['A'], 'A.png') });
    const before = state();
    api.eq.mockResolvedValue({ data: [
      { difficulty_label: base.meta.difficultyLabel.toLowerCase() },
      { difficulty_label: 'easy' }, { difficulty_label: 'hard' },
    ], error: null });
    const confirm = vi.fn(() => false);

    expect(await saveEditorSong(null, confirm)).toBe('aborted');

    expect(confirm).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('다른 차트 2개'));
    expect(api.eq).toHaveBeenCalledWith('song_id', 'song');
    expect(api.rpc).not.toHaveBeenCalled();
    expect(api.upload).not.toHaveBeenCalled();
    expect(state().chart).toBe(before.chart);
    expect(state().song).toBe(before.song);
    expect(dirty()).toBe(true);
  });

  it('리비전 42로 제목을 바꿔 저장하면 전체 곡 값으로 save_song을 호출하고 반환 리비전 57을 새 기준으로 삼는다', async () => {
    editTitle('새 제목');
    await saveEditorSong(null, vi.fn());
    expect(api.rpc).toHaveBeenCalledExactlyOnceWith('save_song', {
      p_song_id: 'song', p_expected_revision: 42, p_title: '새 제목', p_artist: '작곡가',
      p_jacket_url: 'old.jpg', p_audio_url: 'old.ogg', p_duration: 120,
      p_preview_url: 'old.wav', p_preview_start: 10, p_preview_end: 20,
      p_gameplay_start: 2, p_gameplay_end: 110, p_gameplay_fade_in: 1, p_gameplay_fade_out: 3,
      p_timing: song.timing,
    });
    expect(state().song?.revision).toBe(57);
    expect(dirty()).toBe(false);
    await saveEditorSong(null, vi.fn());
    expect(api.rpc.mock.calls[1][1].p_expected_revision).toBe(57);
  });
});

it.each([
  ['PT409', '다시 불러'], ['42501', '권한'], ['PT404', '존재하지'],
])('%s 오류로 곡 저장이 거부되면 편집 제목·리비전 42·dirty를 보존하고 %s 안내를 표시한다', async (code, message) => {
  editTitle('보존할 제목');
  api.rpc.mockResolvedValue({ data: null, error: { code, message: 'rpc failed' } });
  await saveEditorSong(null, vi.fn());
  expect(state().chart.meta.title).toBe('보존할 제목');
  expect(state().song?.revision).toBe(42);
  expect(dirty()).toBe(true);
  expect(state().isSavingSong).toBe(false);
  expect(showToast).toHaveBeenCalledWith(expect.stringContaining(message), 'error');
});

it('새 자켓 2개를 차례로 저장하면 서로 다른 새 경로에 upsert false로 올리고 각 RPC가 그 경로를 확정한다', async () => {
  for (const name of ['A.png', 'B.png']) {
    state().setSong({ ...state().song!, pendingJacketFile: new File([name], name) });
    await saveEditorSong(null, vi.fn());
    expect(dirty()).toBe(false);
  }
  const paths = api.upload.mock.calls.map(call => call[0]);
  expect(new Set(paths).size).toBe(2);
  expect(paths.every(path => /^songs\/song\/.*\.png$/.test(path) && path !== 'old.jpg')).toBe(true);
  expect(api.upload.mock.calls.every(call => call[2].upsert === false)).toBe(true);
  expect(api.rpc.mock.calls.map(call => call[1].p_jacket_url)).toEqual(paths);
});

it('오디오 A.ogg와 10～20초 프리뷰를 저장하면 새 파일 2개를 먼저 올리고 길이 150초를 함께 확정한다', async () => {
  const audio = new File(['A'], 'A.ogg');
  state().setSong({ ...state().song!, pendingAudioFile: audio, duration: 150 });
  const buffer = { duration: 150, length: 1500, sampleRate: 10, numberOfChannels: 1,
    getChannelData: () => new Float32Array(1500) } as unknown as AudioBuffer;
  await saveEditorSong(buffer, vi.fn());
  expect(api.upload).toHaveBeenCalledTimes(2);
  expect(api.upload.mock.calls[0][1]).toBe(audio);
  expect(api.rpc.mock.calls[0][1]).toMatchObject({ p_duration: 150,
    p_audio_url: api.upload.mock.calls[0][0], p_preview_url: api.upload.mock.calls[1][0] });
  expect(api.rpc.mock.invocationCallOrder[0]).toBeGreaterThan(api.upload.mock.invocationCallOrder[1]);
  expect(state().song?.pendingAudioFile).toBeNull();
  expect(dirty()).toBe(false);
});

it('자켓 업로드가 실패하면 RPC 0회이고 대기 파일·기준 리비전 42를 보존한다', async () => {
  const file = new File(['A'], 'A.png');
  state().setSong({ ...state().song!, pendingJacketFile: file });
  api.upload.mockResolvedValue({ error: { message: 'upload failed' } });
  await saveEditorSong(null, vi.fn());
  expect(api.rpc).not.toHaveBeenCalled();
  expect(state().song?.pendingJacketFile).toBe(file);
  expect(state().song?.revision).toBe(42);
});

it.each([false, true])('timing NULL에서 확인=%s이면 BPM 180인 hard만 목록에 보이고 취소 시 RPC·업로드 0회다', async accepted => {
  open(null);
  state().setSong({ ...state().song!, pendingJacketFile: new File(['A'], 'A.png') });
  const before = state();
  const raw = JSON.parse(toSavedChartJson(state().chart, 2).chartJson);
  api.eq.mockResolvedValue({ data: [
    { difficulty_label: base.meta.difficultyLabel.toLowerCase(), chart_path: null },
    { difficulty_label: 'easy', chart_path: null },
    { difficulty_label: 'hard', chart_path: 'songs/song/hard-new.json' },
  ], error: null });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const file = structuredClone(raw);
    if (url.endsWith('hard-new.json')) file.events.find((e: { type: string }) => e.type === 'bpm').bpm = 180;
    return new Response(JSON.stringify(file));
  }));
  const confirm = vi.fn<(message: string) => boolean>(() => accepted);
  expect(await saveEditorSong(null, confirm)).toBe(accepted ? 'saved' : 'migration-declined');
  expect(api.from).toHaveBeenCalledWith('charts');
  expect(api.eq).toHaveBeenCalledWith('song_id', 'song');
  expect(confirm).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('hard'));
  expect(confirm.mock.calls[0][0]).not.toContain('easy');
  expect(confirm.mock.calls[0][0]).toContain('취소하면 곡 변경은 저장하지 않고 차트만 저장합니다.');
  expect(confirm.mock.calls[0][0]).toContain('다른 차트');
  if (!accepted) {
    expect(api.rpc).not.toHaveBeenCalled(); expect(api.upload).not.toHaveBeenCalled();
    expect(state().song).toBe(before.song); expect(state().chart).toBe(before.chart);
  } else {
    expect(api.rpc).toHaveBeenCalledOnce();
    expect(state().song?.needsTimingMigration).toBe(false);
    await saveEditorSong(null, confirm);
    expect(confirm).toHaveBeenCalledOnce();
  }
  vi.unstubAllGlobals();
});

it('timing NULL에서 다른 차트 조회가 실패하면 확인·RPC 0회이고 초안이 남는다', async () => {
  open(null); editTitle('보존');
  api.eq.mockResolvedValue({ data: null, error: { message: 'read failed' } });
  const confirm = vi.fn(() => true);
  await saveEditorSong(null, confirm);
  expect(confirm).not.toHaveBeenCalled(); expect(api.rpc).not.toHaveBeenCalled();
  expect(dirty()).toBe(true);
});

it('자켓 A.png 업로드 중 B.png로 교체하면 A 경로만 저장하고 B 대기 파일·제목 편집은 남는다', async () => {
  const fileA = new File(['A'], 'A.png');
  const fileB = new File(['B'], 'B.png');
  state().setSong({ ...state().song!, pendingJacketFile: fileA });
  let finish!: (result: { error: null }) => void;
  api.upload.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const saving = saveEditorSong(null, vi.fn());
  editTitle('저장 중 수정');
  state().setSong({ ...state().song!, pendingJacketFile: fileB });
  finish({ error: null });
  await saving;
  expect(state().chart.meta.title).toBe('저장 중 수정');
  expect(state().chart.meta.imageFile).toBe('old.jpg');
  expect(state().song?.pendingJacketFile).toBe(fileB);
  expect(state().song?.baseline.title).toBe('곡');
  expect(state().song?.revision).toBe(57);
  expect(dirty()).toBe(true);
});

it.each(['완료 전', '완료 후'])('replacement.ogg 저장 중 Meta를 열고 %s 제목만 적용하면 다음 Save도 업로드 경로를 쓰고 재업로드하지 않는다', async when => {
  state().setChart({ ...state().chart, meta: { ...state().chart.meta, audioFile: 'replacement.ogg' } });
  state().setSong({ ...state().song!,
    pendingAudioFile: new File(['audio'], 'replacement.ogg'),
    pendingJacketFile: new File(['jacket'], 'replacement.png'),
  });
  const buffer = { duration: 120, length: 1200, sampleRate: 10, numberOfChannels: 1,
    getChannelData: () => new Float32Array(1200) } as unknown as AudioBuffer;
  let finish!: (result: { error: null }) => void;
  api.upload.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const saving = saveEditorSong(buffer, vi.fn());
  expect(state().isSavingSong).toBe(true);
  let apply: (() => void) | undefined;
  let editedTitle = false;
  function inspect(node: ReactNode) {
    Children.forEach(node, child => {
      if (!isValidElement<{ children?: ReactNode; value?: string; onClick?: () => void;
        onChange?: (event: { target: { value: string } }) => void }>(child)) return;
      if (child.props.value === '곡' && !editedTitle) {
        editedTitle = true;
        child.props.onChange!({ target: { value: '저장 뒤 제목' } });
      }
      if (child.props.children === 'Save') apply = child.props.onClick;
      inspect(child.props.children);
    });
  }
  function Probe() {
    const tree = MetaEditModal({ meta: state().chart.meta, audioBuffer: buffer,
      initialJacketFile: state().song!.pendingJacketFile,
      initialGameplayRange: state().song!.gameplayRange,
      onClose() {}, onLoadAudio() {},
      onSave(meta, previewRange, jacketFile, gameplayRange, audioFile) {
        const current = state();
        current.setChart({ ...current.chart, meta: { ...current.chart.meta, ...meta } });
        current.setSong({ ...current.song!,
          pendingPreviewRange: previewRange ?? current.song!.pendingPreviewRange,
          pendingJacketFile: jacketFile ?? current.song!.pendingJacketFile,
          pendingAudioFile: audioFile ?? current.song!.pendingAudioFile,
          gameplayRange: gameplayRange ?? current.song!.gameplayRange,
        });
      },
    });
    inspect(tree);
    return tree;
  }
  renderToStaticMarkup(createElement(Probe));
  if (when === '완료 전') apply!();
  finish({ error: null });
  expect(await saving).toBe('saved');
  const savedMedia = { p_jacket_url: api.upload.mock.calls[0][0],
    p_audio_url: api.upload.mock.calls[1][0], p_preview_url: api.upload.mock.calls[2][0] };

  if (when === '완료 후') apply!();
  expect(state().song).toMatchObject({ revision: 57, pendingAudioFile: null, pendingJacketFile: null });
  expect(state().chart.meta.title).toBe('저장 뒤 제목');
  expect(await saveEditorSong(buffer, vi.fn())).toBe('saved');
  expect(api.rpc.mock.calls[1][1]).toMatchObject(savedMedia);
  expect(api.upload).toHaveBeenCalledTimes(3);
  expect(dirty()).toBe(false);
});

it('리비전 42 저장 응답 중 제목을 다시 고치면 응답 57은 저장 시작 제목의 기준이 되고 최신 편집은 dirty다', async () => {
  editTitle('저장할 제목');
  let finish!: (result: { data: number; error: null }) => void;
  api.rpc.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const saving = saveEditorSong(null, vi.fn());
  editTitle('그 뒤 제목');
  await saveEditorSong(null, vi.fn());
  expect(api.rpc).toHaveBeenCalledOnce();
  finish({ data: 57, error: null }); await saving;
  expect(state().chart.meta.title).toBe('그 뒤 제목');
  expect(state().song?.baseline.title).toBe('저장할 제목');
  expect(dirty()).toBe(true);
});

it('곡 저장 응답 전에 새 차트를 열면 늦은 리비전 57이 새 차트의 리비전 42·제목·기준을 바꾸지 않는다', async () => {
  editTitle('이전 차트');
  let finish!: (result: { data: number; error: null }) => void;
  api.rpc.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const saving = saveEditorSong(null, vi.fn());
  open(); const newChart = state().chart; const newSong = state().song;
  finish({ data: 57, error: null }); await saving;
  expect(state().chart).toBe(newChart); expect(state().song).toBe(newSong);
  expect(state().song?.revision).toBe(42);
  expect(dirty()).toBe(false);
});

it('곡 행이 없으면 saveEditorSong을 호출해도 RPC·업로드·확인 모두 0회다', async () => {
  state().setSong(null);
  const confirm = vi.fn(); await saveEditorSong(null, confirm);
  expect(api.rpc).not.toHaveBeenCalled(); expect(api.upload).not.toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled();
});

it('깨끗한 곡을 파일 교체 없이 저장하면 리비전만 57이 되고 Undo 이력 0개를 유지한다', async () => {
  expect(state().historyPast).toHaveLength(0);
  await saveEditorSong(null, vi.fn());
  expect(state().historyPast).toHaveLength(0);
  expect(state().song?.revision).toBe(57);
});

it('제목·음원 replacement.ogg·자켓 replacement.png를 바꿔 저장한 뒤 Undo하면 제목만 돌아오고 업로드 경로가 남아 다시 저장해도 음원·자켓·클립을 다시 올리지 않는다', async () => {
  editSongTitle('교체 후 제목');
  editSongAudio(new File(['audio'], 'replacement.ogg'), 120);
  editSongJacket(new File(['jacket'], 'replacement.png'));
  expect(await saveEditorSong(audioBufferOf(120), vi.fn())).toBe('saved');
  expect(api.upload).toHaveBeenCalledTimes(3);
  const uploaded = { p_jacket_url: api.upload.mock.calls[0][0], p_audio_url: api.upload.mock.calls[1][0],
    p_preview_url: api.upload.mock.calls[2][0] };

  state().undo();
  expect(state().chart.meta).toMatchObject({ title: '곡', audioFile: uploaded.p_audio_url, imageFile: uploaded.p_jacket_url });
  expect(state().song).toMatchObject({ pendingAudioFile: null, pendingJacketFile: null, duration: 120 });
  expect(dirty()).toBe(true);
  expect(await saveEditorSong(null, vi.fn())).toBe('saved');

  expect(api.upload).toHaveBeenCalledTimes(3);
  expect(api.rpc.mock.calls[1][1]).toMatchObject({ ...uploaded, p_title: '곡', p_duration: 120 });
  expect(dirty()).toBe(false);
  state().redo();
  expect(state().chart.meta).toMatchObject({ title: '교체 후 제목', audioFile: uploaded.p_audio_url });
  expect(dirty()).toBe(true);
});

it.each(['commit', 'cancel'] as const)('빈 편집 transaction 중 자켓을 저장하고 %s해도 Undo 0개와 업로드 경로를 유지한다', async action => {
  state().setSong({ ...state().song!, pendingJacketFile: new File(['jacket'], 'replacement.png') });
  const token = state().beginEditTransaction('selectModeEdit')!;
  await saveEditorSong(null, vi.fn());
  expect(state().editTransaction?.token).toBe(token);
  expect(selectCanUndo(state())).toBe(false);
  if (action === 'commit') state().commitEditTransaction(token);
  else state().cancelEditTransaction(token);
  expect(state().historyPast).toHaveLength(0);
  expect(state().chart.meta.imageFile).toBe(api.upload.mock.calls[0][0]);
  expect(dirty()).toBe(false);
});

it('PT409 전에 자켓 업로드가 성공해도 기존 경로 old.jpg·파일 A.png·리비전 42를 보존한다', async () => {
  const file = new File(['A'], 'A.png');
  state().setSong({ ...state().song!, pendingJacketFile: file });
  api.rpc.mockResolvedValue({ data: null, error: { code: 'PT409' } });
  await saveEditorSong(null, vi.fn());
  expect(api.upload).toHaveBeenCalledOnce();
  expect(state().chart.meta.imageFile).toBe('old.jpg');
  expect(state().song?.pendingJacketFile).toBe(file);
  expect(state().song?.revision).toBe(42); expect(dirty()).toBe(true);
});

it('프리뷰를 0～8초·페이드 1초로 바꾸면 자켓·음원 업로드 없이 새 프리뷰 경로와 구간을 함께 저장한다', async () => {
  state().setChart({ ...state().chart, meta: { ...state().chart.meta, previewStart: 0, previewEnd: 8 } });
  state().setSong({ ...state().song!, pendingPreviewRange: { startTime: 0, endTime: 8, fadeInTime: 1, fadeOutTime: 1 } });
  const buffer = { duration: 120, length: 1200, sampleRate: 10, numberOfChannels: 1,
    getChannelData: () => new Float32Array(1200).fill(1) } as unknown as AudioBuffer;
  await saveEditorSong(buffer, vi.fn());
  expect(api.upload).toHaveBeenCalledOnce();
  expect(api.rpc.mock.calls[0][1]).toMatchObject({ p_preview_start: 0, p_preview_end: 8,
    p_preview_url: api.upload.mock.calls[0][0], p_audio_url: 'old.ogg', p_jacket_url: 'old.jpg' });
  const wav = new DataView(await (api.upload.mock.calls[0][1] as Blob).arrayBuffer());
  expect(wav.getInt16(44, true)).toBe(0); // 첫 샘플은 fade-in으로 무음
  expect(dirty()).toBe(false);
});

it('0박 BPM 2개가 있는 미이행 곡도 깨끗하게 열리지만 saveEditorSong은 업로드·RPC 전에 거부한다', async () => {
  const loaded = { ...song, timing: null };
  const chart = { ...base, events: [...base.events, base.events.find(e => e.type === 'bpm')!] };
  openEditorChart(loadEditorChartAsset(toSavedChartJson(chart, 2).chartJson, null, loaded), loaded);
  expect(dirty()).toBe(false);
  await saveEditorSong(null, vi.fn());
  expect(api.rpc).not.toHaveBeenCalled(); expect(api.upload).not.toHaveBeenCalled();
});

it.each(['BPM 120→180', '박자표 4→3', 'Offset 25→45'])('%s 변경에 같은 곡의 다른 차트가 0개면 확인 없이 save_song 1회로 저장한다', async change => {
  const chart = state().chart;
  state().setChart({ ...chart, meta: { ...chart.meta, offsetMs: change.startsWith('Offset') ? 45 : 25 },
    events: chart.events.map(event => event.type === 'bpm' && change.startsWith('BPM') ? { ...event, bpm: 180 }
      : event.type === 'timeSignature' && change.startsWith('박자표') ? { ...event, beatPerMeasure: { n: 3, d: 1 } } : event) });
  api.eq.mockResolvedValue({ data: [{ difficulty_label: base.meta.difficultyLabel.toLowerCase() }], error: null });
  const confirm = vi.fn(() => true);
  expect(await saveEditorSong(null, confirm)).toBe('saved');
  expect(confirm).not.toHaveBeenCalled();
  expect(api.rpc).toHaveBeenCalledOnce();
  expect(dirty()).toBe(false);
});

it('Offset 25→45 변경에 같은 곡의 다른 차트가 hard 1개면 다른 차트 1개 확인 1회 뒤 save_song 1회로 저장한다', async () => {
  state().setChart({ ...state().chart, meta: { ...state().chart.meta, offsetMs: 45 } });
  api.eq.mockResolvedValue({ data: [{ difficulty_label: base.meta.difficultyLabel.toLowerCase() }, { difficulty_label: 'hard' }], error: null });
  const confirm = vi.fn(() => true);
  expect(await saveEditorSong(null, confirm)).toBe('saved');
  expect(confirm).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('다른 차트 1개'));
  expect(api.rpc).toHaveBeenCalledOnce();
});

it('chart-HARD 행으로 연 차트에서 Offset 25→45를 저장하면 대소문자만 다른 hard 행도 다른 차트로 세어 다른 차트 1개를 확인한다', async () => {
  state().setChartRow({ id: 'chart-HARD', difficultyLabel: 'HARD', revision: 3, chartPath: null, chartExtraPath: null });
  state().setActiveDifficulty('HARD');
  state().setChart({ ...state().chart, meta: { ...state().chart.meta, offsetMs: 45 } });
  api.eq.mockResolvedValue({ data: [
    { id: 'chart-HARD', difficulty_label: 'HARD' }, { id: 'chart-hard', difficulty_label: 'hard' },
  ], error: null });
  const confirm = vi.fn(() => true);
  expect(await saveEditorSong(null, confirm)).toBe('saved');
  expect(confirm).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('다른 차트 1개'));
  expect(api.select).toHaveBeenCalledWith('id,difficulty_label');
});

it('timing NULL에서 chart-HARD 행으로 연 차트의 JSON 난이도명이 expert여도 이행 확인은 UUID로 열린 차트만 빼고 BPM 180인 expert를 타이밍이 다른 차트로 보인다', async () => {
  const loaded = { ...song, timing: null };
  const document = { ...base, meta: { ...base.meta, difficultyLabel: 'expert' } };
  openEditorChart(loadEditorChartAsset(toSavedChartJson(document, 2).chartJson, null, loaded), loaded);
  state().setActiveSongId('song');
  state().setChartRow({ id: 'chart-HARD', difficultyLabel: 'HARD', revision: 3, chartPath: null, chartExtraPath: null });
  state().setActiveDifficulty('HARD');
  const raw = JSON.parse(toSavedChartJson(state().chart, 2).chartJson);
  api.eq.mockResolvedValue({ data: [
    { id: 'chart-HARD', difficulty_label: 'HARD', chart_path: null },
    { id: 'chart-expert', difficulty_label: 'expert', chart_path: null },
  ], error: null });
  vi.stubGlobal('fetch', vi.fn(async () => {
    const file = structuredClone(raw);
    file.events.find((e: { type: string }) => e.type === 'bpm').bpm = 180;
    return new Response(JSON.stringify(file));
  }));
  const confirm = vi.fn<(message: string) => boolean>(() => false);
  expect(await saveEditorSong(null, confirm)).toBe('migration-declined');
  const message = confirm.mock.calls[0][0];
  expect(message).toContain('타이밍이 다른 차트: expert');
  expect(message).not.toContain('HARD');
  expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
});

it.each([
  ['title', '   '], ['artist', ''],
] as const)('곡 행이 있는 차트의 %s를 "%s"로 비우고 자켓 A.png와 저장하면 확인·업로드·RPC 0회로 거부하고 Title·Artist 필수 안내를 띄운다', async (field, value) => {
  state().setChart({ ...state().chart, meta: { ...state().chart.meta, [field]: value, offsetMs: 45 } });
  state().setSong({ ...state().song!, pendingJacketFile: new File(['A'], 'A.png') });
  const before = state();
  const confirm = vi.fn(() => true);
  expect(await saveEditorSong(null, confirm)).toBe('aborted');
  expect(confirm).not.toHaveBeenCalled(); expect(api.from).not.toHaveBeenCalled();
  expect(api.upload).not.toHaveBeenCalled(); expect(api.rpc).not.toHaveBeenCalled();
  expect(showToast).toHaveBeenCalledExactlyOnceWith('제목과 아티스트는 비워 둘 수 없습니다.', 'error');
  expect(state().song).toBe(before.song); expect(state().isSavingSong).toBe(false);
});

it('timing NULL에서 다른 차트 hard는 BPM 180, expert는 파일 없음, easy는 깨진 JSON이면 확인에 hard를 타이밍이 다른 차트로, easy·expert를 비교하지 못한 차트로 보이고 승인하면 RPC 1회다', async () => {
  open(null);
  const raw = JSON.parse(toSavedChartJson(state().chart, 2).chartJson);
  api.eq.mockResolvedValue({ data: [
    { difficulty_label: base.meta.difficultyLabel.toLowerCase(), chart_path: null },
    { difficulty_label: 'hard', chart_path: null },
    { difficulty_label: 'expert', chart_path: null },
    { difficulty_label: 'easy', chart_path: null },
  ], error: null });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('expert.json')) return new Response('missing', { status: 404 });
    if (url.endsWith('easy.json')) return new Response('{ broken');
    const file = structuredClone(raw);
    file.events.find((e: { type: string }) => e.type === 'bpm').bpm = 180;
    return new Response(JSON.stringify(file));
  }));
  const confirm = vi.fn<(message: string) => boolean>(() => true);
  expect(await saveEditorSong(null, confirm)).toBe('saved');
  expect(confirm).toHaveBeenCalledOnce();
  const message = confirm.mock.calls[0][0];
  expect(message).toContain('타이밍이 다른 차트: hard');
  expect(message).toContain('파일을 읽지 못해 비교하지 못한 차트: expert, easy');
  expect(api.rpc).toHaveBeenCalledOnce();
});

it('timing NULL에서 다른 차트 hard 파일만 없고 확인을 취소하면 RPC·업로드 0회로 이행 대기를 유지한다', async () => {
  open(null);
  api.eq.mockResolvedValue({ data: [{ difficulty_label: 'hard', chart_path: null }], error: null });
  vi.stubGlobal('fetch', vi.fn(async () => new Response('missing', { status: 404 })));
  const confirm = vi.fn<(message: string) => boolean>(() => false);
  expect(await saveEditorSong(null, confirm)).toBe('migration-declined');
  expect(confirm).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('파일을 읽지 못해 비교하지 못한 차트: hard'));
  expect(confirm.mock.calls[0][0]).not.toContain('타이밍이 다른 차트');
  expect(api.rpc).not.toHaveBeenCalled(); expect(api.upload).not.toHaveBeenCalled();
  expect(state().song?.needsTimingMigration).toBe(true);
});

it.each(['title', 'artist', 'gameplayRange'] as const)('%s만 새 값 또는 5～100초로 변경하면 확인·다른 차트 조회 0회로 리비전 57을 저장한다', async field => {
  if (field === 'gameplayRange') state().setSong({ ...state().song!, gameplayRange: { startTime: 5, endTime: 100, fadeInTime: 1, fadeOutTime: 3 } });
  else state().setChart({ ...state().chart, meta: { ...state().chart.meta, [field]: '새 값' } });
  const confirm = vi.fn(() => true);
  expect(await saveEditorSong(null, confirm)).toBe('saved');
  expect(confirm).not.toHaveBeenCalled(); expect(api.from).not.toHaveBeenCalled();
  expect(state().song?.revision).toBe(57); expect(dirty()).toBe(false);
});

it('Offset 25→45의 다른 차트 수 조회가 실패하면 확인·RPC·업로드 0회로 리비전 42를 유지한다', async () => {
  state().setChart({ ...state().chart, meta: { ...state().chart.meta, offsetMs: 45 } });
  api.eq.mockResolvedValue({ data: null, error: { message: 'read failed' } });
  const confirm = vi.fn(() => true);
  expect(await saveEditorSong(null, confirm)).toBe('aborted');
  expect(confirm).not.toHaveBeenCalled(); expect(api.rpc).not.toHaveBeenCalled(); expect(api.upload).not.toHaveBeenCalled();
  expect(state().song?.revision).toBe(42); expect(dirty()).toBe(true);
});

it('Offset 25→45의 차트 수 조회 중 새 차트를 열면 늦은 응답은 확인·RPC 0회로 끝난다', async () => {
  state().setChart({ ...state().chart, meta: { ...state().chart.meta, offsetMs: 45 } });
  let finish!: (value: { data: { difficulty_label: string }[]; error: null }) => void;
  api.eq.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const confirm = vi.fn(() => true);
  const saving = saveEditorSong(null, confirm);
  open(); const next = state();
  finish({ data: [{ difficulty_label: 'hard' }], error: null });
  expect(await saving).toBe('aborted');
  expect(confirm).not.toHaveBeenCalled(); expect(api.rpc).not.toHaveBeenCalled();
  expect(state().chart).toBe(next.chart); expect(state().song).toBe(next.song);
});

it('프리뷰를 0～8초로 바꾸고 Offset 25→45까지 바꿨는데 재생 음원이 없으면 확인·업로드·RPC 0회로 음원 없음 안내를 띄운다', async () => {
  state().setChart({ ...state().chart, meta: { ...state().chart.meta, previewStart: 0, previewEnd: 8, offsetMs: 45 } });
  state().setSong({ ...state().song!, pendingPreviewRange: { startTime: 0, endTime: 8, fadeInTime: 0, fadeOutTime: 0 } });
  api.eq.mockResolvedValue({ data: [{ difficulty_label: 'hard' }], error: null });
  const confirm = vi.fn(() => true);
  expect(await saveEditorSong(null, confirm)).toBe('aborted');
  expect(confirm).not.toHaveBeenCalled(); expect(api.upload).not.toHaveBeenCalled(); expect(api.rpc).not.toHaveBeenCalled();
  expect(showToast).toHaveBeenCalledExactlyOnceWith(
    '음원이 불러와지지 않아 프리뷰 클립을 만들 수 없습니다. Song Info에서 음원을 불러온 뒤 다시 저장해주세요.', 'error');
  expect(state().isSavingSong).toBe(false); expect(dirty()).toBe(true);
});

it('180초 A에서 1레인 2박 노트를 놓고 120초 B를 저장한 뒤 Undo하면 노트만 지우고 음원은 B 업로드 경로·길이 120초로 남아 곡이 깨끗하다', async () => {
  reopen({ duration: 180 });
  const tap = { type: 'tap' as const, kind: 'single' as const, lane: 1, beat: { n: 2, d: 1 } };
  state().setChart({ ...state().chart, notes: [tap] });
  editSongAudio(new File(['B'], 'B.ogg'), 120);
  expect(await saveEditorSong(audioBufferOf(120), vi.fn())).toBe('saved');
  const uploaded = state().chart.meta;

  state().undo();

  expect(state().chart.notes).toEqual([]);
  expect(state().chart.meta).toMatchObject({ audioFile: uploaded.audioFile, previewAudioFile: uploaded.previewAudioFile });
  expect(state().song).toMatchObject({ duration: 120, pendingAudioFile: null, revision: 57 });
  expect(dirty()).toBe(false);
});

it('B.ogg 업로드 중 C.ogg로 바꾸면 저장 뒤에도 C의 대기 File·경로가 남아 곡이 미저장이고, 변경 취소하면 B 업로드 경로로 돌아간다', async () => {
  const fileB = new File(['B'], 'B.ogg');
  const fileC = new File(['C'], 'C.ogg');
  editSongAudio(fileB, 120);
  let finish!: (value: { error: null }) => void;
  api.upload.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const saving = saveEditorSong(audioBufferOf(120), vi.fn());
  editSongAudio(fileC, 90);
  finish({ error: null });
  expect(await saving).toBe('saved');
  const uploaded = api.upload.mock.calls[0][0];

  expect(state().chart.meta.audioFile).toBe('C.ogg');
  expect(state().song).toMatchObject({ pendingAudioFile: fileC, duration: 90, baseline: { audioUrl: uploaded, duration: 120 } });
  expect(dirty()).toBe(true);
  discardSongInfoChanges();
  expect(state().chart.meta.audioFile).toBe(uploaded);
  expect(state().song).toMatchObject({ pendingAudioFile: null, duration: 120 });
  expect(dirty()).toBe(false);
});

it('B.ogg 업로드 중 놓은 노트를 Undo해도 저장이 끝나면 음원은 B 업로드 경로·대기 파일 null이고 Redo는 노트만 다시 놓는다', async () => {
  editSongAudio(new File(['B'], 'B.ogg'), 120);
  let finish!: (value: { error: null }) => void;
  api.upload.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const saving = saveEditorSong(audioBufferOf(120), vi.fn());
  const tap = { type: 'tap' as const, kind: 'single' as const, lane: 1, beat: { n: 2, d: 1 } };
  state().setChart({ ...state().chart, notes: [tap] });
  state().undo();
  finish({ error: null });
  expect(await saving).toBe('saved');

  expect(state().chart.meta).toMatchObject({ audioFile: api.upload.mock.calls[0][0], previewAudioFile: api.upload.mock.calls[1][0] });
  expect(state().song?.pendingAudioFile).toBeNull();
  state().redo();
  expect(state().chart.notes).toEqual([tap]);
  expect(state().chart.meta.audioFile).toBe(api.upload.mock.calls[0][0]);
  expect(isSongDirty(state().chart, state().song)).toBe(false);
});

it('프리뷰 0～8초·페이드 1초 업로드 중 페이드를 2초로 바꾸면 저장 뒤에도 페이드 2초 대기 구간이 남는다', async () => {
  editPreviewRange({ startTime: 0, endTime: 8, fadeInTime: 1, fadeOutTime: 1 });
  let finish!: (value: { error: null }) => void;
  api.upload.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const saving = saveEditorSong(audioBufferOf(120), vi.fn());
  editPreviewRange({ startTime: 0, endTime: 8, fadeInTime: 2, fadeOutTime: 2 });
  finish({ error: null });
  expect(await saving).toBe('saved');

  expect(state().song?.pendingPreviewRange).toMatchObject({ fadeInTime: 2, fadeOutTime: 2 });
  expect(state().chart.meta.previewAudioFile).toBe(api.upload.mock.calls[0][0]);
});

it('프리뷰 0～8초·페이드 1초를 저장 중 바꾸지 않으면 저장 뒤 대기 구간을 비운다', async () => {
  editPreviewRange({ startTime: 0, endTime: 8, fadeInTime: 1, fadeOutTime: 1 });

  expect(await saveEditorSong(audioBufferOf(120), vi.fn())).toBe('saved');

  expect(state().song?.pendingPreviewRange).toBeNull();
  expect(state().chart.meta).toMatchObject({ previewStart: 0, previewEnd: 8, previewAudioFile: api.upload.mock.calls[0][0] });
});

it.each(['cancelEditTransaction', 'cancelEditTransactionForPlaybackStart', 'revertToLastValid'] as const)(
  '자켓 A.png 저장 중 중복 노트 2개를 추가하고 %s하면 저장된 자켓 경로와 리비전 57을 유지한다', async restore => {
    editSongJacket(new File(['A'], 'A.png'));
    const token = state().beginEditTransaction('selectModeEdit')!;
    const tap = { type: 'tap' as const, kind: 'single' as const, lane: 1, beat: { n: 2, d: 1 } };
    state().setChart({ ...state().chart, notes: [tap, { ...tap }] }, { transaction: token });
    expect(await saveEditorSong(null, vi.fn())).toBe('saved');
    state()[restore]();
    expect(state().chart.notes).toEqual([]);
    expect(state().chart.meta.imageFile).toBe(api.upload.mock.calls[0][0]);
    expect(state().song?.pendingJacketFile).toBeNull();
    expect(state().song?.revision).toBe(57);
  },
);

describe('Undo 뒤 곡 저장 값과 프리뷰 클립 다시 만들기(음원·구간은 이력 밖, 2026-11-08)', () => {
  it('구간 NULL·300초 A에서 노트를 놓고 120초 B를 저장한 뒤 Undo하면 인게임 0～120초·길이 120초가 남아 곡이 깨끗하다', async () => {
    reopen({ duration: 300, gameplayStart: null, gameplayEnd: null, gameplayFadeIn: null, gameplayFadeOut: null });
    state().setChart({ ...state().chart, notes: [{ type: 'tap', kind: 'single', lane: 1, beat: { n: 2, d: 1 } }] });
    editSongAudio(new File(['B'], 'B.ogg'), 120);
    expect(await saveEditorSong(audioBufferOf(120), vi.fn())).toBe('saved');

    state().undo();

    expect(state().song).toMatchObject({ gameplayRange: { startTime: 0, endTime: 120 }, duration: 120 });
    expect(dirty()).toBe(false);
  });

  it('제목과 프리뷰 30～40초를 바꿔 저장한 뒤 Undo하면 제목만 돌아오고 프리뷰 30～40초와 새 클립 경로가 남는다', async () => {
    editTitle('새 제목');
    editPreviewRange(previewRange(30, 40));
    expect(await saveEditorSong(audioBufferOf(120), vi.fn())).toBe('saved');

    state().undo();

    expect(state().chart.meta).toMatchObject({ title: '곡', previewStart: 30, previewEnd: 40,
      previewAudioFile: api.upload.mock.calls[0][0] });
  });

  it('프리뷰 30～45초를 저장한 뒤 제목 편집을 Undo하고 다시 저장하면 재생 음원 없이도 클립을 다시 만들지 않고 저장한 클립 경로를 보낸다', async () => {
    editPreviewRange({ startTime: 30, endTime: 45, fadeInTime: 0.5, fadeOutTime: 0.5 });
    expect(await saveEditorSong(audioBufferOf(120), vi.fn())).toBe('saved');
    editTitle('새 제목');
    state().undo();
    editTitle('다른 제목');

    expect(await saveEditorSong(null, vi.fn())).toBe('saved');

    expect(api.upload).toHaveBeenCalledOnce();
    expect(api.rpc.mock.calls[1][1]).toMatchObject({ p_preview_url: api.upload.mock.calls[0][0], p_preview_start: 30, p_preview_end: 45 });
    expect(dirty()).toBe(false);
  });

  it('프리뷰 10～20초에서 30～40초로 저장한 뒤 다시 10～20초로 끌어 저장하면 저장 기준 30～40초와 달라 다시 만든다', async () => {
    editPreviewRange(previewRange(30, 40));
    expect(await saveEditorSong(audioBufferOf(120), vi.fn())).toBe('saved');
    editPreviewRange(previewRange(10, 20));

    expect(await saveEditorSong(audioBufferOf(120), vi.fn())).toBe('saved');

    expect(api.upload).toHaveBeenCalledTimes(2);
    expect(api.rpc.mock.calls[1][1]).toMatchObject({ p_preview_url: api.upload.mock.calls[1][0], p_preview_start: 10, p_preview_end: 20 });
  });

  it('120초 음원 B로 바꿔 프리뷰 10～20초가 그대로 남아도 음원이 바뀌었으므로 B로 클립을 다시 만들고, 다음 제목 저장은 다시 만들지 않는다', async () => {
    editSongAudio(new File(['B'], 'B.ogg'), 120);
    expect(state().chart.meta).toMatchObject({ previewStart: 10, previewEnd: 20 });

    expect(await saveEditorSong(audioBufferOf(120), vi.fn())).toBe('saved');
    expect(api.upload).toHaveBeenCalledTimes(2);
    expect(api.rpc.mock.calls[0][1]).toMatchObject({ p_audio_url: api.upload.mock.calls[0][0],
      p_preview_url: api.upload.mock.calls[1][0], p_preview_start: 10, p_preview_end: 20 });

    editTitle('새 제목');
    expect(await saveEditorSong(null, vi.fn())).toBe('saved');
    expect(api.upload).toHaveBeenCalledTimes(2);
  });

  it('음원 B·프리뷰 30～40초로 바꾼 뒤 변경 취소하면 저장된 old.wav로 돌아가 제목만 바꾼 Save는 클립을 다시 만들지 않는다', async () => {
    editSongAudio(new File(['B'], 'B.ogg'), 120);
    editPreviewRange(previewRange(30, 40));
    expect(discardSongInfoChanges()).toEqual({ discarded: true });

    editTitle('새 제목');
    expect(await saveEditorSong(null, vi.fn())).toBe('saved');

    expect(api.upload).not.toHaveBeenCalled();
    expect(api.rpc.mock.calls[0][1]).toMatchObject({ p_audio_url: 'old.ogg', p_preview_url: 'old.wav', p_preview_start: 10, p_preview_end: 20 });
  });

  it('프리뷰 구간이 없는 행에 B를 저장하면 기본 구간 30～45초의 클립을 만들고 다음 제목 저장은 다시 만들지 않는다', async () => {
    reopen({ previewUrl: null, previewStart: null, previewEnd: null });
    editSongAudio(new File(['B'], 'B.ogg'), 120);
    expect(await saveEditorSong(audioBufferOf(120), vi.fn())).toBe('saved');
    expect(api.upload).toHaveBeenCalledTimes(2);
    expect(api.rpc.mock.calls[0][1]).toMatchObject({ p_preview_url: api.upload.mock.calls[1][0], p_preview_start: 30, p_preview_end: 45 });

    editTitle('새 제목');
    expect(await saveEditorSong(null, vi.fn())).toBe('saved');

    expect(api.upload).toHaveBeenCalledTimes(2);
  });

  it('프리뷰 구간이 없는 행의 제목만 바꿔 저장하면 재생 음원이 없어도 클립 없이 저장한다', async () => {
    reopen({ previewUrl: null, previewStart: null, previewEnd: null });
    editTitle('새 제목');

    expect(await saveEditorSong(null, vi.fn())).toBe('saved');

    expect(api.upload).not.toHaveBeenCalled();
    expect(api.rpc.mock.calls[0][1]).toMatchObject({ p_preview_url: null, p_preview_start: null, p_preview_end: null });
  });

  it('프리뷰 구간이 없는 행에 0～8초를 처음 정해 저장하면 클립을 만들고 다음 저장은 다시 만들지 않는다', async () => {
    reopen({ previewUrl: null, previewStart: null, previewEnd: null });
    editPreviewRange(previewRange(0, 8));
    expect(await saveEditorSong(audioBufferOf(120), vi.fn())).toBe('saved');
    expect(api.upload).toHaveBeenCalledOnce();

    editTitle('새 제목');
    expect(await saveEditorSong(null, vi.fn())).toBe('saved');

    expect(api.upload).toHaveBeenCalledOnce();
  });

  it('대기 구간 없이 프리뷰 구간만 0～8초로 바뀐 초안을 저장하면 구간 선택기 기본 페이드 0.5초로 클립을 만든다', async () => {
    state().setChart({ ...state().chart, meta: { ...state().chart.meta, previewStart: 0, previewEnd: 8 } });
    const buffer = { ...audioBufferOf(120), getChannelData: () => new Float32Array(1200).fill(1) } as unknown as AudioBuffer;

    expect(await saveEditorSong(buffer, vi.fn())).toBe('saved');

    const wav = new DataView(await (api.upload.mock.calls[0][1] as Blob).arrayBuffer());
    expect(wav.getInt16(44, true)).toBe(0); // 첫 샘플은 fade-in으로 무음
    expect(wav.getInt16(44 + 2, true)).toBe(Math.trunc(0x7FFF / 5)); // 10Hz라 페이드 0.5초는 5샘플이다
    expect(wav.getInt16(44 + 79 * 2, true)).toBe(0); // 8초 80샘플의 마지막 샘플은 fade-out으로 무음
  });

  it('자켓 A.png 저장 중 중복 노트를 둔 transaction을 취소하면 되돌린 마지막 유효 상태도 업로드한 자켓 경로를 쓴다', async () => {
    editSongJacket(new File(['A'], 'A.png'));
    const token = state().beginEditTransaction('selectModeEdit')!;
    const tap = { type: 'tap' as const, kind: 'single' as const, lane: 1, beat: { n: 2, d: 1 } };
    state().setChart({ ...state().chart, notes: [tap, { ...tap }] }, { transaction: token });
    expect(await saveEditorSong(null, vi.fn())).toBe('saved');

    state().cancelEditTransaction(token);

    expect(state().lastValidSnapshot?.chart.meta.imageFile).toBe(api.upload.mock.calls[0][0]);
    expect(state().lastValidSnapshot?.chart).toBe(state().chart);
  });
});

describe('프리뷰 클립을 만들 수 없는 구간의 거부', () => {
  /** 구간이 250초 음원의 끝을 넘은 초안. 클립은 행의 10～20초 것이라 Save가 이 구간으로 다시 만들려 한다. */
  const setPreview = (previewStart: number, previewEnd: number) =>
    state().setChart({ ...state().chart, meta: { ...state().chart.meta, previewStart, previewEnd, offsetMs: 45 } });

  it.each([
    [240, 265], // 끝이 음원을 15초 넘어 잘린 클립이 된다
    [250, 265], // 음원 끝에서 시작해 샘플이 0개다
    [240, 250.2], // 끝이 음원을 두 샘플 넘는다
  ])('프리뷰 %s～%s초를 250초 음원으로 다시 만들어야 하면 확인·업로드·RPC 0회로 구간 안내를 띄운다', async (startTime, endTime) => {
    setPreview(startTime, endTime);
    const confirm = vi.fn(() => true);

    expect(await saveEditorSong(audioBufferOf(250), confirm)).toBe('aborted');

    expect(confirm).not.toHaveBeenCalled();
    expect(api.upload).not.toHaveBeenCalled(); expect(api.rpc).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledExactlyOnceWith(SONG_SAVE_COPY.previewOutOfRange, 'error');
    expect(state().isSavingSong).toBe(false); expect(dirty()).toBe(true);
  });

  it.each([
    [240, 250], // 끝이 음원 길이와 같다
    [240, 250.1], // 끝이 음원을 한 샘플만 넘는다
  ])('프리뷰 %s～%s초는 250초 음원 안에서 잘라 낼 수 있어 거부하지 않고 저장한다', async (startTime, endTime) => {
    setPreview(startTime, endTime);

    expect(await saveEditorSong(audioBufferOf(250), vi.fn())).toBe('saved');

    expect(api.upload).toHaveBeenCalledOnce();
    expect(api.rpc.mock.calls[0][1]).toMatchObject({ p_preview_start: startTime, p_preview_end: endTime });
  });

  it('행의 프리뷰 240～265초가 250초 음원 끝을 넘어도 음원·구간을 바꾸지 않고 제목만 저장하면 클립을 다시 만들지 않으므로 거부 없이 old.wav를 보낸다', async () => {
    reopen({ duration: 250, previewStart: 240, previewEnd: 265 });
    editTitle('새 제목');

    expect(await saveEditorSong(audioBufferOf(250), vi.fn())).toBe('saved');

    expect(api.upload).not.toHaveBeenCalled();
    expect(api.rpc.mock.calls[0][1]).toMatchObject({ p_preview_url: 'old.wav', p_preview_start: 240, p_preview_end: 265 });
  });

  it('150～165초 행의 200초 곡을 90초 파일로 바꾸면 구간이 22.5～37.5초로 돌아가 그 구간의 클립을 만들어 저장한다', async () => {
    reopen({ duration: 200, previewStart: 150, previewEnd: 165 });
    editSongAudio(new File(['short'], 'short.ogg'), 90);
    expect(state().chart.meta).toMatchObject({ previewStart: 22.5, previewEnd: 37.5 });

    expect(await saveEditorSong(audioBufferOf(90), vi.fn())).toBe('saved');

    expect(api.rpc.mock.calls[0][1]).toMatchObject({ p_preview_start: 22.5, p_preview_end: 37.5 });
  });

  it('200초 곡을 90초 파일로 바꾼 뒤 프리뷰를 90～90초로 두면 음원 업로드·RPC 없이 거부하고 다시 저장해도 업로드가 쌓이지 않는다', async () => {
    reopen({ duration: 200, previewStart: 150, previewEnd: 165 });
    editSongAudio(new File(['short'], 'short.ogg'), 90);
    editPreviewRange(previewRange(90, 90));
    const confirm = vi.fn(() => true);

    expect(await saveEditorSong(audioBufferOf(90), confirm)).toBe('aborted');
    expect(await saveEditorSong(audioBufferOf(90), confirm)).toBe('aborted');

    expect(confirm).not.toHaveBeenCalled();
    expect(api.upload).not.toHaveBeenCalled(); expect(api.rpc).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(SONG_SAVE_COPY.previewOutOfRange, 'error');
    expect(SONG_SAVE_COPY.previewOutOfRange).toBe('프리뷰 구간이 음원 범위를 벗어났습니다. Song Info에서 프리뷰 구간을 다시 정한 뒤 저장해주세요.');
  });

  it('44100Hz 149.97056689342404초 음원에서 프리뷰 끝이 2.8e-14초 넘친 149.97056689342406초면 거부하지 않고 클립을 만든다', async () => {
    reopen({ duration: 149.97056689342404 });
    editPreviewRange(previewRange(149, 149.97056689342406));
    const samples = new Float32Array(6613702);
    const buffer = { duration: 149.97056689342404, length: samples.length, sampleRate: 44100, numberOfChannels: 1,
      getChannelData: () => samples } as unknown as AudioBuffer;

    expect(await saveEditorSong(buffer, vi.fn())).toBe('saved');

    expect(api.upload).toHaveBeenCalledOnce();
    expect(api.rpc.mock.calls[0][1]).toMatchObject({ p_preview_end: 149.97056689342406 });
  });
});
