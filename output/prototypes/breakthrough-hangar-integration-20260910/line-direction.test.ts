import { describe, expect, it } from 'vitest';
import { collectFaces, lightLayout, linePyramidFor, readSettings, scenePyramid } from './integration.mjs';
import { insidePyramid, project, viewAt, worldFaces } from './legacy/geometry.mjs';

function scene(altitude: number, width = 1280, height = 720, clearance = 1, study = 'modules', variant = 'lines') {
  const settings = readSettings(`altitude=${altitude}&clearance=${clearance}&study=${study}&variant=${variant}`);
  const pyramid = scenePyramid(settings);
  const view = viewAt(width, height, altitude, pyramid);
  const lines = linePyramidFor(settings, pyramid, view);
  return { settings, pyramid, view, lines };
}

describe('돌파 직선 광원의 고도별 방향', () => {
  describe.each([
    ['modules', 'lines'],
    ['modules', 'mixed'],
    ['passage', 'lines'],
    ['passage', 'mixed'],
  ])('%s·%s', (study, variant) => {
    for (const [width, height] of [[1280, 608], [390, 732]]) {
      for (const clearance of [0, 1]) {
        for (const altitude of [0, 1]) {
          const direction = altitude === 0 ? '좌우 상단→중앙 하단85%' : '좌우 하단→중앙 상단15%';
          it(`${width}×${height}·근접${clearance}·고도${altitude * 100}%의 모든 직선은 ${direction}를 향한다`, () => {
            const { settings, pyramid, view, lines } = scene(altitude, width, height, clearance, study, variant);
            const focus = project([0, lines.apexHeight, lines.depth], view);
            expect(focus.x).toBe(width / 2);
            expect(focus.y / height).toBeCloseTo(altitude === 0 ? .85 : .15);
            const faces = collectFaces(lightLayout(settings), 35, settings, pyramid, view);
            expect(faces.length).toBeGreaterThan(50);
            const lineFaces = faces.filter(face => face.id.endsWith('/line'));
            expect(lineFaces.length).toBeGreaterThan(0);
            const sides = new Set();
            for (const face of lineFaces) {
              const center = project(face.frame.point, view);
              const tip = project(face.frame.point.map((v: number, i: number) => v + face.frame.forward[i]), view);
              sides.add(Math.sign(center.x - focus.x));
              expect(Math.abs(tip.x - focus.x)).toBeLessThan(Math.abs(center.x - focus.x));
              expect((tip.y - center.y) * (altitude === 0 ? 1 : -1)).toBeGreaterThan(0);
              if (face.points.length === 4 && face.points.every(point => point[2] > 0)) {
                // 실제 발광 사각형의 양 끝 중심도 같은 소실점을 향한다.
                const midpoint = (a: number[], b: number[]) => project(a.map((v, i) => (v + b[i]) / 2), view);
                const tail = midpoint(face.points[0], face.points[1]);
                const head = midpoint(face.points[2], face.points[3]);
                expect((head.y - tail.y) * (altitude === 0 ? 1 : -1)).toBeGreaterThan(0);
                const cross = (tail.x - focus.x) * (head.y - focus.y) - (tail.y - focus.y) * (head.x - focus.x);
                expect(Math.abs(cross)).toBeLessThan(1e-6);
              }
              for (const point of face.points) expect(insidePyramid(point, lines)).toBe(true);
            }
            expect(sides).toEqual(new Set([-1, 1]));
          });
        }
      }
    }
  });

  it('고도0→50→100%의 소실점은 화면85→50→15%로 연속 상승하며 중앙50%에서 끊기지 않는다', () => {
    let previousY = Infinity;
    for (let step = 0; step <= 100; step++) {
      const { view, lines } = scene(step / 100);
      const y = project([0, lines.apexHeight, lines.depth], view).y / view.height;
      expect(y).toBeLessThan(previousY);
      if (step > 0) expect(previousY - y).toBeLessThan(.011);
      if (step === 50) expect(y).toBeCloseTo(.5);
      previousY = y;
    }
  });

  it('고도0·50·100%에서 혼합 모드의 삼각형 좌표·색·윤곽선은 기존 worldFaces와 같다', () => {
    for (const altitude of [0, .5, 1]) {
      const { settings, pyramid, view } = scene(altitude);
      settings.variant = 'mixed';
      const lights = lightLayout(settings);
      const faces = collectFaces(lights, 35, settings, pyramid, view);
      let triangles = 0;
      for (const face of faces) {
        const light = lights.find(light => face.id.startsWith(`${light.id}/`));
        if (light.isLine) continue;
        const original = worldFaces(light, 35, settings, pyramid).find(original => original.id === face.id);
        expect(face.points).toEqual(original.points);
        expect(face.rgb).toEqual(original.rgb);
        expect(face.outline).toBe(original.outline);
        triangles++;
      }
      expect(triangles).toBeGreaterThan(0);
    }
  });

  it('고도0·50·100%에서 직선 방향 계산은 기존 카메라·건물용 사각뿔과 광원336개의 배치를 수정하지 않는다', () => {
    const originalLights = lightLayout(readSettings());
    for (const altitude of [0, .5, 1]) {
      const { settings, pyramid, view } = scene(altitude);
      const before = structuredClone({ pyramid, view, settings });
      collectFaces(originalLights, 35, settings, pyramid, view);
      expect({ pyramid, view, settings }).toEqual(before);
      expect(lightLayout(settings)).toEqual(originalLights);
    }
  });
});
