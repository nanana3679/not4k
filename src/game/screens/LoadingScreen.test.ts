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
vi.mock('../stores', () => ({ useGameStore: () => useGameStore.getState() }));
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
