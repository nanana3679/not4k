// Two unequal vertical stations serve the original open transfer bridge.
// Exposed lift wells and recessed waiting rooms explain the height of each end.
import {createBuilder} from '../blueprint-kit.mjs';

export function createExtensionBlueprint() {
  const {model, box, panel} = createBuilder();
  const block = (id, min, max, tone = 'hull') => box(id,
    min.map((v, i) => (v + max[i]) / 2), min.map((v, i) => max[i] - v), tone);
  const towers = [
    {id: 'main', walls: [
      ['outer', -39.2, -38, -8.5, 8], ['inner', -34.8, -33.6, -8.5, 8],
      ['rear', -39.2, -20.8, -9.6, -7.4],
    ], deck: [-34.6, -20.2, -8.8, 11], room: [-30.5, -21, -14, -6.9]},
    {id: 'small', walls: [
      ['outer', 37.8, 39, -6.5, 6], ['inner', 34.2, 35.4, -6.5, 6],
      ['rear', 31.3, 39, -7.4, -5.4],
    ], deck: [31.2, 35, -6.8, 9], room: [31.2, 37, -12, -5.1]},
  ];
  box('main-terminal-root', [-30, -4.5, 0], [19.6, 15, 20], 'under');
  box('small-terminal-root', [35.5, -5.5, 0], [8.2, 13, 14], 'under');
  model.operatingLevels = [];

  for (const tower of towers) {
    for (const [wall, x0, x1, z0, z1] of tower.walls) for (let i = 0; i < 6; i++) {
      const top = -10 - i * 105;
      block(`${tower.id}-lift-${wall}-${i}`, [x0, top - 105, z0], [x1, top, z1],
        wall === 'rear' ? 'under' : 'hull');
    }
    const platform = (id, y) => {
      const [x0, x1, z0, z1] = tower.deck;
      block(`${id}-platform`, [x0, y - .4, z0], [x1, y + .4, z1], 'side');
    };
    const room = (id, floor, lit) => {
      const [x0, x1, z0, z1] = tower.room;
      block(`${id}-waiting-room`, [x0, floor + .4, z0], [x1, floor + 5.6, z1], 'under');
      // The room has its own slab behind the shaft's backing wall. Its door
      // meets the forward landing, while the vertical lift opening stays clear.
      block(`${id}-room-floor`, [x0, floor - .4, z0], [x1, floor + .4, z1], 'side');
      block(`${id}-room-roof`, [x0, floor + 5.6, z0], [x1, floor + 6.4, z1], 'side');
      panel(`${id}-door`, x0 + .6, floor + .4, z1 + .045, 1.6, 2.8, 'door');
      if (lit) panel(`${id}-window`, x0 + (tower.id === 'main' ? 4.2 : .8),
        floor + (tower.id === 'main' ? 2.4 : 4.1), z1 + .045,
        tower.id === 'main' ? 3.5 : 1.5, tower.id === 'main' ? 1.05 : .9, 'window');
    };
    [-18, -54, -94, -134].forEach((upper, cluster) => {
      for (const [storey, floor] of [upper, upper - 6].entries()) {
        const id = `${tower.id}-transfer-${cluster}-${storey}`;
        platform(id, floor);
        if (storey === cluster % 2) room(id, floor, cluster % 2 === (tower.id === 'main' ? 0 : 1));
        model.operatingLevels.push({id, tower: tower.id, floor, ceiling: floor + 6, use: 'passenger-transfer'});
      }
      platform(`${tower.id}-transfer-${cluster}-roof`, upper + 6);
    });
    for (const [index, floor] of [-300, -508].entries()) {
      const id = `${tower.id}-deep-service-${index}`;
      platform(id, floor);
      platform(`${id}-roof`, floor + 6);
      room(id, floor, false);
      model.operatingLevels.push({id, tower: tower.id, floor, ceiling: floor + 6, use: 'lift-service'});
    }
  }
  return model;
}
