# not4k — 기술 스택 검토

> 결정: React 19 + PixiJS v8 + Supabase + Web Audio API (AudioContext)
> 다국어: 한국어, 일본어, 영어

---

## 기술 스택 요약

| 영역 | 선택 | 역할 |
|------|------|------|
| **UI 프레임워크** | React 19 | 메뉴, 설정, 곡 선택, 결과 등 UI 화면 |
| **게임 렌더링** | PixiJS v8 + @pixi/react v8 | 노트 낙하, 판정 이펙트, 플레이 화면 |
| **오디오** | Web Audio API (AudioContext) | 음원 재생, 판정 타이밍, 효과음 |
| **백엔드/DB** | Supabase (PostgreSQL) | 인증, 랭킹, 플레이 기록, 차트 메타데이터 |
| **파일 스토리지** | Supabase Storage | 음원, 차트 JSON, 자켓 이미지 |
| **인증** | Supabase Auth | Google OAuth, 비로그인(Anonymous Auth) |
| **다국어** | i18next + react-i18next | 한국어, 일본어, 영어 |

---

## 1. React 19 + PixiJS v8

### 아키텍처: UI와 게임 렌더링 분리

```
React 19 (DOM)                    PixiJS v8 (WebGL Canvas)
┌─────────────────────┐          ┌──────────────────────┐
│ 타이틀 화면          │          │ 플레이 화면           │
│ 곡 선택 화면         │          │  - 4레인 노트 낙하    │
│ 설정 화면            │  ←────→  │  - 판정선             │
│ 결과 화면            │          │  - 판정 이펙트        │
│ 키 바인딩 설정       │          │  - 콤보 카운터        │
│ 튜토리얼 (안내 UI)   │          │ 옵저버 모드           │
└─────────────────────┘          └──────────────────────┘
      상태 관리 (Zustand 등)
```

**UI 화면**은 React DOM으로 구현한다. 메뉴, 설정, 곡 선택, 결과 등은 일반적인 웹 UI이므로 React의 선언적 컴포넌트 모델이 적합하다.

**플레이 화면**은 PixiJS v8의 WebGL 캔버스로 구현한다. 노트 낙하, 판정 이펙트 등 매 프레임 갱신이 필요한 게임 렌더링에는 React의 가상 DOM이 아닌 PixiJS의 직접 렌더링이 필요하다.

두 영역의 연결에는 `@pixi/react` v8을 사용할 수 있으나, **플레이 화면의 게임 루프는 React의 렌더 사이클과 분리해야 한다**. 게임 로직(노트 위치 계산, 판정 처리)은 순수 TypeScript 모듈로 작성하고, PixiJS는 이를 렌더링하는 역할만 수행한다.

### PixiJS v8 적합성

| 요구사항 | PixiJS v8 대응 |
|----------|----------------|
| 노트 스프라이트 렌더링 | Sprite, Container 기본 기능으로 충분 |
| 60fps 유지 | v8은 100k 스프라이트에서 ~15ms/프레임. not4k는 수십~수백 개의 노트만 화면에 존재하므로 여유 충분 |
| 판정 이펙트/파티클 | ParticleContainer, Filters로 구현 가능 |
| 텍스트 렌더링 (콤보, 판정) | BitmapText (고속) 또는 Text (유연) |
| 트릴 구간 배경 | Graphics API로 반투명 영역 렌더링 |
| 레이어 순서 제어 | Render Layers (v8.7.0+) |

### @pixi/react v8 주의사항

- **React 19 필수**. React 18을 지원하지 않는다.
- **개발 모드에서 React Strict Mode 충돌**: Strict Mode의 이중 마운트가 WebGL 컨텍스트 문제를 일으킬 수 있다. 개발 시 Strict Mode를 비활성화하거나 이 동작을 인지하고 있어야 한다.
- **게임 루프는 React 외부에서**: `requestAnimationFrame` 기반 게임 루프는 React의 상태 업데이트와 분리한다. React의 배치 업데이트는 60fps 게임 루프에 적합하지 않다.
- **`extend` API 사용**: 사용하는 PixiJS 클래스만 등록하여 번들 크기를 최소화한다.

