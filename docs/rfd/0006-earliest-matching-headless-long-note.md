# RFD 0006: 가장 이른 노트 매칭에 헤드 없는 롱노트 포함

**Status:** Accepted (2026-06-27) — 1차(싱글) + 2차(더블 롱노트 2키·릴리즈 노트) 판정 구현 완료, §11–12 참조

**관련 문서:**

- [`docs/spec/game-core.md`](../spec/game-core.md) — 입력-노트 매칭 (가장 이른 노트 매칭)
- [`docs/spec/note-system.md`](../spec/note-system.md) — 롱노트 입력 모델, 이벤트 라우팅, hold-only
- [`docs/rfd/0005-hold-only-long-note.md`](0005-hold-only-long-note.md) — hold-only(유지 전용 롱노트), 길이 0 슬라이드
- [`docs/research/slide-note-input-matching.md`](../research/slide-note-input-matching.md) — Sonolus pjsekai 등 타 구현체 조사
- [`docs/context/glossary.md`](../context/glossary.md) — 가장 이른 노트 매칭, 이벤트 라우팅
- [`src/game/judgment/JudgmentEngine.ts`](../../src/game/judgment/JudgmentEngine.ts) — `findEarliestUnprocessedNote`

---

## 1. 배경

`game-core.md`의 **가장 이른 노트 매칭**: keydown은 해당 레인에서 가장 이른(earliest) 미처리 노트에 매칭되며, 판정 순서가 배치 순서와 일치한다. 그러나 현재 구현(`findEarliestUnprocessedNote`)은 **포인트 노트만 매칭 대상으로 삼고, 롱노트(구간 노트)는 예외로 제외**한다 — 롱노트는 keydown이 아니라 held 상태로 판정하기 때문이다.

RFD 0005(hold-only)에서 헤드 없는 롱노트, 특히 길이 0 슬라이드가 도입되면서 이 예외의 부작용이 드러났다. 헤드 없는 롱노트는 keydown을 소비하지 않으므로, 그 노트를 처리하려는 입력이 가장 이른 매칭에서 직후 포인트 노트로 흘러가 early로 흡수된다(배드말림).

## 2. 문제

- **흡수**: 헤드 없는 롱노트(hold-only 슬라이드, 짧은 롱노트)의 시작 keydown이 직후 포인트 노트를 early로 흡수해, 유저가 그 포인트 노트를 제때 칠 수 없게 된다.
- **비대칭**: hold-only/길이 0에만 특수 처리로 막으면, 같은 길이 0이라도 슬라이드(held 판정)는 막고 릴리즈 노트(keyup 판정)는 안 막는 비대칭이 생기고, 짧은 길이 > 0 롱노트는 또 별도 처리가 필요한 누더기 규칙이 된다.

## 3. 결정

**가장 이른 노트 매칭 후보에 "헤드 없는, 유지 시작 전 롱노트"를 포함한다.** 롱노트의 예외를 제거하고, 롱노트도 keydown을 받되 그 keydown으로 판정하지 않는다(흡수 전용).

### 3.1 매칭/흡수 규칙

- **매칭 후보** = 포인트 노트 + (헤드 없는, 유지 시작 전) 롱노트.
- keydown이 노트에 매칭되면 그 keydown에 **consume(소진) 플래그**가 달려, 같은 프레임의 후속 노트가 그 입력을 재흡수하지 못한다(한 입력 = 한 노트).
- **헤드 없는 롱노트가 매칭되면**: keydown을 **흡수(consume)** 하되 **판정은 안 한다** — 판정은 노트 종류별 기존 방식(hold-only·일반 롱노트는 held, 릴리즈 노트는 keyup).
- **포인트 노트가 매칭되면**: keydown을 흡수 + 즉시 판정(기존 동작).
- **흡수 종료**: 롱노트가 **필요 키 수**(싱글 1 / 더블 2)를 채우면(held로 충족하는 것 포함) 매칭 후보에서 빠진다. 이후 추가 keydown은 평소대로 다음 가장 이른 노트로 간다(홀드 중 탭).
- **헤드 있는 롱노트**: 시작점의 헤드(포인트 노트)가 대표로 keydown을 흡수·판정하고, 롱노트 바디는 그 키의 held를 따라간다(현행 이벤트 라우팅). 롱노트 자신은 후보에서 빠진다 — **헤드 있는 롱노트가 헤드 + 롱노트로 두 번 흡수해 더블 노트처럼 되는 것을 방지**한다.
- **같은 시점 롱노트 + 포인트** = 헤드 있는 롱노트와 동일하게 취급한다(그 포인트가 헤드 역할). 별도 tie-break이 필요 없다.

