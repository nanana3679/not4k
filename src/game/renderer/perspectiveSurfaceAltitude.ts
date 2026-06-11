import { JudgmentGrade } from "../../shared";

const MISS_ALTITUDE_DROP = 0.24;
const BAD_ALTITUDE_DROP = 0.12;
const HIT_RECOVERY_VELOCITY_PER_SECOND = 0.28;
const MAX_RECOVERY_VELOCITY_PER_SECOND = 0.7;
const RECOVERY_DECAY_PER_SECOND = 1.8;
const MIN_ALTITUDE_OFFSET = -0.85;
const MAX_ALTITUDE_OFFSET = 0.5;

export interface PlaceholderPerspectiveSurfaceAltitudeInput {
  songTimeMs: number;
  chartDurationMs: number;
}

export interface PerspectiveSurfaceAltitudeState {
  offset: number;
  recoveryVelocityPerSecond: number;
}

// Placeholder until altitude reacts to judgments: misses drop, hits recover slowly.
export function derivePlaceholderPerspectiveSurfaceAltitude({
  songTimeMs,
  chartDurationMs,
}: PlaceholderPerspectiveSurfaceAltitudeInput): number {
  if (!Number.isFinite(chartDurationMs) || chartDurationMs <= 0) return 1;

  return clamp01(1 - songTimeMs / chartDurationMs);
}

export function createPerspectiveSurfaceAltitudeState(): PerspectiveSurfaceAltitudeState {
  return {
    offset: 0,
    recoveryVelocityPerSecond: 0,
  };
}

export function applyPerspectiveSurfaceJudgment(
  state: PerspectiveSurfaceAltitudeState,
  grade: JudgmentGrade,
): PerspectiveSurfaceAltitudeState {
  if (grade === JudgmentGrade.MISS) {
    return {
      offset: clampAltitudeOffset(state.offset - MISS_ALTITUDE_DROP),
      recoveryVelocityPerSecond: 0,
    };
  }

  if (grade === JudgmentGrade.BAD) {
    return {
      offset: clampAltitudeOffset(state.offset - BAD_ALTITUDE_DROP),
      recoveryVelocityPerSecond: 0,
    };
  }

  return {
    offset: state.offset,
    recoveryVelocityPerSecond: Math.min(
      MAX_RECOVERY_VELOCITY_PER_SECOND,
      state.recoveryVelocityPerSecond + HIT_RECOVERY_VELOCITY_PER_SECOND,
    ),
  };
}

export function stepPerspectiveSurfaceAltitude(
  state: PerspectiveSurfaceAltitudeState,
  deltaMs: number,
): PerspectiveSurfaceAltitudeState {
  const deltaSeconds = clamp(deltaMs / 1000, 0, 0.25);
  if (deltaSeconds <= 0) return state;

  const nextOffset = clampAltitudeOffset(
    state.offset + state.recoveryVelocityPerSecond * deltaSeconds,
  );
  const decay = Math.max(0, 1 - RECOVERY_DECAY_PER_SECOND * deltaSeconds);

  return {
    offset: nextOffset,
    recoveryVelocityPerSecond: state.recoveryVelocityPerSecond * decay,
  };
}

export function resolvePerspectiveSurfaceAltitude({
  state,
  songTimeMs,
  chartDurationMs,
}: PlaceholderPerspectiveSurfaceAltitudeInput & {
  state: PerspectiveSurfaceAltitudeState;
}): number {
  return clamp01(
    derivePlaceholderPerspectiveSurfaceAltitude({ songTimeMs, chartDurationMs }) + state.offset,
  );
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;

  return Math.min(1, Math.max(0, value));
}

function clampAltitudeOffset(value: number): number {
  return clamp(value, MIN_ALTITUDE_OFFSET, MAX_ALTITUDE_OFFSET);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;

  return Math.min(max, Math.max(min, value));
}
