// Browser side of the in-game layer capture (served by the Vite dev server, driven by capture-layers.mjs).
// Builds the real GameRenderer with the Classic skin, the gear and the Gear Lab demo chart at a fixed altitude,
// replays the demo judgments up to one moment, and exposes window.__layerCapture so the driver can show one
// layer group at a time.
//
// Query: label (chart difficulty label, which picks the flight scenario; default LIFTOFF), altitude (0..1, default 1),
// ms (song time of the frozen frame, default 8800). See parseCaptureParams.
import { GameRenderer } from '/src/game/renderer/index.ts';
import { GAME_HEIGHT } from '/src/game/renderer/constants.ts';
import { GEAR_MOTION_MAX_STEP_MS } from '/src/game/renderer/GearMotionController.ts';
import { SkinManager } from '/src/game/skin/index.ts';
import { createChartTiming, JudgmentGrade } from '/src/shared/index.ts';
import { GEAR_PREVIEW_KEYBOARDS, GEAR_PREVIEW_STAGE_WIDTH } from '/src/lab/gearPreview.ts';
import {
  buildGearPreviewDemo,
  buildGearPreviewSchedule,
  initialGearPreviewLoopState,
  stepGearPreviewLoop,
} from '/src/lab/gearPreviewChart.ts';
import { assertGroupsCoverStage, DIFFICULTY_LABELS, parseCaptureParams, planReplay } from './capture-plan.mjs';

const CAPTURE_HEIGHT_PX = 1080;
const SCROLL_SPEED = 800; // same as /lab/gear
const FRAME_MS = 1000 / 60;
// The last second is drawn at 60 fps like the game. Before that the replay draws only as often as the animations
// need: gearMotion (GEAR_MOTION_MAX_STEP_MS) and the flight background (FlightBackground.render, which clamps to .05 s)
// each cap one renderFrame delta at 50 ms, so drawing at least every 50 ms keeps both elapsed times equal to the song
// time while skipping two thirds of the SwiftShader draws. If either cap changes, change MAX_DRAW_GAP_MS too.
const DRAWN_REPLAY_TAIL_MS = 1000;
const MAX_DRAW_GAP_MS = GEAR_MOTION_MAX_STEP_MS;
const FONT_TIMEOUT_MS = 10_000;
const GAME_FONTS = ["120px 'Alumni Sans Collegiate One'", "20px 'Zen Dots'", 'bold 22px Audiowide'];

// GameRenderer field names per capture group, bottom to top as GameRenderer.init() stacks them on the stage.
// The judgment line sits above the lane content, so the lanes are split into an under and an over group that the
// gallery stacks around the notes. The fields are private in TypeScript, so a rename fails loudly below instead of
// silently capturing an empty layer.
export const RENDERER_FIELDS_BY_GROUP = {
  lanes: ['backgroundLayer'],
  notes: ['laneContentLayer'],
  judgmentLine: ['judgmentLineGraphic', 'laneKeyLabelLayer'],
  gear: ['gearLayer'],
  hud: ['effectLayer', 'uiLayer'],
};

async function loadFonts() {
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('game fonts did not load in time')), FONT_TIMEOUT_MS));
  let facesPerFont;
  try {
    facesPerFont = await Promise.race([Promise.all(GAME_FONTS.map((font) => document.fonts.load(font))), timeout]);
  } catch (error) {
    throw new Error(`game fonts failed to load: ${error?.message ?? error}`);
  }
  // If the font stylesheet itself failed, load() finds no face and check() reports true for an undeclared family,
  // so require at least one loaded face per font; a fallback font would otherwise still capture "successfully".
  const missing = GAME_FONTS.filter((font, index) => {
    const faces = facesPerFont[index];
    return faces.length === 0 || faces.some((face) => face.status !== 'loaded');
  });
  if (missing.length > 0) throw new Error(`game fonts missing: ${missing.join(', ')}`);
}

