# Gameplay

Gameplay 컨텍스트는 유저가 차트를 선택해 플레이하고, 입력이 판정과 결과로 이어지는 경험을 다룬다.
노트 타입, 피스, 난이도 용어는 먼저 루트 `CONTEXT.md`의 Core domain을 따른다.

## 판정 모델의 전제

아래 등록 키·연결 보류는 기존 엔진 기준이다. 후속 설계는 패턴별 허용 입력·기대 결과를 먼저 정하며, release와 Grace의 역할 및 현재 합의 범위는 [glossary](../../docs/context/glossary.md#release-판정)를 따른다. 연결 head를 처리한 single 사례는 이르거나 늦은 실제 head down부터 뒤 바디의 유지를 판단하고 임시 20ms 유지 유예를 적용한다([glossary](../../docs/context/glossary.md#유예-시간-grace-period)). head를 놓쳐도 계속 유지한 뒤 바디의 실제 release는 처리한다([glossary](../../docs/context/glossary.md#release-판정)). 연결 head 창 안에서 hold가 끊기고 head도 놓친 사례는 head Miss 하나와 뒤 끝 종속 0점으로 정리한다. head 기한까지 유지한 뒤 새로 유지가 끊기면 20ms 유예 후 유지 Miss를 추가하고 끝은 종속 0점으로 정산한다. 같은 double 끝의 두 release는 서로 다른 키를 요구하되, 같은 키를 다시 눌러 그 double 바디가 시작하는 연결 head를 처리했다면 그 누름의 up으로 남은 release를 처리할 수 있다. 나머지 적용 범위와 엔진 이행은 아직 남아 있다.

- 같은 레인의 바디 열린 구간은 겹치지 않는다. 다중 unit 구간은 `doubleLong`, 순차 구간은 `connection`으로 표현한다. 판정 창은 겹칠 수 있어 앞 release 대기와 뒤 시작 준비가 함께 존재할 수 있다.
- 바디는 head·시작 입력·정당한 승계로 활성화한다. 등록된 유지 키 수와 release 권한을 구분하며, 고정 물리 owner나 임의의 raw held로 설명하지 않는다.
- 유효한 새 head·미처리 시작은 해당 누름에 새 release 권한을 준다. 같은 double 끝에서 그 물리 키를 이미 썼어도 새 권한은 유효하며, 임의의 재누름에는 권한을 주지 않는다.
- `connection`은 차트상 끝점과 시작점이 맞닿는 관계이다. 같은 unit 수의 경계에는 head 또는 `holdOnly`가 필요하고, unit 수 변화는 그 자체로 경계를 드러낸다.
- 일반 승계 성공에는 점수·콤보가 없다. 감소하는 unit은 실제 release를 요구하되 `holdOnly`가 이를 면제할 수 있다. 후속 모델에서는 head가 있는 2→1 감소 경계에도 감소 release가 있다. 경계 근처의 첫 up이 감소 release를, 연결 head 창 안의 다음 up이 연결 보정을 맡는다(RFD 0032 §28, 엔진 이행 전).
- 유지 부족은 같은 timestamp 입력을 반영한 뒤 확인한다. 연결 교대 후보로 보류한 up은 연결 head 기한까지 부족으로 확정하지 않고, 교대가 끝내 성립하지 않으면 경계 전 교대 실패와 같게 정리한다. 이미 실패한 unit은 되살리거나 건너뛰어 승계하지 않는다.
- 같은 키·시각의 입력에서 서로 다른 키의 동시 up을 내부 배정한 순서만으로 후속 성공·Miss가 달라지면 안 된다. 세부 요구와 영향은 glossary의 동시 입력 결과 일관성을 따른다.
- 트릴 교대 추적에는 head를 소비한 키만 등록하며 바디 유지·승계·release 키는 추가하지 않는다. 구간 귀속과 동시 입력의 세부는 glossary의 트릴 노트를 따른다.

풀 정의는 [glossary](../../docs/context/glossary.md#롱노트-판정-모델), 채택 근거는 [RFD 0020](../../docs/rfd/0020-note-judgment-units-and-inheritance.md), 입력별 기대 결과는 [판정 사례 명세](../../docs/spec/note-judgment-cases.md)를 따른다. 현재 엔진과 상세 구현 명세의 이행 상태는 [PRD §12](../../docs/prd.md#12-미정-사항)에서 추적한다.

## Language

**플레이 세션**:
유저가 하나의 차트를 시작해서 결과 화면에 도달하기까지의 한 번의 플레이이다.
_Avoid_: 게임 실행

**Observer 계열**:
실패 조건 없이 차트를 관찰하고 손배치를 계획하는 흐름이다. 완주, 관찰, 구간 반복 학습은 Play가 아니라 Observer 계열이 담당한다.
_Avoid_: 쉬운 플레이

**곡 선택**:
유저가 플레이할 곡과 차트를 고르는 흐름이다.
_Avoid_: 파일 선택

**플레이 화면**:
차트가 재생되고 유저 입력이 판정되는 화면이다.
_Avoid_: 게임 화면

**결과 화면**:
플레이 세션이 끝난 뒤 판정 집계, 달성률, 랭크, 풀콤보 여부, `flightRule`의 클리어/실패 여부를 보여주는 화면이다.
_Avoid_: 스코어 화면

**입력-노트 매칭**:
유저 입력을 판정 윈도우 안의 노트에 연결하는 판정 전 단계이다.
_Avoid_: 키 이벤트 처리

**가장 이른 노트 매칭**:
창과 키 자격을 충족한 가장 이른 Point 또는 실제로 부족한 시작이 keydown 하나를 소비한다. 이미 정당하게 승계한 unit은 추가 시작 입력을 소비하지 않는다. 길이 0 `holdOnly`의 held 상태 확인은 별개이다.
_Avoid_: 가장 가까운 노트 매칭

**release 판정과 keyup 소비**:
같은 double 끝의 두 실제 release는 서로 다른 물리 키를 요구하며 처음 유지한 키와 달라도 된다. 그 double에서 쓴 키도 뒤 독립 노트의 release에는 다시 쓸 수 있다. 연결 head의 교대·유지 중 탭에서 연결 보정에 배정한 up은 뒤 실제 release에 쓰지 않는다. 연결 보정은 head보다 뒤 끝의 release보다 먼저, head와 같거나 앞선 감소 release보다 나중에 배정한다(RFD 0032 §29). 나머지 up은 적격 대상 중 차트상 끝 시각이 가장 이른 release 하나를 처리한다. 입력 자격·소비와 Grace의 역할, 사례별 합의와 이행 상태는 [glossary](../../docs/context/glossary.md#release-판정)를 따른다.
_Avoid_: 익명 keyup, 실제 release의 이진 판정

**빈 레인 입력**:
시각적으로 비어 보이는 레인에 입력했지만 판정 윈도우 안의 노트와 연결될 수 있는 입력이다.
_Avoid_: 무시 입력

**처리된 노트**:
판정이 끝나 더 이상 플레이어가 읽거나 입력할 필요가 없는 노트이다.
_Avoid_: 지나간 노트

**콤보**:
Miss 없이 이어진 점수 판정 수이다. 무점수 연결 성공은 증가시키지 않고, 무점수 유지 Miss도 콤보를 끊는다.
보류 판정은 확정 순서로 현재 콤보에 반영하며 입력 시각으로 소급하지 않는다. 최대 콤보수 통계는 제공하지 않는다. 확정 순서와 동시 Miss 처리의 세부는 [glossary](../../docs/context/glossary.md#롱노트-판정-모델)를 따른다.
_Avoid_: 연속 입력 수

**풀콤보**:
무점수 유지 실패를 포함해 Miss 없이 플레이 세션을 끝낸 결과 상태이다. 달성률 100%와는 별개이다.
_Avoid_: 올콤보

**달성률**:
차트에서 얻을 수 있는 총점 대비 실제 획득 점수의 비율이다.
_Avoid_: 정확도

**랭크**:
달성률을 구간별로 요약한 결과 등급이다.
_Avoid_: 난이도 등급

**`gameplayRange`** (구 표기: 인게임 구간):
원본 음원 중 플레이 세션에서 실제로 재생하고 판정 시간의 0ms 기준으로 삼는 구간이다.
_Avoid_: 프리뷰 구간

**입력 오프셋**:
입력 장치 지연이나 개인 체감 타이밍을 보정하기 위해 입력 기준을 이동시키는 설정이다(`inputOffsetMs`, 실제 ±1000ms, SLOW면 −). 정의는 [glossary](../../docs/context/glossary.md#입력-오프셋-input-offset).
_Avoid_: 오디오 오프셋

**시각 오프셋**:
노트를 그리는 시각만 옮겨 화면 표시 지연을 보정하는 설정이다(`visualOffsetMs`, 실제 ±1000ms, 화면이 늦으면 +). 정의는 [glossary](../../docs/context/glossary.md#시각-오프셋-visual-offset).
_Avoid_: 화면 오프셋

**오프셋 구분**:
입력·시각 오프셋(실제 시간, ms)과 판정선 오프셋·기어 y 오프셋(화면 위치, 논리 px)은 기준과 부호가 다른 별개의 값이라, 어느 오프셋인지 이름을 붙여 쓴다. 표는 [glossary](../../docs/context/glossary.md#오프셋-구분).
_Avoid_: 이름 없는 "오프셋"

**`GameClock`**:
한 플레이 세션의 시간 권위이다. 고정 출력 지연 L₀와 실제 배속 r로 **판정 시간** J = P − L₀·r, **시각 시간** V = J + visualOffsetMs·r, **입력 시간** J − handlerDelay·r + inputOffsetMs·r을 만든다. 재생 전 L₀ 준비·일시정지·곡 끝 뒤 P 진행은 `AudioEngine`이 소유한다. 세부는 [오디오·비주얼 동기화](../../docs/spec/audio-visual-sync.md)를 따른다.
_Avoid_: songTime을 호출자가 직접 계산

**`AutoPlayer`**:
**`AutoEvent`**의 노트를 합성 입력(press/release)으로 변환하는 순수 상태머신이다. `InputSystem`(실제 키보드)과 같은 판정 엔진 입력 seam에 서는 두 번째 어댑터다(시간 주입, 엔진·렌더러 무지). 풀 정의는 glossary "게임 입력".
_Avoid_: 오토 판정(판정은 여전히 판정 엔진이 한다)

**`ConfirmedJudgmentEffects` (판정 효과)**:
확정 판정의 점수 정산·통계·고도·표시 효과를 구분하는 순수 데이터이다. `NoteJudgmentSession`이 정산하고 `SessionRendererAdapter`가 확정 묶음과 unit 상태를 실제 플레이·튜토리얼 렌더러에 전달한다. 풀 정의는 [glossary의 판정 효과](../../docs/context/glossary.md#판정-효과-confirmedjudgmenteffects)를 따른다.
_Avoid_: 화면 콜백에서 판정 규칙 재구현

**리프트**:
판정선 위치를 위로 올려 유저의 시야 중심을 조정하는 플레이 설정이다.
_Avoid_: 스크롤 속도

**서든**:
레인 상단 일부를 가려 노트가 보이는 시간을 줄이는 플레이 설정이다.
_Avoid_: 리프트

**게이지**:
플레이 중 실패 여부를 결정하는 생존 지표이다.
_Avoid_: 달성률

**기어**:
플레이 화면에서 레인 영역을 둘러싼 장식 그림과 그 위의 `gearMotion`(장식 애니메이션)·유리관 게이지·키 덱이다. 레인 창을 레인 영역에 맞추고, 판정선과 함께 화면 아래보다 기어 y 오프셋 `GEAR_OFFSET_Y`(10, +가 아래)만큼 내려 고정한다(설정 `Gear Motion`으로 `gearMotion`을 끈다). 레인은 키 윗면(레인 끝 `laneEndY`)에서 끝난다. 양옆 유리관 게이지는 비행 배경과 같은 `altitude`를 두 유리관에 아래 기준 채움으로 보여 준다(약 300ms에 걸쳐 따라가고 색은 바꾸지 않는다). 풀 정의는 [glossary](../../docs/context/glossary.md#기어-gear), 배치는 [RFD 0029](../../docs/rfd/0029-frame-aspect-fit-narrow-lanes.md)를 따른다.
_Avoid_: 프레임(화면 한 장과 헷갈림)

**`flightRule`**:
Play의 고도 상태와 클리어/실패를 다루며, 차트 난이도명 `Liftoff → Infiltration → Breakthrough`에 대응하는 시나리오와 연결된다. 이름 표시와 배경은 적용했으며 세부 비행 규칙은 미구현이다. 풀 정의는 [glossary](../../docs/context/glossary.md#flightrule-flight-rule), 현재 배치는 [RFD 0022](../../docs/rfd/0022-flight-difficulty-names-and-visuals.md)를 따른다.
_Avoid_: 차트 레벨

**`altitude`**:
`flightRule`의 상태와 고도 연출을 연결하는 지표다. `Breakthrough`의 저고도는 정상 비행이므로 낮은 시각 고도를 모든 단계의 실패 위험으로 해석하지 않는다. 풀 정의는 [glossary](../../docs/context/glossary.md#altitude-altitude)를 따른다.
_Avoid_: 달성률

## Relationships

- **플레이 세션**은 하나의 **차트**와 그 난이도명에 대응하는 비행 시나리오를 대상으로 진행된다.
- **Observer 계열**은 실패 조건 없이 차트를 관찰하고 학습하는 흐름이며, 기록 대상 Play와 구분된다.
- **곡 선택**은 **플레이 세션** 전에 곡과 차트를 결정한다.
- **플레이 화면**은 입력을 **입력-노트 매칭**으로 연결하고 판정을 만든다.
- **가장 이른 노트 매칭**은 노트 배치 순서와 판정 순서를 일치시킨다.
- **처리된 노트**는 읽기 부담을 줄이되, 연결 경계에서 이른 입력이 성공해도 이어지는 바디가 끊겨 보이지 않도록 아직 지나가지 않은 연결 부분을 표시한다.
- 싱글·더블의 켜짐 표시는 후속 연결 바디·터미널에도 이어지며, Trill은 자기 구간의 실제 유지 상태만 표시한다. 테마 `heldEffect: false`인 스킨은 켜짐을 표시하지 않고 부분 실패·실패만 표시한다([RFD 0028](../../docs/rfd/0028-skin-held-effect.md)). 포인트는 바디·터미널 위에 표시하며, 표시 전파의 unit 수 제한과 판정 분리는 [glossary](../../docs/context/glossary.md#판정-효과-confirmedjudgmenteffects)를 따른다.
- **결과 화면**은 **달성률**, **랭크**, **콤보**, **풀콤보**, **`flightRule`** 결과를 보여준다.
- Play는 **`flightRule`**에 따라 실패할 수 있으며, 실패 조건 없는 완주와 관찰은 **Observer 계열**이 담당한다.
- **`altitude`**는 **게이지**의 비행 콘셉트 표현이며, **달성률**이나 **랭크**와 구분한다.
- **입력 오프셋**과 **시각 오프셋**은 각각 입력 지연·체감과 화면 표시 지연을 보정한다. 출력 지연은 고정 L₀로 자동 보정한다.
- **`GameClock`**은 **입력 오프셋**·**시각 오프셋**·L₀에 실제 배속을 반영한다. 입력 오프셋은 입력 시간에만, 시각 오프셋은 시각 시간에만 적용한다.
- **`gameplayRange`**가 있으면 플레이 화면의 songTime 0ms는 원본 음원의 해당 구간 시작점에 대응한다.
- **리프트**와 **서든**은 판정 규칙이 아니라 시야 조절 설정이다.

## Example dialogue

> **Dev:** "빈 레인에서 누른 입력은 그냥 버리면 되나요?"
> **Domain expert:** "판정 창과 자격을 충족한 앞 노트가 있으면 그 입력을 소비합니다. 뒤 입력 계획이 달라질 수 있으니 화면이 비어 보인다는 이유로 무시하면 안 됩니다."
>
> **Dev:** "끝까지 쳐보고 싶은데 Play에서 `flightRule` 실패가 나면 어떻게 하나요?"
> **Domain expert:** "완주와 관찰은 **Observer 계열**이 담당합니다. Play는 **`flightRule`**에 따른 클리어/실패가 있는 기록 대상 흐름입니다."

## Flagged ambiguities

- **랭크**는 결과 등급이고 **난이도 등급**은 차트 레벨 구간이다.
- **입력 오프셋**과 **시각 오프셋**은 합치지 않는다. 오디오 오프셋은 제거했다.
- **`flightRule`**은 **난이도명**에 대응하는 시나리오와 연결된다. **Lv.**·**난이도 등급**과는 다르다.
- **`Infiltration`**에는 하향 시선 회전, **`Breakthrough`**에는 전방을 보는 지속 저공비행을 배치한다. 이름만으로 종전 규칙의 회복·실패 조건을 승계하지 않는다.
- **`altitude`**는 **달성률**이나 **랭크**와 다르다.
- **기어**는 레인을 둘러싼 장식이고, 프레임은 렌더 프레임(`renderFrame`, 프레임 시간)이다. `gearMotion`의 애니메이션 경과 시간이 "렌더 프레임마다" 나아간다는 말에서 둘을 섞지 않는다.
- **`gearMotion`**은 기어 위 장식 애니메이션이고, "움직이다"는 위치가 바뀌는 것(노트 스크롤, 리프트)에만 쓴다. 기어는 리프트로 움직이지 않는다.
