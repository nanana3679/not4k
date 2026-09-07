# 노트 판정 사례 명세

[RFD 0019](../rfd/0019-note-judgment-units-and-inheritance.md)의 채택 동작을 자동 테스트로 옮기기 위한 입력·기대 결과이다. 용어는 [glossary](../context/glossary.md#롱노트-판정-모델)를 따른다. **현재 엔진을 실행한 결과나 테스트 통과 기록이 아니다.**

38개 사례를 테스트로 옮기는 순서, 추가 Point·트릴 회귀와 시간·입력 순서 검증은 [구현·검증 계획](../plans/note-judgment-implementation.md)을 따른다.

## 사용 방법

- `NJ-` ID를 유지한다. 테스트명은 `NJ-H03: 감소 holdOnly 뒤 2000ms에 A만 떼면 B를 유지해도 마지막 release Perfect`처럼 구체적인 동작을 쓴다.
- 별도 표시가 없으면 대화에서 직접 확인한 사례다. **규칙에서 도출한 대조**는 확정 규칙의 적용 범위를 검산하기 위한 사례로 표시한다.
- 기대값은 판정 대상·등급·발생 횟수, 실제 입력 소비 대상, 후속 바디의 시작·실패 여부이다. 내부 필드명이나 구현 함수를 기대값으로 고정하지 않는다.
- 같은 입력으로 여러 결과가 나면 Point 소비, 실제 release 소비, `holdOnly` 상태 완료를 구분한다.
- 실패를 검증한 뒤 끝점과 기한을 지나도록 진행하여 중복 판정·부활이 없는지도 확인한다.
- 실패하지 않은 모든 노트의 전체 결과를 적지 않은 사례에서는 명시한 대상만 검증한다. 빈 입력 전체의 패널티 정책을 이 문서에서 추가하지 않는다.
- 추가 결정이 필요한 후보를 확정 기대값으로 쓰지 않는다. 남은 정합성 검산·이행은 [PRD](../prd.md#12-미정-사항)에서 추적한다.
- 후속 규칙 변경으로 재검산이 필요한 사례는 ID를 보존하되 이전 기대값을 검산 기록으로 옮긴다. 재검산 표시가 있는 사례를 현재 테스트의 정답으로 사용하지 않는다.

## 공통 조건

| 항목 | 조건 |
|---|---|
| 레인·키 | 모든 노트와 A/B/C/D는 같은 레인. 서로 다른 문자는 서로 다른 물리 키 |
| 시각 | 단위 ms. 바디 `[S,E]`는 차트의 시작·끝이며 입력 시각과 구분 |
| 창 | Normal, Perfect ±41 / Great ±82 / Good ±120 |
| head | 표에 명시한 것만 존재. head 없는 시작은 입력을 소비해도 시작 점수가 없음 |
| 바디 끝 | 뒤 바디가 있으면 일반 승계 또는 감소. `holdOnly`는 명시한 끝에만 적용 |
| 초기 상태 | 명시하지 않으면 held·등록·미처리 release 준비가 없음 |
| 시간 진행 | 표에 없는 입력은 없음. `1121까지 진행`은 1120까지 입력 없이 Good 기한을 넘기는 관측 |
| 판정 횟수 | head, 실제 release, 명시된 `holdOnly`만 성공 점수 항목. 일반 승계 성공은 추가 판정·콤보 증가 없음 |
| timestamp | 같은 시각의 입력을 모두 반영한 뒤 유지 부족 확인. 동일 키의 down/up 인과관계는 보존 |

## 시작과 유지

<a id="nj-a01"></a>
### NJ-A01 — 앞 일반 바디를 900/920ms에 처리해도 독립 holdOnly는 별도 시작을 요구

차트: head 없는 일반 single `[900,920]`, 빈 구간, head 없는 single `holdOnly [1000,1060]`.

| 입력·진행 | 기대 결과 |
|---|---|
| A down 900 | 앞 일반 바디 시작에 소비. 뒤 `holdOnly`는 미시작 |
| A up 920 | 앞 끝점 920의 release Perfect. 뒤 바디는 실패하지 않음 |
| B down 1000 | 뒤 바디의 시작에 소비 |
| B held로 1060 통과 | `holdOnly` Perfect 1개 |
| B up 1070 | 완료한 `holdOnly`의 추가 release 판정 없음 |

두 시작은 서로 다른 down을 요구한다. 앞 입력의 창이 뒤 시작 창과 겹친다는 이유로 뒤 바디를 활성화하거나 완료하지 않는다.

<a id="nj-a02"></a>
### NJ-A02 — 500ms부터 잡은 키만으로 독립 holdOnly [1000,2000]을 시작하지 못함

차트: head 없는 single `holdOnly [1000,2000]` 하나. 앞에는 노트가 없다.

| 입력·진행 | 기대 결과 |
|---|---|
| A down 500, 계속 held | 등록된 시작 입력이 아님 |
| 1000 통과 | 자동 활성화하지 않음 |
| 추가 down 없이 1121까지 진행 | 미시작 unit 실패. 해당 끝점 0점, 실패 1회 |
| 계속 잡고 2000 통과 | Perfect로 바뀌거나 추가 실패하지 않음 |

길이 0의 기존 held 허용은 [NJ-Z01](#nj-z01)과 구분한다.

<a id="nj-a03"></a>
### NJ-A03 — holdOnly 중 빈 B down 뒤 A를 1500ms에 떼면 B가 held여도 Miss

차트: head 없는 single `holdOnly [1000,2000]` 하나.

| 입력·진행 | 기대 결과 |
|---|---|
| A down 1000 | 바디 활성화 |
| B down 1200 | 아무 head·시작도 소비하지 않으므로 유지 키로 등록되지 않음 |
| A up 1500 | 유효 유지 키 부족. 바디 Miss 1회 |
| B를 계속 잡고 2000 통과 | 실패한 바디를 복구하거나 Perfect로 완료하지 않음 |

`holdOnly`는 release 면제이며, 임의의 키로 유지 자격을 교체하는 속성이 아니다.

<a id="nj-a04"></a>
### NJ-A04 — 두 키가 정당하게 승계 준비되면 S 직전·직후의 down 모두 뒤 Point에 소비

차트: single `[0,1000]`에 **double head 0**, 이어진 head 없는 double `[1000,1060]`, 별도 Point 1100. A/B가 double head를 0에 성공하고 유지 중이다.

| 독립 실행 | 입력 | 기대 결과 |
|---|---|---|
| 이른 쪽 | C down 995 / up 997 | C down은 Point 1100의 Good(-105). double 시작이 추가로 소비하지 않음 |
| 늦은 쪽 | C down 1005 / up 1007 | C down은 Point 1100의 Good(-95). 같은 결과 |

두 실행 모두 A/B up 1060으로 double의 마지막 release 두 개가 Perfect이다. source의 바디가 single이어도 두 성공한 head 키가 정당한 준비를 제공한다. 임의의 raw held 두 키를 준비로 인정한 사례가 아니다.

<a id="nj-a05"></a>
### NJ-A05 — 60ms double을 서로 겹치지 않는 두 tap으로 모두 Perfect 처리

차트: double head 1000, double `[1000,1060]`, 뒤 바디 없음.

| 입력 | 대상·등급 |
|---|---|
| A down 1020 | 첫 head Perfect(+20) |
| A up 1025 | 첫 release 1060 Perfect(-35) |
| B down 1030 | 둘째 head Perfect(+30) |
| B up 1035 | 둘째 release 1060 Perfect(-25) |

Perfect 4개, Miss 없음. 두 키의 held가 겹치지 않아도 된다. 서로 다른 물리 키 및 필요한 down/up은 모두 요구한다.

<a id="nj-a06"></a>
### NJ-A06 — E=1060이 지나도 S=1000의 시작 창 안인 1100ms에 holdOnly 첫 활성화 가능

차트: head 없는 single `holdOnly [1000,1060]` 하나.

| 입력·진행 | 기대 결과 |
|---|---|
| 입력 없이 1060 통과 | S+Good=1120 전이므로 첫 시작을 닫지 않음 |
| A down 1100 | 자기 시작에 소비하고 `holdOnly` Perfect 1개 |
| A up 1130 | 별도의 release나 추가 Miss 없음 |

이미 활성화한 뒤 실패한 바디를 복구하는 경우는 아니다.

## 일반 감소와 release

아래 NJ-R01~R03은 같은 **Q1 차트**를 사용한다.

| 바디 | unit 수 | 구간 | head | 끝의 의미 |
|---|---:|---|---|---|
| Q1-A | 2 | `[0,1000]` | double 0 | 감소 release 1000 한 개 |
| Q1-B | 1 | `[1000,1060]` | 없음 | 증가로 이어짐, 점수 없음 |
| Q1-C | 2 | `[1060,1100]` | 없음 | 감소 release 1100 한 개 |
| Q1-D | 1 | `[1100,2000]` | 없음 | 마지막 release 2000 한 개 |

<a id="nj-r01"></a>
### NJ-R01 — 일반 =-=-의 정상·늦은 입력 모두 3 down과 3 up으로 완료

| 정상 실행 | 늦은 실행 |
|---|---|
| A/B down 0: 두 head Perfect | 동일 |
| A up 1000: 첫 감소 Perfect | A up 1100: 첫 감소 Good(+100) |
| C down 1060: Q1-C의 증가분 시작 | C down 1105: 같은 미처리 증가분 시작 |
| C up 1100: 둘째 감소 Perfect | C up 1110: 둘째 감소 Perfect(+10) |
| B up 2000: 마지막 release Perfect | 동일 |

정상은 Perfect 5개, 늦은 쪽은 Perfect 4개와 Good 1개. 유지 실패 없음. C down은 별도의 오래된 release 재준비가 아니라 Q1-C의 실제 미처리 시작을 소비한다.

<a id="nj-r02"></a>
### NJ-R02 — C가 증가를 준비한 뒤 1080ms에 떼면 앞의 1000ms release가 Great

Q1에서 A/B down 0 이후 두 키를 유지한다.

| 입력 | 기대 결과 |
|---|---|
| C down 1070 | Q1-C 증가분 시작 |
| C up 1080 | **앞 감소 1000**의 Great(+80). 1100의 Perfect로 배정하지 않음 |
| A up 1100 | 둘째 감소 1100 Perfect |
| B up 2000 | 마지막 release Perfect |

1070에는 앞에 남은 종료 한 몫과 현재 두 unit이 준비돼 있다. C up을 단순한 `3→2` 여분 입력으로 버리지 않는다. 나중 시작에 등록된 키도 같은 연결 구간의 앞 release에 사용할 수 있다.

<a id="nj-r03"></a>
### NJ-R03 — 앞 release가 Miss여도 held 두 키로 뒤 증가분 시작을 채우지 못함

Q1에서 A/B down 0 후 계속 유지하고 추가 입력을 하지 않는다.

| 진행 | 검증할 결과 |
|---|---|
| 1060 통과 | Q1-C의 증가분 시작은 미처리 |
| 1121까지 진행 | 1000의 실제 release는 Miss. 그 준비를 증가분에 넘기지 않음 |
| 1181까지 진행 | 시작 기한 1060+120까지 입력이 없던 증가 unit도 실패 |

관측 대상은 앞 release의 Miss와 증가분의 미시작 실패이다. 두 held가 남았다는 사실만으로 둘 중 하나를 성공 처리하지 않는다.

수동 Lab의 `decrease-chain`은 같은 수 변화의 구간을 `[2000,2500] → [2500,3000] → [3000,3500] → [3500,4000]`으로 늘린 대조다. A/B down 2000 뒤 입력을 생략하고 끝까지 진행해도 정산 예외 없이 종료해야 한다. 이어지는 몫의 미시작 실패가 감소 release 항목을 먼저 소비하여 같은 항목을 두 번 정산해서는 안 된다.

<a id="nj-r04"></a>
### NJ-R04 — A의 1020ms up을 연결에 쓰면 B 1035ms와 A 1040ms up은 두 release Perfect

**동일 키에도 같은 보정을 적용하는 최신 규칙에서 도출한 대조.** 차트는 double head 0 + double `[0,1000]` → single head 1000 + double `[1000,1060]`이다. `holdOnly`와 `trillZone` 없음.

| 입력 | 기대 결과 |
|---|---|
| A/B down 0 | 앞 double head Perfect 2개 |
| A up 1020 | 연결 후보로 보류 |
| A down 1030 | 뒤 single head Perfect(+30). 동일 키의 유효한 재타격에도 보정하여 A up을 뒤 release에서 제외 |
| B up 1035 | 첫 실제 release Perfect(-25) |
| A up 1040 | 둘째 실제 release Perfect(-20). 앞 실제 release 사용 키는 B이므로 A가 적격 |

Perfect 5개이며 유지 Miss는 없다. 실제 release 사용 키는 B/A이고, A up 1020은 사용 이력에 넣지 않는다. 이전 해석은 [검산 기록 §7](../review/note-judgment-state-audit.md#7-nj-r04의-보정-전-기대값-보존)에 역사적으로 보존한다.

<a id="nj-r05"></a>
### NJ-R05 — 일반 single에 등록 키 두 개면 첫 up은 여분이고 마지막 up만 release

차트: **double head 0** + 일반 single `[0,1000]`. A/B down 0으로 두 head를 성공한다.

| 입력 | 기대 결과 |
|---|---|
| A up 1000 | `2→1` 여분 keyup. 실제 release를 소비하지 않음 |
| B up 1005 | 끝점 1000의 release Perfect(+5) |

`holdOnly`로 면제받은 몫이 없는 일반 여분 키의 대조 사례다. [NJ-H03](#nj-h03)의 면제를 일반 여분 키 전체로 확대하지 않는다.

<a id="nj-r06"></a>
### NJ-R06 — 연결 head가 E 이후에 와도 교대 up을 마지막 release에 쓰지 않음

차트: single head 0 + single `[0,1000]` → single head 1000 + single `[1000,1100]`. `holdOnly` 없음. 두 독립 실행 모두 A down 0으로 첫 head를 Perfect 처리한다.

| 단계 | 정박 교대 실행 | 늦은 교대 실행 |
|---|---|---|
| A up 995 | 교대와 마지막 release에 모두 해당할 수 있어 용도 보류. 끝 1100의 Good을 확정하지 않음 | 동일 |
| 뒤 head 입력 | B down 1000: head Perfect, 유효한 교대로 A up의 용도 확정 | B down 1110: head Good(+110), 유효한 교대로 A up의 용도 확정 |
| 마지막 입력 | B up 1100: 마지막 release Perfect | B up 1115: 마지막 release Perfect(+15) |

A up 995는 뒤 실제 release를 소비하지 않는다. 정박 실행은 Perfect 3개, 늦은 실행은 Perfect 2개와 Good 1개이며 유지 Miss는 없다. 늦은 실행에서 E=1100에 교대 불성립을 확정하지 않는다. 해당 head의 기한은 1120이다. head가 끝내 오지 않는 경우는 [NJ-R08](#nj-r08)을 따른다.

<a id="nj-r07"></a>
### NJ-R07 — d=d=에서 A/B를 떼고 C/D로 교대하면 마지막 release는 C/D가 처리

차트: double head 0 + double `[0,1000]` → double head 1000 + double `[1000,1100]`. `holdOnly` 없음.

| 입력 | 기대 결과 |
|---|---|
| A/B down 0 | 앞 double head Perfect 2개 |
| A/B up 995 | 연결 교대 후보로 용도 보류. 맨끝의 Good 두 개를 확정하지 않음 |
| C/D down 1000 | 뒤 double head Perfect 2개. 두 unit의 교대가 성립하므로 A/B up을 뒤 release에 쓰지 않음 |
| C/D up 1100 | 서로 다른 두 키로 맨끝 release Perfect 2개 |

Perfect 6개, Miss 없음. 부분 head·부분 교대의 배정은 이 전체 교대 사례만으로 확정하지 않는다.

<a id="nj-r08"></a>
### NJ-R08 — 995ms에 뗀 뒤 교대에 실패하면 1100ms 끝은 0점이며 보류 up으로 Good을 만들지 않음

차트: single head 0 + single `[0,1000]` → single head 1000 + single `[1000,1100]`. `holdOnly` 없음.

| 입력·진행 | 기대 결과 |
|---|---|
| A down 0 | 첫 head Perfect, 앞 바디 시작 |
| A up 995 | 교대와 마지막 release에 모두 해당할 수 있어 용도 보류 |
| 새 head 입력 없이 1100 통과 | head 기한 1120이 남았으므로 E만으로 교대 불성립을 확정하지 않음 |
| 새 head 입력 없이 1121까지 진행 | head 1000 Miss. 다음 unit의 시작·승계 실패가 확정되므로 끝 1100은 0점과 원래 가중치로 정리. A up 995로 Good을 만들지 않음 |
| 1221까지 진행 | 끝점에서 추가 Miss 패널티 없음 |

점수 항목은 첫 head Perfect, 뒤 head Miss, 종속 끝점 0점이다. 성공한 실제 release가 없으므로 -105ms의 FAST를 기록하지 않는다. 뒤 head만 놓치고 A를 계속 유지해 바디를 정상 승계한 경우와 다르다. 이전의 마지막 Good 기대값은 [실제 승계 실패에 관한 정정](../review/note-judgment-state-audit.md#nj-r08의-release-대상-성립-전제)으로 대체한다.

<a id="nj-r09"></a>
### NJ-R09 — 같은 A로 1000ms head를 다시 치면 995ms up을 보정하고 1100ms 또는 2000ms 끝을 Perfect 처리

차트: single head 0 + single `[0,1000]` → single head 1000 + single `[1000,E]`. 두 독립 실행에서 E를 각각 1100, 2000으로 둔다. `holdOnly`와 `trillZone` 없음. 짧은 끝은 사용자 확인 사례이고, 긴 끝은 동일 보정 규칙에서 도출한 대조다.

| 입력 | E=1100 | E=2000 |
|---|---|---|
| A down 0 | 첫 head Perfect, 앞 바디 활성화 | 동일 |
| A up 995 | 연결과 끝 1100의 창에 겹치는 후보로 보류. 마지막 Good을 먼저 확정하지 않음 | 연결 창 안이며 마지막 release 창 밖 |
| A down 1000 | 다음 head Perfect. 같은 키 재타격에도 동일 보정으로 연결 성공, 앞 up은 마지막 release에 쓰지 않음 | 다음 head Perfect, 같은 키라는 이유의 연결 Miss 없음 |
| A up E | 마지막 release Perfect | 마지막 release Perfect |

두 실행 모두 Perfect 3개이며 유지 Miss는 없다. 키가 같다는 이유로 보정을 제거하거나 별도 connection Miss를 주지 않는다. 이는 유효한 다음 head 입력을 이용한 연결이며, 임의의 재누름이나 이미 실패한 같은 바디의 부활을 허용한 것은 아니다.

<a id="nj-r10"></a>
### NJ-R10 — double에서 A만 C로 교대하면 B의 1030ms release는 Great이고 C의 1100ms release는 Perfect

차트: double head 0 + double `[0,1000]` → double head 1000 + double `[1000,1100]`. `holdOnly`와 `trillZone` 없음.

| 입력·진행 | 기대 결과 |
|---|---|
| A/B down 0 | 앞 double head Perfect 2개 |
| A up 995 | 교대 후보로 보류. B는 유지 |
| C down 1000 | 뒤 double head 중 하나 Perfect. 한 unit의 교대가 성립하여 A up을 뒤 release에서 제외 |
| B up 1030 | 기존 held로 정상 승계한 unit의 실제 release 후보. 남은 head 기한까지 추가 교대 가능성과 구분 |
| C up 1100 | 다른 실제 release의 정박 입력 |
| 1121까지 추가 입력 없음 | 남은 head Miss. B up 1030은 실제 release Great(-70), C up 1100은 실제 release Perfect. B의 정상 승계를 head Miss 때문에 실패로 바꾸지 않음 |

점수 판정은 Perfect 4개, Great 1개, Miss 1개이며 별도 유지 Miss는 없다. 보정은 교대한 한 몫의 A up에만 적용한다. B up의 최종 분류가 늦어져도 원래 입력 시각을 유지한다. 추가 head 입력이 없는 것과 실제 바디 승계가 실패한 [NJ-R08](#nj-r08)을 구분한다.

<a id="nj-r11"></a>
### NJ-R11 — 동시 A/B up을 두 연결에 쓰면 수집 순서와 관계없이 마지막은 Perfect와 Great

**동일 키에도 같은 보정을 적용하는 최신 규칙에서 도출한 대조.** [검산 반례 NJ-Q01](../review/note-judgment-state-audit.md#4-반례-nj-q01-동시에-뗀-두-키-중-소비한-키에-따라-뒤-등급이-달라짐)의 차트와 입력을 유지한다. double head 0 + double `[0,1000]` → double head 1000 + double `[1000,1100]`. `holdOnly`와 `trillZone` 없음.

| 입력 | 기대 결과 |
|---|---|
| A/B down 0 | 앞 double head Perfect 2개 |
| C down 1000 | 뒤 double head 첫 입력 Perfect. A/B/C가 등록됨 |
| A/B up 1080, 같은 timestamp | 한 연결과 나머지 후보로 다루며 어느 up도 실제 release로 먼저 확정하지 않음 |
| A down 1100 | 뒤 double head 둘째 입력 Good(+100). 두 연결이 성립하므로 두 up 모두 뒤 실제 release에서 제외 |
| C up 1105 | 첫 실제 release Perfect(+5) |
| A up 1150 | 둘째 실제 release Great(+50) |

Perfect 4개, Good 1개, Great 1개이며 유지 Miss는 없다. A→C·B→A와 B→C·A→A 모두 현재 보정 범위에 포함되므로, A/B up의 수집 순서를 바꿔도 결과가 같다. 실제 release 사용 키는 C/A이고 두 up 모두 1080의 보정 up과 별개이다. 일부 후보만 보정할 때의 동률까지 이 사례로 확정하지 않는다.

<a id="nj-r12"></a>
### NJ-R12 — A 1010ms와 B 1040ms up 뒤 C로 head를 치면 먼저 뗀 A만 교대로 보정

차트: double head 0 + double `[0,1000]` → **single head 1000** + double `[1000,1100]`. `holdOnly`와 `trillZone` 없음.

| 입력·진행 | 기대 결과 |
|---|---|
| A/B down 0, 두 키로 1000 통과 | 앞 double head Perfect 2개, 뒤 double 정상 승계 |
| A up 1010 | 첫 교대 후보로 보류 |
| B up 1040 | 둘째 교대 후보로 보류 |
| C down 1050 | 뒤 single head Great(+50). 적격 보류 up 중 먼저 발생한 A up을 교대로 배정. B up은 끝 1100의 실제 release Great(-60) |
| C up 1100 | 끝 1100의 둘째 실제 release Perfect |

Perfect 3개, Great 2개이며 Miss는 없다. 실제 release 사용 키는 B/C이다. A up 1010은 실제 release나 Good(-90)의 FAST 기록을 만들지 않는다. C 대신 B로 head를 재타격해도 입력 배정 순서를 유지하는 대조는 [NJ-R13](#nj-r13)을 따른다.

<a id="nj-r13"></a>
### NJ-R13 — 첫 up은 연결, B 1040ms up은 terminal Great이며 새 B head 뒤 1100ms up은 terminal Perfect

차트: double head 0 + double `[0,1000]` → single head 1000 + double `[1000,1100]`. `holdOnly`와 `trillZone` 없음. 중간 head 하나에 연결용 up 하나를 배정하며, 중간점의 실제 점수 release를 새로 만드는 것은 아니다.

| 입력·진행 | 기대 결과 |
|---|---|
| A/B down 0, 두 키로 1000 통과 | 앞 double head Perfect 2개, 뒤 double 정상 승계 |
| A up 1010 | 첫 연결 보정 후보로 보류 |
| B up 1040 | 두 번째 up. 연결 몫 하나를 넘어서는 실제 terminal release 후보 |
| B down 1050 | 중간 single head Great(+50), 새 누름에 release 권한 부여. 먼저 발생한 A up을 연결에 배정하고 B up 1040은 끝 1100의 첫 실제 release Great(-60)로 확정 |
| B up 1100 | 새 head로 얻은 권한으로 둘째 실제 release Perfect. B의 이전 누름이 같은 끝을 처리했다는 이유로 차단하지 않음 |

전체 점수 항목은 Perfect 3개, Great 2개이며 Miss는 없다. B의 두 up은 유효한 새 head를 사이에 둔 별개의 누름이다. B up을 먼저 보정하거나 A up을 terminal로 재배정하지 않는다. [RFD 0019 §2.8](../rfd/0019-note-judgment-units-and-inheritance.md#28-유효한-새-입력에-따른-release-권한-갱신--후속-채택)의 사용자 채택에 따라 종전의 마지막 실패 기대값을 정정했다.

<a id="nj-r14"></a>
### NJ-R14 — 동시 A/B 1040ms up의 내부 배정과 관계없이 새 B head 뒤 마지막 release Perfect

**권한 갱신 규칙에서 도출한 대조.** 차트는 NJ-R13과 같고, A/B down 0으로 앞 double을 처리하여 1000까지 유지한다. A/B up을 모두 1040에 입력하고 B down 1050 → B up 1100을 입력한다. 동시 up의 수집 순서를 바꾼 두 실행을 대조한다.

| 내부 배정 | B down 1050까지의 결과 | B up 1100 |
|---|---|---|
| A up을 연결, B up을 첫 terminal에 배정 | 첫 terminal Great(-60), 새 head Great(+50), B의 새 누름에 release 권한 | 둘째 terminal Perfect |
| B up을 연결, A up을 첫 terminal에 배정 | 첫 terminal Great(-60), 새 head Great(+50), B의 새 누름에 release 권한 | 둘째 terminal Perfect |

두 실행 모두 Perfect 3개·Great 2개·Miss 없음이며 판정 대상과 raw 타이밍도 같다. 실제 키별 down/up 인과관계는 보존한다. 내부에서 첫 terminal에 쓴 키가 달라도 새 head의 권한에 차이가 남지 않는다. 이 사례는 모든 동시 입력 조합의 검증 완료를 뜻하지 않는다.

<a id="nj-r15"></a>
### NJ-R15 — A로 첫 double release를 처리한 뒤 노트 없는 1005ms 재누름은 남은 release 권한을 주지 않음

**권한 갱신 규칙에서 도출한 실패 대조.** 차트: double head 0 + 일반 double `[0,1000]`. 다른 head·시작·연결·`holdOnly`·`trillZone`은 없다.

| 입력·진행 | 기대 결과 |
|---|---|
| A/B down 0 | 두 head Perfect, double 활성화 |
| A up 1000 | 첫 terminal release Perfect |
| A down 1005 | 유효한 새 head·미처리 시작이 없어 raw held만 변함. 새 release 권한 없음 |
| A up 1010 | 두 번째 terminal을 소비하지 않음 |
| B held를 유지하며 1121까지 진행 | 남은 terminal release Miss 1개 |

전체 점수 항목은 Perfect 3개·Miss 1개이다. 실제 두 up이 있었다는 사실만으로 같은 키의 임의 재누름을 double의 두 release로 인정하지 않는다.

## holdOnly와 승계

<a id="nj-h01"></a>
### NJ-H01 — 2→1 holdOnly에서 두 키를 그대로 유지하면 경계 Perfect 두 개

차트: double head 0 + double `[0,1000]`의 `holdOnly`, 이어진 single `[1000,2000]`의 일반 release.

| 입력·진행 | 기대 결과 |
|---|---|
| A/B down 0 | 두 head 성공 및 바디 활성화 |
| 두 키 held로 1000 통과 | `holdOnly` Perfect **2개**. 실제 keyup 요구 없음 |
| 1000 이후 | 요구 unit 수는 1. A/B의 계속된 등록 held는 유효 |

감소하는 한 unit뿐 아니라 앞 double의 두 unit 끝을 각각 상태 판정한다.

<a id="nj-h02"></a>
### NJ-H02 — 두 감소가 holdOnly인 =-=-는 A/B 유지로 중간 증가까지 새 down 없이 통과

Q1과 같은 구간을 사용하되 **1000과 1100의 두 감소 끝만 `holdOnly`**로 바꾼다. 2000은 일반 release이다.

| 입력·진행 | 기대 결과 |
|---|---|
| A/B down 0 | 두 head Perfect |
| 두 키 held로 1000 통과 | `holdOnly` Perfect 2개 |
| 두 키 held로 1060 통과 | 두 키를 정당하게 승계해 double 활성화. 추가 down 없음 |
| 두 키 held로 1100 통과 | `holdOnly` Perfect 2개 |
| A up 2000, B는 계속 held | 마지막 single release Perfect. 면제 몫은 여분 계산에서 제외 |
| B up 2500 | 완료한 노트의 추가 release·Miss 없음 |

성공 점수 판정은 head 2개 + `holdOnly` 4개 + 마지막 release 1개이다. 자동 Perfect를 실제 keyup으로 취급해 등록 키를 제거하지 않는다.

<a id="nj-h03"></a>
### NJ-H03 — 감소 holdOnly 뒤 2000ms에 A만 떼면 B를 유지해도 마지막 release Perfect

NJ-H01의 차트와 A/B 등록 상태를 사용한다.

| 입력·진행 | 기대 결과 |
|---|---|
| 두 키 held로 1000 통과 | `holdOnly` Perfect 2개 |
| A up 2000 | 뒤 single의 마지막 release Perfect 1개 |
| B를 2500까지 held 후 up | 해당 노트들은 이미 완료. 추가 release·Miss 없음 |

**release를 면제받은 한 몫은 뒤 release를 막는 여분 키 계산에서 제외한다.** A up을 일반 `2→1` 여분 규칙으로 버리지 않는다. 어느 물리 키가 면제 몫인지 미리 고정하지 않는다.

<a id="nj-h04"></a>
### NJ-H04 — 면제받은 키가 다음 double을 활성화하면 그 새 double의 release 두 개는 필요

**규칙에서 도출한 대조.** 차트: double head 0 + double `[0,1000]`의 `holdOnly`, single `[1000,1060]`, head 없는 double `[1060,2000]`의 일반 마지막 release.

| 입력·진행 | 기대 결과 |
|---|---|
| A/B down 0 후 유지 | 두 head 성공 |
| 1000 통과 | `holdOnly` Perfect 2개 |
| 1060 통과 | A/B 승계로 double의 두 unit 활성화 |
| A up 2000 | 새 double의 첫 release Perfect |
| B를 유지한 채 2121까지 진행 | 새 double의 남은 release Miss |
| B up 2200 | 해당 끝의 추가 판정 없음 |

이전 면제 몫을 새 unit 활성화와 그 새 unit의 release 면제에 중복 사용하지 않는다. 새 double에는 `holdOnly`가 없다.

<a id="nj-h05"></a>
### NJ-H05 — 늦은 A tap과 B hold로 감소 holdOnly와 뒤 single을 모두 성공

차트: double head 1000 + double `[1000,1060]`의 `holdOnly`, head 없는 single `[1060,2000]`의 일반 release.

| 입력 | 기대 결과 |
|---|---|
| A down 1090 | 첫 head Good(+90), 첫 `holdOnly` Perfect |
| A up 1095 | 종료되는 한 unit에 배정 가능. 뒤 single의 유지 실패를 확정하지 않음 |
| B down 1100 | 둘째 head Good(+100), 둘째 `holdOnly` Perfect. 뒤 single을 이어받음 |
| B up 2000 | 마지막 release Perfect |

자동 Perfect가 첫 A의 뒤 single 승계를 불가역 확정하지 않는다. Good 2개, Perfect 3개, Miss 없음.

<a id="nj-h06"></a>
### NJ-H06 — 뒤 single 끝이 1120이면 A up 1095가 먼저 마지막 release를 처리

NJ-H05와 같지만 뒤 single은 `[1060,1120]`이다.

| 입력 | 기대 결과 |
|---|---|
| A down 1090 | 첫 head Good, 첫 `holdOnly` Perfect |
| A up 1095 | **맨끝 1120**의 release Perfect(-25) |
| B down 1100 | 둘째 head Good, 둘째 `holdOnly` Perfect. 앞 double의 종료되는 쪽을 처리 |
| B up 1300 | 이미 완료한 unit의 추가 release·Miss 없음 |

실제 release 하나의 소비를 `holdOnly` 종료 배정으로 막지 않는다. 같은 A up으로 실제 release 두 개를 처리한 사례는 아니다.

<a id="nj-h07"></a>
### NJ-H07 — 이른 keyup 하나로 holdOnly 상태 완료와 뒤 실제 release를 함께 처리

차트: head 없는 single `holdOnly [1000,1060]` → head 없는 일반 single `[1060,1120]`. A down 1000이 앞 시작을 소비한다.

| 독립 실행 | keyup | 기대 결과 |
|---|---|---|
| 이른 쪽 | A up 1050 | 앞 `holdOnly` Perfect 상태 완료 + **뒤 끝 1120**의 실제 release Great(-70) |
| 늦은 쪽 | A up 1070 | 앞은 1060에서 이미 Perfect, 뒤 실제 release Great(-50) |

두 실행 모두 down 1개와 up 1개로 완료한다. 이른 쪽의 실제 up 소비 대상은 1120 하나이며, 뒤 S=1060 전에도 정당한 승계 준비를 쓸 수 있다.

## 실패·복구와 timestamp

<a id="nj-f01"></a>
### NJ-F01 — 가운데 바디 실패 뒤 늦은 앞 head 키로 마지막 double을 자동 시작하지 못함

차트: double `[1000,1060]` → single `[1060,2000]` → double `[2000,3000]`. **첫 double에만 double head 1000**이 있고 `holdOnly`는 없다.

| 입력·진행 | 기대 결과 |
|---|---|
| A down 1000 | 첫 head Perfect |
| A up 1065 | 앞 감소 release 1060 Perfect |
| A down 1070 | 미시작 가운데 single의 시작. A는 앞 double head에서 이미 쓴 키라 둘째 head를 소비할 수 없음 |
| A up 1090 | 가운데 single 유지 실패 |
| B down 1100 | 앞 double의 둘째 head Good. 가운데 바디는 부활하지 않음 |
| B held로 2000 통과 | 마지막 double에 자동 승계되지 않음. 두 unit 모두 새 시작 입력 필요 |

복구 실행에서는 C/D down 2000으로 마지막 double의 두 unit을 시작하고 C/D up 3000으로 두 release를 성공할 수 있다. B는 실패한 가운데 바디를 건너뛰어 유지 키로 들어오지 않는다. 가운데 실패 시점에 미래 두 unit을 즉시 Miss 처리하지 않는다.

<a id="nj-f02"></a>
### NJ-F02 — 경계의 A up과 B head down이 같은 timestamp면 입력 후 유지 부족 확인

차트: single head 0 + single `[0,1000]`, single head 1000 + single `[1000,2000]`. A down 0으로 시작한다.

| 입력 | 기대 결과 |
|---|---|
| A up 1000, B down 1000 | B head Perfect. 두 입력을 반영한 뒤 B로 유지되므로 유지 Miss 없음 |
| B up 2000 | 마지막 release Perfect |

서로 다른 키인 A up/B down의 수집 순서를 바꿔도 결과가 같다. 같은 키의 down보다 앞선 가짜 up을 만들거나, 실제 down/up을 최종 held 상태만으로 지우지는 않는다.

<a id="nj-f03"></a>
### NJ-F03 — 감소를 이미 처리한 뒤 B를 1105ms에 떼면 옛 Good 창으로 재교대하지 못함

차트: double head 1000 + 일반 double `[1000,1060]` → single `[1060,2000]`.

| 입력 | 기대 결과 |
|---|---|
| A down 1090 | 첫 head Good |
| A up 1095 | 감소 release 1060 Perfect |
| B down 1100 | 둘째 head Good, 뒤 single 활성화 |
| B up 1105 | 뒤 single 유지 Miss |
| B down 1110 | 실패한 같은 single을 다시 시작하지 못함 |

1060의 Good 창이 아직 열려 있어도 이미 소비한 감소 기회를 재사용하지 않는다. 2000에서 추가 release Miss를 발생시키지 않는다.

## 길이 0과 점수

<a id="nj-z01"></a>
### NJ-Z01 — 길이 0 holdOnly는 앞 Point의 held와 창을 공유할 수 있음

차트: Point 900, head 없는 길이 0 single `holdOnly` 1000. 초기 held 없음.

| 독립 실행 | 입력 | 기대 결과 |
|---|---|---|
| 창 이전 tap | A down 870 / up 875 | Point Perfect. `holdOnly`의 창 880~1120에 held가 없으므로 아직 미처리 |
| 위 실행의 별도 시작 | B down 1000 / up 1005 | 남은 길이 0 `holdOnly` Perfect |
| 창 안의 tap | A down 890 / up 895 | Point Perfect + 길이 0 `holdOnly` Perfect. 추가 tap 불필요 |

한 tap과 두 tap의 차이를 정상 결과로 인정한다. 양수 길이의 독립 시작 입력 요구를 길이 0까지 확대하지 않는다.

<a id="nj-s01"></a>
### NJ-S01 — 무점수 연결 바디가 실패해도 점수 항목이 모두 Perfect면 100%이며 Full Combo는 아님

차트: single head 0 + single `[0,1000]`, single head 1000 + single `[1000,2000]`. `holdOnly` 없음.

| 입력 | 기대 결과 |
|---|---|
| A down 0 | 첫 head Perfect |
| A up 500 | 앞 연결 바디 유지 Miss. 고도 손실·콤보 단절, 별도 점수 항목 없음 |
| B down 1000 | 뒤 head Perfect, 새 바디 시작 |
| B up 2000 | 마지막 release Perfect |

점수 항목은 head 2개와 마지막 release 1개이다. Perfect=3 기준 9/9로 **달성률 100%, Full Combo 아님**. 유지 Miss를 더해 분모를 12로 늘리거나 획득 점수를 직접 깎지 않는다.

<a id="nj-s02"></a>
### NJ-S02 — head Miss의 종속 끝점은 즉시 0점 처리하되 추가 Miss를 표시하지 않음

차트: single head 1000 + 독립 single `[1000,2000]`. 입력 없음.

| 진행 | 기대 결과 |
|---|---|
| 1121까지 진행 | head Miss 1회. 새 바디가 시작하지 못하므로 종속 끝점 0점도 함께 처리 |
| 같은 처리 시점 | head와 끝점의 이론 가중치 모두 분모에 반영. Perfect=3 기준 분모 6, 획득 0 |
| 2121까지 진행 | 해당 끝점의 추가 Miss 표시·고도 손실 없음 |

이는 건강하게 승계된 바디에는 적용하지 않는다. 그 바디의 끝점을 head Miss만으로 0점 처리해서는 안 된다.

<a id="nj-s03"></a>
### NJ-S03 — 1030ms release는 보류 중 콤보에 넣지 않고 뒤늦게 확정해도 입력 시각으로 소급하지 않음

**확정 순서 규칙에서 도출한 대조.** L1은 NJ-R10과 같다. double head 0 + double `[0,1000]` → double head 1000 + double `[1000,1100]`. L2에는 Point 930 하나가 있고 입력하지 않는다. 현재 콤보는 0에서 시작한다. `holdOnly`와 `trillZone`은 없다.

| 입력·진행 | 판정과 콤보 |
|---|---|
| L1 A/B down 0 | 앞 double head Perfect 2개, 콤보 2 |
| L1 A up 995 → C down 1000 | 뒤 head 하나 Perfect, A up은 연결 보정. 콤보 3 |
| L1 B up 1030 | 남은 head의 연결 후보일 수 있어 용도 보류. 콤보 3 유지 |
| L2 입력 없이 1051까지 진행 | Point 930의 Good 기한 1050 초과 Miss. 콤보 0 |
| L1 C up 1100 | terminal Perfect, 콤보 1 |
| 추가 입력 없이 1121까지 진행 | 남은 L1 head Miss와 B up의 terminal Great(-70)를 같은 기한 처리 묶음에서 확정. Miss 우선으로 콤보 0 |

최종 콤보는 0이다. B의 release는 실제 up 시각으로 Great와 raw -70ms를 기록하지만, 1051의 Miss 전 성공으로 소급하지 않는다. 전체는 Perfect 4개·Great 1개·Miss 2개이며 별도 유지 Miss는 없다. 서로 다른 레인의 순회 순서나 늦게 관측한 기한들을 처리하는 코드 순서 때문에 이 결과가 달라지지 않아야 한다. 엔진을 실행한 검증 결과는 아니다.

## 차트 배치

<a id="nj-c01"></a>
### NJ-C01 — 양수 바디 끝에 별도의 길이 0 롱노트를 붙이는 배치 금지

같은 레인에 대해 각각 독립적으로 검사한다.

| 차트 | 기대 결과 |
|---|---|
| single `[0,1000]`의 `holdOnly` + 길이 0 single `holdOnly` 1000 | 금지: 같은 끝 위치의 중복 `holdOnly` |
| 일반 single `[0,1000]` + 길이 0 single `holdOnly` 1000 | 금지: 끝 속성을 별도 복구점으로 인코딩하지 않음 |
| 일반 single `[0,1000]` + 길이 0 일반 single release 1000 | 금지: 양수 바디 끝과 별도 길이 0 롱노트 공존 |
| 일반 single `[0,1000]` + Point 1000 | 허용: 양수 바디 끝의 Point는 길이 0 롱노트가 아님 |
| single `[0,1000]`의 `holdOnly` + Point 1000 | 금지: `holdOnly`와 Point 동시 배치 |

현재 validator가 길이 0 range의 end 슬롯을 생략한다는 구현 사실을 기대 결과로 삼지 않는다.

<a id="nj-c02"></a>
### NJ-C02 — 같은 unit 수의 연결 경계는 head 또는 holdOnly가 필요하고 수 변화는 둘 없이 허용

| 차트 | 기대 결과 |
|---|---|
| single `[0,1000]` → single `[1000,2000]`, 경계 head·`holdOnly` 없음 | 금지 |
| 위 경계에 head 1000 | 허용 |
| 앞 끝을 `holdOnly`로 지정하고 경계 head 없음 | 허용 |
| single `[0,1000]` → double `[1000,2000]`, 경계 head·`holdOnly` 없음 | 허용 |
| double `[0,1000]` → single `[1000,2000]`, 경계 head·`holdOnly` 없음 | 허용 |

<a id="nj-c03"></a>
### NJ-C03 — 길이 0에는 head를 붙이지 않고 양수 trillLong의 holdOnly는 허용

| 차트 | 기대 결과 |
|---|---|
| 일반 single 또는 double의 길이 0 롱노트 + 같은 S의 head | 금지 |
| 유효한 `trillZone` 안의 양수 `trillLong` + 시작 trill head + `holdOnly` | 허용 |
| 길이 0 `trillLong + holdOnly` | 금지 |

길이 0 조합의 제약을 양수 길이 `trillLong` 전체로 확대하지 않는다.
