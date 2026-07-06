# RFD 0003: `flightRule`의 포지셔닝 — 입문 유저 동기 장치

**Status:** Accepted (2026-06-12)

**관련 문서:**

- [`docs/rfd/0001-flight-rules-and-observer-boundary.md`](0001-flight-rules-and-observer-boundary.md) — `flightRule`과 Observer 경계
- [`docs/rfd/0002-breakthrough-perfect-only-recovery.md`](0002-breakthrough-perfect-only-recovery.md) — Breakthrough Perfect-only 회복
- [`docs/research/djmax.md`](../research/djmax.md) — DJMAX 역기획 보고서 (게이지 관찰 보강 대상)
- [`docs/context/stance.md`](../context/stance.md) — not4k가 플레이어를 대하는 태도
- [`docs/context/glossary.md`](../context/glossary.md) — `flightRule` 용어 정의
- [`docs/prd.md`](../prd.md) — 타겟 유저 정의 (1차/2차 타깃)
- [`docs/rfd/0005-flight-rules-two-tier-liftoff-survival.md`](0005-flight-rules-two-tier-liftoff-survival.md) — `flightRule` 2종 재편 후속 결정

---

**후속 결정:** RFD 0005가 `flightRule`을 2종으로 재편한다. 이 문서가 역할 중복으로 지적한 Takeoff/Ascent는 관대 규칙 `Liftoff` 하나로 통합되고, 숙련자 정확도 압박을 전담하던 Breakthrough는 `Survival`로 계승된다. 이 문서의 입문 유저 동기 포지셔닝은 그대로 유지되며, "관대 규칙은 기본값(Liftoff)으로 두고 정확도 압박은 Survival이 전담한다"로 읽는다.

---

## 1. 배경

RFD 0001은 Play에 `altitude` 기반 `flightRule`(`Takeoff / Ascent / Breakthrough`)을 도입했고,
RFD 0002는 Breakthrough의 회복 규칙을 확정했다. 그러나 두 문서 모두
**게이지(`flightRule`)를 왜 도입하는가, 누구를 위한 장치인가**를 기록하지 않았다.

RFD 0001의 문제의식은 "`flightRule`의 긴장감"과 "beatmania식 클리어 목표와 생존 압박"
측면에 치우쳐 있다. 이 프레이밍만 남으면 밸런싱 단계에서 `flightRule`을
**숙련 유저 대상 생존 압박 장치**로 해석할 여지가 있다. 특히 Ascent의 참조 모델이
IIDX Hard Gauge(즉시 실패형)로 기록되어 있어, 참조 모델의 체감 난이도까지
복제하는 방향으로 구현될 위험이 있다.

## 2. 참조 관찰: DJMAX RESPECT V의 게이지

DJMAX RESPECT V에는 게이지가 존재하지만, 어느 정도 숙련된 유저 기준으로는
사실상 있으나 마나 한 장치다. 실패에 도달하려면 매우 많이 틀려야 하기 때문이다.

결과적으로 이 게이지는 숙련 유저를 압박하는 생존 장치가 아니라,
**리듬게임에 익숙하지 않은 유저에게 클리어/실패라는 목표 구조와 동기를 제공하는
장치**로 기능한다. 숙련 유저의 실제 목표는 게이지 생존이 아니라 정확도와 콤보로
옮겨가 있다.

> 주: 이 관찰은 현재 `docs/research/djmax.md`에 기록되어 있지 않다.
> 해당 보고서의 보강 대상으로 남긴다.

## 3. 문제

`flightRule`의 도입 목적이 기록되지 않으면 다음 위험이 생긴다.

1. 밸런싱 담당(미래 에이전트 포함)이 Takeoff/Ascent를 숙련자 압박 장치로
   해석하여 실패가 잦은 수치로 구현할 수 있다.
2. 실패가 잦아지면 RFD 0001 이전의 핵심 철학 — 가변 손배치 학습을 중도 실패로
   끊지 않는다 — 이 사실상 폐기된다.
3. 1차 타깃(기존 리듬게임 숙련 유저)에게 게이지가 거슬리는 장치가 되어,
   설계의 핵심 의사결정을 1차 타깃 기준으로 내린다는 PRD 원칙과 충돌한다.

## 4. 결정

**not4k의 게이지(`flightRule`)는 리듬게임에 익숙하지 않은 유저에게 동기를 제공하는
장치로 포지셔닝한다.** DJMAX RESPECT V 게이지의 체감과 같은 맥락이다.

