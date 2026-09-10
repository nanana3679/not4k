// PROTOTYPE: C's exposed frame stays open above a continuous service shaft.
import {createBuilder, chamfer} from '../blueprint-kit.mjs';

export function createExtensionBlueprint() {
  const {model, prism, box} = createBuilder();

  // Overlap both the lower casing and its narrow backbone, below the open frame.
  prism('c-service-neck', chamfer(.4, -20, 6.4, 1.2, .35), 1.6, -18, 'hull');

  // Eight fixed surface sections keep the artwork from stretching over 640 units.
  const top = -14, bottom = -640, sections = 8;
  const height = (top - bottom) / sections;
  for (let i = 0; i < sections; i++) {
    const sectionTop = top - i * height;
    box(`c-service-shaft-${i}`, [3.75, sectionTop - height / 2, -15], [9.3, height, 25], 'hull');
    // These collars cover each join and attach to the shaft on both sides.
    box(`c-service-collar-${i}`, [3.75, sectionTop, -15], [9.8, 1.4, 25.5], 'under');
  }
  return model;
}
