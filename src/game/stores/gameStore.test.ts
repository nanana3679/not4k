import { afterEach, describe, it, expect } from 'vitest';
import { mergePersistedSettings, useGameStore } from './gameStore';
import { explicitPlaytestCharts } from '../../lab/explicitPlaytestCharts';
import { prepareNormalPlay } from './explicitPlayRequest';
import { ExplicitJudgmentSession } from '../judgment/ExplicitJudgmentSession';

afterEach(() => useGameStore.setState(useGameStore.getInitialState(), true));

describe('mergePersistedSettings', () => {
  it.each([
    [1001, 1000], [-1001, -1000], [1000, 1000], [-1000, -1000], [12.5, 12.5],
    [NaN, 0], [Infinity, 0], [-Infinity, 0], [null, 0],
  ])('저장된 입력·시각 오프셋 %s를 병합하면 각각 %sms로 복원한다', (value, expected) => {
    const result = mergePersistedSettings({ settings: {
      inputOffsetMs: value, visualOffsetMs: value,
    } }, useGameStore.getInitialState());
    expect(result.settings.inputOffsetMs).toBe(expected);
    expect(result.settings.visualOffsetMs).toBe(expected);
  });

  it("문자열 '1500'으로 저장된 입력·시각 오프셋은 각각 0ms로 복원한다", () => {
    const result = mergePersistedSettings({ settings: {
      inputOffsetMs: '1500', visualOffsetMs: '1500',
    } }, useGameStore.getInitialState());
    expect(result.settings.inputOffsetMs).toBe(0);
    expect(result.settings.visualOffsetMs).toBe(0);
  });

  it.each([
    { offsetMs: 42 },
    { audioOffsetMs: 25 },
    { judgmentOffsetMs: -15 },
    { offsetMs: 42, audioOffsetMs: 25, judgmentOffsetMs: -15 },
  ])('옛 설정 %j를 읽으면 세 키를 버리고 입력·시각 오프셋은 0ms다', legacy => {
    const result = mergePersistedSettings({ settings: legacy }, useGameStore.getInitialState());
    expect(result.settings.inputOffsetMs).toBe(0);
    expect(result.settings.visualOffsetMs).toBe(0);
    for (const key of ['offsetMs', 'audioOffsetMs', 'judgmentOffsetMs']) {
      expect(result.settings).not.toHaveProperty(key);
    }
  });

  it('새 입력 −15ms·시각 +30ms와 옛 audioOffsetMs=99를 읽으면 새 값과 scrollSpeed=1000만 유지한다', () => {
    const result = mergePersistedSettings({ settings: {
      inputOffsetMs: -15, visualOffsetMs: 30, audioOffsetMs: 99, judgmentOffsetMs: 100, offsetMs: 42, scrollSpeed: 1000,
    } }, useGameStore.getInitialState());
    expect(result.settings).toMatchObject({ inputOffsetMs: -15, visualOffsetMs: 30, scrollSpeed: 1000 });
    for (const key of ['offsetMs', 'audioOffsetMs', 'judgmentOffsetMs']) expect(result.settings).not.toHaveProperty(key);
  });

  it('저장한 오프셋이 없으면 inputOffsetMs·visualOffsetMs 기본값 0ms를 유지한다', () => {
    const result = mergePersistedSettings({ settings: { scrollSpeed: 1000 } }, useGameStore.getInitialState());
    expect(result.settings).toMatchObject({ inputOffsetMs: 0, visualOffsetMs: 0, scrollSpeed: 1000 });
  });
});

