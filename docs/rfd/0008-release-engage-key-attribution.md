# RFD 0008: hold-only 놓기 누설 차단 (소진 키)

**Status:** Accepted (2026-06-27, 2026-06-28 단순화)

## 관련 문서

- [`docs/rfd/0006-earliest-matching-headless-long-note.md`](0006-earliest-matching-headless-long-note.md) — keydown 흡수
- [`docs/rfd/0007-release-lockout.md`](0007-release-lockout.md) — 이 RFD가 대체하는 슬라이드 락아웃
- [`docs/spec/game-core.md`](../spec/game-core.md), [`docs/spec/note-system.md`](../spec/note-system.md), [`docs/context/glossary.md`](../context/glossary.md)

> **2026-06-28 단순화:** 처음엔 release를 "그 노트를 engage(흡수)한 키"에 귀속시키는 `engageKeys` 예외를 두었으나, **롱노트는 한 레인에서 겹칠 수 없다는 배치 불변**(§4) 때문에 그 예외가 막을 케이스가 존재 불가능함을 확인하고 제거했다. 현재 모델은 "소진 키의 놓기 release는 직후 노트 판정을 무조건 스킵"으로 단순하다(§7).

---

## 1. 배경

keydown은 "가장 이른 노트 매칭 + 흡수(RFD 0006)"로 한 입력이 한 노트에 귀속된다. 그러나 release(keyup)는 레인 단위 브로드캐스트라 귀속이 없어, **held로 완료된(hold-only) 노트를 놓는 release가 직후 노트(슬라이드 미리-떼기·릴리즈 노트·롱 끝점)로 새는 누설**이 있다(재현됨). RFD 0007은 슬라이드 표면만 시간 락아웃으로 막았고, 끝점·릴리즈 노트는 lane-held 모델 때문에 못 막았다.

## 2. 핵심 결정

**terminal hold-only/슬라이드를 held로 완료시킨 키는 "소진(spent)"되고, 그 키의 release("놓기")는 직후 노트의 release 판정(끝점 종결·슬라이드 미리-떼기·릴리즈 노트)을 트리거하지 않는다.** held로 완료된 노트는 떼는 판정이 면제(hold-only)되어 어차피 판정이 없으므로, 그 키를 놓는 것은 "이미 끝난 유지를 놓는 행위"일 뿐 직후 노트의 입력이 아니다.

**유지 충족(`checkLongNoteBodyHold`)은 바꾸지 않는다(lane-held 유지).** 이 변경은 release "놓기"가 새는 것만 막고, 한 롱노트를 어떤 키로든 유지하거나 키를 교대(홀드 이어잡기)하는 것은 그대로다(§5).

## 3. 규칙

### 3.1 소진(spent)

- **소진(`spentReleaseKeys`)**: terminal hold-only(길이>0)·슬라이드(길이 0 hold-only)를 **held로 완료한 시점의 실제 held 키**가 레인 소진 집합에 들어간다. 완료 시점의 held 키를 쓰므로 흡수 없이 held로 진입한 **pre-held 입력도 닫힌다.** 소진 키는 떼거나(놓기 처리 후) 다시 누르면 해제된다.
- **가드(`isSpentRelease(lane, key)`)**: 그 키가 소진 집합에 있으면 직후 노트의 release 판정을 스킵한다. 노트별 예외 없이 레인 단위로 무조건 스킵 — 안전성은 §4 불변에 의존한다.

### 3.2 release 판정 가드

- **끝점 종결(`tryEndpointJudgmentOnRelease`)**: 소진 키의 release면 스킵.
- **슬라이드 미리-떼기(`checkSlideReleaseOnRelease`)**: 소진 키의 release면 스킵 → 선행 hold-only를 놓는 키가 직후 슬라이드를 미리-떼지 않는다. RFD 0007 락아웃 불필요.
- **릴리즈 노트(길이 0 일반)**: 소진 키의 keyup은 "놓기"라 릴리즈 노트로 가지 않는다.

### 3.3 연결은 소진하지 않는다

**연결(끝점=다음 시작점이 맞닿음)은 "계속 잡는 것"이지 "놓는 것"이 아니므로 소진하지 않는다.** 연결 완료 분기에서는 소진을 기록하지 않는다. 이래야 hold-only가 연결로 이어진 뒤 체인 끝에서의 release-tap이 소진에 막히지 않는다(회귀 테스트: hold-only L1 → 일반 롱 L2 연결, 끝까지 유지 후 L2 끝 release-tap → Perfect).

### 3.4 유지(보존)

- **유지 충족(`checkLongNoteBodyHold`)은 lane-held 그대로.** 키 스왑(홀드 이어잡기)은 release 판정이 아니라 유지 충족의 영역이라 그대로 동작한다(§5).
- **연결 판정**, **홀드 중 탭**, **홀드 이어잡기**, **같은 키 slip grace**는 모두 그대로.

## 4. 의존하는 불변 — 롱노트 겹침 불가

이 단순화("소진 키 = 노트별 예외 없이 무조건 스킵")가 안전한 이유는 **한 레인에서 두 롱노트가 시간상 겹칠 수 없다는 배치 불변** 때문이다:

- 다중키 동시 유지 구간은 **`doubleLong` 한 노트**(key1/key2 추적)다 — 별개의 두 롱이 아니다.
- 순차 전환은 **연결**로 표현된다(`-=-`: `-` 끝=`=` 시작, `=` 끝=`-` 시작). 연결 경계엔 동시 held 구간도 릴리즈 판정도 없다.
- 따라서 한 순간에 레인당 진행 중인 롱은 최대 하나다. **한 키가 "롱 X를 아직 유지 중"이면서 동시에 "롱 Y를 소진 완료"인 상태는 발생할 수 없다.** → 소진 키가 다른 진행 중 롱의 정당한 release를 잘못 삼킬 경로가 없다.

