# 모바일 리듬게임과 아케이드 리듬게임 판정 시스템에 대한 관찰

---

## 1. 요약

리듬게임의 판정 시스템은 **플랫폼의 오디오 지연 특성**에 의해 근본적으로 다른 설계를 채택한다. 이 문서는 아케이드·모바일·PC 세 플랫폼의 오디오-입력 경로를 비교하고, 각 플랫폼이 "일관된 판정 경험"을 달성하기 위해 선택한 전략의 차이를 정리한다.

핵심 관찰:

| 플랫폼 | 오디오 지연 | 키음 | 캘리브레이션 전략 |
|--------|-----------|------|-----------------|
| **아케이드** | 고정 (기체 내 상수) | 가능 | 판정선 위치(시각) 조절만 |
| **모바일** | 가변 (기기마다 다름) | 불가능 | 오디오 오프셋 캘리브레이션 필수 |
| **PC** | 중간 (하드웨어 선택에 의존) | ASIO 환경에서만 실용적 | 오디오 오프셋 + 시각 오프셋 |

---

## 2. 아케이드: 고정 하드웨어가 만드는 설계 자유도

### 2.1 오디오 지연이 상수인 환경

아케이드 리듬게임(IIDX, SDVX, DDR 등)은 전용 기판(BEMANI PC 등) 위에서 동작한다. 동일 기종의 모든 기체는 동일한 CPU, 사운드 카드, 스피커, 입력 장치를 사용한다.

- IIDX Lightning Model: Core i5-9400F, GTX 1650, ASUS Xonar AE 사운드 카드, 120Hz 모니터
- SDVX Valkyrie Model: Core i5-9500E, GTX 1650, 43인치 4K 120Hz 모니터

이 고정성이 의미하는 것: **오디오 출력 지연이 기체마다 동일한 상수**이다. 같은 기종이라면 도쿄의 기체와 서울의 기체에서 동일한 오디오 지연을 경험한다.

### 2.2 키음(keysound) 시스템의 전제 조건

IIDX는 키음 게임이다. 플레이어가 키를 누르면 해당 노트에 결합된 음원이 즉시 재생된다. 이 시스템이 성립하려면 **입력→소리 재생의 절대 지연이 작고 일정**해야 한다.

키음의 구조적 제약:

```
배경음(BGM):  schedule(sound, now - audio_latency)  → 미리 앞당겨 재생 가능
키음:          play(sound, on_input)                 → 입력 이후에만 재생 가능
```

배경음은 재생 시점을 오디오 지연만큼 앞당겨서(negative scheduling) 지연을 상쇄할 수 있다. 키음은 플레이어가 어떤 키를 누를지 모르므로 미리 재생할 수 없다. 따라서 **키음의 체감 지연 = 입력 지연 + 오디오 출력 지연**이며, 이 값을 소프트웨어로 줄일 방법이 없다.

아케이드에서 키음이 실용적인 이유: 전용 사운드 카드 + 고정 하드웨어로 이 합산 지연이 충분히 작고(수 ms), 기체마다 일정하므로 플레이어가 적응할 수 있다.

> *"IIDX is a key-sounded game, therefore you want the lowest possible latency in your audio setup. While you can compensate for display input latency using offset, audio latency cannot be compensated for."*
> — iidx.org, Timing (Intermediate)

### 2.3 판정선 조절만 제공하는 이유

IIDX가 제공하는 타이밍 조절은 **시각적 판정선 위치(Green Number, visual offset)**이다. 오디오 오프셋은 제공하지 않는다.

이유: 오디오 지연이 기체 내에서 상수이므로 조절할 필요 자체가 없다. 플레이어가 조절해야 하는 것은 "모니터를 보고 반응하는 시각적 타이밍"뿐이다.

**예외 — DDR:** DDR A3는 디스플레이 오프셋과 오디오 오프셋을 모두 제공한다. DDR은 비키음(BGM 기반) 게임이므로 오디오 오프셋 보정이 가능하다. **키음 여부가 오디오 오프셋 제공 가능성을 결정한다.**

### 2.4 엄격한 판정 창의 기반

아케이드의 1프레임 판정(IIDX PGREAT ±16.67ms, DDR Marvelous ±16.67ms)이 공정하게 성립하는 이유:

1. 고정 60fps/120fps — 프레임 타이밍 지터 없음
2. 전용 사운드 카드 — 오디오 지연 최소·일정
3. 전용 I/O 보드 — 입력 지연 최소(USB 2.0 업그레이드 이력 존재)
4. FAST/SLOW 피드백 — PGREAT 범위 내에서도 방향성 피드백 제공

---

## 3. 모바일: 가변 환경에서의 일관성 추구

### 3.1 환경 가변성의 규모

모바일은 기기마다 터치 지연, 오디오 출력 지연, 디스플레이 지연이 전부 다르다.

