// PROTOTYPE G: a long open truss span connecting unequal equipment buildings.
import {createBuilder, chamfer} from '../blueprint-kit.mjs';

export const metadata = Object.freeze({
  id: 'G',
  name: '장거리 연결 시설',
  description: '큰 설비동과 작은 끝동 사이로 긴 삼각 트러스와 빈 경간이 이어지는 연결 시설.',
  kind: 'large',
  reference: '07-large-far-low.png',
});

export function createBlueprint() {
  const b = createBuilder();
  const {model, box, beam, panel, prism} = b;

  // The two terminals deliberately differ in mass, height and depth.
  prism('main-terminal', chamfer(-40, 4, -20, 19, .9), 11, -11);
  box('terminal-keel', [-28, 2.25, 0], [16, 4.5, 14], 'hull');
  box('terminal-roof-house', [-27.5, 19.9, 0], [9, 2.2, 12], 'hull');
  prism('small-terminal', chamfer(31, -.5, 40, 13, .6), 8, -8);

  // Both chords overlap the terminals. The middle remains genuinely hollow.
  box('upper-chord', [6, 10.8, 0], [54, 1.6, 11], 'hull');
  box('lower-chord', [6, 2.8, 0], [54, 1.1, 10], 'soffit');
  const span = {from: -21, to: 33, low: 3.35, high: 10, halfDepth: 5.2};
  for (const z of [-span.halfDepth, span.halfDepth]) {
    beam(`truss-top-${z}`, [span.from, span.high, z], [span.to, span.high, z], .42, .5);
    beam(`truss-bottom-${z}`, [span.from, span.low, z], [span.to, span.low, z], .42, .5);
    for (let i = 0; i < 9; i++) {
      const x = span.from + i * 6;
      beam(`truss-diagonal-${z}-${i}`,
        [x, i % 2 ? span.high : span.low, z],
        [x + 6, i % 2 ? span.low : span.high, z], .38, .46);
    }
  }
  for (const x of [-19, -1, 17, 31]) {
    beam(`cross-tie-${x}`, [x, 3.35, -5.2], [x, 3.35, 5.2], .3, .45);
  }

  // One narrow service walk lets the 54-unit span read at a human scale.
  box('span-service-walk', [6, 3.2, 6.1], [52, .2, 1.8], 'side');
  beam('span-service-rail', [-20, 4.3, 6.95], [32, 4.3, 6.95], .08, .08, 'rail');
  for (const x of [-20, -7, 6, 19, 32]) {
    beam(`span-rail-post-${x}`, [x, 3.3, 6.95], [x, 4.3, 6.95], .08, .08, 'rail');
  }
  for (const x of [-12, 6, 24]) {
    box(`span-amber-${x}`, [x, 9.96, 5.56], [1.5, .12, .16], 'warm');
  }

  // Fixed front paintings supply micro detail; no distance-dependent images.
  panel('main-window-upper', -37, 13.5, 11.04, 13, 1.05, 'window');
  panel('main-window-lower', -36, 8.8, 11.04, 10, .75, 'window');
  panel('end-window', 34, 8.7, 8.04, 3.5, .8, 'window');
  for (const [id, x, y, front] of [
    ['main', -30, 4.3, 11],
    ['end', 34.3, -.15, 8],
  ]) {
    panel(`${id}-door`, x, y, front + .045, 1.6, 2.8, 'door');
    box(`${id}-landing`, [x + .8, y - .12, front + 1.05], [3.4, .24, 2.2], 'side');
    beam(`${id}-landing-rail`, [x - .8, y + 1, front + 2.1], [x + 2.4, y + 1, front + 2.1], .08, .08, 'rail');
    for (const dx of [-.8, 2.4]) {
      beam(`${id}-landing-post-${dx}`, [x + dx, y, front + 2.1], [x + dx, y + 1, front + 2.1], .08, .08, 'rail');
    }
  }

  // A few large ribs and rooftop services, rather than hundreds of tiny parts.
  for (const x of [-39, -21]) {
    box(`main-rib-${x}`, [x, 11.3, 11.28], [.7, 13.3, .6], 'side');
    beam(`main-under-brace-${x}`, [x, 4.05, 8.5], [x + (x < -30 ? 3 : -3), 1.2, 5], .55, .65, 'beam');
  }
  for (const x of [32, 39]) box(`end-rib-${x}`, [x, 6.25, 8.2], [.5, 11.5, .5], 'side');
  for (const [x, roof] of [[-29, 21], [-23, 21], [36, 13]]) {
    box(`roof-service-${x}`, [x, roof + .4, -1], [1.6, .8, 2.6], 'dark');
    beam(`roof-aerial-${x}`, [x, roof + .8, -1], [x, roof + 2.9, -1], .14, .14, 'beam');
    box(`roof-beacon-${x}`, [x, roof + 2.98, -1], [.16, .16, .16], 'red');
  }

  model.span = span;
  model.openSpan = {min: [-19.5, 4.8, -4.4], max: [30.5, 9.1, 4.4]};
  model.structureConnections = [
    ['main-terminal', 'upper-chord'], ['upper-chord', 'small-terminal'],
    ['main-terminal', 'terminal-keel'], ['terminal-keel', 'lower-chord'],
    ['lower-chord', 'small-terminal'],
  ];
  return model;
}
