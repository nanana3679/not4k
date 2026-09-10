// PROTOTYPE: separated service casings connected by a narrow vertical structure.
import {createBuilder, chamfer} from '../blueprint-kit.mjs';

export const metadata = Object.freeze({
  id: 'C',
  name: '수직 설비탑',
  description: '긴 상부 설비함과 작은 하부 정비실 사이로 열린 골조가 드러나는 수직 모듈이다.',
  kind: 'small',
  reference: '03-small-far-low.png',
});

export function createBlueprint() {
  const {model, box, beam, panel, prism} = createBuilder();
  prism('upper-casing', chamfer(1.2, 12, 6.2, 20, .3), 1.7, -2.8, 'hull');
  prism('lower-casing', chamfer(1.2, 0, 6.4, 6.6, .35), 2.7, -2.6, 'hull');
  box('backbone', [.85, 10, -1.9], [.9, 20, 1.2], 'mount');
  box('side-equipment', [6.65, 3.1, -.4], [.8, 3.8, 3.7], 'side');

  // The gap between the casings remains empty in front of the structural frame.
  for (const x of [2, 5.5]) {
    beam(`spine-column-${x}`, [x, 6.4, -1.7], [x, 12.2, -1.7], .28, .35, 'beam');
  }
  beam('spine-cross', [2, 9.25, -1.7], [5.5, 9.25, -1.7], .16, .2, 'rail');
  beam('spine-diagonal-lower', [2, 6.45, -1.7], [5.5, 9.25, -1.7], .14, .2, 'rail');
  beam('spine-diagonal-upper', [5.5, 9.25, -1.7], [2, 12.1, -1.7], .14, .2, 'rail');

  // A human-size entrance and landing make the elongated silhouette readable.
  box('lower-landing', [4.55, 2.15, 3.95], [6.9, .3, 2.5], 'side');
  panel('lower-door', 2, 2.32, 2.735, 1.6, 2.8, 'door');
  panel('lower-window', 4.2, 3.25, 2.735, 1.65, 1.35, 'window');
  for (const x of [1.3, 3.45, 5.6, 7.8]) {
    beam(`lower-post-front-${x}`, [x, 2.3, 5.08], [x, 3.3, 5.08], .065, .065, 'rail');
  }
  for (const x of [1.3, 7.8]) {
    beam(`lower-post-rear-${x}`, [x, 2.3, 2.8], [x, 3.3, 2.8], .065, .065, 'rail');
    for (const y of [2.8, 3.3]) beam(`lower-side-rail-${x}-${y}`, [x, y, 2.8], [x, y, 5.08], .065, .065, 'rail');
  }
  for (const y of [2.8, 3.3]) beam(`lower-front-rail-${y}`, [1.3, y, 5.08], [7.8, y, 5.08], .065, .065, 'rail');
  for (const x of [2, 6.3]) beam(`landing-brace-${x}`, [x, .6, 1.3], [x, 2, 4.85], .18, .22, 'under');

  box('upper-landing', [2.95, 13.1, 2.35], [3.1, .25, 1.5], 'side');
  panel('upper-door', 2.15, 13.24, 1.735, 1.6, 2.8, 'door');
  for (const x of [1.5, 4.4]) beam(`upper-post-${x}`, [x, 13.225, 3], [x, 14.225, 3], .065, .065, 'rail');
  for (const y of [13.725, 14.225]) beam(`upper-rail-${y}`, [1.5, y, 3], [4.4, y, 3], .065, .065, 'rail');
  for (const x of [1.6, 4.3]) beam(`upper-landing-brace-${x}`, [x, 12.3, 1.55], [x, 12.975, 2.9], .1, .14, 'under');

  // One vertical warm inset distinguishes this from the horizontal deck module.
  box('upper-light-recess', [5.72, 16, 1.73], [.2, 5.6, .06], 'dark');
  box('upper-light', [5.72, 16, 1.77], [.055, 5.15, .04], 'warm');
  box('landing-lamp', [7.7, 2.37, 3.9], [.1, .14, .42], 'warm');
  box('top-beacon', [5.6, 20.1, -.8], [.12, .2, .12], 'red');
  box('bottom-beacon', [1.28, .5, 2.72], [.12, .14, .08], 'red');
  beam('short-roof-aerial', [1.8, 20, -1.5], [1.8, 20.9, -1.5], .06, .06, 'rail');
  model.openShaft = {x: [2.4, 5.0], y: [7, 11.6], z: [-.8, 1.6]};
  model.scaleCue = {door: [1.6, 2.8], railingHeight: 1};
  return model;
}
