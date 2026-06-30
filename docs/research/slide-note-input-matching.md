# 슬라이드/홀드 노트 입력 매칭 — 타 구현체 조사

> 슬라이드(길이 0 `holdOnly`) 노트 직후에 탭 노트가 가까이 배치됐을 때 단일 입력이 양쪽에 `consume`되는 문제(`../rfd/0006-earliest-matching-headless-long-note.md`)를 풀기 위해, 슬라이드/터치/홀드 노트가 있는 리듬게임 구현체의 입력-노트 매칭 방식을 조사했다.
>
> 조사 방법: (1) deep research 다중 소스 검색·검증, (2) Sonolus pjsekai 엔진 코드 정독(서브에이전트).

---

## 1. 배경 — not4k의 문제

not4k는 4키 키보드 리듬게임이며, 입력 매칭은 "가장 이른(earliest) 미처리 노트"에 keydown을 매칭한다. 단 현재 구현은 **롱노트(구간 노트)를 매칭에서 제외**하고 held 상태로만 판정한다. 이 예외 때문에, 헤드 없는 롱노트(특히 길이 0 슬라이드)의 시작 입력이 직후 포인트 노트로 흘러가 early로 `consume`된다. 다른 구현체가 이 문제를 어떻게 다루는지가 조사 목적이다.

---

## 2. 핵심 발견 — Sonolus pjsekai (프로젝트 세카이 커뮤니티 엔진)

