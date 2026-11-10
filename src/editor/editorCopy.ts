/**
 * 에디터 이탈·다른 곡 이동, 그리고 곡 정보를 정리한 뒤에도 차트 변경이 남은 차트 전환의 확인(RFD 0098).
 * 저장 후 이동은 Save(곡 → 차트)가 필요한 저장을 모두 끝낸 뒤에만 이동한다.
 */
export const LEAVE_CONFIRM_COPY = {
  title: "Unsaved Changes",
  body: "저장하지 않은 곡 정보 또는 차트 변경이 있습니다. 버리고 이동하면 저장하지 않은 변경이 사라집니다.",
  save: "저장 후 이동",
  discard: "버리고 이동",
  cancel: "취소",
} as const;

/**
 * 미저장 곡 정보가 있을 때 곡 정보 드로어를 닫거나 같은 곡의 다른 차트로 전환하는 확인(RFD 0098). 미저장 곡 정보를 남긴 채
 * 닫거나 전환하는 선택은 없다. 변경 취소는 마지막으로 저장한 곡 정보로 되돌리며 차트 편집은 버리지 않는다.
 */
export const SONG_INFO_UNSAVED_COPY = {
  title: "Unsaved Song Info",
  closeBody: "저장하지 않은 곡 정보 변경이 있습니다. 저장하거나 변경을 취소해야 곡 정보를 닫을 수 있습니다.",
  switchBody: "저장하지 않은 곡 정보 변경이 있습니다. 저장하거나 변경을 취소해야 다른 차트로 전환할 수 있습니다.",
  discardNote: "변경 취소는 마지막으로 저장한 곡 정보로 되돌리며 노트·차트 이벤트 편집은 그대로 둡니다. Undo하면 제목·아티스트·오프셋·BPM·박자표를 복원하고 드로어를 다시 엽니다. 자켓·음원·구간은 되살리지 않습니다.",
  saveClose: "저장 후 닫기",
  discardClose: "변경 취소 후 닫기",
  saveSwitch: "저장 후 전환",
  discardSwitch: "변경 취소 후 전환",
  cancel: "취소",
} as const;

/** 곡 정보 드로어의 문구. 곡 공통 값이 이 곡의 모든 차트에 적용됨을 알린다(RFD 0095·0098). */
export const SONG_INFO_DRAWER_COPY = {
  title: "Song Info",
  /** 곡 정보에 미저장 변경이 있을 때 Song Info 버튼의 title. 버튼 이름은 title 그대로 둔다. */
  unsavedTitle: "Song Info (unsaved changes)",
  scope: "곡 공통 · 이 곡의 모든 차트에 적용됩니다. Save가 곡 정보를 함께 저장합니다.",
  close: "Close song info",
  charts: "Charts",
  chartsLoading: "차트 목록을 불러오는 중…",
  chartsFailed: "차트 목록을 불러오지 못했습니다.",
  currentChart: "현재 차트",
} as const;

/** 곡 행이 있는 차트의 Meta 창 안내. 곡 공통 값은 곡 정보 드로어로 옮겼다(RFD 0098·0107). */
export const META_SONG_INFO_MOVED_COPY = "제목·아티스트·자켓·음원·구간·오프셋은 Song Info에서 편집합니다.";

/**
 * 음원을 바꿀 때 새 음원에 들어가지 않아 기본값으로 돌린 구간의 안내(#444). 키는 돌린 구간(`rangesForNewAudio`의 `reset`)이다.
 * 곡 정보 드로어는 음원을 적용할 때, 곡 행이 없는 차트의 Meta는 선택기를 새 음원으로 다시 그릴 때 알린다.
 */
export const AUDIO_RANGE_RESET_COPY = {
  preview: "새 음원에 들어가지 않는 프리뷰 구간을 기본값으로 되돌렸습니다.",
  gameplay: "새 음원에 들어가지 않는 인게임 구간을 기본값으로 되돌렸습니다.",
  both: "새 음원에 들어가지 않는 프리뷰·인게임 구간을 기본값으로 되돌렸습니다.",
} as const;

/** 저장(Save·Save As)이 진행 중일 때 막힌 동작의 안내. 테스트 플레이 문구는 툴바 버튼 title에도 쓴다. */
export const SAVE_IN_PROGRESS_COPY = {
  secondSave: "이전 저장이 끝난 뒤 다시 시도해주세요",
  playTest: "저장 중에는 테스트 플레이를 시작할 수 없습니다",
  /** 곡 정보 드로어 닫기·차트 전환·이탈·변경 취소는 진행 중인 저장의 결과가 정해진 뒤에만 한다(RFD 0098). */
  unsavedFlow: "저장이 끝난 뒤 다시 시도해주세요",
} as const;

/** charts 행이 있는 차트의 Meta에서는 난이도명을 편집하지 않는다. */
export const DIFFICULTY_LABEL_READ_ONLY_COPY = '난이도명은 Save As에서 변경할 수 있습니다.';

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

