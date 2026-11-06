import { fetchSongSharedData } from '../../supabase/songSharedData';
import { PLAY_TEST_RETURN_AUDIO_FAILED_COPY } from '../editorCopy';
import { useEditorStore } from '../stores';

/**
 * 테스트 플레이에서 돌아온 에디터가 곡 행 재조회 후 현재 초안의 음원을 복원한다. 편집 초안·저장 기준·리비전·대기 파일은
 * 바꾸지 않는다. 대기 파일이 있으면 직접 읽고, 없으면 차트 사본의 경로를 쓴다. Undo가 저장을 넘으면 행과 초안의 음원이 다를 수 있다.
 *
 * 조회 실패로 거부하지 않는다. 열린 편집을 오류 화면으로 가리지 않도록, 실패하면 편집 상태를 그대로 두고 대기 파일이
 * 없어 음원을 불러오지 못할 때만 오류 알림을 띄운다.
 */
export async function restoreSongAudioAfterPlayTest(
  songId: string, toPublicUrl: (path: string) => string,
): Promise<void> {
  const hasPendingAudioFile = Boolean(useEditorStore.getState().song?.pendingAudioFile);
  try {
    await fetchSongSharedData(songId);
  } catch {
    if (!hasPendingAudioFile) useEditorStore.getState().addToast(PLAY_TEST_RETURN_AUDIO_FAILED_COPY, 'error');
    return;
  }
  const audioUrl = useEditorStore.getState().chart.meta.audioFile;
  if (!hasPendingAudioFile && audioUrl) useEditorStore.getState().setPendingAudioUrl(toPublicUrl(audioUrl));
}
