import { describe, it, expect } from 'vitest';
import {
  buildSaveAsMeta,
  deserializeChart,
  parseExtraNotes,
  serializeChart,
  serializeExtraNotes,
} from './index';
import type { ChartMeta, RangeNote } from '../types/chart';
import { beat } from '../types/beat';

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

  it('restZones 필드가 없으면 에러 없이 restZones=[]로 파싱 (하위호환, RFD 0019)', () => {
    const chart = deserializeChart('{"meta":{},"notes":[],"trillZones":[],"events":[]}');
    expect(chart.restZones).toEqual([]);
  });

  it('restZones 필드가 존재하는데 배열이 아니면 에러', () => {
    expect(() => deserializeChart('{"meta":{},"notes":[],"trillZones":[],"restZones":"bad"}')).toThrow('restZones 필드가 배열이 아닙니다');
  });
});

describe('parseExtraNotes 런타임 스키마 검증', () => {
  it.each([null, [], 'text'])('최상위 값이 객체가 아닌 %s이면 에러', (value) => {
    expect(() => parseExtraNotes(value)).toThrow('top-level value must be an object');
  });

  it('별도 파일 모드에서 extraNotes 필드가 없으면 에러', () => {
    expect(() => parseExtraNotes(
      { extraLaneCount: 2 },
      { requireFileFields: true },
    )).toThrow('missing required fields');
  });

  it('extraLane=0 보조 노트는 메인 레인으로 변환될 수 있어 에러', () => {
    expect(() => parseExtraNotes({
      extraNotes: [{ type: 'single', extraLane: 0, beat: '1' }],
      extraLaneCount: 1,
    })).toThrow('invalid extraNotes');
  });

  it('beat="12junk" 보조 노트는 12박으로 묵시 변환하지 않고 에러', () => {
    expect(() => parseExtraNotes({
      extraNotes: [{ type: 'single', extraLane: 1, beat: '12junk' }],
      extraLaneCount: 1,
    })).toThrow('invalid extraNotes');
  });

  it('안전한 정수 범위를 넘는 beat는 반올림해 저장하지 않고 에러', () => {
    expect(() => parseExtraNotes({
      extraNotes: [{ type: 'single', extraLane: 1, beat: '9007199254740993' }],
      extraLaneCount: 1,
    })).toThrow('invalid extraNotes');
  });

  it('extraLane=10·extraLaneCount=10은 최대 허용 경계로 파싱', () => {
    const result = parseExtraNotes({
      extraNotes: [{ type: 'single', extraLane: 10, beat: '1/2' }],
      extraLaneCount: 10,
    });

    expect(result.extraNotes[0].extraLane).toBe(10);
    expect(result.extraLaneCount).toBe(10);
  });

  it('grace="true"인 보조 포인트 노트는 boolean이 아니므로 에러', () => {
    expect(() => parseExtraNotes({
      extraNotes: [{ type: 'single', extraLane: 1, beat: '1', grace: 'true' }],
      extraLaneCount: 1,
    })).toThrow('invalid extraNotes');
  });

  it('holdOnly=1인 보조 구간 노트는 boolean이 아니므로 에러', () => {
    expect(() => parseExtraNotes({
      extraNotes: [{ type: 'long', extraLane: 1, beat: '1', endBeat: '2', holdOnly: 1 }],
      extraLaneCount: 1,
    })).toThrow('invalid extraNotes');
  });
});

describe('보조 노트 판정 속성 저장→불러오기 왕복 보존', () => {
  it('extraLane=2 grace 포인트 노트는 왕복 후 grace=true 유지', () => {
    const source = [{
      type: 'single' as const,
      extraLane: 2,
      beat: beat(1, 2),
      grace: true,
    }];

    const result = parseExtraNotes(JSON.parse(serializeExtraNotes(source, 2)));

    expect(result.extraNotes).toEqual(source);
  });

  it('extraLane=3 holdOnly 롱노트는 왕복 후 holdOnly=true 유지', () => {
    const source = [{
      type: 'long' as const,
      extraLane: 3,
      beat: beat(1),
      endBeat: beat(2),
      holdOnly: true,
    }];

    const result = parseExtraNotes(JSON.parse(serializeExtraNotes(source, 3)));

    expect(result.extraNotes).toEqual(source);
  });

  it('grace·holdOnly가 없는 보조 노트는 직렬화 JSON에 해당 필드를 만들지 않음', () => {
    const json = JSON.parse(serializeExtraNotes([
      { type: 'single', extraLane: 1, beat: beat(0) },
      { type: 'long', extraLane: 1, beat: beat(1), endBeat: beat(2) },
    ], 1));

    expect(json.extraNotes[0]).not.toHaveProperty('grace');
    expect(json.extraNotes[1]).not.toHaveProperty('holdOnly');
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
