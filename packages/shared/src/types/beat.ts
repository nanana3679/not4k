/**
 * Beat — 분수 기반 박자 위치 타입
 *
 * 부동소수점 오차를 피하기 위해 분자/분모 정수 쌍으로 표현한다.
 * 항상 약분된 상태를 유지하며, 분모는 항상 양수이다.
 */
export interface Beat {
  readonly n: number; // 분자 (numerator)
  readonly d: number; // 분모 (denominator), 항상 > 0
}

/** 최대공약수 */
function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

/** 약분된 Beat를 생성한다. 분모가 0이면 에러. */
export function beat(n: number, d: number = 1): Beat {
  if (d === 0) throw new Error("Beat: denominator cannot be zero");
  // 분모를 항상 양수로
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

/** 정수를 Beat로 변환 */
export function beatFromInt(value: number): Beat {
  return beat(value, 1);
}

/**
 * 문자열을 Beat로 파싱한다.
 * - "3/4" → beat(3, 4)
 * - "0" → beat(0, 1)
 * - "7" → beat(7, 1)
 * - "7/2" → beat(7, 2)
 */
export function beatFromString(s: string): Beat {
  const parts = s.split("/");
  if (parts.length === 1) {
    const n = parseInt(parts[0], 10);
    if (isNaN(n)) throw new Error(`Beat: invalid string "${s}"`);
    return beat(n, 1);
  }
  if (parts.length === 2) {
    const n = parseInt(parts[0], 10);
    const d = parseInt(parts[1], 10);
    if (isNaN(n) || isNaN(d)) throw new Error(`Beat: invalid string "${s}"`);
    return beat(n, d);
  }
  throw new Error(`Beat: invalid string "${s}"`);
}

/** Beat를 문자열로 직렬화한다. "3/4", "0", "7" */
export function beatToString(b: Beat): string {
  if (b.d === 1) return `${b.n}`;
  return `${b.n}/${b.d}`;
}

/** Beat를 소수로 변환 (렌더링/비교용) */
export function beatToFloat(b: Beat): number {
  return b.n / b.d;
}

// --- 산술 연산 ---

export function beatAdd(a: Beat, b: Beat): Beat {
  return beat(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function beatSub(a: Beat, b: Beat): Beat {
  return beat(a.n * b.d - b.n * a.d, a.d * b.d);
}

export function beatMul(a: Beat, b: Beat): Beat {
  return beat(a.n * b.n, a.d * b.d);
}

/** Beat에 정수를 곱한다 */
export function beatMulInt(b: Beat, k: number): Beat {
  return beat(b.n * k, b.d);
}

// --- 비교 연산 ---

export function beatEq(a: Beat, b: Beat): boolean {
  return a.n * b.d === b.n * a.d;
}

export function beatLt(a: Beat, b: Beat): boolean {
  return a.n * b.d < b.n * a.d;
}

export function beatLte(a: Beat, b: Beat): boolean {
  return a.n * b.d <= b.n * a.d;
}

export function beatGt(a: Beat, b: Beat): boolean {
  return a.n * b.d > b.n * a.d;
}

export function beatGte(a: Beat, b: Beat): boolean {
  return a.n * b.d >= b.n * a.d;
}

/** 비교 함수 (-1, 0, 1). 정렬에 사용 */
export function beatCompare(a: Beat, b: Beat): number {
  const diff = a.n * b.d - b.n * a.d;
  if (diff < 0) return -1;
  if (diff > 0) return 1;
  return 0;
}

/** 두 Beat 중 작은 값 */
export function beatMin(a: Beat, b: Beat): Beat {
  return beatLte(a, b) ? a : b;
}

/** 두 Beat 중 큰 값 */
export function beatMax(a: Beat, b: Beat): Beat {
  return beatGte(a, b) ? a : b;
}

/** Beat가 0인지 */
export function beatIsZero(b: Beat): boolean {
  return b.n === 0;
}

/** Beat가 양수인지 */
export function beatIsPositive(b: Beat): boolean {
  return b.n > 0;
}

/** Beat의 절대값 */
export function beatAbs(b: Beat): Beat {
  return b.n < 0 ? beat(-b.n, b.d) : b;
}

export const BEAT_ZERO: Beat = { n: 0, d: 1 };
