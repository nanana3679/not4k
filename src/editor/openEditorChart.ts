import type { LoadedEditorChartAsset } from './chartAssetLoad';
import { separateInitialTimingEvents } from './editing/initialTimingSeparation';
import { toSavedChartJson } from './savedChart';
import { useEditorStore } from './stores/editorStore';

/**
 * 불러온 차트를 에디터의 불러온 기본 상태로 연다.
 *
 * 겹친 0박 초기 BPM·박자 설정은 `loadChart` 전에 빈 보조 레인으로 분리한다(RFD 0082). `setChart`를 거치지 않으므로
 * 분리는 편집 이력이 아니다. 분리 결과와 필요한 보조 레인 수로 `savedChartJson`을 만들고 이력을 비워, 열자마자
 * dirty·Undo·Redo가 없다. 서버·원본 파일에는 쓰지 않으며, 사용자가 저장할 때 분리된 배치가 함께 저장된다.
 * 로드는 차트 변이 게이트의 유일한 예외 통로라 분리 뒤 남은 위반 차트도 열어 수리를 허용한다.
 */
export function openEditorChart(asset: LoadedEditorChartAsset): void {
  const store = useEditorStore.getState();
  // 파일이 보조 레인 수를 정하지 않으면 지금 store 값(처음 열 때 기본 2)을 유지한다.
  const fileDefinesExtraLaneCount = asset.extraLaneCount > 0 || asset.hasExtraLaneCount;
  const baseExtraLaneCount = fileDefinesExtraLaneCount ? asset.extraLaneCount : store.extraLaneCount;
  const separated = separateInitialTimingEvents(asset.chart.events, baseExtraLaneCount);
  store.loadChart(separated.events === asset.chart.events ? asset.chart : { ...asset.chart, events: separated.events });
  // 레인 수를 차트와 같이 정해야 lastValidSnapshot이 (차트, 레인 수) 짝을 맞춘다. 이때 쌓인 이력은 아래에서 비운다.
  store.setExtraLaneCount(separated.extraLaneCount);
  // savedChartJson은 보조 레인 수를 정한 뒤 만든다. 먼저 만들면 기본값 2로 직렬화해, 보조 레인 수 3인 차트가
  // 열자마자 dirty가 된다.
  const loaded = useEditorStore.getState();
  loaded.setSavedChartJson(toSavedChartJson(loaded.chart, loaded.extraLaneCount));
  loaded.resetHistory();
}
