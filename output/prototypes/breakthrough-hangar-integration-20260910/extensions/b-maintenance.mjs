// An offset service body grows below the L deck without closing its open corner.
import {createBuilder} from '../blueprint-kit.mjs';

export function createExtensionBlueprint() {
  const b = createBuilder();

  // Overlap the mounting root and the root endpoints of both original braces.
  b.box('mounting-root-socket', [1.4, -5.25, -4.4], [4.8, 12.5, 5.5], 'mount');

  // A narrow front shaft preserves the cantilevered deck's scale and silhouette.
  for (let i = 0; i < 7; i++) {
    b.box(`deck-service-shaft-${i}`, [1.2, -10 - (i + .5) * 90, -7],
      [6.4, 90, 10], 'hull');
  }

  // The larger body is offset behind the cross arm. Its overlapping L section
  // carries the deck into the depths while the forward missing quadrant is empty.
  const sectionHeight = (640 - 28) / 6;
  for (let i = 0; i < 6; i++) {
    b.box(`offset-equipment-body-${i}`, [8, -28 - (i + .5) * sectionHeight, -15.5],
      [11, sectionHeight, 15], 'side');
  }

  return b.model;
}
