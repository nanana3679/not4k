# RFD 0007: held 완료 직후 release 락아웃 (release 누설 방지)

**Status:** Superseded by [RFD 0008](0008-release-engage-key-attribution.md) (2026-06-27) — 슬라이드 락아웃은 제거되고, **공릴리즈 키(empty release)** 모델로 일반화되어 끝점·릴리즈 노트 누설까지 막는다(공릴리즈 키의 놓기 release는 직후 노트 판정을 무조건 스킵, 노트별 예외 없음). 아래는 그 중간 단계의 기록이다.

## 관련 문서

- [`docs/rfd/0006-earliest-matching-headless-long-note.md`](0006-earliest-matching-headless-long-note.md) — keydown 흡수(이 RFD의 release판 대응물)
- [`docs/research/slide-note-input-matching.md`](../research/slide-note-input-matching.md) — Sonolus `disallowEnd` 패턴
- [`docs/spec/game-core.md`](../spec/game-core.md), [`docs/spec/note-system.md`](../spec/note-system.md)

---

## 1. 배경

keydown은 "가장 이른 노트 매칭 + 흡수(consume)"로 한 입력이 한 노트에만 귀속된다(RFD 0006). 그러나 **release(keyup)는 그 대칭이 없다** — `onLaneRelease`는 레인 단위로 브로드캐스트되어, `checkSlideReleaseOnRelease`(길이 0 hold-only 슬라이드 미리-떼기 Perfect)와 `tryEndpointJudgmentOnRelease`(롱노트 끝점 종결)가 윈도우 조건만 보고 발화한다.

## 2. 문제

hold-only처럼 **떼는 판정이 면제**된 노트는 held로 완료된 뒤 유저가 손을 놓는다. 이 "놓기" release가 직후 노트의 release-대상 윈도우에 들어가면 의도치 않은 판정이 발생한다.

**확인된 누설**(재현됨): hold-only 롱노트 A(1000~2000)를 유지해 끝점 Perfect·COMPLETE → A를 놓으려 2010에 떼면, 직후 슬라이드 B(길이 0 hold-only, 2050)의 미리-떼기 윈도우 `[2050-GOOD, 2050)`에 들어가 **B가 의도치 않은 Perfect(delta -40)** 를 받는다.

근본 원인: held로 완료된 노트의 "놓기" release가, 그 release를 소비하는 주체가 없어 직후 노트로 전파된다.

## 3. 결정 — held 완료 직후 release 락아웃

Sonolus `disallowEnd`(탭 판정 후 그 touch가 짧은 시간 SlideEnd를 claim 못 함)를 release판으로 도입한다.

### 3.1 락아웃 설정

노트가 **held 상태로 완료**되는 시점에 그 레인의 락아웃을 `songTimeMs + GOOD 윈도우`까지 설정한다. 대상 완료:

- hold-only 롱노트 끝점 Perfect (유지 중 → 즉시 Perfect)
- 길이 0 hold-only 슬라이드의 노트 시점 held Perfect
- 연결 판정 Perfect (유지 중)

이들은 "떼는 동작 없이 held로 완료"되므로, 직후의 release는 그 노트에 대한 판정이 아니라 "놓기"다.

### 3.2 락아웃 효과

락아웃 윈도우(`완료 시각 ~ 완료 시각 + GOOD`) 안에 들어온 release는 **직후 슬라이드의 미리-떼기 Perfect(`checkSlideReleaseOnRelease`)를 트리거하지 않는다**. release의 상태 관리(heldKeys, 키별 release 시각)는 그대로 수행한다.

**슬라이드 표면에만 한정하는 이유**: not4k의 싱글 롱노트는 lane-held(레인의 아무 키나)로 판정하므로, release를 특정 노트에 귀속시킬 수 없다. 따라서 끝점 종결(`tryEndpointJudgmentOnRelease`)에 lane 단위 락아웃을 걸면 (a) 같은 레인에서 다른 키로 동시 진행 중인 별개 롱노트의 정상 끝점 release를 과차단하고, (b) 릴리즈탭(`BODY_AWAITING_RELEASE`)도 막는다. 슬라이드 미리-떼기는 길이 0이라 동시 슬라이드가 없어 과차단이 없는 유일한 표면이다.