export const SONG_SAVE_COPY = {
  saved: 'Song saved',
  conflict: '다른 곳에서 곡을 변경했습니다. 편집 내용은 유지됩니다. 곡을 다시 불러온 뒤 저장해주세요.',
  permission: '곡을 저장할 관리자 권한이 없습니다. 편집 내용은 유지됩니다.',
  missing: '저장할 곡이 존재하지 않습니다. 편집 내용은 유지됩니다.',
  failed: '곡 저장에 실패했습니다. 편집 내용은 유지됩니다. 잠시 후 다시 시도해주세요.',
  migration: '이 차트의 타이밍을 곡 공통 타이밍으로 올리며 이 곡의 다른 차트도 이 타이밍을 따릅니다.\n취소하면 곡 변경은 저장하지 않고 차트만 저장합니다.',
  sharedTiming: (count: number) => `변경한 공통 타이밍(BPM·박자표·오프셋)을 이 곡의 다른 차트 ${count}개에도 적용합니다. 저장하시겠습니까?`,
  differingCharts: '타이밍이 다른 차트',
  /** 이행 확인에서 파일이 없거나 해석하지 못해 타이밍을 비교하지 못한 다른 차트의 머리말. */
  uncomparedCharts: '파일을 읽지 못해 비교하지 못한 차트',
  /** 곡 행이 있는 차트의 곡 저장은 곡 추가(AddSongModal)처럼 비어 있지 않은 제목·아티스트를 요구한다. */
  titleArtistRequired: '제목과 아티스트는 비워 둘 수 없습니다.',
  /** 프리뷰 클립을 다시 만들어야 하는데 재생 음원이 없을 때(음원 로드 실패 등). */
  previewAudioMissing: '음원이 불러와지지 않아 프리뷰 클립을 만들 수 없습니다. Song Info에서 음원을 불러온 뒤 다시 저장해주세요.',
  /** 다시 만들 프리뷰 구간에서 샘플을 얻을 수 없거나 구간이 음원 끝을 넘을 때. */
  previewOutOfRange: '프리뷰 구간이 음원 범위를 벗어났습니다. Song Info에서 프리뷰 구간을 다시 정한 뒤 저장해주세요.',
} as const;

/**
 * 에디터 음원을 불러오는 중에 Save·Save As를 시작한 안내. 프리뷰 클립은 재생 중인 음원으로 만들므로, 테스트 플레이 복귀
 * 직후처럼 음원이 아직 준비되지 않았으면 곡·차트 저장을 모두 시작하지 않는다.
 */
export const SAVE_AUDIO_LOADING_COPY = "Audio is still loading. Save again after it finishes.";

/**
 * 차트 저장(Save의 차트 단계·Save As)의 결과 안내(RFD 0107). DB 거부는 이전 파일을 유지한다. 응답 유실은
 * 행 재조회로 성공 여부를 확인하며 확인할 수 없으면 편집과 저장 기준을 유지한다. `failed`는 업로드 등 일반 실패다.
 */
export const CHART_SAVE_COPY = {
  saved: 'Chart saved',
  conflict: '다른 곳에서 이 차트를 저장했습니다. 편집 내용은 유지됩니다. 다시 불러오면 저장하지 않은 편집 내용이 사라집니다. 필요한 내용을 별도로 보관한 뒤 차트를 다시 불러와주세요.',
  /** Save As 덮어쓰기의 PT409. 충돌은 덮어쓸 대상 행에서 났고, Save As를 다시 실행하면 대상 행의 최신 리비전을 다시 읽는다. */
  saveAsConflict: '덮어쓰기를 확인한 뒤 다른 곳에서 대상 난이도의 차트를 저장했습니다. 편집 내용은 유지됩니다. Save As를 다시 실행하면 덮어쓰기를 다시 확인한 뒤 저장합니다.',
  unconfirmed: '차트 저장 결과를 확인하지 못했습니다. 편집 내용은 유지됩니다. 다시 불러오면 저장하지 않은 편집 내용이 사라집니다. 필요한 내용을 별도로 보관한 뒤 차트를 다시 불러와 확인해주세요.',
  permission: '차트를 저장할 관리자 권한이 없습니다. 편집 내용은 유지됩니다.',
  missing: '저장할 차트가 존재하지 않습니다. 다른 곳에서 삭제되었을 수 있습니다. 편집 내용은 유지됩니다. Save As에서 저장할 난이도를 선택해주세요.',
  exists: '대상 난이도에 이미 차트가 있습니다. 편집 내용은 유지됩니다. Save As에서 저장할 난이도를 선택하고 덮어쓰기를 확인해주세요.',
  existsOnSave: '현재 난이도에 이미 차트가 있어 이번 저장을 확인하지 못했습니다. 편집 내용은 유지됩니다. 다시 불러오면 저장하지 않은 편집 내용이 사라집니다. 필요한 내용을 별도로 보관한 뒤 차트를 다시 불러와 확인해주세요.',
  failed: '저장에 실패했습니다. 잠시 후 다시 시도해주세요.',
} as const;