이 불변은 배치(차트)에서 보장되며 판정 엔진은 이를 *전제*한다. **차트 검증에서 이미 강제된다** — `src/shared/validation`의 `validateNoDuplicates`(같은 시작 박 두 롱 = 중복 시작점)와 `validateNoLongOverlap`(시작 박이 다른 겹침 = 한쪽 끝점이 상대 열린 바디에 들어감)의 합이 모든 바디 겹침을 거부하며, `validation.test.ts`의 "롱노트 겹침 불가 불변" 회귀 테스트로 잠갔다. 불변과 근거는 [`docs/spec/note-system.md`](../spec/note-system.md)·[`src/game/CONTEXT.md`](../../src/game/CONTEXT.md)의 불변 섹션에 명시한다.

## 5. 홀드 이어잡기는 보존된다

이 RFD는 release "놓기" 누설만 막고 유지 충족(`checkLongNoteBodyHold`)은 lane-held 그대로 둔다(§3.4). 따라서 한 롱노트 진행 중 다른 키로 이어받는 **홀드 이어잡기는 lane-held + grace로 계속 동작한다** — 키 스왑은 유지 충족의 영역이고, 일반 롱노트의 release-tap은 소진 키가 아니므로 막히지 않는다(테스트 확인: KeyA→KeyB 키 교대 후 KeyB release-tap → Perfect).

소진이 영향을 주는 건 **terminal hold-only/슬라이드를 held로 완료시킨 키의 "놓기" release**뿐이고, 그 노트는 어차피 떼는 판정이 면제다. 따라서 **릴리즈탭·홀드 트릴·홀드 이어잡기·홀드 중 탭이 모두 보존**된다.

## 6. 케이스 검증

| 케이스 | 기대 | 동작 |
|---|---|---|
| hold-only A 완료 후 놓기 → 직후 슬라이드 B | B 보호 | A 놓는 키 = 소진 → B 미발화 ✅ |
| hold-only A → 직후 릴리즈 노트 | 보호 | A 놓는 키 = 소진 → keyup이 릴리즈 노트로 안 감 ✅ |
| pre-held hold-only(흡수 밖) 완료 후 놓기 → 직후 슬라이드 | 보호 | 소진=완료 시점 held 키라 pre-held도 닫힘 ✅ |
| 연결 체인(hold-only→일반 롱) 끝 release-tap | 정상 종결 | 연결은 소진 안 함 → 막히지 않음 ✅ |
| 릴리즈탭(소유 키 떼기+다음 노트) | 정상 | 일반 롱 소유 키는 소진 아님 → 정상 종결 ✅ |
| 홀드 트릴(롱마다 키, 연결) | 정상 | 연결은 held 체크, 소진 무관 ✅ |
| 홀드 이어잡기(키 스왑 후 release-tap) | 정상 종결 | 유지=lane-held 보존, release 키 소진 아님 ✅ |

## 7. engage-키를 고려했다 제거한 이유

초안은 "소진 키여도 *그 노트를 engage(흡수)한 키*면 통과"라는 노트별 예외(`engageKeys`)를 두었다. 이는 **"hold-only 롱과 겹치는, 다른 키의 일반 롱"** — 한 롱이 hold-only로 완료되며 다른 롱의 still-held 키를 소진시키는데, 그 다른 롱은 나중 끝점에서 정당히 release되어야 하는 케이스 — 를 막기 위함이었다. 그러나 §4 불변에 의해 **그런 겹침은 배치상 존재 불가능**하다. 막을 케이스가 없으므로 `engageKeys`를 제거하고 가드를 레인 단위 "소진=무조건 스킵"으로 단순화했다.

## 8. RFD 0007 대체

슬라이드 락아웃(`releaseLockoutUntilMs` 등)은 소진 모델이 더 정밀하게 대체하므로 **제거**한다.

## 9. 영향 문서/코드

- 구현: `src/game/judgment/JudgmentEngine.ts` — `spentReleaseKeys`/`spendHeldKeys`/`isSpentRelease`, 종결·슬라이드 가드, 연결 비소진, RFD 0007 락아웃 제거. (`engageKeys`는 단순화로 제거됨.)
- `docs/context/glossary.md`, `src/game/CONTEXT.md` — 소진/release 누설 차단 용어 + **롱노트 겹침 불가** 불변.
- `docs/spec/game-core.md` — release 누설 차단 한 줄. `docs/spec/note-system.md` — 배치 불변.
- 회귀 테스트: 누설 3표면(pre-held 포함), 연결 체인, 릴리즈탭, 홀드 트릴, 홀드 중 탭, 더블롱.

## 10. 한계/미해결

- **소진 가드의 안전성은 §4 배치 불변(겹침 불가)에 의존한다.** 판정 엔진 자체는 이를 런타임에 강제하지 않지만, **차트 검증(`validateChart`)이 이를 강제한다** — `validateNoDuplicates` + `validateNoLongOverlap`의 합이 한 레인 롱노트 바디 겹침을 모두 거부하며(`validation.test.ts` "롱노트 겹침 불가 불변" 회귀 테스트로 잠금), 에디터 저장·배치·붙여넣기 경로가 이 검증을 통과한 차트만 만든다. (별도의 `validateNoLongNoteBodyOverlap` 규칙은 기존 두 규칙과 완전히 중복이라 추가하지 않았다.)
- **(별개·기존 빈틈) 홀드 중 탭의 탭 키 과발화**: KeyA로 롱 유지 중 KeyB로 탭한 뒤 KeyB를 그 롱의 끝점 윈도우에서 떼면 롱이 조기 종결된다. RFD 0008 이전부터 있던 동작이며 별도 과제로 추적.
