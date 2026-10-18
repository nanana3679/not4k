export interface HatchRect { x: number; y: number; width: number; height: number }

type Point = [number, number];

/** 다각형에서 f(p) ≥ 0인 쪽만 남긴다(Sutherland–Hodgman 한 변). f는 일차식이라 교점은 선형 보간으로 구한다. */
function clipHalfPlane(polygon: Point[], f: (p: Point) => number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const fa = f(a);
    const fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) {
      const t = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/**
 * rect를 45° 빗금으로 채울 검정 띠 다각형들(Graphics.poly에 넘길 평탄한 좌표 배열). 띠는 왼쪽 위 → 오른쪽 아래("\")
 * 방향이고, 줄에 수직으로 잰 띠 폭과 띠 사이 간격이 모두 stripeWidth다. 위상은 (originX, originY)에 고정한다.
 * 구간 시작점을 원점으로 주면 화면 밖을 잘라낸 rect로 그려도 빗금이 구간과 함께 움직인다.
 */
export function diagonalStripeBands(rect: HatchRect, stripeWidth: number, originX: number, originY: number): number[][] {
  if (rect.width <= 0 || rect.height <= 0 || stripeWidth <= 0) return [];
  const thickness = stripeWidth * Math.SQRT2; // y − x 방향으로 잰 띠 두께
  const period = thickness * 2;
  const u = (p: Point) => (p[1] - originY) - (p[0] - originX);
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const box: Point[] = [[rect.x, rect.y], [right, rect.y], [right, bottom], [rect.x, bottom]];
  const uMin = u([right, rect.y]);
  const uMax = u([rect.x, bottom]);
  const bands: number[][] = [];
  for (let k = Math.floor((uMin - thickness) / period); k * period <= uMax; k++) {
    const lo = k * period;
    const band = clipHalfPlane(clipHalfPlane(box, p => u(p) - lo), p => lo + thickness - u(p));
    if (band.length < 3) continue;
    let twiceArea = 0;
    for (let i = 0; i < band.length; i++) {
      const [ax, ay] = band[i];
      const [bx, by] = band[(i + 1) % band.length];
      twiceArea += ax * by - bx * ay;
    }
    if (Math.abs(twiceArea) < 1e-9) continue;
    bands.push(band.flat());
  }
  return bands;
}
