# RFC 0002: Breakthrough Perfect-only 회복

**Status:** Accepted (2026-06-10)

**관련 문서:**

- [`docs/rfd/0001-flight-rules-and-observer-boundary.md`](0001-flight-rules-and-observer-boundary.md) — 비행 규칙과 Observer 경계
- [`docs/research/beatmania.md`](../research/beatmania.md) — IIDX 게이지 참조 모델과 한계
- [`docs/context/glossary.md`](../context/glossary.md) — 비행 규칙 용어 정의
- [`src/game/CONTEXT.md`](../../src/game/CONTEXT.md) — Gameplay 컨텍스트

---

## 1. 배경

RFC 0001은 `Takeoff / Ascent / Breakthrough`를 not4k의 비행 규칙 이름으로 채택했다.
그중 Breakthrough는 처음에 beatmania IIDX의 `TIME HELL mode`처럼 회복하지 않는
HARD/EX HARD 계열 동작을 참조 모델로 검토했다.

이 참조는 "회복 불가"라는 긴장감을 만들지만, not4k가 원하는 플레이 감정과 어긋난다.
회복이 전혀 없으면 유저는 차트를 정확히 치기보다, 위험한 구간에서 입력을 뭉개거나
최대한 덜 틀리는 방향으로 최적화할 수 있다.

not4k의 Breakthrough는 단순 생존이 아니라 **정확한 입력으로 고도를 되찾는 규칙**이어야 한다.

---

## 2. 문제

회복 불가 Breakthrough는 다음 위험을 만든다.

- `Perfect`를 노리는 동기가 약해진다.
- 이미 낮아진 고도를 회복할 방법이 없으므로 후반부 플레이가 방어적으로 바뀐다.
- 유저가 패턴을 정확히 읽고 치기보다 손실을 줄이는 입력을 선택할 수 있다.
- `TIME HELL mode` 참조가 강해질수록 not4k 고유의 정확도 중심 철학이 흐려진다.

즉, 회복 불가 모델은 어렵지만, not4k가 원하는 "정확하게 쳐서 돌파한다"는 의미와는 다르다.

---

## 3. 결정

**Breakthrough는 beatmania IIDX에 상응하는 게이지가 없는 not4k 고유 비행 규칙으로 둔다.**

Breakthrough의 기본 규칙은 다음과 같다.

| 판정 | 고도 변화 |
| --- | --- |
| Perfect | 고도 회복 |
| Great / Good | 회복 없음 |
| Bad / Miss | 고도 감소 |
| 빈 레인 입력으로 발생한 Bad | 고도 감소 |

추가 규칙:

- 고도는 100에서 시작한다.
- 고도는 100을 초과하지 않는다.
- 고도 0에 도달하면 실패한다.
- 구체적인 회복량과 감소량은 밸런싱 단계에서 정한다.
- `Breakthrough`의 참조 모델을 `TIME HELL mode`, `Time Hell Gauge`, `EX-HARD`로 설명하지 않는다.

---

## 4. 의도

Breakthrough의 메시지는 "덜 틀려라"가 아니라 **"정확히 쳐야 다시 올라간다"**이다.

이 규칙은 다음 플레이를 유도한다.

- 어려운 구간에서도 `Perfect`를 노릴 이유를 유지한다.
- `Great / Good`은 생존에 충분하지 않으므로 정확도 압박을 만든다.
- 실수 이후에도 회복 경로가 있어 플레이가 끝까지 공격적으로 유지된다.
- 뭉개기 입력은 `Bad / Miss` 위험 때문에 장기적으로 불리하다.

---

## 5. 대안

### A. 회복 불가 유지

`TIME HELL mode`처럼 고도가 회복하지 않는 Breakthrough를 유지한다.

**장점**

- 규칙이 단순하다.
- 한 번의 실수가 무겁게 느껴진다.
- 생존 압박이 강하다.

**단점**

- 정확도보다 손실 최소화가 우선될 수 있다.
- 이미 잃은 고도를 되찾을 방법이 없어 플레이 감정이 방어적으로 바뀐다.
- not4k의 "정확한 손배치와 입력" 목표와 어긋난다.

### B. Hard/EX-HARD식 일반 회복

`Perfect / Great / Good`이 모두 어느 정도 회복하게 둔다.

**장점**

- 기존 리듬게임 게이지와 익숙하다.
- 생존 규칙으로 이해하기 쉽다.

**단점**

- Breakthrough만의 정체성이 약하다.
- `Perfect`의 특별한 의미가 줄어든다.
- 높은 정확도를 강제하는 규칙이 아니라 일반 생존 게이지가 된다.

### C. Perfect-only 회복

`Perfect`만 고도를 회복하고, `Great / Good`은 회복하지 않는다.

**장점**

- Breakthrough가 정확도 중심 규칙이 된다.
- 실수 이후에도 회복 경로가 남는다.
- not4k 고유 규칙으로 차별화된다.

**단점**

- 상응하는 beatmania IIDX 게이지가 없다.
- 회복량과 감소량 밸런싱이 어렵다.
- `Great / Good`을 실패처럼 느끼지 않게 결과 표현을 조심해야 한다.

---

## 6. 채택 방향

**C. Perfect-only 회복**을 채택한다.

RFC 0001의 Play/Observer 경계, `Takeoff / Ascent / Breakthrough` 명칭,
비행 규칙과 Lv./난이도명의 분리 결정은 유지한다.
이 RFC는 Breakthrough의 참조 모델과 회복 규칙만 대체한다.

---

## 7. 영향 받는 문서

- `docs/rfd/0001-flight-rules-and-observer-boundary.md`
  - Breakthrough의 `TIME HELL mode` 참조가 RFC 0002로 대체되었음을 표시한다.
- `docs/research/beatmania.md`
  - `TIME HELL mode`는 과거 검토한 참조 모델이며, 현재 Breakthrough 모델이 아님을 표시한다.
- `CONTEXT.md`
  - Breakthrough 정의를 Perfect-only 회복 규칙으로 갱신한다.
- `docs/context/glossary.md`
  - 비행 규칙 용어 정의를 갱신한다.
- `src/game/CONTEXT.md`
  - Gameplay 컨텍스트에서 Breakthrough의 게이지 참조 혼동을 제거한다.

---

## 8. 미해결 질문

1. Perfect 회복량은 고정값인가, 콤보나 구간 밀도에 따라 달라지는가?
2. Great / Good은 완전 중립인가, 고난도 밸런스를 위해 미세 감소를 허용할 것인가?
3. Bad와 Miss의 감소량은 같은가, Miss를 더 크게 볼 것인가?
4. 빈 레인 입력 Bad의 감소량은 일반 Bad와 같은가?

이 질문들은 규칙의 철학이 아니라 수치 밸런싱 문제이므로 후속 구현 스펙에서 결정한다.
