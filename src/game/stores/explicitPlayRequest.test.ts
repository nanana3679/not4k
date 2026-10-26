import { afterEach, describe, expect, it } from 'vitest';
import { beat } from '../../shared';
import { explicitPlaytestCharts } from '../../lab/explicitPlaytestCharts';
import { useGameStore } from './gameStore';
import { prepareExplicitPlayTest, prepareNormalPlay } from './explicitPlayRequest';

const audioBuffer = { duration: 4 } as AudioBuffer;
const options = () => ({ document: structuredClone(explicitPlaytestCharts[0].chart), audioBuffer, returnUrl: '/editor?draft=1' });
afterEach(() => useGameStore.setState(useGameStore.getInitialState(), true));

describe('명시 테스트 진입 게이트', () => {
  it('Point·Body·Sustain·Release 문서는 원본 복사와 전체 분모12를 소유하고 explicitPlay만 연다', () => {
    const input = options();
    const legacy = useGameStore.getState().chartData;
    useGameStore.getState().startExplicitPlayTest(input);
    const state = useGameStore.getState();
    expect(state.screen).toBe('explicitPlay');
    expect(state.explicitPlay?.compiled.theoreticalWeight).toBe(12);
    expect(state.explicitPlay?.startTimeMs).toBe(0);
    expect(state.explicitPlay?.document).not.toBe(input.document);
    input.document.notes.length = 0;
    expect(state.explicitPlay?.document.notes).toHaveLength(5);
    expect(state.chartData).toBe(legacy);
    expect(state.lastResult).toBeNull();
    expect(state.editorReturnUrl).toBeNull();
  });

  it.each([-1, NaN, Infinity, -Infinity])('startTimeMs=%s이면 화면·기존 요청·설정·결과를 모두 보존한다', startTimeMs => {
    useGameStore.getState().startExplicitPlayTest(options());
    useGameStore.setState({ settingsOpen: true, calibrationActive: true });
    const before = useGameStore.getState();
    expect(() => before.startExplicitPlayTest({ ...options(), startTimeMs })).toThrow('0 이상의 유한한 값');
    expect(useGameStore.getState()).toBe(before);
  });

  it.each([0, 1500, 5000])('음원4초에서 startTimeMs=%s 요청은 원본문서·메타데이터·audio·복귀URL·auto를 보존한다', startTimeMs => {
    const input = { ...options(), startTimeMs, auto: true };
    input.document.notes.unshift({ type: 'single', lane: 5, beat: beat(0) });
    const original = structuredClone(input.document);
    const request = prepareExplicitPlayTest(input);
    expect(request.startTimeMs).toBe(startTimeMs);
    expect(request.document).toEqual(original);
    expect(request.document).not.toBe(input.document);
    expect(request.document.meta).not.toBe(input.document.meta);
    expect(request.document.notes).not.toBe(input.document.notes);
    expect(request.audioBuffer).toBe(audioBuffer);
    expect(request.returnUrl).toBe('/editor?draft=1');
    expect(request.auto).toBe(true);
    input.document.meta.title = '편집 중 변경';
    input.document.notes.length = 0;
    expect(request.document).toEqual(original);
  });

  it.each([0, 1500])('startTimeMs=%s에서 시각0ms의 legacy main single이 섞이면 전체 진입을 거부한다', startTimeMs => {
    const input = options();
    input.document.notes.unshift({ type: 'single', lane: 3, beat: beat(0) });
    const before = useGameStore.getState();
    expect(() => before.startExplicitPlayTest({ ...input, startTimeMs })).toThrow('컴파일 실패');
    expect(useGameStore.getState()).toBe(before);
  });

  it.each([0, 1500])('startTimeMs=%s에서 시각0ms의 aux lane5에 소속 없는 Sustain이 있으면 부작용 전에 거부한다', startTimeMs => {
    const input = options();
    input.document.notes.push({ type: 'sustain', lane: 5, beat: beat(0), count: 1 });
    const before = useGameStore.getState();
    expect(() => before.startExplicitPlayTest({ ...input, startTimeMs })).toThrow('컴파일 실패');
    expect(useGameStore.getState()).toBe(before);
  });

  it('aux 의미 위반과 NaN 시작 시각이 함께 있으면 전체 문서 오류를 먼저 보고한다', () => {
    const input = options();
    input.document.notes.push({ type: 'sustain', lane: 5, beat: beat(0), count: 1 });
    expect(() => prepareExplicitPlayTest({ ...input, startTimeMs: NaN })).toThrow('컴파일 실패');
  });

  it.each([0, -1, NaN, Infinity])('음원 길이%s초이면 새 요청을 만들지 않고 기존 화면·요청을 보존한다', duration => {
    useGameStore.getState().startExplicitPlayTest(options());
    const before = useGameStore.getState();
    expect(() => before.startExplicitPlayTest({ ...options(), audioBuffer: { duration } as AudioBuffer })).toThrow('음원이 없습니다');
    expect(useGameStore.getState()).toBe(before);
  });

  it('첫 노트인 legacy aux single은 문서에 남고 main4항목의 원본 인덱스1·3·4·5를 보존한다', () => {
    const input = options();
    input.document.notes.unshift({ type: 'single', lane: 5, beat: beat(0) });
    const request = prepareExplicitPlayTest(input);
    expect(request.document.notes).toHaveLength(6);
    expect(request.compiled.totalJudgments).toBe(4);
    expect(request.compiled.scoreItems.map(item => item.source.noteIndex)).toEqual([1, 3, 4, 5]);
    expect(request.compiled.bodies[0].source.noteIndex).toBe(2);
  });

  it('1500ms 커서의 Sustain부터 3항목·분모9를 만들고 바디는 원본 인덱스2의 1500～2000ms만 남긴다', () => {
    const input = options();
    input.document.notes.unshift({ type: 'single', lane: 5, beat: beat(0) });
    const original = structuredClone(input.document);
    const request = prepareExplicitPlayTest({ ...input, startTimeMs: 1500 });
    expect(request.compiled.totalJudgments).toBe(3);
    expect(request.compiled.theoreticalWeight).toBe(9);
    expect(request.compiled.scoreItems.map(item => [item.id, item.timeMs])).toEqual([
      ['n3:sustain:0', 1500], ['n4:release:0', 2000], ['n5:point:0', 3000],
    ]);
    expect(request.compiled.bodies[0]).toMatchObject({ source: { noteIndex: 2 },
      beat: beat(2), endBeat: beat(4), startMs: 1500, endMs: 2000, startPointIndices: [] });
    expect(request.compiled.bodyUnits[0]).toMatchObject({ id: 'b2:hold:0', startMs: 1500, endMs: 2000, weight: 0 });
    expect(request.compiled.timing.noteTimesMs.get(2)).toBe(1000);
    expect(request.document).toEqual(original);
    expect(input.document).toEqual(original);
  });

  it('1500.001ms 커서는 1500ms Sustain도 제외하고 원본 시각2000·3000ms의 2항목·분모6만 남긴다', () => {
    const request = prepareExplicitPlayTest({ ...options(), startTimeMs: 1500.001 });
    expect(request.compiled.scoreItems.map(item => item.timeMs)).toEqual([2000, 3000]);
    expect(request.compiled.totalJudgments).toBe(2);
    expect(request.compiled.theoreticalWeight).toBe(6);
    expect(request.compiled.bodies[0].startMs).toBe(1500.001);
    expect(request.document.notes).toHaveLength(5);
  });

  it('모든 노트 뒤 5000ms 커서는 원본5개를 보존하며 점수0항목·분모0·바디0개로 시작한다', () => {
    const request = prepareExplicitPlayTest({ ...options(), startTimeMs: 5000 });
    expect(request.document.notes).toHaveLength(5);
    expect(request.startTimeMs).toBe(5000);
    expect(request.compiled.scoreItems).toEqual([]);
    expect(request.compiled.bodies).toEqual([]);
    expect(request.compiled.totalJudgments).toBe(0);
    expect(request.compiled.theoreticalWeight).toBe(0);
  });

  it('점수 항목 없는 Body는 분모0으로 진입하고 clear는 요청과 오디오 참조를 해제한다', () => {
    useGameStore.getState().startExplicitPlayTest({ ...options(), document: explicitPlaytestCharts[2].chart });
    expect(useGameStore.getState().explicitPlay?.compiled.theoreticalWeight).toBe(0);
    useGameStore.getState().clearExplicitPlayTest();
    expect(useGameStore.getState().explicitPlay).toBeNull();
    expect(useGameStore.getState().screen).toBe('songSelect');
  });
});

