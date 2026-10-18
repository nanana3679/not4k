// PROTOTYPE: staggered galleries and recessed operations rooms occupy D's supports.
import {createBuilder} from '../blueprint-kit.mjs';

export function createExtensionBlueprint() {
  const {model, box, beam, panel} = createBuilder();
  const top = 6.8, bottom = -640, sections = 8;
  const height = (top - bottom) / sections;

  for (const [side, x] of [['left', -5.5], ['right', 5.5]]) {
    // Each support overlaps the rear hub; it stays behind the open front fork.
    for (let i = 0; i < sections; i++) {
      const sectionTop = top - i * height;
      box(`d-${side}-rear-shaft-${i}`, [x, sectionTop - height / 2, -11], [2.6, height, 6], 'hull');
    }

    // Catch the original truss leg at its actual endpoint, then lead rearward.
    box(`d-${side}-leg-socket`, [x, -.6, -5.5], [1.1, 1.5, 1.1], 'mount');
    beam(`d-${side}-leg-return`, [x, -.6, -5.5], [x, -14, -12], 1.05, 1.8, 'under');
  }

  // Lower crossings face forward; the next storey returns through a rear gallery.
  // Alternating rooms leave the center open instead of becoming a continuous wall.
  for (const [i, base] of [-22, -50, -84, -128, -302, -492].entries()) {
    const left = i % 2 === 0;
    const x0 = left ? -15 : 4, x1 = left ? -4 : 15;
    const center = (x0 + x1) / 2, outer = left ? x0 : x1;
    const returnX = left ? 5.5 : -5.5, id = `d-level-${i}`;

    box(`${id}-front-gallery`, [0, base, -8.5], [16, .4, 5], 'side');
    box(`${id}-front-parapet`, [0, base + .7, -6.1], [16, 1, .25], 'beam');
    box(`${id}-rear-gallery`, [0, base + 6, -20], [16, .4, 4], 'side');
    box(`${id}-rear-parapet`, [0, base + 6.7, -18.1], [16, 1, .25], 'beam');
    box(`${id}-return-landing`, [returnX, base + 6, -15], [3, .4, 12], 'side');

    // The room attaches to one axis. Its open front reveals floors and rear doors.
    for (let floor = 0; floor <= 2; floor++) {
      box(`${id}-room-floor-${floor}`, [center, base + floor * 6, -18.25], [11, .4, 15.5], 'side');
    }
    box(`${id}-room-rear-wall`, [center, base + 6, -25.7], [11, 12, .6], 'hull');
    box(`${id}-room-outer-wall`, [outer, base + 6, -18.25], [.5, 12, 15.5], 'hull');
    panel(`${id}-operations-door`, left ? -10.5 : 8.9, base + .2, -25.36, 1.6, 2.8, 'door');
    if (i === 0 || i === 2 || i === 5) {
      panel(`${id}-operations-window`, left ? -13.5 : 10.7, base + 8.2, -25.36, 2.8, 1.2, 'window');
    }
    beam(`${id}-rear-gallery-brace`, [returnX, base + 5.85, -20], [returnX, base - 4, -11], .65, .9, 'under');
  }
  return model;
}