describe('gameStore — masterVolume', () => {
  const makeCurrentState = () => ({
    settings: {
      masterVolume: 1.0,
      scrollSpeed: 800,
    },
  });

  it('masterVolume 기본값 = 1.0 — 저장 데이터에 masterVolume이 없으면 현재 기본값 유지', () => {
    const persisted = { settings: { scrollSpeed: 900 } };
    const result = mergePersistedSettings(persisted, makeCurrentState()) as unknown as {
      settings: { masterVolume: number };
    };
    expect(result.settings.masterVolume).toBe(1.0);
  });

  it('저장된 masterVolume = 0.5이면 0.5로 복원된다', () => {
    const persisted = { settings: { masterVolume: 0.5 } };
    const result = mergePersistedSettings(persisted, makeCurrentState()) as unknown as {
      settings: { masterVolume: number };
    };
    expect(result.settings.masterVolume).toBe(0.5);
  });

  it('저장된 masterVolume = 0이면 0으로 복원된다', () => {
    const persisted = { settings: { masterVolume: 0 } };
    const result = mergePersistedSettings(persisted, makeCurrentState()) as unknown as {
      settings: { masterVolume: number };
    };
    expect(result.settings.masterVolume).toBe(0);
  });
});

describe('gameStore — skinId', () => {
  it('처음 실행하면 기본 스킨은 classic이다', () => {
    expect(useGameStore.getInitialState().settings.skinId).toBe('classic');
  });

  it('스킨을 저장하지 않은 설정을 복원하면 기본값 classic을 유지한다', () => {
    const restored = mergePersistedSettings({ settings: { scrollSpeed: 900 } }, useGameStore.getInitialState()) as unknown as {
      settings: { skinId: string };
    };
    expect(restored.settings.skinId).toBe('classic');
  });
});

describe('gameStore — bombScale', () => {
  it('키봄 크기를 저장하지 않은 기존 설정을 복원하면 기본값 1배를 유지한다', () => {
    const current = useGameStore.getInitialState();
    expect(current.settings.bombScale).toBe(1);
    const restored = mergePersistedSettings({ settings: { skinId: 'classic' } }, current);
    expect(restored.settings.bombScale).toBe(1);
    expect(restored.settings.skinId).toBe('classic');
  });

  it.each([0, 1.7, 3])('저장된 키봄 크기 %s배를 복원하면 1배로 초기화하지 않는다', bombScale => {
    const restored = mergePersistedSettings({ settings: { bombScale } }, useGameStore.getInitialState());
    expect(restored.settings.bombScale).toBe(bombScale);
  });
});

describe('gameStore — gameplayRange', () => {
  it('selectSong에 30~90초 gameplayRange를 넘기면 selectedPlaybackRange로 저장', () => {
    useGameStore.getState().selectSong('song-1', 'HARD', 'songs/song-1/audio.ogg', {
      startTime: 30,
      endTime: 90,
      fadeInTime: 1,
      fadeOutTime: 2,
    });

    expect(useGameStore.getState().selectedPlaybackRange).toEqual({
      startTime: 30,
      endTime: 90,
      fadeInTime: 1,
      fadeOutTime: 2,
    });
  });
});

describe('gameStore — calibrationActive (보정 중 프리뷰 페이드 제어)', () => {
  it('setCalibrationActive(true)면 calibrationActive가 true가 된다', () => {
    useGameStore.getState().setCalibrationActive(true);
    expect(useGameStore.getState().calibrationActive).toBe(true);
  });

  it('보정 활성 중 설정 모달을 닫으면(setSettingsOpen(false)) calibrationActive도 false로 리셋', () => {
    useGameStore.getState().setSettingsOpen(true);
    useGameStore.getState().setCalibrationActive(true);
    useGameStore.getState().setSettingsOpen(false);
    expect(useGameStore.getState().calibrationActive).toBe(false);
    expect(useGameStore.getState().settingsOpen).toBe(false);
  });

  it('보정 활성 중 화면 전환(setScreen) 시 calibrationActive false로 리셋', () => {
    useGameStore.getState().setCalibrationActive(true);
    useGameStore.getState().setScreen('title');
    expect(useGameStore.getState().calibrationActive).toBe(false);
  });

  it('설정 모달을 여는 것(setSettingsOpen(true))은 진행 중인 calibrationActive를 건드리지 않는다', () => {
    useGameStore.getState().setCalibrationActive(true);
    useGameStore.getState().setSettingsOpen(true);
    expect(useGameStore.getState().calibrationActive).toBe(true);
  });
});

