# `trillZone` 경계의 입력 추적

`trillZone` 교대 상태는 레인 전체의 전역 상태가 아니라 각 `trillZone`에 귀속된다. 노트의 원래 Beat가 속한 zone을 정적으로 결정하고, 해당 zone의 교대 키 상태만 갱신한다.

노트를 실제 시각보다 늦게 처리해 다음 zone의 시간 구간에서 입력하더라도 이전 zone의 노트는 다음 zone의 교대 상태를 오염시키지 않는다. 반대로 zone 안의 노트를 이르게 처리한 경우에는 원래 귀속된 zone의 상태에 기록한다. 입력 timestamp로 zone 귀속을 다시 계산하지 않는다.

판정 등급은 일반 Point 규칙을 따른다. zone 경계라는 이유로 타이밍 등급을 변경하지 않으며, 경계 보호는 교대 상태 기록 범위만 제한한다. 교대 실패는 `goodTrill` 상한 규칙을 따르고, 이전 zone 상태를 재사용해 추가 패널티를 만들지 않는다. Bad 판정은 생성하지 않는다.

이 문서는 현재 채택 모델의 용어와 경계를 설명한다. 구현 검증은 [RFD 0020](../rfd/0020-note-judgment-units-and-inheritance.md), [판정 사례](../spec/note-judgment-cases.md), 그리고 runtime 테스트가 담당한다.
