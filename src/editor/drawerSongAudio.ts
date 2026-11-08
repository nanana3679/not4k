/**
 * 곡 정보 드로어의 음원 교체와, 곡 정보 변경 취소 뒤의 재생기 음원(RFD 0098).
 *
 * - 고른 음원을 재생기에 불러와(createMetaAudioSession) 성공하면 바로 곡 음원으로 적용한다(editSongAudio). 불러오는 동안 store의
 *   `isLoadingSongAudio`를 켜, Save의 미저장 표시와 닫기·전환·이탈 확인이 같은 값을 읽는다(unsavedChangesFlow).
 * - 음원은 Undo 이력 밖이라(사용자 확인, 2026-11-08) Undo·Redo는 재생기 음원을 바꾸지 않는다. 디코딩한 이전 음원도 보관하지 않는다.
 * - 변경 취소가 대기 음원을 버리면 재생기 음원을 비워 버린 음원으로 재생·테스트 플레이·프리뷰 생성을 하지 않게 하고, 저장된 음원을
 *   다시 불러온다(`reloadSavedAudio`). 실제 로드는 useEditorAudioLoad가 맡는다.
 */
import { createMetaAudioSession, type MetaAudioPick, type MetaAudioPlayback } from './metaAudioSession';
import type { PlaybackController } from './playback/PlaybackController';
import { discardSongInfoChanges, editSongAudio } from './songInfoEditing';
import { useEditorStore } from './stores/editorStore';

export type DrawerSongAudioPlayback = MetaAudioPlayback & Pick<PlaybackController, 'clearAudio'>;

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

  return {
    /** 고른 음원을 불러와 성공하면 곡 음원으로 적용하고 새 길이에 맞춘 구간도 적용한다. 실패하면 이전 음원을 계속 쓴다. */
    async pick(playback: DrawerSongAudioPlayback | null, file: File): Promise<void> {
      const status = await loader.load(playback, file);
      if (status === null) return;
      const buffer = playback?.audioBufferData;
      if (status === 'loaded' && buffer) editSongAudio(file, buffer.duration);
      loader.apply();
    },
    /** 불러오는 중인 음원 선택을 버리고 재생기를 고르기 전 음원으로 되돌린다. 이미 적용한 음원은 그대로 둔다. */
    close(playback: DrawerSongAudioPlayback | null): void {
      loader.cancel(playback);
    },
    /**
     * 곡 정보를 변경 취소한다. 막혔으면 false다. 불러오는 중인 선택은 늘 버려 늦은 로드가 적용되지 않게 한다.
     * 대기 음원을 버렸으면 재생기·표시 음원을 비우고 저장된 음원을 다시 불러온다(저장된 음원이 없으면 비운 채 둔다).
     */
    discard(playback: DrawerSongAudioPlayback | null): boolean {
      const discardedAudio = Boolean(useEditorStore.getState().song?.pendingAudioFile);
      if (!discardSongInfoChanges().discarded) return false;
      if (!discardedAudio) {
        // 바꾼 음원이 없다. 불러오는 중인 선택만 버리고 재생기를 고르기 전(저장된) 음원으로 되돌린다.
        loader.cancel(playback);
        return true;
      }
      // 불러오는 중인 선택은 버리되 재생기는 아래에서 저장된 음원으로 맞춘다(비우기가 진행 중인 로드도 버린다).
      loader.cancel(null);
      if (!playback) return true;
      playback.clearAudio();
      deps.setLoadedAudioBuffer(null);
      const savedAudioUrl = useEditorStore.getState().chart.meta.audioFile;
      if (savedAudioUrl) deps.reloadSavedAudio(savedAudioUrl);
      return true;
    },
  };
}

export type DrawerSongAudio = ReturnType<typeof createDrawerSongAudio>;
