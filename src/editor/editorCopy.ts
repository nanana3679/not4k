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

/**
 * 같은 종류의 0박 초기 BPM·박자가 이미 있어 막은 편집의 안내(RFD 0082). 생성·이동·붙여넣기가 BPM·박자를 0박에 두려 할 때
 * 토스트를 한 번 띄운다.
 */
export const INITIAL_TIMING_EXISTS_COPY = "An initial BPM/time signature already exists at beat 0";

/**
 * 테스트 플레이에서 돌아온 에디터가 곡 행을 다시 읽지 못해 음원을 불러오지 못한 안내. 대기 음원 파일이 없을 때만 띄우며,
 * 편집 초안·저장 기준은 그대로 두고 오류 화면으로 바꾸지 않는다.
 */
export const PLAY_TEST_RETURN_AUDIO_FAILED_COPY = "Could not reload the song, so the audio was not loaded. Your edits are kept.";

export const SONG_SAVE_COPY = {
  saved: 'Song saved',
  conflict: '다른 곳에서 곡을 변경했습니다. 편집 내용은 유지됩니다. 곡을 다시 불러온 뒤 저장해주세요.',
  permission: '곡을 저장할 관리자 권한이 없습니다. 편집 내용은 유지됩니다.',
  missing: '저장할 곡이 존재하지 않습니다. 편집 내용은 유지됩니다.',
  failed: '곡 저장에 실패했습니다. 편집 내용은 유지됩니다. 잠시 후 다시 시도해주세요.',
  migration: '이 차트의 타이밍을 곡 공통 타이밍으로 올리며 이 곡의 다른 차트도 이 타이밍을 따릅니다.',
  sharedTiming: (count: number) => `변경한 공통 타이밍(BPM·박자표·오프셋)을 이 곡의 다른 차트 ${count}개에도 적용합니다. 저장하시겠습니까?`,
  differingCharts: '타이밍이 다른 차트',
  /** 이행 확인에서 파일이 없거나 해석하지 못해 타이밍을 비교하지 못한 다른 차트의 머리말. */
  uncomparedCharts: 'Could not compare (chart file unreadable)',
  /** 곡 행이 있는 차트의 곡 저장은 곡 추가(AddSongModal)처럼 비어 있지 않은 제목·아티스트를 요구한다. */
  titleArtistRequired: 'Title and Artist cannot be empty.',
  /** 프리뷰 구간·음원을 바꿔 프리뷰 클립을 다시 만들어야 하는데 재생 음원이 없을 때(음원 로드 실패 등). */
  previewAudioMissing: 'The song audio is not loaded, so the preview clip cannot be created. Load the audio in Meta and save again.',
} as const;

/**
 * 에디터 음원을 불러오는 중에 Save·Save As를 시작한 안내. 프리뷰 클립은 재생 중인 음원으로 만들므로, 테스트 플레이 복귀
 * 직후처럼 음원이 아직 준비되지 않았으면 곡·차트 저장을 모두 시작하지 않는다.
 */
export const SAVE_AUDIO_LOADING_COPY = "Audio is still loading. Save again after it finishes.";
