import { describe, it, expect } from "vitest";
import {
  beat,
  beatFromInt,
  beatFromString,
  beatToString,
  beatToFloat,
  beatAdd,
  beatSub,
  beatMul,
  beatMulInt,
  beatEq,
  beatLt,
  beatLte,
  beatGt,
  beatGte,
  beatCompare,
  beatMin,
  beatMax,
  beatIsZero,
  beatIsPositive,
  beatAbs,
  BEAT_ZERO,
} from "./beat";

describe("beat()", () => {
  it("약분된 Beat를 생성한다", () => {
    expect(beat(2, 4)).toEqual({ n: 1, d: 2 });
    expect(beat(6, 3)).toEqual({ n: 2, d: 1 });
  });

  it("분모가 음수이면 양수로 정규화한다", () => {
    expect(beat(1, -2)).toEqual({ n: -1, d: 2 });
    expect(beat(-3, -6)).toEqual({ n: 1, d: 2 });
  });

  it("분모가 0이면 에러를 던진다", () => {
    expect(() => beat(1, 0)).toThrow("denominator cannot be zero");
  });

  it("분모 기본값은 1이다", () => {
    expect(beat(5)).toEqual({ n: 5, d: 1 });
  });
});

describe("beatFromInt()", () => {
  it("정수를 Beat로 변환한다", () => {
    expect(beatFromInt(3)).toEqual({ n: 3, d: 1 });
    expect(beatFromInt(0)).toEqual({ n: 0, d: 1 });
  });
});

describe("beatFromString()", () => {
  it("분수 문자열을 파싱한다", () => {
    expect(beatFromString("3/4")).toEqual({ n: 3, d: 4 });
    expect(beatFromString("7/2")).toEqual({ n: 7, d: 2 });
  });

  it("정수 문자열을 파싱한다", () => {
    expect(beatFromString("0")).toEqual({ n: 0, d: 1 });
    expect(beatFromString("7")).toEqual({ n: 7, d: 1 });
  });

  it("약분한다", () => {
    expect(beatFromString("4/8")).toEqual({ n: 1, d: 2 });
  });

  it("잘못된 문자열이면 에러를 던진다", () => {
    expect(() => beatFromString("abc")).toThrow("invalid string");
    expect(() => beatFromString("1/2/3")).toThrow("invalid string");
  });
});

describe("beatToString()", () => {
  it("분모가 1이면 정수로 직렬화한다", () => {
    expect(beatToString(beat(3))).toBe("3");
    expect(beatToString(beat(0))).toBe("0");
  });

  it("분수를 직렬화한다", () => {
    expect(beatToString(beat(3, 4))).toBe("3/4");
  });
});

describe("beatToFloat()", () => {
  it("소수로 변환한다", () => {
    expect(beatToFloat(beat(1, 2))).toBe(0.5);
    expect(beatToFloat(beat(3, 4))).toBe(0.75);
    expect(beatToFloat(beat(7))).toBe(7);
  });
});

describe("산술 연산", () => {
  it("beatAdd: 덧셈", () => {
    // 1/4 + 1/2 = 3/4
    expect(beatAdd(beat(1, 4), beat(1, 2))).toEqual({ n: 3, d: 4 });
  });

  it("beatSub: 뺄셈", () => {
    // 3/4 - 1/2 = 1/4
    expect(beatSub(beat(3, 4), beat(1, 2))).toEqual({ n: 1, d: 4 });
  });

  it("beatMul: 곱셈", () => {
    // 2/3 * 3/4 = 1/2
    expect(beatMul(beat(2, 3), beat(3, 4))).toEqual({ n: 1, d: 2 });
  });

  it("beatMulInt: 정수 곱셈", () => {
    // 3/4 * 2 = 3/2
    expect(beatMulInt(beat(3, 4), 2)).toEqual({ n: 3, d: 2 });
  });
});

describe("비교 연산", () => {
  const a = beat(1, 4); // 0.25
  const b = beat(1, 2); // 0.5
  const c = beat(2, 8); // 0.25 (= 1/4)

  it("beatEq", () => {
    expect(beatEq(a, c)).toBe(true);
    expect(beatEq(a, b)).toBe(false);
  });

  it("beatLt", () => {
    expect(beatLt(a, b)).toBe(true);
    expect(beatLt(b, a)).toBe(false);
    expect(beatLt(a, c)).toBe(false);
  });

  it("beatLte", () => {
    expect(beatLte(a, b)).toBe(true);
    expect(beatLte(a, c)).toBe(true);
    expect(beatLte(b, a)).toBe(false);
  });

  it("beatGt", () => {
    expect(beatGt(b, a)).toBe(true);
    expect(beatGt(a, b)).toBe(false);
  });

  it("beatGte", () => {
    expect(beatGte(b, a)).toBe(true);
    expect(beatGte(a, c)).toBe(true);
  });

  it("beatCompare", () => {
    expect(beatCompare(a, b)).toBe(-1);
    expect(beatCompare(b, a)).toBe(1);
    expect(beatCompare(a, c)).toBe(0);
  });
});

describe("유틸리티", () => {
  it("beatMin / beatMax", () => {
    const a = beat(1, 4);
    const b = beat(1, 2);
    expect(beatMin(a, b)).toEqual(a);
    expect(beatMax(a, b)).toEqual(b);
  });

  it("beatIsZero", () => {
    expect(beatIsZero(BEAT_ZERO)).toBe(true);
    expect(beatIsZero(beat(1))).toBe(false);
  });

  it("beatIsPositive", () => {
    expect(beatIsPositive(beat(1, 2))).toBe(true);
    expect(beatIsPositive(beat(-1, 2))).toBe(false);
    expect(beatIsPositive(BEAT_ZERO)).toBe(false);
  });

  it("beatAbs", () => {
    expect(beatAbs(beat(-3, 4))).toEqual({ n: 3, d: 4 });
    expect(beatAbs(beat(3, 4))).toEqual({ n: 3, d: 4 });
  });

  it("BEAT_ZERO", () => {
    expect(BEAT_ZERO).toEqual({ n: 0, d: 1 });
  });
});
