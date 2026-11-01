export const LEAVE_CONFIRM_COPY = {
  title: "Unsaved Changes",
  body: "You have unsaved changes. If you leave now, they will be lost.",
  confirm: "Leave",
  cancel: "Cancel",
} as const;

/** 저장(Save·Save As)이 진행 중일 때 막힌 동작의 안내. 테스트 플레이 문구는 툴바 버튼 title에도 쓴다. */
export const SAVE_IN_PROGRESS_COPY = {
  secondSave: "이전 저장이 끝난 뒤 다시 시도해주세요",
  playTest: "저장 중에는 테스트 플레이를 시작할 수 없습니다",
} as const;

/**
 * 재생 중 막힌 편집 시도의 안내(RFD 0099). 캔버스·키보드 시도에는 이 문구로 토스트를 한 번 띄우고,
 * 재생 중 비활성으로 두는 툴바·모달 컨트롤에는 같은 문구를 title로 단다.
 */
export const PAUSE_TO_EDIT_COPY = "Pause playback to edit";

/** 곡 저장 연결 전에는 차트 JSON에만 남을 제목·아티스트 편집을 막는다(RFD 0107 PR2). */
export const SONG_METADATA_READ_ONLY_COPY = "Title and Artist are song-level values. Editing will be available with song save.";

/**
 * 같은 종류의 0박 초기 BPM·박자가 이미 있어 막은 편집의 안내(RFD 0082). 생성·이동·붙여넣기가 BPM·박자를 0박에 두려 할 때
 * 토스트를 한 번 띄운다.
 */
export const INITIAL_TIMING_EXISTS_COPY = "An initial BPM/time signature already exists at beat 0";
