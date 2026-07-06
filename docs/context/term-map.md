# 용어 권위 매핑표 (term map)

[RFD 0010](../rfd/0010-terminology-language-policy.md) 적용 결과. glossary·CONTEXT·spec·본문 전파의 기준 표다.

**원칙:** prose(서술·근거·예시 대화)는 한국어 유지. 이 표가 바꾸는 것은 *용어 토큰*뿐이다. 모든 항목은 개념당 표면형 1개, 동의어 폐기, glossary에서 1:1 고정.

## 판별 규칙

1. **발명 + 코드 식별자 존재** → 영어 코드 식별자(`백틱`)
2. **기존 개념**(리듬게임·음악계에 원래 있는 것) → established 이름(자연스러우면 한국어, 커뮤니티 표준이 영어면 영어)
3. **코드 없는 발명 용어** → 우선순위:
   - a. 기존 용어가 있으면 그것 (엄검중약, 앵커, 가변 분할)
   - b. 전용 표기 심볼이 있으면 정의에 표기 명시 + 구어 이름 유지 (릴리즈탭=`-o`)
   - c. 둘 다 없으면(보면에 안 보이는 손동작) 짧은 한국어 이름 (홀드 이어잡기)

## A. 영어 코드 식별자로 전환 (발명 + 코드 실재)

| 현 한국어 표제어 | → 캐논 | 코드 식별자 |
|---|---|---|
| 트릴 구간 | `trillZone` | `trillZone`/`TrillZone`/`trillZones` |
| 공릴리즈 — **폐지** (RFD 0015, 역사적 언급만) | `emptyRelease` | 없음 (도장 구현 삭제됨) |
| 흡수·소비 | `consume` | `consumedLongKeys`/`markLongConsumed`/`requiredConsumeCount`/`consumeReleaseTarget`/`executeReleaseJudgment` |
| 유지 전용 롱노트(hold-only) | `holdOnly` | `holdOnly`/`isHoldOnlyNote` |
| 연결 판정 | `connection` | `isConnection`/`Connection` |
| 종결 판정 | `termination` | `executeTerminationJudgment`/`terminationGrade` |
| 유지 판정(lane-held) | `bodyHold`/`laneHeld` | `checkLongNoteBodyHold`/`laneHoldStates` |
| 가장 이른 매칭 | `earliest` | `earliest`/`earliestIndex` |
| 인게임 구간 | `gameplayRange` | `gameplayRange` |
| 다중키 바인딩 | `keyBindings` | `keyBindings`/`KeyBinding`/`laneBindings` |
| Good◇ → `goodTrill` | `goodTrill` (화면 표시 GOOD◇) | `goodTrillCount`, `JudgmentGrade.goodTrill` |
| 차트 이벤트 | `ChartEvent` | `ChartEvent`/`RangeEvent` |
| 메시지 이벤트 | `TextEvent` (⚠️ 2026-06-30 A1을 재전환) | `TextEvent`(type `"text"`) |
| Auto 구간 | `AutoEvent` | `AutoEvent`(type `"auto"`) |
| 정지 이벤트 | `StopEvent` | `StopEvent`(type `"stop"`) |
| 인게임 페이드 | `fadeInTime`/`fadeOutTime` | 동일 |
| 차트 레벨(Lv.) | `difficultyLevel` | 동일 |
| 난이도명 | `difficultyLabel` | 동일 |

표기법 심볼(`o`/`t`/`D`/`-`/`=`/`{`/`}`/`~`/`*`/`-o`/`t-`/`D=-`)은 그대로 유지.

## B. 기존 개념 — established 이름 유지

레인, 틱, 비트 분할, 판정 윈도우, 싱글 노트(code `single`), 롱 노트(code `long`), 더블 노트(code `double`), 트릴 노트(code `trill`), Grace 노트(code `grace`), 주키/보조키, 홀드 중 탭, 엄지 눕히기, 인지 부하/물리 부하, 난이도 등급/난이도 축, **배드말림**(Bad Train), `BPM`, **앵커**(osu!mania established, 의미 일치), **가변 분할**, **엄검중약**(약중검엄에서 정정), 외부 인용 용어(IIDX 스크래치·볼텍스 노브·maimai Break 등 원작 표기).

> 트릴/더블/Grace 노트: 음악·리듬게임 기존 용어라 **한국어 이름 유지 + 코드만 영어 정렬**(`trill`/`double`/`grace`). 단 트릴 *구간*은 발명이라 A의 `trillZone`.

