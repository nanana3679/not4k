import type { PlaybackController } from './playback/PlaybackController';

/** Meta 창에서 고른 음원 파일과 그 로드 결과. 적용(`loaded`)할 수 있는 것은 로드에 성공한 파일뿐이다. */
export interface MetaAudioPick {
  file: File;
  status: 'loading' | 'loaded' | 'failed';
}

export type MetaAudioPlayback = Pick<PlaybackController, 'audioBufferData' | 'loadAudioFile' | 'restoreAudioBuffer'>;

/**
 * Meta 창 한 번의 음원 선택을 관리한다. 창을 열 때의 재생기 음원을 기억해 두고,
 *
 * - 로드가 실패하면 재생기에 남은 이전 음원을 다시 표시하고 고른 파일을 실패로 남긴다(적용 대상이 아니다).
 * - 적용(`apply`)하면 새 음원을 유지한다.
 * - 적용하지 않고 닫으면(`cancel`) 재생기를 창을 열 때의 음원으로 되돌려, 저장의 프리뷰 생성이 취소한 파일을 쓰지 않게 한다.
 *   창을 열 때 음원이 없었으면 되돌릴 음원이 없어 그대로 둔다.
 *
 * 성공한 로드의 표시 음원은 재생기의 `onAudioLoaded`가 정한다. 여러 번 고르면 마지막 선택의 결과만 반영한다.
 */
export function createMetaAudioSession(deps: {
  setPick: (pick: MetaAudioPick | null) => void;
  setAudioLoading: (loading: boolean) => void;
  setLoadedAudioBuffer: (buffer: AudioBuffer | null) => void;
  onLoadFailed: () => void;
}) {
  /** 창을 열 때의 음원. undefined면 이번 창에서 아직 음원을 고르지 않았다. */
  let bufferAtOpen: AudioBuffer | null | undefined;
  let latestRequest = 0;
  let loading = false;

  const finish = () => {
    bufferAtOpen = undefined;
    latestRequest++;
    if (loading) {
      loading = false;
      deps.setAudioLoading(false);
    }
    deps.setPick(null);
  };

  return {
    /** 재생기는 호출 때 넘긴다(페이지가 렌더 중 ref를 읽지 않게). */
    async load(playback: MetaAudioPlayback | null, file: File): Promise<void> {
      if (!playback) return;
      if (bufferAtOpen === undefined) bufferAtOpen = playback.audioBufferData;
      const request = ++latestRequest;
      loading = true;
      deps.setPick({ file, status: 'loading' });
      deps.setAudioLoading(true);
      deps.setLoadedAudioBuffer(null);
      let loaded = true;
      try {
        await playback.loadAudioFile(file);
      } catch {
        loaded = false;
      }
      if (request !== latestRequest) return;
      loading = false;
      deps.setAudioLoading(false);
      if (loaded) {
        deps.setPick({ file, status: 'loaded' });
        return;
      }
      // 실패한 로드는 재생기의 음원을 바꾸지 않는다. 구간 선택기·Save가 그 음원으로 다시 동작하게 표시를 되돌린다.
      deps.setLoadedAudioBuffer(playback.audioBufferData);
      deps.setPick({ file, status: 'failed' });
      deps.onLoadFailed();
    },
    /** 고른 음원을 적용하고 창을 닫았다. */
    apply(): void {
      finish();
    },
    /** 적용하지 않고 창을 닫았다. */
    cancel(playback: MetaAudioPlayback | null): void {
      if (bufferAtOpen && playback) playback.restoreAudioBuffer(bufferAtOpen);
      finish();
    },
  };
}

export type MetaAudioSession = ReturnType<typeof createMetaAudioSession>;