describe('gameStore — gearMotion(설정 Gear Motion)', () => {
  it('처음 실행하면 설정 Gear Motion은 켜져 있다(gearMotion true)', () => {
    expect(useGameStore.getInitialState().settings.gearMotion).toBe(true);
  });

  it('gearMotion을 저장하지 않은 기존 설정을 복원하면 켬(true)으로 채운다', () => {
    const restored = mergePersistedSettings({ settings: { renderHeight: 720 } }, useGameStore.getInitialState());
    expect(restored.settings.gearMotion).toBe(true);
    expect(restored.settings.renderHeight).toBe(720);
  });

  it('끔(false)으로 저장한 설정을 복원하면 켬으로 되돌리지 않는다', () => {
    const restored = mergePersistedSettings({ settings: { gearMotion: false } }, useGameStore.getInitialState());
    expect(restored.settings.gearMotion).toBe(false);
  });

  it('#231 전 키 frameMotion: false만 저장된 설정을 복원하면 옛 키는 버리고 gearMotion은 기본 켬(true)이다', () => {
    const restored = mergePersistedSettings({ settings: { frameMotion: false } }, useGameStore.getInitialState());
    expect(restored.settings).not.toHaveProperty('frameMotion');
    expect(restored.settings.gearMotion).toBe(true);
  });
});

describe('gameStore — flightBackgroundMotion(설정 Background Motion, RFD 0100)', () => {
  it('처음 실행하면 설정 Background Motion은 켜져 있다(flightBackgroundMotion true)', () => {
    expect(useGameStore.getInitialState().settings.flightBackgroundMotion).toBe(true);
  });

  it('flightBackgroundMotion을 저장하지 않은 기존 설정을 복원하면 켬(true)으로 채운다', () => {
    const restored = mergePersistedSettings({ settings: { renderHeight: 720, gearMotion: false } }, useGameStore.getInitialState());
    expect(restored.settings.flightBackgroundMotion).toBe(true);
    expect(restored.settings.renderHeight).toBe(720);
    expect(restored.settings.gearMotion).toBe(false);
  });

  it('flightBackgroundMotion 끔(false)·gearMotion 켬(true)으로 저장한 설정을 복원하면 두 값을 서로 바꾸지 않고 그대로 둔다', () => {
    const restored = mergePersistedSettings({ settings: { flightBackgroundMotion: false, gearMotion: true } }, useGameStore.getInitialState());
    expect(restored.settings.flightBackgroundMotion).toBe(false);
    expect(restored.settings.gearMotion).toBe(true);
  });

  it('updateSettings로 flightBackgroundMotion만 끄면 gearMotion은 켬(true)으로 남는다', () => {
    useGameStore.getState().updateSettings({ flightBackgroundMotion: false });
    expect(useGameStore.getState().settings).toMatchObject({ flightBackgroundMotion: false, gearMotion: true });
  });
});

