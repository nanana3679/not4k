// 연출 탐색용 프로토타입: 같은 세계의 지표를 높은 시점과 낮은 시점에서 비교한다.
// 실제 altitude 판정·실패 규칙과 연결하지 않는다.
export function viewAt(altitude, width, height) {
  const a = Math.min(1, Math.max(0, Number.isFinite(altitude) ? altitude : 1));
  const descent = Math.min(1, Math.max(0, (.9 - a) / .82));
  const pitchDegrees = 12 + 76 * descent ** 2.4;
  const pitch = pitchDegrees * Math.PI / 180;
  const focal = height * .88;
  const principalY = height / 2;
  return {
    altitude: a,
    width, height,
    pitchDegrees, sinPitch: Math.sin(pitch), cosPitch: Math.cos(pitch), principalY,
    horizon: principalY - focal * Math.tan(pitch),
    cameraHeight: 36 + 236 * a ** 1.3,
    focal,
    center: width / 2,
    worldSpeed: 70,
    trailSeconds: .025 + .035 * (1 - a),
  };
}

export function project(x, z, objectHeight, view) {
  const down = view.cameraHeight - objectHeight;
  const depth = z * view.cosPitch + down * view.sinPitch;
  if (depth <= .1) return null;
  return {
    x: view.center + x * view.focal / depth,
    y: view.principalY + (down * view.cosPitch - z * view.sinPitch) * view.focal / depth,
    scale: view.focal / depth,
    depth,
  };
}

export function depthAtRow(y, view) {
  const rayY = (y - view.principalY) / view.focal;
  const down = view.sinPitch + rayY * view.cosPitch;
  if (down <= 0) return null;
  return view.cameraHeight * (view.cosPitch - rayY * view.sinPitch) / down;
}

export function flowAtRow(y, view) {
  const z = depthAtRow(y, view);
  if (z === null) return 0;
  const depth = z * view.cosPitch + view.cameraHeight * view.sinPitch;
  return view.focal * view.cameraHeight * view.worldSpeed / depth ** 2;
}

export function stepAltitude(current, target, seconds) {
  return current + (target - current) * (1 - Math.exp(-Math.min(0.05, Math.max(0, seconds)) * 3.2));
}

export function laneAt(width, height) {
  const widthPx = Math.max(116, Math.min(252, width * 0.34));
  return { left: (width - widthPx) / 2, width: widthPx, top: 24, hit: height * 0.85, noteSpeed: height * 0.48 };
}