**Android 오디오 라운드트립 지연 실측 (Android AOSP 공식):**

| 기기 | 지연 |
|------|------|
| Nexus One (Android 2.3) | ~345 ms |
| Nexus 9 (Android 6.0) | ~15 ms |
| Pixel XL (Android 8.1) | ~18 ms |
| 최신 Pixel 계열 | 15–42 ms |
| iOS (iPhone 4S 이상) | ~7 ms |

Android는 오디오 경로의 레이어가 깊다: ADC/DAC(~1ms) → 버스 전송(1–6ms) → ALSA 드라이버(~10ms) → AudioFlinger(1–2 periods) → 앱 버퍼(2+ periods). API 선택(AudioTrack vs AAudio/Oboe)에 따라 지연이 크게 달라진다.

**터치 + 오디오 합산 체감 지연 (추정):**

| 환경 | 터치 | 오디오 | 합산 |
|------|------|--------|------|
| 최신 Android 고급 | 10–20 ms | 10–20 ms | **20–40 ms** |
| 일반 Android | 20–35 ms | 20–50 ms | **40–85 ms** |
| iOS | 5–10 ms | ~7 ms | **12–17 ms** |
| 아케이드 IIDX 건반 | ~1–3 ms | 수 ms | **~5 ms** |

인간 청각의 오디오-시각 비동기 인지 임계값이 ~20–30ms임을 감안하면, 일반 Android 기기에서 키음은 **명확하게 체감 가능한 지연**을 만든다.

### 3.2 키음이 불가능한 구조적 이유

배경음은 미리 스케줄링하여 지연을 상쇄할 수 있지만, 키음(응답음)은 입력 이후에만 재생할 수 있다.

> *"Response sound는 calibration으로 보정 불가"*
> — exceed7, Rhythm Game Crash Course

모바일에서 키음이 비실용적인 이유:
1. **절대 지연이 크다** — 40–85ms(일반 Android)는 체감 가능
2. **지연이 가변적이다** — 기기마다 다르므로 "이 정도면 괜찮다"는 기준선이 없음
3. **보정이 불가능하다** — 미래에 미리 재생할 수 없으므로 오프셋으로 흡수 불가

### 3.3 오디오 오프셋 캘리브레이션

모바일 리듬게임은 배경음과 판정의 시간차를 사용자가 조절할 수 있도록 오디오 오프셋을 제공한다.

| 게임 | 자동 측정 | 수동 조정 | 조정 단위 |
|------|----------|----------|----------|
| **Arcaea** | O (탭 미니게임) | O | 1 ms |
| **Project SEKAI** | X | O | 0.1 단위 |
| **Phigros** | X | O | — |

**Arcaea의 자동 캘리브레이션 (가장 정교한 사례):**
1. 120 BPM 4/4박자 드럼 비트 4마디 재생
2. 각 마디 3박째에 플레이어가 탭
3. 측정값 평균으로 오프셋 자동 설정
4. 수동 범위: -2000ms ~ +2000ms

Arcaea 팬덤 위키에는 기기별 권장 오프셋 목록("Device Offsets")이 존재하며, BT 이어폰 사용 시 +200ms 이상 추가가 필요하다. 이 목록의 존재 자체가 모바일 환경의 가변성을 증명한다.

### 3.4 넓은 판정 윈도우

모바일 리듬게임의 최상위 판정은 아케이드보다 넓다:

| 게임 | 플랫폼 | 최상위 판정 | 윈도우 | 아케이드 대비 |
|------|--------|-----------|--------|-------------|
| IIDX | 아케이드 | PGREAT | ±16.67 ms | 기준 |
| SDVX Valkyrie | 아케이드 | S-CRITICAL | ~±21 ms | ×1.3 |
| **Arcaea** | **모바일** | **Shiny Pure** | **±25 ms** | **×1.5** |
| **Project SEKAI** | **모바일** | **PERFECT** | **±41.7 ms** | **×2.5** |

넓은 판정 윈도우가 "기기 가변성 흡수 목적"인지는 개발사 공식 발표가 없어 확정할 수 없다(추정). 그러나 Arcaea의 다층 판정 구조(Shiny Pure ±25ms / Pure ±50ms / Far ±100ms)는 일반 유저의 진입 장벽을 낮추면서 상위 유저에게 정밀도를 요구하는 방식으로 플랫폼 가변성을 다층 처리한다.

---

## 4. PC: 아케이드와 모바일 사이의 중간 지대

### 4.1 하드웨어는 가변이지만 선택 가능

PC는 하드웨어가 표준화되지 않았지만, 사용자가 **저지연 조합을 의도적으로 구성**할 수 있다:

- 유선 키보드 (1kHz~8kHz 폴링) + 오디오 인터페이스 (ASIO) + 고주사율 모니터

