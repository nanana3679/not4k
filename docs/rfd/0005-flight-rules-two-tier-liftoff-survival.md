# RFD 0005: 비행 규칙 2종 재편 — Liftoff / Survival

**Status:** Accepted (2026-06-19)

**관련 문서:**

- [`docs/rfd/0001-flight-rules-and-observer-boundary.md`](0001-flight-rules-and-observer-boundary.md) — 비행 규칙과 Observer 경계
- [`docs/rfd/0002-breakthrough-perfect-only-recovery.md`](0002-breakthrough-perfect-only-recovery.md) — Breakthrough Perfect-only 회복
- [`docs/rfd/0003-flight-rules-positioning-newcomer-motivation.md`](0003-flight-rules-positioning-newcomer-motivation.md) — 비행 규칙 포지셔닝
- [`docs/context/glossary.md`](../context/glossary.md) — 비행 규칙 용어 정의
- [`docs/spec/game-core.md`](../spec/game-core.md) — 비행 규칙 스펙
- [`docs/spec/scoring.md`](../spec/scoring.md) — 달성률·랭크와 비행 규칙의 관계
- [`docs/research/beatmania.md`](../research/beatmania.md) — IIDX 게이지 참조 모델
- [`docs/prd.md`](../prd.md) — 기능 목록과 미정 사항

---

## 1. 배경

RFD 0001은 Play에 고도 기반 비행 규칙 3종(`Takeoff / Ascent / Breakthrough`)을 도입했고,
RFD 0002는 Breakthrough의 Perfect-only 회복을 확정했으며, RFD 0003은 비행 규칙을
**입문 유저 동기 장치**로 포지셔닝했다.

RFD 0003이 짚었듯 **Takeoff와 Ascent는 역할이 사실상 겹친다.** 둘 다 "숙련 유저 기준
사실상 실패하지 않는 수준"으로 관대하게 밸런싱하는 관대 규칙이고, 숙련 유저 대상 정확도
압박은 Breakthrough 단일 규칙이 전담한다. 즉 현재 3종은 *관대(2종) + 숙련(1종)* 구조이며,
관대 쪽 두 규칙은 유저가 굳이 구분해 선택할 동기가 약하다.

## 2. 문제

1. 관대 규칙이 둘(Takeoff/Ascent)로 나뉘어 있어 선택지가 불필요하게 복잡하다.
2. 비행 규칙을 별도 축으로 두면 선택 설정이 하나 더 생겨, 입문 유저에게 초기 부담이 될 수 있다.
3. 반대로 비행 규칙을 난이도명에 종속(통합)시키면, 같은 차트에서 도전 강도를 따로 고를 수
   없고 숙련자 정확도 축이 난이도명에 묶인다. 이는 RFD 0001의 "난이도명·Lv.·비행 규칙은
   별도 축" 결정과 RFD 0003의 "숙련자 압박은 Breakthrough 전담" 결정과 충돌한다.

## 3. 결정

**비행 규칙을 2종으로 재편한다: `Liftoff`(관대, 기본값) / `Survival`(더 어려움).**
난이도명(EASY/NORMAL/HARD)과 비행 규칙은 **계속 별도 축으로 유지한다.** 종속·통합하지 않는다.

세부 규칙:

- **Liftoff** — Takeoff와 Ascent를 통합한 관대한 입문 규칙. 고도 0에서 시작해 곡 종료 시
  기준 고도 이상이면 클리어되며, 곡 중 게임 오버가 없다. 숙련 유저 기준 사실상 실패하지
  않는 수준으로 관대하게 밸런싱한다(RFD 0003 포지셔닝 유지). **비행 규칙의 기본값이다.**
- **Survival** — Breakthrough를 계승한 숙련자 정확도 규칙. 고도 100에서 시작해 `Perfect`로만
  고도를 회복하고, `Great / Good`은 회복하지 않으며, `Bad / Miss`와 빈 레인 입력 Bad는
  고도를 감소시키고, 0 도달 시 실패한다. RFD 0002의 Perfect-only 회복 모델을 그대로 계승한다.
  Liftoff보다 명확히 어렵다.
- **입문 부담 해소** — 기본값을 가장 관대한 Liftoff로 고정하고, Survival은 숙련 유저가
  선택적으로 켠다. 입문 유저는 비행 규칙 설정을 건드릴 필요가 없으므로, 별도 축으로 두어도
  초기 부담이 사실상 발생하지 않는다(progressive disclosure).