### 3.3 보존(락아웃하지 않는 것)

- **모든 끝점 종결(`tryEndpointJudgmentOnRelease`)**: 릴리즈탭, 동시 진행 롱노트 끝점 등은 락아웃하지 않는다(§3.2 이유).
- **선행 완료가 없는 슬라이드 미리-떼기**: 직전에 held 완료가 없으면 락아웃이 없으므로, 고립된 슬라이드를 미리 떼서 Perfect 받는 정상 동작은 영향 없다.
- **윈도우 = GOOD**: 난이도 윈도우에 비례. 직후 슬라이드가 GOOD보다 멀리 있으면(정상 간격) 그 슬라이드의 정상 미리-떼기는 락아웃 밖이라 보존된다.

## 4. 케이스 검증

| 케이스 | 기대 | 락아웃 동작 |
|---|---|---|
| hold-only A 완료 후 놓기 → 직후 슬라이드 B | B 미판정(보호) | A 완료 시 락아웃 → B 미리-떼기 스킵 ✅ |
| 고립 슬라이드 미리 떼기 | 떼는 시점 Perfect | 선행 완료 없음 → 락아웃 없음 → 정상 ✅ |
| 릴리즈탭 / 동시 진행 롱노트 끝점 | 떼는 시점 종결 판정 | 끝점 종결은 락아웃 안 함 → 정상 ✅ |
| 연결 체인(유지 이어잡기) | 중간 release 없음 | held 유지라 release 자체가 없음 ✅ |
| held 완료 후 GOOD 밖 슬라이드 release | 정상 판정 | 락아웃(GOOD) 만료 → 정상 ✅ |
| hold-only A 완료 후 놓기 → 직후 **릴리즈 노트** | (한계) 누설 가능 | 끝점 락아웃 안 하므로 미보호 — §7 한계 |

## 5. 대안 (기각)

- **release도 "가장 이른 매칭 + 소비"(keydown 완전 대칭)**: 개념적으로 가장 깔끔하나 release가 끝점·연결·릴리즈탭 상태머신 깊숙이 얽혀 회귀 리스크가 크다. 락아웃이 동일 효과를 더 적은 변경으로 달성한다.

## 6. 영향 받는 문서/코드

- 구현: `src/game/judgment/JudgmentEngine.ts` — 레인별 락아웃 상태, held 완료 시점 설정(checkLongNoteBodyEnd hold-only/연결, checkLengthZeroHoldOnly), onLaneRelease/tryEndpointJudgmentOnRelease/checkSlideReleaseOnRelease 가드.
- [`docs/spec/game-core.md`](../spec/game-core.md) "입력-노트 매칭"에 release 락아웃 한 줄.
- 회귀 테스트: 릴리즈탭, 연결 체인, 고립 슬라이드 미리-떼기.

## 7. 한계와 미해결 질문

- **끝점/릴리즈 노트 표면의 놓기 누설은 1차에서 막지 않는다**: hold-only 완료 직후의 놓기 release가 직후 **릴리즈 노트(길이 0 일반)** 또는 BODY_ACTIVE 롱노트 끝점으로 새는 케이스는 슬라이드와 달리 lane 단위 락아웃으로 안전하게 막을 수 없다(§3.2 — 단일 롱노트의 lane-held 모델 때문에 release를 노트에 귀속 못 함 → 동시 롱·릴리즈탭 과차단). 이를 막으려면 release를 keydown처럼 키-귀속으로 추적하는 "release 가장 이른 매칭 + 소비"(5절 기각안)가 필요하다. 릴리즈 노트는 "윈도우 내 임의 keyup"이 정의이므로 차트 배치(직후에 릴리즈 노트 금지)로 관리한다 — keydown 흡수가 직후 포인트 배치를 검수로 관리하는 것과 동형.
- 락아웃 윈도우를 GOOD로 둘지, 별도 상수로 분리·튜닝할지(현재 GOOD).