### 대안 검토

| 대안 | 불채택 이유 |
|------|------------|
| Phaser | 2D 게임 엔진으로 기능이 풍부하지만, React와의 통합이 자연스럽지 않고 번들이 크다. not4k는 범용 게임 엔진이 필요한 복잡도가 아니다 |
| 순수 Canvas 2D | 성능이 WebGL보다 낮고, 이펙트/파티클 구현에 제약이 크다 |
| Three.js | 3D 엔진. 2D 노트 낙하 게임에는 과도하다 |

---

## 2. Supabase

### 역할 분담

| Supabase 기능 | not4k에서의 용도 |
|--------------|-----------------|
| **Auth** | Google OAuth 로그인 + Anonymous Auth(비로그인 플레이) |
| **Database** (PostgreSQL) | 유저 프로필, 플레이 기록, 차트별 랭킹, 차트 메타데이터 |
| **Storage** | 음원 파일, 차트 JSON, 자켓 이미지, 프리뷰 음원 |
| **Edge Functions** | (필요 시) 랭킹 집계, 차트 유효성 검증 등 서버사이드 로직 |

### Auth: Google OAuth + 비로그인 플레이

`game-core.md`의 인증 설계와 Supabase Auth의 기능이 정확히 대응한다:

- **Google OAuth**: Supabase Auth에서 기본 제공. `signInWithOAuth({ provider: 'google' })` 한 줄로 구현.
- **비로그인 플레이**: Supabase의 **Anonymous Auth** (`signInAnonymously()`)를 사용. 비로그인 유저도 `authenticated` 역할을 가지되, JWT의 `is_anonymous` 클레임으로 기능을 제한한다.
  - 플레이 기록 저장 불가 → RLS 정책에서 `is_anonymous = true`인 유저의 INSERT를 차단
  - 랭킹 등록 불가 → 동일
  - 설정 서버 동기화 불가 → 동일
- **비로그인 → 로그인 전환**: `linkIdentity()`로 Anonymous 유저에 Google 계정을 연결. 유저가 게임을 체험한 후 자발적으로 로그인하는 `game-core.md`의 흐름과 일치.

### Storage: 차트 "스트리밍"의 실제 구현

`game-core.md`에서 "차트 데이터는 서버에서 스트리밍"이라고 서술했다. 실제 구현에서 이것은 **Supabase Storage에서의 온디맨드 다운로드**를 의미한다.

#### 차트 데이터 흐름

```
[차트 에디터] ──업로드──→ [Supabase Storage]
                              │
                              │  Public Bucket + CDN
                              ▼
[게임 클라이언트] ←──fetch──→ [Supabase Storage CDN]
                              │
                    ┌─────────┼─────────┐
                    ▼         ▼         ▼
              chart.json   song.ogg   jacket.jpg
```

#### 파일 유형별 전략

| 파일 유형 | 크기 (예상) | 로딩 전략 | 타이밍 |
|----------|------------|----------|--------|
| **차트 JSON** | 10~100 KB | `fetch()` → JSON 파싱 → 메모리 | 곡 선택 시 |
| **음원 파일** | 3~10 MB (OGG/MP3) | `fetch()` → `AudioContext.decodeAudioData()` → AudioBuffer | 곡 선택 후 로딩 화면 |
| **자켓 이미지** | 50~200 KB | `<img>` 또는 PixiJS Asset 로더 | 곡 목록 표시 시 |
| **프리뷰 음원** | 500 KB~1 MB | `fetch()` → AudioBuffer (짧은 클립) | 곡 선택 화면에서 커서 이동 시 |

#### "스트리밍"이 아닌 "전체 로드"를 선택하는 이유

리듬게임에서 음원은 **플레이 시작 전에 전체 디코딩(AudioBuffer)**해야 한다:

1. **판정 정밀도**: `AudioBufferSourceNode.start(exactTime)`은 샘플 단위의 정확한 재생 시점 제어가 가능하다. `MediaElementAudioSourceNode`(스트리밍)는 이 정밀도를 보장하지 못한다.
2. **seek 없음**: 리듬게임은 처음부터 끝까지 순차 재생하므로, 스트리밍의 랜덤 접근 이점이 없다.
3. **메모리**: 4분 스테레오 44.1kHz 곡은 디코딩 후 ~40MB. 현대 기기에서 허용 가능한 수준이다.

