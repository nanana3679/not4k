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
]);
