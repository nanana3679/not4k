import { cameraAt, makeLights, scenarios } from '../../../../output/prototypes/flight-background-preview-20260913/approach/motion.mjs';
import { liftoffBlend } from '../../../../output/prototypes/flight-background-preview-20260913/approach/runway.mjs';
import { createApproachLightFrames } from '../../../../output/prototypes/flight-background-preview-20260913/approach/game-light-frame.mjs';
import { dimSky } from '../../../../output/prototypes/flight-background-preview-20260913/approach/sky-lighting.mjs';
import { createGpuLightLayer, hexRgb } from '../../../../output/prototypes/flight-background-preview-20260913/approach/gpu-light-batch.mjs';
import { proceduralTrailGlowAlpha } from '../../../../output/prototypes/flight-background-preview-20260913/approach/procedural-trails.mjs';
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
  const speed = approachSpeed[scenario];
  // 게임 프레임마다 배열·객체를 새로 만들지 않도록 광원 버퍼와 그리기 옵션을 한 번만 만들고 다시 쓴다.
  const lightFrames = createApproachLightFrames(scenario, lights);
  const groundOptions = { view: null, travel: 0, backdrop: hexRgb(scene.backdrop), runwayAlpha: 0 };
  const drawOptions = { lights: null, trails: null, rgb, core: hexRgb(scene.core), trailStrength: scene.strength,
    trailGlowAlpha: proceduralTrailGlowAlpha('gpu'), ground: groundOptions };
  const glowStops = [`rgba(${scene.rgb},0)`, `rgba(${scene.rgb},.13)`, `rgba(${scene.rgb},0)`];
  // 지평선 광택은 지평선 위치가 같으면 같은 그라디언트를 다시 쓴다.
  let glow = null, glowHorizon = NaN;
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
        if (view.horizon !== glowHorizon) {
          glow = ctx.createLinearGradient(0, view.horizon - 12, 0, view.horizon + 30);
          glow.addColorStop(0, glowStops[0]);
          glow.addColorStop(.30, glowStops[1]);
          glow.addColorStop(1, glowStops[2]);
          glowHorizon = view.horizon;
        }
        ctx.fillStyle = glow;
        ctx.fillRect(0, view.horizon - 12, width, 42);
      }
      if (scenario === 'liftoff') dimSky(ctx, view);
      const frame = lightFrames.build(travel, view, altitude);
      drawOptions.lights = frame.lights;
      drawOptions.trails = frame.trails;
      groundOptions.view = view;
      groundOptions.travel = travel;
      // liftoffLighting(altitude).ground와 같은 식이다. 매 프레임 조명 객체를 만들지 않으려고 직접 계산한다.
      groundOptions.runwayAlpha = scenario === 'liftoff' ? .68 - .40 * liftoffBlend(altitude) : 0;
      gpu.draw(drawOptions);
      const { dataset } = container;
      dataset.travel = String(travel);
      dataset.time = String(time);
      dataset.pitch = String(view.pitchDegrees);
      dataset.lights = String(frame.lights.length);
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
