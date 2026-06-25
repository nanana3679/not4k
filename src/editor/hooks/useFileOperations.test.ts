import { describe, it, expect, vi } from 'vitest';
import { performPlayTest, type PerformPlayTestParams } from './useFileOperations';
import { useEditorStore } from '../stores';

// 에디터 스토어의 기본 차트를 그대로 사용 (createDefaultChart는 비공개라 store 경유)
const baseChart = useEditorStore.getState().chart;
const fakeAudioBuffer = {} as AudioBuffer;

function buildParams(overrides: Partial<PerformPlayTestParams> = {}) {
  const game = {
    setChartData: vi.fn(),
    setAudioBuffer: vi.fn(),
    setStartTimeMs: vi.fn(),
    setEditorReturnUrl: vi.fn(),
    setScreen: vi.fn(),
  };
  const addToast = vi.fn();
  const pause = vi.fn();
  const closeMenu = vi.fn();
  const navigate = vi.fn();
  const params: PerformPlayTestParams = {
    fromCursor: false,
    audioBuffer: fakeAudioBuffer,
    isPlaying: false,
    pause,
    chart: baseChart,
    currentTimeMs: 12345,
    returnUrl: '/editor?songId=abc&difficulty=expert',
    game,
    addToast,
    closeMenu,
    navigate,
    ...overrides,
  };
  return { params, game, addToast, pause, closeMenu, navigate };
}

describe('performPlayTest', () => {
  it('오디오 미로딩 시 에러 토스트 띄우고 화면 전환·네비게이션 안 하고 false 반환', () => {
    const { params, game, addToast, navigate } = buildParams({ audioBuffer: null });

    const result = performPlayTest(params);

    expect(result).toBe(false);
    expect(addToast).toHaveBeenCalledWith('오디오가 로딩되지 않았습니다', 'error');
    expect(game.setScreen).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('fromCursor=false면 startTimeMs를 0으로 설정', () => {
    const { params, game } = buildParams({ fromCursor: false, currentTimeMs: 8000 });

    performPlayTest(params);

    expect(game.setStartTimeMs).toHaveBeenCalledWith(0);
  });

  it('fromCursor=true면 startTimeMs를 현재 커서 위치(currentTimeMs)로 설정', () => {
    const { params, game } = buildParams({ fromCursor: true, currentTimeMs: 8000 });

    performPlayTest(params);

    expect(game.setStartTimeMs).toHaveBeenCalledWith(8000);
  });

  it('재생 중이면 테스트 플레이 전 pause 호출', () => {
    const { params, pause } = buildParams({ isPlaying: true });

    performPlayTest(params);

    expect(pause).toHaveBeenCalledTimes(1);
  });

  it('재생 중이 아니면 pause 호출 안 함', () => {
    const { params, pause } = buildParams({ isPlaying: false });

    performPlayTest(params);

    expect(pause).not.toHaveBeenCalled();
  });

  it('성공 시 play 화면 전환·복귀 URL 저장·메뉴 닫기·네비게이션 수행하고 true 반환', () => {
    const { params, game, closeMenu, navigate } = buildParams({
      returnUrl: '/editor?songId=abc&difficulty=expert',
    });

    const result = performPlayTest(params);

    expect(result).toBe(true);
    expect(game.setChartData).toHaveBeenCalledWith(baseChart);
    expect(game.setAudioBuffer).toHaveBeenCalledWith(fakeAudioBuffer);
    expect(game.setEditorReturnUrl).toHaveBeenCalledWith('/editor?songId=abc&difficulty=expert');
    expect(game.setScreen).toHaveBeenCalledWith('play');
    expect(closeMenu).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});
