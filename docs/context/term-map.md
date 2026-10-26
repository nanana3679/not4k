# 용어 권위 매핑표 (term map)

[RFD 0010](../rfd/0010-terminology-language-policy.md) 적용 결과. glossary·CONTEXT·spec·본문 전파의 기준 표다.

**원칙:** prose(서술·근거·예시 대화)는 한국어 유지. 이 표가 바꾸는 것은 *용어 토큰*뿐이다. 모든 항목은 개념당 표면형 1개, 동의어 폐기, glossary에서 1:1 고정.

**새 판정 계약:** [RFD 0037](../rfd/0037-explicit-score-notes-and-body.md)은 **채택 계약·일반 기본 경로 구현·검증**이다. 새 용어는 아래 표기와 [glossary](glossary.md)의 정의를 따른다. 저장 JSON·타입 이름과 예정된 이름 변경은 [B](#b-기존-개념--established-이름-유지)의 포인트 노트 문단을 따른다. `holdOnly`·연결 release·등록 키의 구형 의미는 과도기 읽기·표시·편집 범위에서만 유지한다.

## 판별 규칙

1. **발명 + 코드 식별자 존재** → 영어 코드 식별자(`백틱`)
2. **기존 개념**(리듬게임·음악계에 원래 있는 것) → established 이름(자연스러우면 한국어, 커뮤니티 표준이 영어면 영어). 그래픽스·웹·오디오·타이밍·에셋 수명 주기 같은 소프트웨어 개념도 여기 속한다(→ E)
3. **코드 없는 발명 용어** → 우선순위:
   - a. 기존 용어가 있으면 그것 (엄검중약, 앵커, 가변 분할)
   - b. 전용 표기 심볼이 있으면 정의에 표기 명시 + 구어 이름 유지 (릴리즈탭=`-o`)
   - c. 둘 다 없으면(보면에 안 보이는 손동작) 짧은 한국어 이름 (홀드 이어잡기)
4. **발명 + 코드는 있으나 식별자가 개념을 못 담는 경우** → 한국어 이름 유지 + 정의에 구현 식별자 명시, C에 배치 (2026-07-06 다중키 바인딩에서 확립 — `keyBindings`가 "다중" 의미를 못 담음)

## A. 영어 코드 식별자로 전환 (발명 + 코드 실재)

| 현 한국어 표제어 | → 캐논 | 코드 식별자 |
|---|---|---|
| 저장·편집 차트 문서 | `ChartDocument` | `ChartDocument`/`DocumentNoteEntity`/`DocumentExtraNoteEntity` — 구형 `Chart`·`NoteEntity` 소비자와 구별. [정의](glossary.md#chartdocument) |
| 트릴 구간 | `trillZone` | `trillZone`/`TrillZone`/`trillZones` |
| 휴지 구간 | `restZone` | `restZone`/`RestZone`/`restZones` |
| 공릴리즈 — **폐지** (RFD 0015, 역사적 언급만) | `emptyRelease` | 없음 (도장 구현 삭제됨) |
| 흡수·소비 | `consume` | `consumedLongKeys`/`markLongConsumed`/`requiredConsumeCount`/`consumeReleaseTarget`/`executeReleaseJudgment` |
| 유지 전용 롱노트(hold-only) | `holdOnly` — 새 계약에서는 폐지, 과도기 미수정 구형 항목 전용 | `holdOnly`/`isHoldOnlyNote`(구형 구현) |
| 연결 판정 | `connection` — 새 계약의 실제 바디 경계와 구형 연결 보정을 구별 | `isConnection`/`Connection`(구형 구현 근거, 새 API명 강제 아님) |
| 종결 판정 | `termination` — 새 계약은 명시한 릴리즈만 판정 | `executeTerminationJudgment`/`terminationGrade`(구형 구현) |
| 인게임 구간 | `gameplayRange` (UI 라벨은 화면 표시 예외로 "인게임 구간" 유지) | `gameplayRange` |
| Good◇ → `goodTrill` | `goodTrill` (화면 표시 GOOD◇) | `goodTrillCount`, `JudgmentGrade.GOOD_TRILL` |
| 차트 이벤트 | `ChartEvent` | `ChartEvent`/`RangeEvent` |
| 차트 시간 뷰 | `ChartTiming` | `ChartTiming`/`createChartTiming`/`ChartTimingSource` |
| 메시지 이벤트 | `TextEvent` (⚠️ 2026-06-30 A1을 재전환) | `TextEvent`(type `"text"`) |
| Auto 구간 | `AutoEvent` | `AutoEvent`(type `"auto"`) |
| 정지 이벤트 | `StopEvent` | `StopEvent`(type `"stop"`) |
| 레인 경계 레이어 | `laneAxis` | `laneAxis` 모듈, `MAIN_LANE_COUNT`, `isMainLane`/`isAuxLane`, `mainNotes`/`auxNotes`, `toAuxIndex`/`fromAuxIndex`, `isVisibleLane`, `maxAuxLane` |
| 기어 움직임 | `gearMotion` (기어 위 장식 애니메이션: 광원 띠·게이지 액체 흐름과 기포·발광선·하단 바 빛. 설정 라벨 `Gear Motion`은 화면 표시라 그대로 둔다. "움직이다"는 위치 변화(노트 스크롤·리프트)에만 남긴다, 2026-10-09) | `gearMotion`/`GearMotionController`/`GearMotionControls`/`gear-motion.json` |
| 승인 SVG ("승인된 애니메이션 SVG"·"승인된 기어 움직임 SVG" 등. "승인"은 누가 언제 승인했는지 드러나지 않고 "SVG"만으로는 노트 에셋 SVG와 구분되지 않아 바꿨다, 2026-10-09 결정. `docs/design/cel-shaded-asset-workflow.md`의 "승인 SVG"는 Classic 노트 에셋 소스(`assets-lab/classic/sources/`)라 이 행에 속하지 않는다) | `gearMotion` 시안 SVG (처음 나올 때 "`gearMotion` 시안 SVG(확정한 v19, `54-ambient-motion-v19.svg`)". Lab 스펙(`lab-preview-catalog.md`)에서는 경로 상수 `GEAR_MOTION_SVG_PATH`도 적는다. Pixi `gearMotion`이 똑같이 보여야 하는 기준이다. 그 SVG를 레이어별로 켜고 끄는 보관 페이지는 `gearMotion` 시안 SVG 시연 페이지(`ambient-motion.html`)) | `GEAR_MOTION_SVG_PATH`(`src/lab/gearMotionView.ts`) |
| 기어 y 오프셋 (Lab 조절 이름. 검토 중 "기어·판정선 내리기"·`gearDrop`·`?drop=`에서 바꿨다, 2026-10-10) | `gearOffsetY` (기어와 판정선을 함께 옮기는 화면 y축 값, +가 아래, 논리 px, 게임 값 10. 이 값을 가리킬 때 "내리기"·"내린 양"을 쓰지 않고, 화면 효과를 서술할 때만 "내린다"를 쓴다. 다른 오프셋과의 구분은 [glossary](glossary.md#오프셋-구분)) | `gearOffsetY`/`GEAR_OFFSET_Y`/`clampGearOffsetY`/`GearStage.offsetY`, Lab `data-gear-offset-y`·주소 `?offsetY=`·`#gear-preview-offset-y` |
| 무대 ("무대 상태"·"무대 data 속성" 등. Lab Gear(`/lab/gear`)에서 렌더러 캔버스를 담은 `<section>`을 가리키던 말이다. stage의 번역어인데 Pixi에서 stage는 렌더러 최상위 `Container`(`app.stage`)라 헷갈려 바꿨다, 2026-10-09 결정. Pixi stage를 가리킬 때는 Pixi `stage`로 쓴다) | `gear-preview-stage` (처음 나올 때 "렌더러 캔버스를 담은 Lab 미리보기 `<section>`(`gear-preview-stage`)". 페이지가 조절 상태와 렌더러가 매 프레임 알려 주는 값을 이 `<section>`의 `data-*` 속성에 쓰고 E2E가 읽는다. 전체화면으로 띄우거나 1:1 픽셀 보기에서 스크롤하는 것은 그 안의 캔버스와 비행 배경(`gear-preview-viewport`)이다. Lab 화면 문구에는 식별자 대신 "미리보기 영역"을 쓴다. 화면에서는 `<section>`과 캔버스 영역을 나누지 않고 사용자가 보는 테두리 친 캔버스 영역을 가리킨다, 2026-10-13) | `gear-preview-stage`/`data-gear-preview-stage`(`src/lab/GearPage.tsx`) |

표기법 심볼(`o`/`t`/`D`/`-`/`=`/`{`/`}`/`~`/`*`/`-o`/`t-`/`D=-`)은 기존 기록에서 유지한다. 구형 끝점·`holdOnly` 표기를 새 모델의 암묵적 뗌·점수 계약으로 읽지 않는다.

## B. 기존 개념 — established 이름 유지

**일시정지 후 재개**는 기존 재생 조작의 한국어 표기를 유지한다. 새 흐름의 의미는 [glossary](glossary.md#일시정지-후-재개)에 정의하며 별도 코드 식별자를 이 용어로 확정하지 않는다.

레인, 틱, 비트 분할, 판정 윈도우, 싱글 노트(code `single`), 롱 노트(code `long`), 더블 노트(code `double`), 트릴 노트(code `trill`), Grace 노트(code `grace`), 주키/보조키, 엄지 눕히기, 인지 부하/물리 부하, 난이도 등급/난이도 축, **배드말림**(Bad Train), `BPM`, **앵커**(osu!mania established, 의미 일치), **가변 분할**, **엄검중약**(약중검엄에서 정정), 외부 인용 용어(IIDX 스크래치·볼텍스 노브·maimai Break 등 원작 표기), **유지 판정**(보편 홀드 개념 — 코드만 영어 정렬: `checkLongNoteBodyHold`/`laneHoldStates`/`longNoteBodyStates` — 대표 예시, 전체는 glossary 참조. 2026-07-06 A에서 재분류), **차트 레벨(Lv.)**(보편 개념 — 코드 `difficultyLevel`. 2026-07-06 A에서 재분류), **난이도명**(보편 개념, 차트 레벨과 쌍둥이 — 코드 `difficultyLabel`. 2026-07-06 A에서 재분류), **기어**(레인 영역을 둘러싼 테두리 스킨의 한국 리듬게임 커뮤니티 표준 이름 — 코드 `gear*` 정렬: `gearImage`·`GearLayout` 등, 전체는 [glossary](glossary.md#기어-gear) 참조. 기어 위 장식 애니메이션과 그 식별자(`GearMotionController`·설정 `gearMotion` 등)는 A의 `gearMotion` 행. 이 뜻의 "프레임"은 렌더 프레임과 헷갈려 쓰지 않는다. 2026-10-06 #231), **녹숫**(노트가 레인에 보이고 판정선에 닿기까지의 시간. IIDX 녹색 숫자의 한국 커뮤니티 표준 이름이며 not4k는 IIDX의 프레임 기반 숫자가 아니라 시간으로 다룬다. Lv.별 기준값은 추정 녹숫, [glossary](glossary.md#녹숫-green-number) 참조. 2026-10-15), **흰숫**(서든·리프트가 줄이는 레인 높이를 레인 위끝부터 리프트 0% 판정선까지 = 1000으로 놓고 잰 값. IIDX 흰색 숫자의 한국 커뮤니티 표준 이름이며 위쪽(서든)·아래쪽(리프트) 흰숫이 따로 있고 숫자 하나로 말하면 보통 합계, not4k 설정 %의 10배. [glossary](glossary.md#흰숫-white-number) 참조. 2026-10-18 #291).

새 계약의 **포인트 노트**(Point, 누름)·**바디**(유지 구간)·**릴리즈 노트**(실제 뗌)는 기존 리듬게임 개념을 나타내므로 한국어 이름을 유지한다. `Point`·release·body는 설명에서 병기할 수 있다. 저장 JSON·타입 이름은 `point`·`release`·`sustain`·`body`이며 #341에서 도입했다. 사용자는 기존 용어와 겹치는 이름의 정리안(문서의 에디터 격자 "틱"→스냅, 미니맵·캘리브레이션 눈금의 tick→marker 계열 식별자, 에디터 터치 제스처의 tap→click 계열 식별자, 게임 쪽 tap은 유지)을 본 뒤 `point`→`tap`, `sustain`→`tick`으로 바꾸기로 결정했다(`release`·`body`는 유지, 2026-10-26, 사용자: “이정도면 바꿔도 될거같은데”). 적용 순서도 사용자가 정했다(2026-10-26). (1) 겹침 정리는 #340～#347 스택과 무관하게 main에서 별도 PR로 진행한다. (2) 노트 이름 변경은 #347 머지 직후 RFD와 함께 별도 PR로 한다. (3) 그 PR 머지 전까지 v4 차트(#341에서 도입하는 신형·혼합 저장 형식)를 저장하지 않는다. (4) 차트 다시 제작은 그 PR 머지 뒤에 시작한다. 그 PR 전까지는 이름을 바꾸지 않으며 진행은 [PRD §12](../prd.md#12-미정-사항)에서 추적한다. **Grace 노트**는 Point·명시 릴리즈의 타이밍 등급 면제이며 새 릴리즈의 실제 up 요구를 없애지 않는다. **유지 판정**은 새 계약에서 실제 레인 hold 수로 판단하고 등록 키 기반 구형 구현과 구별한다. 풀 정의는 [glossary](glossary.md#포인트-노트-point)를 따른다.

> 트릴/더블/Grace 노트: 음악·리듬게임 기존 용어라 **한국어 이름 유지 + 코드만 영어 정렬**(`trill`/`double`/`grace`). 단 트릴 *구간*은 발명이라 A의 `trillZone`.

> 페이드 인/페이드 아웃: 오디오의 기존 개념이라 B. `gameplayRange`(플레이 음원 구간)와 `previewRange`(곡 선택 미리듣기 구간)가 같은 필드 이름(`fadeInTime`·`fadeOutTime`)을 쓰므로 "`gameplayRange` 페이드 인·아웃"처럼 어느 구간인지 앞에 붙여 쓴다. 옛 표기 "인게임 페이드"는 쓰지 않는다(2026-10-09).
>
> 홀드 중 탭: 표기법(`a-- / .b.`)이 있고 not4k의 다중키 바인딩으로 가능해지는 동작이라 C에만 둔다(2026-10-09, 이전에는 B와 C에 중복).

## C. 코드 없는(또는 코드명이 개념을 못 담는) 발명 — 한국어 이름 + 정의에 표기법

| 용어 | 캐논(구어 이름) | 정의에 명시할 표기 |
|---|---|---|
| 릴리즈탭 | 릴리즈탭 | `-o` (`-` 떼며 `o` 탭) |
| 릴리즈 노트 | 릴리즈 노트 | 롱노트와 별개로 뗌을 명시하는 노트. 바디 끝에 조합하거나 단독으로 배치. 사용자에게 내부 식별자 후보 `hasRelease`로 설명하지 않음 ([RFD 0035](../rfd/0035-release-presence-and-grace.md)·[RFD 0037](../rfd/0037-explicit-score-notes-and-body.md), 구현: 코드 `release`) |
| 그레이스 릴리즈 | 그레이스 릴리즈 | 실제 뗌은 필수, Good 창 안이면 Perfect. `holdOnly`와 구분. 구현: 릴리즈 노트의 `grace: true`. 피스 표기법 기호는 아직 없음 |
| 릴리즈 없음 | 릴리즈 없음 | 바디 유지 요구는 남고 해당 끝의 뗌은 요구하지 않는 상태. 그레이스 릴리즈와 구분 |
| 홀드 중 탭 | 홀드 중 탭 | 키 라벨층 `a-- / .b.` |
| 홀드 교대 (← 홀드 이어잡기 개명) | 홀드 교대 | (보면 비가시 — 표기 없음) |
| 다중키 바인딩 | 다중키 바인딩 | 구현: `keyBindings`/`KeyBinding`/`laneBindings` — 배열명이 "다중" 의미를 못 담아 캐논 부적합 (2026-07-06 A에서 재분류) |
| 분할 릴리즈 | 분할 릴리즈 | `D=-` |
| 유지 노트 | 유지 노트(화면의 개별 표시는 유지 표식) | 바디 상태에 명시적 점수 정산만 추가한다. 자체 창·입력 소비가 없다. 저장 JSON·타입 이름은 `sustain`이며 #347 머지 직후 RFD와 함께 별도 PR에서 `tick`으로 바꾼다([B](#b-기존-개념--established-이름-유지), [glossary](glossary.md#유지-노트)) |
| 바디 몫 | 바디 몫 | single 1개·double 2개의 시작·유지·완료·실패 단위. 고정 물리 키 소유가 아니다. unit/body unit은 설명용 병기이며 새 타입명 강제 아님 |
| 점수 항목 | 점수 항목 | 명시 노트의 요구 한 몫당 가중치 3인 항목. 바디 자체는 만들지 않는다([glossary](glossary.md#점수-항목과-무점수-miss)) |
| 종속 0점 | 종속 0점 | 기회 소멸은 원래 가중치의 0점 정산이며 추가 Miss 효과가 없다([glossary](glossary.md#점수-항목과-무점수-miss)) |
| 구형 차트와 과도기 | 구형 차트와 과도기 | 미수정 구형 의미 보존·혼합 저장·새 재생 차단·사람의 수리. 종료 시점은 사용자 지정([glossary](glossary.md#구형-차트와-과도기)) |
| 피스류(비트 복합 트릴, 레인 내 분리, 롱끝 교대→트릴, 가변 분할 피스 등) | 한국어 이름 | 표기법 + PP 코드 |
| 고도 게이지 시연 (← 게이지 "승인 시연" 개명. "승인"으로는 누가 언제 승인했는지 드러나지 않는다, 2026-10-13) | 고도 게이지 시연 | `lab/image-galleries/frame-keywords-six-20260929/press-animation.html`의 게이지 슬라이더와 `게이지 자동 변화`. 게임 고도 게이지가 빈 유리·유리 안쪽 마스크·8px 경계·약 300ms ease-out을 따른 기준. 디자인 기록은 [게이지 채움 조절](../design/classic-frame-keywords-20260929.md#게이지-채움-조절) |

## D. 손·키·패턴 계층 어휘 (2026-06-30 정리, 모두 한국어 유지)

직관적 한국어/기존 용어라 RFD상 한국어 유지. 흩어진 "교대" 용법을 계층별로 정리한다.

| 용어 | 정의 | 비고 |
|---|---|---|
| 운지 | 입력 인터페이스에 **손가락**을 대응시키는 법 (손가락→키) | 기존 |
| 손배치 / 가변 손배치 | 손이 어느 레인을 맡는지 (구성/상태) | 기존, 핵심 정체성 |
| 손 이동 | 손이 담당 레인/키 위치를 옮기는 **동작**. **수평 이동**(레인 좌우, =구 건너가기)·**수직 이동**(키보드 상하, 연속 동시치기-트릴)으로 나뉨 | 손이 주체라 모호함 없음. bare "이동"은 에디터 엔티티 이동과 충돌하므로 "손 이동"으로 한정 |
| 파지 | 특정 패턴 파훼를 위한 **손배치 전략** (응용, 손 이동을 동원) | 기존(파지법). "양손 교대" 대체 |
| 키 교대 | 한 레인 내 **활성 키 전환** (다중키 바인딩) | primitive. `구현: alternation`/`trillAlternation` |
| 의도된 연주 | 차트가 의도한 박자·손배치 흐름에서 바디와 명시 노트를 처리하는 제작·플레이테스트 기준. 구형의 모든 up 소비·`holdOnly` 예외 정의는 glossary의 과도기 기록으로 보존 | 새 계약은 RFD 0037. 구형 기준은 2026-10-16, RFD 0032 §7-1·§7-2·§9-1·§9-2. 코드 식별자 없음 |
| 연결 release | **과도기 구형 계약·과거 논의 전용. 새 계약에서는 숨은 up 소비를 제거했다.** 연결 경계에서 앞 바디의 몫이 끝날 때 떠나는 up 하나를 등급·점수 항목 없이 처리하는 release. 경계 전이면 그때 앞 바디가 끝나고, 경계 뒤·head 뒤면 이미 끝난 몫의 release. 기존 엔진의 연결 보정(구 표기 앞 바디 종료 포함) | 2026-10-17, RFD 0032 §4-1·§4-2. 코드 식별자 없음 |
| 허용 입력(탈출구) | 구형에서 의도된 연주와 구별하던 같은 키 재타격 `a-a-`·`ab-ab-`. 새 계약은 실제 경계의 분리 연주를 허용하되 숨은 연결 up 소비는 두지 않는다 | 2026-10-17, RFD 0032 §9-2. 코드 식별자 없음 |

**건너가기 → 수평 이동 (개명)**: 건너가기(기법)는 곧 손 이동의 **수평 이동**이라 기법 용어로 중복. 피스 `PP-009`의 라벨도 `수평 이동`으로 개명(PP 코드·구조 유지, 구 표기 건너가기). `가변 분할(PP-007)` prerequisite와 piece-definition·chart-design·prd 등 전 참조를 일괄 치환. 손 이동은 수평/수직 이동으로 분화.

**파생(키 교대에서 조합):** 트릴=빠른 키 교대 반복 / 릴리즈탭=롱노트 끝 키 교대 / 홀드 교대=홀드 중 키 교대 / `goodTrill`=키 교대 실패.

**경계 주의(glossary에서 못 박을 것):** 손배치=*구성/상태* vs 파지=*패턴 대응 전략*. bare "교대"는 쓰지 않고 항상 "키 교대"로 한정(손 단위는 파지가 담당).

### NM 트릴 표기 규약 (SDVX 관용)

트릴은 점유 레인쌍으로 `NM 트릴`로 표기한다 (N<M, 예: `12 트릴`·`23 트릴`·`34 트릴`). SDVX에서 흔한 established 표기. **23 트릴**은 2/2 분할의 중앙 경계를 넘어 수평 이동/파지와 직결되며, 같은 트릴이라도 손배치(2/2 vs 1/3)에 따라 난이도가 달라진다. (레인 번호=언어 중립 + 트릴=기존어 조합이라 한/영 무관.)

## E. 엔진·웹·수명 주기 용어 (2026-10-08)

그래픽스·웹·오디오·타이밍·에셋 수명 주기의 개념은 이 프로젝트가 만든 것이 아니라 원래 있는 소프트웨어 개념이라 B(established 이름)에 속한다. 이 분야의 커뮤니티 표준은 대개 영어 용어나 API 식별자이므로 그것을 쓰고, 자연스럽게 굳은 한국어(캐시, 텍스처, 스프라이트, 밉맵, 컨테이너, 렌더 프레임, 페이드, 에셋, 업로드 등)와 표에 적은 한국어 표기만 쓴다. 코드 식별자가 있다는 것만으로 발명이 되지는 않는다. 문서에서 처음 나올 때 식별자나 영어 용어를 적고, 일상어 비유로 한국어 이름을 새로 만들지 않는다. "피할 말"은 이 표를 추가한 시점에 저장소에 남아 있으며, 아래 [용어 단위로 고치기](#용어-단위로-고치기)에 따라 용어별 PR로 고친다.

| 개념 | 쓸 표기 | 피할 말 | 근거/식별자 |
|---|---|---|---|
| 운영체제·브라우저의 모션 감소 설정 | 처음: 모션 감소 설정(`prefers-reduced-motion`, macOS·iOS '동작 줄이기', Android '애니메이션 삭제', Windows 11 '애니메이션 효과'), 이후 `prefers-reduced-motion`. 인게임 설정 `Gear Motion`과 구분 | 움직임 줄이기 | [RFD 0030](../rfd/0030-ignore-os-reduced-motion.md), `prefersReducedMotion()`(#248에서 삭제) |
| reference counting | reference counting. 동작은 retain/release, 저장 값은 경로별 reference count | 참조 세기 | `retainSharedAsset`/`releaseSharedAsset`, `references`(`src/game/skin/sharedAssets.ts`) |
| lease | lease. 얻을 때 acquire, 끝낼 때 release("lease를 release"처럼 대상을 붙인다). 곡과 재시도 사이에도 lease를 release하지 않고 두는 것은 keep-alive | 임대, 빌리다, 붙잡아 두다, 놓다 | `GearMotionAssetLease`, `acquireGearMotionAssets`, `release()`, `keepGearMotionAssets` |
| release와 unload | 둘을 나눠 쓴다. release는 reference count를 1 줄이고, unload는 마지막 release 뒤 `Assets.unload`가 캐시에서 지우는 것이다. Pixi 객체 정리는 destroy(`destroy()`). 무엇(lease·경로·텍스처)을 다루는지 함께 쓴다 | 놓다(어느 쪽에도) | `releaseSharedAsset` → `Assets.unload` |
| 에셋 | 에셋. 예: `gearMotion` 에셋 = `public/gear/gear-motion/`의 `gear-motion.json`과 텍스처 9개(코드 `GearMotionData`(`gearMotionData.ts`)·`GearMotionTextures`(`gearMotion.ts`), 둘을 묶은 `GearMotionResources`). 생성기가 잰 값은 측정 데이터(`gearGeometry.json`) | 자료, 움직임 자료, 측정 자료 | `gearMotionAssets.ts`, `gearMotionData.ts` |
| warm-up | warm-up(`GameRenderer.prepareForPlayback(songTimeMs)`): 곡 재생 전에 곡 중 쓰는 텍스처 소스를 GPU 업로드(`initSource`)하고 첫 프레임을 한 번 그려 셰이더·마스크를 준비한다. `gearMotion` 하단 바 알파 마스크 준비는 `GearMotionController.warmUp(render)` | 한 장, 곡 시작 전 한 장, 첫 장 | `GameRenderer.prepareForPlayback`, `GearMotionController.warmUp`, `PlayScreen.tsx` |
| holder / container | `holder`(Pixi `Container`). 기어 위 레이어는 `addGearOverlay`로 추가한 컨테이너 | 자리, 움직임 자리 | `GearMotionController`의 `holder: Container`, `GameRenderer.addGearOverlay` |
| atlas frame | atlas frame(`Texture.frame`). 텍스처 안의 원본 영역(`atlasX`·`atlasY`·`width`·`height`)과 그릴 위치(`x`·`y`)를 구분해 쓴다 | 조각, 상자, 아틀라스 상자, 자리, bare "프레임" | `GearMotionPiece`(`gearMotionData.ts`), `gearMotion.ts` |
| GPU 업로드 | GPU 업로드(`initSource`) | (GPU에) 올리다, 올리기. 올리다는 리프트 뜻으로 남긴다 | `renderer.texture.initSource`(`GameRenderer.ts`) |
| double buffer | double buffer: `FaceFrame` 두 개(`faceFrames`)를 프레임마다 번갈아 쓴다 | 같은 버퍼를 다시 써서, bare "버퍼 재사용" | 쓰는 곳 `src/game/renderer/flight/breakthrough.mjs`(정의는 `output/prototypes/` 아래 모듈) |
| object pool | object pool(`TrailPool`): 수명이 끝난 trail 표본 객체를 모아 다음 표본에 다시 쓴다 | 같은 버퍼를 다시 써서, bare "버퍼 재사용" | 같은 파일 |
| trail | trail(`trails`, `TrailPool`, `advanceTrails`) | trail 뜻의 잔상·잔광. 잔광은 버튼 빛이 키를 뗀 뒤 사라지는 페이드 아웃(버튼 누름 시연 `press-animation.html`의 "잔광")에만 쓴다 | `breakthrough.mjs`, `approach.mjs` |
| tint | `tint` | 물들이기, 물들여 | `gearMotion.ts`의 `unlit.tint` |
| 마스크 | 그래픽스 뜻(Pixi `mask`, 스텐실 마스크, 알파 마스크 텍스처)에만 쓴다 | 서든의 상단 커버나 [#247](https://github.com/nanana3679/not4k/issues/247) 전 판정선 아래 레인을 덮던 불투명 사각형을 "마스크"로 부르기 | `gaugeLayer.mask`(`gearMotion.ts`), `barMask` 텍스처, 레인 끝 클립 `laneContentLayer.mask`(`GameRenderer.ts`) |
| 레인이 판정선 아래에서 끝나는 곳과 그 아래 자르기 | 레인 끝(`laneEndY`: 기어가 있으면 키 윗면, 없으면 판정선 + 노트 반 칸)과 레인 끝 클립(`laneContentLayer`의 mask `laneEndClip`, 스텐실 마스크). 레인 배경은 레인 끝까지만 그린다. **[#247](https://github.com/nanana3679/not4k/issues/247)에서 바꿨다**: 그 전에는 판정선 아래 레인을 불투명 `Graphics` 채우기(`drawMask`·`maskGraphic`·`laneMaskTop`·`COLORS.MASK_BELOW_JUDGMENT`, 지움)로 덮었다 | 레인 가림막, 레인 커버, bare "마스크". "가림막"·"레인 커버"는 SUDDEN+·HIDDEN·LIFT 같은 사용자 커버 기능(PRD G-10 서든)에 남겨 둔다 | `laneEndY`·`laneContentLayer`·`laneEndClip`(`GameRenderer.ts`), [RFD 0029](../rfd/0029-frame-aspect-fit-narrow-lanes.md) |
| 애니메이션 경과 시간 | 애니메이션 경과 시간(`gearMotion`의 `GearMotionControls.timeMs`, `renderFrame`의 `deltaMs` 누적). 곡 시간은 `GameClock` | 움직임 시계, 게임 프레임 시계, 시계(이 뜻일 때) | `GearMotionController.ts`, [`src/game/CONTEXT.md`](../../src/game/CONTEXT.md)의 `GameClock` |
| `gearMotion`을 이루는 Pixi 레이어 | `gearMotion` 레이어(`GEAR_MOTION_LAYERS`: `armor`·`gauge`·`accent`·`bar`, Lab 표시 이름 A 큰 광원·B 게이지 액체·C 발광선 호흡·D 하단 바 흐름). 레이어 묶음 전체는 `gearMotion` (2026-10-09) | 움직임 레이어, bare "움직임" | `GearMotionLayer`·`GearMotionLayerVisibility`(`gearMotionData.ts`), `setLayerVisible` |
| scene graph에 추가 | 추가(`addChild`). 기어 위 레이어는 `addGearOverlay` | 얹다, 얹기 | Pixi `Container.addChild` |
| 렌더러에 차트 설정 | `setChart` | 차트를 걸다 | `GameRenderer.setChart` |
| 표시 객체 위치 지정 | 위치 지정(`x`·`y`·`position.set`). 차트의 노트·피스 "배치"와 구분한다 | 놓다 | 예: `GearGauge`가 유리관마다 만든 컨테이너의 `holder.position.set(tube.x, tube.y)`(`gearGauge.ts`) |
| 에디터 연산 | 연산마다 이름을 쓴다. 정규화(`normalizeSelection`), 캡슐화(`TimelineSpace`가 좌표 변환·스냅·히트테스트를 한 인터페이스로 묶음), 매핑(`scheduleFromGrabTarget`: `GrabTarget` → 터치 스케줄), 변환(`maxTimelineBeat`: 부동소수 박을 1/960 단위로 내림해 `Beat`로) | 비유만 쓰는 접기, 접는다, 접은 | `selectionSlice.ts`, `TimelineSpace.ts`·`useTimelineSpace.ts`, `touchEditRouting.ts`, `SelectMode.ts` |
| modifier 키 | modifier 키 상태(`shiftKey`·`altKey`)와 선택 토글 플래그(`toggleSelection`) | 수식자, 보조키(게임 용어) | `PointerGesture`(`src/editor/modes/editorMode.ts`) |
| 히트테스트 우선순위 | `resolveGrab`의 히트테스트 우선순위(z-order 8단계). 롱프레스도 `resolveLongPressAction`의 우선순위 | 우선순위 사다리, 사다리 N단계 | `src/editor/modes/resolveGrab.ts`, `src/editor/modes/longPressRouting.ts` |
| 오프셋 | 어느 오프셋인지 이름을 붙인다: 입력 오프셋(`inputOffsetMs`)·시각 오프셋(`visualOffsetMs`)은 실제 시간(ms)(곡 시간으로 바꿀 때 배속 r을 곱함, 오디오 오프셋은 제거됨), 판정선 오프셋(`judgmentLineOffset`, 아래에서 위로)·기어 y 오프셋(`gearOffsetY`, +가 아래)은 화면 위치(논리 px)다. 차트 메타데이터 `offsetMs`는 차트 오프셋 | 이름 없는 "오프셋", offset | [glossary 오프셋 구분](glossary.md#오프셋-구분), `GameClock.ts`, `constants.ts` |

버퍼나 객체를 다시 쓴다고 적을 때는 구조 이름(double buffer, object pool)이나 다시 쓰는 대상의 식별자(`createApproachLightFrames()`의 결과 등)를 쓴다.

### 게임 용어 예약

기술 개념을 가리킬 때 아래 말은 왼쪽 뜻으로만 쓴다. 다른 기술 뜻이 필요하면 오른쪽 말을 쓴다. 일상어 쓰임("난이도를 올리다", "커서가 올라가면")과 오른쪽 "그대로 쓰는 다른 뜻"은 이 규칙의 대상이 아니다.

| 용어 | 남겨 둘 뜻 | 다른 기술 뜻일 때 쓸 말 | 그대로 쓰는 다른 뜻 |
|---|---|---|---|
| 판정 | judgment(노트 입력의 판정) | 검사(`matchMedia` 조회 등), 검증 결과 | — |
| 놓다·놓친 | 놓친 노트(missed), 키를 떼다·release 판정 | 대상을 붙인 release("lease를 release", "경로 release"), unload, 위치 지정 | — |
| 올리다 | 리프트(판정선 올리기) | GPU 업로드 | 일상어 올리다·올라가다 |
| 시계 | `GameClock` | 애니메이션 경과 시간(`GearMotionControls.timeMs`), `deltaMs` | 오디오 시계(`AudioContext.currentTime`), `performance.now()` 시계(그 API를 함께 적는다) |
| 프레임 | 렌더 프레임(`renderFrame`, `requestAnimationFrame`) | 텍스처 안 영역은 atlas frame(`Texture.frame`), 레인을 둘러싼 테두리는 기어 | 애니메이션 프레임(스프라이트 연속 그림, 예: 키봄 16프레임) |

### 단위 명사·일상 동사 금지

한 장, 한 벌, 자리, 조각, 상자, 자료, 얹다, 걸다, 놓다를 기술 개념의 명사·동사로 쓰지 않는다. 식별자를 쓰고, 식별자가 없으면 E 표의 용어를 쓴다. 예: 한 장 → 렌더 프레임·이미지·warm-up, 한 벌 → 공유 에셋, 자리 → `holder`·atlas frame, 조각·상자 → atlas frame, 자료 → 에셋·측정 데이터, 얹다 → `addChild`, 걸다 → `setChart`, 놓다 → 대상을 붙인 release(lease·경로)·unload·위치 지정.

### 용어 단위로 고치기

용어 하나를 바로잡을 때는 같은 PR에서 저장소 전체(문서, 코드 주석, 테스트 이름)를 옛 표기와 그 활용형(예: 임대·빌리다·붙잡아 두다)으로 검색해 함께 고친다. 문서 하나씩 고치면 옛 표기가 다른 문서에 남아 다시 퍼진다(RFD 0030이 `prefers-reduced-motion`을 정한 뒤에도 "움직임 줄이기"가 glossary·spec·PRD·코드에 남은 사례). 지난 CHANGELOG 항목과 [RFD 0030](../rfd/0030-ignore-os-reduced-motion.md) 결정 5가 고정한 보관·시연 기록은 제외한다. 용어 항목이 따로 정한 예외(glossary `기어` 항목의 옛 "프레임" 표기 등)는 그 항목을 따른다.

## 미구현·주의

- **비행 규칙 / 고도**: 구현 전 영어 명칭을 design-first로 선행 적용한다 — `flightRule`, `Liftoff`/`Infiltration`/`Breakthrough`, `altitude`. 세 이름은 차트 난이도명과 대응 비행 시나리오에 함께 사용한다([RFD 0022](../rfd/0022-flight-difficulty-names-and-visuals.md)). `Breakthrough`의 저고도는 정상 비행이므로 "판정이 좋을수록 시각 고도 상승"을 공통 정의로 두지 않는다. 상태와 시각 고도의 대응은 [glossary](glossary.md#altitude-altitude) 및 [PRD §12](../prd.md#12-미정-사항)를 따른다. → §2.2 no-code 규칙의 design-first 예외.
- **가장 이른 매칭**: **keydown 소비 / keyup 소비**의 동작 서술로 한국어를 유지한다. 새 계약은 [RFD 0037](../rfd/0037-explicit-score-notes-and-body.md)에 따라 명시 Point·릴리즈만 입력을 소비한다. 등록 키·시작 준비·연결 보정은 과도기 구형 [RFD 0020](../rfd/0020-note-judgment-units-and-inheritance.md)의 설명으로 한정한다. `earliest`는 지역 변수명일 뿐 개념 캐논이 아니다 (2026-07-06 A에서 제외). RFD 0015의 R1/R2는 역사적 약칭이며 익명·이진 release 정의를 현재 규칙으로 복원하지 않는다.
- **A1 재전환**: 2026-06-30 "텍스트 이벤트→메시지 이벤트" 정정은 이 정책으로 `TextEvent`(영어)로 다시 간다.
- **표기법 스펙(B 작업)**: `piece-notation.md`의 `-o` 정의 등은 AI 작성본이라 별도 정정 패스 필요(용어 정책과 분리). 현재 이름(릴리즈탭/홀드중탭)은 소통 문제없어 유지.
