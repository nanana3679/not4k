import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beat, ChartFormatError, type ChartDocument } from '../../shared';
import { explicitPlaytestCharts } from '../../lab/explicitPlaytestCharts';
import { useGameStore } from '../stores/gameStore';
import { openNormalPlayForTest } from '../stores/normalPlayTestHarness';

const fixture = vi.hoisted(() => ({ effect: null as (() => (() => void)) | null,
  error: null as string | null, load: vi.fn(), close: vi.fn(async () => undefined) }));
vi.mock('react', async importOriginal => ({ ...await importOriginal<typeof import('react')>(),
  useEffect: (effect: () => () => void) => { fixture.effect = effect; },
  useState: () => [fixture.error, (value: string | null) => { fixture.error = value; }],
}));
vi.mock('../stores', () => ({ useGameStore: Object.assign(() => useGameStore.getState(), { getState: useGameStore.getState }) }));
vi.mock('../../supabase', () => ({ loadSongDocumentData: fixture.load }));
const { LoadingScreen } = await import('./LoadingScreen');

const audioBuffer = { duration: 4 } as AudioBuffer;
let cleanup: (() => void) | undefined;
beforeEach(() => {
  useGameStore.setState(useGameStore.getInitialState(), true);
  fixture.error = null; fixture.effect = null; fixture.load.mockReset(); fixture.close.mockClear();
  vi.stubGlobal('AudioContext', class { close = fixture.close; });
  useGameStore.getState().selectSong('song-1', 'NORMAL', 'songs/song-1/custom.mp3', {
    startTime: 1, endTime: 3, fadeInTime: .2, fadeOutTime: .3,
  });
});
afterEach(() => { cleanup?.(); cleanup = undefined; vi.unstubAllGlobals(); useGameStore.setState(useGameStore.getInitialState(), true); });
function mount() {
  renderToStaticMarkup(createElement(LoadingScreen));
  cleanup = fixture.effect!();
}
function delayedLoad() {
  let resolve!: (data: { chart: ChartDocument; audioBuffer: AudioBuffer }) => void;
  fixture.load.mockReturnValue(new Promise(done => { resolve = done; }));
  return (chart = explicitPlaytestCharts[0].chart) => resolve({ chart, audioBuffer });
}

