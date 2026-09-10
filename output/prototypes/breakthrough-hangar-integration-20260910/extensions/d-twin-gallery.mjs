// PROTOTYPE: D's fork projects from two long rear supports, not a closed facade.
import {createBuilder} from '../blueprint-kit.mjs';

export function createExtensionBlueprint() {
  const {model, box, beam} = createBuilder();
  const top = 6.8, bottom = -640, sections = 8;
  const height = (top - bottom) / sections;

  for (const [side, x] of [['left', -5.5], ['right', 5.5]]) {
    // Each support overlaps the rear hub; it stays behind the open front fork.
    for (let i = 0; i < sections; i++) {
      const sectionTop = top - i * height;
      box(`d-${side}-rear-shaft-${i}`, [x, sectionTop - height / 2, -14], [4.2, height, 13], 'hull');
      if (i > 0) box(`d-${side}-shaft-collar-${i}`, [x, sectionTop, -14], [4.8, 1.4, 13.6], 'under');
    }

    // Catch the original truss leg at its actual endpoint, then lead rearward.
    box(`d-${side}-leg-socket`, [x, -.6, -5.5], [1.1, 1.5, 1.1], 'mount');
    beam(`d-${side}-leg-return`, [x, -.6, -5.5], [x, -14, -12], 1.05, 1.8, 'under');
  }

  // Sparse large cross members tie the two rear supports together.
  for (const y of [-24, -184, -344, -504]) {
    box(`d-rear-tie-${y}`, [0, y, -14], [16.2, 3, 14], 'under');
  }
  return model;
}
