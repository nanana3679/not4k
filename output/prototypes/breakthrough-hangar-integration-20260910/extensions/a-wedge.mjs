// The control room projects from a service tower; its cabin and braces stay intact.
import {createBuilder} from '../blueprint-kit.mjs';

export function createExtensionBlueprint() {
  const b = createBuilder();

  // This socket overlaps the original rear mount and both diagonal brace feet.
  // Its front edge stays behind x=0, leaving the cabin doors/windows exposed.
  b.box('rear-mount-socket', [-3.5, -2.25, 0], [5, 12.5, 6], 'mount');

  // Separate fixed surface sections avoid stretching one texture over 640 units.
  // Shared section boundaries are hidden inside a continuous structural volume.
  const top = -8;
  const sectionHeight = (640 + top) / 8;
  for (let i = 0; i < 8; i++) {
    b.box(`service-tower-${i}`, [-6.25, top - (i + .5) * sectionHeight, -8.5],
      [10.5, sectionHeight, 19], 'hull');
  }

  // A recessed equipment bank widens the tower on the outside, away from the
  // projecting room. It shares real volume with the tower along its full length.
  for (let i = 0; i < 4; i++) {
    b.box(`rear-equipment-bank-${i}`, [-13.5, -80 - (i + .5) * 140, -18.5],
      [7, 140, 13], 'under');
  }

  return b.model;
}