따라서 `game-core.md`의 "스트리밍"은 **"로컬 저장 없이 서버에서 매번 가져온다"**는 의미이며, 기술적으로는 전체 다운로드 + 디코딩이다.

#### 로딩 흐름

```
곡 선택 → [로딩 화면 표시]
           ├─ fetch(chart.json) → parse → chartData
           ├─ fetch(song.ogg)   → decodeAudioData → audioBuffer
           └─ 둘 다 완료 → [플레이 화면 진입]
```

두 요청은 병렬로 수행한다. 로딩 화면에서 진행률을 표시하여 유저 경험을 관리한다.

### Storage 구조 설계

```
storage/
├── songs/
│   ├── {song_id}/
│   │   ├── audio.ogg          # 플레이용 음원
│   │   ├── preview.ogg        # 곡 선택 프리뷰 (15~30초)
│   │   ├── jacket.jpg         # 자켓 이미지
│   │   ├── easy.json          # EASY 채보
│   │   ├── normal.json        # NORMAL 채보
│   │   └── hard.json          # HARD 채보
│   └── ...
└── tutorials/
    ├── phase1.ogg             # 튜토리얼 음원
    ├── phase1.json            # 튜토리얼 채보
    └── ...
```

### 차트 JSON 포맷

`chart-editor.md`의 데이터 모델을 JSON으로 직렬화한다. 박자수는 분수를 문자열로 표기하여 부동소수점 오차를 방지한다.

```json
{
  "metadata": {
    "title": "곡 제목",
    "artist": "아티스트",
    "difficulty": "NORMAL",
    "level": 7,
    "audioFile": "audio.ogg",
    "offset": 0
  },
  "bpmMarkers": [
    { "beat": "0", "bpm": 150 },
    { "beat": "64", "bpm": 180 }
  ],
  "timeSignatureMarkers": [
    { "beat": "0", "beatPerMeasure": "4" }
  ],
  "notes": [
    { "type": "single", "lane": 1, "beat": "0" },
    { "type": "single", "lane": 3, "beat": "1/2" },
    { "type": "longStart", "lane": 2, "beat": "1", "endBeat": "3" },
    { "type": "double", "lane": 1, "beat": "2" },
    { "type": "trillZoneStart", "lane": 1, "beat": "4", "endBeat": "8" },
    { "type": "trill", "lane": 1, "beat": "4" },
    { "type": "trill", "lane": 1, "beat": "9/2" }
  ]
}
```

### Supabase 무료 티어 제약과 대응

| 리소스 | 무료 한도 | not4k 예상 사용량 (프로토타입) | 위험도 |
|--------|----------|-------------------------------|--------|
| DB 용량 | 500 MB | 수 MB (유저 수십 명 수준) | 낮음 |
| Storage | 1 GB | 5곡 × ~15MB = ~75MB | 낮음 |
| Storage 대역폭 | 2 GB/월 | 유저 수에 따라 빠르게 소진 가능 | **중간** |
| Auth MAU | 50,000 | 프로토타입 단계에서 충분 | 낮음 |
| Edge Function | 500,000/월 | 충분 | 낮음 |

**대역폭이 유일한 병목이다.** 한 곡 플레이 시 ~10MB 다운로드가 발생하면, 무료 2GB로는 월 200회 플레이가 한계이다. 대응 방안:

1. **프로토타입 단계**: 무료 티어로 시작. 소수 테스터만 접근.
2. **알파/베타**: Pro 플랜($25/월, 250GB 대역폭)으로 전환. 월 25,000회 플레이 지원.
3. **브라우저 캐싱 활용**: `cacheControl` 설정으로 반복 접근 시 CDN/브라우저 캐시 적중. 같은 곡 재플레이 시 서버 대역폭 소모 없음.
4. **음원 압축 최적화**: OGG Vorbis q5 (~128kbps) 기준 4분 곡이 ~3.8MB. 음질과 용량의 균형점.

---

## 3. Web Audio API (AudioContext)

