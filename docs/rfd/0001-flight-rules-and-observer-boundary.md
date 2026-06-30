# RFD 0001: `flightRule`과 Observer 경계

**Status:** Accepted (2026-06-09)

**관련 문서:**

- [`src/game/CONTEXT.md`](../../src/game/CONTEXT.md) — Gameplay 용어와 플레이 세션 관계
- [`docs/spec/game-core.md`](../spec/game-core.md) — 플레이 흐름, 게이지 없음, 게임 오버 없음 기존 결정
- [`docs/spec/observer-mode.md`](../spec/observer-mode.md) — Observer 모드 역할
- [`docs/context/stance.md`](../context/stance.md) — not4k가 플레이어를 대하는 태도
- [`docs/context/glossary.md`](../context/glossary.md) — 난이도명, Lv., 게이지 등 용어 정의
- [`docs/spec/scoring.md`](../spec/scoring.md) — 달성률, 랭크, 콤보, 풀콤보
- [`docs/research/beatmania.md`](../research/beatmania.md) — IIDX 게이지 참조 모델
- [`docs/rfd/0002-breakthrough-perfect-only-recovery.md`](0002-breakthrough-perfect-only-recovery.md) — Breakthrough 회복 규칙 후속 결정
- [`docs/rfd/0003-flight-rules-positioning-newcomer-motivation.md`](0003-flight-rules-positioning-newcomer-motivation.md) — `flightRule` 포지셔닝 후속 결정
- [`docs/rfd/0005-flight-rules-two-tier-liftoff-survival.md`](0005-flight-rules-two-tier-liftoff-survival.md) — `flightRule` 2종 재편(Liftoff/Survival) 후속 결정

---

**후속 결정:** RFD 0002가 Breakthrough의 `TIME HELL mode` 참조와 회복 불가 규칙을 대체한다. RFD 0003이 `flightRule`의 도입 목적(입문 유저 동기 장치)과 Takeoff/Ascent의 관대한 밸런싱 방향을 확정한다. 특히 Ascent의 IIDX Hard Gauge 참조는 구조 참조이지 체감 난이도 참조가 아니다. RFD 0005가 `flightRule`을 2종(`Liftoff` = 종전 Takeoff/Ascent 통합, `Survival` = 종전 Breakthrough)으로 재편하고 명칭을 확정한다. 따라서 이 문서의 `Takeoff / Ascent / Breakthrough` 명칭은 현재 명칭이 아니다. RFD 0001의 Play/Observer 경계와 난이도 축 분리 결정은 유지한다.

## 1. 배경

not4k의 기존 스펙은 **게이지 없음, 무조건 완주, 게임 오버 없음**을 명시한다.
이 결정의 이유는 가변 손배치 학습을 중도 실패로 끊지 않기 위해서였다.
유저가 자기 실력보다 어려운 차트에 도전하더라도 끝까지 플레이하고,
결과 화면에서 달성률과 판정 분포로 어떤 구간에서 실패했는지 확인하는 구조다.

새로운 인게임 콘셉트로 **비행**을 검토한다.
플레이 중 생존 지표를 **`altitude`**로 비유하고, `altitude`에 따라 배경의 수평선,
시야각, 격자 밀도, 오브젝트 크기와 속도가 달라지는 방식이다.

초안의 `flightRule`은 다음과 같다. beatmania IIDX 계열 게이지는 설계 참조 모델이며,
not4k가 수치와 세부 동작을 그대로 복제한다는 뜻은 아니다. IIDX 게이지의 실제
동작과 용어 주의점은 `docs/research/beatmania.md`의 게이지 옵션 보충 자료를 따른다.

| 초안 이름 | 최종 이름 | 의도 | IIDX 참조 모델 | not4k 규칙 초안 |
| --- | --- | --- | --- | --- |
| 이륙 | Takeoff | 쉬움 | Normal / Groove Gauge: 낮은 값에서 시작해 종료 시 기준 이상이면 클리어 | `altitude` 0 시작, 종료 시 기준 `altitude` 이상이면 클리어 |
| 도약 | Ascent | 중간 | Hard Gauge: 100% 시작, 0% 도달 시 즉시 실패, 회복 있음 | `altitude` 0 도달 시 게임 오버 |
| 돌파 | Breakthrough | 어려움 | 초기 검토: TIME HELL mode. 현재 결정: RFD 0002의 Perfect-only 회복 | `altitude` 100 시작, Perfect로만 회복, 0 도달 시 게임 오버 |

주의할 점은 `Time Hell Gauge`를 표준 게이지 옵션명처럼 쓰지 않는 것이다.
IIDX의 EX-HARD는 회복 불가 게이지가 아니라 피해량이 큰 생존 게이지이며,
Breakthrough의 현재 모델은 EX-HARD나 TIME HELL mode를 복제하지 않는다.
Breakthrough는 RFD 0002에 따라 beatmania IIDX에 상응하는 게이지가 없는
not4k 고유 `flightRule`이다.

