// 돌파의 광원 높이 탐색: 지면·시선 부근·머리 위 광원의 상대 운동을 비교한다.
export const heightMode = value => value === 'ground' ? 'ground' : 'mixed';
export const lightLoop = 2448;
const random = n => { const value = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return value - Math.floor(value); };

export function makeLightGroups() {
  const groups = [];
  const bands = [16, 31, 56, 97, 174, 300];
  for (const side of [-1, 1]) for (let band = 0; band < bands.length; band++) for (let row = 0; row < 24; row++) {
    const seed = (side + 1) * 421 + band * 73 + row * 211;
    if (random(seed + 1) > .78) continue;
    groups.push({
      id: `light-group/${side}/${band}/${row}`,
      x: side * (bands[band] + random(seed + 2) * 6),
      z: row * 102 + band * 27 + side * 13 + random(seed + 3) * 24,
      width: 2.5 + random(seed + 4) * 3.5,
      height: 104 + random(seed + 6) * 58,
      eyeHeight: 61 + random(seed + 7) * 16,
      shoulderHeight: 26 + random(seed + 8) * 19,
      bright: .60 + random(seed + 9) * .35,
      overhead: row % 3 !== 0,
      // 높이가 다른 빛을 작은 무리로 배치한다.
      side,
    });
  }
  return groups;
}

export function elevatedLights(groups) {
  return groups.flatMap(f => {
    const innerX = f.x - f.side * (f.width / 2 + .3);
    const common = { z: f.z, x: innerX, extent: 2.5, kind: 'horizontal', bright: f.bright };
    const lamps = [
      { ...common, id: `${f.id}/lower`, elevation: f.shoulderHeight, layer: 'raised', kind: 'vertical', extent: 3.5 },
      { ...common, id: `${f.id}/eye`, elevation: f.eyeHeight, layer: 'eye', extent: 3.2 },
    ];
    if (f.overhead) lamps.push({ ...common, id: `${f.id}/overhead`, x: innerX - f.side * 3, elevation: f.height - 5, layer: 'overhead', extent: 3.6 });
    return lamps;
  });
}

export function positionInLoop(z, travel, length = lightLoop) {
  const raw = z - travel;
  const cycle = Math.floor((raw + 384) / length);
  return { z: raw - cycle * length, cycle };
}
