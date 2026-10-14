import type { NoteEntity } from '../../shared';
import type { JudgmentInput } from '../judgment/NoteJudgmentCore';
import { gearButtonPressColor, type GearButtonColor } from '../renderer/gearButtons';

/** 판정 적용 순서로 누름·뗌을 받는 쪽(`GameRenderer.setGearButtonKey`). */
export interface GearButtonPressTarget {
  setGearButtonKey(lane: number, key: string, pressed: boolean, color?: GearButtonColor): void;
}

interface GearButtonInput {
  type: 'down' | 'up';
  lane: number;
  key: string;
  consumedNoteIndex: number | null;
}

const emptyRecord = (): GearButtonInput => ({ type: 'up', lane: 0, key: '', consumedNoteIndex: null });

/**
 * 한 렌더 프레임의 판정 입력 기록기. `playSessionInput` drain이 넘긴 관찰자를 core가 입력 적용 직전에 부른다.
 * 수동·AutoPlayer 입력 모두 시간순, 같은 timestamp 안에서는 core가 실제 적용하는 순서로 down/up을 기록한다.
 * 이어지는 press 안의 동기 `onDownConsumed`가 바로 그 down에 소비된 노트 index를 붙인다(판정 규칙은 바꾸지 않음).
 * `renderFrame` 직전 flush가 같은 순서로 렌더러를 누르고 뗀다. 소비된 down은 노트 종류로, 공입력은 재생 중 그 순간의
 * held 키 수(합성 키 포함)로 색을 정하므로 같은 키의 재누름에도 이전 누름의 색이 섞이지 않는다.
 * 기록 칸 64개를 미리 만들고 재사용한다. 한 프레임의 입력 수가 기존 최대 용량을 넘을 때만 늘리며, flush는 할당하지 않는다.
 */
export class GearButtonPressColors {
  private readonly records: GearButtonInput[] = Array.from({ length: 64 }, emptyRecord);
  private count = 0;

  /** notes는 판정 core와 같은 노트 배열(`CompiledJudgmentChart.rawNotes`)이다. */
  constructor(private readonly notes: readonly NoteEntity[]) {}

  readonly onInput = (input: JudgmentInput): void => {
    const record = this.records[this.count] ?? (this.records[this.count] = emptyRecord());
    record.type = input.type === 'down' || input.type === 'press' ? 'down' : 'up';
    record.lane = input.lane ?? 1;
    record.key = input.key;
    record.consumedNoteIndex = null;
    this.count += 1;
  };

  /** 직전에 관찰한 down의 press 호출 안에서만 동기적으로 발생하는 소비 알림. */
  readonly onDownConsumed = (key: string, lane: number, noteIndex: number): void => {
    const record = this.records[this.count - 1];
    if (record?.type === 'down' && record.key === key && record.lane === lane) record.consumedNoteIndex = noteIndex;
  };

  /** 이번 프레임에 아직 재생하지 않은 down/up 수. */
  get pending(): number { return this.count; }

  flush(target: GearButtonPressTarget): void {
    for (let index = 0; index < this.count; index++) {
      const record = this.records[index];
      const note = record.consumedNoteIndex === null ? undefined : this.notes[record.consumedNoteIndex];
      // 색을 생략하면 renderer가 이 down을 held에 추가한 직후의 키 수로 공입력 색을 정한다.
      target.setGearButtonKey(record.lane, record.key, record.type === 'down', note ? gearButtonPressColor(note.type, 0) : undefined);
    }
    this.count = 0;
  }
}
