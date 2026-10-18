// PROTOTYPE H: a connected asymmetric plan around one tall logistics hub.
import {createBuilder, chamfer} from '../blueprint-kit.mjs';

export const metadata = Object.freeze({
  id: 'H',
  name: '분기형 물류 기지',
  description: '수직 허브에서 넓은 적재동과 길고 짧은 연결 팔이 갈라지며 사이로 허공이 드러나는 물류 기지.',
  kind: 'large',
  reference: '08-large-far-high.png',
});

// Rotate a closed prism into the XZ plane. Every output remains ordinary fixed
// vertices/faces, so the shared renderer needs no new primitive or animation.
function deckPrism(builder, id, footprint, bottom, top) {
  const vertexStart = builder.model.vertices.length;
  const faceStart = builder.model.faces.length;
  builder.prism(id, footprint.map(([x, z]) => [x, -z]).reverse(), top, bottom);
  for (const p of builder.model.vertices.slice(vertexStart)) {
    const previousY = p[1];
    p[1] = p[2];
    p[2] = -previousY;
  }
  for (const f of builder.model.faces.slice(faceStart)) {
    f.tone = f.id.endsWith('/front') ? 'roof' : f.id.endsWith('/back') ? 'soffit' : 'hull';
  }
  const solid = builder.model.solids.at(-1);
  solid.bounds = {
    min: [0, 1, 2].map(i => Math.min(...solid.vertices.map(p => p[i]))),
    max: [0, 1, 2].map(i => Math.max(...solid.vertices.map(p => p[i]))),
  };
}

export function createBlueprint() {
  const b = createBuilder();
  const {model, box, beam, panel, prism} = b;

  // The main hub physically intersects every branch at a different level.
  prism('central-hub', chamfer(-8, -7, 8, 25, 1), 8, -8);
  box('hub-keel', [0, -10.25, 0], [10, 7.5, 10], 'hull');
  box('main-stack', [-2.9, 28.75, .5], [4.2, 8.5, 7], 'hull');
  box('secondary-stack', [3.75, 27, -.25], [3.5, 5, 4.5], 'hull');

  // Left is a broad loading terminal; right is a long slender transfer arm.
  deckPrism(b, 'loading-terminal', chamfer(-34, -11, -6.5, 14, 3), 8, 18.5);
  deckPrism(b, 'east-transfer-arm', [[6.5, -3], [34, -3], [37, -1], [37, 4], [34.5, 6], [6.5, 6]], 13, 20);
  // The front arm changes width and the rear spur is noticeably shorter.
  deckPrism(b, 'front-dispatch-arm', [[-2, 6.5], [7, 6.5], [12, 21], [9.5, 27], [2, 27], [-2, 18]], 9, 16);
  deckPrism(b, 'rear-service-spur', [[-5, -7], [-5, -17], [-3, -19], [1.5, -19], [4, -17], [4, -7]], 17, 22);

  // The loading opening has actual depth. Two lower cheek walls and a roof
  // extension leave an entrance between them rather than a painted black hole.
  box('loading-left-cheek', [-29.5, 12.7, 15.9], [3, 9.4, 4.2], 'hull');
  box('loading-right-cheek', [-12.5, 12.7, 15.9], [3, 9.4, 4.2], 'hull');
  box('loading-entrance-roof', [-21, 17.9, 16], [20, 1.2, 4.5], 'hull');
  box('loading-platform', [-21, 8.3, 16.5], [20, .6, 6], 'side');
  panel('loading-bay-interior', -27.8, 10, 14.045, 13.6, 4.9, 'window');
  for (const x of [-27, -15]) {
    box(`loading-entrance-lamp-${x}`, [x, 17.2, 16.5], [1.4, .12, .28], 'warm');
  }

  // Long façade light strips stay sparse; one small door remains human-sized.
  panel('east-window-strip', 12, 15.9, 6.04, 18, .8, 'window');
  panel('front-window-strip', 3.2, 11.4, 27.04, 5, .9, 'window');
  panel('hub-window-strip', -5.5, 20.9, 8.045, 5.5, 1, 'window');
  panel('hub-service-door', 2, 17.4, 8.045, 1.6, 2.8, 'door');
  box('hub-service-landing', [2.8, 17.28, 9.1], [3.5, .24, 2.3], 'side');
  beam('hub-service-rail', [1.1, 18.4, 10.2], [4.5, 18.4, 10.2], .08, .08, 'rail');
  for (const x of [1.1, 4.5]) beam(`hub-service-post-${x}`, [x, 17.4, 10.2], [x, 18.4, 10.2], .08, .08, 'rail');

  // Structural brackets root the cantilevers in the central tower.
  beam('east-cantilever-brace', [6.5, 1, 1.5], [24, 13, 1.5], 1.1, 1.2, 'beam');
  beam('loading-cantilever-brace', [-6.5, -1, 0], [-26, 8, 0], 1.1, 1.2, 'beam');
  beam('front-cantilever-brace', [2, -2, 6.5], [6, 9, 21], .9, 1.1, 'beam');
  beam('rear-cantilever-brace', [0, 3, -6.5], [0, 17, -17], .8, 1, 'beam');
  for (const x of [-6.5, 6.5]) box(`hub-armour-rib-${x}`, [x, 8.6, 8.28], [.7, 27, .6], 'side');
  for (const x of [17, 30]) box(`east-arm-rib-${x}`, [x, 16.5, 6.2], [.55, 7, .5], 'side');

  // Roof structures follow each branch, leaving broad calm plates between them.
  for (const [id, p, size] of [
    ['loading', [-24, 19.2, -3], [6, 1.4, 3.5]],
    ['east-near', [16, 20.6, .4], [3.2, 1.2, 2]],
    ['east-end', [31, 20.45, .4], [2.2, .9, 2]],
    ['dispatch', [5.8, 16.6, 20], [3, 1.2, 3.2]],
    ['rear', [-.5, 22.4, -15], [2, .8, 2]],
  ]) box(`roof-plant-${id}`, p, size, 'side');
  box('loading-roof-seam', [-22, 18.55, 4], [19, .1, .12], 'dark');
  box('east-roof-seam', [21, 20.055, -1.2], [25, .11, .12], 'dark');
  for (const [id, x, y, z] of [
    ['hub', -3, 33, .5], ['east', 35, 20, 1.5],
    ['dispatch', 6, 16, 25], ['loading', -30, 18.5, -5],
  ]) {
    beam(`aerial-${id}`, [x, y, z], [x, y + 1.8, z], .12, .12, 'beam');
    box(`beacon-${id}`, [x, y + 1.87, z], [.16, .14, .16], 'red');
  }

  model.branches = [
    {id: 'loading-terminal', direction: 'west', footprint: [-34, -6.5, -11, 14]},
    {id: 'east-transfer-arm', direction: 'east', footprint: [6.5, 37, -3, 6]},
    {id: 'front-dispatch-arm', direction: 'front', footprint: [-2, 12, 6.5, 27]},
    {id: 'rear-service-spur', direction: 'rear', footprint: [-5, 4, -19, -7]},
  ];
  model.structureConnections = model.branches.map(branch => ['central-hub', branch.id]);
  model.loadingOpening = {min: [-28, 8.6, 14.1], max: [-14, 17.25, 17.8]};
  return model;
}
