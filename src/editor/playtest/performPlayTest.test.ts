import { afterEach, describe, expect, it, vi } from 'vitest';
import { beat } from '../../shared';
import { explicitPlaytestCharts } from '../../lab/explicitPlaytestCharts';
import { useGameStore } from '../../game/stores';
import { performPlayTest } from './performPlayTest';
import type { PerformPlayTestParams } from './performPlayTest';

function setup(overrides: Partial<PerformPlayTestParams> = {}) {
  const startExplicitPlayTest = vi.fn(useGameStore.getState().startExplicitPlayTest);
  const game = { startExplicitPlayTest, setChartData: vi.fn(), setAudioBuffer: vi.fn(), setStartTimeMs: vi.fn(),
    setEditorReturnUrl: vi.fn(), setScreen: vi.fn() };
  const params: PerformPlayTestParams = { chart: structuredClone(explicitPlaytestCharts[0].chart), audioBuffer: { duration: 4 } as AudioBuffer,
    fromCursor: false, currentTimeMs: 2000, returnUrl: '/editor?songId=draft&difficulty=normal',
    isPlaying: true, pause: vi.fn(), addToast: vi.fn(), closeMenu: vi.fn(), navigate: vi.fn(), game, ...overrides };
  return { params, game };
}
afterEach(() => useGameStore.setState(useGameStore.getInitialState(), true));
describe('에디터에서 명시 실제 테스트 플레이', () => {
  it('커서2000ms라도 처음부터 요청은 startTimeMs 없이 전체 원본문서·audio·복귀URL을 전달하고 새화면의 4항목 분모12를 유지한다', () => {
    const { params, game } = setup();
    expect(performPlayTest(params)).toBe(true);
    expect(game.startExplicitPlayTest).toHaveBeenCalledWith({ document: params.chart, audioBuffer: params.audioBuffer, returnUrl: params.returnUrl });
    expect(useGameStore.getState().screen).toBe('explicitPlay');
    expect(useGameStore.getState().explicitPlay?.compiled.totalJudgments).toBe(4);
    expect(useGameStore.getState().explicitPlay?.compiled.theoreticalWeight).toBe(12);
    expect(params.pause).toHaveBeenCalledOnce(); expect(params.navigate).toHaveBeenCalledOnce();
    expect(game.setChartData).not.toHaveBeenCalled(); expect(game.setScreen).not.toHaveBeenCalled();
  });
  it.each([0, 1500, 5000])('음원4초에서 커서%sms부터 시작하면 전체 원본문서와 현재 시각을 전달한다', currentTimeMs => {
    const { params, game } = setup({ fromCursor: true, currentTimeMs });
    const original = structuredClone(params.chart);
    expect(performPlayTest(params)).toBe(true);
    expect(game.startExplicitPlayTest).toHaveBeenCalledWith({ document: params.chart, audioBuffer: params.audioBuffer,
      returnUrl: params.returnUrl, startTimeMs: currentTimeMs });
    expect(game.startExplicitPlayTest.mock.calls[0][0].document).toBe(params.chart);
    expect(useGameStore.getState().explicitPlay?.startTimeMs).toBe(currentTimeMs);
    expect(useGameStore.getState().explicitPlay?.document).toEqual(original);
    expect(params.chart).toEqual(original);
    expect(params.pause).toHaveBeenCalledOnce(); expect(params.closeMenu).toHaveBeenCalledOnce();
    expect(params.navigate).toHaveBeenCalledOnce(); expect(params.addToast).not.toHaveBeenCalled();
    expect(game.setChartData).not.toHaveBeenCalled(); expect(game.setScreen).not.toHaveBeenCalled();
  });
  it.each([-1, NaN, Infinity, -Infinity])('커서%sms는 유효하지 않아 editor pause·store·menu·navigation을 모두 보존한다', currentTimeMs => {
    const { params } = setup({ fromCursor: true, currentTimeMs });
    const before = useGameStore.getState();
    expect(performPlayTest(params)).toBe(false);
    expect(params.addToast).toHaveBeenCalledWith(expect.stringContaining('0 이상의 유한한 값'), 'error');
    expect(params.pause).not.toHaveBeenCalled();
    expect(params.closeMenu).not.toHaveBeenCalled(); expect(params.navigate).not.toHaveBeenCalled();
    expect(useGameStore.getState()).toBe(before);
  });
  it.each([false, true])('fromCursor=%s라도 커서 앞 legacy main single이 남으면 전체 재생을 거부한다', fromCursor => {
    const { params, game } = setup({ fromCursor }); params.chart.notes.unshift({ type: 'single', lane: 4, beat: beat(0) });
    const before = useGameStore.getState();
    expect(performPlayTest(params)).toBe(false);
    expect(game.startExplicitPlayTest).not.toHaveBeenCalled(); expect(params.pause).not.toHaveBeenCalled();
    expect(params.closeMenu).not.toHaveBeenCalled(); expect(params.navigate).not.toHaveBeenCalled();
    expect(useGameStore.getState()).toBe(before);
  });
  it('legacy aux single은 원본문서에 남기고 main4항목만 새 session에 컴파일한다', () => {
    const { params } = setup(); params.chart.notes.push({ type: 'single', lane: 5, beat: beat(8) });
    expect(performPlayTest(params)).toBe(true);
    expect(useGameStore.getState().explicitPlay?.document.notes).toHaveLength(6);
    expect(useGameStore.getState().explicitPlay?.compiled.totalJudgments).toBe(4);
  });
  it('1500ms 커서 시작은 aux를 포함한 원본6개를 보존하고 정확히 커서의 Sustain부터 3항목·분모9를 계산한다', () => {
    const { params } = setup({ fromCursor: true, currentTimeMs: 1500 });
    params.chart.notes.unshift({ type: 'single', lane: 5, beat: beat(0) });
    const original = structuredClone(params.chart);
    expect(performPlayTest(params)).toBe(true);
    const request = useGameStore.getState().explicitPlay!;
    expect(request.document).toEqual(original);
    expect(request.compiled.scoreItems.map(item => item.source.noteIndex)).toEqual([3, 4, 5]);
    expect(request.compiled.totalJudgments).toBe(3);
    expect(request.compiled.theoreticalWeight).toBe(9);
    expect(request.compiled.bodies[0]).toMatchObject({ source: { noteIndex: 2 }, startMs: 1500, endMs: 2000 });
    expect(params.chart).toEqual(original);
  });
  it.each([false, true])('fromCursor=%s라도 커서 앞 aux5의 소속 없는 sustain은 모든 전환 부작용 전에 차단한다', fromCursor => {
    const { params, game } = setup({ fromCursor }); params.chart.notes.push({ type: 'tick', count: 1, lane: 5, beat: beat(0) });
    const before = useGameStore.getState();
    expect(performPlayTest(params)).toBe(false);
    expect(game.startExplicitPlayTest).not.toHaveBeenCalled(); expect(params.pause).not.toHaveBeenCalled();
    expect(params.closeMenu).not.toHaveBeenCalled(); expect(params.navigate).not.toHaveBeenCalled();
    expect(useGameStore.getState()).toBe(before);
  });
  it.each([false, true])('fromCursor=%s라도 커서 앞 main3의 소속 없는 sustain은 원본 전체 검증에서 차단한다', fromCursor => {
    const { params, game } = setup({ fromCursor }); params.chart.notes.push({ type: 'tick', count: 1, lane: 3, beat: beat(0) });
    const before = useGameStore.getState();
    expect(performPlayTest(params)).toBe(false);
    expect(game.startExplicitPlayTest).not.toHaveBeenCalled(); expect(params.pause).not.toHaveBeenCalled();
    expect(params.closeMenu).not.toHaveBeenCalled(); expect(params.navigate).not.toHaveBeenCalled();
    expect(useGameStore.getState()).toBe(before);
  });
  it('처음부터 시작은 현재 커서가 NaN이어도 시작 시각0ms를 전달한다', () => {
    const { params } = setup({ currentTimeMs: NaN });
    expect(performPlayTest(params)).toBe(true);
    expect(useGameStore.getState().explicitPlay?.startTimeMs).toBe(0);
  });
  it('명시 재생 포트가 없으면 1500ms 커서 시작도 기존 화면·메뉴·재생 상태를 보존한다', () => {
    const { params } = setup({ fromCursor: true, currentTimeMs: 1500 });
    params.game.startExplicitPlayTest = undefined;
    expect(performPlayTest(params)).toBe(false);
    expect(params.addToast).toHaveBeenCalledWith(expect.stringContaining('새 게임 연결'), 'error');
    expect(params.pause).not.toHaveBeenCalled(); expect(params.closeMenu).not.toHaveBeenCalled();
    expect(params.navigate).not.toHaveBeenCalled();
  });
  it('점수 항목 없는 body-only도 새 실플레이에 진입하고 공식 result는 갱신하지 않는다', () => {
    const { params } = setup({ chart: explicitPlaytestCharts[2].chart });
    expect(performPlayTest(params)).toBe(true);
    expect(useGameStore.getState().explicitPlay?.compiled.theoreticalWeight).toBe(0);
    expect(useGameStore.getState().lastResult).toBeNull();
  });
});
