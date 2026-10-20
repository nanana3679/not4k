// Pure parts of the in-game layer capture, kept free of browser and renderer imports so Vitest can check them.

// Chart difficulty labels the capture accepts; each picks its flight scenario (resolveFlightScenario).
export const DIFFICULTY_LABELS = ['LIFTOFF', 'INFILTRATION', 'BREAKTHROUGH'];
// Altitude samples high / mid / low (docs/design/flight-concept.md compares one continuous space at these three).
export const ALTITUDE_BY_NAME = { high: 1, mid: 0.5, low: 0 };

// Three 1000/60 ms frames sum to 50.00000000000001 ms; without this slack every other draw would come one frame early.
const GAP_SLACK_MS = 1e-6;

/**
 * The replay steps up to captureMs: one step per 60 fps frame, the last one exactly on captureMs.
 * `drawDeltaMs` is the renderFrame delta for steps that draw and null for steps that only process judgment events.
 * Steps within `tailMs` of captureMs (and the last step) always draw. Earlier steps draw whenever waiting one more
 * frame would make the delta exceed `maxDrawGapMs`, so animations that clamp each delta to that value still advance
 * by the full song time.
 */
export function planReplay({ captureMs, frameMs, tailMs, maxDrawGapMs }) {
  const songTimes = [];
  for (let k = 0; k * frameMs < captureMs; k++) songTimes.push(k * frameMs);
  songTimes.push(captureMs);
  const steps = [];
  let previousMs = 0;
  let undrawnMs = 0;
  for (const songMs of songTimes) {
    undrawnMs += songMs - previousMs;
    previousMs = songMs;
    const draws = captureMs - songMs <= tailMs || songMs === captureMs || undrawnMs + frameMs > maxDrawGapMs + GAP_SLACK_MS;
    steps.push({ songMs, drawDeltaMs: draws ? undrawnMs : null });
    if (draws) undrawnMs = 0;
  }
  return steps;
}

/** Reads `label`, `altitude` and `ms` from a query string; throws on anything it would otherwise have to guess. */
export function parseCaptureParams(search, { durationMs, difficultyLabels }) {
  const params = new URLSearchParams(search);
  const number = (name, fallback) => {
    if (!params.has(name)) return fallback;
    const raw = params.get(name).trim();
    // Number('') is 0, so an empty value would silently capture altitude 0 or the first frame.
    return raw === '' ? Number.NaN : Number(raw);
  };
  const difficultyLabel = params.get('label') ?? difficultyLabels[0];
  const altitude = number('altitude', 1);
  const captureMs = number('ms', 8800);
  if (!difficultyLabels.includes(difficultyLabel)) throw new Error(`label must be one of ${difficultyLabels.join(', ')}, got ${difficultyLabel}`);
  if (!(altitude >= 0 && altitude <= 1)) throw new Error(`altitude must be within 0..1, got ${params.get('altitude')}`);
  if (!(captureMs >= 0 && captureMs <= durationMs)) throw new Error(`ms must be within 0..${durationMs}, got ${params.get('ms')}`);
  return { difficultyLabel, altitude, captureMs };
}

/**
 * Every stage child must sit in exactly one capture group, every grouped layer must be a direct stage child, and the
 * groups must follow the stage order. Otherwise an unlisted child would show up in every layer image, a layer nested
 * in another group would vanish, or the gallery would stack two layers the wrong way round.
 * `mayStayOut(child)` names the children allowed outside the groups (a mask, an empty container).
 */
export function assertGroupsCoverStage({ stage, layersByGroup, mayStayOut }) {
  const groupByLayer = new Map();
  for (const [group, layers] of Object.entries(layersByGroup)) {
    for (const layer of layers) {
      if (groupByLayer.has(layer)) throw new Error(`a layer is in both ${groupByLayer.get(layer)} and ${group}`);
      if (layer.parent !== stage) throw new Error(`a ${group} layer is not a direct stage child`);
      groupByLayer.set(layer, group);
    }
  }
  const groupOrder = Object.keys(layersByGroup);
  let previousGroupIndex = -1;
  for (const child of stage.children) {
    const group = groupByLayer.get(child);
    if (group === undefined) {
      if (mayStayOut(child)) continue;
      throw new Error(`stage child ${child.label || 'without label'} is in no capture group`);
    }
    const groupIndex = groupOrder.indexOf(group);
    if (groupIndex < previousGroupIndex) throw new Error(`capture group ${group} is out of stage order`);
    previousGroupIndex = groupIndex;
  }
}
