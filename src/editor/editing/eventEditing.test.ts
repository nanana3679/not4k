import { describe, expect, it } from 'vitest';
import { beat } from '../../shared';
import type { ChartEvent } from '../../shared';
import { createsDuplicateInitialTiming, eventInBounds, translateEvent } from './eventEditing';

const bpm = (at: number, value = 120): ChartEvent => ({ type: 'bpm', beat: beat(at), bpm: value });
const signature = (at: number): ChartEvent => ({ type: 'timeSignature', beat: beat(at), beatPerMeasure: beat(4) });
const text = (start: number, end: number, editorLane?: number): ChartEvent =>
  ({ type: 'text', beat: beat(start), endBeat: beat(end), text: 'text', ...(editorLane === undefined ? {} : { editorLane }) });

describe('translateEvent 박·레인 평행이동', () => {
  it('보조 레인1 text [4,8)을 박 +2·레인 +1 옮기면 [6,10)·보조 레인2다', () => {
    expect(translateEvent(text(4, 8, 1), beat(2), 1)).toEqual(text(6, 10, 2));
  });

  it('4박 BPM을 박 +2·레인 +1 옮기면 6박이 되고 editorLane은 생기지 않는다', () => {
    expect(translateEvent(bpm(4), beat(2), 1)).toEqual(bpm(6));
  });

  it('4박 박자를 레인 -1만 옮기면 4박 그대로이고 editorLane은 생기지 않는다', () => {
    expect(translateEvent(signature(4), beat(0), -1)).toEqual(signature(4));
  });
});

describe('eventInBounds 시간·보조 레인 범위', () => {
  it('보조 레인 수 2에서 보조 레인3 text는 범위 밖이다', () => {
    expect(eventInBounds(text(4, 8, 3), 100, 2)).toBe(false);
  });

  it('보조 레인 수 0에서도 4박 BPM·박자는 전용 열이라 범위 안이다', () => {
    expect(eventInBounds(bpm(4), 100, 0)).toBe(true);
    expect(eventInBounds(signature(4), 100, 0)).toBe(true);
  });

  it('최대 100박에서 120박 BPM과 -1박 BPM은 범위 밖이다', () => {
    expect(eventInBounds(bpm(120), 100, 2)).toBe(false);
    expect(eventInBounds(bpm(-1), 100, 2)).toBe(false);
  });
});

describe('createsDuplicateInitialTiming 편집으로 0박에 온 BPM·박자의 중복 판정', () => {
  it('0박 BPM이 있는데 편집한 BPM 180이 0박에 오면 true다', () => {
    expect(createsDuplicateInitialTiming([bpm(0), signature(0), bpm(0, 180)], [2])).toBe(true);
  });

  it('0박 박자가 없으면 편집한 박자가 0박에 와도 false다', () => {
    expect(createsDuplicateInitialTiming([bpm(0), signature(0)], [1])).toBe(false);
  });

  it('0박 BPM이 있어도 종류가 다른 편집한 박자는 0박 박자가 없으면 false다', () => {
    expect(createsDuplicateInitialTiming([bpm(0), signature(0)], [1])).toBe(false);
  });

  it('편집한 4박 BPM·0박 text는 초기 설정이 아니라 0박 BPM이 있어도 false다', () => {
    expect(createsDuplicateInitialTiming([bpm(0), signature(0), bpm(4), text(0, 4, 3)], [2, 3])).toBe(false);
  });

  it('편집하지 않은 0박 BPM 120·150 중복이 있어도 편집한 4박 text는 false다', () => {
    expect(createsDuplicateInitialTiming([bpm(0), bpm(0, 150), signature(0), text(4, 8, 3)], [3])).toBe(false);
  });

  it('편집한 BPM 두 개가 모두 0박에 오면 서로 중복이라 true다', () => {
    expect(createsDuplicateInitialTiming([signature(0), bpm(0), bpm(0, 150)], [1, 2])).toBe(true);
  });
});
