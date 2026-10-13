import type { NoteEntity } from '../../shared';
import { gearButtonPressColor, type GearButtonColor } from '../renderer/gearButtons';

/** 판정이 정한 누름 색을 받는 쪽(`GameRenderer.resolveGearButtonPress`). */
export interface GearButtonPressTarget {
  resolveGearButtonPress(lane: number, key: string, color: GearButtonColor): void;
}

interface PressColor {
  lane: number;
  key: string;
  color: GearButtonColor;
}

/**
 * 플레이 화면의 기어 버튼 색 중 "노트를 친 누름"의 색을 판정에서 받아 렌더 프레임을 그리기 직전에 넘긴다.
 *
 * 키를 누르면 렌더러는 곧바로 공입력 규칙(그 레인에 누르고 있는 키 수)의 색으로 버튼을 누른다. 그 누름이 노트를 쳤는지는 게임 루프가
 * `stepPlaySession`으로 입력 큐를 비울 때 판정 core가 keydown을 노트에 소비하면서 알린다(`onDownConsumed`). 이 객체가 그 알림을 모아 두었다가,
 * 같은 렌더 프레임의 `AutoPlayer` 누름까지 렌더러에 넘긴 뒤 `flush`로 노트 규칙의 색(친 노트가 더블이면 금색)을 넘긴다. 렌더러는 `renderFrame`
 * 안에서만 그리므로, 누름이 처음 보이는 프레임에는 이미 맞는 색이다.
 * 알림은 키 누름마다 한 번이고, 기록 칸은 처음 쓸 때만 만들어 다시 쓴다(렌더 프레임마다 객체를 만들지 않는다).
 */
export class GearButtonPressColors {
  private readonly records: PressColor[] = [];
  private count = 0;

  /** notes는 판정 core와 같은 노트 배열(`CompiledJudgmentChart.rawNotes`)이다. noteIndex로 친 노트의 종류를 찾는다. */
  constructor(private readonly notes: readonly NoteEntity[]) {}

  /** `NoteJudgmentSession`의 `onDownConsumed`: keydown이 noteIndex 노트에 소비됐다. */
  readonly onDownConsumed = (key: string, lane: number, noteIndex: number): void => {
    const type = this.notes[noteIndex]?.type ?? null;
    if (type === null) return;
    const record = this.records[this.count] ?? (this.records[this.count] = { lane: 0, key: '', color: 'single' });
    record.lane = lane;
    record.key = key;
    record.color = gearButtonPressColor(type, 0);
    this.count += 1;
  };

  /** 아직 넘기지 않은 노트 친 누름 수. */
  get pending(): number {
    return this.count;
  }

  /** 모아 둔 색을 판정 순서대로 target에 넘기고 비운다. 게임 루프가 `renderFrame` 직전에 부른다. */
  flush(target: GearButtonPressTarget): void {
    for (let index = 0; index < this.count; index++) {
      const record = this.records[index];
      target.resolveGearButtonPress(record.lane, record.key, record.color);
    }
    this.count = 0;
  }
}
