// PROTOTYPE: F is a horizontal open dock, not E's roofed vertical hangar.
import {createBuilder, chamfer} from '../blueprint-kit.mjs';

export const metadata = Object.freeze({
  id: 'F', name: '열린 도크', kind: 'large',
  description: '세 면의 거대한 건축과 계단형 접안부가 위와 앞이 열린 중정을 감싸는 도크.',
  reference: '06-large-near-high.png',
});

export function createBlueprint() {
  const b = createBuilder();
  const {model, prism, box, beam, panel} = b;
  prism('rear-dock', chamfer(-29, -4, 29, 32, 1), -8, -16);
  prism('left-dock', chamfer(-29, -4, -21, 30, .8), 16, -9);
  prism('right-dock', chamfer(21, -4, 29, 24, .8), 16, -9);

  // Three nested, connected lips make the scale readable without closing the void.
  box('left-dock-lip', [-18.5, -1, 2.8], [5, 1.4, 26.4], 'hull');
  box('right-dock-lip', [18.5, -1, 2.8], [5, 1.4, 26.4], 'hull');
  box('rear-dock-lip', [0, -1, -6], [42, 1.4, 4], 'hull');
  box('left-upper-step', [-20.05, 2, 2.8], [1.9, .8, 26.4], 'side');
  box('right-upper-step', [20.05, 2, 2.8], [1.9, .8, 26.4], 'side');

  // Small doors keep the dimensions of A/E; the building alone becomes enormous.
  for (const y of [4, 12, 20]) {
    box(`rear-gallery-${y}`, [0, y, -6.1], [42, .36, 3.8], 'side');
    beam(`rear-rail-${y}`, [-20.4, y + 1.18, -4.3], [20.4, y + 1.18, -4.3], .075, .075, 'rail');
    for (const x of [-20.4, 0, 20.4]) beam(`rear-post-${y}-${x}`, [x, y + .18, -4.3], [x, y + 1.18, -4.3], .075, .075, 'rail');
    for (const x of [-15.8, -.8, 14.2]) panel(`rear-door-${y}-${x}`, x, y + .18, -7.955, 1.6, 2.8, 'door');
    box(`rear-lamp-${y}`, [0, y + 3.3, -7.955], [2.3, .12, .09], 'warm');
  }
  for (const side of ['left', 'right']) {
    const sign = side === 'left' ? -1 : 1;
    for (const y of [8, 16]) {
      const x = sign * 19.65, railX = sign * 18.35, wallX = sign * 20.96;
      box(`${side}-gallery-${y}`, [x, y, 3], [2.7, .32, 22], 'side');
      beam(`${side}-rail-${y}`, [railX, y + 1.16, -7.5], [railX, y + 1.16, 13.5], .075, .075, 'rail');
      for (const z of [-7.5, 3, 13.5]) beam(`${side}-post-${y}-${z}`, [railX, y + .16, z], [railX, y + 1.16, z], .075, .075, 'rail');
      const p = side === 'left'
        ? [[wallX, y + 1.4, 6], [wallX, y + 1.4, -3], [wallX, y + 2.6, -3], [wallX, y + 2.6, 6]]
        : [[wallX, y + 1.4, -3], [wallX, y + 1.4, 6], [wallX, y + 2.6, 6], [wallX, y + 2.6, -3]];
      model.panels.push({id: `${side}-windows-${y}`, points: p, texture: 'window', uv: [[0, 0], [1, 0], [1, 1], [0, 1]]});
    }
  }
  panel('left-tip-window', -27.4, 22, 16.045, 4.8, 1.2, 'window');
  panel('right-tip-window', 22.6, 18, 16.045, 4.8, 1.2, 'window');

  // A single roof service block is attached; broad roofs retain the painted detail.
  box('roof-service-block', [-25, 31.05, -4], [4.2, 2.1, 5.8], 'hull');
  beam('roof-aerial', [-25, 32.1, -4], [-25, 34.4, -4], .13, .13, 'dark');
  box('roof-aerial-beacon', [-25, 34.4, -4], [.16, .22, .16], 'red');
  for (const [x, y] of [[-25, 30], [25, 24]]) box(`tip-beacon-${x}`, [x, y + .14, 14.9], [.16, .28, .16], 'red');
  model.opening = {min: [-15.8, -5, -3.9], max: [15.8, 36, 18]};
  model.rim = ['rear-dock', 'left-dock', 'right-dock'];
  return model;
}