describe('일반 곡 LoadingScreen', () => {
  it('선택한 custom.mp3와 구간을 읽고 전체 검증된 purpose=play 요청으로 한 번 진입한다', async () => {
    fixture.load.mockResolvedValue({ chart: explicitPlaytestCharts[0].chart, audioBuffer });
    mount();
    await vi.waitFor(() => expect(useGameStore.getState().screen).toBe('play'));
    expect(fixture.load).toHaveBeenCalledWith('song-1', 'NORMAL', expect.anything(), 'songs/song-1/custom.mp3');
    expect(useGameStore.getState().normalPlay).toMatchObject({ purpose: 'play', startTimeMs: 0, auto: false,
      returnUrl: '/game', playbackRange: { startTime: 1, endTime: 3, fadeInTime: .2, fadeOutTime: .3 } });
    expect(useGameStore.getState().normalPlay?.compiled.totalJudgments).toBe(4);
    expect(fixture.close).toHaveBeenCalledOnce();
  });

  it.each(['legacy', 'aux'] as const)('%s 위반이 있으면 play를 열지 않고 수리 안내·Back을 표시한다', async kind => {
    const chart = structuredClone(explicitPlaytestCharts[0].chart);
    chart.notes.push(kind === 'legacy' ? { type: 'single', lane: 3, beat: beat(0) }
      : { type: 'tick', lane: 5, beat: beat(0), count: 1 });
    const original = structuredClone(chart);
    fixture.load.mockResolvedValue({ chart, audioBuffer });
    mount();
    await vi.waitFor(() => expect(fixture.error).toContain('correct it in the editor'));
    expect(useGameStore.getState()).toMatchObject({ screen: 'loading', normalPlay: null, lastResult: null, audioBuffer: null });
    expect(chart).toEqual(original);
    const html = renderToStaticMarkup(createElement(LoadingScreen));
    expect(html).toContain('role="alert"');
    expect(html).toContain('Back to Song Select');
    const tree = LoadingScreen() as ReactElement<{ children: ReactElement<{ onClick: () => void }>[] }>;
    tree.props.children[1].props.onClick();
    expect(useGameStore.getState()).toMatchObject({ screen: 'songSelect', normalPlay: null, lastResult: null });
  });

  it('Body만 있는 분모0 차트도 검증 뒤 play로 진입한다', async () => {
    fixture.load.mockResolvedValue({ chart: explicitPlaytestCharts[2].chart, audioBuffer });
    mount();
    await vi.waitFor(() => expect(useGameStore.getState().screen).toBe('play'));
    expect(useGameStore.getState().normalPlay?.compiled.theoreticalWeight).toBe(0);
  });

  it('읽는 중 unmount하면 장치를 즉시 닫고 늦게 도착한 요청을 버린다', async () => {
    const resolve = delayedLoad();
    mount();
    await vi.waitFor(() => expect(fixture.load).toHaveBeenCalledOnce());
    cleanup!(); cleanup = undefined;
    expect(fixture.close).toHaveBeenCalledOnce();
    resolve();
    await Promise.resolve(); await Promise.resolve();
    expect(useGameStore.getState().normalPlay).toBeNull();
    expect(useGameStore.getState().screen).not.toBe('play');
    expect(fixture.close).toHaveBeenCalledOnce();
  });

  it('읽는 중 다른 곡을 선택하면 이전 응답이 다음 곡 요청이나 결과를 만들지 못한다', async () => {
    const resolve = delayedLoad();
    mount();
    await vi.waitFor(() => expect(fixture.load).toHaveBeenCalledOnce());
    useGameStore.getState().selectSong('song-2', 'HARD', 'next.mp3');
    resolve();
    await vi.waitFor(() => expect(fixture.close).toHaveBeenCalledOnce());
    expect(useGameStore.getState()).toMatchObject({ selectedSongId: 'song-2', normalPlay: null, lastResult: null });
  });

  it('읽기 실패 뒤에는 이전 결과·요청을 남기지 않고 AudioContext를 닫는다', async () => {
    openNormalPlayForTest(explicitPlaytestCharts[0].chart, audioBuffer);
    fixture.load.mockRejectedValue(new Error('network unavailable'));
    mount();
    await vi.waitFor(() => expect(fixture.error).toContain('Unable to load this song'));
    expect(useGameStore.getState()).toMatchObject({ normalPlay: null, explicitPlay: null, lastResult: null, chartData: null, audioBuffer: null });
    expect(fixture.close).toHaveBeenCalledOnce();
  });

  it('aux JSON 손상(ChartFormatError)이면 재시도 안내가 아닌 차트 데이터 오류 안내를 표시한다', async () => {
    fixture.load.mockRejectedValue(new ChartFormatError('보조 파일이 유효한 JSON이 아닙니다'));
    mount();
    await vi.waitFor(() => expect(fixture.error).toContain('This chart contains invalid notes or chart data.'));
    expect(fixture.error).not.toContain('Unable to load this song');
    expect(useGameStore.getState()).toMatchObject({ screen: 'loading', normalPlay: null });
  });

  it('선택한 곡이 없으면 음원 장치나 fetch 없이 Back 안내를 표시한다', async () => {
    useGameStore.setState({ selectedSongId: null });
    mount();
    await vi.waitFor(() => expect(fixture.error).toContain('No song selected'));
    expect(fixture.load).not.toHaveBeenCalled();
    expect(fixture.close).not.toHaveBeenCalled();
    expect(useGameStore.getState().normalPlay).toBeNull();
  });
});

