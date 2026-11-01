import { fetchSongSharedData } from '../../supabase/songSharedData';
import { PLAY_TEST_RETURN_AUDIO_FAILED_COPY } from '../editorCopy';
import { useEditorStore } from '../stores';

/**
 * 테스트 플레이에서 돌아온 에디터가 곡 행을 다시 읽어 음원 경로만 복원한다. 편집 초안·저장 기준·리비전·대기 파일은
 * 바꾸지 않는다. 대기 음원 파일이 있으면 재생기가 그 파일을 직접 읽으므로 조회한 경로를 쓰지 않는다.
 *
 * 조회 실패로 거부하지 않는다. 열린 편집을 오류 화면으로 가리지 않도록, 실패하면 편집 상태를 그대로 두고 대기 파일이
 * 없어 음원을 불러오지 못할 때만 오류 알림을 띄운다.
 */
export async function restoreSongAudioAfterPlayTest(
  songId: string, toPublicUrl: (path: string) => string,
): Promise<void> {
  const hasPendingAudioFile = Boolean(useEditorStore.getState().song?.pendingAudioFile);
  let audioUrl: string | undefined;
  try {
    audioUrl = (await fetchSongSharedData(songId))?.audioUrl;
  } catch {
    if (!hasPendingAudioFile) useEditorStore.getState().addToast(PLAY_TEST_RETURN_AUDIO_FAILED_COPY, 'error');
    return;
  }
  if (!hasPendingAudioFile && audioUrl) useEditorStore.getState().setPendingAudioUrl(toPublicUrl(audioUrl));
}
