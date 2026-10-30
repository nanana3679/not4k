# RFD 0067: BPM·박자 변경과 차트 이벤트의 이름 통일

**Status:** Accepted (2026-10-28) · 공용 타입·계산·에디터·소비자와 문서 이름 반영 (2026-10-28) · 전체 단위 5,260개·이벤트 편집 E2E 3개 통과 (2026-10-28) · 결정 문서는 [PR #379](https://github.com/nanana3679/not4k/pull/379)로 먼저 main에 반영, 코드 변경·위 검증은 [PR #368](https://github.com/nanana3679/not4k/pull/368)의 작업 (2026-10-31) · PR #368에 최신 main을 merge하고 main이 새로 들인 구형 차트 변환·저장 상태·보조 레인 `trillZone` 코드의 옛 이름을 맞춤, 전체 단위 5,941개·타입 검사 통과 (2026-10-31)

## 기존 결정과 문제의식

[#364](https://github.com/nanana3679/not4k/issues/364)는 BPM·박자·이벤트를 “마커”로 부르는 이름을 재검토한다. 저장·편집 모델은 이미 `ChartEvent`와 `events`를 쓰지만, 에디터의 편집 상태·모달·렌더링은 같은 대상을 `Marker`로 부른다. `BpmMarker`와 `TimeSignatureMarker`는 화면 표식이 아니라 시간 계산용 데이터여서 “이벤트의 시각 표현”으로 정의해도 실제 코드와 맞지 않는다.

## 검토한 대안

- 마커를 유지하고 이벤트와 구별한다. 같은 편집 대상을 두 이름으로 부르며 계산용 타입까지 화면 표현으로 오해하게 한다.
- BPM·박자만 타이밍 포인트로 묶는다. 시간 계산에는 맞지만 다른 차트 이벤트와의 편집 언어가 갈라지고 별도 개념이 늘어난다.
- 이벤트로 통일하고 계산용 데이터는 역할에 맞게 구별한다. 저장·편집 언어가 일치하는 대신 여러 모듈의 식별자와 문서를 함께 수정해야 한다.

## 채택안과 trade-off

사용자는 이벤트로 통일하는 방향을 채택하고 BPM 변경 이벤트라는 이름을 확인했다. 다음 이름을 사용한다.

| 대상 | 이름 |
| --- | --- |
| 차트 이벤트 통합 타입 | `ChartEvent` |
| BPM 변경 시점 이벤트 | `BpmChangeEvent` |
| 박자 변경 시점 이벤트 | `TimeSignatureChangeEvent` |
| 박 기준 BPM 계산 데이터 | `BpmChange` |
| 마디 번호 기준 박자 계산 데이터 | `TimeSignatureChange` |

0박의 초기 BPM·박자 설정도 각 변경 이벤트에 포함한다. 이벤트와 타임라인의 시각 표현은 같은 도메인 대상을 가리키며 별도 “마커” 개념을 두지 않는다. 에디터 식별자는 `editingEvent`, `EventEditModal`, `renderEvents`, `hitTestEvent`, `showGhostEvent`처럼 맞춘다. 공용 계산 함수·캐시도 `extractBpmChanges`, `extractTimeSignatureChanges`, `bpmChanges`, `timeSignatureChanges`로 맞춘다.

저장 JSON의 `events`, `type: "bpm"`, `type: "timeSignature"`와 이벤트 값·초기 설정 보호·좌표 계산·편집 동작은 유지한다. 사용되지 않는 deprecated `EventMarker` 타입 별칭은 제거하고, 과거 저장 포맷을 읽는 `LegacyEventMarkerJson` 이름은 과거 계약을 설명하므로 보존한다. 노트의 자유 표식, 음원 종료선, 옵저버 구간 경계처럼 차트 이벤트와 관계없는 표식은 이 변경의 대상이 아니다.

## 영향과 검증

- glossary를 권위로 삼아 term-map, 관련 `CONTEXT.md`, 편집·저장·PRD 문서를 동기화한다.
- 공용 타입·타이밍 함수와 에디터·게임·Lab 소비자의 식별자를 함께 변경한다.
- 관련 단위 테스트, 전체 단위 테스트, 타입 검사로 호출부 누락과 시간 계산 회귀를 확인한다. 이벤트 편집 E2E는 모달 제목·삭제 보호·저장·재편집 계약을 확인한다.