describe('일반 곡 로딩·결과 수명', () => {
  const request = (index = 0) => prepareNormalPlay({ document: explicitPlaytestCharts[index].chart,
    audioBuffer: { duration: 4 } as AudioBuffer });
  const start = (index = 0) => {
    const state = useGameStore.getState();
    state.selectSong('song-1', 'Liftoff', 'songs/song-1/selected.mp3');
    const id = state.beginNormalPlayLoad();
    const play = request(index);
    state.completeNormalPlayLoad(id, play);
    return play;
  };

  it('선택한 곡의 음원 구간으로 만든 요청을 로딩 완료로 열면 선택 곡·음원을 유지한 purpose=play 요청과 play 화면이 열린다', () => {
    const state = useGameStore.getState();
    const playbackRange = { startTime: 1, endTime: 3, fadeInTime: .1, fadeOutTime: .2 };
    state.selectSong('song-1', 'NORMAL', 'selected.mp3', playbackRange);
    const id = state.beginNormalPlayLoad();
    state.completeNormalPlayLoad(id, prepareNormalPlay({ document: explicitPlaytestCharts[0].chart,
      audioBuffer: { duration: 4 } as AudioBuffer, playbackRange: useGameStore.getState().selectedPlaybackRange }));
    expect(useGameStore.getState()).toMatchObject({ screen: 'play', selectedSongId: 'song-1', selectedAudioUrl: 'selected.mp3',
      normalPlay: { purpose: 'play', startTimeMs: 0, auto: false, playbackRange }, lastResult: null, explicitPlay: null });
  });

  it('새 로딩은 이전 결과·요청·구형 음원을 지우고 완성된 요청과 play 화면을 한 번에 공개한다', () => {
    const old = start();
    useGameStore.getState().completeNormalPlay(old, new ExplicitJudgmentSession(old.compiled).finalize());
    const id = useGameStore.getState().beginNormalPlayLoad();
    expect(useGameStore.getState()).toMatchObject({ screen: 'loading', normalPlay: null, explicitPlay: null,
      lastResult: null, chartData: null, audioBuffer: null, startTimeMs: 0, editorReturnUrl: null });
    const next = request();
    const observed: unknown[] = [];
    const unsubscribe = useGameStore.subscribe(state => observed.push({ screen: state.screen, request: state.normalPlay }));
    expect(useGameStore.getState().completeNormalPlayLoad(id, next)).toBe(true);
    unsubscribe();
    expect(observed).toEqual([{ screen: 'play', request: next }]);
    expect(useGameStore.getState().selectedAudioUrl).toBe('songs/song-1/selected.mp3');
  });

  it.each(['cancel', 'next', 'back', 'newLoad'] as const)('%s 뒤 이전 로딩이 도착해도 요청·play·결과를 되살리지 않는다', action => {
    const state = useGameStore.getState();
    const id = state.beginNormalPlayLoad();
    if (action === 'cancel') state.cancelNormalPlayLoad(id);
    if (action === 'next') state.selectSong('song-2', 'HARD', 'other.mp3');
    if (action === 'back') state.setScreen('songSelect');
    if (action === 'newLoad') state.beginNormalPlayLoad();
    const before = useGameStore.getState();
    expect(state.completeNormalPlayLoad(id, request())).toBe(false);
    expect(useGameStore.getState()).toBe(before);
    expect(before.normalPlay).toBeNull();
    expect(before.lastResult).toBeNull();
  });

  it('Body만 있는 세션의 Miss1·분모0 결과를 그대로 전달하고 오디오 요청을 해제한다', () => {
    const play = start(2);
    const result = new ExplicitJudgmentSession(play.compiled).finalize();
    useGameStore.getState().completeNormalPlay(play, result);
    expect(useGameStore.getState()).toMatchObject({ screen: 'result', normalPlay: null,
      lastResult: { songId: 'song-1', difficulty: 'Liftoff', finalDenominatorWeight: 0,
        judgmentCounts: { miss: 1 }, isFullCombo: false } });
    expect(useGameStore.getState().lastResult?.judgmentCounts).toEqual(result.score.judgmentCounts);
    expect(useGameStore.getState().lastResult?.judgmentCounts).not.toBe(result.score.judgmentCounts);
  });

  it('점수 항목4개를 놓친 실제 세션은 분모12·달성률0·F를 공식 결과로 전달한다', () => {
    const play = start();
    const result = new ExplicitJudgmentSession(play.compiled).finalize();
    useGameStore.getState().completeNormalPlay(play, result);
    expect(useGameStore.getState().lastResult).toMatchObject({ finalDenominatorWeight: 12, achievementRate: 0, rank: 'F' });
  });

  it('완료 뒤 Back·다음 곡 로딩은 결과를 지우고 이전 완료 콜백을 무시한다', () => {
    const play = start();
    const result = new ExplicitJudgmentSession(play.compiled).finalize();
    const state = useGameStore.getState();
    state.completeNormalPlay(play, result);
    state.setScreen('songSelect');
    expect(useGameStore.getState().lastResult).toBeNull();
    const next = start(2);
    state.completeNormalPlay(play, result);
    expect(useGameStore.getState()).toMatchObject({ screen: 'play', normalPlay: next, lastResult: null });
  });

  it('unmount는 현재 요청만 정리하며 이전 화면 cleanup이 다음 요청이나 완료 결과를 지우지 않는다', () => {
    const previous = start();
    const next = start(2);
    const state = useGameStore.getState();
    state.clearNormalPlay(previous);
    expect(useGameStore.getState().normalPlay).toBe(next);
    state.completeNormalPlay(next, new ExplicitJudgmentSession(next.compiled).finalize());
    const completed = useGameStore.getState();
    state.clearNormalPlay(next);
    expect(useGameStore.getState()).toBe(completed);
    const current = start();
    state.clearNormalPlay(current);
    expect(useGameStore.getState()).toMatchObject({ normalPlay: null, lastResult: null, screen: 'songSelect' });
  });

  it('정상 로딩 완료 뒤 LoadingScreen cleanup은 새 play 요청을 취소하지 않는다', () => {
    const state = useGameStore.getState();
    const id = state.beginNormalPlayLoad();
    const play = request();
    state.completeNormalPlayLoad(id, play);
    state.cancelNormalPlayLoad(id);
    expect(useGameStore.getState()).toMatchObject({ screen: 'play', normalPlay: play });
  });
});

