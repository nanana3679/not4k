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
    id: "geometric-background",
    title: "Geometric Background",
    description: "고도에 따른 원근 지표면과 광원 흐름을 조절합니다.",
    category: "Rendering",
    path: "/lab/geometric-background",
  },
  {
    id: "perspective-surface-grid",
    title: "Perspective Surface Grid",
    description: "Pixi 기반 지표면 투영과 오브젝트 배치 프리셋을 편집합니다.",
    category: "Rendering",
    path: "/lab/perspective-surface-grid",
  },
  {
    id: "gear-light",
    title: "Gear Light",
    description: "기어 기둥의 광원, 마스크, 게이지 합성을 비교합니다.",
    category: "Interface",
    path: "/lab/gear-light",
  },
  {
    id: "gear-measure-pulse",
    title: "Gear Measure Pulse",
    description: "BPM과 마디 진행에 맞춘 기어 광원 펄스를 조절합니다.",
    category: "Interface",
    path: "/lab/gear-measure-pulse",
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