저장소: [`NonSpicyBurrito/sonolus-pjsekai-engine`](https://github.com/NonSpicyBurrito/sonolus-pjsekai-engine) (default branch `main`, 2025-12 archived). 경로는 `play/src/engine/playData/archetypes/` 기준.

**not4k가 설계한 통합 모델(헤드 없는 롱노트가 keydown을 `consume`하되 판정은 분리)과 사실상 동일한 구조를 쓴다.**

### 2.1 claim / judge 2-phase 분리

프레임마다 두 단계로 동작한다:

1. **`updateSequential()` (claim phase)**: 각 노트가 입력을 **claim(예약)** 만 한다. 판정 없음.
2. **`touch()` (judge phase)**: claim 결과를 조회해서 **자기가 가져간 touch로만 판정**한다.

→ 이 분리가 not4k의 **"keydown을 `consume`하되 그 keydown으로 판정하지 않는다"의 정확한 원형**이다.

### 2.2 `ClaimManager` — 한 입력 = 한 노트

`ClaimManager.ts`는 `touchIndex → {노트 index, time, hitbox, ...}` 사전을 들고, 한 touch는 사전의 한 칸에만 들어간다 → **한 입력 = 한 노트**가 자료구조로 보장된다. `claim()`은 변위(displacement) 루프로, 더 우선인 노트가 기존 점유 노트를 쫓아내고 재배치한다.

`InputManager.ts`는 두 매니저를 둔다 — 시작 입력용 `claimStartManager`(`checkTouch = touch.started`, 즉 keydown)와 끝 입력용 `claimEndManager`(`touch.ended`, 즉 keyup). `getClaimedStart(index)`로 그 노트가 가져간 touch를 조회한다(없으면 -1 → 그 프레임 판정 안 함).

### 2.3 earliest wins + tie-break (`findBestTouchIndex`)

우선순위:
- **1차: 더 이른 `targetTime`(판정 목표 시각)이 이긴다.** (`time < claimedStart.time`이면 기존 점유 노트를 강탈)
- **동률 tie-break**: leniency 포함 `fullHitbox`로는 둘 다 닿아도, narrow `hitbox`(노트 본체) 기준 + touch와의 거리로 가른다.
- **순서 비의존(order-independent)**: 어떤 순서로 claim이 호출돼도 변위 루프가 "더 이른 노트가 점유"하도록 보정한다.

### 2.4 노트 타입별 입력 처리 (claim vs passive)

| 노트 타입 | claim? | 판정 트리거 | 입력 |
|---|---|---|---|
| **TapNote** | ✅ `claimStart` | `touch()`에서 즉시 판정 | keydown (`touch.started`) |
| **SlideStartNote** (헤드) | ✅ `claimStart` | `touch()`에서 즉시 판정 | keydown |
| **SlideConnector** (유지 구간) | ❌ **passive** | 판정 없음. hold 상태만 갱신 | held touch 스캔 |
| **SlideEndNote** (꼬리) | ✅ `claimEnd` | `touch()`에서 판정 | keyup (`touch.ended`) |

- **Tap / SlideStart**: keydown을 claim하고 그 keydown의 시각으로 판정. → not4k의 "헤드 있는 노트".
- **SlideConnector**: `ClaimManager`를 전혀 안 쓴다. 활성 touch가 hitbox 안에 있으면 `lastActiveTime`만 갱신(hold 표시). → not4k의 **"held 상태로만 판정"의 원형**.

### 2.5 `consume` 방지 메커니즘

- **(A) `ClaimManager` 사전**: 슬라이드 시작과 탭이 같은 keydown을 노려도 단일 사전을 공유하므로 그 touch는 **하나**에만 들어간다. earliest가 이기고, 진 노트는 `getClaimedStart`가 -1을 받아 그 프레임 판정 못 함. **keydown 1회 = 노트 1개 소비**가 구조적으로 보장.
- **(B) `disallowEnd` 락아웃**: TapNote가 판정 직후 `disallowEnd(touch, targetTime + 0.25s)` 호출. → 이 touch는 0.25초 동안 어떤 SlideEnd도 claim 못 한다(`canEnd` false). 짧은 탭의 누름-뗌이 직후 슬라이드 끝(keyup)을 가로채는 것을 차단.
- **`disallowEmpty`**: 입력을 소비한 touch는 "빈 입력(헛 누름)" 페널티 대상에서 제외.

---

## 3. osu!mania / Quaver

- **osu! "notelock"(앞 노트 처리 전 뒤 노트 잠금)은 안티패턴**으로 취급된다 — cascading miss(연쇄 미스)를 유발하기 때문 ([osu#2854](https://github.com/ppy/osu/issues/2854)). not4k의 통합 모델은 "`consume` 후 다음 노트 통과"라 notelock이 아니다.
- **Quaver**: 홀드 노트는 hold period 동안 held 상태를 확인한다([Quaver#2429](https://github.com/Quaver/Quaver/issues/2429)).
- 단, "윈도우 겹침으로 단일 키스트로크가 여러 노트에 동시 매칭된다"는 주장은 검증에서 반박됐다(노트별 claim/처리로 막힘).

---

## 4. not4k 매핑 (RFD 0006 구현 지침)

not4k는 단일 패스 `findEarliestUnprocessedNote`라 Sonolus의 2-phase displacement까지는 불필요하다. 권장 매핑:

1. **`findEarliest`에 헤드 없는(유지 시작 전) 롱노트를 매칭 후보로 포함.**
2. keydown 처리 시 그 노트가 keydown에 **consume 플래그**를 단다 → 같은 프레임 후속 노트가 재`consume` 못 함 (= Sonolus "사전 1칸 = 1 touch"와 동등).
3. **롱노트면 consume만**(판정은 held/keyup 경로), **포인트면 consume + 즉시 판정**.
4. **`consume` 종료**: 롱노트가 필요 키 수(싱글 1 / 더블 2)를 채우면 후보에서 빠짐 → 이후 입력은 다음 노트로(홀드 중 탭).
5. **tie-break**: earliest time → 레인 → 노트 인덱스 (Sonolus의 hitbox 거리 tie-break은 레인 고정이라 불필요).
6. **끝점/릴리즈 `consume`**: `disallowEnd` 같은 짧은 락아웃 패턴 참고.

> **not4k 고유(코드에서 확인 불가)**: "헤드 없는 슬라이드(길이 0 `holdOnly`)"라는 노트 타입은 Sonolus에 없다 — 모든 슬라이드는 SlideStart(claim + keydown 판정)로 시작한다. not4k가 원하는 "`consume`만 하고 판정은 분리(held/keyup)"하는 변형은 not4k에서 새로 설계해야 한다. 단 그 빌딩블록(claim/judge 분리, 사전 기반 1입력=1노트, 락아웃, Connector passive hold)은 모두 검증됐다.

---

## 5. 출처

- [sonolus-pjsekai-engine (GitHub)](https://github.com/NonSpicyBurrito/sonolus-pjsekai-engine) — `ClaimManager.ts`, `InputManager.ts`, `TapNote.ts`, `SlideStartNote.ts`, `SlideConnector.ts`, `SlideEndNote.ts`, `windows.ts`
- [Sonolus wiki — engine-specs/essentials/input](https://wiki.sonolus.com/engine-specs/essentials/input)
- [osu! #2854 — note lock / cascading misses](https://github.com/ppy/osu/issues/2854)
- [Quaver #2429 — hold judgement](https://github.com/Quaver/Quaver/issues/2429)
- [osu!mania judgement (wiki)](https://osu.ppy.sh/wiki/en/Gameplay/Judgement/osu!mania)

## 관련 문서

- 결정: `../rfd/0006-earliest-matching-headless-long-note.md`
- `holdOnly`: `../rfd/0009-hold-only-long-note.md`
- 입력 매칭: `../spec/game-core.md`, 노트 시스템: `../spec/note-system.md`