describe('일반 곡 재생 요청', () => {
  it('일반 곡은 purpose=play·0ms·수동 입력·/game 복귀와 선택 음원 구간을 보존한다', () => {
    const playbackRange = { startTime: 1, endTime: 3, fadeInTime: .2, fadeOutTime: .3 };
    const request = prepareNormalPlay({ ...options(), playbackRange });
    expect(request).toMatchObject({ purpose: 'play', startTimeMs: 0, auto: false, returnUrl: '/game', playbackRange });
    expect(request.playbackRange).not.toBe(playbackRange);
    expect(request.audioBuffer).toBe(audioBuffer);
    expect(prepareExplicitPlayTest(options()).purpose).toBeUndefined();
  });

  it('offsetMs=-1500의 첫 Point가 -500ms여도 일반 요청은 전체4항목·분모12를 보존한다', () => {
    const input = options();
    input.document.meta.offsetMs = -1500;
    const request = prepareNormalPlay(input);
    expect(request.compiled.scoreItems[0].timeMs).toBe(-500);
    expect(request.compiled.totalJudgments).toBe(4);
    expect(request.compiled.theoreticalWeight).toBe(12);
  });

  it('main에 legacy single이 섞이면 일반 요청을 거부하고 원본과 aux를 바꾸지 않는다', () => {
    const input = options();
    input.document.notes.push({ type: 'single', lane: 3, beat: beat(0) }, { type: 'single', lane: 5, beat: beat(0) });
    const original = structuredClone(input.document);
    expect(() => prepareNormalPlay(input)).toThrow('컴파일 실패');
    expect(input.document).toEqual(original);
  });

  it('aux lane5의 legacy single은 허용하고 소속 없는 Sustain은 전체 문서 검증에서 거부한다', () => {
    const input = options();
    input.document.notes.push({ type: 'single', lane: 5, beat: beat(0) });
    expect(prepareNormalPlay(input).document.notes.at(-1)).toEqual(input.document.notes.at(-1));
    input.document.notes.push({ type: 'sustain', lane: 6, beat: beat(0), count: 1 });
    expect(() => prepareNormalPlay(input)).toThrow('컴파일 실패');
  });

  it.each([0, -1, NaN, Infinity])('일반 곡 음원 길이%s이면 요청을 만들지 않는다', duration => {
    expect(() => prepareNormalPlay({ ...options(), audioBuffer: { duration } as AudioBuffer })).toThrow('음원이 없습니다');
  });

  it('Body만 있는 유효 문서는 일반 play·분모0으로 준비한다', () => {
    const request = prepareNormalPlay({ ...options(), document: explicitPlaytestCharts[2].chart });
    expect(request.purpose).toBe('play');
    expect(request.compiled.theoreticalWeight).toBe(0);
    expect(request.compiled.bodies).toHaveLength(1);
  });
});
