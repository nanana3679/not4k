import { explicitFixtureBody as b, explicitFixtureTap as p, explicitFixtureRelease as r,
  explicitFixtureTick as s, makeExplicitReplayFixture as fixture } from './explicitJudgmentTestHarness';

// 승인 자료를 독립적인 typed 실행 차트로 옮긴 고정 fixture다.
// 설계 JSON·구형 차트를 실행 중 변환하지 않으며 실제 세션 기대값은 M1/M2에서 검증한다.
// ENJ-10(같은 수 바디 경계에 Point도 릴리즈도 없는 연결의 탈락 공유)은 그 배치를 금지한 사용자 결정(2026-10-27)으로 지웠고 번호는 비워 둔다.
export const explicitEnjFixtures = [
  // ENJ-01 — preheld는 880ms가 아니라 1000ms에 시작
  fixture('ENJ-01', 'docs/spec/fixtures/explicit-note-cases/enj-01.json',
    [b(1000, 2000, 1, 1), s(1500, 1, 1)],
    [["A",500,2050,1]],
    { scoreItemCount: 1, theoreticalWeight: 3, earnedScore: 3, scope: 'whole', events: { perfect: 1, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // ENJ-02 — 창 안 fresh down은 900ms부터 시작
  fixture('ENJ-02', 'docs/spec/fixtures/explicit-note-cases/enj-02.json',
    [b(1000, 2000, 1, 1), s(1500, 1, 1)],
    [["A",900,2000,1]],
    { scoreItemCount: 1, theoreticalWeight: 3, earnedScore: 3, scope: 'whole', events: { perfect: 1, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // ENJ-03 — 실제 이른 시작 뒤 차트 시작 전 정상 종료
  fixture('ENJ-03', 'docs/spec/fixtures/explicit-note-cases/enj-03.json',
    [b(1000, 1060, 1, 1), s(1030, 1, 1)],
    [["A",900,950,1]],
    { scoreItemCount: 1, theoreticalWeight: 3, earnedScore: 3, scope: 'whole', events: { perfect: 1, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // ENJ-04 — preheld를 950ms에 떼면 미시작 완료 불가
  fixture('ENJ-04', 'docs/spec/fixtures/explicit-note-cases/enj-04.json',
    [b(1000, 1060, 1, 1), s(1030, 1, 1)],
    [["A",500,950,1]],
    { scoreItemCount: 1, theoreticalWeight: 3, earnedScore: 0, scope: 'whole', events: { perfect: 0, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 1, dependentZero: 1 } }),
  // ENJ-05 — 15ms 안 회복하면 대기한 유지 노트 Perfect
  fixture('ENJ-05', 'docs/spec/fixtures/explicit-note-cases/enj-05.json',
    [b(1000, 2000, 1, 1), s(1500, 1, 1), s(1700, 1, 1), r(2000, 1, 1)],
    [["A",1000,1490,1],["B",1505,2000,1]],
    { scoreItemCount: 3, theoreticalWeight: 9, earnedScore: 9, scope: 'whole', events: { perfect: 3, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // ENJ-06 — 유예 뒤 재누름은 실패와 종속 0점을 복구하지 않음
  fixture('ENJ-06', 'docs/spec/fixtures/explicit-note-cases/enj-06.json',
    [b(1000, 2000, 1, 1), s(1400, 1, 1), s(1500, 1, 1), s(1700, 1, 1), r(2000, 1, 1)],
    [["A",1000,1490,1],["B",1525,2000,1]],
    { scoreItemCount: 4, theoreticalWeight: 12, earnedScore: 3, scope: 'whole', events: { perfect: 1, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 1, dependentZero: 3 } }),
  // ENJ-07 — Good 릴리즈와 남은 유지 두 개의 Perfect 일괄 정산
  fixture('ENJ-07', 'docs/spec/fixtures/explicit-note-cases/enj-07.json',
    [b(1000, 2000, 1, 1), s(1950, 1, 1), s(1980, 1, 1), r(2000, 1, 1)],
    [["A",1000,1890,1]],
    { scoreItemCount: 3, theoreticalWeight: 9, earnedScore: 7, scope: 'whole', events: { perfect: 2, great: 0, good: 1, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // ENJ-08 — Grace 릴리즈도 실제 up을 요구하고 유지 성공은 Perfect
  fixture('ENJ-08', 'docs/spec/fixtures/explicit-note-cases/enj-08.json',
    [b(1000, 2000, 1, 1), s(1950, 1, 1), r(2000, 1, 1, true)],
    [["A",1000,1890,1]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 6, scope: 'whole', events: { perfect: 2, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // ENJ-09 — 바디 완료 뒤 계속 누르면 Grace 릴리즈만 Miss
  fixture('ENJ-09', 'docs/spec/fixtures/explicit-note-cases/enj-09.json',
    [b(1000, 2000, 1, 1), r(2000, 1, 1, true)],
    [["A",1000,null,1]],
    { scoreItemCount: 1, theoreticalWeight: 3, earnedScore: 0, scope: 'whole', events: { perfect: 0, great: 0, good: 0, tapMiss: 0, releaseMiss: 1, maintenanceMiss: 0, dependentZero: 0 } }),
  // ENJ-11 — 1→2는 앞 single 탈락 뒤 두 몫 모두 새 시작
  fixture('ENJ-11', 'docs/spec/fixtures/explicit-note-cases/enj-11.json',
    [b(1000, 2000, 1, 1), b(2000, 3000, 2, 1), s(2000, 2, 1), r(3000, 2, 1)],
    [["A",1000,1500,1],["B",1990,3000,1],["C",1995,3000,1]],
    { scoreItemCount: 4, theoreticalWeight: 12, earnedScore: 12, scope: 'whole', events: { perfect: 4, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 1, dependentZero: 0 } }),
  // ENJ-12 — 2→1 일부 실패는 건강한 몫 승계와 감소 릴리즈 종속 0점
  fixture('ENJ-12', 'docs/spec/fixtures/explicit-note-cases/enj-12.json',
    [b(1000, 2000, 2, 1), b(2000, 3000, 1, 1), r(2000, 1, 1), s(2500, 1, 1), r(3000, 1, 1)],
    [["A",1000,1500,1],["B",1000,3000,1]],
    { scoreItemCount: 3, theoreticalWeight: 9, earnedScore: 6, scope: 'whole', events: { perfect: 2, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 1, dependentZero: 1 } }),
  // ENJ-13 — 2→1 전체 탈락 뒤 재누름으로 single이 새로 시작
  // 앞 double 두 몫이 모두 탈락해도 뒤 single은 실패를 물려받지 않고 시작 창 안 1990 down으로 시작한다(사용자 결정 2026-10-27, 논의 §48 번복).
  // maintenanceMiss 2: 두 몫이 같은 시각에 함께 유지 실패해도 원인 유지 Miss는 몫마다 하나다(사용자 결정 2026-10-26).
  fixture('ENJ-13', 'docs/spec/fixtures/explicit-note-cases/enj-13.json',
    [b(1000, 2000, 2, 1), b(2000, 3000, 1, 1), s(2000, 1, 1), r(3000, 1, 1)],
    [["A",1000,1500,1],["B",1000,1500,1],["A",1990,3000,1]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 6, scope: 'whole', events: { perfect: 2, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 2, dependentZero: 0 } }),
  // ENJ-14 — 건강한 승계는 짧은 바디 Point 미처리여도 1000ms 시작
  fixture('ENJ-14', 'docs/spec/fixtures/explicit-note-cases/enj-14.json',
    [p(600, 'single', 1), b(600, 1000, 1, 1), p(1000, 'single', 1), b(1000, 1060, 1, 1), r(1060, 1, 1)],
    [["A",600,1060,1]],
    { scoreItemCount: 3, theoreticalWeight: 9, earnedScore: 6, scope: 'whole', events: { perfect: 2, great: 0, good: 0, tapMiss: 1, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // ENJ-15 — 싱글 바디 더블 릴리즈도 시작 Point 재누름 예외 적용
  fixture('ENJ-15', 'docs/spec/fixtures/explicit-note-cases/enj-15.json',
    [p(600, 'single', 1), b(600, 1000, 1, 1), p(1000, 'single', 1), b(1000, 1060, 1, 1), r(1060, 2, 1)],
    [["A",600,1010,1],["A",1020,1060,1]],
    { scoreItemCount: 4, theoreticalWeight: 12, earnedScore: 11, scope: 'whole', events: { perfect: 3, great: 1, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // ENJ-16 — 유지 Perfect와 Point Good 동시 확정은 Good 대표
  fixture('ENJ-16', 'docs/spec/fixtures/explicit-note-cases/enj-16.json',
    [b(1000, 2000, 1, 1), s(1500, 1, 1), p(1600, 'single', 2)],
    [["A",1000,2000,1],["B",1500,1540,2]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 4, scope: 'whole', events: { perfect: 1, great: 0, good: 1, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // ENJ-17 — 같은 Perfect 후보는 표시 가능한 실제 입력의 큰 오차 우선
  fixture('ENJ-17', 'docs/spec/fixtures/explicit-note-cases/enj-17.json',
    [b(1000, 2000, 1, 1), s(1500, 1, 1), p(1530, 'single', 2), p(1480, 'single', 3), p(1400, 'single', 4, true)],
    [["A",1000,2000,1],["B",1500,1540,2],["C",1500,1540,3],["D",1500,1540,4]],
    { scoreItemCount: 4, theoreticalWeight: 12, earnedScore: 12, scope: 'whole', events: { perfect: 4, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // ENJ-18 — 끝 뒤 유효한 첫 시작은 즉시 바디 완료하고 릴리즈 대기
  fixture('ENJ-18', 'docs/spec/fixtures/explicit-note-cases/enj-18.json',
    [b(1000, 1060, 1, 1), s(1030, 1, 1), r(1060, 1, 1)],
    [["A",1070,1080,1]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 6, scope: 'whole', events: { perfect: 2, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
];
