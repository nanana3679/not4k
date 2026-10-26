import { describe, expect, it, vi } from 'vitest';
import { beat } from '../../shared';
import type { ChartDocument, DocumentNoteEntity } from '../../shared';
import { performPlayTest } from './performPlayTest';
import type { PerformPlayTestParams } from './performPlayTest';

function setup(notes: DocumentNoteEntity[], overrides: Partial<PerformPlayTestParams> = {}) {
  const chart: ChartDocument = {
    meta: { title: '편집 경계', artist: '', difficultyLabel: 'NORMAL', difficultyLevel: 5,
      imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
    notes, trillZones: [],
    events: [{ type: 'bpm', beat: beat(0), bpm: 120 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4) }],
  };
  const game = { setChartData: vi.fn(), setAudioBuffer: vi.fn(), setStartTimeMs: vi.fn(),
    setEditorReturnUrl: vi.fn(), setScreen: vi.fn() };
  const params: PerformPlayTestParams = {
    chart, audioBuffer: { duration: 4 } as AudioBuffer, fromCursor: false, currentTimeMs: 2000,
    returnUrl: '/editor?songId=draft&difficulty=normal', isPlaying: true,
    pause: vi.fn(), addToast: vi.fn(), closeMenu: vi.fn(), navigate: vi.fn(), game, ...overrides,
  };
  return { params, game };
}

function expectPreserved(params: PerformPlayTestParams) {
  for (const action of Object.values(params.game)) expect(action).not.toHaveBeenCalled();
  expect(params.pause).not.toHaveBeenCalled();
  expect(params.closeMenu).not.toHaveBeenCalled();
  expect(params.navigate).not.toHaveBeenCalled();
}

describe('새 게임 연결 전 테스트 플레이 경계', () => {
  it.each([false, true])('fromCursor=%s에서 구형 main+명시 aux는 main만 재생하고 원본문서와 2000ms 커서를 보존한다', fromCursor => {
    const main: DocumentNoteEntity = { type: 'single', lane: 1, beat: beat(0), grace: false };
    const { params, game } = setup([main, { type: 'release', lane: 5, beat: beat(2), count: 2, grace: true }], { fromCursor });
    const original = structuredClone(params.chart);
    expect(performPlayTest(params)).toBe(true);
    expect(game.setChartData).toHaveBeenCalledWith({ ...params.chart, notes: [main] });
    expect(game.setAudioBuffer).toHaveBeenCalledWith(params.audioBuffer);
    expect(game.setStartTimeMs).toHaveBeenCalledWith(fromCursor ? 2000 : 0);
    expect(game.setEditorReturnUrl).toHaveBeenCalledWith(params.returnUrl);
    expect(game.setScreen).toHaveBeenCalledWith('play');
    expect(params.pause).toHaveBeenCalledOnce();
    expect(params.closeMenu).toHaveBeenCalledOnce();
    expect(params.navigate).toHaveBeenCalledOnce();
    expect(params.chart).toEqual(original);
  });

  it.each(['point', 'body', 'release', 'sustain'] as const)('main에 %s가 있으면 새 게임 연결 안내 후 오디오·게임·화면을 보존한다', type => {
    const notes: DocumentNoteEntity[] = type === 'point'
      ? [{ type, kind: 'single', lane: 1, beat: beat(2) }]
      : type === 'release' ? [{ type, count: 1, lane: 1, beat: beat(2) }]
      : [{ type: 'body', holdCount: 1, lane: 1, beat: beat(1), endBeat: beat(3) },
        ...(type === 'sustain' ? [{ type: 'sustain' as const, count: 1 as const, lane: 1, beat: beat(2) }] : [])];
    const { params } = setup(notes);
    expect(performPlayTest(params)).toBe(false);
    expect(params.addToast).toHaveBeenCalledWith('명시적 노트의 테스트 플레이는 새 게임 연결 후 사용할 수 있습니다', 'error');
    expectPreserved(params);
  });

  it('커서 2000ms 앞에 구형 single과 명시 Point가 섞인 main은 구형 노트만 골라 실행하지 않는다', () => {
    const { params } = setup([{ type: 'single', lane: 1, beat: beat(0) },
      { type: 'point', kind: 'double', lane: 2, beat: beat(1) }], { fromCursor: true });
    expect(performPlayTest(params)).toBe(false);
    expectPreserved(params);
  });

  it.each(['semantic', 'structural'] as const)('구형 main이라도 aux의 %s 위반은 main 필터 전에 거부하고 상태를 보존한다', violation => {
    const invalidAux: DocumentNoteEntity = violation === 'semantic'
      ? { type: 'sustain', count: 1, lane: 7, beat: beat(2) }
      : { type: 'body', holdCount: 1, lane: 7, beat: beat(3), endBeat: beat(1) };
    const { params } = setup([{ type: 'single', lane: 1, beat: beat(0) }, invalidAux]);
    expect(performPlayTest(params)).toBe(false);
    expect(params.addToast).toHaveBeenCalledWith(expect.stringContaining('배치 제약 위반'), 'error');
    expectPreserved(params);
  });

  it('오디오가 없으면 빈 차트도 로딩 안내 후 게임·화면을 보존한다', () => {
    const { params } = setup([], { audioBuffer: null });
    expect(performPlayTest(params)).toBe(false);
    expect(params.addToast).toHaveBeenCalledWith('오디오가 로딩되지 않았습니다', 'error');
    expectPreserved(params);
  });
});
