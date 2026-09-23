import * as THREE from '../../../../output/prototypes/breakthrough-hangar-integration-20260910/vendor/three.module.js';
import { readSettings, scenePyramid, matchCamera, lightLayout, collectFaces, travelAt } from '../../../../output/prototypes/breakthrough-hangar-integration-20260910/integration.mjs';
import { viewAt, advanceMotion } from '../../../../output/prototypes/breakthrough-hangar-integration-20260910/legacy/geometry.mjs';
import { LightBatch } from '../../../../output/prototypes/breakthrough-hangar-integration-20260910/light-batch.mjs';
import { advanceTrails, trailAlpha } from '../../../../output/prototypes/breakthrough-hangar-integration-20260910/world-trails.mjs';
import { createPaintedBackdrop, advanceBackdropPhase } from '../../../../output/prototypes/breakthrough-hangar-integration-20260910/painted-backdrop.mjs';
import { breakthroughSearch } from '../../../../output/prototypes/flight-background-preview-20260913/flight-presets.mjs';

const backdropUrl = new URL('../../../../output/imagegen/distant-architecture-backdrop-20260910/distant-architecture.png', import.meta.url).href;

export async function createBreakthroughBackground({ container, width, height, resolution }) {
  const texture = await new THREE.TextureLoader().loadAsync(backdropUrl);
  texture.colorSpace = THREE.SRGBColorSpace;
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
  container.append(canvas);
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); }
  catch (error) { texture.dispose(); canvas.remove(); throw error; }
  renderer.setPixelRatio(Math.min(1.5, Math.max(.5, resolution)));
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  scene.background = new THREE.Color('#080e1b');
  const backdrop = createPaintedBackdrop(texture);
  scene.add(backdrop.mesh);
  const core = new LightBatch(), halo = new LightBatch(true), after = new LightBatch(true);
  for (const [batch, order] of [[after, 1], [halo, 2], [core, 3]]) {
    batch.mesh.renderOrder = order;
    scene.add(batch.mesh);
  }
  let state, motion, lights, previous, trails, disposed = false;
  const drawingSize = renderer.getDrawingBufferSize(new THREE.Vector2());
  function reset() {
    state = readSettings(breakthroughSearch);
    motion = { travel: travelAt(state.progress, scenePyramid(state)), time: 0, noteTime: 0 };
    lights = lightLayout(state);
    previous = []; trails = [];
  }
  reset();
  return {
    render(altitude, dt) {
      if (disposed) return;
      state.altitude = altitude;
      const oldTravel = motion.travel;
      motion = advanceMotion(motion, dt, state.speed, true);
      state.backdropPhase = advanceBackdropPhase(state.backdropPhase, motion.travel - oldTravel, state.backdropRate);
      const pyramid = scenePyramid(state), view = viewAt(width, height, altitude, pyramid);
      matchCamera(camera, view);
      backdrop.update(state, view, drawingSize);
      const faces = collectFaces(lights, motion.travel, state, pyramid, view);
      trails = advanceTrails(trails, previous, faces, motion.time, state.trail, dt);
      previous = faces;
      core.begin(); halo.begin(); after.begin();
      for (const face of trails) after.face(face, view, trailAlpha(face, motion.time, state.trail));
      for (const face of faces) {
        core.face(face, view);
        halo.face(face, view, face.alpha * .07, 3);
        halo.face(face, view, face.alpha * .025, 8);
      }
      core.end(); halo.end(); after.end();
      renderer.render(scene, camera);
      Object.assign(container.dataset, { travel: String(motion.travel), time: String(motion.time), lights: String(faces.length) });
    },
    reset,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const batch of [core, halo, after]) batch.dispose();
      backdrop.mesh.geometry.dispose();
      backdrop.mesh.material.dispose();
      texture.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
