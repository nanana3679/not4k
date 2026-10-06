import { JudgmentGrade } from "../../shared";

const MISS_ALTITUDE_DROP = 0.24;
const BAD_ALTITUDE_DROP = 0.12;
const HIT_RECOVERY_VELOCITY_PER_SECOND = 0.28;
const MAX_RECOVERY_VELOCITY_PER_SECOND = 0.7;
const RECOVERY_DECAY_PER_SECOND = 1.8;
const MIN_ALTITUDE_OFFSET = -0.85;
const MAX_ALTITUDE_OFFSET = 0.5;

export interface PlaceholderFlightAltitudeInput {
  songTimeMs: number;
  chartDurationMs: number;
}

export interface FlightAltitudeState {
  offset: number;
  recoveryVelocityPerSecond: number;
}

// 비행 규칙 확정 전의 임시 모델: 곡 진행으로 하강하고 판정에 따라 하강·회복한다.
export function derivePlaceholderFlightAltitude({
  songTimeMs,
  chartDurationMs,
}: PlaceholderFlightAltitudeInput): number {
  if (!Number.isFinite(chartDurationMs) || chartDurationMs <= 0) return 1;

  return clampFlightAltitude(1 - songTimeMs / chartDurationMs);
}

export function createFlightAltitudeState(): FlightAltitudeState {
  return {
    offset: 0,
    recoveryVelocityPerSecond: 0,
  };
}

export function applyFlightJudgment(
  state: FlightAltitudeState,
  grade: JudgmentGrade,
): FlightAltitudeState {
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

/**
 * 고도 상태를 deltaMs만큼 나아가게 한다. out을 주면 새 객체를 만들지 않고 그 객체(state 자신도 된다)에 써서 돌려준다.
 * 렌더러는 프레임마다 자기 상태에 바로 써서 프레임마다 객체를 만들지 않는다.
 */
export function stepFlightAltitude(
  state: FlightAltitudeState,
  deltaMs: number,
  out?: FlightAltitudeState,
): FlightAltitudeState {
  const deltaSeconds = clamp(deltaMs / 1000, 0, 0.25);
  if (deltaSeconds <= 0) {
    if (!out || out === state) return state;
    out.offset = state.offset;
    out.recoveryVelocityPerSecond = state.recoveryVelocityPerSecond;
    return out;
  }

  const nextOffset = clampAltitudeOffset(
    state.offset + state.recoveryVelocityPerSecond * deltaSeconds,
  );
  const decay = Math.max(0, 1 - RECOVERY_DECAY_PER_SECOND * deltaSeconds);
  const nextVelocity = state.recoveryVelocityPerSecond * decay;

  if (!out) return { offset: nextOffset, recoveryVelocityPerSecond: nextVelocity };
  out.offset = nextOffset;
  out.recoveryVelocityPerSecond = nextVelocity;
  return out;
}

export function resolveFlightAltitude({
  state,
  songTimeMs,
  chartDurationMs,
}: PlaceholderFlightAltitudeInput & {
  state: FlightAltitudeState;
}): number {
  return clampFlightAltitude(
    derivePlaceholderFlightAltitude({ songTimeMs, chartDurationMs }) + state.offset,
  );
}

/** 고도를 0~1로 자른다. NaN·무한대는 0이다(비행 배경 FlightBackground.render와 같은 규칙). 기어 게이지와 미리보기 고정값도 이 규칙을 쓴다. */
export function clampFlightAltitude(value: number): number {
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
