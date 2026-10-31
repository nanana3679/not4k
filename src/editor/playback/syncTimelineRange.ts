import type { useEditorStore } from '../stores/editorStore';
import type { TimelineRangeMs } from '../stores/viewportSlice';
import type { TimelineRenderer } from '../timeline/TimelineRenderer';
import type { CursorBeatKeeper } from './cursorBeatKeeper';
import type { PlaybackController } from './PlaybackController';

/** 차트·파형·렌더러 준비로 달라진 범위를 재생기와 편집 세션에 반영한다. */
export function syncTimelineRange({ store, playback, cursorBeatKeeper, timelineRange, renderer }: {
  store: Pick<typeof useEditorStore, 'getState'>;
  playback: Pick<PlaybackController, 'isPlaying' | 'seekTo' | 'setEndTimeMs'> | null;
  cursorBeatKeeper: CursorBeatKeeper;
  timelineRange: TimelineRangeMs | null;
  renderer?: Pick<TimelineRenderer, 'updatePlaybackCursor'> | null;
}): void {
  if (timelineRange) {
    playback?.setEndTimeMs(timelineRange.totalTimelineMs);
    store.getState().setTimelineRangeMs(timelineRange);
  }
  // 음원 로드 중 seek·편집될 수 있으므로 완료 시점의 커서와 차트를 읽는다.
  const { chart, chartLoadGeneration, currentTimeMs } = store.getState();
  cursorBeatKeeper.syncToChart({
    chart,
    loadGeneration: chartLoadGeneration,
    cursorMs: currentTimeMs,
    playback,
    timelineRange,
  });
  // init·파형으로 좌표가 바뀌면 커서 시각이 같아도 다시 그린다. 커서 이동으로 세지 않는다.
  renderer?.updatePlaybackCursor(store.getState().currentTimeMs);
}
