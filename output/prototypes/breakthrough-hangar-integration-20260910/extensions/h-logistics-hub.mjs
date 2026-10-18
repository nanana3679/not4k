// An open central freight shaft carries alternating loading and storage floors.
// The original cantilevers remain branches of one hub, with no outer columns.
import {createBuilder} from '../blueprint-kit.mjs';

export function createExtensionBlueprint() {
  const {model, box, panel} = createBuilder();
  const block = (id, min, max, tone = 'hull') => box(id,
    min.map((v, i) => (v + max[i]) / 2), min.map((v, i) => max[i] - v), tone);
  box('hub-root', [0, -14.25, 0], [14, 17.5, 14], 'under');
  block('hub-transfer-cap', [-10, -22, -10.5], [10, -18, 9], 'under');
  const cores = [
    {id: 'back', x0: -9, x1: 9, z0: -10.5, z1: -7.5},
    {id: 'left-guide', x0: -9, x1: -7, z0: 5.5, z1: 8},
    {id: 'right-guide', x0: 7, x1: 9, z0: 5.5, z1: 8},
  ];
  for (const core of cores) for (let i = 0; i < 6; i++) {
    const top = -20 - i * (620 / 6), bottom = i === 5 ? -640 : -20 - (i + 1) * (620 / 6);
    block(`${core.id}-freight-core-${i}`, [core.x0, bottom, core.z0],
      [core.x1, top, core.z1], core.id === 'back' ? 'under' : 'hull');
  }
  const decks = {
    west: {deck: [-22, -7, -10.5, 11], room: [-22, -14, -10.5, 0]},
    east: {deck: [7, 21, -10.5, 11], room: [13, 21, -10.5, 0]},
    front: {deck: [-9, 9, 7, 19], room: [-9, -2, 10, 19]},
    rear: {deck: [-9, 19, -22, -8], room: [11, 19, -22, -13]},
  };
  const platform = (id, floor, direction) => {
    const [x0, x1, z0, z1] = decks[direction].deck;
    block(`${id}-loading-deck`, [x0, floor - .4, z0], [x1, floor + .4, z1], 'side');
    if (direction === 'rear') {
      // A side passage goes around the closed back of the lift, reaching its
      // open front entrance. The rear store is offset beyond the backing wall.
      block(`${id}-return-walk`, [8.6, floor - .4, -22], [12, floor + .4, 11], 'side');
      block(`${id}-lift-landing`, [-8, floor - .4, 7], [12, floor + .4, 11], 'side');
    }
  };
  const store = (id, floor, direction, lit) => {
    const [x0, x1, z0, z1] = decks[direction].room;
    block(`${id}-storage-room`, [x0, floor + .4, z0], [x1, floor + 5.6, z1], 'under');
    if (direction === 'front') {
      const x = x1 + .045, y = floor + .4, z = z0 + 2;
      model.panels.push({id: `${id}-cargo-door`, texture: 'door',
        points: [[x, y, z + 2.8], [x, y, z], [x, y + 3.4, z], [x, y + 3.4, z + 2.8]],
        uv: [[0, 0], [1, 0], [1, 1], [0, 1]]});
    } else panel(`${id}-cargo-door`, x0 + .65, floor + .4, z1 + .045, 2.8, 3.4, 'door');
    if (lit) panel(`${id}-office-window`, x0 + 4.2, floor + 3.6, z1 + .045, 1.7, .9, 'window');
  };
  model.operatingLevels = [];
  for (const [group, [upper, direction]] of [[-28, 'west'], [-64, 'east'], [-104, 'front'], [-140, 'rear']].entries()) {
    for (const [storey, floor] of [upper, upper - 6].entries()) {
      const id = `freight-${group}-${storey}`;
      platform(id, floor, direction);
      store(id, floor, direction, storey === 0 && group % 2 === 0);
      model.operatingLevels.push({id, floor, ceiling: floor + 6, direction, use: 'loading-and-storage'});
    }
    platform(`freight-${group}-roof`, upper + 6, direction);
  }
  for (const [index, [floor, direction]] of [[-286, 'east'], [-492, 'west']].entries()) {
    const id = `freight-deep-${index}`;
    platform(id, floor, direction);
    platform(`${id}-roof`, floor + 6, direction);
    store(id, floor, direction, false);
    model.operatingLevels.push({id, floor, ceiling: floor + 6, direction, use: 'deep-cargo-transfer'});
  }
  return model;
}
