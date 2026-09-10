// A compact lift/service spine joins occupied control floors and communication decks.
import {createBuilder} from '../blueprint-kit.mjs';

function controlFloor(b, {id, group, y, left, front, open, lit = false}) {
  const right = -7.4, back = -6.4, h = 5.5, width = right - left;
  // The floor reaches the lift spine; the room itself leaves an exposed side landing.
  b.box(`${id}-floor`, [(left - 1) / 2, y, (front - 9) / 2], [-1 - left, .5, front + 11], 'under');
  b.box(`${id}-roof`, [(left + right) / 2, y + h, (back + front) / 2], [width, .45, front - back], 'hull');
  b.box(`${id}-rear`, [(left + right) / 2, y + h / 2, back], [width, h, .5], 'back');
  for (const [side, x] of [['left', left + .2], ['right', right - .2]]) {
    b.box(`${id}-${side}-wall`, [x, y + h / 2, (back + front) / 2], [.4, h, front - back], 'side');
  }
  if (open) {
    // A real open room, with a human-sized rear door visible through the empty front.
    b.panel(`${id}-rear-door`, left + 1, y + .25, back + .26, 1.6, 2.8, 'door');
    if (lit) b.panel(`${id}-rear-window`, left + 4.1, y + 2, back + .26, 2.2, 1.35, 'window');
  } else {
    b.box(`${id}-front-sill`, [(left + right) / 2, y + 1.05, front], [width, 1.6, .4], 'side');
    b.box(`${id}-front-header`, [(left + right) / 2, y + 4.575, front], [width, 1.85, .4], 'hull');
    if (lit) b.panel(`${id}-control-window`, left + .4, y + 1.85, front + .21, width - .8, 1.8, 'window');
    else b.box(`${id}-dark-window`, [(left + right) / 2, y + 2.75, front], [width - .8, 1.8, .08], 'dark');
  }
  b.model.levels.push({id, group, floorY: y, clearHeight: 5.025, open,
    interior: {min: [left + .4, y + .25, back + .25], max: [right - .4, y + 5.275, front - .2]}});
}

export function createExtensionBlueprint() {
  const b = createBuilder();
  b.model.levels = [];
  b.box('rear-mount-socket', [-3.5, -2.25, 0], [5, 12.5, 6], 'mount');

  // One narrow continuous shaft carries the floors through large open intervals.
  const top = -6;
  const sectionHeight = (640 + top) / 8;
  for (let i = 0; i < 8; i++) {
    b.box(`service-spine-${i}`, [-5, top - (i + .5) * sectionHeight, -6],
      [4, sectionHeight, 8], 'hull');
  }

  const floors = [
    ['control-1', 1, -14, -17, 5, false, true],
    ['control-2', 1, -20, -20, 8, true, true],
    ['control-3', 1, -26, -17, 5, false, false],
    ['operations-1', 2, -52, -15, 2, true, false],
    ['operations-2', 2, -58, -19, 7, false, false],
    ['relay-1', 3, -94, -19, 8, false, true],
    ['relay-2', 3, -100, -16, 4, true, false],
    ['monitoring-1', 4, -141, -18, 5, true, false],
    ['service-1', 5, -292, -14, 2, true, false],
    ['service-2', 6, -478, -15, 3, false, false],
  ];
  for (const [id, group, y, left, front, open, lit] of floors) controlFloor(b, {id, group, y, left, front, open, lit});

  // Broad communication equipment grows from an actual occupied roof, not a forest
  // of decorative poles. The unequal panels reinforce the offset control-room shape.
  b.box('communications-base', [-12.2, -8.1, -.8], [5, .6, 4], 'mount');
  b.box('communications-panel', [-12.8, -6.1, -.8], [3.6, 3.6, .65], 'dark');
  return b.model;
}
