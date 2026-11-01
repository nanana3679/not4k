import type { LoadedSongSharedData } from '../supabase/songSharedData';
import type { StoredChartRow } from '../supabase/chartRows';
import { createEditorSong } from './songState';
import type { LoadedEditorChartAsset } from './chartAssetLoad';
import { placeInitialTimingEvents } from './editing/initialTimingPlacement';
import { toSavedChartJson } from './savedChart';
import { useEditorStore } from './stores/editorStore';

/**
 * 불러온 차트를 에디터의 불러온 기본 상태로 연다.
 *
 * `loadChart` 전에 0박 초기 BPM을 보조 레인1, 초기 박자를 보조 레인2에 두고 이벤트 목록 맨 앞(맨 아래 그림)으로
 * 옮긴다(RFD 0082). 일반 이벤트는 레인을 옮기지 않아, 그 자리와 겹친 일반 이벤트는 `eventOverlap` 위반으로 남고
 * `loadChart`의 경고 알림이 뜬다. 그 일반 이벤트는 초기 설정 위에 그려져 클릭·드래그로 잡힌다. 보조 레인 수는 보조
 * 레인1·2가 보이도록 적어도 2로 연다. `setChart`를 거치지 않으므로 이 배치는 편집 이력이 아니다. 배치 결과와 보조
 * 레인 수로 `savedChartJson`을 만들고 이력을 비워, 열자마자 dirty·Undo·Redo가 없다. 서버·원본 파일에는 쓰지 않으며,
 * 사용자가 저장할 때 옮긴 초기 설정 배치가 함께 저장된다. 로드는 차트 변이 게이트의 유일한 예외 통로라 배치 뒤 남은
 * 위반 차트도 열어 수리를 허용한다. 함께 받은 `charts` 행(ID·리비전·파일 경로)은 차트 저장의 대상이다(RFD 0107).
 */
export function openEditorChart(
  asset: LoadedEditorChartAsset,
  song?: LoadedSongSharedData | null,
  chartRow: StoredChartRow | null = null,
): void {
  const store = useEditorStore.getState();
  // 파일이 보조 레인 수를 정하지 않으면 지금 store 값(처음 열 때 기본 2)을 유지한다.
  const fileDefinesExtraLaneCount = asset.extraLaneCount > 0 || asset.hasExtraLaneCount;
  const baseExtraLaneCount = fileDefinesExtraLaneCount ? asset.extraLaneCount : store.extraLaneCount;
  const placed = placeInitialTimingEvents(asset.chart.events, baseExtraLaneCount);
  const chart = { ...asset.chart, events: placed.events };
  if (song) chart.meta = { ...chart.meta, audioFile: song.audioUrl,
    previewAudioFile: song.previewUrl ?? '', previewStart: song.previewStart ?? undefined,
    previewEnd: song.previewEnd ?? undefined };
  store.loadChart(chart);
  // 레인 수를 차트와 같이 정해야 lastValidSnapshot이 (차트, 레인 수) 짝을 맞춘다. 이때 쌓인 이력은 아래에서 비운다.
  store.setExtraLaneCount(placed.extraLaneCount);
  // savedChartJson은 보조 레인 수를 정한 뒤 만든다. 먼저 만들면 기본값 2로 직렬화해, 보조 레인 수 3인 차트가
  // 열자마자 dirty가 된다.
  const loaded = useEditorStore.getState();
  loaded.setSavedChartJson(toSavedChartJson(loaded.chart, loaded.extraLaneCount));
  loaded.setSong(song ? createEditorSong(song, loaded.chart) : null);
  loaded.setChartRow(chartRow);
  loaded.resetHistory();
}
