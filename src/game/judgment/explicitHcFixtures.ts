import { explicitFixtureBody as b, explicitFixtureTap as p, explicitFixtureRelease as r,
  makeExplicitReplayFixture as fixture } from './explicitJudgmentTestHarness';

// 승인 자료를 독립적인 typed 실행 차트로 옮긴 고정 fixture다.
// 설계 JSON·구형 차트를 실행 중 변환하지 않으며 실제 세션 기대값은 M1/M2에서 검증한다.
export const explicitHcFixtures = [
  // HC001: holdOnly 끝 점수를 경계 1500 Grace 릴리즈로 옮김; 뒤 탭 입력 공유
  fixture('HC001', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:74',
    [b(1000, 1500, 1), r(1500, 1, 1, true), b(1500, 1560, 1), p(1560, 'single'), b(1560, 1760, 1), r(1760, 1)],
    [["A",1000,1430],["D",1490,1760]],
    { scoreItemCount: 3, theoreticalWeight: 9, earnedScore: 8, scope: 'whole', events: { perfect: 2, great: 1, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC002: 1820 유지 실패 한 몫, 나머지 hold 유지
  fixture('HC002', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:83',
    [b(1000, 3000, 2), r(3000, 2)],
    [["A",1000,1800],["B",1000,2500],["C",1830,3000]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 3, scope: 'whole', events: { perfect: 1, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 1, dependentZero: 1 } }),
  // HC003: 30ms 부족과 20ms 임시 유예
  fixture('HC003', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:91',
    [b(1000, 3000, 2), r(3000, 2)],
    [["A",1000,1800],["B",1000,3000],["C",1830,3000]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 3, scope: 'whole', events: { perfect: 1, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 1, dependentZero: 1 } }),
  // HC004: 2 기준 25ms/1 기준 5ms 부족을 분리
  fixture('HC004', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:97',
    [b(1000, 3000, 2), r(3000, 2)],
    [["A",1000,1800],["B",1000,1810],["C",1815,3000],["D",1825,3000]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 3, scope: 'whole', events: { perfect: 1, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 1, dependentZero: 1 } }),
  // HC005: holdOnly의 두 자동 점수 제거
  fixture('HC005', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:104',
    [b(1000, 1500, 2), b(1500, 2000, 1), r(2000, 1)],
    [["A",1000,2000],["B",1000,2500]],
    { scoreItemCount: 1, theoreticalWeight: 3, earnedScore: 3, scope: 'whole', events: { perfect: 1, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC006: 1000 down이 탭과 바디 시작을 공유; 미시작 up 가정 제거
  fixture('HC006', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:110',
    [p(1000, 'single'), b(1100, 1200, 1), r(1200, 1)],
    [["A",1000,1090],["A",1140,1200]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 4, scope: 'whole', events: { perfect: 1, great: 0, good: 1, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC007: 1105 up은 실제 시작한 바디의 릴리즈
  fixture('HC007', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:116',
    [p(1000, 'single'), b(1100, 1200, 1), r(1200, 1)],
    [["A",1000,1105],["A",1140,1200]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 4, scope: 'whole', events: { perfect: 1, great: 0, good: 1, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC008: 1090 up은 회복 후 릴리즈; 1000 down부터 실제 시작
  fixture('HC008', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:121',
    [p(1000, 'single'), b(1100, 1200, 1), r(1200, 1)],
    [["A",1000,1050],["A",1080,1090],["A",1140,1200]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 4, scope: 'whole', events: { perfect: 1, great: 0, good: 1, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC009: B 같은 키 재사용은 다른 독립 릴리즈에 허용
  fixture('HC009', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:128',
    [b(1000, 2000, 2), b(2010, 2060, 1), r(2000, 2), r(2060, 1)],
    [["A",1000,2500],["B",1000,1990],["B",2010,2060]],
    { scoreItemCount: 3, theoreticalWeight: 9, earnedScore: 6, scope: 'whole', events: { perfect: 2, great: 0, good: 0, tapMiss: 0, releaseMiss: 1, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC010: C up은 더 이른 적격 끝에 배정
  fixture('HC010', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:134',
    [b(1000, 2000, 2), b(2010, 2060, 1), r(2000, 2), r(2060, 1)],
    [["A",1000,2500],["B",1000,1990],["C",2010,2060]],
    { scoreItemCount: 3, theoreticalWeight: 9, earnedScore: 5, scope: 'whole', events: { perfect: 1, great: 1, good: 0, tapMiss: 0, releaseMiss: 1, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC011: 끝 창 밖 교대는 hold를 이어받고 입력 비소비
  fixture('HC011', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:142',
    [b(1000, 2000, 1), r(2000, 1)],
    [["A",1000,1500],["B",1490,2000]],
    { scoreItemCount: 1, theoreticalWeight: 3, earnedScore: 3, scope: 'whole', events: { perfect: 1, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC012: 1900 up의 일반 릴리즈 등급 유지
  fixture('HC012', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:147',
    [b(1000, 2000, 1), r(2000, 1)],
    [["A",1000,1900],["B",1895,2500]],
    { scoreItemCount: 1, theoreticalWeight: 3, earnedScore: 1, scope: 'whole', events: { perfect: 0, great: 0, good: 1, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC013: 독립 끝과 뒤 시작의 겹치는 창
  fixture('HC013', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:154',
    [b(1000, 2000, 1), b(2010, 3000, 1), r(2000, 1), r(3000, 1)],
    [["A",1000,1950],["B",1960,3000]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 5, scope: 'whole', events: { perfect: 1, great: 1, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC014: 2→1 up도 적격 릴리즈에 배정
  fixture('HC014', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:159',
    [b(1000, 2000, 1), b(2010, 3000, 1), r(2000, 1), r(3000, 1)],
    [["A",1000,2000],["B",1995,3000]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 6, scope: 'whole', events: { perfect: 2, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC015: 임의 B 재누름은 같은 더블 릴리즈 권한을 갱신하지 않음
  fixture('HC015', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:166',
    [b(1000, 2000, 2), r(2000, 2)],
    [["A",1000,2500],["B",1000,1980],["B",1990,2000]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 3, scope: 'whole', events: { perfect: 1, great: 0, good: 0, tapMiss: 0, releaseMiss: 1, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC016: 유지 키와 다른 C/D up도 적격
  fixture('HC016', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:174',
    [b(1000, 2000, 2), r(2000, 2)],
    [["A",1000,2500],["B",1000,2500],["C",1970,1980],["D",1990,2000]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 6, scope: 'whole', events: { perfect: 2, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC017: 2010 up Good, 2040 up Great, 2050 탭 Great; 숨은 up 소비 제거
  fixture('HC017', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:181',
    [b(1000, 2000, 2), p(2000, 'single'), b(2000, 2100, 2), r(2100, 2)],
    [["A",1000,2010],["B",1000,2040],["B",2050,2100]],
    { scoreItemCount: 3, theoreticalWeight: 9, earnedScore: 5, scope: 'whole', events: { perfect: 0, great: 2, good: 1, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC018: 2040의 두 up Great, 2050 탭 Great; 수신 순서 독립
  fixture('HC018', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:186',
    [b(1000, 2000, 2), p(2000, 'single'), b(2000, 2100, 2), r(2100, 2)],
    [["A",1000,2040],["B",1000,2040],["B",2050,2100]],
    { scoreItemCount: 3, theoreticalWeight: 9, earnedScore: 6, scope: 'whole', events: { perfect: 0, great: 3, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC019: 2010 up이 명시 릴리즈 Great; 연결 소비 제거
  fixture('HC019', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:193',
    [b(1000, 2000, 1), p(2000, 'single'), b(2000, 2060, 1), r(2060, 1)],
    [["A",1000,2010],["B",2000,2060]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 5, scope: 'whole', events: { perfect: 1, great: 1, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC020: 탭 up 2010도 명시 릴리즈 Great
  fixture('HC020', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:199',
    [b(1000, 2000, 1), p(2000, 'single'), b(2000, 2060, 1), r(2060, 1)],
    [["A",1000,2060],["B",2000,2010]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 5, scope: 'whole', events: { perfect: 1, great: 1, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC021: 2010 up이 릴리즈를 처리하여 종전 끝 Miss 제거
  fixture('HC021', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:204',
    [b(1000, 2000, 1), p(2000, 'single'), b(2000, 2060, 1), r(2060, 1)],
    [["A",1000,2010],["B",2000,2500]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 5, scope: 'whole', events: { perfect: 1, great: 1, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC022: 2150 up의 Great와 탭 Perfect 유지
  fixture('HC022', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:210',
    [b(1000, 2000, 1), p(2000, 'single'), b(2000, 2200, 1), r(2200, 1)],
    [["A",1000,2200],["B",2000,2150]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 5, scope: 'whole', events: { perfect: 1, great: 1, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC023: 앞 무점수 정상 종료와 뒤 탭/릴리즈
  fixture('HC023', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:217',
    [b(1000, 2000, 1), p(2000, 'single'), b(2000, 3000, 1), r(3000, 1)],
    [["A",1000,1960],["B",2000,3000]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 6, scope: 'whole', events: { perfect: 2, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC024: 기존 실제 탭 down 유지 판단 기준 보존
  fixture('HC024', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:224',
    [b(1000, 2000, 1), p(2000, 'single'), b(2000, 3000, 1), r(3000, 1)],
    [["A",1000,2010],["B",2030,3000]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 6, scope: 'whole', events: { perfect: 2, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC025: 탭 담당 몫의 기존 대기 보존; 30ms만으로 새 선행 Miss를 만들지 않음
  fixture('HC025', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:229',
    [b(1000, 2000, 1), p(2000, 'single'), b(2000, 3000, 1), r(3000, 1)],
    [["A",1000,2010],["B",2040,3000]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 6, scope: 'whole', events: { perfect: 2, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC026: 2100 탭 Good과 끝 Perfect; 실제 down 기준
  fixture('HC026', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:234',
    [b(1000, 2000, 1), p(2000, 'single'), b(2000, 3000, 1), r(3000, 1)],
    [["A",1000,2010],["B",2100,3000]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 4, scope: 'whole', events: { perfect: 1, great: 0, good: 1, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC027: N2/N3만 단언: N3 유지 Miss 2010; 앞 N1 실패 합계는 비단언
  fixture('HC027', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:240',
    [b(1000, 2000, 1), p(2000, 'single'), b(2000, 3000, 1), r(3000, 1)],
    [["A",1000,1980],["B",1960,1990],["C",2015,3000]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 3, scope: 'partial', assertionNoteIndices: [1, 2, 3], events: { perfect: 1, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 1, dependentZero: 1 } }),
  // HC028: 2010 up Good, 2050 탭 Great, 2100의 남은 릴리즈 Perfect
  fixture('HC028', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:247',
    [b(1000, 2000, 2), p(2000, 'single'), b(2000, 2100, 2), r(2100, 2)],
    [["A",1000,2010],["C",1000,2100],["B",2050,2100]],
    { scoreItemCount: 3, theoreticalWeight: 9, earnedScore: 6, scope: 'whole', events: { perfect: 1, great: 1, good: 1, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC029: 감소 경계 탭을 남긴 수동 합법본; 겹치는 감소 릴리즈 없음
  fixture('HC029', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:253',
    [b(1000, 2000, 2), p(2000, 'single'), b(2000, 3000, 1), r(3000, 1)],
    [["A",1000,2010],["B",1000,2015],["C",2040,3000]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 6, scope: 'whole', events: { perfect: 2, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC030: 2020 탭 up Great, 2100 남은 릴리즈 Perfect
  fixture('HC030', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:261',
    [b(1000, 2000, 2), p(2000, 'single'), b(2000, 2100, 2), r(2100, 2)],
    [["A",1000,2100],["B",1000,2100],["C",2000,2020]],
    { scoreItemCount: 3, theoreticalWeight: 9, earnedScore: 8, scope: 'whole', events: { perfect: 2, great: 1, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC031: 2010 up Good과 2100 남은 릴리즈 Perfect
  fixture('HC031', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:266',
    [b(1000, 2000, 2), p(2000, 'single'), b(2000, 2100, 2), r(2100, 2)],
    [["C",1000,2100],["A",1000,2010],["B",2000,2100]],
    { scoreItemCount: 3, theoreticalWeight: 9, earnedScore: 7, scope: 'whole', events: { perfect: 2, great: 0, good: 1, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC032: double 탭 Perfect 둘과 2010 up Good 둘
  fixture('HC032', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:276',
    [b(1000, 2000, 2), p(2000, 'double'), b(2000, 2100, 2), r(2100, 2)],
    [["A",1000,2010],["B",1000,2010],["C",2000,2100],["D",2000,2100]],
    { scoreItemCount: 4, theoreticalWeight: 12, earnedScore: 8, scope: 'whole', events: { perfect: 2, great: 0, good: 2, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC033: double 탭 Perfect 둘과 2020 up Great 둘
  fixture('HC033', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:282',
    [b(1000, 2000, 2), p(2000, 'double'), b(2000, 2100, 2), r(2100, 2)],
    [["A",1000,2100],["B",1000,2100],["C",2000,2020],["D",2000,2020]],
    { scoreItemCount: 4, theoreticalWeight: 12, earnedScore: 10, scope: 'whole', events: { perfect: 2, great: 2, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC034: 1990 up 때 뒤 바디 미시작; 2000 탭 뒤 실제 끝 처리
  fixture('HC034', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:287',
    [b(1000, 2000, 2), p(2000, 'double'), b(2000, 2100, 2), r(2100, 2)],
    [["A",1000,1990],["B",1000,1990],["A",2000,2100],["B",2000,2100]],
    { scoreItemCount: 4, theoreticalWeight: 12, earnedScore: 12, scope: 'whole', events: { perfect: 4, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC035: 계속 정상 유지한 뒤 바디와 탭 Miss 분리
  fixture('HC035', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:294',
    [b(1000, 2000, 1), p(2000, 'single'), b(2000, 3000, 1), r(3000, 1)],
    [["A",1000,3000]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 3, scope: 'whole', events: { perfect: 1, great: 0, good: 0, tapMiss: 1, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC036: 탭 대기 안에서 끊김: 탭 Miss 하나와 끝 종속 0점
  fixture('HC036', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:301',
    [b(1000, 2000, 1), p(2000, 'single'), b(2000, 3000, 1), r(3000, 1)],
    [["A",1000,2010]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 0, scope: 'whole', events: { perfect: 0, great: 0, good: 0, tapMiss: 1, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 1 } }),
  // HC037: 2120 탭 Miss 뒤 새 부족은 2220 유지 Miss
  fixture('HC037', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:309',
    [b(1000, 2000, 1), p(2000, 'single'), b(2000, 3000, 1), r(3000, 1)],
    [["A",1000,2200]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 0, scope: 'whole', events: { perfect: 0, great: 0, good: 0, tapMiss: 1, releaseMiss: 0, maintenanceMiss: 1, dependentZero: 1 } }),
  // HC038: 탭 Miss에도 두 정상 몫의 끝 기회 보존
  fixture('HC038', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:316',
    [b(1000, 2000, 2), p(2000, 'single'), b(2000, 3000, 2), r(3000, 2)],
    [["C",1000,3000],["A",1000,3000]],
    { scoreItemCount: 3, theoreticalWeight: 9, earnedScore: 6, scope: 'whole', events: { perfect: 2, great: 0, good: 0, tapMiss: 1, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC039: 탭 담당 몫 종속 0점, 정상 한 몫 릴리즈
  fixture('HC039', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:321',
    [b(1000, 2000, 2), p(2000, 'single'), b(2000, 3000, 2), r(3000, 2)],
    [["C",1000,3000],["A",1000,2010]],
    { scoreItemCount: 3, theoreticalWeight: 9, earnedScore: 3, scope: 'whole', events: { perfect: 1, great: 0, good: 0, tapMiss: 1, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 1 } }),
  // HC040: head 기한 뒤 유지 실패 한 몫과 건강한 몫 분리
  fixture('HC040', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:327',
    [b(1000, 2000, 2), p(2000, 'single'), b(2000, 3000, 2), r(3000, 2)],
    [["C",1000,3000],["A",1000,2200]],
    { scoreItemCount: 3, theoreticalWeight: 9, earnedScore: 3, scope: 'whole', events: { perfect: 1, great: 0, good: 0, tapMiss: 1, releaseMiss: 0, maintenanceMiss: 1, dependentZero: 1 } }),
  // HC041: 건강한 승계 2000 실제 시작; up2060 릴리즈 Perfect 후 탭 Miss
  fixture('HC041', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:334',
    [b(1000, 2000, 1), p(2000, 'single'), b(2000, 2060, 1), r(2060, 1)],
    [["A",1000,2060]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 3, scope: 'whole', events: { perfect: 1, great: 0, good: 0, tapMiss: 1, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC042: 숨은 연결 소비 없이 정상 두 몫의 명시 릴리즈 처리
  fixture('HC042', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:339',
    [b(1000, 2000, 2), p(2000, 'single'), b(2000, 2060, 2), r(2060, 2)],
    [["A",1000,2060],["B",1000,2060]],
    { scoreItemCount: 3, theoreticalWeight: 9, earnedScore: 6, scope: 'whole', events: { perfect: 2, great: 0, good: 0, tapMiss: 1, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC043: 1→2 증가의 두 유지 몫·끝 항목
  fixture('HC043', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:349',
    [b(1000, 2000, 1), b(2000, 3000, 2), r(3000, 2)],
    [["A",1000,3000],["B",2000,3000]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 6, scope: 'whole', events: { perfect: 2, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC044: 창 전 preheld 추가 키는 증가 차트 시각에 시작
  fixture('HC044', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:354',
    [b(1000, 2000, 1), b(2000, 3000, 2), r(3000, 2)],
    [["A",1000,3000],["B",1500,3000]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 6, scope: 'whole', events: { perfect: 2, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC045: 시작 창 안 늦은 추가 down 허용
  fixture('HC045', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:358',
    [b(1000, 2000, 1), b(2000, 3000, 2), r(3000, 2)],
    [["A",1000,3000],["B",2050,3000]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 6, scope: 'whole', events: { perfect: 2, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC046: 2120 시작 실패와 종속 0점 한 몫; 부활 금지
  fixture('HC046', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:362',
    [b(1000, 2000, 1), b(2000, 3000, 2), r(3000, 2)],
    [["A",1000,3000],["B",2200,3000]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 3, scope: 'whole', events: { perfect: 1, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 1, dependentZero: 1 } }),
  // HC047: 같은 down으로 탭과 증가 hold 충족
  fixture('HC047', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:367',
    [b(1000, 2000, 1), p(2000, 'single'), b(2000, 3000, 2), r(3000, 2)],
    [["A",1000,3000],["B",2040,3000]],
    { scoreItemCount: 3, theoreticalWeight: 9, earnedScore: 9, scope: 'whole', events: { perfect: 3, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC048: 감소 싱글 릴리즈를 명시한 합법본
  fixture('HC048', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:376',
    [b(1000, 2000, 2), b(2000, 3000, 1), r(2000, 1), r(3000, 1)],
    [["A",1000,3000],["B",1000,2000]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 6, scope: 'whole', events: { perfect: 2, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC049: 감소 up1950 Great와 마지막 Perfect
  fixture('HC049', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:380',
    [b(1000, 2000, 2), b(2000, 3000, 1), r(2000, 1), r(3000, 1)],
    [["A",1000,3000],["B",1000,1950]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 5, scope: 'whole', events: { perfect: 1, great: 1, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC050: 감소 릴리즈 입력 누락과 뒤 정상 유지 분리
  fixture('HC050', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:384',
    [b(1000, 2000, 2), b(2000, 3000, 1), r(2000, 1), r(3000, 1)],
    [["A",1000,3000],["B",1000,3000]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 3, scope: 'whole', events: { perfect: 1, great: 0, good: 0, tapMiss: 0, releaseMiss: 1, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC051: 경계 탭 노트 유지본: 감소/탭 중첩 제거, 숨은 연결 소비 없음
  fixture('HC051', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:391',
    [b(1000, 2000, 2), p(2000, 'single'), b(2000, 3000, 1), r(3000, 1)],
    [["A",1000,2015],["B",1000,2030],["C",2020,3000]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 6, scope: 'whole', events: { perfect: 2, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC052: 경계 탭 노트 유지본: 앞 바디 감소 점수 자동 생성 없음
  fixture('HC052', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:397',
    [b(1000, 2000, 2), p(2000, 'single'), b(2000, 3000, 1), r(3000, 1)],
    [["A",1000,3000],["B",1000,2015],["C",2020,3000]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 6, scope: 'whole', events: { perfect: 2, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC053: 경계 탭 노트 유지본: C의 짧은 누름 up(2020)은 이 끝 창 밖
  fixture('HC053', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:403',
    [b(1000, 2000, 2), p(2000, 'single'), b(2000, 3000, 1), r(3000, 1)],
    [["A",1000,3000],["B",1000,3000],["C",2000,2020]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 6, scope: 'whole', events: { perfect: 2, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC054: 경계 탭 노트 유지본: 중간 up 자동 소비 없음
  fixture('HC054', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:409',
    [b(1000, 2000, 2), p(2000, 'single'), b(2000, 3000, 1), r(3000, 1)],
    [["A",1000,3000],["B",1000,2010],["C",2000,2020]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 6, scope: 'whole', events: { perfect: 2, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC055: 경계 탭 노트 유지본: A hold로 뒤 바디 유지
  fixture('HC055', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:415',
    [b(1000, 2000, 2), p(2000, 'single'), b(2000, 3000, 1), r(3000, 1)],
    [["A",1000,3000],["B",1000,2015],["C",2020,2040]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 6, scope: 'whole', events: { perfect: 2, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC056: 경계 탭 노트 유지본: B up2015가 마지막 릴리즈 Great
  fixture('HC056', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:421',
    [b(1000, 2000, 2), p(2000, 'single'), b(2000, 2060, 1), r(2060, 1)],
    [["A",1000,2500],["B",1000,2015],["C",2020,2060]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 5, scope: 'whole', events: { perfect: 1, great: 1, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC057: 경계 탭 노트 유지본: A up2010이 마지막 릴리즈 Great
  fixture('HC057', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:427',
    [b(1000, 2000, 2), p(2000, 'single'), b(2000, 2060, 1), r(2060, 1)],
    [["A",1000,2010],["B",1000,2015],["C",2020,2060]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 5, scope: 'whole', events: { perfect: 1, great: 1, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC058: 경계 탭 노트 유지본: B up2015가 마지막 릴리즈 Great
  fixture('HC058', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:433',
    [b(1000, 2000, 2), p(2000, 'single'), b(2000, 2060, 1), r(2060, 1)],
    [["A",1000,2060],["B",1000,2015],["C",2020,2040]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 5, scope: 'whole', events: { perfect: 1, great: 1, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC059: 경계 탭 노트 유지본: C up2100이 마지막 릴리즈 Good
  fixture('HC059', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:439',
    [b(1000, 2000, 2), p(2000, 'single'), b(2000, 2200, 1), r(2200, 1)],
    [["A",1000,2500],["B",1000,2015],["C",2020,2100]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 4, scope: 'whole', events: { perfect: 1, great: 0, good: 1, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC060: 탭과 다른 시각의 감소 릴리즈·마지막 릴리즈
  fixture('HC060', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:446',
    [b(1000, 2000, 2), b(2000, 2050, 1), p(2050, 'single'), b(2050, 3000, 1), r(2000, 1), r(3000, 1)],
    [["A",1000,3000],["B",1000,2010],["C",2050,3000]],
    { scoreItemCount: 3, theoreticalWeight: 9, earnedScore: 9, scope: 'whole', events: { perfect: 3, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC061: 숨은 연결 소비 제거: B up2010이 감소 Perfect
  fixture('HC061', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:451',
    [b(1000, 1950, 2), p(1950, 'single'), b(1950, 2000, 2), b(2000, 3000, 1), r(2000, 1), r(3000, 1)],
    [["A",1000,3000],["B",1000,2010],["C",1950,3000]],
    { scoreItemCount: 3, theoreticalWeight: 9, earnedScore: 9, scope: 'whole', events: { perfect: 3, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC062: C up1970이 감소 Perfect; B up의 종전 역할 이식 금지
  fixture('HC062', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:457',
    [b(1000, 1950, 2), p(1950, 'single'), b(1950, 2000, 2), b(2000, 3000, 1), r(2000, 1), r(3000, 1)],
    [["A",1000,3000],["B",1000,2010],["C",1950,1970]],
    { scoreItemCount: 3, theoreticalWeight: 9, earnedScore: 9, scope: 'whole', events: { perfect: 3, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC063: B up1945 때 뒤 바디 미시작; C up2010으로 감소 처리
  fixture('HC063', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:462',
    [b(1000, 1950, 2), p(1950, 'single'), b(1950, 2000, 2), b(2000, 3000, 1), r(2000, 1), r(3000, 1)],
    [["A",1000,3000],["B",1000,1945],["C",1950,2010]],
    { scoreItemCount: 3, theoreticalWeight: 9, earnedScore: 9, scope: 'whole', events: { perfect: 3, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC064: holdOnly 끝 점수를 경계 2000 Grace 릴리즈로 옮김; A up2041이 경계 Grace 릴리즈, B up2160이 뒤 릴리즈
  fixture('HC064', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:470',
    [b(1000, 2000, 1), r(2000, 1, 1, true), b(2000, 2160, 1), r(2160, 1)],
    [["A",1000,2041],["B",2040,2160]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 6, scope: 'whole', events: { perfect: 2, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC065: 탭 노트 유지본: holdOnly 바디 무점수, 겹치는 감소 릴리즈 없음
  fixture('HC065', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:476',
    [b(1000, 2000, 2), p(2000, 'single'), b(2000, 2060, 1)],
    [["A",1000,2500],["B",1000,2015],["C",2020,2060]],
    { scoreItemCount: 1, theoreticalWeight: 3, earnedScore: 3, scope: 'whole', events: { perfect: 1, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC066: holdOnly 자동 점수/면제 제거; 탭과 마지막 릴리즈만 정산
  fixture('HC066', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:481',
    [b(1000, 1950, 2), p(1950, 'single'), b(1950, 2000, 2), b(2000, 3000, 1), r(3000, 1)],
    [["A",1000,3000],["B",1000,2010],["C",1950,3000]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 6, scope: 'whole', events: { perfect: 2, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC067: holdOnly 자동 두 점수 제거; 마지막 명시 릴리즈만 정산
  fixture('HC067', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:492',
    [b(1000, 2000, 2), b(2000, 3000, 1), r(3000, 1)],
    [["A",1000,3000],["B",1000,2000]],
    { scoreItemCount: 1, theoreticalWeight: 3, earnedScore: 3, scope: 'whole', events: { perfect: 1, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC068: 여분 held에 자동 점수·감소 릴리즈 생성 없음
  fixture('HC068', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:496',
    [b(1000, 2000, 2), b(2000, 3000, 1), r(3000, 1)],
    [["A",1000,3000],["B",1000,3000]],
    { scoreItemCount: 1, theoreticalWeight: 3, earnedScore: 3, scope: 'whole', events: { perfect: 1, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC069: 반복 경계의 자동 holdOnly 점수 제거
  fixture('HC069', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:500',
    [b(1000, 1125, 2), b(1125, 1250, 1), b(1250, 1375, 2), b(1375, 1750, 1), r(1750, 1)],
    [["A",1000,1750],["B",1000,1750]],
    { scoreItemCount: 1, theoreticalWeight: 3, earnedScore: 3, scope: 'whole', events: { perfect: 1, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC070: 실제 시작1000 및 head 없는 기존 재충전; 끝 Perfect
  fixture('HC070', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:510',
    [p(1000, 'single'), b(1100, 1500, 1), r(1500, 1)],
    [["A",1000,1090],["A",1140,1500]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 6, scope: 'whole', events: { perfect: 2, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC071: 실제 시작1000 및 기존 재충전; 1140 회복
  fixture('HC071', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:514',
    [p(1000, 'single'), b(1100, 1500, 1), r(1500, 1)],
    [["A",1000,1105],["A",1140,1500]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 6, scope: 'whole', events: { perfect: 2, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC072: head 없는 재충전 기한1220에 유지 Miss
  fixture('HC072', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:518',
    [p(1000, 'single'), b(1100, 1500, 1), r(1500, 1)],
    [["A",1000,1105]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 3, scope: 'whole', events: { perfect: 1, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 1, dependentZero: 1 } }),
  // HC073: 새 부족1210+20=1230 유지 Miss
  fixture('HC073', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:523',
    [p(1000, 'single'), b(1100, 1500, 1), r(1500, 1)],
    [["A",1000,1210]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 3, scope: 'whole', events: { perfect: 1, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 1, dependentZero: 1 } }),
  // HC074: 1→2에서 기존 몫도 허용된 재충전 적용
  fixture('HC074', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:528',
    [b(1000, 2000, 1), b(2000, 3000, 2), r(3000, 2)],
    [["A",1000,2010],["A",2080,3000],["B",1990,3000]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 6, scope: 'whole', events: { perfect: 2, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC075: holdOnly 자동 점수 제거; 회복하는 무점수 바디와 탭
  fixture('HC075', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:537',
    [p(1000, 'single'), b(1010, 1500, 1)],
    [["A",1000,1030],["B",1060,1500]],
    { scoreItemCount: 1, theoreticalWeight: 3, earnedScore: 3, scope: 'whole', events: { perfect: 1, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC076: 1130 무점수 유지 Miss; 명시 점수는 탭 하나라 100%/FC 아님
  fixture('HC076', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:541',
    [p(1000, 'single'), b(1010, 1500, 1)],
    [["A",1000,1030]],
    { scoreItemCount: 1, theoreticalWeight: 3, earnedScore: 3, scope: 'whole', events: { perfect: 1, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 1, dependentZero: 0 } }),
  // HC077: holdOnly 끝 점수를 경계 2000 Grace 릴리즈로 옮김; 앞 정상 종료·뒤 새 시작
  fixture('HC077', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:547',
    [b(1000, 2000, 1), r(2000, 1, 1, true), b(2000, 3000, 1), r(3000, 1)],
    [["A",1000,1990],["B",2030,3000]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 6, scope: 'whole', events: { perfect: 2, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC078: 실제 증가 경계의 두 몫 재충전
  fixture('HC078', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:553',
    [b(1000, 2000, 1), b(2000, 3000, 2), r(3000, 2)],
    [["A",1000,2010],["B",2040,3000],["A",2060,3000]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 6, scope: 'whole', events: { perfect: 2, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC079: 같은 키의 앞 정상 종료·뒤 탭/릴리즈
  fixture('HC079', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:560',
    [b(1000, 2000, 1), p(2000, 'single'), b(2000, 3000, 1), r(3000, 1)],
    [["A",1000,1960],["A",2040,3000]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 6, scope: 'whole', events: { perfect: 2, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC080: 서로 다른 두 키의 재타격과 실제 뒤 시작
  fixture('HC080', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:564',
    [b(1000, 2000, 2), p(2000, 'double'), b(2000, 2100, 2), r(2100, 2)],
    [["A",1000,1960],["B",1000,1960],["A",2040,2100],["B",2040,2100]],
    { scoreItemCount: 4, theoreticalWeight: 12, earnedScore: 12, scope: 'whole', events: { perfect: 4, great: 0, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
  // HC081: 1510 탭 up을 숨기지 않고 명시 릴리즈 Great로 처리
  fixture('HC081', 'src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts:573',
    [b(1000, 1500, 1), p(1500, 'single'), b(1500, 1560, 1), r(1560, 1)],
    [["A",1000,1560],["B",1500,1510]],
    { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 5, scope: 'whole', events: { perfect: 1, great: 1, good: 0, tapMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 } }),
];
