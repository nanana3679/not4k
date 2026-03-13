# not4k — 오디오-비주얼 동기화

> 플레이어가 보는 노트 위치, 듣는 음악, 누르는 입력이 일치하도록 각 구간의 레이턴시를 보정하는 설계.

---

## 문제 정의

브라우저 리듬 게임에서 플레이어는 3개의 독립적인 지연 경로를 경험한다:

```
[오디오]  AudioContext 재생 → DAC → 스피커 → 귀     (audio output latency)
[비주얼]  Y 위치 계산 → GPU → V-Sync → 모니터 → 눈  (display latency)
[입력]    키 누름 → USB → OS → 브라우저 → JS 핸들러  (input latency)
```

현재 구현은 `audioEngine.currentTimeMs`를 단일 기준으로 사용하여 렌더링과 판정을 모두 수행한다. 이 값은 **오디오 버퍼에 데이터를 넣은 시점**이지 **스피커에서 소리가 나는 시점**이 아니므로, 오디오 출력 레이턴시만큼 시각과 청각이 어긋난다.

---

## 구간별 레이턴시 분석

### 1. 오디오 출력 레이턴시

Web Audio API의 출력 지연은 두 값의 합이다:

```
audioOutputLatency = audioContext.baseLatency + audioContext.outputLatency
```

| 환경 | baseLatency | outputLatency | 합계 |
|------|-------------|---------------|------|
| Chrome / Windows (WASAPI) | 3~12ms (버퍼 128~256 frames @ 44.1~48kHz) | ~10ms | 13~22ms |
| Chrome / macOS (CoreAudio) | ~3ms (128 frames @ 48kHz) | ~10ms | ~13ms |
| Firefox / Windows | 3~12ms | ~20ms | 23~32ms |

`baseLatency`는 오디오 처리 그래프의 내부 버퍼링 지연이며, 실제 값은 샘플레이트와 버퍼 크기에 따라 달라진다. Windows에서 WASAPI 기본 버퍼가 128 frames @ 44.1kHz이면 ~2.9ms이지만, 256 frames이나 공유 모드에서는 ~6~12ms까지 올라갈 수 있다. 위 테이블의 합계는 범위로 표기한다.

**핵심**: `audioEngine.currentTimeMs`가 1000ms일 때, 플레이어가 실제로 소리를 듣는 시점은 유선 환경 기준 1013~1032ms이다.

### 2. 디스플레이 레이턴시

렌더링 파이프라인의 지연:

```
rAF 콜백 실행 → GPU 처리 → V-Sync 대기 → 모니터 스캔아웃 → 응답 시간
```

| 구간 | 60Hz | 144Hz |
|------|------|-------|
| GPU 처리 | 1~3ms | 1~3ms |
| V-Sync 평균 대기 | ~8ms | ~3.5ms |
| 모니터 응답 시간 | 5~15ms | 1~5ms |
| **합계** | ~17~26ms | ~6~12ms |

**핵심**: rAF에서 계산한 노트 위치는 실제로 1~2프레임 뒤에 화면에 표시된다.

### 3. 입력 레이턴시

키보드 입력이 JS 핸들러에 도달하기까지:

| 구간 | 최소 (광축+1kHz) | 일반 (기계식+1kHz) | 최악 (멤브레인+125Hz) |
|------|------------------|--------------------|-----------------------|
| 스위치 + 디바운스 | 0.4ms | 5.5ms | 20ms |
| USB 폴링 대기 | 0~1ms | 0~1ms | 0~8ms |
| OS + 브라우저 처리 | 1.3ms | 2.5ms | 6ms |
| **합계** | ~2ms | ~9ms | ~34ms |

---

## 현재 구현의 문제점

### 문제 1: 오디오-비주얼 불일치

```ts
// PlayScreen.tsx — 현재 코드
const songTimeMs = audioEngine.currentTimeMs + settings.offsetMs;
judgmentEngine.update(songTimeMs);   // 판정: audioEngine 기준
renderer.renderFrame(songTimeMs);     // 렌더링: 같은 기준
```

렌더링과 오디오가 같은 `songTimeMs`를 사용하므로:
- 노트가 판정선에 도달하는 시각 = `audioEngine.currentTimeMs` 기준
- 플레이어가 소리를 듣는 시각 = `audioEngine.currentTimeMs + audioOutputLatency`
- **결과**: 노트가 판정선에 닿는 것을 본 뒤 소리가 늦게 들림 (또는 소리 기준으로 치면 노트가 이미 지나감)

### 문제 2: event.timeStamp 미사용

```ts
// PlayScreen.tsx — 현재 코드
onLanePress: (lane, _timestampMs, keyCode) => {
  const songTimeMs = audioEngine.currentTimeMs + settings.offsetMs;
  judgmentEngine.onLanePress(lane, songTimeMs, keyCode);
};
```

`InputSystem`이 전달하는 `event.timeStamp`를 무시하고 핸들러 실행 시점의 `audioEngine.currentTimeMs`를 사용한다. 메인 스레드가 바쁘면 핸들러 실행이 수~수십 ms 지연되어, 실제 키 입력 시점보다 늦은 오디오 시각을 판정에 사용하게 된다.

---

## 보정 설계

### A. 오디오 출력 레이턴시 보정 (렌더링 시각 보정)

**원리**: 오디오가 스피커에서 나오는 시점에 노트가 판정선 위에 있도록, 렌더링 시각을 오디오 출력 레이턴시만큼 앞당긴다.

