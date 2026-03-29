import type React from 'react';
import { beat } from '../../../shared';
import type { Chart } from '../../../shared';
import type { DbSong } from './types';

export const DIFFICULTIES = ['EASY', 'NORMAL', 'HARD', 'EXPERT'] as const;

const DIFFICULTY_ORDER = new Map(DIFFICULTIES.map((d, i) => [d, i]));

export function getDifficultyOrder(label: string): number {
  return DIFFICULTY_ORDER.get(label.toUpperCase() as typeof DIFFICULTIES[number]) ?? DIFFICULTIES.length;
}

export function getDifficultyColor(difficulty: string): React.CSSProperties {
  switch (difficulty.toLowerCase()) {
    case 'easy': return { backgroundColor: '#2d6a4f', borderColor: '#40916c' };
    case 'normal': return { backgroundColor: '#1d4e89', borderColor: '#2a6db5' };
    case 'hard': return { backgroundColor: '#7b2d26', borderColor: '#a33b32' };
    case 'expert': return { backgroundColor: '#5c2d82', borderColor: '#7b3fa8' };
    default: return { backgroundColor: '#3a3a3a', borderColor: '#555' };
  }
}

export function createEmptyChart(song: DbSong, difficulty: string, level: number): Chart {
  return {
    meta: {
      title: song.title,
      artist: song.artist,
      difficultyLabel: difficulty.toUpperCase(),
      difficultyLevel: level,
      imageFile: '',
      audioFile: '',
      previewAudioFile: '',
      offsetMs: 0,
    },
    notes: [],
    trillZones: [],
    events: [{ type: "bpm" as const, beat: beat(0, 1), bpm: 120 }, { type: "timeSignature" as const, beat: beat(0, 1), beatPerMeasure: beat(4, 1) }],
  };
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function generateSongId(title: string): string {
  const slug = slugify(title) || 'song';
  const hex = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  return `${slug}-${hex}`;
}

export function getCircularDistance(a: number, b: number, total: number): number {
  if (total === 0) return 0;
  const d = Math.abs(a - b);
  return Math.min(d, total - d);
}
