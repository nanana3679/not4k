import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { PlaybackController } from '../playback/PlaybackController';
import { useEditorStore } from '../stores';

/**
 * 음원 로드 하나를 시작한다.
 * - 실패: 시작한 뒤 재생기 세대가 올랐으면(새 로드, Redo의 버퍼 복원 등) 이미 버려진 로드이므로 표시 음원을 비우거나 알리지 않는다.
 * - 끝: 이 훅이 더 새로운 로드를 시작했으면(`latestRequest`) 그 로드가 끝낸다. 버퍼 복원은 로딩 표시를 끄지 않으므로 그때는 이 로드가 끝낸다.
 */
export function startEditorAudioLoad(
  playback: Pick<PlaybackController, 'audioLoadGeneration' | 'loadAudioFile' | 'loadAudioUrl'>,
  source: File | string,
  latestRequest: { current: number },
  handlers: { onFailed: (message: string) => void; onSettled: () => void },
): void {
  const request = ++latestRequest.current;
  // connect-src는 blob: fetch를 허용하지 않는다. 대기 File은 arrayBuffer 경로로 읽는다.
  const loading = typeof source === 'string' ? playback.loadAudioUrl(source) : playback.loadAudioFile(source);
  const generation = playback.audioLoadGeneration;
  loading.catch((err: unknown) => {
    if (generation !== playback.audioLoadGeneration) return;
    handlers.onFailed(err instanceof Error ? err.message : String(err));
  }).finally(() => {
    if (request === latestRequest.current) handlers.onSettled();
  });
}

/** 마운트 시 오디오를 복원하고 로딩 표시·실패 처리를 함께 관리한다. */
export function useEditorAudioLoad(
  playbackRef: RefObject<PlaybackController | null>,
  setLoadedAudioBuffer: (buffer: AudioBuffer | null) => void,
) {
  const pendingAudioUrl = useEditorStore((s) => s.pendingAudioUrl);
  const setPendingAudioUrl = useEditorStore((s) => s.setPendingAudioUrl);
  const addToast = useEditorStore((s) => s.addToast);
  // 복귀 시 한 번만 읽는다. Meta에서 이미 로드한 파일의 적용·저장은 재로드하지 않는다.
  const initialAudioFileRef = useRef(useEditorStore.getState().song?.pendingAudioFile ?? null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [initialAudioPending, setInitialAudioPending] = useState(() => Boolean(initialAudioFileRef.current || pendingAudioUrl));
  const hasCompletedInitialAudioLoadRef = useRef(!initialAudioPending);
  const latestLoadRef = useRef(0);

  // 오디오 로드
  useEffect(() => {
    const file = initialAudioFileRef.current;
    if (!file && !pendingAudioUrl) return;
    const playback = playbackRef.current;
    if (!playback) return;

    if (!hasCompletedInitialAudioLoadRef.current) {
      setInitialAudioPending(true);
    }
    initialAudioFileRef.current = null;
    setPendingAudioUrl(null);
    setAudioLoading(true);

    startEditorAudioLoad(playback, file ?? pendingAudioUrl!, latestLoadRef, {
      onFailed: (message) => {
        setLoadedAudioBuffer(null);
        addToast(`Audio load failed: ${message}`, 'error');
      },
      onSettled: () => {
        setAudioLoading(false);
        hasCompletedInitialAudioLoadRef.current = true;
        setInitialAudioPending(false);
      },
    });
  }, [pendingAudioUrl, setPendingAudioUrl, addToast, playbackRef, setLoadedAudioBuffer]);

  return { audioLoading, setAudioLoading, initialAudioPending };
}
