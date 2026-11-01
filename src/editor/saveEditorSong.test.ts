import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openEditorChart } from './openEditorChart';
import { loadEditorChartAsset } from './chartAssetLoad';
import { toSavedChartJson } from './savedChart';
import { useEditorStore } from './stores/editorStore';
import { isSongDirty } from './songState';
import { saveEditorSong } from './saveEditorSong';

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

afterEach(() => vi.unstubAllGlobals());

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

    expect(await saveEditorSong(null, confirm)).toBe(false);

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
  expect(await saveEditorSong(null, confirm)).toBe(accepted);
  expect(api.from).toHaveBeenCalledWith('charts');
  expect(api.eq).toHaveBeenCalledWith('song_id', 'song');
  expect(confirm).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('hard'));
  expect(confirm.mock.calls[0][0]).not.toContain('easy');
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

it.each(['BPM 120→180', '박자표 4→3', 'Offset 25→45'])('%s 변경을 승인하면 다른 차트 0개 확인 1회 뒤 save_song 1회로 저장한다', async change => {
  const chart = state().chart;
  state().setChart({ ...chart, meta: { ...chart.meta, offsetMs: change.startsWith('Offset') ? 45 : 25 },
    events: chart.events.map(event => event.type === 'bpm' && change.startsWith('BPM') ? { ...event, bpm: 180 }
      : event.type === 'timeSignature' && change.startsWith('박자표') ? { ...event, beatPerMeasure: { n: 3, d: 1 } } : event) });
  const confirm = vi.fn(() => true);
  expect(await saveEditorSong(null, confirm)).toBe(true);
  expect(confirm).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('다른 차트 0개'));
  expect(api.rpc).toHaveBeenCalledOnce();
  expect(dirty()).toBe(false);
});

it.each(['title', 'artist', 'gameplayRange'] as const)('%s만 새 값 또는 5～100초로 변경하면 확인·다른 차트 조회 0회로 리비전 57을 저장한다', async field => {
  if (field === 'gameplayRange') state().setSong({ ...state().song!, gameplayRange: { startTime: 5, endTime: 100, fadeInTime: 1, fadeOutTime: 3 } });
  else state().setChart({ ...state().chart, meta: { ...state().chart.meta, [field]: '새 값' } });
  const confirm = vi.fn(() => true);
  expect(await saveEditorSong(null, confirm)).toBe(true);
  expect(confirm).not.toHaveBeenCalled(); expect(api.from).not.toHaveBeenCalled();
  expect(state().song?.revision).toBe(57); expect(dirty()).toBe(false);
});

it('Offset 25→45의 다른 차트 수 조회가 실패하면 확인·RPC·업로드 0회로 리비전 42를 유지한다', async () => {
  state().setChart({ ...state().chart, meta: { ...state().chart.meta, offsetMs: 45 } });
  api.eq.mockResolvedValue({ data: null, error: { message: 'read failed' } });
  const confirm = vi.fn(() => true);
  expect(await saveEditorSong(null, confirm)).toBe(false);
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
  expect(await saving).toBe(false);
  expect(confirm).not.toHaveBeenCalled(); expect(api.rpc).not.toHaveBeenCalled();
  expect(state().chart).toBe(next.chart); expect(state().song).toBe(next.song);
});
