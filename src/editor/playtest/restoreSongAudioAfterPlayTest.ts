import { useEditorStore } from '../stores';

/**
 * 테스트 플레이에서 돌아온 에디터가 현재 초안의 음원을 복원한다. 곡 행을 다시 읽지 않으며 편집 초안·저장 기준·리비전·대기 파일을
 * 바꾸지 않는다. Undo가 저장을 넘으면 행과 초안의 음원이 다를 수 있으므로 초안(차트 사본)의 경로를 쓴다.
 *
 * 대기 파일이 있으면 재생기가 직접 읽는다(useEditorAudioLoad). 곡 행이 없는 차트의 경로는 Meta에서 고른 로컬 파일명일 수 있어
 * 공개 URL로 요청하지 않는다.
 */
export function restoreSongAudioAfterPlayTest(toPublicUrl: (path: string) => string): void {
  const { song, chart, setPendingAudioUrl } = useEditorStore.getState();
  if (!song || song.pendingAudioFile || !chart.meta.audioFile) return;
  setPendingAudioUrl(toPublicUrl(chart.meta.audioFile));
}
