// Dock infrastructure descends as open berthing decks around a continuous void.
// The long service walls carry inhabited clusters, not a solid U-shaped pile.
import {createBuilder} from '../blueprint-kit.mjs';

export function createExtensionBlueprint() {
  const {model, box, panel} = createBuilder();
  const block = (id, min, max, tone = 'hull') => box(id,
    min.map((v, i) => (v + max[i]) / 2), min.map((v, i) => max[i] - v), tone);
  const cores = [
    {id: 'left', min: [-33, -640, -16], max: [-26.8, -7, 14.8]},
    {id: 'right', min: [25.8, -640, -16], max: [29.2, -7, 14.8]},
    {id: 'rear', min: [-33, -640, -19], max: [29.2, -7, -15]},
  ];
  for (const core of cores) for (let i = 0; i < 6; i++) {
    const top = -7 - i * 105.5;
    block(`${core.id}-service-core-${i}`, [core.min[0], top - 105.5, core.min[2]],
      [core.max[0], top, core.max[2]], i % 3 === 1 ? 'under' : 'hull');
  }
  for (const [side, x] of [['left', -22.5], ['right', 22.5]]) {
    box(`${side}-dock-root`, [x, -5.625, 2.8], [13, 8.75, 26.4], 'under');
  }
  box('rear-dock-root', [0, -5.625, -10], [58, 8.75, 12], 'under');

  const deck = (id, y) => {
    block(`${id}-left-deck`, [-33, y - .4, -19], [-16, y + .4, 16], 'side');
    block(`${id}-right-deck`, [16, y - .4, -19], [29.2, y + .4, 16], 'side');
    block(`${id}-rear-deck`, [-33, y - .4, -19], [29.2, y + .4, -4.1], 'side');
  };
  const rearRoom = (id, floor, lit) => {
    block(`${id}-repair-room`, [-7, floor + .4, -17.5], [7, floor + 5.6, -9], 'under');
    panel(`${id}-repair-door`, -4.8, floor + .4, -8.955, 1.6, 2.8, 'door');
    if (lit) panel(`${id}-repair-window`, 1.5, floor + 2.5, -8.955, 3.5, 1.1, 'window');
  };
  model.operatingLevels = [];
  [-18, -54, -94, -134].forEach((upper, group) => {
    for (const [storey, floor] of [upper, upper - 6].entries()) {
      const id = `berth-${group}-${storey}`;
      deck(id, floor);
      const left = (group + storey) % 2 === 0;
      const x0 = left ? -27.1 : 20.7, x1 = left ? -20.7 : 26.1;
      block(`${id}-side-workshop`, [x0, floor + .4, -16], [x1, floor + 5.6, -7.5], 'under');
      panel(`${id}-workshop-door`, x0 + .7, floor + .4, -7.455, 1.6, 2.8, 'door');
      if ((group * 2 + storey) % 3 === 0) {
        panel(`${id}-workshop-window`, x0 + 2.8, floor + 2.6, -7.455, 1.5, .9, 'window');
      }
      model.operatingLevels.push({id, floor, ceiling: floor + 6, use: 'berthing-and-repair'});
    }
    deck(`berth-${group}-roof`, upper + 6);
    rearRoom(`berth-${group}`, upper, group % 2 === 0);
  });

  // Three compact storeys form an offset service wing beside the left core.
  for (let i = 0; i < 4; i++) {
    const floor = -62 + i * 6;
    block(`service-wing-deck-${i}`, [-42, floor - .4, -14], [-30, floor + .4, 8], 'side');
    if (i < 3) {
      block(`service-wing-room-${i}`, [-42, floor + .4, -14], [-35, floor + 5.6, 6], 'under');
      panel(`service-wing-door-${i}`, -40, floor + .4, 6.045, 1.6, 2.8, 'door');
    }
  }
  // Two maintenance stops leave long, calm intervals in the deep drop.
  for (const [index, floor] of [-278, -470].entries()) {
    const id = `deep-service-${index}`;
    deck(id, floor);
    deck(`${id}-roof`, floor + 6);
    rearRoom(id, floor, index === 0);
    model.operatingLevels.push({id, floor, ceiling: floor + 6, use: 'deep-maintenance'});
  }
  return model;
}
