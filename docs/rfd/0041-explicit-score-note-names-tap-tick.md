# RFD 0041: 명시 점수 노트 이름 tap·tick

**Status:** Accepted (2026-10-26) · 한국어 이름 탭 노트·틱 노트 결정 (2026-10-28) · 기존 용어와의 겹침 정리 (2026-10-28, PR #363) · 저장 JSON `type`·코드 식별자·스킨 에셋 id·용어 권위 문서 변경 (2026-10-28, PR #365) · 화면 문구·주석·테스트 이름·나머지 스펙 문서와 판정 사례 PNG 변경 (2026-10-28, PR #366) · 명시 스킨 PNG 파일 이름을 `tap-*`·`tick-*`·`body-*`·`release-*`·`*-grace-overlay`로 변경 (2026-10-29, #360)

## 1. 기존 결정과 문제

[RFD 0037](0037-explicit-score-notes-and-body.md)은 누름·뗌·유지 구간·바디 위 점수를 별개 노트로 나누었지만 저장 이름은 정하지 않았다. "정식 용어 정의는 glossary, 저장 필드·배열·ID·API 이름은 공용 모델 구현이 소유한다"고 적었다. #341을 구현한 에이전트가 저장 JSON `type`과 타입 이름을 `point`·`body`·`release`·`sustain`으로 정했다. 문서는 이를 포인트 노트(Point)·바디·릴리즈 노트·유지 노트로 불렀고, 유지 노트의 화면 표시는 유지 표식이라고 따로 불렀다.

2026-10-26 사용자는 JSON 이름 설명을 듣고 "근디 press release sustain 이 자연스러운데"라고 했다. 에이전트는 이 이름을 사람이 정하지 않았다는 점과 `press`가 입력 이벤트(`onLanePress`·`PressToken`, glossary의 레인 press/release 이벤트)와 겹친다는 점을 알렸다. 이어 사용자 요청으로 다른 게임의 이름을 조사했다. 아래는 에이전트 조사 결과이며 결정이 아니다.

- 누름 노트는 tap이 가장 흔하다. press를 노트 이름으로 쓰는 게임은 찾지 못했다.
- 바디 안의 확인 지점은 tick이나 checkpoint로 부른다.
- Guitar Hero·Friday Night Funkin'의 sustain은 유지 구간 자체(not4k의 바디)를 가리킨다. 바디 위 점수 노트인 not4k의 `sustain`과 뜻이 다르다.

tap과 tick은 저장소의 기존 용어와 겹쳤다. 문서의 "틱"은 에디터 배치 격자를 뜻했고, 에디터 터치 제스처는 tap, 캘리브레이션 그림·미니맵·판정 사례 도구의 눈금과 `requestAnimationFrame` 콜백은 tick 식별자를 썼다.

## 2. 결정

이 절에는 사용자가 말한 결정만 적는다.

1. **이름 변경 (2026-10-26).** 저장 JSON·타입 이름 `point`를 `tap`으로, `sustain`을 `tick`으로 바꾼다. `release`·`body`는 그대로 둔다. 사용자는 먼저 "나도 tap tick이 익숙해"라고 했다. 에이전트가 겹침 정리안(문서의 에디터 격자 "틱"→스냅, 미니맵·캘리브레이션 눈금의 tick→marker 계열 식별자, 에디터 터치 제스처의 tap→click 계열 식별자, 게임 쪽 tap은 유지)을 보이고 "tap·release·tick으로 바꿀지, 지금대로 point·release·sustain을 유지할지"를 묻자 "이정도면 바꿔도 될거같은데"라고 답했다. 마지막 질문이 두 안만 놓았으므로 `release`는 유지한다. `body`는 에이전트가 "바디(`body`)는 … 그대로 둡니다"라고 했고 사용자가 이의를 두지 않았다.
2. **적용 순서 (2026-10-26).** 사용자는 순서 선택지에서 "2"를 골랐고 이어 계획을 "ㅇㅋ"로 승인했다.
   - 겹침 정리는 #340～#347 스택과 따로 main에서 먼저 한다. PR #363에서 정리했고, 그중 판정 사례 도구의 축 눈금 `axis`, 미니맵 위반 눈금 `indicator`(문서 "지시자"), `requestAnimationFrame` 콜백 `step`은 2026-10-28 사용자가 정했다. 세부는 [term-map](../context/term-map.md#b-기존-개념--established-이름-유지)을 따른다.
   - 노트 이름 변경은 #347 머지 직후 이 RFD와 함께 별도 PR로 한다.
   - 그 PR 머지 전까지 v4 차트를 저장하지 않는다. 사용자는 2026-10-28에도 "에디터에서 v4차트 저장하지 않기 (여러 이름이 바뀌어서)"라고 다시 확인했다.
   - 차트 다시 제작은 그 PR 머지 뒤에 시작한다.
3. **한국어 이름 (2026-10-28).** 서술에서는 **탭 노트**와 **틱 노트**로 쓴다. "릴리즈 노트"와 같은 꼴이다. 사용자는 앞서 "포인트 유지 표식을 tap tick으로 불러도 되지않을까"라고 물었다. 에이전트가 서술 표기로 (1) 탭 노트·틱 노트, (2) `tap`·`tick`, (3) Tap·Tick을 제시하자 "1"로 답했다.

## 3. 적용 범위

아래는 결정에서 따라오는 적용과 에이전트가 제안한 구현 세부다. 2026-10-28 에이전트가 "이의가 있으면 알려 주세요"와 함께 제시했고 사용자 이의는 없었다. 사용자 결정으로 기록하지 않는다.

**바꾸는 것**

- 저장 JSON `type` `"point"`→`"tap"`, `"sustain"`→`"tick"`. 점수 항목 `kind`, 점수 항목 id(`n2:tick:0` 꼴), 렌더러 레이어 이름도 이 값을 따른다.
- TS 타입과 식별자. `ExplicitPointNote`→`TapNote`, `SustainNote`→`TickNote`이며 `Explicit` 접두사는 구형 `PointNote`와 겹치지 않게 붙였던 것이라 뺀다. 관계 필드(`startTapIndices`·`tickIndices`·`tickBodyByNote` 등), 검증 규칙 id(`tickPlacement`·`tickCount`·`sameHoldCountConnectionWithoutTapOrRelease`), 판정 코어의 실패 사유 `tapMiss`도 같은 규칙으로 바꾼다.
- 명시 스킨의 에셋 id·역할·변형(`tap.*`·`tick.*`·`graceOverlay.tap.overlay`)과 원본 `roles.json`, 생성 manifest.
- 판정 사례 설계 JSON의 노트 `kind` `"point"`→`"tap"`, `"maintain"`→`"tick"`.
- glossary·term-map·CONTEXT의 용어. "유지 표식"은 따로 남기지 않고 틱 노트가 노트와 그 화면 표시를 함께 가리킨다.

**바꾸지 않는 것**

- 구형 v3 타입과 식별자: `PointNote`·`POINT_NOTE_TYPES`·구형 Classic 스킨 키(`pointShadow`·`pointContactShadow`·`pointGraceOverlay`)·구형 판정 코어. 구형 문서의 "포인트 노트"·"Point"도 구형 뜻으로 남기며 [과도기 종료](../prd.md#12-미정-사항) 때 함께 정리한다.
- JSON `kind`·`count`·`holdCount`·`grace` 필드와 `release`·`body`.
- 바디 유지를 뜻하는 "유지"·`maintenance` 계열(유지 판정·유지 유예·유지 실패·`maintenanceMiss` 등).
- 게임 쪽 tap(캘리브레이션 탭, `ExplicitAutoPlayer`의 `tapDurationMs`, 홀드 중 탭·릴리즈탭). 탭 노트와 같은 "짧게 누름"을 뜻한다.
- 기록 문서: [RFD 0037](0037-explicit-score-notes-and-body.md)～[RFD 0040](0040-countdown-and-note-reentry.md)의 본문은 고치지 않고 상단에 이 RFD를 가리키는 줄만 둔다. [제품 논의 기록](../research/explicit-score-notes-discussion.md)은 그대로 둔다.
- 명시 스킨 PNG 파일 이름(`sustain-*.png`·`point-grace-overlay.png`). 해시로 고정한 #339 보관본의 파일 이름이라 id·역할만 바꾸고 파일 이름은 스킨 교체(#360) 때 정리한다. #360에서 [런타임 파일 이름](../../assets-lab/classic/explicit/README.md#생성과-검증)을 바꿨다. 해시로 고정한 에셋 보관본과 공개 이미지 갤러리도 그대로 둔다.
- 차트 형식 version. 4로 유지한다.

## 4. 이행

- 게임은 출시 전이고 결정 2에 따라 v4 차트를 저장하지 않았다. 데이터 이전과 옛 이름을 읽는 별칭을 두지 않는다. 옛 이름이 든 v4 문서는 "지원하지 않는 노트 type"으로 읽기에 실패한다. 원격 저장소에 v4로 저장한 차트가 없음은 사용자가 확인했다(2026-10-28, "없어").
- 구형 v3 읽기는 바뀌지 않는다. 구형 차트 변환기(#359)는 `tap`·`tick`을 낸다.
- 저장소 밖 시제품 사례 JSON은 보관 기록으로 두며 옮기지 않는다. 옛 이름이라 판정 사례 도구로는 더 이상 읽지 못한다.
- 구현은 두 PR로 나누었다. 앞 PR은 저장 JSON·식별자·스킨 id와 이 RFD·용어 권위 문서(glossary·term-map·CONTEXT)를 바꾼다. 뒤 PR은 화면 문구·주석·테스트 이름·나머지 스펙 문서를 바꾸고 판정 사례 PNG를 다시 만든다.

## 5. 검토한 대안

| 안 | 판단 |
| --- | --- |
| point·release·sustain 유지 | 사용자의 첫 답("그냥 냅두자 겹치는게 싫어서")이었으나 겹침 정리안을 본 뒤 결정 1로 바뀌었다 |
| press·release·sustain | press가 입력 이벤트와 겹치고 노트 이름으로 쓰는 게임을 찾지 못했다 |
| tap·lift·tick | 마지막 질문이 두 안만 놓았고 고르지 않았다 |
| tick 대신 checkpoint | 고르지 않았다 |
| #340～#347 스택 안에서 이름 변경 | 순서 선택지 "2"로 기각했다 |

tap·tick은 다른 게임에서 익숙한 이름이지만 저장소의 기존 용어와 겹쳤다. 겹침은 #363에서 먼저 정리했고, 게임 쪽 tap은 탭 노트와 같은 뜻이라 남겼다.

## 6. 영향

- 코드: 공용 차트 타입·저장 파서·관계·검증(`src/shared`), 명시 컴파일·판정 코어·세션·정산·자동 연주(`src/game/judgment`·`src/game/input`·`src/game/scoring`), 명시 스킨·렌더러, 에디터 생성·선택·클립보드·타임라인, Lab·판정 사례 도구, 단위 테스트·E2E의 v4 차트.
- 문서: glossary·term-map·CONTEXT, [PRD §12](../prd.md#12-미정-사항)의 「노트 이름 변경」 행, 저장 형식·에디터·판정 사례 스펙(코드 이름은 앞 PR, 서술은 뒤 PR).
- 후속: 구형 차트 변환기 #359, 명시 스킨 교체와 파일 이름 #360, 보조 레인 `trillZone` #362.