```ts
// 보정 후
const audioOutputLatencyMs =
  (audioCtx.baseLatency + audioCtx.outputLatency) * 1000;

const songTimeMs = audioEngine.currentTimeMs + settings.offsetMs;
const visualTimeMs = songTimeMs + audioOutputLatencyMs;

judgmentEngine.update(songTimeMs);      // 판정: 보정 없이 원래 기준
renderer.renderFrame(visualTimeMs);      // 렌더링: 오디오 출력 지연만큼 미래
```

**효과**:
- 스피커에서 비트가 나오는 순간 노트가 판정선 위에 있음
- 보정량: 유선 환경 기준 13~32ms
- 판정 로직은 변경 없음 — 렌더링만 영향

**주의사항**:
- `audioContext.outputLatency`는 Chrome 102+, Firefox 70+에서 지원. Safari는 미지원이므로 폴백 필요
- 폴백 기본값: 0ms (보정 없음 = 현재와 동일 동작)
- `outputLatency`가 미지원이면 `baseLatency`만 사용 (부분 보정)

### B. event.timeStamp 기반 입력 보정

**원리**: 키 입력의 실제 발생 시각(`event.timeStamp`)을 오디오 타임라인으로 변환하여, 핸들러 실행 지연의 영향을 제거한다.

```ts
onLanePress: (lane, timestampMs, keyCode) => {
  const now = performance.now();
  const currentAudioMs = audioEngine.currentTimeMs;
  const handlerDelay = Math.max(0, now - timestampMs);
  const correctedSongTimeMs = (currentAudioMs - handlerDelay) + settings.offsetMs;

  judgmentEngine.onLanePress(lane, correctedSongTimeMs, keyCode);
};
```

**효과**:
- 메인 스레드 블로킹 시에도 정확한 입력 시각 사용
- 보정량: 보통 0~5ms, 부하 시 수십 ms

**주의사항**:
- `event.timeStamp`와 `performance.now()`는 같은 시계 원점(`performance.timeOrigin`)을 사용하므로 뺄셈이 유효
- **시계 드리프트**: `audioEngine.currentTimeMs`가 `AudioContext.currentTime` 기반이라면 별도의 시계(AudioContext 클럭)이다. `performance.now()`와 AudioContext 클럭 사이에 장시간 재생 시 미세한 드리프트가 발생할 수 있다. 현재 구현에서 `audioEngine.currentTimeMs`가 `AudioContext.currentTime`을 직접 사용하는지 확인하고, 드리프트가 문제가 되면 주기적으로 두 시계를 재동기화하는 방안을 검토한다
- `event.timeStamp` 정밀도는 브라우저 보안 정책에 따라 제한됨:
  - Chrome: 기본 5µs 정밀도. Cross-Origin Isolation 없으면 `performance.now()`는 100µs로 제한되나, `event.timeStamp`는 별도 정책 적용
  - Firefox: `privacy.reduceTimerPrecision` 기본 활성으로 ~1ms 단위 (버전에 따라 다름). `resistFingerprinting` 활성 시 100ms 단위로 반올림
- Cross-Origin Isolation 헤더로 모든 타이머 정밀도 최대화 가능:
  ```http
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  ```
  단, 외부 리소스(CDN, 이미지, 오디오 스트리밍) 호환성 확인 필요

### C. 디스플레이 레이턴시 보정

모니터 응답 시간과 V-Sync 지연을 자동 측정할 방법이 없으므로, **사용자 오프셋으로 대체**한다.

기존 `game-core.md`의 오프셋 설계와 동일:
- **오디오 오프셋**: 오디오 출력 지연 보정 (A에서 자동화되지 않는 잔여분)
- **입력 오프셋**: 입력 장치 + 디스플레이 지연 + 개인 체감 보정

---

## 구현 우선순위

| 순위 | 작업 | 체감 개선 | 난이도 | 비고 |
|------|------|-----------|--------|------|
| 1 | A. 오디오 출력 레이턴시 보정 | 13~32ms | 낮음 | 유선 환경에서도 체감 효과 있음 |
| 2 | B. event.timeStamp 입력 보정 | 0~15ms (부하 시) | 낮음 | 기존 InputSystem이 이미 전달 중 |
| 3 | 오프셋 캘리브레이션 UI | 잔여 전부 | 중간 | `[미구현]` — game-core.md 참조 |
| 4 | C. 디스플레이 보정 | 6~26ms | 높음 | 자동 측정 불가, 오프셋으로 대체 |
| 5 | Cross-Origin Isolation | 정밀도 향상 | 낮음 | 서버 헤더 설정만 필요, 단 외부 리소스 호환성 확인 필요 |

---

## 이상적인 동기화 상태

모든 보정이 적용된 후의 목표:

```
시점 T에서:
  - 스피커에서 비트 소리가 남
  - 노트가 정확히 판정선 위에 있음 (화면에 표시됨)
  - 플레이어가 이 순간 키를 누르면 deltaMs ≈ 0
```

디버그 모드(`docs/spec/debug-mode.md`)로 검증 가능한 지표:
- Summary의 `Avg deltaMs` 편향이 0에 가까움 → 오디오-입력 동기화 성공
- `yDifference`가 `deltaMs × scrollSpeed / 1000`과 일치 → 오디오-비주얼 동기화 성공
- Summary의 `Offset Recommendation`이 "현재 오프셋이 적절합니다" → 전체 동기화 성공

---

## 관련 문서

- 오프셋 설계: `game-core.md` § 오프셋
- 디버그 검증: `debug-mode.md`
- 판정 윈도우: `scoring.md` § 판정 윈도우