### 마스터 클럭: AudioContext.currentTime

리듬게임의 모든 타이밍 판단은 **`AudioContext.currentTime`을 마스터 클럭**으로 사용한다.

```
AudioContext.currentTime (오디오 하드웨어 스레드)
    │
    ├─→ 노트 판정: 입력 시점과 노트 기준 시점 비교
    ├─→ 노트 렌더링: 현재 시점 기준으로 노트 Y좌표 계산
    └─→ 효과음 재생: source.start(audioContext.currentTime + offset)
```

`AudioContext.currentTime`을 선택하는 이유:

- **오디오 하드웨어 스레드에서 구동**: 메인 스레드의 GC, 레이아웃, JS 실행에 영향받지 않는다.
- **샘플 단위 정밀도**: `performance.now()`보다 정확하다.
- **오디오 재생과 본질적으로 동기화**: 별도의 클럭 동기화가 필요 없다.

### 게임 루프와 오디오 동기화

```
[매 프레임 (requestAnimationFrame)]

1. songTime = audioCtx.currentTime - songStartTime
2. 노트 렌더링: songTime 기준으로 각 노트의 화면 위치 계산
3. Miss 판정: songTime이 노트 시점 + Bad 윈도우(160ms)를 지나면 Miss
4. 키 입력 처리: 입력 시점의 songTime과 가장 이른 노트의 시점 비교 → 판정
```

### 오디오 레이턴시 보정

```
실제 소리 출력 시점 = AudioContext.currentTime + outputLatency
```

- `audioCtx.outputLatency`: 오디오 버퍼가 실제 스피커에서 재생되기까지의 지연. 유선 이어폰 ~15-25ms, 블루투스 ~150-180ms.
- 시각적 노트 위치를 `outputLatency`만큼 보정하여, 유저가 보는 노트와 듣는 소리가 일치하도록 한다.
- `game-core.md`의 오디오 오프셋 + 입력 오프셋 시스템이 이를 보완한다.

### 오디오 로딩과 재생

```js
// 1. 음원 로딩 (곡 선택 → 로딩 화면)
const response = await fetch(songUrl);
const arrayBuffer = await response.arrayBuffer();
const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

// 2. 재생 시작 (플레이 화면 진입)
const source = audioCtx.createBufferSource();
source.buffer = audioBuffer;
source.connect(audioCtx.destination);

const songStartTime = audioCtx.currentTime;
source.start(songStartTime);

// 3. 게임 루프에서 현재 곡 시점 계산
function gameLoop() {
  const songTime = audioCtx.currentTime - songStartTime;
  updateNotes(songTime);
  checkJudgments(songTime);
  requestAnimationFrame(gameLoop);
}
```

### 효과음 (히트 사운드)

히트 사운드는 **사전 디코딩된 AudioBuffer**를 재사용한다. `AudioBufferSourceNode`는 일회용이므로, 매 재생 시 새로운 노드를 생성하되 버퍼는 공유한다.

```js
// 초기화 시
const hitBuffer = await audioCtx.decodeAudioData(hitSoundArrayBuffer);

// 판정 발생 시
function playHitSound() {
  const source = audioCtx.createBufferSource();
  source.buffer = hitBuffer;
  source.connect(audioCtx.destination);
  source.start();  // 즉시 재생
}
```

### 브라우저 자동재생 정책 대응

모든 주요 브라우저가 유저 인터랙션 없이는 `AudioContext`를 `suspended` 상태로 시작한다.

not4k의 자연스러운 UX 흐름이 이를 해결한다:
1. 타이틀 화면에서 유저가 클릭/키 입력 → 이 시점에서 `AudioContext` 생성 또는 `resume()`
2. 이후 곡 선택, 플레이 진입 시에는 이미 `running` 상태

```js
// 타이틀 화면의 아무 인터랙션에서
function onFirstInteraction() {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}
```

### 일시정지 구현

`game-core.md`의 일시정지 기능:

```js
// 일시정지
audioCtx.suspend();
const pausedAt = audioCtx.currentTime;

// 재개
audioCtx.resume();
// songStartTime을 보정하여 정지한 만큼의 시간을 건너뛴다
songStartTime += (audioCtx.currentTime - pausedAt);
```

