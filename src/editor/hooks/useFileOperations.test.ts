import { describe, it, expect, vi } from 'vitest';
import { performPlayTest, resolveAudioUploadPath, resolvePreviewRegenRange, type PerformPlayTestParams } from './useFileOperations';
import type { PlaybackRange } from '../../shared';
import { useEditorStore } from '../stores';

function fakeAudioFile(name: string): File {
  return new File([new Uint8Array([0])], name, { type: 'audio/ogg' });
}

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

describe('resolveAudioUploadPath', () => {
  it('교체 오디오 파일이 없으면(null) null 반환', () => {
    expect(resolveAudioUploadPath(null, 'song1')).toBe(null);
  });

  it('song.ogg 교체 시 songs/{songId}/audio.ogg 경로 반환', () => {
    expect(resolveAudioUploadPath(fakeAudioFile('song.ogg'), 'song1')).toBe('songs/song1/audio.ogg');
  });

  it('확장자가 mp3면 audio.mp3 경로로 반환', () => {
    expect(resolveAudioUploadPath(fakeAudioFile('my-track.mp3'), 'song1')).toBe('songs/song1/audio.mp3');
  });

  it('대문자 확장자 .OGG는 소문자 audio.ogg로 정규화', () => {
    expect(resolveAudioUploadPath(fakeAudioFile('SONG.OGG'), 'song1')).toBe('songs/song1/audio.ogg');
  });

  it('확장자가 비어 있으면(예: "track.") 기본 확장자 ogg 사용', () => {
    expect(resolveAudioUploadPath(fakeAudioFile('track.'), 'song1')).toBe('songs/song1/audio.ogg');
  });
});

describe('resolvePreviewRegenRange', () => {
  const pendingRange: PlaybackRange = { startTime: 10, endTime: 20, fadeInTime: 1, fadeOutTime: 2 };

  it('프리뷰 구간을 변경했으면 그 구간(페이드 포함)을 그대로 사용', () => {
    expect(resolvePreviewRegenRange(pendingRange, false, {})).toEqual(pendingRange);
  });

  it('구간 변경이 우선: 오디오도 교체했더라도 변경한 구간을 사용', () => {
    expect(resolvePreviewRegenRange(pendingRange, true, { previewStart: 5, previewEnd: 8 })).toEqual(pendingRange);
  });

  it('오디오만 교체하고 기존 프리뷰 구간이 있으면 그 구간을 페이드 0으로 재생성', () => {
    expect(resolvePreviewRegenRange(null, true, { previewStart: 5, previewEnd: 8 })).toEqual({
      startTime: 5,
      endTime: 8,
      fadeInTime: 0,
      fadeOutTime: 0,
    });
  });

  it('오디오를 교체해도 기존 프리뷰 구간이 없으면 재생성 안 함(null)', () => {
    expect(resolvePreviewRegenRange(null, true, {})).toBe(null);
  });

  it('구간 변경도 없고 오디오 교체도 없으면 재생성 안 함(null)', () => {
    expect(resolvePreviewRegenRange(null, false, { previewStart: 5, previewEnd: 8 })).toBe(null);
  });

  it('previewStart가 0이어도(falsy 아님) 유효 구간으로 인식', () => {
    expect(resolvePreviewRegenRange(null, true, { previewStart: 0, previewEnd: 8 })).toEqual({
      startTime: 0,
      endTime: 8,
      fadeInTime: 0,
      fadeOutTime: 0,
    });
  });
});

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