이 초안은 비행 메타포와 시각 연출 측면에서 강하지만,
기존의 "Play도 무조건 완주" 결정과 충돌한다.

---

## 2. 문제

`flightRule`을 채택하려면 다음 경계를 다시 정해야 한다.

1. **Play는 반드시 완주해야 하는가?**
2. **완주와 학습을 원하는 유저는 어디로 가야 하는가?**
3. **Observer는 단순 관찰 모드인가, 무압박 완주/학습 계열의 상위 개념인가?**
4. **난이도명, Lv., `flightRule`을 한 축으로 합칠 것인가, 분리할 것인가?**

이 경계를 정하지 않으면 미래 에이전트는 `게이지 없음` 스펙과
`altitude 규칙` 작업 사이에서 서로 반대 방향으로 구현할 위험이 있다.

---

## 3. 결정 제안

**Play는 `altitude` 기반 `flightRule`을 적용하는 인증 비행으로 재정의한다.**
Play에서는 `flightRule`에 따라 클리어와 실패가 존재할 수 있다.

**Observer 계열은 완주, 관찰, 손배치 계획, 구간 반복 학습을 담당한다.**
끝까지 보고 싶은 유저, 실패 조건 없이 차트를 확인하고 싶은 유저,
손배치를 미리 계획하려는 유저는 Observer 계열을 사용한다.

**난이도명, Lv., `flightRule`은 서로 다른 축으로 유지한다.**

```text
Lv.            차트의 절대 난이도 수치
난이도명       같은 곡 안에서 차트를 구분하는 라벨
`flightRule`      Play에서 `altitude` 기반 클리어/실패를 결정하는 규칙
`altitude`           `flightRule`의 현재 상태를 표현하는 플레이 중 지표
Observer 계열  실패 조건 없이 차트를 관찰하거나 학습하는 흐름
```

`flightRule` 이름은 UI와 코드 모두 영어를 사용하며,
정식 명칭은 **`Takeoff / Ascent / Breakthrough`**로 둔다.

| 후보 | 규칙 의미 |
| --- | --- |
| Takeoff | 0에서 시작해 종료 시 기준 `altitude` 이상이면 클리어 |
| Ascent | `altitude`를 유지하며 진행하고 0 도달 시 실패 |
| Breakthrough | 100에서 시작해 Perfect로만 회복하고 0 도달 시 실패 |

초안의 `이륙 / 도약 / 돌파` 감정선은 유지하되, 변수명과 UI 라벨은
`takeoff / ascent / breakthrough`로 통일한다. `Leap`은 비행보다 점프에
가까우므로 사용하지 않는다.

---

## 4. 대안

### A. 기존 결정 유지: Play도 무조건 완주

Play에는 게이지와 게임 오버를 넣지 않는다.
`altitude`는 배경 연출 또는 최근 퍼포먼스 시각화로만 사용한다.

**장점**

- 기존 문서와 철학을 거의 수정하지 않아도 된다.
- 유저가 어떤 차트든 끝까지 플레이하며 학습할 수 있다.
- 실패 화면, 기록, 랭킹의 복잡도가 낮다.

**단점**

- `flightRule`의 긴장감이 약하다.
- `altitude` 메타포가 실제 규칙이 아니라 장식으로 느껴질 수 있다.
- beatmania식 클리어 목표와 생존 압박을 가져오기 어렵다.

### B. Play는 실패 가능, Observer가 완주/관찰 담당

Play를 `altitude` 규칙이 적용되는 인증 흐름으로 두고,
완주와 학습은 Observer 계열이 담당한다.

**장점**

- 비행 콘셉트가 실제 규칙과 연결된다.
- Play와 Observer의 역할이 선명해진다.
- 클리어 램프, `altitude`, 비행 결과 같은 장기 목표를 만들 수 있다.

**단점**

- 기존 `게이지 없음, 무조건 완주` 문서를 수정해야 한다.
- Observer가 충분히 강력하지 않으면 유저가 학습 도구를 잃는다.
- 실패가 플레이어를 심판하는 느낌으로 읽히지 않게 톤 관리가 필요하다.

### C. Play 실패 가능 + 별도 Free Flight 제공

Play에는 `flightRule`을 적용하되, 입력 가능한 무기록 완주 모드를 별도로 제공한다.

**장점**

- 유저가 실제 입력으로 끝까지 쳐볼 수 있다.
- Observer가 "입력 없는 관찰"이라는 현재 정의를 유지할 수 있다.
- 기록 대상 Play와 무기록 학습을 명확히 분리할 수 있다.

**단점**

- 모드 수가 늘어나 초기 UX가 복잡해진다.
- Observer, Free Flight, Play의 경계를 별도로 설명해야 한다.
- MVP 범위가 커질 수 있다.

---

## 5. 채택 방향

현재 추천은 **B를 기본 방향으로 채택하고, C를 열린 후속 선택지로 남기는 것**이다.