async function start() {
  const demo = buildGearPreviewDemo();
  const { difficultyLabel, altitude, captureMs } = parseCaptureParams(location.search, {
    durationMs: demo.durationMs,
    difficultyLabels: DIFFICULTY_LABELS,
  });
  await loadFonts();
  const skin = new SkinManager();
  await skin.loadSkin('classic');
  const canvas = document.getElementById('game');
  const renderer = new GameRenderer({
    canvas,
    width: GEAR_PREVIEW_STAGE_WIDTH,
    height: GAME_HEIGHT,
    resolution: CAPTURE_HEIGHT_PX / GAME_HEIGHT,
    skinManager: skin,
    difficultyLabel,
    showFlightBackground: true,
  });
  await renderer.init();

  const schedule = buildGearPreviewSchedule(demo.hits);
  renderer.setChart(
    demo.chart.notes, demo.chart.trillZones, demo.chart.restZones ?? [], demo.chart.events,
    createChartTiming(demo.chart), demo.durationMs,
  );
  renderer.scrollSpeed = SCROLL_SPEED;
  renderer.updateAccuracy(100);
  renderer.setupKeyboardDisplay(new Map(GEAR_PREVIEW_KEYBOARDS.tkl.bindings));
  // Fixed altitude for both the flight background and the gear's glass gauges (same value, same frame).
  renderer.setAltitudeOverride(altitude);

  // Replay the demo the way GearPage's loop does: judgment events and key beams every 60 fps step, ending exactly
  // on captureMs. Bombs play on Pixi's wall-clock Ticker.shared, which this synchronous replay never advances, so
  // the bombs still playing at captureMs are added afterwards and frozen at their animation frame.
  let state = initialGearPreviewLoopState();
  const beams = [false, false, false, false];
  const hitsWithLiveBomb = [];
  const bombDurationMs = skin.getTheme().bombDurationMs;
  const steps = planReplay({ captureMs, frameMs: FRAME_MS, tailMs: DRAWN_REPLAY_TAIL_MS, maxDrawGapMs: MAX_DRAW_GAP_MS });
  for (const { songMs, drawDeltaMs } of steps) {
    const step = stepGearPreviewLoop(schedule, state, songMs);
    for (const event of step.events) {
      if (event.type === 'hit') {
        if (captureMs - event.atMs < bombDurationMs) hitsWithLiveBomb.push(event);
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
    if (drawDeltaMs !== null) renderer.renderFrame(songMs, drawDeltaMs);
  }
  const bombFrameCount = skin.getBombTextures().length;
  for (const hit of hitsWithLiveBomb) {
    renderer.showBombEffect(hit.lane);
    const bomb = renderer.effectLayer.children.at(-1);
    const frame = Math.floor(((captureMs - hit.atMs) / bombDurationMs) * bombFrameCount);
    bomb.gotoAndStop(Math.min(bombFrameCount - 1, frame));
  }

  const layersByGroup = Object.fromEntries(Object.entries(RENDERER_FIELDS_BY_GROUP).map(([group, names]) => [group, names.map((name) => {
    const layer = renderer[name];
    if (!layer || typeof layer.visible !== 'boolean') throw new Error(`GameRenderer.${name} is not a display object`);
    return layer;
  })]));
  // The lane-end clip is a mask (never drawn) and the tutorial keyboard is empty in this renderer.
  assertGroupsCoverStage({
    stage: renderer.app.stage,
    layersByGroup,
    mayStayOut: (child) => child === renderer.laneEndClip || (child === renderer.tutorialKeyboardLayer && child.children.length === 0),
  });
  const flightBackground = document.querySelector('[data-flight-background]');
  if (!flightBackground) throw new Error('flight background element not found');

  window.__layerCapture = {
    groups: Object.keys(RENDERER_FIELDS_BY_GROUP),
    /** Show only the given layer groups (and the flight background if asked), then redraw the frozen moment. */
    show({ background, groups }) {
      flightBackground.style.visibility = background ? 'visible' : 'hidden';
      canvas.style.visibility = groups.length > 0 ? 'visible' : 'hidden';
      for (const [group, layers] of Object.entries(layersByGroup)) {
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
