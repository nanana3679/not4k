import type { ChartDocument } from '../shared';
import { CreateMode, DeleteMode, SelectMode } from './modes';
import { useEditorStore } from './stores';
import type { TimelineSpace } from './timeline/TimelineSpace';

export interface EditorModes {
  createMode: CreateMode;
  selectMode: SelectMode;
  deleteMode: DeleteMode;
}

/**
 * 에디터 store에 연결한 편집 모드 3종을 만든다. App과 캔버스 입력 테스트가 같은 연결을 쓰도록 한곳에 둔다.
 *
 * RFD 0018 ④d: 세 모드가 전부 통합 차트(chart.notes 한 배열, 메인 lane 1..4 + 보조 lane 5+) 하나만 다룬다.
 * 히트테스트 인덱스와 모드가 든 차트의 인덱스 공간이 같아, 정규형 파티션이 깨진 차트(통합 이동·paste 이후)에서도
 * 인덱스 오해석이 없다. 거부 이유는 모두 store 토스트(`addToast`)로 알린다.
 */
export function createEditorModes(
  chart: ChartDocument,
  { space, isTimeInBounds }: { space: TimelineSpace; isTimeInBounds: (y: number) => boolean },
): EditorModes {
  const store = () => useEditorStore.getState();
  const warn = (message: string) => store().addToast(message, 'warn');

  const createMode = new CreateMode(chart, {
    onChartUpdate: (c) => store().setChart(c, { separateHistory: true }),
    space,
    isTimeInBounds,
    onWarn: warn,
  });

  const selectMode = new SelectMode(chart, {
    // RFD 0018 ④: SelectMode는 통합 차트 하나만 다룬다 — onChartUpdate가 chart.notes를
    // 그대로(메인·보조 통합) 쓴다. 이원 축(getExtraNotes/onExtraNotesUpdate/xToExtraLane/
    // hitTestExtraNote)은 소멸했고, 히트테스트는 통합(hitTestUnifiedNote)이다.
    onChartUpdate: (c, transaction) => store().setChart(c, { transaction }),
    beginTransaction: (onInterrupt, selectionBefore) => store().beginEditTransaction("selectModeEdit", onInterrupt, selectionBefore),
    commitTransaction: token => store().commitEditTransaction(token),
    cancelTransaction: token => store().cancelEditTransaction(token),
    // 선택의 소유자는 SelectionSlice — SelectMode는 사본 없이 getter/setter로만 읽고 쓴다 (RFD 0016)
    getSelection: () => store().selection,
    setSelection: (sel) => store().setSelection(sel),
    setSelectionTransient: (sel) => store().setSelectionTransient(sel),
    space,
    getExtraLaneCount: () => store().extraLaneCount,
    // 붙여넣기 보조 레인 자동 확장 (RFD 0018 §8-6 D3) — 붙여넣은 보조 노트가 숨지 않도록.
    setExtraLaneCount: (count, transaction) => store().setExtraLaneCount(count, transaction),
    onWarn: warn,
  });

  const deleteMode = new DeleteMode(chart, {
    // 노트 삭제는 chart.notes 축소 커밋이 남은 선택을 identity로 재매핑한다 — 별도 보정 불필요.
    onChartUpdate: (c) => store().setChart(c),
    space,
    getSelectedNotes: () => store().selection.notes,
    onWarn: warn,
  });

  return { createMode, selectMode, deleteMode };
}
