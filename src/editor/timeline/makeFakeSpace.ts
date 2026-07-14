/**
 * makeFakeSpace — 테스트용 가짜 TimelineSpace 팩토리.
 *
 * 모드 테스트들이 좌표/히트를 인라인 stub하던 것을 한 곳으로 수렴시킨다.
 * 기본값은 단순 항등/널이며, overrides로 케이스별 교체한다.
 * 프로덕션 코드가 아니라 테스트 지원 모듈이다 (여러 *.test.ts가 import).
 */

import type { TimelineSpace } from "./TimelineSpace";
import { beat } from "../../shared";
import type { Beat, Lane } from "../../shared";

/** 테스트용 가짜 TimelineSpace. 기본값은 단순 항등/널이며 overrides로 케이스별 교체. */
export function makeFakeSpace(overrides: Partial<TimelineSpace> = {}): TimelineSpace {
  return {
    xToLane: (x: number): Lane | null => (x >= 1 && x <= 4 ? (x as Lane) : null),
    xToExtraLane: () => null,
    xToUnifiedLane: (x: number) => (x >= 1 && x <= 4 ? x : null),
    yToBeat: (y: number): Beat => beat(y),
    yToBeatRaw: (y: number): Beat => beat(y),
    snapBeat: (b: Beat): Beat => b,
    getSnapStep: (): Beat => beat(4, 4),
    getMaxBeatFloat: () => 100,
    hitTestNote: () => null,
    hitTestUnifiedNote: () => null,
    hitTestNoteEnd: () => null,
    hitTestEventEnd: () => null,
    hitTestTrillZoneEnd: () => null,
    hitTestTrillZone: () => null,
    hitTestExtraNote: () => null,
    getBpmMarkers: () => [],
    ...overrides,
  };
}
