# not4k — 오디오-비주얼 동기화

> [RFD 0031](../rfd/0031-audio-first-timing-model.md) PR 1의 계산식·설정·곡 끝 처리를 구현했다. 입력·시각 캘리브레이션(PR 2·3)과 auto 키빔·키봄 시각 시간 적용(#245)은 후속이다.

플레이어가 듣는 소리를 판정과 화면의 기준으로 삼는다. 출력·화면·입력의 지연은 서로 다른 경로에서 생긴다.

```
[오디오] AudioContext → 출력 장치 → 귀                  L
[화면]   위치 계산 → GPU → V-Sync → 모니터 → 눈         D
[입력]   키 누름 → OS → KeyboardEvent.timeStamp          I
         timeStamp → JS 핸들러                         handlerDelay
```

`AudioEngine.currentTimeMs`는 `AudioContext.currentTime` 기반 곡 위치 P다. 실제 경과 시간에 실제 배속 r(`AudioEngine.playbackRate`, 0.1~4.0)을 곱하며, `gameplayRange`의 시작을 0ms로 삼는다. 브라우저가 보고하는 출력 지연과 사용자 오프셋·handlerDelay는 실제 시간 ms이므로 곡 시간에 적용할 때 r을 곱한다.

## 보정 설계

### A. 소리 기준 판정·시각 시간

```
L₀ = (baseLatency + outputLatency) × 1000  // 재생 전 한 번 확정, 실제 ms
J = P − L₀·r
V = J + visualOffsetMs·r
```

`AudioEngine.prepareForPlayback()`은 스킨 로딩과 병렬로 진행한다. `AudioContext.resume()`이 2초 안에 끝나지 않으면 원인을 설명하는 오류로 준비를 거부하고 `PlayScreen`의 오류 화면으로 간다. resume이 끝나 running이 되면 무음 반복 버퍼를 출력에 연결한다. 25ms 간격으로 지연을 읽고 최소 100ms 후 최근 연속 3개 안정 후보 값의 차이가 0.1ms 이하면 마지막 값을 확정한다. 100ms·500ms는 반복 횟수가 아니라 무음 출력 시작부터 `performance.now()`로 잰 실제 경과 시간이다. 500ms까지 안정되지 않으면 마지막 보고값을 쓰며, 콜백이 늦어지면 500ms가 지난 뒤 처음 실행되는 관측에서 확정한다. 합산한 지연이 NaN·Infinity 등 유한하지 않은 값이면 0ms를 쓴다. 무음은 정리하고, 준비 Promise를 기다린 뒤 `GameClock`을 만들어 첫 판정·렌더 프레임부터 L₀를 쓴다. 준비 중 컨텍스트가 닫히면 준비를 거부하고 무음을 정리한다. 미준비·실패 상태에서 L₀를 읽으면 오류다.

`outputLatency`는 기능 감지하며 없으면 그 몫만 0으로 두고 `baseLatency`는 유지한다. 지원하지만 0을 보고하면 아직 안정되지 않은 것으로 보고 연속 안정 후보를 비운다. 이후 0이 아닌 값이 안정될 때까지 관측하며, 계속 0이면 실제 500ms까지 기다린 뒤 `baseLatency`만 반영한다. 준비 결과는 일시정지·재개와 중복 준비 호출에서 유지하고, 새 `AudioEngine`을 만드는 Retry·다음 곡에서 다시 읽는다. 곡 중 장치 변경은 반영하지 않는다. 실제 장치 지연과 브라우저 보고값의 고정 오차는 두 사용자 오프셋으로 보정할 수 있다.

노트·마디선·구간처럼 시간으로 위치를 정하는 렌더링에는 V를 전달한다. 시각 오프셋은 판정에 영향을 주지 않는다. auto 키빔·키봄은 아직 기존 확정·auto 입력 경로를 사용하며, V에 맞추는 변경은 #245에서 한다.

### B. event.timeStamp 기반 입력 시간

```
handlerDelay = max(0, performance.now() − event.timeStamp)
입력 시간 = J − handlerDelay·r + inputOffsetMs·r
```

`InputSystem`이 전달한 timestamp를 `GameClock.toInputTimeMs`에서 변환한다. `performance.now()`와 이벤트 timestamp의 짧은 차이만 AudioContext 기반 현재 J에 적용하므로 두 클럭의 원점을 직접 비교하지 않는다. 미래 timestamp의 handlerDelay는 0이다. timestamp 이전의 장치 지연 I와 개인 체감은 입력 오프셋이 맡는다. 타이머 정밀도·클럭 stepping·메인 스레드 지연 자체를 없애는 보정은 아니다.

입력 큐는 원래 입력 시각별로 처리한다. 한 프레임의 기한 진행 상한은 `min(J, 현재 입력 시간)`이다. auto 입력은 그 상한까지 만들되 이미 큐에 더 앞선 입력이 있으면 `max(진행 상한, 큐의 마지막 입력 시각)`까지 먼저 만들어 시간순으로 처리한다. 이 규칙은 음수 입력 오프셋의 정당한 늦은 입력 창을 지킨다.

### C. 입력·화면 오프셋

| 설정 | 코드 | 적용 | 부호 |
|---|---|---|---|
| Input Offset | `inputOffsetMs` | 입력 장치 지연·개인 체감 | SLOW면 음수, FAST면 양수 |
| Visual Offset | `visualOffsetMs` | 화면 표시 지연 D | 화면이 소리보다 늦으면 양수 |

둘 다 기본 0, 실제 시간 ms로 숫자 입력한다. 포커스를 옮겨 입력을 확정할 때와 저장 설정을 병합할 때 모두 −1000~+1000ms로 제한한다. 유효하지 않거나 유한하지 않은 숫자는 0ms로 둔다. 출력 장치 지연은 L₀가 맡으므로 Audio Offset은 제거했다. 저장 설정의 `audioOffsetMs`·`judgmentOffsetMs`·`offsetMs`를 읽을 때 버리고 이전하지 않는다. 차트 오프셋 `offsetMs`는 음원과 차트의 정렬을 맡으며 그대로다.

Calibrate 진입은 새 경로 구현 전까지 숨긴다. PR 2는 비프에 맞춘 탭으로 입력 오프셋을, PR 3은 비프와 떨어지는 노트를 보고 시각 오프셋을 맞춘다. 세부 설계는 RFD 0031을 따른다.

## 곡 끝과 일시정지

오디오 끝에서도 P는 같은 AudioContext 시간 기준으로 실제 경과 × r만큼 계속 증가한다. `onended`는 음원 노드만 정리하며 시계를 재설정하지 않는다. 결과 화면은 아래 두 조건을 모두 만족할 때 연다.

- J가 재생 구간 끝에 도달했다.
- `min(J, 현재 입력 시간)`이 `NoteJudgmentSession.latestJudgmentDeadlineMs`를 **지났다**. 이 기한은 모든 노트의 `max(시작, 끝) + Good 창`의 최댓값으로 `finalize()`와 공유한다.

그 전에 `finalize()`로 남은 창을 강제 정산하지 않는다. 판정 대기 중 pause는 P를 고정하고, resume은 그 위치에서 시간만 이어 간다. 이미 끝난 오디오는 다시 재생하지 않는다.

## 이상적인 동기화와 검증

목표는 스피커에서 비트가 들리고 노트 가운데가 판정선에 보이는 순간 누르면 `deltaMs ≈ 0`인 상태다. 판정 창·Show Timing Diff·FAST/SLOW·디버그 `deltaMs`는 계속 **곡 시간 ms**다. r이 커지면 실제 시간으로 판정 창은 좁아진다.

디버그의 `noteCenterY`는 판정 확정 시점의 V로 계산한다. `yDifference = (V − 노트 시각) × scrollSpeed / 1000`이며, 입력 오프셋·시각 오프셋·handlerDelay·큐 대기로 인해 `deltaMs × scrollSpeed / 1000`과 같을 필요가 없다. `Avg deltaMs`는 입력 편향을 보여 주지만 화면 동기화를 단독으로 증명하지 않는다. Offset Recommendation은 평균 편향을 r로 나눈 실제 ms의 반대 부호를 **현재 inputOffsetMs에 더할 값**으로 제시한다. 모니터 표시 지연 D는 로그만으로 검증할 수 없다.

## 관련 문서

- 용어·부호: [glossary 오프셋 구분](../context/glossary.md#오프셋-구분)
- 게임 동작: [game-core.md](game-core.md#오프셋)
- 로그 해석: [debug-mode.md](debug-mode.md)
- 판정 윈도우: [scoring.md](scoring.md)