### 3.2 tie-break

같은 keydown에 복수 후보가 있을 때: **(1) 더 이른 `time`(노트 시점)** → **(2) 같은 레인** → **(3) 동시각이면 노트 인덱스 등 안정적 순서.** (Sonolus는 hitbox 거리로 tie-break하지만 not4k는 레인 고정이라 불필요. `findEarliestUnprocessedNote`가 이미 earliest로 정렬하면 (1)이 충족된다.)

### 3.3 핵심 성질

"롱노트가 keydown을 (판정 없이) 소비"가 들어가면 **나머지는 기존 가장 이른 노트 매칭이 그대로 처리**한다:

- 입력 1번 = 슬라이드/롱노트 시작만 처리(다음 노트 흡수 안 함)
- 입력 2번 = 첫째는 롱노트, 둘째는 다음 노트(early)
- "한 입력 = 한 노트(가장 이른)" 불변

### 3.4 구현 범위와 노트 타입별 규칙

흡수 **필요 키 수는 노트 타입을 따른다** — 싱글 1 / 더블 2 / 트릴 1.

1차 구현은 **싱글 헤드 없는 롱노트(길이 0 슬라이드 포함)의 keydown 흡수**에 집중한다 — 핵심 문제(슬라이드 직후 탭 흡수)가 여기서 해결된다. 다음 두 규칙도 **2차에서 판정 로직을 구현했다(§12)** — 단 헤드 없는 doubleLong은 에디터 authoring이 아직 없어 방어적 구현이다:

- **헤드 없는 더블 롱노트**: 서로 다른 키 2개의 keydown을 흡수한다(1키째 → 미충족·후보 유지, 2키째 → 충족·흡수 종료). 같은 키 두 번이면 둘째는 무효. 윈도우 종료 시 1키만 들어왔으면 부분(1키 유지 + 1키 Miss, 기존 더블 롱노트 병렬 판정 그대로). hold-only 더블 롱노트가 RFD 0005에서 후속으로 미뤄진 것과 범위가 일관된다.
- **릴리즈 노트(길이 0 일반, keyup 판정)**: 헤드 없는 롱노트와 동일하게 노트 시점 ±Good 윈도우 내의 keydown을 흡수해 직후 노트를 보호하되, **판정은 keyup(떼는 동작)으로** 한다(릴리즈 노트의 본질). "이미 눌러놓고 떼기"(이전 노트의 held로 진입)면 새 keydown이 없으니 흡수할 것도 없고 keyup만 판정한다.

## 4. 의도

흡수 방지를 hold-only·길이 0의 특수 케이스가 아니라 **롱노트 입력 모델 전반의 단일 규칙**으로 통합한다. 헤드 유무 × 길이(0/짧음/긺) × 종류(hold-only/일반/릴리즈)의 모든 조합이 하나의 규칙으로 정리되며, hold-only를 특별 취급할 필요가 사라진다. 동시에 "가장 이른 노트 매칭"의 예측 가능성(판정 순서 = 배치 순서)을 유지한다.

## 5. 외부 검증 — Sonolus pjsekai

