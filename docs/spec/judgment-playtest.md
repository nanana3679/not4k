# 판정 실플레이 Lab

개발 서버의 `/lab/judgment-playtest`에서 [RFD 0020](../rfd/0020-note-judgment-units-and-inheritance.md)의 채택 모델을 사람이 직접 플레이한다. 차트와 안내는 `src/lab/judgmentPlaytestScenarios.ts`에 있으며, 규칙은 [glossary](../context/glossary.md#롱노트-판정-모델)와 [판정 사례 명세](note-judgment-cases.md)를 따른다. 수동 입력에 맞춰 간격을 늘린 대조도 포함한다. 판정 사례 15개와 기존 트릴 바디 색상 확인 사례 1개를 제공한다.

## 사용 방법

1. `npm run dev`로 서버를 실행하고 `/lab/judgment-playtest`를 연다. Lab은 production 번들과 라우트에 포함하지 않는다.
2. 연결·교대, 감소·release, `holdOnly`, 실패·복구 중 분류를 고른다. 카드에서 패턴·치는 법·기대 결과·관련 `NJ-` ID를 확인한다.
3. 플레이 버튼을 누르면 합성 메트로놈과 실제 `PlayScreen`이 시작된다. 자동 입력은 없으며 모든 차트는 120 BPM, 첫 노트는 2000ms이다.
4. 판정 사례의 A/B/C/D는 레인 1의 서로 다른 키를 뜻한다. 트릴 바디 색상 확인 사례는 카드에 명시한 레인 2를 사용한다. 상단은 현재 바인딩의 실제 키 이름과 판정 모드·배속·입력 오프셋을 표시한다. 안내 시각은 차트 기준이며 기대 등급은 Normal·1배속의 명시된 입력 기준이다.
5. `Esc → Retry`로 반복하거나 `Quit`으로 목록에 돌아온다. 완주 뒤 `Back to Lab`을 누르면 해당 사례의 분류·달성률·Miss·Full Combo와 기대 결과를 볼 수 있다. 같은 사례 다시 플레이는 이전 결과와 재생 구간을 초기화한다.

기존 에디터의 `performPlayTest`로 차트를 검증하고 새 차트·클릭트랙·시작 시각·Lab 복귀 URL을 설정한다. 서버의 곡이나 오디오 에셋 없이 실행할 수 있다.

기존 Lab과 같이 시작 시 Debug Mode를 켜고 종료 시 `debug-log-*.txt`를 다운로드한다. 이 설정은 이후에도 유지되며 Settings에서 끌 수 있다. 일반 연결 성공은 점수·콤보·Perfect 개수를 늘리지 않는다. 실제 release·`holdOnly` 완료·유지 실패를 구분해서 확인한다.

## 수동 사례

| 사례 ID | 직접 비교할 동작 | 예시 입력의 기대 결과 |
|---|---|---|
| `connected-single-swap` | `o-o-`의 A 유지+B 탭 / A→B 교대 | 두 방법 모두 Perfect 3·Miss 0 |
| `connected-double-swap` | `d=d=`의 A/B 유지+C/D 탭 / 전체 교대 | 두 방법 모두 Perfect 6·Miss 0 |
| `single-head-double-connection` | `=o=`의 유지+C 탭 / 한 몫 교대 | 두 방법 모두 Perfect 5·Miss 0 |
| `decrease-chain` | `=-=-`의 감소·증가 입력 / 두 키 계속 유지 | 정상은 3 down·3 up으로 Perfect 5. 생략하면 Miss |
| `holdonly-decrease-chain` | 두 감소를 면제받고 A/B 유지 | Perfect 7·Miss 0. 마지막 A up은 B가 남아 있어도 유효 |
| `failure-recovery` | 첫 바디를 놓치고 다음 헤드부터 복구 | Perfect 3·Miss 1·100%·Full Combo NO |
| `partial-double-head` | 더블 헤드 중 A만 입력하고 유지 | Perfect 2·Miss 1·50%. 종속 끝점의 추가 Miss 없음 |
| `same-key-short-connection` | 같은 키로 중간 헤드 재타격, 100ms 뒤 release | Perfect 3·Miss 0. 앞 up을 마지막 Good으로 사용하지 않음 |
| `independent-holdonly-start` | 500ms부터 held / 2000ms 새 down | 기존 held만 있으면 Miss 1, 새 시작은 Perfect 1 |
| `late-holdonly-start` | 60ms 바디의 끝 이후 첫 입력 / 시작 기한 초과 | 2100ms down은 Perfect 1, 2120ms 초과는 Miss 1 |
| `holdonly-then-slide` | 양수 완료 뒤 길이 0까지 같은 키 유지 | 새 down 없이 Perfect 2 |
| `timeout-then-slide` | 앞 release를 놓친 뒤 길이 0까지 held | Perfect 1·Miss 1·50% |
| `hold-trill-chain` | 500ms 간격 헤드 6개 교대 | Perfect 7·Miss 0 |
| `hold-trill-chain-250` | 250ms 간격 헤드 8개 교대 | Perfect 9·Miss 0 |
| `hold-trill-chain-125` | 125ms 간격 헤드 8개 교대 | Perfect 9·Miss 0 |
| `trill-long-visual` | 레인 2의 긴 트릴 바디 유지와 짧은 바디 교대 | held 바디와 끝캡의 색상을 시각 확인 |

유지 실패·부분 실패 때 바디 표시, 이른 연결 교대 후 아직 지나지 않은 바디의 연속성, 보류 판정의 콤보·표시 일치도 함께 확인한다. 사람의 입력 오차를 고정된 자동 통과·실패 기준으로 분류하지 않는다.

## 회귀 검사

- `src/lab/judgmentPlaytestScenarios.test.ts`: 모든 차트의 배치 제약과 실제 `NoteJudgmentSession` 입력으로 카드의 기대 결과를 검증한다.
- `e2e/lab/judgment-playtest.spec.ts`: 실제 카드 실행·브라우저 키 입력·결과·Lab 복귀·재실행, 분류·키 안내·스크롤을 검증한다. 시각은 테스트에서 제어하며 판정 엔진은 대체하지 않는다.

자동 검사의 결과와 남은 검증은 [PRD](../prd.md#12-미정-사항)에서 관리한다. 합성 키 입력의 성공을 물리 키보드 체감 검증 완료로 기록하지 않는다.
