/**
 * 재생기는 곡 초안의 audioId를 따른다. 음원 선택·Undo·Redo·변경 취소 모두 같은 동기화 경로를 사용한다.
 * 최근 디코딩 버퍼는 최대 3개만 보관한다(4분 스테레오 버퍼 하나가 약 85MB). 저장으로 경로가 바뀌어도 id는 유지한다.
 */
import { createMetaAudioSession, type MetaAudioPick, type MetaAudioPlayback } from './metaAudioSession';
import type { PlaybackController } from './playback/PlaybackController';
import { editSongAudio } from './songInfoEditing';
import { createSongAudioId } from './songState';
import { useEditorStore } from './stores/editorStore';

export type DrawerSongAudioPlayback = MetaAudioPlayback & Pick<PlaybackController, 'clearAudio'>;
type AudioState = Pick<ReturnType<typeof useEditorStore.getState>, 'song' | 'chart' | 'chartLoadGeneration'>;

export function createDrawerSongAudio(deps: {
  setPick: (pick: MetaAudioPick | null) => void;
  setAudioLoading: (loading: boolean) => void;
  setLoadedAudioBuffer: (buffer: AudioBuffer | null) => void;
  onLoadFailed: () => void;
  /** 저장 경로를 공개 URL로 바꿔 pendingAudioUrl에 넣는다. 실제 로드는 useEditorAudioLoad가 맡는다. */
  reloadSavedAudio: (audioUrl: string) => void;
}) {
  const loader = createMetaAudioSession({
    ...deps,
    setPick: pick => {
      deps.setPick(pick);
      useEditorStore.setState({ isLoadingSongAudio: pick?.status === 'loading' });
    },
  });
  let loadedAudioId = useEditorStore.getState().song?.audioId;
  let chartLoadGeneration = useEditorStore.getState().chartLoadGeneration;
  const bufferByAudioId = new Map<number, AudioBuffer>();
  const remember = (id: number | undefined, buffer: AudioBuffer | null) => {
    if (id === undefined || !buffer) return;
    bufferByAudioId.delete(id);
    bufferByAudioId.set(id, buffer);
    for (const key of bufferByAudioId.keys()) {
      if (bufferByAudioId.size <= 3) break;
      if (key !== loadedAudioId) bufferByAudioId.delete(key);
    }
  };

  return {
    /** 로드 성공 뒤 새 정체성과 길이·구간을 한 번에 적용한다. 실패하면 이전 음원을 유지한다. */
    async pick(playback: DrawerSongAudioPlayback | null, file: File): Promise<void> {
      remember(loadedAudioId, playback?.audioBufferData ?? null);
      const status = await loader.load(playback, file);
      if (status === null) return;
      if (status === 'loaded' && playback?.audioBufferData) {
        loadedAudioId = createSongAudioId();
        remember(loadedAudioId, playback.audioBufferData);
        editSongAudio(file, playback.audioBufferData.duration, loadedAudioId);
      }
      loader.apply();
    },
    /** 불러오는 중인 선택을 버린다. 이미 적용된 음원의 이력은 바꾸지 않는다. */
    close(playback: DrawerSongAudioPlayback | null): void {
      loader.cancel(playback);
    },
    async sync(playback: DrawerSongAudioPlayback | null, state: AudioState): Promise<void> {
      if (state.chartLoadGeneration !== chartLoadGeneration) {
        chartLoadGeneration = state.chartLoadGeneration;
        loadedAudioId = state.song?.audioId;
        bufferByAudioId.clear();
        loader.cancel(null);
        return;
      }
      // loadChart와 setSong 사이의 빈 곡 상태도 초기 로드가 맡는다.
      if (loadedAudioId === undefined) { loadedAudioId = state.song?.audioId; return; }
      if (!state.song || state.song.audioId === loadedAudioId || !playback) return;
      // 재생기의 세대만 버리면 loader는 성공으로 오인한다. 선택 세대도 먼저 취소해 늦은 pick 적용을 막는다.
      loader.cancel(playback);
      const previousAudioId = loadedAudioId;
      loadedAudioId = state.song.audioId;
      // 이전 버퍼를 추가할 때도 지금 복원할 id는 퇴출하지 않는다.
      remember(previousAudioId, playback.audioBufferData);
      // 아직 effect가 받지 않은 이전 URL이 새로 복원한 버퍼를 덮지 않게 한다.
      useEditorStore.getState().setPendingAudioUrl(null);
      const cached = bufferByAudioId.get(loadedAudioId);
      if (cached) {
        remember(loadedAudioId, cached);
        playback.restoreAudioBuffer(cached);
        deps.setLoadedAudioBuffer(cached);
        return;
      }
      playback.clearAudio();
      deps.setLoadedAudioBuffer(null);
      if (state.song.pendingAudioFile) {
        const status = await loader.load(playback, state.song.pendingAudioFile);
        if (status === null) return;
        if (status === 'loaded') remember(loadedAudioId, playback.audioBufferData);
        loader.apply();
      } else if (state.chart.meta.audioFile) {
        deps.reloadSavedAudio(state.chart.meta.audioFile);
      }
    },
  };
}

export type DrawerSongAudio = ReturnType<typeof createDrawerSongAudio>;
