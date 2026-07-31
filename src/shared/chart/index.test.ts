import { describe, it, expect } from 'vitest';
import {
  buildSaveAsMeta,
  deserializeChart,
  parseExtraNotes,
  serializeChart,
  serializeExtraNotes,
} from './index';
import { beat } from '../types/beat';
import type { ChartMeta, NoteEntity, RangeNote } from '../types/chart';

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

describe('holdOnly 저장→불러오기 왕복 보존', () => {
  function chartJson(notes: object[]): string {
    return JSON.stringify({ version: 3, meta: baseMeta, notes, trillZones: [], events: [] });
  }

  it('holdOnly 롱노트는 저장→불러오기 왕복 후에도 holdOnly=true 유지', () => {
    const loaded = deserializeChart(chartJson([{ type: 'long', lane: 1, beat: '0', endBeat: '4', holdOnly: true }]));
    const roundTripped = deserializeChart(serializeChart(loaded));
    expect((roundTripped.notes[0] as RangeNote).holdOnly).toBe(true);
  });

  it('holdOnly 더블롱도 왕복 후 holdOnly=true 유지', () => {
    const loaded = deserializeChart(chartJson([{ type: 'doubleLong', lane: 2, beat: '0', endBeat: '4', holdOnly: true }]));
    const roundTripped = deserializeChart(serializeChart(loaded));
    expect((roundTripped.notes[0] as RangeNote).holdOnly).toBe(true);
  });

  it('serializeChart 출력 JSON에 holdOnly 필드가 포함된다', () => {
    const loaded = deserializeChart(chartJson([{ type: 'long', lane: 1, beat: '0', endBeat: '4', holdOnly: true }]));
    expect(serializeChart(loaded)).toContain('"holdOnly": true');
  });

  it('holdOnly 없는 롱노트는 왕복 후에도 holdOnly 미부여(undefined)', () => {
    const loaded = deserializeChart(chartJson([{ type: 'long', lane: 1, beat: '0', endBeat: '4' }]));
    const roundTripped = deserializeChart(serializeChart(loaded));
    expect((roundTripped.notes[0] as RangeNote).holdOnly).toBeUndefined();
  });
});

describe('통합 보조 레인 JSON 왕복', () => {
  it('lane=5·7 노트를 저장하면 extraLane=1·3으로 변환하고 메인 노트는 제외', () => {
    const notes: NoteEntity[] = [
      { type: 'single', lane: 1, beat: beat(0) },
      { type: 'single', lane: 5, beat: beat(1) },
      { type: 'long', lane: 7, beat: beat(2), endBeat: beat(3) },
    ];

    expect(JSON.parse(serializeExtraNotes(notes, 3))).toEqual({
      extraNotes: [
        { type: 'single', extraLane: 1, beat: '1' },
        { type: 'long', extraLane: 3, beat: '2', endBeat: '3' },
      ],
      extraLaneCount: 3,
    });
  });

  it('extraLane=2 grace와 holdOnly 노트를 불러오면 lane=6 속성을 보존', () => {
    const parsed = parseExtraNotes({
      extraNotes: [
        { type: 'single', extraLane: 2, beat: '1', grace: true },
        { type: 'long', extraLane: 2, beat: '2', endBeat: '3', holdOnly: true },
      ],
      extraLaneCount: 2,
    });

    expect(parsed.notes).toEqual([
      { type: 'single', lane: 6, beat: beat(1), grace: true },
      { type: 'long', lane: 6, beat: beat(2), endBeat: beat(3), holdOnly: true },
    ]);
  });

  it('선택 필드가 없는 기존 extra JSON은 다시 저장해도 grace·holdOnly를 추가하지 않음', () => {
    const parsed = parseExtraNotes({
      extraNotes: [{ type: 'single', extraLane: 1, beat: '1' }],
      extraLaneCount: 1,
    });

    expect(JSON.parse(serializeExtraNotes(parsed.notes, parsed.extraLaneCount))).toEqual({
      extraNotes: [{ type: 'single', extraLane: 1, beat: '1' }],
      extraLaneCount: 1,
    });
  });
});
