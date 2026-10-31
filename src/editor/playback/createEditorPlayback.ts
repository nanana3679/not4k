import type { useEditorStore } from '../stores/editorStore';
import type { TimelineRenderer } from '../timeline/TimelineRenderer';
import { timelineRangeMsOf } from '../timeline/timelineRange';
import { getWaveformPeaks } from '../timeline/waveform';
import { createWaveformFeed } from '../waveformFeed';
import type { CursorBeatKeeper } from './cursorBeatKeeper';
import { PlaybackController } from './PlaybackController';
import { syncTimelineRange } from './syncTimelineRange';

/** 편집 세션의 커서와 재생기를 연결한다. */
export function createEditorPlayback({ store, cursorBeatKeeper, getRenderer, setLoadedAudioBuffer }: {
  store: Pick<typeof useEditorStore, 'getState'>;
  cursorBeatKeeper: CursorBeatKeeper;
  getRenderer: () => Pick<TimelineRenderer, 'setWaveformData' | 'getTotalTimelineMs' | 'updatePlaybackCursor'> | null;
  setLoadedAudioBuffer: (buffer: AudioBuffer) => void;
}) {
  // 렌더러 준비·오디오 도착 순서와 무관하게 최신 파형의 범위와 커서를 함께 반영한다.
  const waveformFeed = createWaveformFeed((buffer) => {
    const renderer = getRenderer();
    if (!renderer) return;
    const peaks = getWaveformPeaks(buffer, Math.ceil(buffer.sampleRate / 50));
    renderer.setWaveformData(peaks, buffer.duration * 1000);
    syncTimelineRange({
      store, playback, cursorBeatKeeper, renderer,
      timelineRange: timelineRangeMsOf(store.getState().chart.meta.offsetMs, renderer.getTotalTimelineMs()),
    });
  });
  const playback = new PlaybackController({
    onAudioLoaded: (buffer) => {
      setLoadedAudioBuffer(buffer);
      waveformFeed.audioArrived(buffer);
    },
    getCursorTimeMs: () => store.getState().currentTimeMs,
    onTimeUpdate: (timeMs) => store.getState().setCurrentTimeMs(timeMs),
    onPlayStateChange: (isPlaying) => {
      store.getState().setIsPlaying(isPlaying);
      if (!isPlaying) {
        syncTimelineRange({
          store, playback, cursorBeatKeeper,
          timelineRange: store.getState().timelineRangeMs,
        });
      }
    },
  });
  return { playback, waveformFeed };
}