이 조합은 아케이드에 근접한 저지연 환경을 만든다. EZ2ON은 8000Hz 폴링레이트 키보드를 사실상 권장하는 수준의 판정 윈도우(KOOL ±22.5ms)를 제공한다.

### 4.2 오디오 경로: ASIO vs WASAPI

| 모드 | 전형적 지연 | 특징 |
|------|-----------|------|
| WASAPI Shared | 20–40 ms 추가 | Windows 믹서 통과, 다른 앱과 공유 |
| WASAPI Exclusive | ~10–17 ms | OS 믹서 우회, 다른 앱 오디오 차단 |
| ASIO | ~2–8 ms | 드라이버 직접 접근, 이론상 최저 |

### 4.3 PC에서의 키음과 ASIO의 관계

BMS 플레이어(beatoraja, LR2)는 IIDX의 키음 시스템을 PC에서 재현한다. 키음 게임에서 ASIO가 필수인 이유:

> *"Audio offset cannot be changed, as the game is keysounded (the game can't be expected to play a keysound before you hit the key)."*
> — beatoraja English Guide

WASAPI Shared에서는 키음 지연이 체감되어 플레이 경험이 열화된다. IIDX Infinitas(PC 홈 버전)도 ASIO 사용을 공식 권장하며 오디오 오프셋 조절을 제공하지 않는다.

### 4.4 PC 리듬게임의 오프셋 시스템

비키음 PC 게임은 아케이드와 달리 오디오 오프셋 조절이 필수다:

**osu!:**
- Universal Offset: 모든 비트맵에 전역 적용
- Local Offset: 개별 비트맵별 조정
- 중요: Universal Offset은 **배경음과 노트의 동기화**를 조정하지만, **키를 누른 시점과 히트사운드가 들리는 시점 사이의 레이턴시**는 조정하지 않는다 — 히트사운드 지연은 오디오 출력 경로에 의존하며 오프셋으로 흡수 불가

**Etterna/StepMania:**
- Global Offset: F6 두 번으로 자동 보정 (25노트마다 오프셋 조정)
- Visual Delay: 노트의 시각적 위치만 조정, 판정 타이밍에 영향 없음
- ITG 9ms 바이어스: 아케이드 환경(스피커→플레이어 소리 전달 ~3ms 포함) 기준으로 설계된 채보가 PC에서는 ~9ms 추가 오프셋이 필요한 역사적 바이어스 존재

### 4.5 웹 브라우저의 위치

브라우저는 WASAPI Shared mode만 사용 가능하다. ASIO나 WASAPI Exclusive에 접근할 방법이 없다.

- Web Audio API `latencyHint: 'interactive'`로 최소화하지만 실제 달성값은 구현 의존
- 실측: `outputLatency` Firefox ~15.4ms, Chrome ~24ms (비-BT 헤드폰 기준)
- ASIO 대비 수십 ms 불리

**그러나 키음이 없으면 이 차이는 캘리브레이션으로 완전히 흡수된다.** 배경음의 재생 타이밍은 오프셋으로 조절 가능하기 때문이다.

---

## 5. 핵심 구조: 키음 여부가 아키텍처를 결정한다

세 플랫폼의 차이를 관통하는 핵심 변수는 **키음(응답음) 존재 여부**다.

```
키음이 있는 게임 (IIDX, SDVX, beatoraja)
  └─ 오디오 절대 지연이 체감에 직결
       ├─ 고정 하드웨어(아케이드) → 지연이 상수, 키음 성립
       ├─ ASIO(PC) → 지연 최소화, 키음 성립
       └─ 모바일/웹 → 지연 크고 가변, 키음 비실용적

키음이 없는 게임 (DDR, Arcaea, Project SEKAI, osu!)
  └─ 배경음만 존재 → 오프셋으로 지연 흡수 가능
       ├─ 아케이드 → 오프셋 불필요(지연 상수) 또는 오디오 오프셋 제공(DDR)
       ├─ PC → Universal/Global Offset 제공
       └─ 모바일 → 오디오 오프셋 캘리브레이션 필수
```

**오디오 오프셋이 보정하는 것과 보정하지 못하는 것:**

| | 오프셋으로 보정 가능 | 오프셋으로 보정 불가 |
|---|---|---|
| 배경음 | 재생 시점을 앞당겨 지연 상쇄 | — |
| 키음 | — | 입력 전에 재생 불가 |
| 시각적 판정선 | 노트 도달 시점 조절 | — |

---

## 6. not4k의 위치

not4k는 **키음이 없는 웹 기반 PC 리듬게임**이다. 이 조합이 의미하는 것:

1. **오디오 절대 지연은 문제가 아니다.** 키음이 없으므로 WASAPI Shared의 수십 ms 추가 지연은 `audioOffsetMs` 캘리브레이션으로 완전히 흡수된다. 플레이어는 오프셋을 한 번 잡으면 일관된 판정 경험을 얻는다.

