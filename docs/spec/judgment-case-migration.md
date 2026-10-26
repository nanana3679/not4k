# 구형 판정 81건의 새 계약 대응

**상태:** RFD 0037의 채택 계약에 따른 설계 기대값 · #340에서는 새 엔진을 실행하지 않음(실행 검증은 #342) · 기존 테스트/실행 기록 보존(2026-10-25)

[원본 81건](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts)을 파일 순서의 HC001～HC081로 식별한다. 원본 테스트명·등록 상태·출처 줄, 새 명시 항목·기대 정산·목표 단계는 [대응 자료](fixtures/legacy-judgment-case-migration.json)에 함께 보존한다. `it.fails`나 과거 81/81 카운트를 새 모델의 통과 증거로 사용하지 않는다. 그림과 구체 입력 설명은 [새 대표 사례](explicit-note-judgment-cases.md)를 따른다.

통합 작업트리의 실제 세션 실행 이력은 [구현 계획의 별도 기록](../plans/explicit-score-notes-implementation.md#통합-작업트리의-검증-기록--340의-구현-증거-아님)으로 구별한다. 이 표와 JSON은 설계 기대값이며 후속 PR 3에서 새 실행 fixture와 다시 대조한다.

## 읽는 방법

이 문서는 이행 대응표이며 실제 게임 차트의 자동 변환 규칙이 아니다. 테스트 저작자가 아래 합법본을 수동으로 선택한 것이다. 실제 곡은 제작자가 수정하고 구형 의미·혼합 저장을 보존한다. 이 표로 노트를 일괄 추가/삭제하지 않는다.

- 원본의 바디 위치·길이·hold 수, 별도 Point와 입력 시각을 유지한다. 구형 `holdOnly` 속성은 새 바디에 붙이지 않는다.
- 새 릴리즈는 표에 적은 위치·수량만 **명시**한다. 같은 수 연결의 숨은 up 소비, 감소량의 자동 릴리즈와 바디 자동 점수는 없다.
- 이 81건 대응본에는 유지 표식을 임의 추가하지 않는다. 유지 노트의 별도 대표 사례는 새 명세에 고정한다. 원래 `holdOnly` 점수를 보존하려고 금지된 같은 수 경계에 유지 표식을 끼워 넣지 않는다.
- Point와 감소 릴리즈가 같은 위치에 필요했던 원본은 이 대응표에서 **경계 Point를 남기고 감소 릴리즈를 두지 않은 합법본**을 선택했다. 이는 제품의 자동 수리 우선순위가 아니며 원본 차트가 새 형식에서도 합법이라는 뜻도 아니다.
- Normal 창은 Perfect ±41ms·Great ±82ms·Good ±120ms, 유지 유예는 사례 설정인 임시 20ms다. 숫자를 최종 튜닝 결정으로 고정하지 않는다.

분류는 `그대로 적용`(표현·판정 동일), `차트 표현을 옮겨 적용`(명시 구조로 옮기되 해당 검증 결과 보존), `규칙 대체`(입력 배정·점수·시작 의미 중 하나 이상 변경), `결정 후 적용`(이미 PRD에서 후속으로 둔 정책에 의존)이다. 현재 81건에는 후속 정책을 새로 결정할 필요가 없어 마지막 분류는 0건이다. 분류 수는 구현 통과 수가 아니다.

## 정산 표기

`P`=Perfect(3점), `Gr`=Great(2점), `Go`=Good(1점), `PM`=Point Miss, `RM`=릴리즈 Miss, `MM`=무점수 바디 Miss, `Z`=종속 0점이다. `Z`는 원래 가중치 3을 보존하고 추가 Miss가 아니다. `MM`은 점수 항목/분모가 없지만 콤보·Full Combo에 반영한다. 점수 칸은 획득/이론 점수다. HC027은 원본처럼 N2/N3만 단언하며 앞 N1의 실패 합계를 확정하지 않는다.

모든 행의 근거는 [RFD 0037 §2～5](../rfd/0037-explicit-score-notes-and-body.md#2-구성과-점수-의미)와 충돌하지 않는 원본 RFD 0032 해당 절이다. 목표 단계 4는 바디/릴리즈 기본 판정, 6은 연결·감소·짧은 패턴의 세션 회귀 확대다. 새 모델 구현 때 각 기대값을 일반 회귀 테스트로 옮기고 실제로 실행한 결과를 따로 기록한다.

분류 집계: 그대로 적용 0건, 차트 표현을 옮겨 적용 37건, 규칙 대체 44건, 결정 후 적용 0건 (합계 81건).


## RFD 0032 §1-1 기존 결정과 문제

| 원본 | 분류 | 새 명시 릴리즈(ms×수량) | 기대 정산 | 점수 | 근거/변화 | 단계 |
| --- | --- | --- | --- | --- | --- | --- |
| [HC001](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L74) | 규칙 대체 | 1760×1 | P1 Gr1 | 5/6 | holdOnly 자동 점수 제거; 뒤 Point 입력 공유 | 6 |

## RFD 0032 §2-1 hold 수로 시작과 유지 판단

| 원본 | 분류 | 새 명시 릴리즈(ms×수량) | 기대 정산 | 점수 | 근거/변화 | 단계 |
| --- | --- | --- | --- | --- | --- | --- |
| [HC002](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L83) | 표현 이전 | 3000×2 | P1 MM1 Z1 | 3/6 | 1820 유지 실패 한 몫, 나머지 hold 유지 | 4 |

## RFD 0032 §2-2 유지 유예

| 원본 | 분류 | 새 명시 릴리즈(ms×수량) | 기대 정산 | 점수 | 근거/변화 | 단계 |
| --- | --- | --- | --- | --- | --- | --- |
| [HC003](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L91) | 표현 이전 | 3000×2 | P1 MM1 Z1 | 3/6 | 30ms 부족과 20ms 임시 유예 | 4 |
| [HC004](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L97) | 표현 이전 | 3000×2 | P1 MM1 Z1 | 3/6 | 2 기준 25ms/1 기준 5ms 부족을 분리 | 4 |

## RFD 0032 §2-3 release 등급과 자격, 판정 창 기준

| 원본 | 분류 | 새 명시 릴리즈(ms×수량) | 기대 정산 | 점수 | 근거/변화 | 단계 |
| --- | --- | --- | --- | --- | --- | --- |
| [HC005](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L104) | 규칙 대체 | 2000×1 | P1 | 3/3 | holdOnly의 두 자동 점수 제거 | 4 |
| [HC006](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L110) | 규칙 대체 | 1200×1 | P1 Go1 | 4/6 | 1000 down이 Point와 바디 시작을 공유; 미시작 up 가정 제거 | 4 |
| [HC007](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L116) | 규칙 대체 | 1200×1 | P1 Go1 | 4/6 | 1105 up은 실제 시작한 바디의 릴리즈 | 4 |
| [HC008](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L121) | 규칙 대체 | 1200×1 | P1 Go1 | 4/6 | 1090 up은 회복 후 릴리즈; 1000 down부터 실제 시작 | 4 |

## RFD 0032 §2-4 여러 끝에 적격인 up의 순서와 키 재사용

| 원본 | 분류 | 새 명시 릴리즈(ms×수량) | 기대 정산 | 점수 | 근거/변화 | 단계 |
| --- | --- | --- | --- | --- | --- | --- |
| [HC009](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L128) | 표현 이전 | 2000×2 · 2060×1 | P2 RM1 | 6/9 | B 같은 키 재사용은 다른 독립 릴리즈에 허용 | 4 |
| [HC010](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L134) | 표현 이전 | 2000×2 · 2060×1 | P1 Gr1 RM1 | 5/9 | C up은 더 이른 적격 끝에 배정 | 4 |

## RFD 0032 §2-5 바디 중간 교대와 끝 창 안의 교대

| 원본 | 분류 | 새 명시 릴리즈(ms×수량) | 기대 정산 | 점수 | 근거/변화 | 단계 |
| --- | --- | --- | --- | --- | --- | --- |
| [HC011](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L142) | 표현 이전 | 2000×1 | P1 | 3/3 | 끝 창 밖 교대는 hold를 이어받고 입력 비소비 | 4 |
| [HC012](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L147) | 표현 이전 | 2000×1 | Go1 | 1/3 | 1900 up의 일반 릴리즈 등급 유지 | 4 |

## RFD 0032 §2-6 짧게 떨어진 독립 롱노트와 분리 표시

| 원본 | 분류 | 새 명시 릴리즈(ms×수량) | 기대 정산 | 점수 | 근거/변화 | 단계 |
| --- | --- | --- | --- | --- | --- | --- |
| [HC013](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L154) | 표현 이전 | 2000×1 · 3000×1 | P1 Gr1 | 5/6 | 독립 끝과 뒤 시작의 겹치는 창 | 4 |
| [HC014](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L159) | 표현 이전 | 2000×1 · 3000×1 | P2 | 6/6 | 2→1 up도 적격 릴리즈에 배정 | 4 |

## RFD 0032 §3-1 두 release는 서로 다른 키

| 원본 | 분류 | 새 명시 릴리즈(ms×수량) | 기대 정산 | 점수 | 근거/변화 | 단계 |
| --- | --- | --- | --- | --- | --- | --- |
| [HC015](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L166) | 표현 이전 | 2000×2 | P1 RM1 | 3/6 | 임의 B 재누름은 같은 더블 릴리즈 권한을 갱신하지 않음 | 4 |

## RFD 0032 §3-2 유지 키와 다른 키의 up

| 원본 | 분류 | 새 명시 릴리즈(ms×수량) | 기대 정산 | 점수 | 근거/변화 | 단계 |
| --- | --- | --- | --- | --- | --- | --- |
| [HC016](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L174) | 표현 이전 | 2000×2 | P2 | 6/6 | 유지 키와 다른 C/D up도 적격 | 4 |

## RFD 0032 §3-3 노트를 처리한 같은 키의 재누름

| 원본 | 분류 | 새 명시 릴리즈(ms×수량) | 기대 정산 | 점수 | 근거/변화 | 단계 |
| --- | --- | --- | --- | --- | --- | --- |
| [HC017](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L181) | 규칙 대체 | 2100×2 | Gr2 Go1 | 5/9 | 2010 up Good, 2040 up Great, 2050 Point Great; 숨은 up 소비 제거 | 6 |
| [HC018](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L186) | 규칙 대체 | 2100×2 | Gr3 | 6/9 | 2040의 두 up Great, 2050 Point Great; 수신 순서 독립 | 6 |

## RFD 0032 §4-1 연결 release

| 원본 | 분류 | 새 명시 릴리즈(ms×수량) | 기대 정산 | 점수 | 근거/변화 | 단계 |
| --- | --- | --- | --- | --- | --- | --- |
| [HC019](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L193) | 규칙 대체 | 2060×1 | P1 Gr1 | 5/6 | 2010 up이 명시 릴리즈 Great; 연결 소비 제거 | 6 |
| [HC020](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L199) | 규칙 대체 | 2060×1 | P1 Gr1 | 5/6 | 탭 up 2010도 명시 릴리즈 Great | 6 |
| [HC021](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L204) | 규칙 대체 | 2060×1 | P1 Gr1 | 5/6 | 2010 up이 릴리즈를 처리하여 종전 끝 Miss 제거 | 6 |
| [HC022](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L210) | 규칙 대체 | 2200×1 | P1 Gr1 | 5/6 | 2150 up의 Great와 Point Perfect 유지 | 6 |

## RFD 0032 §4-2 경계 전에 뗀 연결 release

| 원본 | 분류 | 새 명시 릴리즈(ms×수량) | 기대 정산 | 점수 | 근거/변화 | 단계 |
| --- | --- | --- | --- | --- | --- | --- |
| [HC023](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L217) | 표현 이전 | 3000×1 | P2 | 6/6 | 앞 무점수 정상 종료와 뒤 Point/릴리즈 | 6 |

## RFD 0032 §4-3 head를 처리한 down부터 뒤 바디 유지

| 원본 | 분류 | 새 명시 릴리즈(ms×수량) | 기대 정산 | 점수 | 근거/변화 | 단계 |
| --- | --- | --- | --- | --- | --- | --- |
| [HC024](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L224) | 표현 이전 | 3000×1 | P2 | 6/6 | 기존 실제 Point down 유지 판단 기준 보존 | 6 |
| [HC025](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L229) | 표현 이전 | 3000×1 | P2 | 6/6 | Point 담당 몫의 기존 대기 보존; 30ms만으로 새 선행 Miss를 만들지 않음 | 6 |
| [HC026](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L234) | 표현 이전 | 3000×1 | P1 Go1 | 4/6 | 2100 Point Good과 끝 Perfect; 실제 down 기준 | 6 |
| [HC027](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L240) | 표현 이전 | 3000×1 | P1 MM1 Z1 | 3/6 | N2/N3만 단언: N3 유지 Miss 2010; 앞 N1 실패 합계는 비단언 | 6 |
| [HC028](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L247) | 규칙 대체 | 2100×2 | P1 Gr1 Go1 | 6/9 | 2010 up Good, 2050 Point Great, 2100의 남은 릴리즈 Perfect | 6 |
| [HC029](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L253) | 규칙 대체 | 3000×1 | P2 | 6/6 | 감소 경계 Point를 남긴 수동 합법본; 겹치는 감소 릴리즈 없음 | 6 |

## RFD 0032 §4-4 single head가 있는 double 연결의 연주

| 원본 | 분류 | 새 명시 릴리즈(ms×수량) | 기대 정산 | 점수 | 근거/변화 | 단계 |
| --- | --- | --- | --- | --- | --- | --- |
| [HC030](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L261) | 규칙 대체 | 2100×2 | P2 Gr1 | 8/9 | 2020 탭 up Great, 2100 남은 릴리즈 Perfect | 6 |
| [HC031](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L266) | 규칙 대체 | 2100×2 | P2 Go1 | 7/9 | 2010 up Good과 2100 남은 릴리즈 Perfect | 6 |

## RFD 0032 §4-5 double head가 있는 double 연결

| 원본 | 분류 | 새 명시 릴리즈(ms×수량) | 기대 정산 | 점수 | 근거/변화 | 단계 |
| --- | --- | --- | --- | --- | --- | --- |
| [HC032](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L276) | 규칙 대체 | 2100×2 | P2 Go2 | 8/12 | double Point Perfect 둘과 2010 up Good 둘 | 6 |
| [HC033](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L282) | 규칙 대체 | 2100×2 | P2 Gr2 | 10/12 | double Point Perfect 둘과 2020 up Great 둘 | 6 |
| [HC034](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L287) | 표현 이전 | 2100×2 | P4 | 12/12 | 1990 up 때 뒤 바디 미시작; 2000 Point 뒤 실제 끝 처리 | 6 |

## RFD 0032 §5-1 계속 유지한 뒤 바디

| 원본 | 분류 | 새 명시 릴리즈(ms×수량) | 기대 정산 | 점수 | 근거/변화 | 단계 |
| --- | --- | --- | --- | --- | --- | --- |
| [HC035](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L294) | 표현 이전 | 3000×1 | P1 PM1 | 3/6 | 계속 정상 유지한 뒤 바디와 Point Miss 분리 | 6 |

## RFD 0032 §5-2 head 창 안에서 끊김

| 원본 | 분류 | 새 명시 릴리즈(ms×수량) | 기대 정산 | 점수 | 근거/변화 | 단계 |
| --- | --- | --- | --- | --- | --- | --- |
| [HC036](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L301) | 표현 이전 | 3000×1 | PM1 Z1 | 0/6 | Point 대기 안에서 끊김: Point Miss 하나와 끝 종속 0점 | 6 |

## RFD 0032 §5-3 head 창 뒤에 끊김

| 원본 | 분류 | 새 명시 릴리즈(ms×수량) | 기대 정산 | 점수 | 근거/변화 | 단계 |
| --- | --- | --- | --- | --- | --- | --- |
| [HC037](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L309) | 표현 이전 | 3000×1 | PM1 MM1 Z1 | 0/6 | 2120 Point Miss 뒤 새 부족은 2220 유지 Miss | 6 |

## RFD 0032 §5-4 double 연결에서 head가 맡는 몫

| 원본 | 분류 | 새 명시 릴리즈(ms×수량) | 기대 정산 | 점수 | 근거/변화 | 단계 |
| --- | --- | --- | --- | --- | --- | --- |
| [HC038](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L316) | 표현 이전 | 3000×2 | P2 PM1 | 6/9 | Point Miss에도 두 정상 몫의 끝 기회 보존 | 6 |
| [HC039](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L321) | 표현 이전 | 3000×2 | P1 PM1 Z1 | 3/9 | Point 담당 몫 종속 0점, 정상 한 몫 릴리즈 | 6 |
| [HC040](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L327) | 표현 이전 | 3000×2 | P1 PM1 MM1 Z1 | 3/9 | head 기한 뒤 유지 실패 한 몫과 건강한 몫 분리 | 6 |

## RFD 0032 §5-5 짧은 뒤 바디

| 원본 | 분류 | 새 명시 릴리즈(ms×수량) | 기대 정산 | 점수 | 근거/변화 | 단계 |
| --- | --- | --- | --- | --- | --- | --- |
| [HC041](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L334) | 규칙 대체 | 2060×1 | P1 PM1 | 3/6 | 건강한 승계 2000 실제 시작; up2060 릴리즈 Perfect 후 Point Miss | 6 |
| [HC042](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L339) | 규칙 대체 | 2060×2 | P2 PM1 | 6/9 | 숨은 연결 소비 없이 정상 두 몫의 명시 릴리즈 처리 | 6 |

## RFD 0032 §6-1 1→2 증가

| 원본 | 분류 | 새 명시 릴리즈(ms×수량) | 기대 정산 | 점수 | 근거/변화 | 단계 |
| --- | --- | --- | --- | --- | --- | --- |
| [HC043](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L349) | 표현 이전 | 3000×2 | P2 | 6/6 | 1→2 증가의 두 유지 몫·끝 항목 | 6 |
| [HC044](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L354) | 표현 이전 | 3000×2 | P2 | 6/6 | 창 전 preheld 추가 키는 증가 차트 시각에 시작 | 6 |
| [HC045](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L358) | 표현 이전 | 3000×2 | P2 | 6/6 | 시작 창 안 늦은 추가 down 허용 | 6 |
| [HC046](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L362) | 표현 이전 | 3000×2 | P1 MM1 Z1 | 3/6 | 2120 시작 실패와 종속 0점 한 몫; 부활 금지 | 6 |
| [HC047](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L367) | 표현 이전 | 3000×2 | P3 | 9/9 | 같은 down으로 Point와 증가 hold 충족 | 6 |

## RFD 0032 §6-2 head 없는 2→1

| 원본 | 분류 | 새 명시 릴리즈(ms×수량) | 기대 정산 | 점수 | 근거/변화 | 단계 |
| --- | --- | --- | --- | --- | --- | --- |
| [HC048](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L376) | 표현 이전 | 2000×1 · 3000×1 | P2 | 6/6 | 감소 싱글 릴리즈를 명시한 합법본 | 6 |
| [HC049](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L380) | 표현 이전 | 2000×1 · 3000×1 | P1 Gr1 | 5/6 | 감소 up1950 Great와 마지막 Perfect | 6 |
| [HC050](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L384) | 표현 이전 | 2000×1 · 3000×1 | P1 RM1 | 3/6 | 감소 릴리즈 입력 누락과 뒤 정상 유지 분리 | 6 |

## RFD 0032 §6-3 head가 있는 2→1과 감소 release

| 원본 | 분류 | 새 명시 릴리즈(ms×수량) | 기대 정산 | 점수 | 근거/변화 | 단계 |
| --- | --- | --- | --- | --- | --- | --- |
| [HC051](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L391) | 규칙 대체 | 3000×1 | P2 | 6/6 | 경계 Point 유지본: 감소/Point 중첩 제거, 숨은 연결 소비 없음 | 6 |
| [HC052](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L397) | 규칙 대체 | 3000×1 | P2 | 6/6 | 경계 Point 유지본: 앞 바디 감소 점수 자동 생성 없음 | 6 |
| [HC053](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L403) | 규칙 대체 | 3000×1 | P2 | 6/6 | 경계 Point 유지본: 탭 up은 이 끝 창 밖 | 6 |
| [HC054](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L409) | 규칙 대체 | 3000×1 | P2 | 6/6 | 경계 Point 유지본: 중간 up 자동 소비 없음 | 6 |
| [HC055](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L415) | 규칙 대체 | 3000×1 | P2 | 6/6 | 경계 Point 유지본: A hold로 뒤 바디 유지 | 6 |
| [HC056](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L421) | 규칙 대체 | 2060×1 | P1 Gr1 | 5/6 | 경계 Point 유지본: B up2015가 마지막 릴리즈 Great | 6 |
| [HC057](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L427) | 규칙 대체 | 2060×1 | P1 Gr1 | 5/6 | 경계 Point 유지본: A up2010이 마지막 릴리즈 Great | 6 |
| [HC058](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L433) | 규칙 대체 | 2060×1 | P1 Gr1 | 5/6 | 경계 Point 유지본: B up2015가 마지막 릴리즈 Great | 6 |
| [HC059](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L439) | 규칙 대체 | 2200×1 | P1 Go1 | 4/6 | 경계 Point 유지본: C up2100이 마지막 릴리즈 Good | 6 |

## RFD 0032 §6-4 감소 지점 앞뒤의 head

| 원본 | 분류 | 새 명시 릴리즈(ms×수량) | 기대 정산 | 점수 | 근거/변화 | 단계 |
| --- | --- | --- | --- | --- | --- | --- |
| [HC060](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L446) | 표현 이전 | 2000×1 · 3000×1 | P3 | 9/9 | Point와 다른 시각의 감소 릴리즈·마지막 릴리즈 | 6 |
| [HC061](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L451) | 규칙 대체 | 2000×1 · 3000×1 | P3 | 9/9 | 숨은 연결 소비 제거: B up2010이 감소 Perfect | 6 |
| [HC062](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L457) | 규칙 대체 | 2000×1 · 3000×1 | P3 | 9/9 | C up1970이 감소 Perfect; B up의 종전 역할 이식 금지 | 6 |
| [HC063](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L462) | 표현 이전 | 2000×1 · 3000×1 | P3 | 9/9 | B up1945 때 뒤 바디 미시작; C up2010으로 감소 처리 | 6 |

## RFD 0032 §7-1 holdOnly 끝은 Good 창 안의 up을 가져간다

| 원본 | 분류 | 새 명시 릴리즈(ms×수량) | 기대 정산 | 점수 | 근거/변화 | 단계 |
| --- | --- | --- | --- | --- | --- | --- |
| [HC064](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L470) | 규칙 대체 | 2160×1 | Go1 | 1/3 | holdOnly 자동 점수/소비 제거; A up2041이 뒤 릴리즈 Good | 6 |
| [HC065](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L476) | 규칙 대체 | 없음 | P1 | 3/3 | Point 유지본: holdOnly 바디 무점수, 겹치는 감소 릴리즈 없음 | 6 |
| [HC066](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L481) | 규칙 대체 | 3000×1 | P2 | 6/6 | holdOnly 자동 점수/면제 제거; Point와 마지막 릴리즈만 정산 | 6 |

## RFD 0032 §7-2 holdOnly 감소에서 키를 남기는 연주

| 원본 | 분류 | 새 명시 릴리즈(ms×수량) | 기대 정산 | 점수 | 근거/변화 | 단계 |
| --- | --- | --- | --- | --- | --- | --- |
| [HC067](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L492) | 규칙 대체 | 3000×1 | P1 | 3/3 | holdOnly 자동 두 점수 제거; 마지막 명시 릴리즈만 정산 | 6 |
| [HC068](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L496) | 규칙 대체 | 3000×1 | P1 | 3/3 | 여분 held에 자동 점수·감소 릴리즈 생성 없음 | 6 |
| [HC069](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L500) | 규칙 대체 | 1750×1 | P1 | 3/3 | 반복 경계의 자동 holdOnly 점수 제거 | 6 |

## RFD 0032 §8-1 시작 직후의 재충전

| 원본 | 분류 | 새 명시 릴리즈(ms×수량) | 기대 정산 | 점수 | 근거/변화 | 단계 |
| --- | --- | --- | --- | --- | --- | --- |
| [HC070](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L510) | 규칙 대체 | 1500×1 | P2 | 6/6 | 실제 시작1000 및 head 없는 기존 재충전; 끝 Perfect | 4 |
| [HC071](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L514) | 규칙 대체 | 1500×1 | P2 | 6/6 | 실제 시작1000 및 기존 재충전; 1140 회복 | 4 |
| [HC072](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L518) | 규칙 대체 | 1500×1 | P1 MM1 Z1 | 3/6 | head 없는 재충전 기한1220에 유지 Miss | 4 |
| [HC073](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L523) | 규칙 대체 | 1500×1 | P1 MM1 Z1 | 3/6 | 새 부족1210+20=1230 유지 Miss | 4 |
| [HC074](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L528) | 표현 이전 | 3000×2 | P2 | 6/6 | 1→2에서 기존 몫도 허용된 재충전 적용 | 6 |

## RFD 0032 §8-1 §1-4의 holdOnly 예

| 원본 | 분류 | 새 명시 릴리즈(ms×수량) | 기대 정산 | 점수 | 근거/변화 | 단계 |
| --- | --- | --- | --- | --- | --- | --- |
| [HC075](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L537) | 규칙 대체 | 없음 | P1 | 3/3 | holdOnly 자동 점수 제거; 회복하는 무점수 바디와 Point | 4 |
| [HC076](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L541) | 규칙 대체 | 없음 | P1 MM1 | 3/3 | 1130 무점수 유지 Miss; 명시 점수는 Point 하나라 100%/FC 아님 | 4 |

## RFD 0032 §8-2 head 없는 경계

| 원본 | 분류 | 새 명시 릴리즈(ms×수량) | 기대 정산 | 점수 | 근거/변화 | 단계 |
| --- | --- | --- | --- | --- | --- | --- |
| [HC077](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L547) | 규칙 대체 | 3000×1 | P1 | 3/3 | holdOnly 제거 후 정상 앞 종료·뒤 새 시작; 앞 자동 점수 없음 | 6 |
| [HC078](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L553) | 표현 이전 | 3000×2 | P2 | 6/6 | 실제 증가 경계의 두 몫 재충전 | 6 |

## RFD 0032 §9-2 허용 입력(탈출구)

| 원본 | 분류 | 새 명시 릴리즈(ms×수량) | 기대 정산 | 점수 | 근거/변화 | 단계 |
| --- | --- | --- | --- | --- | --- | --- |
| [HC079](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L560) | 표현 이전 | 3000×1 | P2 | 6/6 | 같은 키의 앞 정상 종료·뒤 Point/릴리즈 | 6 |
| [HC080](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L564) | 표현 이전 | 2100×2 | P4 | 12/12 | 서로 다른 두 키의 재타격과 실제 뒤 시작 | 6 |

## RFD 0032 §9-3 제작 지침 4～8항

| 원본 | 분류 | 새 명시 릴리즈(ms×수량) | 기대 정산 | 점수 | 근거/변화 | 단계 |
| --- | --- | --- | --- | --- | --- | --- |
| [HC081](../../src/game/judgment/noteJudgmentBodyHeldCountCases.test.ts#L573) | 규칙 대체 | 1560×1 | P1 Gr1 | 5/6 | 1510 탭 up을 숨기지 않고 명시 릴리즈 Great로 처리 | 6 |

## 수락 기준

대응 자료의 ID·원본명은 원본 81건과 일대일이어야 한다. 각 항목은 명시한 Point/릴리즈 수가 성공·일반 Miss·종속 0점으로 정확히 한 번 닫히고 바디 Miss가 분모에 들어가지 않아야 한다. 구현 전 정적 산술 검증과 실제 엔진 검증을 구별한다. 지원 여부·기본 경로 전환·구형 제거와 미정 추적은 [PRD §12](../prd.md#12-미정-사항)를 따른다.