즉, 제품 언어는 다음처럼 둔다.

- **Play**: `altitude` 규칙이 적용되는 기록 대상 비행
- **Observer**: 실패 조건 없이 차트를 관찰하고 손배치를 계획하는 흐름
- **Free Flight**: 입력 가능한 무기록 완주가 필요하다고 판단될 때 추가 검토

이 방향은 "완주를 원하면 Observer 계열로 간다"는 제품 구조를 만든다.
다만 현재 `observer-mode.md`는 입력 없는 관찰 모드로 정의되어 있으므로,
입력 가능한 완주 흐름이 필요하면 Observer 하위 기능으로 확장할지
`Free Flight`를 별도 흐름으로 둘지 추가 결정이 필요하다.

---

## 6. 톤 원칙

`flightRule`이 실패를 만들더라도 not4k의 태도는 유지한다.

- 실패를 격려하거나 훈계하지 않는다.
- "추락했습니다", "조금만 더", "포기하지 마세요" 같은 감정 해석형 문구를 쓰지 않는다.
- 결과 화면은 `FAILED`, `CLEAR`, `altitude`값, 달성률, 판정 분포처럼 사실만 표시한다.
- 실패 연출은 상태 변화의 표시여야 하며, 플레이어를 조롱하거나 과장하지 않는다.
- 중앙 4레인은 항상 안정적으로 유지하고, `altitude` 연출은 외곽 배경에 제한한다.

---

## 7. 비주얼 원칙

비행 콘셉트는 중앙 레인과 외곽 배경의 역할 분리로 구현한다.

- 중앙 4레인은 어둡고 고정된 계기판처럼 유지한다.
- 수평선, 격자, 원거리 비콘, 외곽 오브젝트만 `altitude`에 반응한다.
- 높은 `altitude`에서는 수평선이 보이고 시야가 넓으며 오브젝트가 작고 느리다.
- 낮은 `altitude`에서는 수평선이 낮아지고 근거리 격자가 커지며 속도감이 강해진다.
- 위험 상태에서도 레인 폭, 판정선, 리프트, 서든은 흔들지 않는다.
- `altitude` 변화는 장식이 아니라 실제 `flightRule` 상태와 연결되어야 한다.

현재 코드에는 임시 `altitude` 모델과 `altitude`별 원근 배경 프리셋이 존재한다.
후속 구현은 이 placeholder를 판정 결과 기반 `altitude` 모델로 교체하는 방향이 자연스럽다.

---

## 8. 영향 받는 문서

이 RFD가 Accepted 되면 다음 문서를 업데이트해야 한다.

- `src/game/CONTEXT.md`
  - `게이지`가 "현재 존재하지 않는 개념"이라는 설명을 교체
  - `flightRule`, `altitude`, `Observer 계열` 관계 추가
- `docs/spec/game-core.md`
  - `게이지는 존재하지 않는다` 섹션 교체
  - 플레이 흐름에 실패/결과 조건 반영
  - 중도 포기와 게임 오버의 차이 재정의
- `docs/spec/observer-mode.md`
  - Observer가 완주/학습을 담당하는 범위 명확화
  - 입력 가능한 무기록 완주가 필요하면 `Free Flight` 또는 하위 모드 추가
- `docs/context/stance.md`
  - "게임은 심판이 아니다"와 실패 가능한 Play의 공존 방식 설명
- `docs/context/glossary.md`
  - `altitude`, `flightRule`, `Takeoff`, `Ascent`, `Breakthrough` 정의 추가
- `docs/spec/scoring.md`
  - 달성률/랭크와 비행 클리어/실패의 관계 정의
- `docs/prd.md`
  - `게이지 없음. 무조건 완주, 게임 오버 없음` 항목 갱신

---

## 9. 미해결 질문

1. Observer는 계속 입력 없는 관찰 모드로 둘 것인가?
2. 입력 가능한 무기록 완주가 필요하다면 이름은 `Free Flight`가 적절한가?
3. `Takeoff / Ascent / Breakthrough`의 UI 표기 세부 형식은 대문자(`TAKEOFF`)로 둘 것인가?
4. Play 실패 시 즉시 결과 화면으로 전환할 것인가, 실패 상태를 표시한 뒤 곡을 계속 재생할 것인가?
5. `flightRule`은 모든 차트에 적용되는가, 차트별로 선택 가능한가?
6. 랭킹과 플레이 기록은 `flightRule`별로 분리할 것인가?

---

## 10. Acceptance Criteria

이 RFD를 Accepted로 바꾸려면 다음이 결정되어야 한다.

- Play가 실패 가능한 흐름인지 확정
- Observer 계열이 담당하는 완주/관찰/학습 범위 확정
- `Takeoff / Ascent / Breakthrough` 명칭 확정
- 실패 시 결과 화면과 기록 저장 정책 확정
- 영향 받는 문서의 업데이트 범위 확정