`flightRule` 도입의 또 다른 목적인 "약간의 내러티브(비행 콘셉트) 도입"은 RFD 0001의
배경·비주얼 원칙이 담당한다. 이 RFD는 규칙으로서의 게이지가 누구를 위한 장치인지만
확정한다.

세부 규칙:

- 게이지의 1차 목적은 **입문 유저(2차 타깃)에게 클리어/실패라는 목표 구조를
  제공하는 것**이다. 숙련 유저를 압박하기 위한 장치가 아니다.
- **Takeoff와 Ascent는 숙련 유저 기준으로 사실상 실패하지 않는 수준으로 관대하게
  밸런싱한다.** 매우 많이 틀려야 실패에 도달한다.
- Ascent의 IIDX Hard Gauge 참조는 **구조 참조(0 도달 시 실패)이지 체감 난이도
  참조가 아니다.** 감소/회복량은 입문 유저 기준으로 관대하게 잡는다.
- **숙련 유저 대상 정확도 압박은 Breakthrough(RFD 0002) 단일 규칙이 전담한다.**
  Takeoff/Ascent에 숙련자용 압박을 넣지 않는다.
- 동기 제공은 **침묵하는 규칙 구조로만** 이뤄진다. 게이지 관련 UI 문구는 격려도
  훈계도 하지 않는다(RFD 0001 6절 톤 원칙 유지).

## 5. 대안

### A. 포지셔닝을 기록하지 않고 밸런싱 단계에서 정한다

**장점**

- 지금 결정할 것이 없다.

**단점**

- RFD 0001의 "긴장감" 프레이밍만 남아, 밸런싱이 압박 장치 방향으로 표류할 수 있다.
- 수치가 먼저 구현되고 나면 포지셔닝을 역으로 맞추기 어렵다.

### B. 숙련자 압박 장치로 포지셔닝한다

**장점**

- 클리어 램프 등 장기 목표와 강하게 결합된다.

**단점**

- "학습을 중도 실패로 끊지 않는다"는 기존 철학과 정면 충돌한다.
- 1차 타깃에게 게이지가 스트레스 요인이 된다.
- 정확도 압박 역할이 Breakthrough와 중복된다.

### C. 입문 유저 동기 장치로 포지셔닝하고, 숙련자 압박은 Breakthrough로 분리한다

**장점**

- Takeoff/Ascent(입문 동기)와 Breakthrough(숙련자 정확도 도전)의 역할이 선명해진다.
- 관대한 게이지는 1차 타깃에게 사실상 보이지 않는 장치가 되어, 무조건 완주에
  가까운 기존 학습 경험이 보존된다.
- DJMAX RESPECT V라는 검증된 참조 사례가 있다.

**단점**

- 입문 유저에게도 실패가 매우 드물어, "실패 가능"이라는 RFD 0001의 긴장 연출이
  약해질 수 있다.
- 관대함의 정량 기준("얼마나 틀려야 실패인가")을 별도로 정해야 한다.

## 6. 채택 방향

**C를 채택한다.**

RFD 0001의 Play/Observer 경계, `flightRule` 명칭, 난이도 축 분리와
RFD 0002의 Breakthrough Perfect-only 회복은 그대로 유지한다.
이 RFD는 `flightRule`의 도입 목적과 Takeoff/Ascent의 밸런싱 방향만 추가로 확정한다.

## 7. 영향 받는 문서

- `docs/rfd/0001-flight-rules-and-observer-boundary.md`
  - 후속 결정으로 이 RFD를 표시한다. Ascent의 Hard Gauge 참조가 구조 참조임을 명확화한다.
- `docs/research/djmax.md`
  - RESPECT V 게이지의 실질적 기능(입문 유저 동기 장치) 관찰을 보강한다.
- `docs/context/glossary.md`, `CONTEXT.md`
  - `flightRule` 항목에 이 RFD 링크를 추가한다.
- 후속 `flightRule` 구현 스펙 (RFD 0001 §8의 `game-core.md`/`scoring.md` 갱신 포함)
  - Takeoff/Ascent 밸런싱 방향을 이 포지셔닝 기준으로 기술한다.

## 8. 미해결 질문

1. "숙련 유저 기준 사실상 실패하지 않는 수준"의 정량 기준은 무엇인가
   (예: 평균 정확도 X% 이상이면 실패 불가능). 밸런싱 단계에서 정한다.
2. 입문 유저가 실패했을 때 Observer로의 안내 경로를 어떻게 설계하는가
   (RFD 0001 §9 Q4와 연결).
3. `flightRule`의 기본값은 가장 관대한 Takeoff인가 (RFD 0001 §9 Q5와 연결).