`AudioContext.suspend()`는 오디오 하드웨어 클럭 자체를 멈추므로, 별도의 보정 없이도 `currentTime`이 정지 시점에 고정된다. 다만, `resume()` 후의 시간 보정은 필요하다.

---

## 4. 다국어 지원 (i18n)

### 지원 언어

| 언어 | 코드 | 용도 |
|------|------|------|
| 한국어 | `ko` | 기본 언어 (개발 언어) |
| 일본어 | `ja` | 리듬게임 용어의 원어, 일본 리듬게임 커뮤니티 대응 |
| 영어 | `en` | 글로벌 접근성 |

### 기술: i18next + react-i18next

React 생태계에서 가장 성숙한 i18n 솔루션. JSON 기반 번역 파일, 네임스페이스 분리, 동적 로딩을 지원한다.

```
locales/
├── ko/
│   ├── common.json      # 공통 UI (버튼, 메뉴)
│   ├── play.json        # 플레이 화면 (판정명, 콤보)
│   ├── settings.json    # 설정 화면
│   └── tutorial.json    # 튜토리얼
├── ja/
│   └── ...
└── en/
    └── ...
```

### 번역 대상

| 대상 | 번역 여부 | 비고 |
|------|----------|------|
| UI 텍스트 (메뉴, 버튼, 안내) | 번역 | i18next로 관리 |
| 판정명 (Perfect, Great 등) | 번역하지 않음 | 영어 고정. 리듬게임 공용어 |
| 난이도명 (EASY, NORMAL, HARD) | 번역하지 않음 | 영어 고정. 리듬게임 공용어 |
| 곡 제목, 아티스트명 | 번역하지 않음 | 원어 표기 |
| 튜토리얼 안내 | 번역 | 학습에 직접 영향 |
| 에러 메시지 | 번역 | |

### 폰트 대응

`project-assets.md`의 폰트 요구사항과 다국어 지원:

- **Noto Sans CJK**: 한국어 + 일본어 + 영문을 단일 폰트로 지원. 용량이 크므로 서브셋 또는 동적 로딩 필요.
- 대안: 언어별 폰트 분리 (한국어: Pretendard, 일본어: Noto Sans JP, 영문: Inter)

---

## 5. 레퍼런스 프로젝트

### Bemuse (github.com/bemusic/bemuse)

오픈소스 웹 리듬게임. React + PixiJS + Web Audio API 조합으로, not4k와 거의 동일한 기술 스택이다.

- BMS 포맷 지원, 키사운드 기반
- Web Audio API로 오디오 레이턴시 캘리브레이션 내장
- 게임 로직과 UI의 분리 아키텍처
- AGPLv3 라이선스

아키텍처 참고 포인트:
- 오디오 동기화 구현
- 노트 렌더링 파이프라인
- 에셋 로딩 전략

---

## 6. 위험 요소와 대응

| 위험 | 영향 | 대응 |
|------|------|------|
| **PixiJS v8 + React 19 성숙도** | @pixi/react v8이 아직 일부 기능 미구현 (attach API 등) | 게임 루프는 React 외부에서 구현하여 의존도 최소화 |
| **웹 오디오 레이턴시** | 블루투스 헤드폰에서 150ms+ 지연 | 오프셋 캘리브레이션으로 대응 (이미 `game-core.md`에 설계) |
| **Supabase Storage 대역폭** | 무료 2GB/월은 빠르게 소진 | 브라우저 캐싱 + Pro 전환 계획 |
| **React Strict Mode 충돌** | 개발 모드에서 WebGL 컨텍스트 문제 | 개발 시 Strict Mode 비활성화 |
| **모바일 브라우저 성능** | 저사양 기기에서 프레임 드롭 | 이펙트 품질 설정 제공, 프로토타입에서는 PC 우선 |

---

## 관련 문서

- 게임 코어 설계: `game-core.md`
- 차트 에디터 (데이터 모델): `chart-editor.md`
- 프로젝트 에셋 (수급 전략): `project-assets.md`
- PRD 미결정 사항 검토: `review-prd-readiness.md`
