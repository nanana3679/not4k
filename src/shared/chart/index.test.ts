import { describe, it, expect } from 'vitest';
import { buildSaveAsMeta } from './index';
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
