// The bridge remains a bridge: only its unequal end buildings continue down.
import {createBuilder} from '../blueprint-kit.mjs';

export function createExtensionBlueprint() {
  const {model, box} = createBuilder();
  const terminals = [
    {id: 'main', x: -30, width: 18, depth: 18},
    {id: 'small', x: 35.5, width: 7, depth: 12},
  ];

  // The main shoulder overlaps terminal-keel; the small shoulder enters the
  // small-terminal itself. Neither reaches a front door or the truss opening.
  box('main-terminal-root', [-30, -4.5, 0], [19.6, 15, 20], 'under');
  box('small-terminal-root', [35.5, -5.5, 0], [8.2, 13, 14], 'under');

  for (const terminal of terminals) {
    for (let i = 0; i < 6; i++) {
      const top = -10 - i * 105, bottom = top - 105;
      box(`${terminal.id}-body-${i}`, [terminal.x, (top + bottom) / 2, 0],
        [terminal.width, top - bottom, terminal.depth], i % 3 === 2 ? 'under' : 'hull');
    }
    for (const y of [-115, -325, -535]) {
      box(`${terminal.id}-joint-${y}`, [terminal.x, y, 0],
        [terminal.width + 1, 1.8, terminal.depth + 1], 'under');
    }
  }
  return model;
}
