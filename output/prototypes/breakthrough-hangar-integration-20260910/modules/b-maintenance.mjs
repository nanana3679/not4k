// PROTOTYPE: a bent maintenance deck, with a real open corner and underside braces.
import {createBuilder, chamfer} from '../blueprint-kit.mjs';

export const metadata = Object.freeze({
  id: 'B',
  name: 'ㄱ자 정비 데크',
  description: '작은 정비실에서 꺾여 뻗는 데크와 그 아래의 사선 지지대가 열린 모서리를 둘러싼다.',
  kind: 'small',
  reference: '02-small-near-high.png',
});

export function createBlueprint() {
  const {model, box, beam, panel, prism} = createBuilder();

  // Two slabs form an L in plan. The missing quadrant stays empty at every height.
  box('deck-long-arm', [2.4, 4.475, 0], [4.8, .75, 12], 'hull');
  box('deck-cross-arm', [10.4, 4.475, -4], [11.2, .75, 4], 'hull');
  box('mounting-root', [1.8, 2.1, -4.1], [2.8, 4.2, 3.2], 'mount');
  beam('support-cross-arm', [1.8, .7, -4], [14.5, 4.1, -4], .52, .65, 'under');
  beam('support-long-arm', [1.8, .8, -3.2], [2.4, 4.1, 5.5], .42, .58, 'under');

  // A compact cabin at the elbow, not a roof covering the deck opening.
  prism('maintenance-cabin', chamfer(.1, 4.85, 4.5, 9.15, .22), -2.05, -5.8, 'hull');
  panel('cabin-door', 2.45, 4.9, -2.015, 1.6, 2.8, 'door');
  panel('cabin-window', .55, 6.05, -2.015, 1.55, 1.35, 'window');
  box('roof-equipment', [1.4, 9.35, -4.4], [1.2, .4, 1.3], 'side');
  beam('roof-aerial', [3.5, 9.05, -4.8], [3.5, 10.15, -4.8], .085, .085, 'rail');
  box('roof-beacon', [3.5, 10.2, -4.8], [.12, .12, .12], 'red');
  box('equipment-crate', [1.0, 5.3, -.8], [1.3, .9, 1.2], 'side');

  // The guard rail follows the actual outer and inner L-shaped edges.
  const segments = [
    ['outer-long', [.18, -1.7], [.18, 5.8], 3],
    ['front-end', [.18, 5.8], [4.6, 5.8], 2],
    ['inner-long', [4.6, 5.8], [4.6, -1.8], 3],
    ['inner-cross', [4.9, -1.8], [15.8, -1.8], 3],
    ['outer-cross', [5, -5.8], [15.8, -5.8], 3],
    ['outer-end', [15.8, -5.8], [15.8, -1.8], 2],
  ];
  const posts = new Set();
  for (const [id, a, b, count] of segments) {
    for (const y of [5.35, 5.85]) {
      beam(`rail-${id}-${y}`, [a[0], y, a[1]], [b[0], y, b[1]], .065, .065, 'rail');
    }
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const x = a[0] + (b[0] - a[0]) * t;
      const z = a[1] + (b[1] - a[1]) * t;
      const key = `${x.toFixed(2)},${z.toFixed(2)}`;
      if (posts.has(key)) continue;
      posts.add(key);
      beam(`rail-post-${key}`, [x, 4.85, z], [x, 5.85, z], .065, .065, 'rail');
    }
  }
  // Small practical fixtures, rather than a continuous luminous border.
  for (const [i, x, z] of [[0, .35, 2], [1, 8, -5.7], [2, 14, -2.3]]) {
    box(`deck-lamp-${i}`, [x, 4.885, z], [.5, .07, .16], 'warm');
  }
  box('tip-warning', [15.9, 4.54, -1.97], [.08, .13, .04], 'red');
  model.openCorner = {x: [5.1, 15.5], z: [-1.4, 5.5]};
  model.scaleCue = {door: [1.6, 2.8], railingHeight: 1};
  return model;
}
