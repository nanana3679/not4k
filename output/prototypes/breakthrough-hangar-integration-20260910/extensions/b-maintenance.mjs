// An occupied maintenance stack: recessed workshops, working decks and a shared lift.
import {createBuilder} from '../blueprint-kit.mjs';

function workFloor(b, {id, group, y, right, open, lit = false}) {
  const left = 4.2, back = -22, front = -12, width = right - left, h = 5.5;
  b.box(`${id}-deck`, [(right - 4) / 2, y, -13], [right + 4, .65, 22], 'under');
  b.box(`${id}-roof`, [(left + right) / 2, y + h, (back + front) / 2], [width, .45, front - back], 'hull');
  b.box(`${id}-rear`, [(left + right) / 2, y + h / 2, back], [width, h, .5], 'back');
  for (const [side, x] of [['left', left + .2], ['right', right - .2]]) {
    b.box(`${id}-${side}-wall`, [x, y + h / 2, (back + front) / 2], [.4, h, front - back], 'side');
  }
  if (open) {
    b.panel(`${id}-rear-door`, left + 1, y + .325, back + .26, 1.6, 2.8, 'door');
    if (lit) b.panel(`${id}-rear-window`, left + 3.3, y + 2, back + .26, 2, 1.3, 'window');
  } else {
    // Door and observation glass face the usable front work deck, well behind its edge.
    b.box(`${id}-front`, [(left + right) / 2, y + h / 2, front], [width, h, .4], 'side');
    b.panel(`${id}-workshop-door`, left + .65, y + .325, front + .21, 1.6, 2.8, 'door');
    if (lit) b.panel(`${id}-workshop-window`, left + 3.2, y + 2, front + .21, 2, 1.3, 'window');
  }
  b.panel(`${id}-lift-door`, -.55, y + .325, -4.93, 1.6, 2.8, 'door');
  b.model.levels.push({id, group, floorY: y, clearHeight: 4.95, open,
    interior: {min: [left + .4, y + .325, back + .25], max: [right - .4, y + 5.275, front - .2]},
    workArea: {min: [left + .4, y + .325, front + .3], max: [right - .4, y + 5.275, -2.2]}});
}

export function createExtensionBlueprint() {
  const b = createBuilder();
  b.model.levels = [];
  b.box('mounting-root-socket', [1.4, -5.25, -4.4], [4.8, 12.5, 5.5], 'mount');

  const sectionHeight = 634 / 8;
  for (let i = 0; i < 8; i++) {
    const y = -6 - (i + .5) * sectionHeight;
    b.box(`lift-shaft-${i}`, [1, y, -7.5], [4, sectionHeight, 5], 'hull');
    // A recessed vertical lift slit explains the common shaft between sparse floors.
    b.box(`lift-slot-${i}`, [.25, y, -4.98], [1.65, sectionHeight, .08], 'dark');
  }

  const floors = [
    // The first lift door ends at -12.875, below the mounting socket's -11.5 end.
    ['workshop-1', 1, -16, 12, false, true],
    ['workshop-2', 1, -22, 15, true, false],
    ['workshop-3', 1, -28, 12, false, false],
    ['repair-1', 2, -49, 13, true, true],
    ['repair-2', 2, -55, 11, false, false],
    ['dispatch-1', 3, -88, 15, false, false],
    ['dispatch-2', 3, -94, 12, true, false],
    ['inspection-1', 4, -137, 13, true, false],
    ['service-1', 5, -286, 11, true, false],
    ['service-2', 6, -471, 12, false, false],
  ];
  for (const [id, group, y, right, open, lit] of floors) workFloor(b, {id, group, y, right, open, lit});
  return b.model;
}
