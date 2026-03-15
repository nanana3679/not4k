import { describe, it, expect } from 'vitest';
import { buildSaveAsMeta, deserializeChart } from './index';
import type { ChartMeta } from '../types/chart';

const baseMeta: ChartMeta = {
  title: 'Test Song',
  artist: 'Test Artist',
  difficultyLabel: 'HARD',
  difficultyLevel: 10,
  imageFile: 'jacket.jpg',
  audioFile: 'audio.ogg',
  previewAudioFile: 'preview.wav',
  offsetMs: 0,
};

describe('buildSaveAsMeta', () => {
  it('HARD → EASY 변환 시 difficultyLabel="EASY", difficultyLevel=3', () => {
    const result = buildSaveAsMeta(baseMeta, 'EASY', 3);
    expect(result).not.toBeNull();
    expect(result!.difficultyLabel).toBe('EASY');
    expect(result!.difficultyLevel).toBe(3);
  });

  it('대상이 현재 난이도와 같으면 null 반환', () => {
    const result = buildSaveAsMeta(baseMeta, 'HARD', 10);
    expect(result).toBeNull();
  });

  it('대소문자 무시 — "hard"와 "HARD"는 같은 난이도로 판단', () => {
    const result = buildSaveAsMeta(baseMeta, 'hard', 5);
    expect(result).toBeNull();
  });

  it('원본 메타의 다른 필드는 보존', () => {
    const result = buildSaveAsMeta(baseMeta, 'EXPERT', 15);
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Test Song');
    expect(result!.artist).toBe('Test Artist');
    expect(result!.imageFile).toBe('jacket.jpg');
    expect(result!.audioFile).toBe('audio.ogg');
    expect(result!.offsetMs).toBe(0);
  });

  it('NORMAL Lv.7 → EXPERT Lv.14 변환', () => {
    const normalMeta: ChartMeta = { ...baseMeta, difficultyLabel: 'NORMAL', difficultyLevel: 7 };
    const result = buildSaveAsMeta(normalMeta, 'EXPERT', 14);
    expect(result).not.toBeNull();
    expect(result!.difficultyLabel).toBe('EXPERT');
    expect(result!.difficultyLevel).toBe(14);
  });
});

describe('deserializeChart 입력 검증', () => {
  it('유효하지 않은 JSON이면 에러', () => {
    expect(() => deserializeChart('not json')).toThrow('유효한 JSON이 아닙니다');
  });

  it('최상위 값이 객체가 아니면 에러', () => {
    expect(() => deserializeChart('"string"')).toThrow('최상위 값이 객체가 아닙니다');
  });

  it('meta 필드가 없으면 에러', () => {
    expect(() => deserializeChart('{"notes":[],"trillZones":[]}')).toThrow('meta 필드가 없거나 유효하지 않습니다');
  });

  it('notes 필드가 배열이 아니면 에러', () => {
    expect(() => deserializeChart('{"meta":{},"notes":"bad","trillZones":[]}')).toThrow('notes 필드가 배열이 아닙니다');
  });

  it('trillZones 필드가 배열이 아니면 에러', () => {
    expect(() => deserializeChart('{"meta":{},"notes":[],"trillZones":"bad"}')).toThrow('trillZones 필드가 배열이 아닙니다');
  });
});
