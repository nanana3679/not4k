import type { useEditorStore } from '../stores/editorStore';
import type { TimelineRenderer } from '../timeline/TimelineRenderer';
import { setChartAndReadTimelineRange, timelineRangeMsOf } from '../timeline/timelineRange';
import { getWaveformPeaks } from '../timeline/waveform';
import { createWaveformFeed } from '../waveformFeed';
import type { CursorBeatKeeper } from './cursorBeatKeeper';
import { PlaybackController } from './PlaybackController';
import { syncTimelineRange } from './syncTimelineRange';

/** 편집 세션의 커서와 재생기를 연결한다. */
export function createEditorPlayback({ store, cursorBeatKeeper, getRenderer, setLoadedAudioBuffer }: {
  store: Pick<typeof useEditorStore, 'getState'>;
  cursorBeatKeeper: CursorBeatKeeper;
  getRenderer: () => Pick<TimelineRenderer, 'setChart' | 'setWaveformData' | 'getTotalTimelineMs' | 'updatePlaybackCursor'> | null;
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
    beforePlay: () => {
      // 재생 시작은 열린 편집을 취소한다(RFD 0099). BPM 이벤트 드래그처럼 타이밍을 바꾼 편집이면 커서 박 유지가
      // 커서를 옮겨 두었으므로, 아직 정지 상태일 때 되돌린 타이밍으로 커서 박을 다시 맞춰야 그 박부터 재생한다.
      // 차트 effect는 재생이 시작된 뒤에 돌아 박 유지가 건너뛰므로 여기서 직접 맞춘다.
      const editedChart = store.getState().chart;
      store.getState().cancelEditTransactionForPlaybackStart();
      const { chart, timelineRangeMs } = store.getState();
      if (chart === editedChart) return;
      const renderer = getRenderer();
      syncTimelineRange({
        store, playback, cursorBeatKeeper, renderer,
        // 범위 끝은 되돌린 차트의 마디로 다시 읽는다. 렌더러는 곧 차트 effect가 같은 차트로 다시 갱신한다.
        timelineRange: renderer ? setChartAndReadTimelineRange(renderer, chart) : timelineRangeMs,
      });
    },
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
