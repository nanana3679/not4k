/**
 * 곡 정보 드로어의 음원 교체와, 곡 정보 변경 취소 뒤의 재생기 음원(RFD 0098).
 *
 * - 고른 음원을 재생기에 불러와(createMetaAudioSession) 성공하면 바로 곡 음원으로 적용한다(editSongAudio). 불러오는 동안 store의
 *   `isLoadingSongAudio`를 켜, Save의 미저장 표시와 닫기·전환·이탈 확인이 같은 값을 읽는다(unsavedChangesFlow).
 * - 저장된 음원 위에서(대기 음원 없음) 음원을 바꿀 때 바꾸기 전 재생기 버퍼를 그 저장된 음원의 버퍼로 기억한다.
 * - 변경 취소가 대기 음원을 버리면 재생기를 기억한 버퍼로 바로 되돌린다(다시 받지 않아 받기 실패로 버린 음원이 남지 않는다).
 *   기억한 버퍼가 없으면(바꾸기 전 음원을 아직 불러오지 못했거나, 테스트 플레이에서 돌아와 페이지를 다시 열었거나, 그 뒤 곡 저장으로
 *   저장된 음원이 바뀌었다) 재생기 음원을 비워 버린 음원으로 재생·테스트 플레이·프리뷰 생성을 하지 않게 하고 저장된 음원을 다시 불러온다.
 */
import { createMetaAudioSession, type MetaAudioPick, type MetaAudioPlayback } from './metaAudioSession';
import type { PlaybackController } from './playback/PlaybackController';
import { editSongAudio, type DiscardSongInfoResult } from './songInfoEditing';
import { useEditorStore } from './stores/editorStore';

export type DrawerSongAudioPlayback = MetaAudioPlayback & Pick<PlaybackController, 'clearAudio'>;

export function createDrawerSongAudio(deps: {
  setPick: (pick: MetaAudioPick | null) => void;
  setAudioLoading: (loading: boolean) => void;
  setLoadedAudioBuffer: (buffer: AudioBuffer | null) => void;
  onLoadFailed: () => void;
  /** 저장된 음원 경로(Storage 경로)를 재생기에 다시 불러온다. */
  reloadSavedAudio: (audioUrl: string) => void;
}) {
  const loader = createMetaAudioSession({
    ...deps,
    setPick: pick => {
      deps.setPick(pick);
      useEditorStore.setState({ isLoadingSongAudio: pick?.status === 'loading' });
    },
  });
  /** 바꾸기 전 저장된 음원의 버퍼와 그 경로. 대기 음원이 있는 동안만 쓴다. */
  let savedAudio: { buffer: AudioBuffer; audioUrl: string } | null = null;

  return {
    /** 고른 음원을 불러와 성공하면 곡 음원으로 적용하고 새 길이에 맞춘 구간도 적용한다. 실패하면 이전 음원을 계속 쓴다. */
    async pick(playback: DrawerSongAudioPlayback | null, file: File): Promise<void> {
      const before = playback?.audioBufferData ?? null;
      const status = await loader.load(playback, file);
      if (status === null) return;
      if (status === 'loaded' && playback?.audioBufferData) {
        const song = useEditorStore.getState().song;
        // 대기 음원이 없으면 바꾸기 전 버퍼가 저장된 음원이다. 이미 바꾼 음원을 다시 바꿀 때는 처음 기억한 버퍼를 둔다.
        if (song && !song.pendingAudioFile) savedAudio = before ? { buffer: before, audioUrl: song.baseline.audioUrl } : null;
        editSongAudio(file, playback.audioBufferData.duration);
      }
      loader.apply();
    },
    /** 드로어를 닫았다. 불러오는 중인 음원 선택을 버리고 재생기를 고르기 전 음원으로 되돌린다. */
    close(playback: DrawerSongAudioPlayback | null): void {
      loader.cancel(playback);
    },
    /** 곡 정보 변경 취소 뒤 재생기를 저장된 음원으로 맞춘다. `discardedAudio`는 discardSongInfoChanges의 결과다. */
    discard(playback: DrawerSongAudioPlayback | null, discardedAudio: DiscardSongInfoResult['discardedAudio']): void {
      if (!discardedAudio) {
        // 바꾼 음원이 없다. 불러오는 중인 선택만 버리고 재생기를 고르기 전(저장된) 음원으로 되돌린다.
        loader.cancel(playback);
        return;
      }
      // 불러오는 중인 선택은 버리되 재생기는 아래에서 저장된 음원으로 맞춘다(되돌리기·비우기가 진행 중인 로드도 버린다).
      loader.cancel(null);
      const saved = savedAudio;
      savedAudio = null;
      if (!playback) return;
      if (saved && saved.audioUrl === (discardedAudio.savedAudioUrl ?? '')) {
        playback.restoreAudioBuffer(saved.buffer);
        return;
      }
      playback.clearAudio();
      deps.setLoadedAudioBuffer(null);
      if (discardedAudio.savedAudioUrl) deps.reloadSavedAudio(discardedAudio.savedAudioUrl);
    },
    /** 저장된 음원 경로가 기억한 버퍼의 경로와 다르면(곡 저장으로 바뀜) 그 버퍼를 놓는다. 더 쓰지 않는 디코딩 음원을 붙잡지 않게 한다. */
    forgetSavedAudioUnless(savedAudioUrl: string | null): void {
      if (savedAudio && savedAudio.audioUrl !== (savedAudioUrl ?? '')) savedAudio = null;
    },
  };
}

export type DrawerSongAudio = ReturnType<typeof createDrawerSongAudio>;
