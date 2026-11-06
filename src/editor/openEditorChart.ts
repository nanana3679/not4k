import type { LoadedSongSharedData } from '../supabase/songSharedData';
import type { StoredChartRow } from '../supabase/chartRows';
import { createEditorSong } from './songState';
import type { LoadedEditorChartAsset } from './chartAssetLoad';
import { toSavedChartJson } from './savedChart';
import { useEditorStore } from './stores/editorStore';

/** 에디터가 여는 보조 레인 수의 최솟값. */
const MIN_EXTRA_LANE_COUNT = 2;

/**
 * 불러온 차트를 에디터의 불러온 기본 상태로 연다.
 *
 * 보조 레인 수는 적어도 2로 연다. `setChart`를 거치지 않으므로 이 보정은 편집 이력이 아니다. 보정한 보조 레인 수로
 * `savedChartJson`을 만들고 이력을 비워, 열자마자 dirty·Undo·Redo가 없다. 서버·원본 파일에는 쓰지 않는다.
 * 로드는 차트 변이 게이트의 유일한 예외 통로라 위반 차트도 열어 수리를 허용한다. 함께 받은 `charts` 행(ID·리비전·파일
 * 경로)은 차트 저장의 대상이다(RFD 0107).
 */
export function openEditorChart(
  asset: LoadedEditorChartAsset,
  song?: LoadedSongSharedData | null,
  chartRow: StoredChartRow | null = null,
): void {
  const store = useEditorStore.getState();
  // 파일이 보조 레인 수를 정하지 않으면 지금 store 값(처음 열 때 기본 2)을 유지한다.
  const fileDefinesExtraLaneCount = asset.extraLaneCount > 0 || asset.hasExtraLaneCount;
  const extraLaneCount = Math.max(fileDefinesExtraLaneCount ? asset.extraLaneCount : store.extraLaneCount, MIN_EXTRA_LANE_COUNT);
  const chart = { ...asset.chart };
  if (song) chart.meta = { ...chart.meta, audioFile: song.audioUrl,
    previewAudioFile: song.previewUrl ?? '', previewStart: song.previewStart ?? undefined,
    previewEnd: song.previewEnd ?? undefined };
  store.loadChart(chart);
  store.setSong(song ? createEditorSong(song, chart) : null);
  // 곡 초안을 먼저 정해 lastValidSnapshot이 차트·레인 수·초안을 함께 담는다. 이때 쌓인 이력은 아래에서 비운다.
  store.setExtraLaneCount(extraLaneCount);
  // savedChartJson은 보조 레인 수를 정한 뒤 만든다. 먼저 만들면 기본값 2로 직렬화해, 보조 레인 수 3인 차트가
  // 열자마자 dirty가 된다.
  const loaded = useEditorStore.getState();
  loaded.setSavedChartJson(toSavedChartJson(loaded.chart, loaded.extraLaneCount));
  loaded.setChartRow(chartRow);
  loaded.resetHistory();
}
