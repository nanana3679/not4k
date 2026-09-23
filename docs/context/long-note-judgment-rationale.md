# 롱노트 판정 모델의 설계 배경

이 문서는 [RFD 0020](../rfd/0020-note-judgment-units-and-inheritance.md)의 현재 채택 모델을 이해하기 위한 보충 설명이다. 규범은 RFD와 [판정 사례](../spec/note-judgment-cases.md)에 있다. 구현은 현재 검증 중이다.

## unit을 사용하는 이유

롱노트는 single이면 1개, double이면 2개의 `unit`으로 나눈다. 각 unit은 시작 입력 또는 정확한 Beat 경계의 정당한 승계로 활성화되고, 등록된 유지 키·실패·끝점 상태를 독립적으로 추적한다. 하나의 unit 실패가 건강한 다른 unit이나 미래 바디를 함께 실패시키지 않는다.

고정 물리 owner를 두지 않는다. 시작 입력과 승계로 얻은 등록 키, 그리고 각 누름이 가진 release 권한을 구분하면 홀드 교대와 동일 키 재타격을 같은 규칙으로 설명할 수 있다. raw held만으로 독립 롱노트를 시작하거나 실패한 unit을 부활시키지는 않는다.

## connection과 release

connection은 같은 레인에서 앞 `endBeat`와 뒤 `beat`가 정확히 같을 때 정적으로 생성된다. 판정 창이나 10ms/12ms 오차로 관계를 추정하지 않는다. connection 성공은 score item·콤보를 만들지 않고, successor unit의 승계 준비만 제공한다.

실제 release는 score item에 귀속되어 입력 시각으로 Perfect/Great/Good/Miss를 판정한다. `holdOnly`는 실제 release를 요구하지 않고 등록된 unit 유지 성공을 Perfect로 정산한다. head, 실제 release, `holdOnly`만 이론 가중치 3의 score item이다.

## 경계와 실패

같은 unit 수의 정확한 연결 경계에는 head 또는 앞 노트의 `holdOnly`가 필요하다. unit 수가 바뀌는 경계는 둘 없이 허용한다. 양수 바디 끝과 별도 길이 0 롱노트, 길이 0 롱노트의 head, `holdOnly`와 같은 시각의 Point는 validator가 차단한다. 양수 `trillLong + holdOnly`는 허용하지만 길이 0 `trillLong`은 금지한다.

이 분리는 정상적인 `o-o-`, `d=d=`, 부분 double 승계, holdOnly 감소를 같은 정적 topology와 unit 상태 모델로 검증하기 위한 것이다. 세부 사례와 기대 event/score item은 `note-judgment-cases.md`의 NJ-H/NJ-R 사례에 기록한다.

과거의 이진 release, 고정 owner, 12ms 자동 연결·복구 논의는 각각 과거 RFD에 보존되어 있다. 현재 모델을 설명하는 본문에서는 그 규칙을 사용하지 않는다.