2. **오디오 분산(지터)이 진짜 적이다.** 절대 지연이 크더라도 표준편차가 작으면 캘리브레이션이 유효하다. 지터가 크면 오프셋을 잡아도 판정이 흔들린다. → `../rfd/0004-io-timing-consistency.md`(RFD 0004) W1~W4가 이 축을 다룬다.

3. **ASIO/네이티브 전환의 실익이 없다.** 키음이 없는 한, ASIO로 얻는 절대 지연 감소는 "캘리브레이션 오프셋 값이 작아진다" 이상의 체감 개선을 만들지 않는다.

4. **아케이드의 현장감은 다른 축으로 추구해야 한다.** 키음이 만드는 "내가 연주하고 있다"는 감각은 키음 없이 재현할 수 없다. not4k가 추구하는 몰입은 키음이 아니라 **가변 손배치의 인지적 도전**에서 온다 — 이것은 `stance.md`의 "인식 난이도 > 입력 난이도" 원칙과 일치한다.

---

## 7. 출처

### 아케이드
- [BEMANI PC Specifications — iidx.org](https://iidx.org/bemani_pc)
- [SDVX Cabinet Specifications — sdvx.org](https://sdvx.org/en/specifications/cabspecifications)
- [Optimize PC for Infinitas — iidx.org](https://iidx.org/infinitas_pc)
- [Timing (Intermediate) — iidx.org](https://iidx.org/timing)
- [Infinitas with ASIO — iidx.org](https://iidx.org/infinitas_asio)
- [History of Notable Changes — iidx.org](https://iidx.org/history)
- [DDR Timing Window — zenius-i-vanisher](https://zenius-i-vanisher.com/)

### 모바일
- [Audio Latency Measurements — Android AOSP](https://source.android.com/docs/core/audio/latency/measurements)
- [Android Audio's 10ms Problem — Superpowered](https://superpowered.com/androidaudiopathlatency)
- [Rhythm Game Crash Course — exceed7 (Native Audio)](https://exceed7.com/native-audio/rhythm-game-crash-course/index.html)
- [Rhythm Quest Devlog 10 — Latency Calibration](https://rhythmquestgame.com/devlog/10.html)
- [Device Offsets — Arcaea Wiki (Fandom)](https://arcaea.fandom.com/wiki/Device_Offsets)
- [Low Latency Audio — Android Developers (Oboe)](https://developer.android.com/games/sdk/oboe/low-latency-audio)

### PC
- [Understanding Universal Offset — osu! Forum](https://osu.ppy.sh/community/forums/topics/1162374)
- [ASIO Support Request — ppy/osu-framework #705](https://github.com/ppy/osu-framework/issues/705)
- [KeyASIO.Net — ASIO middleware for osu!](https://github.com/Milkitic/KeyASIO.Net)
- [Configuration — beatoraja English Guide](https://github.com/wcko87/beatoraja-english-guide/wiki/Configuration)
- [DashDash's Offset Routine — EtternaOnline](https://community.etternaonline.com/t/dashdashs-offset-routine/367)
- [Eliminating the 9ms Bias — meow.garden](https://meow.garden/eliminating-the-9ms-bias/)
- [Low Latency Audio (IAudioClient3) — Microsoft Learn](https://learn.microsoft.com/en-us/windows-hardware/drivers/audio/low-latency-audio)

### 프로젝트 내부
- `docs/research/judgment-windows.md` — 판정 윈도우 종합 분석
- `docs/rfd/0004-io-timing-consistency.md` — IO 타이밍 일관성 개선 (RFD 0004)
- `docs/research/perf-bottleneck-hypothesis.md` — 성능 병목 가설 검증
- `docs/spec/audio-visual-sync.md` — 오디오/비주얼/입력 동기화 설계
- `docs/context/stance.md` — 프로젝트 태도

---

## 8. 근거 수준 표기

| 항목 | 근거 수준 |
|------|----------|
| 아케이드 하드웨어 스펙 | 사실 (iidx.org, sdvx.org 공식) |
| 키음의 오프셋 보정 불가 | 사실 (iidx.org, beatoraja guide, exceed7 직접 인용) |
| Android 오디오 지연 수치 | 사실 (Android AOSP 공식 측정) |
| 모바일 판정 윈도우가 넓은 이유 | **추정** (개발사 공식 발표 없음) |
| DDR A3 오디오 오프셋 존재 | 약한 근거 (Facebook 포스트 출처) |
| SDVX Valkyrie 전용 사운드 카드 | 미확인 (IIDX Lightning과 달리 공식 스펙 부재) |
| 터치+오디오 합산 지연 | **추정** (개별 수치 합산, 직접 측정 아님) |
| Chrome의 IAudioClient3 활용 여부 | 미확인 |
