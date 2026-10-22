# Debug Mode -- 노트 판정 로깅 시스템

## 개요

Debug Mode는 노트 처리가 정상적으로 이루어지고 있는지 검증하기 위한 개발/디버깅 도구이다. 활성화하면 각 노트 판정 시점의 위치, 타이밍, 속도 정보를 기록하고, 곡 종료 시 전체 로그를 텍스트 파일로 내려받는다.

## 설정

- `Settings > Gameplay > Debug Mode` 체크박스로 활성화 (기본값: `false`)
- 게임 플레이에 영향을 주지 않으며, 로그 수집만 수행한다

## 기록 항목

**모든 판정을 기록한다** — 헤드/포인트 노트뿐 아니라 롱 바디 끝점 판정(`connection`/`termination`)도 포함한다. 각 엔트리는 `isBody`로 구분되며(바디=끝점 판정, 로그에 `BODY` 표기), 바디 엔트리의 `noteCenterY`는 시작점이 아니라 **끝점(endBeat) 위치**로 계산한다. 홀드 트릴 체인의 `connection`이 이어졌는지, 릴리즈 종결이 옳게 판정됐는지를 로그만으로 확인하기 위함이다.

| 필드 | 설명 | 이상적인 값 |
|------|------|-------------|
| `noteIndex` | 노트 인덱스 | - |
| `isBody` | 롱 바디 끝점 판정 여부(`connection`/`termination`) | - |
| `noteCenterY` | 확정 시점 V로 계산한 노트 중앙 Y 위치 (px, 바디는 끝점 기준) | 렌더 위치와 일치 |
| `judgmentLineY` | 판정선 Y 위치 (px) | 고정값 |
| `yDifference` | noteCenterY - judgmentLineY (px) | V·노트 시각·스크롤 속도와 일치 |
| `deltaMs` | 판정 타이밍 차이 (곡 시간 ms, 양수=늦음. `connection`은 held 이분이라 0) | 0에 가까울수록 이상적 |
| `grade` | 판정 등급 | perfect |
| `scrollSpeed` | 현재 스크롤 속도 (px/s) | 설정값 |
| `expectedDeltaPxPerFrame` | 프레임당 예상 이동 거리 (px) | scrollSpeed / targetFps |
| `actualDeltaPx` | 실제 프레임간 이동 거리 (px) | expectedDeltaPxPerFrame과 동일 |

## 이상적인 결과 예측

### Y 차이 (yDifference)

판정 확정 시점의 시각 시간 V로 렌더 위치를 계산한다. 노트 가운데가 판정선에 있으면 0이다.

```
noteCenterY = judgmentLineY − (noteTimeMs − V) × scrollSpeed / 1000
yDifference = (V − noteTimeMs) × scrollSpeed / 1000
```

바디는 `noteTimeMs` 대신 끝점 시각을 쓴다. `deltaMs`는 원래 입력 시각과 노트 시각의 차이라 입력·시각 오프셋, handlerDelay, 큐 대기가 있는 경우 `yDifference = deltaMs × scrollSpeed / 1000`은 성립하지 않는다. 위치 차이만으로 판정 정확도나 실제 모니터 지연을 판단하지 않는다.

### deltaMs

- 판정 창·deltaMs·Show Timing Diff·FAST/SLOW는 곡 시간 ms다. r이 2면 같은 창의 실제 시간 폭은 절반이다.
- Normal Perfect: |deltaMs| <= 41ms
- 실력 좋은 플레이어: 대부분 |deltaMs| < 20ms
- Summary의 `avgAbsDeltaMs`가 20ms 이내면 우수, 41ms 이내면 양호

### 프레임당 이동 거리 (속도 일관성)

프레임 드랍이 없는 이상적인 환경에서는 모든 프레임의 노트 이동 거리가 동일해야 한다.

```
expectedDeltaPxPerFrame = scrollSpeed / targetFps
```

| scrollSpeed | 60fps | 120fps | 144fps |
|-------------|-------|--------|--------|
| 400 px/s | 6.67px | 3.33px | 2.78px |
| 800 px/s | 13.33px | 6.67px | 5.56px |
| 1200 px/s | 20.00px | 10.00px | 8.33px |

- `actualDeltaPx`가 `expectedDeltaPxPerFrame`과 일치하면 프레임이 안정적
- Summary의 `speedConsistency` (표준편차)가 0에 가까울수록 이상적
  - 0～1px: 매우 안정
  - 1～3px: 정상
  - 3px 초과: 프레임 드랍 또는 렌더링 지연 의심

### 이상 징후 진단

| 증상 | 가능한 원인 |
|------|-------------|
| avgAbsYDifference가 예상보다 크게 큼 | V·오프셋·입력 지연·확정 지연 확인, 위치 계산 오류 여부 |
| speedConsistency가 높음 | 프레임 드랍, GC 스파이크, 렌더링 병목 |
| deltaMs 편향 (평균이 양수/음수로 치우침) | inputOffsetMs·L₀ 보고 오차·체감 편향 |
| actualDeltaPx가 expectedDeltaPxPerFrame의 2배 | 프레임 스킵 (30fps로 떨어짐) |

## 출력 형식

곡 종료 시 전체 로그를 텍스트 파일로 다운로드한다:

```
=== Debug Note Log ===

[Note #0] grade=perfect deltaMs=3.2 yDiff=2.6px noteCenterY=502.6 judgmentLineY=500.0 expectedPx/f=13.33 actualPx/f=13.35
[Note #1 BODY] grade=perfect deltaMs=0.0 yDiff=0.4px noteCenterY=500.4 judgmentLineY=500.0 expectedPx/f=13.33 actualPx/f=13.30
...

=== Summary ===
Head/point notes: 120
Avg Y difference: 1.23px
Avg |Y difference|: 12.45px
Avg deltaMs: 0.50ms
Avg |deltaMs|: 15.60ms
Speed consistency (stddev): 0.82px
Grade distribution (head/point): {"perfect":95,"great":20,"good":5}
Body/endpoint notes: 40
Grade distribution (body/endpoint): {"perfect":38,"miss":2}
```

> **캘리브레이션 통계**(Avg Y/deltaMs·Speed·오프셋 추천)는 **헤드/포인트만**으로 낸다 — `connection`은 held 이분이라 `deltaMs=0`이고, 이를 섞으면 FAST/SLOW 편향이 희석된다. 바디 끝점 판정은 `Body/endpoint` 별도 분포로만 집계한다(홀드 트릴 체인·릴리즈 검증용).


## Offset Recommendation

헤드/포인트의 평균 `deltaMs`를 실제 배속 r로 나눈 뒤 반대 부호로 반올림한 정수를 **현재 inputOffsetMs에 더할 실제 ms**로 추천한다. 예: r=2, 평균 +40 곡 ms(SLOW) → 실제 +20ms → `추천 inputOffsetMs 조정: -20ms`. 로그·Summary의 deltaMs 자체는 곡 시간 ms로 유지한다. 추천의 유지 기준은 실제 평균 편차 절댓값 5ms 미만이다.

시각 오프셋은 이 통계로 추천하지 않는다. 화면 동기화는 별도로 보고 맞춰야 하며, 입력 추천이 0이라고 화면까지 맞았음을 뜻하지 않는다.