## C. 코드 없는 발명 — 한국어 이름 + 정의에 표기법

| 용어 | 캐논(구어 이름) | 정의에 명시할 표기 |
|---|---|---|
| 릴리즈탭 | 릴리즈탭 | `-o` (`-` 떼며 `o` 탭) |
| 홀드 중 탭 | 홀드 중 탭 | 키 라벨층 `a-- / .b.` |
| 홀드 교대 (← 홀드 이어잡기 개명) | 홀드 교대 | (보면 비가시 — 표기 없음) |
| 분할 릴리즈 | 분할 릴리즈 | `D=-` |
| 피스류(비트 복합 트릴, 레인 내 분리, 롱끝 교대→트릴, 가변 분할 피스 등) | 한국어 이름 | 표기법 + PP 코드 |

## D. 손·키·패턴 계층 어휘 (2026-06-30 정리, 모두 한국어 유지)

직관적 한국어/기존 용어라 RFD상 한국어 유지. 흩어진 "교대" 용법을 계층별로 정리한다.

| 용어 | 정의 | 비고 |
|---|---|---|
| 운지 | 입력 인터페이스에 **손가락**을 대응시키는 법 (손가락→키) | 기존 |
| 손배치 / 가변 손배치 | 손이 어느 레인을 맡는지 (구성/상태) | 기존, 핵심 정체성 |
| 손 이동 | 손이 담당 레인/키 위치를 옮기는 **동작**. **수평 이동**(레인 좌우, =구 건너가기)·**수직 이동**(키보드 상하, 연속 동시치기-트릴)으로 나뉨 | 손이 주체라 모호함 없음. bare "이동"은 에디터 엔티티 이동과 충돌하므로 "손 이동"으로 한정 |
| 파지 | 특정 패턴 파훼를 위한 **손배치 전략** (응용, 손 이동을 동원) | 기존(파지법). "양손 교대" 대체 |
| 키 교대 | 한 레인 내 **활성 키 전환** (다중키 바인딩) | primitive. `구현: alternation`/`trillAlternation` |

**건너가기 → 수평 이동 (개명)**: 건너가기(기법)는 곧 손 이동의 **수평 이동**이라 기법 용어로 중복. 피스 `PP-009`의 라벨도 `수평 이동`으로 개명(PP 코드·구조 유지, 구 표기 건너가기). `가변 분할(PP-007)` prerequisite와 piece-definition·chart-design·prd 등 전 참조를 일괄 치환. 손 이동은 수평/수직 이동으로 분화.

**파생(키 교대에서 조합):** 트릴=빠른 키 교대 반복 / 릴리즈탭=롱노트 끝 키 교대 / 홀드 교대=홀드 중 키 교대 / `goodTrill`=키 교대 실패.

**경계 주의(glossary에서 못 박을 것):** 손배치=*구성/상태* vs 파지=*패턴 대응 전략*. bare "교대"는 쓰지 않고 항상 "키 교대"로 한정(손 단위는 파지가 담당).

### NM 트릴 표기 규약 (SDVX 관용)

트릴은 점유 레인쌍으로 `NM 트릴`로 표기한다 (N<M, 예: `12 트릴`·`23 트릴`·`34 트릴`). SDVX에서 흔한 established 표기. **23 트릴**은 2/2 분할의 중앙 경계를 넘어 수평 이동/파지와 직결되며, 같은 트릴이라도 손배치(2/2 vs 1/3)에 따라 난이도가 달라진다. (레인 번호=언어 중립 + 트릴=기존어 조합이라 한/영 무관.)

## 미구현·주의

- **비행 규칙 / 고도**: 미구현이나 영어 명칭이 design-first로 확정돼 **선행 적용 완료** — `flightRule`(우산), `Liftoff`/`Survival`(하위), `altitude`. 고도는 **게임플레이 값 = 렌더러 시각 고도가 동일 값**(판정 잘하면 시각 고도 상승)이라 `altitude`로 통일(별개 식별자·충돌 아님). → §2.2 no-code 규칙의 design-first 예외.
- **A1 재전환**: 2026-06-30 "텍스트 이벤트→메시지 이벤트" 정정은 이 정책으로 `TextEvent`(영어)로 다시 간다.
- **표기법 스펙(B 작업)**: `piece-notation.md`의 `-o` 정의 등은 AI 작성본이라 별도 정정 패스 필요(용어 정책과 분리). 현재 이름(릴리즈탭/홀드중탭)은 소통 문제없어 유지.
