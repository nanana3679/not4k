# Shared Chart Model

`ChartDocument`는 구형·명시 항목을 보존하는 저장·편집 문서다. 풀 정의는 [glossary](../../docs/context/glossary.md#chartdocument), 필드와 저장 버전은 [차트 문서 포맷](../../docs/spec/chart-format.md)을 따른다.

Shared chart model 컨텍스트는 게임 클라이언트와 차트 편집기가 공유하는 차트 언어를 다룬다.
개별 노트 타입과 피스의 의미는 루트 `CONTEXT.md`의 Core domain을 따른다.

**계약 상태:** [RFD 0037](../../docs/rfd/0037-explicit-score-notes-and-body.md)의 채택 계약이며 공용 문서·에디터·일반/명시 테스트 재생을 구현·검증했다. 구형 읽기·수리·혼합 저장 의미는 과도기 동안 보존한다.

## Language

**박**:
차트에서 음악적 위치를 표현하는 기본 시간 좌표이다.
_Avoid_: 초, 프레임

**마디**:
`TimeSignatureChangeEvent`가 정의하는 박 묶음이며 차트 탐색과 그리드 표시의 큰 단위이다.
_Avoid_: 섹션

**곡 메타데이터**:
제목·아티스트·자켓은 같은 곡의 모든 차트가 공유하며, 이 표시 정보만 수정하면 기존 기록과 랭킹을 유지한다([glossary](../../docs/context/glossary.md#곡-메타데이터)).

**곡 타이밍**:
같은 곡의 모든 차트가 공유하는 초기 BPM·BPM 변경 목록·박자표·변박 정보·음원 정렬용 오프셋이다. 곡 단위 공유는 채택 규칙이며 런타임 반영은 후속 작업이다([glossary](../../docs/context/glossary.md#곡-타이밍)).

**차트 메타데이터**:
난이도명·Lv. 등 개별 차트를 설명하는 정보이다. 현재 차트 문서가 곡 제목·아티스트·자켓·오프셋도 담는 저장 표현과 곡의 논리적 소유 범위를 구별한다([glossary](../../docs/context/glossary.md#차트-메타데이터)).
_Avoid_: 곡 메타데이터

**`ChartDocument`**:
구형/신형 항목의 의미를 함께 보존하는 저장·편집 문서 타입이다. 기존 `Chart`는 구형 소비자 입력으로 구별한다([glossary](../../docs/context/glossary.md#chartdocument), [저장 포맷](../../docs/spec/chart-format.md)).
_Avoid_: 전체 문서 버전으로 항목 의미 자동 변경

**시점 이벤트**:
특정 박 이후의 시간 해석을 바꾸는 `BpmChangeEvent` 또는 `TimeSignatureChangeEvent`이다. 0박 초기 설정도 포함한다([glossary](../../docs/context/glossary.md#차트-이벤트)).
_Avoid_: 구간 이벤트

**`BpmChangeEvent`**:
특정 박 이후의 BPM을 정의하는 시점 이벤트이다.
_Avoid_: 스크롤 속도

**`TimeSignatureChangeEvent`**:
마디 경계의 박부터 한 마디가 몇 박인지 정의하는 시점 이벤트이다. 저장 위치는 `beat`다([glossary](../../docs/context/glossary.md#timesignaturechangeevent)).
_Avoid_: `BpmChangeEvent`

**`BpmChange`·`TimeSignatureChange`**:
시점 이벤트에서 추출한 시간 계산용 데이터다. 각각 박 기준 BPM과 마디 번호 기준 박 수를 담는다([glossary](../../docs/context/glossary.md#bpmchangetimesignaturechange)).
_Avoid_: 이벤트의 시각 표현

**구간 이벤트**:
시작 박과 끝 박을 가지며 일정 구간 동안 의미가 유지되는 차트 이벤트이다.
_Avoid_: 시점 이벤트

**이벤트 배치 겹침**:
같은 보조 레인에서 종류에 관계없이 이벤트의 점·구간이 겹치는 의미 위반이다. 겹친 초기 BPM·박자 설정만 로드에서 보조 레인을 자동 분리하며, 값·박 위치와 다른 의미 위반은 유지한다([glossary](../../docs/context/glossary.md#chartevent), [RFD 0078](../../docs/rfd/0078-event-placement-overlap.md)·[RFD 0082](../../docs/rfd/0082-initial-timing-events-not-selectable.md), 자동 분리 런타임은 후속 구현).

**`TextEvent`**:
특정 구간 동안 튜토리얼 설명 문구를 보여주는 구간 이벤트이다.
_Avoid_: 메시지 이벤트, 텍스트 이벤트

**`AutoEvent`**:
특정 구간 동안 사용자 입력 없이 노트가 자동 판정되는 튜토리얼 전용 구간 이벤트이며, 일반 차트의 연출용으로 사용하지 않는다([glossary](../../docs/context/glossary.md#autoevent-구-표기-auto-구간)).
_Avoid_: 무점수 구간

**`StopEvent`**:
차트 진행을 멈추며 해당 구간의 노트 배치를 금지하는 구간 이벤트이다.
_Avoid_: BPM 변경

**구간 노트**:
시작 박과 끝 박을 가지는 구간 요소다. 새 바디는 무점수·입력 미소비이고 구형 롱노트의 내장 끝점과 구별한다([glossary](../../docs/context/glossary.md#바디)).
_Avoid_: 탭 노트

**명시적 점수 노트**:
탭 노트·릴리즈 노트·틱 노트의 요구 한 몫이 가중치 3인 점수 항목 하나다. 바디 수량으로 끝 항목을 자동 생성하지 않는다([glossary](../../docs/context/glossary.md#점수-항목과-무점수-miss)).
_Avoid_: 바디 자동 점수

**위치 관계**:
같은 레인·박 배치에서 바디와 노트 관계를 도출한다. 틱 노트의 공유 경계는 뒤 바디, 릴리즈는 앞 바디 끝에 대응한다([glossary](../../docs/context/glossary.md#바디와-명시-노트의-편집-관계)).
_Avoid_: 사용자 소속 ID 지정

**구형 차트와 과도기**:
미수정 구형 의미와 사람이 만든 새 의미를 보존하며 혼합 저장·재불러오기로 수리를 이어가는 기간이다. 구형 항목이 남으면 새 재생은 차단한다([glossary](../../docs/context/glossary.md#구형-차트와-과도기)).
_Avoid_: 자동 변환, 영구 구형 지원

**`convertLegacyChart`**:
사용자가 에디터 모달에서 승인할 때만 실행하는 구형 차트 1차 기계 변환이다. 기존 명시 노트는 두고, 증가·감소 연결 등 사람이 고칠 위치를 보고로 돌려준다([glossary](../../docs/context/glossary.md#convertlegacychart)).
_Avoid_: 자동 변환, 일괄 수리

**`trillZone`**:
트릴 노트가 등장할 수 있는 차트 영역으로, 시작 박과 끝 박을 가지며 자체 입력은 요구하지 않는다. 차트의 1급 구조로 저장된다. 풀 정의는 glossary의 `trillZone` 항목을 따른다.
메인·보조 모든 레인에 존재하며 같은 트릴 제약을 적용한다. 보조 구간의 저장 분리·게임 제외는 [glossary](../../docs/context/glossary.md#trillzone)·[RFD 0086](../../docs/rfd/0086-auxiliary-lane-trill-zones.md)를 따른다.
_Avoid_: 트릴존, 트릴 노트

**`restZone`**:
그 레인이 해당 구간 동안 안 쓰임을 나타내는 레인별 저작 구간(`{ lane, beat, endBeat }`)으로, `trillZone`처럼 차트의 1급 구조로 저장된다. 시각 표시(게임 dim, [RFD 0034](../../docs/rfd/0034-rest-zone-lane-panel.md)로 레인 판넬 전환 예정·에디터 타임라인 빗금) + 에디터 배치 제약만 하고 판정에는 개입하지 않는다. 풀 정의는 glossary의 `restZone` 항목과 [RFD 0019](../../docs/rfd/0019-rest-zone-lane-guidance.md)를 따른다.
_Avoid_: 휴지존, 비활성 레인

**차트 에셋**:
저장되거나 배포되는 차트 본문과 제작 보조 정보를 묶은 산출물이다.
_Avoid_: 곡 에셋

**제작 보조 정보**:
게임 플레이에는 쓰이지 않지만 차트 편집을 이어가기 위해 저장되는 정보이다.
_Avoid_: 플레이 데이터

**`ChartTiming`**:
차트 하나에서 파생되는 시간 뷰. 노트 시작/끝 ms, `trillZone` 시작 ms, 마디 시작 ms, 판정 수 집계를 소유하며 beat→ms 파생은 항상 이 뷰를 통해 읽는다. 풀 정의는 glossary의 `ChartTiming` 항목을 따른다.
_Avoid_: 노트 타임맵, 시간 맵

## Relationships

- 하나의 **차트**는 하나의 **차트 메타데이터**를 가진다.
- **차트 메타데이터**는 **난이도명**과 **Lv.**를 함께 가진다.
- **박**은 차트의 시간 좌표이고 **스냅**은 박을 나눈 배치 격자의 한 칸(또는 위치를 그 칸에 맞추는 편집 보조)이다([glossary](../../docs/context/glossary.md#스냅-snap)).
- **`BpmChangeEvent`**와 **`TimeSignatureChangeEvent`**는 **박자 그리드**를 계산하는 기준이다.
- **시점 이벤트**는 한 시점 이후에 영향을 주고, **구간 이벤트**는 시작과 끝 사이에 영향을 준다.
- **`TextEvent`**, **`AutoEvent`**, **`StopEvent`**은 모두 **구간 이벤트**이다.
- **구간 노트**는 시작 박과 끝 박을 가지며, **탭 노트**·**릴리즈 노트**·**틱 노트**와 구형 포인트 노트(`PointNote`)는 특정 박 하나에 놓인다.
- 하나의 **차트**는 **`trillZone`** 목록을 가진다. **`trillZone`**과 **트릴 노트**는 상호 배타적이다 — 트릴 노트는 `trillZone` 안에만, 일반 노트는 밖에만 놓인다.
- 새 **바디**는 release를 내장하지 않으며 일반·그레이스 **릴리즈 노트** 모두 실제 뗌을 요구한다. 유지 실패의 릴리즈 기회 소멸은 [glossary](../../docs/context/glossary.md#release-판정)를 따른다.
- 같은 레인·시각의 **바디 끝 + 릴리즈 노트**는 허용하는 조합이다. 이전의 양수 바디 끝과 별도 길이 0 롱노트 중복 금지([NJ-C01](../../docs/spec/note-judgment-cases.md#nj-c01))를 새 조합에 적용하지 않는다. 새 트릴 바디는 시작 트릴 탭 노트를 요구하며 아래 구형 배치 의미와 구별한다.
- 새 **바디**의 실제 경계는 맞닿아도 저장·컴파일에서 보존한다. 정상 승계와 새 시작을 구별하며 확정 실패는 뒤 바디로 전파하지 않는다([glossary](../../docs/context/glossary.md#바디-판정과-실패-종속)). 같은 hold 수·같은 트릴 여부로 맞닿은 바디에 탭 노트도 릴리즈도 없으면 의미 위반이며, 트릴 바디와 일반 바디의 경계는 방향과 관계없이 빠진다([glossary](../../docs/context/glossary.md#의미-위반과-수리)).
- 새 **틱 노트**는 바디 hold 수에 맞춰 1몫·2몫이며 같은 hold 수 연결점·트릴 바디 위는 금지다. 독립 길이 0과 1→2·2→1의 뒤 바디 기준 틱 노트는 허용한다([glossary](../../docs/context/glossary.md#틱-노트-tick)).
- 현재 **명시 릴리즈**는 `trillZone` 안에 도입하지 않는다. 같은 레인의 시작·끝과 바디 끝도 포함한다([glossary](../../docs/context/glossary.md#릴리즈-노트), [RFD 0038](../../docs/rfd/0038-release-notes-in-trill-zones.md)).
- 같은 위치의 서로 다른 점수 의미와 길이 0 바디+탭 노트/릴리즈는 금지한다. 의미 위반의 편집 확정·선택 해제는 허용하되 저장·플레이 검증은 유지한다([glossary](../../docs/context/glossary.md#의미-위반과-수리)).
- 구형·신형 **혼합 저장**은 실제 위반이 없는 한 허용하고, 구형 항목의 존재는 새 compiler/재생에서 차단한다. main/aux 자료·메타데이터·의미·dirty 비교를 보존한다([glossary](../../docs/context/glossary.md#구형-차트와-과도기)).
- 저장/편집 문서, 정적 관계·진단, 컴파일된 명시 점수 항목·바디 몫, 세션 현재 상태·불변 확정 사실을 구별한다. 구체적인 참조와 API 표현은 [RFD 0037 §9](../../docs/rfd/0037-explicit-score-notes-and-body.md#9-구현-경계단계와-검증)의 의미를 보존하도록 구현에서 정한다.
- **차트 에셋**은 게임에서 소비되고 에디터에서 생성된다.
- **제작 보조 정보**는 에디터를 위한 정보이며 플레이 세션에는 등장하지 않는다.
- Gameplay는 **`ChartTiming`**을 통해 차트의 시간 파생을 읽는다.

### 과도기 구형 모델

아래는 구형 읽기·표시·편집을 위해 보존하는 계약이다. 새 바디·명시 점수 노트의 저장 의미와 섞지 않는다. 구형 속성은 사용자가 승인한 1차 기계 변환(`convertLegacyChart`) 밖에서 새 릴리즈/틱 노트로 바꾸지 않으며 종료는 [glossary](../../docs/context/glossary.md#구형-차트와-과도기)를 따른다.

- **구간 노트**는 끝점에 **`holdOnly`**(떼는 판정 면제) 속성을 가질 수 있으며, 이 속성은 차트에 저장된다.
- **트릴 롱노트**는 head가 필요하며, 양수 길이의 **`holdOnly`**는 허용하고 길이 0 조합은 금지한다.
- 양수 길이 바디 끝과 별도 길이 0 롱노트를 같은 시각에 배치하지 않는다. 같은 unit 수로 이어지는 경계에는 head 또는 `holdOnly`가 필요하다. 풀 정의는 [glossary](../../docs/context/glossary.md#holdonly-구-표기-유지-전용-롱노트), 배치 대조는 [사례 NJ-C01～C03](../../docs/spec/note-judgment-cases.md#nj-c01)을 따른다. validator의 이행은 [PRD §12](../../docs/prd.md#12-미정-사항)에서 추적한다.

## Example dialogue

> **Dev:** "BPM이 바뀌면 노트 낙하 속도도 바뀌나요?"
> **Domain expert:** "아니요. **`BpmChangeEvent`**는 박과 시간의 관계를 바꾸지만, 플레이의 스크롤 속도는 별도 설정입니다."
>
> **Dev:** "메시지는 노트처럼 한 박에만 놓이나요?"
> **Domain expert:** "아니요. **`TextEvent`**는 시작 박과 끝 박을 가지는 **구간 이벤트**입니다."

## Flagged ambiguities

- **박**과 **스냅**은 다르다. 박은 시간 좌표이고 스냅은 배치 격자의 한 칸이며 차트 해상도 제약이 아니다.
- **차트 메타데이터**와 곡 자체의 메타데이터를 섞지 않는다.
- **`AutoEvent`**은 스코어에 반영되며 무점수 구간이 아니다.
- **`StopEvent`**은 BPM 변경이 아니라 차트 진행을 멈추는 구간이다.
