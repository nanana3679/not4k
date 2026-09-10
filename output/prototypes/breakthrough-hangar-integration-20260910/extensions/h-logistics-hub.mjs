// A single central equipment body roots all existing cantilevers. The branches
// retain their empty undersides instead of acquiring a forest of new columns.
import {createBuilder} from '../blueprint-kit.mjs';

export function createExtensionBlueprint() {
  const {model, box} = createBuilder();

  // The root encloses the keel and overlaps the hub's -7 lower face by 1.5.
  // Staying behind the original 8-unit façade leaves every painted opening.
  box('hub-root', [0, -14.25, 0], [14, 17.5, 14], 'under');
  box('hub-lower-shoulder', [0, -23, 0], [20, 10, 22], 'under');
  for (let i = 0; i < 6; i++) {
    const top = -22 - i * 103, bottom = top - 103;
    box(`hub-body-${i}`, [0, (top + bottom) / 2, 0],
      [18, top - bottom, 20], i % 3 === 1 ? 'under' : 'hull');
  }
  for (const y of [-125, -331, -537]) {
    box(`hub-joint-${y}`, [0, y, 0], [20, 2, 22], 'under');
  }
  return model;
}
