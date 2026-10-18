// PROTOTYPE: D's two enclosed galleries share one rear hub; the fork stays open.
import {createBuilder, chamfer} from '../blueprint-kit.mjs';

export const metadata = Object.freeze({
  id: 'D', name: '이중 통로', kind: 'small',
  description: '작은 후방 허브에서 두 개의 가느다란 통로가 뻗고 그 사이로 아래 공간이 보이는 모듈.',
  reference: '04-small-far-high.png',
});

export function createBlueprint() {
  const b = createBuilder();
  const {model, prism, box, beam, panel} = b;
  prism('rear-hub', chamfer(-9, 2.8, 9, 7.8, .45), -3.3, -8.5);
  prism('left-gallery', chamfer(-9, 3.2, -4, 6.8, .35), 8.5, -4.2);
  prism('right-gallery', chamfer(4, 3.2, 9, 6.8, .35), 11.5, -4.2);

  // Human-sized door looks into the open fork, with a real small service landing.
  panel('hub-door', -.8, 3.52, -3.255, 1.6, 2.8, 'door');
  box('hub-landing', [0, 3.38, -2.55], [3.2, .28, 1.6], 'side');
  for (const x of [-1.5, 1.5]) {
    beam(`landing-post-${x}`, [x, 3.52, -1.8], [x, 4.52, -1.8], .065, .065, 'rail');
    beam(`landing-side-rail-${x}`, [x, 4.52, -3.32], [x, 4.52, -1.8], .065, .065, 'rail');
  }
  // Window art is fixed to long vertical sides; it never changes with distance.
  for (const [side, x, start, length] of [['left', -9.025, -2.5, 9.6], ['right', 9.025, -2.5, 12.6]]) {
    const p = side === 'left'
      ? [[x, 4.1, start], [x, 4.1, start + length], [x, 5.45, start + length], [x, 5.45, start]]
      : [[x, 4.1, start + length], [x, 4.1, start], [x, 5.45, start], [x, 5.45, start + length]];
    model.panels.push({id: `${side}-gallery-windows`, points: p, texture: 'window', uv: [[0, 0], [1, 0], [1, 1], [0, 1]]});
  }
  panel('left-tip-window', -8.35, 4.2, 8.545, 3.7, 1.2, 'window');
  panel('right-tip-window', 4.65, 4.2, 11.545, 3.7, 1.2, 'window');

  // This under-hub truss ends at both sides of the hub, not at an invisible floor.
  for (const x of [-5.5, 5.5]) {
    beam(`hub-leg-${x}`, [x, -.6, -5.5], [x, 2.8, -5.5], .27, .3, 'mount');
  }
  beam('hub-under-cross', [-5.5, -.45, -5.5], [5.5, -.45, -5.5], .22, .24, 'beam');
  beam('hub-under-diagonal-left', [-5.5, 2.8, -5.5], [0, -.45, -5.5], .17, .2, 'beam');
  beam('hub-under-diagonal-right', [0, -.45, -5.5], [5.5, 2.8, -5.5], .17, .2, 'beam');
  for (const [id, x, tip] of [['left', -6.5, 8.5], ['right', 6.5, 11.5]]) {
    // A slim bottom spine attaches along its entire length to the gallery's underside.
    box(`${id}-bottom-spine`, [x, 3.1, (tip - 4.2) / 2], [.35, .28, tip + 4.2], 'under');
    box(`${id}-roof-channel`, [x, 6.835, (tip - 3.8) / 2], [1.5, .07, tip + 2.8], 'dark');
    for (const z of [-4.5, tip - .55]) box(`${id}-beacon-${z}`, [x, z < -4 ? 7.93 : 6.93, z], [.12, .26, .12], 'red');
  }
  box('hub-door-lamp', [0, 6.61, -3.255], [1.25, .12, .09], 'warm');
  model.opening = {min: [-3.8, -.8, -.8], max: [3.8, 8.2, 12]};
  model.branches = ['left-gallery', 'right-gallery'];
  model.hub = 'rear-hub';
  return model;
}
