import { cameraAt, makeLights, scenarios, visibleLights } from '../../../../output/prototypes/flight-background-preview-20260913/approach/motion.mjs';
import { liftoffLighting, liftoffObjectLights, visibleRunwayLights } from '../../../../output/prototypes/flight-background-preview-20260913/approach/runway.mjs';
import { dimSky } from '../../../../output/prototypes/flight-background-preview-20260913/approach/sky-lighting.mjs';
import { createGpuLightLayer, hexRgb } from '../../../../output/prototypes/flight-background-preview-20260913/approach/gpu-light-batch.mjs';
import { proceduralTrailGlowAlpha, proceduralTrailSegments } from '../../../../output/prototypes/flight-background-preview-20260913/approach/procedural-trails.mjs';
import { renderQualityProfile } from '../../../../output/prototypes/flight-background-preview-20260913/approach/render-quality.mjs';
import { heightMode } from '../../../../output/prototypes/flight-background-preview-20260913/approach/height.mjs';
import { layoutMode } from '../../../../output/prototypes/flight-background-preview-20260913/approach/flow.mjs';
import { approachSpeed } from '../../../../output/prototypes/flight-background-preview-20260913/flight-presets.mjs';

const groundUrl = new URL('../../../../output/prototypes/flight-background-preview-20260913/approach/ground.png', import.meta.url).href;
const skyUrls = {
  liftoff: new URL('../../../../output/prototypes/flight-background-preview-20260913/approach/sky.png', import.meta.url).href,
  infiltration: new URL('../../../../output/prototypes/flight-background-preview-20260913/approach/sky-infiltration.png', import.meta.url).href,
};

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('비행 배경 이미지를 불러오지 못했습니다.'));
    image.src = url;
  });
}

export async function createApproachBackground({ container, scenario, width, height, resolution }) {
  const [ground, sky] = await Promise.all([loadImage(groundUrl), loadImage(skyUrls[scenario])]);
  const canvas = document.createElement('canvas');
  const lightsCanvas = document.createElement('canvas');
  for (const element of [canvas, lightsCanvas]) {
    Object.assign(element.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    container.append(element);
  }
  const dpr = Math.min(1.5, Math.max(.5, resolution));
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d', { alpha: false });
  const gpu = createGpuLightLayer(lightsCanvas);
  if (!ctx || !gpu.available) { gpu.dispose(); throw new Error('비행 배경을 위한 WebGL을 초기화하지 못했습니다.'); }
  gpu.resize(width, height, dpr);
  gpu.setGround(ground);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const scene = scenarios[scenario], heights = heightMode(null), layout = layoutMode(null);
  const lights = makeLights(scenario, heights, layout), rgb = scene.rgb.split(',').map(Number);
  const speed = approachSpeed[scenario], profile = renderQualityProfile('gpu');
  let travel = 130, time = 0, disposed = false;

  return {
    render(altitude, dt) {
      if (disposed) return;
      time += dt;
      travel += dt * scene.speed * speed;
      const view = cameraAt(scenario, altitude, width, height, speed, heights);
      ctx.fillStyle = scene.backdrop;
      ctx.fillRect(0, 0, width, height);
      if (view.horizon > 0 && view.showSky) {
        const skyHeight = height * .40;
        ctx.globalAlpha = .82;
        ctx.drawImage(sky, 0, 0, sky.width, sky.height, 0, view.horizon - skyHeight, width, skyHeight + 2);
        ctx.globalAlpha = 1;
        const glow = ctx.createLinearGradient(0, view.horizon - 12, 0, view.horizon + 30);
        glow.addColorStop(0, `rgba(${scene.rgb},0)`);
        glow.addColorStop(.30, `rgba(${scene.rgb},.13)`);
        glow.addColorStop(1, `rgba(${scene.rgb},0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(0, view.horizon - 12, width, 42);
      }
      if (scenario === 'liftoff') dimSky(ctx, view);
      const objects = visibleLights(lights, travel, view, 'surface', {
        palette: scenario, scenario, seed: 42, scale: 1, secondary: .15, quality: 'gpu',
      });
      const current = scenario === 'liftoff'
        ? [...liftoffObjectLights(objects, altitude), ...visibleRunwayLights(travel, view, undefined, 'gpu')]
        : objects;
      const trails = proceduralTrailSegments(current, view, { altitude, maxSegments: profile.maxTrailSegments });
      gpu.draw({ lights: current, trails, rgb, core: hexRgb(scene.core), trailStrength: scene.strength,
        trailGlowAlpha: proceduralTrailGlowAlpha('gpu'),
        ground: { view, travel, backdrop: hexRgb(scene.backdrop), runwayAlpha: scenario === 'liftoff' ? liftoffLighting(altitude).ground : 0 },
      });
      Object.assign(container.dataset, { travel: String(travel), time: String(time), pitch: String(view.pitchDegrees), lights: String(current.length) });
    },
    reset() { travel = 130; time = 0; },
    dispose() {
      if (disposed) return;
      disposed = true;
      gpu.dispose();
      canvas.remove();
      lightsCanvas.remove();
    },
  };
}
