// Fixed continuation of the three dock walls. The courtyard stays open to the
// front and through the entire lower structure, rather than sitting on a slab.
import {createBuilder} from '../blueprint-kit.mjs';

export function createExtensionBlueprint() {
  const {model, box} = createBuilder();
  const walls = [
    {id: 'left', x: -24.5, z: 0, width: 9, depth: 32},
    {id: 'right', x: 24.5, z: 0, width: 9, depth: 32},
    {id: 'rear', x: 0, z: -12, width: 58, depth: 8},
  ];

  // These shoulders intersect both the existing rim and its lower docking lip.
  // Their inner edges stop outside the original [-15.8,15.8] courtyard opening.
  for (const [id, x] of [['left', -22.5], ['right', 22.5]]) {
    box(`${id}-dock-root`, [x, -5.625, 2.8], [13, 8.75, 26.4], 'under');
  }
  box('rear-dock-root', [0, -5.625, -10], [58, 8.75, 12], 'under');

  // Six calm surface courses reset the painted panel detail without rails,
  // pipes or new lamps. Joining courses share an exact closed cross-section.
  for (const wall of walls) {
    for (let i = 0; i < 6; i++) {
      const top = -7 - i * 105.5, bottom = top - 105.5;
      box(`${wall.id}-body-${i}`, [wall.x, (top + bottom) / 2, wall.z],
        [wall.width, top - bottom, wall.depth], i % 3 === 1 ? 'under' : 'hull');
    }
    for (const y of [-112.5, -323.5, -534.5]) {
      box(`${wall.id}-joint-${y}`, [wall.x, y, wall.z],
        [wall.width + .8, 2, wall.depth + .8], 'under');
    }
  }
  return model;
}