프로젝트 세카이 커뮤니티 엔진([`sonolus-pjsekai-engine`](https://github.com/NonSpicyBurrito/sonolus-pjsekai-engine))이 **이 결정과 사실상 동일한 구조**를 쓴다는 것을 코드 정독으로 확인했다(상세: `../research/slide-note-input-matching.md`).

| Sonolus pjsekai | 본 RFD |
| --- | --- |
| `updateSequential`(claim) → `touch`(judge) 2-phase 분리 | keydown 흡수하되 그 keydown으로 판정 안 함 |
| `ClaimManager` 사전 = 한 touch = 한 노트 | consume 플래그 = 한 keydown = 한 노트 |
| `findBestTouchIndex`: 더 이른 `targetTime`이 이김 | 가장 이른 노트 우선 |
| Tap/SlideStart = claim + 판정 | 포인트/헤드 = 흡수 + 판정 |
| SlideConnector = passive(claim X, held만) | 헤드 없는 롱노트 유지 = held 판정 |
| `disallowEnd` 락아웃(탭 후 끝점 claim 금지) | 끝점/릴리즈 흡수 방지(미해결 질문 2) |

또한 osu!의 "notelock"(앞 노트 처리 전 뒤 노트 잠금)은 cascading miss를 유발하는 **안티패턴**으로 취급된다 — 본 결정은 "흡수 후 다음 노트 통과"라 notelock이 아니다.

> **not4k 고유**: "헤드 없는 슬라이드"라는 노트 타입은 Sonolus에 없다(모든 슬라이드가 SlideStart=claim+판정). "흡수만 하고 판정은 held/keyup으로 분리"하는 변형은 not4k에서 새로 설계하는 부분이며, 그 빌딩블록은 모두 검증됐다.

## 6. 케이스 검증

길이 0 슬라이드 `*` + 직후 포인트 `o`(슬라이드 t=1000, 포인트 t=1100) 기준:

| 케이스 | 동작 |
| --- | --- |
| 슬라이드를 탭(입력 1번) | keydown을 슬라이드가 흡수 → 포인트 안 흡수 ✓ |
| 슬라이드 시점에 입력 2번 | ①번은 슬라이드, ②번은 포인트(early GOOD) ✓ |
| 헤드 있는 롱노트 | 헤드가 1회 흡수, 롱노트 추가 흡수 안 함 → 더블 안 됨 ✓ |
| a로 미리 누름(held) + b를 슬라이드 시점에 누름 | a held로 슬라이드 충족(흡수 종료) → b는 포인트로(early GOOD) ✓ |
| 위에서 b 누르기 전 a를 윈도우 안에서 뗌 | 슬라이드는 a 릴리즈로 처리(미리 떼면 뗀 시점) → b는 포인트로 ✓ |
| 위에서 a를 슬라이드 윈도우 전에 너무 일찍 뗌 | 슬라이드 미처리 → b가 슬라이드를 흡수(b가 슬라이드 처리), 포인트 안 감 ✓ |

슬라이드(길이 0 hold-only)의 판정 시점은 입력 방식별이며(RFD 0005 참조), 모두 Good 윈도우 내면 Perfect다 — keydown(새로 누름)→keydown 시점, held(유지)→노트 시점, 릴리즈(미리 뗌)→뗀 시점. 흡수 종료는 "슬라이드가 Good 윈도우 안에 한 번이라도 눌려 있으면 충족"으로 결정된다.

## 7. 대안

### A. hold-only(길이 0)만 흡수 방지 (기각)

길이 0 슬라이드만 매칭 후보에 넣어 흡수를 막는다. **기각**: 짧은 길이 > 0 hold-only, 릴리즈 노트(길이 0 일반)에서 같은 흡수가 남아 비일관.

### B. 현행 유지 (롱노트는 매칭 예외) (기각)

롱노트를 매칭에서 제외한 현재 동작을 유지하고, 슬라이드 탭 시 직후 노트가 당겨지는 것을 난이도 요소로 인정. **기각**: Sonolus 등 검증된 구현체가 흡수를 막는 방향(claim)을 쓰며, 통합 규칙이 더 일관적이고 예측 가능하다.

## 8. 채택 방향

**3절의 규칙**을 채택한다. `findEarliestUnprocessedNote`에서 롱노트 제외 예외를 제거하되, (1) 헤드 없는 + 유지 시작 전 롱노트만 후보에 넣고, (2) 매칭 시 keydown을 흡수하되 판정은 분리하며, (3) 필요 키 수를 채우면 후보에서 제외한다. 가장 이른 노트 매칭의 기본 원칙과 이벤트 라우팅(헤드가 입력 소비, 롱노트는 held 독립 체크)은 유지된다.

## 9. 영향 받는 문서

- [`docs/spec/game-core.md`](../spec/game-core.md) — "입력-노트 매칭"에 헤드 없는 롱노트가 매칭 후보임을 명시.
- [`docs/spec/note-system.md`](../spec/note-system.md) — 롱노트 입력 모델/이벤트 라우팅에 "헤드 없는 롱노트의 keydown 흡수(판정 분리) + 필요 키 수 충족 후 종료" 추가. hold-only/슬라이드 흡수 방지를 이 규칙으로 일반화.
- [`docs/context/glossary.md`](../context/glossary.md) — "가장 이른 노트 매칭"·"이벤트 라우팅" 정의에 헤드 없는 롱노트 포함을 반영.
- 구현: `src/game/judgment/JudgmentEngine.ts`의 `findEarliestUnprocessedNote` + consume/흡수 종료 처리, 회귀 테스트.

## 10. 미해결 질문

**해결됨**: tie-break(earliest→레인→인덱스), 흡수 윈도우(노트 good window), 흡수 종료(필요 키 수 충족), 같은 시점 롱노트+포인트(=헤드 있는 롱노트), 헤드 없는 더블 롱노트 흡수(필요 키 수 2, §3.4), 릴리즈 노트 흡수(동일 흡수 + keyup 판정, §3.4).

**남은 질문**: 없음 (1차 범위). 회귀 검증(홀드 중 탭·이어잡기·릴리즈탭·연결 판정 체인)은 §11에서 통과 확인됨.

더블 롱노트·릴리즈 노트의 흡수 규칙은 §3.4에서 확정됐으며, 실제 코드는 1차(싱글 헤드 없는 롱노트) 이후 해당 노트가 차트에 등장할 때 구현한다.

## 11. 구현 상태 (1차, 2026-06-27)

`src/game/judgment/JudgmentEngine.ts`에 싱글 헤드 없는 롱노트(길이 0 슬라이드 포함) keydown 흡수를 구현. 적대적 검증(서브에이전트)에서 초안의 결함을 잡아 다음과 같이 수정 반영했다:

- **흡수 후보 = 시작 ±Good 근접 게이트**: `isHeadlessAbsorbable`가 `deltaMs ∈ [-Good, +Good]`를 요구한다. 흡수 윈도우를 Bad까지 열면 직후 포인트를 과보호하거나(early 흡수) 홀드 직전 탭을 삼킨다.
- **consume만, BODY_ACTIVE 강제 승격 없음**: 매칭 시 `absorbedLong` Set에 표시만 하고 판정은 emit하지 않는다. 길이>0은 `update()` 자동활성화 + `checkLongNoteBodyHold`(held)가, 길이0은 `checkLengthZeroHoldOnly`(held)/`checkSlideReleaseOnRelease`(keyup)가 판정한다. keydown 시점에 BODY_ACTIVE로 앞당기면 시작점 허용 윈도우를 우회해 판정 타이밍이 왜곡되므로 하지 않는다.
- **재흡수 방지(단일 진입점)**: `absorbedLong`로 같은 프레임/윈도우의 후속 입력이 같은 노트를 다시 흡수하지 못하게 하고, COMPLETE/활성화 시 정리한다. 길이0은 held로 시작 윈도우에 진입한 시점에도 흡수 표시해, keydown 없이 held로 진입한 경우의 직후 포인트도 보호한다.
- **헤드 유무**: 생성자에서 같은 lane·시작 시각(±1ms)의 PointNote 존재 여부로 `headlessLongCache`를 1회 계산(NoteType.LONG 한정). 헤드 있는 롱노트는 후보에서 빠져 헤드가 입력을 대표 흡수(더블 방지).

검증: `JudgmentEngine.test.ts`에 흡수/회귀 테스트 8개 추가(슬라이드 직후 포인트 보호, 다중키 a held+b, 미리 떼기 980ms, 길이>0 홀드 중 탭, 헤드 있는 롱노트 더블 방지). 전체 905개 테스트 통과, `tsc --noEmit` 클린, 회귀 0건.

## 12. 구현 상태 (2차, 2026-06-27)

§3.4의 더블 롱노트·릴리즈 노트 흡수를 판정 로직 수준에서 구현했다.

- **헤드 없는 더블 롱노트 2키 흡수**: 흡수 추적을 `absorbedLong: Set<number>` → `absorbedLongKeys: Map<number, Set<string>>`(노트별 흡수한 키 집합)로 바꿔, 필요 키 수(LONG 1 / DOUBLE_LONG 2)를 채우면 흡수 종료(`isHeadlessAbsorbable`에서 `size >= requiredAbsorbCount`). 서로 다른 키 2개를 채워야 종료되고 같은 키 재입력은 Set 특성상 무효. `headlessLongCache`에 DOUBLE_LONG 포함. 이 2키 흡수는 앞으로 넣을 **더블 hold-only(`doubleLong` + `holdOnly`) 입력의 판정 그라운드워크**다 — 헤드 없는 더블 홀드 자체는 이미 동작하며, 현재 입력이 안 되는 것은 더블 hold-only다.
- **릴리즈 노트(길이 0 일반)**: 별도 작업이 거의 불필요했다 — 릴리즈 노트는 type LONG이라 1차의 일반 LONG 흡수가 그대로 적용된다(keydown 흡수 → 직후 포인트 보호 → `BODY_AWAITING_RELEASE` + keyup 종결 판정). `executeTerminationJudgment`에 흡수 표시 정리(`absorbedLongKeys.delete`)만 추가하고 확인 테스트를 더했다.
- **held sentinel**: 길이 0 슬라이드가 keydown 없이 held로 시작 윈도우에 진입한 경우는 `HELD_ABSORB_SENTINEL`을 키 집합에 넣어 흡수 표시(필요 키 수 1을 충족).

검증: 더블 롱노트 5개 + 릴리즈 노트 1개 테스트 추가(서로 다른 2키 흡수·같은 키 무효·비동시 입력 보호·더블 헤드 더블 방지·릴리즈 keyup 판정), 전체 911개 통과 + `tsc --noEmit` 클린.

**경계(적대적 검증에서 확인)**: doubleLong의 흡수 종료는 "흡수에 닿은 서로 다른 키의 합집합 카운트"인데, 바디 2키 추적은 "활성화 프레임의 동시 홀드 키 수"다. 둘은 **비동시 입력(A를 눌렀다 떼고 B를 누름)**에서 갈린다. 그러나 이는 판정 결과상 회귀가 아니다 — 더블 홀드는 본래 2키 *동시* 유지가 필요하므로 비동시 입력은 변경 전에도 부분 실패(1키 유지 + 1키 Miss)였고, 흡수 변경은 오히려 직후 노트를 보호한다. 정상 플레이(2키 동시)에서는 발생하지 않으며, 헤드 없는 doubleLong은 미authoring이라 차트에 등장하지도 않는다. 따라서 흡수 종료를 "동시 홀드"로 좁혀 이중 홀드 의미를 바꾸는 대신, 현 동작(union 카운트 + 기존 부분 실패 판정)을 유지하고 테스트로 명시했다.

남은 것(hold-only 확장 — `../rfd/0005-hold-only-long-note.md` 스코프):
- **더블 hold-only(`doubleLong` + `holdOnly`) 입력·authoring** — 추가 예정. 길이 0이면 "더블 슬라이드"이며, 판정은 `checkLengthZeroHoldOnly`의 단일키 held 체크를 2키로 확장해야 한다(현재는 싱글 기준). 본 RFD의 2키 흡수가 그 입력 매칭 토대를 이미 제공한다.
- **트릴 hold-only(`trillLong` + `holdOnly`)** — 추가 논의 필요.
