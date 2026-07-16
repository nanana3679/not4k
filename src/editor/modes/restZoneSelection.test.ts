import { describe, it, expect } from "vitest";
import { translateRestZone, clampRestBeatOffset } from "./restZoneSelection";
import { beat, beatToFloat } from "../../shared";
import type { RestZone } from "../../shared";

const zone: RestZone = { lane: 2, beat: beat(2), endBeat: beat(6) };

describe("translateRestZone — beat/endBeat 평행이동 (RFD 0019, translateTrillZone 미러)", () => {
  it("restZone(lane2, 2~6)을 +3박 이동하면 5~9가 되고 lane은 불변", () => {
    const moved = translateRestZone(zone, beat(3));
    expect(moved.lane).toBe(2);
    expect(beatToFloat(moved.beat)).toBe(5);
    expect(beatToFloat(moved.endBeat)).toBe(9);
  });

  it("-1/2박 이동하면 1.5~5.5 — 분수 오프셋도 정확 산술로 유지", () => {
    const moved = translateRestZone(zone, beat(-1, 2));
    expect(beatToFloat(moved.beat)).toBe(1.5);
    expect(beatToFloat(moved.endBeat)).toBe(5.5);
  });

  it("원본 restZone 객체는 변이되지 않는다(새 객체 반환)", () => {
    const moved = translateRestZone(zone, beat(1));
    expect(moved).not.toBe(zone);
    expect(beatToFloat(zone.beat)).toBe(2);
    expect(beatToFloat(zone.endBeat)).toBe(6);
  });
});

describe("clampRestBeatOffset — 구간 자체를 [0, maxBeat]에 클램프 (RFD 0019)", () => {
  const maxBeat = beat(10);

  it("허용 범위 안 오프셋(+2)은 그대로 반환된다(2~6 → 4~8, max 10)", () => {
    expect(beatToFloat(clampRestBeatOffset(zone, maxBeat, beat(2)))).toBe(2);
  });

  it("-3박 요청은 시작이 0 아래로 벗어나 -2박(시작=0)으로 클램프된다", () => {
    expect(beatToFloat(clampRestBeatOffset(zone, maxBeat, beat(-3)))).toBe(-2);
  });

  it("+5박 요청은 끝이 max(10)를 넘어 +4박(끝=10)으로 클램프된다", () => {
    expect(beatToFloat(clampRestBeatOffset(zone, maxBeat, beat(5)))).toBe(4);
  });

  it("구간(0~6)이 타임라인(max 4)보다 길면 이동 여유가 없어 0을 반환한다", () => {
    const longZone: RestZone = { lane: 1, beat: beat(0), endBeat: beat(6) };
    expect(beatToFloat(clampRestBeatOffset(longZone, beat(4), beat(1)))).toBe(0);
  });

  it("경계 정확 일치(+4 → 끝=max 10)는 클램프 없이 통과한다", () => {
    expect(beatToFloat(clampRestBeatOffset(zone, maxBeat, beat(4)))).toBe(4);
  });
});
