import type { useEditorStore } from '../stores/editorStore';
import type { TimelineRangeMs } from '../stores/viewportSlice';
import type { CursorBeatKeeper } from './cursorBeatKeeper';
import type { PlaybackController } from './PlaybackController';

/** 차트·파형·렌더러 준비로 달라진 범위를 재생기와 편집 세션에 반영한다. */
export function syncTimelineRange({ store, playback, cursorBeatKeeper, timelineRange }: {
  store: Pick<typeof useEditorStore, 'getState'>;
  playback: Pick<PlaybackController, 'isPlaying' | 'seekTo' | 'setEndTimeMs'> | null;
  cursorBeatKeeper: CursorBeatKeeper;
  timelineRange: TimelineRangeMs | null;
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
}
