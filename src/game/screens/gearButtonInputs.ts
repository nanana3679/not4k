import type { JudgmentInput } from '../judgment/JudgmentCore';

/** 판정 적용 순서로 누름·뗌을 받는 쪽(`GameRenderer.setGearButtonKey`). */
export interface GearButtonPressTarget {
  setGearButtonKey(lane: number, key: string, pressed: boolean): void;
}

interface GearButtonInput {
  type: 'down' | 'up';
  lane: number;
  key: string;
}

const emptyRecord = (): GearButtonInput => ({ type: 'up', lane: 0, key: '' });

/**
 * 한 렌더 프레임의 판정 입력 기록기. `playSessionInput` drain이 넘긴 관찰자를 core가 입력 적용 직전에 부른다.
 * 수동·AutoPlayer 입력 모두 시간순, 같은 timestamp 안에서는 core가 실제 적용하는 순서로 down/up을 기록한다.
 * `renderFrame` 직전 flush가 같은 순서로 렌더러를 누르고 뗀다. 렌더러는 노트 종류와 관계없이 현재 hold 수로 색을 정한다.
 * 기록 칸 64개를 미리 만들고 재사용한다. 한 프레임의 입력 수가 기존 최대 용량을 넘을 때만 늘리며, flush는 할당하지 않는다.
 */
export class GearButtonInputs {
  private readonly records: GearButtonInput[] = Array.from({ length: 64 }, emptyRecord);
  private count = 0;
  /** 재생으로 렌더러에 눌러 둔 키. 프레임을 넘어 렌더러의 키 상태와 같게 유지한다. 이미 눌린 키의 down(AutoPlayer 이어 누름)은 hold 수를 늘리지 않는다. */
  private readonly heldKeys = new Set<string>();
  /** 이번 flush에서 아직 누르지 않은 키의 up 수. 키 이름과 수를 같은 칸에 두고 flush마다 길이만 0으로 되돌려 재사용한다. */
  private readonly pendingUpKeys: string[] = [];
  private readonly pendingUpCounts: number[] = [];
  private pendingUpLength = 0;

  readonly onInput = (input: Readonly<JudgmentInput>): void => {
    const record = this.records[this.count] ?? (this.records[this.count] = emptyRecord());
    record.type = input.type === 'down' || input.type === 'press' ? 'down' : 'up';
    record.lane = input.lane ?? 1;
    record.key = input.key;
    this.count += 1;
  };

  /** 이번 프레임에 아직 재생하지 않은 down/up 수. */
  get pending(): number { return this.count; }

  /**
   * 기록을 같은 순서로 렌더러에 재생한다. 일시정지 중에는 J가 멈춘 채 handlerDelay만 빠지므로 같은 키의 up이 down보다 이른 시각으로
   * 큐에 들어갈 수 있다(예: down 999ms, up 996ms, 두 번 탭하면 up·up·down·down). 아직 누르지 않은 키의 up은 키별로 수를 세어 보류했다가,
   * 같은 flush에서 그 키를 누를 때마다 하나씩 꺼내 누른 직후 뗀다. 그래서 탭 수와 상관없이 버튼이 눌린 채 남지 않는다.
   * 다만 down·down·up으로 뒤섞여 실제로는 다시 누르고 있는데 뗀 모습이 되는 경우는 판정 core도 같은 순서로 받으므로 그대로 두며,
   * 다음 뗌에서 정리된다(판정 쪽 같은 순서 문제는 #249 T9). 입력이 없는 프레임은 바로 돌아가 아무것도 할당하지 않는다.
   */
  flush(target: GearButtonPressTarget): void {
    if (this.count === 0) return;
    for (let index = 0; index < this.count; index++) {
      const record = this.records[index];
      if (record.type === 'down') {
        this.heldKeys.add(record.key);
        target.setGearButtonKey(record.lane, record.key, true);
        // 이 down보다 뒤에 일어난 up이 먼저 재생됐다. 누른 모습을 보인 뒤 바로 뗀다.
        if (this.takePendingUp(record.key)) {
          this.heldKeys.delete(record.key);
          target.setGearButtonKey(record.lane, record.key, false);
        }
      } else if (this.heldKeys.delete(record.key)) {
        target.setGearButtonKey(record.lane, record.key, false);
      } else {
        this.addPendingUp(record.key);
      }
    }
    this.pendingUpLength = 0;
    this.count = 0;
  }

  private addPendingUp(key: string): void {
    for (let index = 0; index < this.pendingUpLength; index++) {
      if (this.pendingUpKeys[index] === key) {
        this.pendingUpCounts[index] += 1;
        return;
      }
    }
    this.pendingUpKeys[this.pendingUpLength] = key;
    this.pendingUpCounts[this.pendingUpLength] = 1;
    this.pendingUpLength += 1;
  }

  private takePendingUp(key: string): boolean {
    for (let index = 0; index < this.pendingUpLength; index++) {
      if (this.pendingUpKeys[index] !== key || this.pendingUpCounts[index] === 0) continue;
      this.pendingUpCounts[index] -= 1;
      return true;
    }
    return false;
  }
}
