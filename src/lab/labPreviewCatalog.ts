export type LabPreviewCategory = "Flight" | "Rendering" | "Interface" | "Gameplay";

export interface LabPreviewEntry {
  id: string;
  title: string;
  description: string;
  category: LabPreviewCategory;
  path: `/lab/${string}`;
  featured?: boolean;
}

export const labPreviewCatalog = Object.freeze<readonly LabPreviewEntry[]>([
  {
    id: "flight-background-preview",
    title: "Flight Background Preview",
    description: "Liftoff, Infiltration, Breakthrough의 배경과 고도를 한 화면에서 비교합니다.",
    category: "Flight",
    path: "/lab/flight-background-preview",
    featured: true,
  },
  {
    id: "facility-passage",
    title: "Facility Passage Preview",
    description: "고도에 따라 적재층 사이와 연결 교량 아래를 통과하며 접근·입구·내부·출구를 비교합니다.",
    category: "Flight",
    path: "/lab/facility-passage",
  },
  {
    id: "note-assets",
    title: "노트 에셋 시연실",
    description: "Classic 버전과 Simple의 노트·롱노트·터미널·키봄을 실제 재생기로 비교합니다.",
    category: "Rendering",
    path: "/lab/note-assets",
  },
  {
    id: "explicit-renderer",
    title: "명시 노트 표시",
    description: "바디·릴리즈·틱 노트의 독립 수명과 부분 성공·실패를 공개 상태와 실제 싱글 세션으로 비교합니다.",
    category: "Gameplay",
    path: "/lab/explicit-renderer",
  },
  {
    id: "explicit-playtest",
    title: "명시 차트 실플레이",
    description: "새 차트를 처음부터 수동·자동 입력으로 연습하고 실제 판정·정산 수치를 검토합니다.",
    category: "Gameplay",
    path: "/lab/explicit-playtest",
  },
  {
    id: "rest-zone-lane",
    title: "restZone Lane",
    description: "restZone 동안 레인 판넬이 뒤로 넘어갔다 차트의 추정 녹숫에 맞춰 올라오는 연출과 넘어가 있는 동안의 빗금 판넬을 재생하고, 스크롤 속도·리프트·서든에 따라 다음 노트가 보이는 시점을 비교합니다.",
    category: "Rendering",
    path: "/lab/rest-zone-lane",
  },
  {
    id: "gear",
    title: "Gear",
    description: "실제 게임 화면에서 새 기어와 기어 움직임을 미리 보고, Pixi 움직임을 gearMotion 시안 SVG와 나란히 비교합니다.",
    category: "Interface",
    path: "/lab/gear",
  },
  {
    id: "tutorial-pattern-diagram",
    title: "Tutorial Pattern Diagram",
    description: "튜토리얼의 연결 롱 노트 설명 도식을 단독으로 확인합니다.",
    category: "Gameplay",
    path: "/lab/tutorial-pattern-diagram",
  },
  {
    id: "judgment-playtest",
    title: "Judgment Playtest",
    description: "홀드 트릴과 놓기 관대 판정 시나리오를 직접 재생합니다.",
    category: "Gameplay",
    path: "/lab/judgment-playtest",
  },
]);
