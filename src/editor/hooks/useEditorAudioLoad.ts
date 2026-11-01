import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { PlaybackController } from '../playback/PlaybackController';
import { useEditorStore } from '../stores';

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

    // connect-src는 blob: fetch를 허용하지 않는다. 대기 File은 arrayBuffer 경로로 읽는다.
    const loading = file ? playback.loadAudioFile(file) : playback.loadAudioUrl(pendingAudioUrl!);
    loading.catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      setLoadedAudioBuffer(null);
      addToast(`Audio load failed: ${message}`, 'error');
    }).finally(() => {
      setAudioLoading(false);
      hasCompletedInitialAudioLoadRef.current = true;
      setInitialAudioPending(false);
    });
  }, [pendingAudioUrl, setPendingAudioUrl, addToast, playbackRef, setLoadedAudioBuffer]);

  return { audioLoading, setAudioLoading, initialAudioPending };
}
