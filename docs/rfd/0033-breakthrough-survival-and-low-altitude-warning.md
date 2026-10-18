# RFD 0033: `Breakthrough`의 `Survival` 규칙과 저고도 경고

**Status:** 채택 (2026-10-18, 사용자 결정) · 규칙·실패 흐름·경고 구현 대기

## 기존 결정과 문제

- [RFD 0002](0002-breakthrough-perfect-only-recovery.md)와 [RFD 0005](0005-flight-rules-two-tier-liftoff-survival.md)는 종전 `Breakthrough`(RFD 0005에서 `Survival`로 이름만 바뀜) 규칙을 정했다. `altitude`는 100에서 시작해 Perfect로만 회복하고, Great·Good은 회복하지 않으며, Bad·Miss와 빈 레인 입력 Bad는 감소시키고, 0에 도달하면 실패한다. RFD 0005는 이 규칙을 숙련 유저가 선택해서 켜는 별도 축으로 두었다.
- [RFD 0022](0022-flight-difficulty-names-and-visuals.md)는 차트 난이도명 `Liftoff → Infiltration → Breakthrough`를 비행 시나리오와 연결하면서, 종전 `Survival` 규칙을 새 `Infiltration`·`Breakthrough`에 자동 승계하지 않기로 했다. 그 결과 `Breakthrough`의 낮은 시각 고도는 정상적인 숙련 비행으로 정의되었다. [비행 컨셉](../design/flight-concept.md)은 붉은 배경을 경고색으로 정의하지 않는다고 적었고, [RFD 0029](0029-frame-aspect-fit-narrow-lanes.md)와 glossary는 유리관 게이지가 낮은 고도를 경고하지 않는다고 적었다.
- 2026-10-18 배경 시안 검토(PR #293)에서 사용자는 "게이지가 0이 되면 게임 오버"라는 전제로, 돌파의 고도가 낮을 때 배경이 약한 붉은빛으로 점멸하는 경고를 제안했다. 문서와의 충돌을 확인하자 사용자는 돌파가 예전에는 서바이벌 게이지가 아니어서 생긴 서술이라고 설명하고 "서바이벌 도입할거야", "주홍색은 괜찮음"으로 결정했다.

## 결정

1. **`Breakthrough` 차트는 `Survival` 규칙을 쓴다.** 규칙은 난이도명에 딸리며, RFD 0005처럼 따로 켜는 선택 규칙이 아니다.
   - 게이지 값 `altitude`(0~1)는 1에서 시작하고 1을 넘지 않는다.
   - Perfect는 `altitude`를 회복한다. `holdOnly`·Grace처럼 Perfect로 처리되는 판정도 같다([RFD 0009](0009-hold-only-long-note.md)가 전제한 그대로).
   - Great·Good(`goodTrill` 포함)은 회복도 감소도 하지 않는다.
   - Miss는 `altitude`를 감소시킨다. 유지 Miss도 Miss로 센다. 지금 판정 체계에는 Bad가 없으므로([scoring](../spec/scoring.md)) 종전 규칙의 Bad·빈 레인 입력 Bad 항목은 없다. 의존 0점 정산은 `altitude`에 영향을 주지 않는다.
   - `altitude`가 0에 도달하면 그 즉시 실패(게임 오버)한다.
   - 회복량·감소량은 밸런싱에서 정한다.
2. **`Breakthrough`의 화면 고도는 게이지 상태를 그대로 따른다.** 장면은 지금처럼 저공비행 범위 안에서 오르내리고, 소실점이 고도 상에서 위·중에서 가운데·하에서 아래로 옮겨 가는 연출도 유지한다. 다만 고도 하(0에 가까움)는 이제 실패에 가까운 상태다. `Breakthrough`에 한해 RFD 0022의 "낮은 시각 고도는 정상 비행이며 실패 직전 상태로 해석하지 않는다"를 이 결정으로 대체한다.
3. **저고도 경고: 게이지가 기준값 아래로 내려가면 배경 전체가 약한 주홍빛으로 천천히 점멸한다.**
   - 주홍은 돌파의 정체성 색이지만 경고에도 쓴다(사용자 확인). 장면 안의 선 광원과 구분되도록, 경고는 배경 전체의 밝기·색이 부드럽게 오르내리는 느린 호흡으로 표현한다.
   - 기준값·주기·세기는 Lab 시연을 보고 정한다. 초당 3회를 넘는 깜빡임은 쓰지 않는다(광과민성).
   - 경고는 외곽 배경에만 둔다. 레인·판정선·노트·리프트·서든은 흔들거나 덮지 않는다([RFD 0001 §7](0001-flight-rules-and-observer-boundary.md#7-비주얼-원칙)). 실패를 과장하지 않는다는 원칙도 따른다.
   - 유리관 게이지는 지금처럼 색을 바꾸지 않고 경고하지 않는다. 경고는 배경이 맡는다.
4. **바뀌지 않는 것**
   - `Liftoff`의 관대한 역할(고도 0 시작, 곡 종료 기준 클리어, 곡 중 게임 오버 없음)은 그대로다.
   - `Infiltration`의 회복·감소·실패 규칙은 정하지 않는다([PRD §12](../prd.md#12-미정-사항)).
   - `Survival`·`Stealth`는 단계 이름으로 쓰지 않는다. `Survival`은 `Breakthrough`가 쓰는 규칙의 이름으로만 쓴다.
5. **EXPERT**: 돌파 배경을 쓰는 EXPERT 라벨([RFD 0026](0026-game-flight-backgrounds.md))에 이 규칙을 적용할지는 [PRD §12](../prd.md#12-미정-사항)에서 정한다.

## 검토한 대안

| 대안 | 검토 결과 |
| --- | --- |
| RFD 0022대로 종전 규칙을 승계하지 않고 `Breakthrough`의 실패 규칙을 새로 설계 | 사용자가 서바이벌 도입을 결정해 채택하지 않음 |
| `Survival`을 RFD 0005처럼 따로 켜는 선택 규칙으로 유지 | 난이도명과 비행 시나리오를 묶은 RFD 0022 구조와 맞지 않고, 돌파의 정확도 압박과 경고 연출을 함께 설계하기 어려움 |
| 화면에 보이는 고도(장면이 낮음)를 기준으로 경고 | 돌파 장면은 늘 저공 범위라 평소에도 경고가 켜짐. 게이지 상태를 기준으로 함 |
| 유리관 게이지의 색을 바꿔 경고 | 기어는 노트를 읽는 시선 바로 옆이라 경고가 판정 읽기를 방해함. 사용자는 배경 경고를 제안함 |
| 경고를 붉은색 대신 배경이 어두워지거나 채도가 빠지는 방식으로 | Lab 시연에서 비교 후보로 둘 수 있으나, 사용자는 주홍 경고를 괜찮다고 확인함 |

## Trade-off

- 돌파의 근접감이 이제 실패 임박을 함께 뜻한다. 장면은 저공 범위 안에서 움직이므로 "가까운 환경 속 숙련 비행"이라는 서사는 유지되지만, 고도 하는 더 이상 안정된 평소 상태가 아니다.
- 주홍이 정체성 색과 경고색을 함께 맡는다. 평소 주홍은 선 광원, 경고는 배경 전체의 느린 호흡으로 구분한다. 둘이 섞여 보이면 Lab 시연에서 세기와 방식을 조정한다.
- 실패가 생기므로 실패한 플레이의 결과 화면·기록·랭킹 처리를 정해야 한다([PRD §12](../prd.md#12-미정-사항)).
- Perfect만 회복하므로 Great가 많은 플레이도 실패할 수 있다. RFD 0002가 의도한 정확도 압박이다.

## 영향

- 이번 문서 PR에서 함께 고친다
  - RFD 0001·0002·0003·0005·0022의 후속 결정 표기(과거 결정과 근거는 그대로 보존)
  - `docs/context/glossary.md`(`flightRule`·`altitude`·`Breakthrough`·`Survival` 문단·유리관 게이지), 루트와 `src/game/CONTEXT.md`, `docs/context/term-map.md`
  - `docs/prd.md`(G-12, §7, §12 `flightRule` 행), `docs/spec/game-core.md`, `docs/spec/scoring.md`
  - `docs/design/flight-concept.md`, `docs/design/art-direction-notes.md`, `docs/research/beatmania.md`, `README.md`의 RFD 목록
- 코드는 바뀌지 않는다. 지금 게임에는 실패 규칙이 없고, 세 장면 모두 곡 진행으로 1→0 내려가는 임시 `altitude` 모델(`src/game/renderer/flightAltitude.ts`)을 쓴다.

## 구현 계획

1. Lab 저고도 경고 시연: 돌파 배경 위에 주홍 호흡의 기준값·주기·세기를 조절해 보고 정한다.
2. `Breakthrough`의 `altitude`를 `Survival` 상태로 구동한다. 돌파는 곡 진행으로 내려가는 임시 모델 대신 판정으로만 바뀌는 게이지를 쓰고, `Liftoff`·`Infiltration`은 임시 모델을 유지한다.
3. 0 도달 시 실패 흐름(곡 정지, 결과 화면의 실패 표시)과 실패 기록 정책을 정해 구현한다.
4. 저고도 경고를 게임 배경에 적용한다.