describe('명시 테스트 요청의 화면 수명', () => {
  afterEach(() => useGameStore.setState(useGameStore.getInitialState(), true));

  it('유효한 명시 문서를 요청하면 복제한 테스트 요청과 explicitPlay 화면을 함께 공개한다', () => {
    const document = structuredClone(explicitPlaytestCharts[0].chart);
    useGameStore.getState().startExplicitPlayTest({ document, audioBuffer: { duration: 4 } as AudioBuffer, returnUrl: '/editor?draft=1' });
    const state = useGameStore.getState();
    expect(state.screen).toBe('explicitPlay');
    expect(state.explicitPlay?.document).toEqual(document);
    expect(state.explicitPlay?.document).not.toBe(document);
    expect(state.explicitPlay?.returnUrl).toBe('/editor?draft=1');
    expect(state.lastResult).toBeNull();
  });

  it('바디 밖 틱의 요청이 실패하면 앞선 테스트 요청과 화면 상태를 보존한다', () => {
    const document = structuredClone(explicitPlaytestCharts[0].chart);
    useGameStore.getState().startExplicitPlayTest({ document, audioBuffer: { duration: 4 } as AudioBuffer, returnUrl: '/lab' });
    const previous = useGameStore.getState();
    document.notes = document.notes.filter(note => note.type !== 'body');
    expect(() => previous.startExplicitPlayTest({ document, audioBuffer: { duration: 4 } as AudioBuffer, returnUrl: '/editor' })).toThrow();
    expect(useGameStore.getState()).toBe(previous);
  });

  it('explicitPlay 뒤 곡 선택 화면으로 이동하면 이전 테스트 요청을 해제한다', () => {
    useGameStore.getState().startExplicitPlayTest({ document: explicitPlaytestCharts[0].chart, audioBuffer: { duration: 4 } as AudioBuffer, returnUrl: '/lab' });
    useGameStore.getState().setScreen('songSelect');
    expect(useGameStore.getState().explicitPlay).toBeNull();
    expect(useGameStore.getState().screen).toBe('songSelect');
  });

  it.each(['play', 'result'] as const)('명시 테스트 요청이 남은 채 %s 화면으로 이동하면 문서·음원을 담은 테스트 요청만 해제하고 normalPlay·lastResult는 유지한다', screen => {
    useGameStore.getState().startExplicitPlayTest({ document: explicitPlaytestCharts[0].chart, audioBuffer: { duration: 4 } as AudioBuffer, returnUrl: '/editor' });
    const normalPlay = prepareNormalPlay({ document: explicitPlaytestCharts[0].chart, audioBuffer: { duration: 4 } as AudioBuffer });
    const lastResult = { songId: 'song-1', difficulty: 'Liftoff', achievementRate: 100, rank: 'SSS', isFullCombo: true,
      judgmentCounts: { perfect: 4 }, goodTrillCount: 0, fastCount: 0, slowCount: 0, finalDenominatorWeight: 12 };
    useGameStore.setState({ normalPlay, lastResult });
    useGameStore.getState().setScreen(screen);
    expect(useGameStore.getState()).toMatchObject({ screen, explicitPlay: null });
    expect(useGameStore.getState().normalPlay).toBe(normalPlay);
    expect(useGameStore.getState().lastResult).toBe(lastResult);
  });
});
