// PROTOTYPE: occupied service bays branch from C's continuous utility spine.
import {createBuilder, chamfer} from '../blueprint-kit.mjs';

export function createExtensionBlueprint() {
  const {model, prism, box, beam, panel} = createBuilder();

  // Overlap both the lower casing and its narrow backbone, below the open frame.
  prism('c-service-neck', chamfer(.4, -20, 6.4, 1.2, .35), 1.6, -18, 'hull');

  // The narrow spine carries utilities; its floors project into open service bays.
  // Fixed sections keep the artwork from stretching over the full 640 units.
  const top = -14, bottom = -640, sections = 8;
  const height = (top - bottom) / sections;
  for (let i = 0; i < sections; i++) {
    const sectionTop = top - i * height;
    box(`c-service-shaft-${i}`, [1.5, sectionTop - height / 2, -13], [2.4, height, 8], 'hull');
  }

  // Two usable 6-unit storeys per bay: equipment below, inspection floor above.
  // Four groups cluster near the original module; two others punctuate deep voids.
  for (const [i, base] of [-22, -52, -88, -132, -286, -466].entries()) {
    const left = i % 2 === 0;
    const x0 = left ? -8 : 0, x1 = left ? 3 : 11;
    const outer = left ? x0 : x1, center = (x0 + x1) / 2;
    const id = `c-bay-${i}`;
    for (let floor = 0; floor <= 2; floor++) {
      box(`${id}-floor-${floor}`, [center, base + floor * 6, -7], [x1 - x0, .4, 18], 'side');
    }
    box(`${id}-rear-wall`, [center, base + 6, -15.75], [x1 - x0, 12, .5], 'hull');
    box(`${id}-outer-wall`, [outer, base + 6, -7], [.45, 12, 18], 'hull');
    // A human-size cabinet occupies the rear; the front of both storeys stays open.
    box(`${id}-equipment`, [left ? -5.5 : 8.5, base + 1.6, -12.7], [2, 2.8, 4], 'mount');
    panel(`${id}-service-door`, left ? -3.6 : 4.1, base + .2, -15.46, 1.6, 2.8, 'door');
    if (i === 0 || i === 3 || i === 5) {
      panel(`${id}-inspection-window`, left ? -6 : 6.8, base + 8.1, -15.46, 2.8, 1.2, 'window');
    }
    beam(`${id}-cantilever-brace`, [outer, base - .15, .8], [1.5, base - 8, -13], .55, .8, 'under');
  }
  return model;
}
