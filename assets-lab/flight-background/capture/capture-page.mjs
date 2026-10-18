// Browser side of the in-game layer capture (served by the Vite dev server, driven by capture-layers.mjs).
// Builds the real GameRenderer with the Classic skin, the gear and the Gear Lab demo chart, replays the demo
// judgments up to one moment, and exposes window.__layerCapture so the driver can show one layer group at a time.
import { GameRenderer } from '/src/game/renderer/index.ts';
import { GAME_HEIGHT } from '/src/game/renderer/constants.ts';
import { SkinManager } from '/src/game/skin/index.ts';
import { createChartTiming, JudgmentGrade } from '/src/shared/index.ts';
import { GEAR_PREVIEW_KEYBOARDS, GEAR_PREVIEW_STAGE_WIDTH } from '/src/lab/gearPreview.ts';
import {
  buildGearPreviewDemo,
  buildGearPreviewSchedule,
  initialGearPreviewLoopState,
  stepGearPreviewLoop,
} from '/src/lab/gearPreviewChart.ts';

const STAGE_PX = { width: 1920, height: 1080 };
const SCROLL_SPEED = 800; // same as /lab/gear
const FRAME_MS = 1000 / 60;
// Only the last second is drawn frame by frame: drawing every frame of the replay (flight background included)
// takes minutes under SwiftShader, and the earlier frames only matter through the judgment events.
const DRAWN_REPLAY_MS = 1000;

// Layer groups by GameRenderer field name (z-order bottom to top). The fields are private in TypeScript, so a
// rename must fail loudly here instead of silently capturing an empty layer.
export const LAYER_GROUPS = {
  lanes: ['backgroundLayer', 'judgmentLineGraphic', 'laneKeyLabelLayer'],
  notes: ['laneContentLayer'],
  gear: ['gearLayer'],
  hud: ['effectLayer', 'uiLayer'],
};

const params = new URLSearchParams(location.search);
const label = params.get('label') ?? 'LIFTOFF';
const captureMs = Number(params.get('ms') ?? 8800);

async function loadFonts() {
  await Promise.race([
    Promise.allSettled([
      document.fonts.load("120px 'Alumni Sans Collegiate One'"),
      document.fonts.load("20px 'Zen Dots'"),
      document.fonts.load("bold 22px Audiowide"),
    ]),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
}

async function start() {
  await loadFonts();
  const skin = new SkinManager();
  await skin.loadSkin('classic');
  const canvas = document.getElementById('game');
  const renderer = new GameRenderer({
    canvas,
    width: GEAR_PREVIEW_STAGE_WIDTH,
    height: GAME_HEIGHT,
    resolution: STAGE_PX.height / GAME_HEIGHT,
    skinManager: skin,
    difficultyLabel: label,
    showFlightBackground: true,
  });
  await renderer.init();

  const demo = buildGearPreviewDemo();
  const schedule = buildGearPreviewSchedule(demo.hits);
  renderer.setChart(
    demo.chart.notes, demo.chart.trillZones, demo.chart.restZones ?? [], demo.chart.events,
    createChartTiming(demo.chart), demo.durationMs,
  );
  renderer.scrollSpeed = SCROLL_SPEED;
  renderer.updateAccuracy(100);
  renderer.setupKeyboardDisplay(new Map(GEAR_PREVIEW_KEYBOARDS.tkl.bindings));

  // Replay the demo the way GearPage's loop does, one 60 fps frame at a time, so judgment text, key beams and
  // gearMotion are mid-animation at captureMs like a real frame. Bombs play on Pixi's wall-clock Ticker.shared,
  // which this synchronous replay never advances, so they are added afterwards and frozen at their frame.
  let state = initialGearPreviewLoopState();
  const beams = [false, false, false, false];
  const recentHits = [];
  const bombDurationMs = skin.getTheme().bombDurationMs;
  for (let songMs = 0; songMs <= captureMs; songMs += FRAME_MS) {
    const step = stepGearPreviewLoop(schedule, state, songMs);
    for (const event of step.events) {
      if (event.type === 'hit') {
        if (captureMs - event.atMs < bombDurationMs) recentHits.push(event);
        renderer.showJudgment(JudgmentGrade.PERFECT, 0);
      } else if (event.type === 'processed') {
        renderer.applyNoteDisplayEffect(event.index, { body: null, visibility: 'processed' });
      } else {
        renderer.applyNoteDisplayEffect(event.index, { body: 'failed', visibility: 'missed' });
        renderer.showJudgment(JudgmentGrade.MISS);
      }
    }
    if (step.state.combo !== state.combo) renderer.updateCombo(step.state.combo);
    state = step.state;
    step.beamLanes.forEach((on, index) => {
      if (beams[index] === on) return;
      beams[index] = on;
      renderer.setKeyBeam(index + 1, on);
    });
    if (captureMs - songMs <= DRAWN_REPLAY_MS) renderer.renderFrame(songMs, FRAME_MS);
  }
  const bombFrames = skin.getBombTextures().length;
  for (const hit of recentHits) {
    renderer.showBombEffect(hit.lane);
    const bomb = renderer.effectLayer.children.at(-1);
    const frame = Math.floor(((captureMs - hit.atMs) / bombDurationMs) * bombFrames);
    bomb.gotoAndStop(Math.min(bombFrames - 1, frame));
  }

  const fields = Object.fromEntries(Object.entries(LAYER_GROUPS).map(([group, names]) => [group, names.map((name) => {
    const layer = renderer[name];
    if (!layer || typeof layer.visible !== 'boolean') throw new Error(`GameRenderer.${name} is not a display object`);
    return layer;
  })]));
  const flightBackground = document.querySelector('[data-flight-background]');
  if (!flightBackground) throw new Error('flight background element not found');

  window.__layerCapture = {
    groups: Object.keys(LAYER_GROUPS),
    /** Show only the given layer groups (and the flight background if asked), then redraw the frozen moment. */
    show({ background, groups }) {
      flightBackground.style.visibility = background ? 'visible' : 'hidden';
      canvas.style.visibility = groups.length > 0 ? 'visible' : 'hidden';
      for (const [group, layers] of Object.entries(fields)) {
        for (const layer of layers) layer.visible = groups.includes(group);
      }
      // deltaMs 0 keeps every animation where the replay left it.
      renderer.renderFrame(captureMs, 0);
    },
  };
  document.body.dataset.captureReady = 'true';
}

start().catch((error) => {
  console.error(error);
  document.body.dataset.captureError = String(error?.message ?? error);
});