describe('Observer 공유 LoadingScreen', () => {
  beforeEach(() => useGameStore.getState().beginPlayLoad('observer'));

  it('Observer는 custom.mp3를 1회 읽고 검증한 4개 점수 항목·음원 구간을 observer 화면에 전달한다', async () => {
    fixture.load.mockResolvedValue({ chart: explicitPlaytestCharts[0].chart, audioBuffer });
    mount();
    await vi.waitFor(() => expect(useGameStore.getState().screen).toBe('observer'));
    expect(fixture.load).toHaveBeenCalledExactlyOnceWith('song-1', 'NORMAL', expect.anything(), 'songs/song-1/custom.mp3');
    expect(useGameStore.getState().observerPlay).toMatchObject({ compiled: { totalJudgments: 4 }, audioBuffer,
      playbackRange: { startTime: 1, endTime: 3, fadeInTime: .2, fadeOutTime: .3 } });
    expect(useGameStore.getState()).toMatchObject({ normalPlay: null, lastResult: null });
    expect(fixture.close).toHaveBeenCalledOnce();
  });

  it('Observer의 lane 5 바디 밖 tick 검증 실패는 화면 진입을 막고 곡 선택 복귀를 제공한다', async () => {
    const chart = structuredClone(explicitPlaytestCharts[0].chart);
    chart.notes.push({ type: 'tick', lane: 5, beat: beat(0), count: 1 });
    fixture.load.mockResolvedValue({ chart, audioBuffer });
    mount();
    await vi.waitFor(() => expect(fixture.error).toContain('correct it in the editor'));
    expect(useGameStore.getState()).toMatchObject({ screen: 'loading', observerPlay: null, normalPlay: null, lastResult: null });
    expect(renderToStaticMarkup(createElement(LoadingScreen))).toContain('Back to Song Select');
    expect(fixture.close).toHaveBeenCalledOnce();
  });

  it('Observer의 음원 길이 0초는 검증 실패로 처리하고 요청을 남기지 않는다', async () => {
    fixture.load.mockResolvedValue({ chart: explicitPlaytestCharts[0].chart, audioBuffer: { duration: 0 } });
    mount();
    await vi.waitFor(() => expect(fixture.error).toContain('Unable to load this song'));
    expect(useGameStore.getState()).toMatchObject({ screen: 'loading', observerPlay: null, normalPlay: null, lastResult: null });
  });

  it('Observer 응답 전에 일반 로딩을 시작하면 늦은 Observer 성공이 play 요청을 만들지 못한다', async () => {
    const resolve = delayedLoad();
    mount();
    await vi.waitFor(() => expect(fixture.load).toHaveBeenCalledOnce());
    useGameStore.getState().beginPlayLoad();
    resolve();
    await vi.waitFor(() => expect(fixture.close).toHaveBeenCalledOnce());
    expect(useGameStore.getState()).toMatchObject({ screen: 'loading', playLoadTarget: 'play', observerPlay: null, normalPlay: null });
    expect(fixture.error).toBeNull();
  });

  it('Observer 응답 전에 song-2를 선택하면 늦은 차트 검증 실패가 새 로딩에 오류를 표시하지 않는다', async () => {
    const resolve = delayedLoad();
    mount();
    await vi.waitFor(() => expect(fixture.load).toHaveBeenCalledOnce());
    useGameStore.getState().selectSong('song-2', 'HARD', 'next.mp3');
    const chart = structuredClone(explicitPlaytestCharts[0].chart);
    chart.notes.push({ type: 'single', lane: 1, beat: beat(0) });
    resolve(chart);
    await vi.waitFor(() => expect(fixture.close).toHaveBeenCalledOnce());
    expect(fixture.error).toBeNull();
    expect(useGameStore.getState()).toMatchObject({ selectedSongId: 'song-2', observerPlay: null, lastResult: null });
  });

  it('Observer 음원 로딩 중 Esc를 눌러도 loading을 유지하고 완료 뒤 observer로 진입한다', async () => {
    const target = new EventTarget();
    vi.stubGlobal('window', target);
    const resolve = delayedLoad();
    mount();
    await vi.waitFor(() => expect(fixture.load).toHaveBeenCalledOnce());
    target.dispatchEvent(Object.assign(new Event('keydown'), { code: 'Escape', repeat: false }));
    expect(useGameStore.getState()).toMatchObject({ screen: 'loading', observerPlay: null });
    resolve();
    await vi.waitFor(() => expect(useGameStore.getState().screen).toBe('observer'));
  });
});
