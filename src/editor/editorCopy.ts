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