- **명칭** — UI와 코드는 영어 명칭 `liftoff` / `survival`을 사용한다.
- **수치** — 정확한 고도 증감량과 Survival의 난이도 정도(얼마나 어려운가)는 경험적으로
  추후 책정한다. 이 RFD는 규칙의 종류·역할·기본값만 확정한다.

## 4. 대안

### A. 3종 유지 (`Takeoff / Ascent / Breakthrough`)

**장점**

- 기존 RFD 0001~0003을 수정하지 않아도 된다.

**단점**

- 관대 규칙 두 종(Takeoff/Ascent)의 역할 중복이 그대로 남는다.
- 유저가 구분 동기가 약한 선택지를 마주한다.

### B. 비행 규칙을 난이도명에 종속(통합)

난이도를 고르면 비행 규칙이 자동 결정되어 별도 선택이 사라진다.

**장점**

- 선택 설정이 하나 줄어 입문 UX가 단순하다.

**단점**

- 같은 차트(같은 난이도)에서 도전 강도를 스스로 고를 수 없다. 손배치 난이도와 정확도
  압박을 분리해 선택하던 자유가 사라진다.
- 숙련자 정확도 축(Breakthrough 계승)이 특정 난이도명에 묶여, RFD 0003의 "숙련자 압박은
  단일 규칙이 전담" 구조가 무너진다.
- RFD 0001의 난이도 축 분리 결정을 되돌린다.

### C. 2종 재편 + 축 분리 유지 + 기본값으로 부담 해소

관대 규칙을 Liftoff 하나로 통합하고, 숙련 규칙을 Survival로 계승하며, 비행 규칙은 별도
축으로 두되 기본값을 Liftoff로 고정한다.

**장점**

- 관대/숙련 두 역할이 1:1로 선명해진다.
- 기본값 고정으로 입문 부담(대안 B의 동기)을 대부분 흡수하면서, 도전 강도 선택 자유와
  숙련자 축 분리(대안 B의 단점 회피)를 모두 지킨다.
- RFD 0001의 축 분리, RFD 0002의 Perfect-only 회복, RFD 0003의 포지셔닝과 모두 일관된다.

**단점**

- Liftoff와 Survival 사이의 난이도 간극이 커서, 중간 단계 부재가 일부 유저에게 급격하게
  느껴질 수 있다(아래 §7).

## 5. 채택 방향

**C를 채택한다.**

RFD 0001의 Play/Observer 경계와 난이도 축 분리, RFD 0002의 Perfect-only 회복, RFD 0003의
입문 유저 동기 포지셔닝은 그대로 유지한다. 이 RFD는 비행 규칙의 **종류를 3종에서 2종으로
재편하고 명칭을 `Liftoff / Survival`로 확정**한다. Survival은 Breakthrough의 규칙을
이름만 바꿔 계승하며, Liftoff는 Takeoff/Ascent의 관대 역할을 통합한다.

## 6. 영향 받는 문서

- `docs/rfd/0001`, `docs/rfd/0002`, `docs/rfd/0003` — 후속 결정으로 이 RFD를 표시한다.
- `docs/context/glossary.md` — 비행 규칙 항목을 `Liftoff / Survival` 2종으로 갱신한다.
- `CONTEXT.md`, `src/game/CONTEXT.md` — 비행 규칙 용어·정의를 갱신한다.
- `docs/spec/game-core.md` — 비행 규칙 종류와 관대 밸런싱 서술을 갱신한다.
- `docs/spec/scoring.md` — 비행 규칙 명칭 참조를 갱신한다.
- `docs/research/beatmania.md` — IIDX 참조 모델의 not4k 대응 규칙명을 갱신한다.
- `docs/prd.md`, `README.md` — 기능 목록의 비행 규칙 명칭을 갱신한다.

## 7. 미해결 질문

1. Liftoff와 Survival 사이 난이도 간극이 큰데, 중간 단계를 별도로 둘 필요가 있는가.
   현재는 불필요로 판단하며, Survival 수치 밸런싱으로 간극을 조절한다.
2. Survival의 정확한 회복량·감소량(RFD 0002 §8 승계).
3. 비행 규칙의 기본값을 Liftoff로 둔다는 결정 외에, 차트별 추천 비행 규칙 노출 여부.
4. 랭킹과 플레이 기록을 비행 규칙별로 분리할 것인가(RFD 0001 §9 승계).
