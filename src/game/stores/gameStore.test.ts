import { describe, it, expect } from 'vitest';
import { mergePersistedSettings, useGameStore } from './gameStore';

describe('mergePersistedSettings', () => {
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
