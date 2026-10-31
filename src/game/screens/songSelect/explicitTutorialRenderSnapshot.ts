import type { ExplicitCompiledChart } from '../../judgment/explicitCompiledChart';
import type {
  ExplicitBodyUnitSnapshot,
  ExplicitItemSnapshot,
  ExplicitJudgmentSnapshot,
} from '../../judgment/ExplicitJudgmentState';
import { TUTORIAL_PREVIEW_RENDER_CYCLES } from './tutorialPreviewChart';

/** 화면의 활성 복사본(0～2)과 세션의 상대 반복 차수로 3벌 표시 compile 전체의 공개 상태를 만든다. */
export type ExplicitTutorialRenderSnapshotQuery = (
  live: ExplicitJudgmentSnapshot,
  activeRenderCycle: number,
  /** 화면 반복 대비 세션 차수 차이. -1이면 이전 반복의 상태이며, 생략하면 같은 반복이다. */
  sessionIterationOffset?: number,
) => ExplicitJudgmentSnapshot;

const itemKey = (sourceNoteIndex: number, kind: string, ordinal: number) => `${sourceNoteIndex}:${kind}:${ordinal}`;
const unitKey = (bodyIndex: number, ordinal: number) => `${bodyIndex}:${ordinal}`;

function indexSnapshot(snapshot: ExplicitJudgmentSnapshot) {
  return {
    itemsByKey: new Map(snapshot.items.map(item => [itemKey(item.sourceNoteIndex, item.kind, item.ordinal), item])),
    unitsByKey: new Map(snapshot.bodyUnits.map(unit => [unitKey(unit.ref.bodyIndex, unit.ref.ordinal), unit])),
  };
}

const shiftTime = (timeMs: number | null, offsetMs: number) => timeMs === null ? null : timeMs + offsetMs;

/**
 * `ExplicitNotePresenter`는 compile된 항목마다 공개 상태를 요구하므로, 3벌 표시 compile의 모든 항목에 상태를 채운다.
 * 세션이 속한 복사본만 live 상태를 받고 나머지는 판정 전 상태로 그린다. 음수 입력 오프셋·경계 정산 대기로 세션이 늦으면
 * 이전 복사본에 적용한다. 표시 note index는 복사본 × 원본 노트 수 + 원본 index이며 id·ref는 표시 compile의 것을 쓴다.
 * live 시각 필드는 원본 시각에 세션 복사본 × loopMs를 더한 표시 시각이다.
 *
 * @param unjudged 같은 원본 compile로 만든 세션의 판정 전 snapshot(아무 입력도 진행하지 않은 상태)
 */
export function createExplicitTutorialRenderSnapshotQuery(
  renderChart: ExplicitCompiledChart,
  sourceNoteCount: number,
  loopMs: number,
  unjudged: ExplicitJudgmentSnapshot,
): ExplicitTutorialRenderSnapshotQuery {
  // 손배치처럼 노트가 없는 시연도 있다. 노트가 없으면 표시 항목도 없어 아래 나눗셈을 쓰지 않는다.
  const hasRenderEntries = renderChart.scoreItems.length > 0 || renderChart.bodyUnits.length > 0;
  if (!Number.isInteger(sourceNoteCount) || sourceNoteCount < 0 || (sourceNoteCount === 0 && hasRenderEntries)) {
    throw new RangeError(`원본 노트 수는 0 이상의 정수이고 표시 항목이 있으면 양수여야 합니다: ${sourceNoteCount}`);
  }
  if (!Number.isFinite(loopMs) || loopMs <= 0) throw new RangeError(`반복 길이는 양수여야 합니다: ${loopMs}`);
  const unjudgedIndex = indexSnapshot(unjudged);
  const renderUnits = renderChart.bodyUnits.map(unit => ({
    unit,
    cycle: Math.floor(unit.ref.bodyIndex / sourceNoteCount),
    key: unitKey(unit.ref.bodyIndex % sourceNoteCount, unit.ref.ordinal),
  }));
  const renderItems = renderChart.scoreItems.map(item => ({
    item,
    cycle: Math.floor(item.source.noteIndex / sourceNoteCount),
    key: itemKey(item.source.noteIndex % sourceNoteCount, item.kind, item.ordinal),
  }));
  const required = <T>(value: T | undefined, renderId: string): T => {
    if (value === undefined) throw new Error(`명시 튜토리얼 표시 항목의 원본 상태가 없습니다: ${renderId}`);
    return value;
  };

  return (live, activeRenderCycle, sessionIterationOffset = 0) => {
    if (!Number.isInteger(activeRenderCycle) || activeRenderCycle < 0 || activeRenderCycle >= TUTORIAL_PREVIEW_RENDER_CYCLES) {
      throw new RangeError(`표시 복사본 번호는 0～${TUTORIAL_PREVIEW_RENDER_CYCLES - 1}이어야 합니다: ${activeRenderCycle}`);
    }
    const liveIndex = indexSnapshot(live);
    const sessionRenderCycle = activeRenderCycle + sessionIterationOffset;
    const offsetMs = sessionRenderCycle * loopMs;
    const bodyUnits = renderUnits.map(({ unit, cycle, key }): ExplicitBodyUnitSnapshot => {
      const active = cycle === sessionRenderCycle;
      const state = required((active ? liveIndex : unjudgedIndex).unitsByKey.get(key), unit.id);
      const shift = active ? offsetMs : 0;
      return Object.freeze({
        ...state,
        id: unit.id,
        ref: unit.ref,
        actualStartMs: shiftTime(state.actualStartMs, shift),
        completedAtMs: shiftTime(state.completedAtMs, shift),
        failedAtMs: shiftTime(state.failedAtMs, shift),
        maintenanceSinceMs: shiftTime(state.maintenanceSinceMs, shift),
        maintenanceDeadlineMs: shiftTime(state.maintenanceDeadlineMs, shift),
      });
    });
    const items = renderItems.map(({ item, cycle, key }): ExplicitItemSnapshot => {
      const state = required((cycle === sessionRenderCycle ? liveIndex : unjudgedIndex).itemsByKey.get(key), item.id);
      return Object.freeze({ ...state, id: item.id, sourceNoteIndex: item.source.noteIndex });
    });
    return Object.freeze({ atMs: live.atMs + offsetMs, bodyUnits: Object.freeze(bodyUnits), items: Object.freeze(items) });
  };
}
