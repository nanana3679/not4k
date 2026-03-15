import { describe, it, expect } from 'vitest';
import { mergePersistedSettings } from './gameStore';

describe('mergePersistedSettings', () => {
  const makeCurrentState = () => ({
    settings: {
      audioOffsetMs: 0,
      judgmentOffsetMs: 0,
      scrollSpeed: 800,
    },
  });

  it('기존 offsetMs만 있으면 audioOffsetMs로 마이그레이션', () => {
    const persisted = { settings: { offsetMs: 42 } };
    const result = mergePersistedSettings(persisted, makeCurrentState()) as unknown as {
      settings: Record<string, unknown>;
    };
    expect(result.settings.audioOffsetMs).toBe(42);
    expect(result.settings.judgmentOffsetMs).toBe(0);
    expect(result.settings).not.toHaveProperty('offsetMs');
  });

  it('audioOffsetMs가 이미 있으면 offsetMs를 무시하고 삭제만 수행', () => {
    const persisted = { settings: { offsetMs: 10, audioOffsetMs: 25 } };
    const result = mergePersistedSettings(persisted, makeCurrentState()) as unknown as {
      settings: Record<string, unknown>;
    };
    expect(result.settings.audioOffsetMs).toBe(25);
    expect(result.settings).not.toHaveProperty('offsetMs');
  });

  it('offsetMs가 없으면 기본값 0 유지', () => {
    const persisted = { settings: { scrollSpeed: 1000 } };
    const result = mergePersistedSettings(persisted, makeCurrentState()) as unknown as {
      settings: Record<string, unknown>;
    };
    expect(result.settings.audioOffsetMs).toBe(0);
    expect(result.settings.judgmentOffsetMs).toBe(0);
    expect(result.settings.scrollSpeed).toBe(1000);
  });

  it('judgmentOffsetMs가 persisted에 있으면 그대로 반영', () => {
    const persisted = { settings: { judgmentOffsetMs: -15 } };
    const result = mergePersistedSettings(persisted, makeCurrentState()) as unknown as {
      settings: Record<string, unknown>;
    };
    expect(result.settings.judgmentOffsetMs).toBe(-15);
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
