export interface LabImageGalleryEntry {
  id: string;
  title: string;
  description: string;
  createdAt: `${number}-${number}-${number}`;
  path: `/lab/images/${string}`;
}

type LabImageGalleryRegistration = Omit<LabImageGalleryEntry, "path">;

function registerImageGallery(registration: LabImageGalleryRegistration): LabImageGalleryEntry {
  return Object.freeze({
    ...registration,
    path: `/lab/images/${registration.id}`,
  });
}

export const labImageGalleryCatalog = Object.freeze<readonly LabImageGalleryEntry[]>([
  registerImageGallery({
    id: "module-size-distance-20260910",
    title: "Module Size × Distance",
    description: "건축 모듈의 소형·중형·거대 크기를 근거리·중거리·원거리에서 비교합니다.",
    createdAt: "2026-09-10",
  }),
  registerImageGallery({
    id: "size-distance-altitude-eight-20260910",
    title: "Size × Distance × Altitude",
    description: "서로 다른 시설 디자인 8개를 크기·거리·고도 조합으로 비교합니다.",
    createdAt: "2026-09-10",
  }),
  registerImageGallery({
    id: "point-derived-body-20260929",
    title: "Classic 싱글 롱노트 바디 시안",
    description: "포인트 노트의 색과 재질로 만든 100:20 반복 바디를 확인합니다.",
    createdAt: "2026-09-29",
  }),
  registerImageGallery({
    id: "long-note-body-six-20260929",
    title: "롱노트 선택안 · 밝은 바디 + 고채도 포인트",
    description: "선택한 아주 밝은 바디와 고채도 포인트를 싱글 파랑·더블 금색으로 확인합니다.",
    createdAt: "2026-09-29",
  }),
  registerImageGallery({
    id: "thrust-button-study-20260929",
    title: "추진부 버튼 · 정면 분출",
    description: "사용자를 향하는 분출과 색 전환을 유지한 일체형·장갑형·매립형 버튼을 비교합니다.",
    createdAt: "2026-09-29",
  }),
  registerImageGallery({
    id: "frame-keywords-six-20260929",
    title: "전체 프레임 · 백색광 버튼",
    description: "임시 시안의 백색광 버튼 전후를 비교하고, 네 키 누름과 게이지 채움 시연을 엽니다.",
    createdAt: "2026-09-29",
  }),
]);
