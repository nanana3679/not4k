# 리듬게임 노트 스킨 시스템 — 프로젝트 스펙

## 게임 개요

4레인 낙하형 리듬게임. 노트가 위에서 아래로 내려오며 판정선에 도달하면 플레이어가 입력.

## 아트 컨셉 키워드

단색의 조합으로 입체감 표현, 직각삼각형 타일, 크리스탈 — 이것이 기본(Crystal) 스킨의 출발점이며, 스킨마다 다른 키워드 조합을 사용.

---

## 에셋 구성 요소

모든 스킨은 아래 요소를 반드시 포함하며, 같은 인터페이스(props)를 공유한다.

### 1. 노트 컨테이너 (NoteContainer)

노트의 머리 부분. 플레이어가 타격하는 대상.

**구조적 규칙:**

- 가로:세로 비율 ≈ 5:1 (CW=100, CH=20 기준)
- 외형은 스킨마다 다를 수 있음 (직사각형, 캡슐, 육각형, 평행사변형, 방패형, 계단형 등)
- 내부에 홀더+코어가 중앙 배치
- 싱글: 코어 1개, 더블: 코어 2개 (coreGap으로 간격 조절)

**내부 디자인 레이어 (안쪽→바깥쪽):**

1. 바닥층(Fill) — 배경색, 그라데이션, 패턴
2. 구조층(Structure) — 내부 분할 기하학 (동심 도형, 트레이스, 격자, 분할 밴드 등)
3. 장식층(Decoration) — 문양, 심볼, 텍스처
4. 하이라이트층(Highlight) — 베벨, 반사, 엣지라인
5. 코어/홀더층

**props:**

```
x, y, type("single"|"double"), coreSize, coreGap, dimLeft, dimRight
```

### 2. 코어 (Core)

노트 중앙의 보석/심볼. 노트 속성을 시각적으로 전달.

**상태 3종:**

- `filled + glowing` → 활성 (밝은 루비색, 글로우 번짐)
- `filled + !glowing` (또는 dimmed) → 비활성/꺼진 상태 (어두운 적갈색)
- `!filled` → 빈 코어 (외곽선만, 터미널 캡에 사용)

**Crystal 기본형:**

- 45도 회전 다이아몬드 (정사각형 rotate(45))
- 4파셋 분할 (base, mid, bright, highlight)
- 내부 세분화 2파셋 추가 (깊이감)
- 스페큘러 하이라이트 (삼각형 + 작은 원)

**스킨별 변형 가능:** 원형(ABYSSAL), 별(PRISM), 꽃(SAKURA), 룬 각인(FORGE), 태양(FOSSIL) 등.

**props:**

```
cx, cy, size(default 7), filled, glowing, dimmed
```

### 3. 홀더 (Holder)

코어를 감싸는 검은색 테두리. 코어와 직접 붙어있음 (gap 0).

**Crystal 기본형:**

- 45도 회전 정사각형, 코어보다 pad(2px) 만큼 큼
- fill: `#0c0c0c`, stroke: `#080808`, strokeWidth 2

**props:**

```
cx, cy, size(default 7), pad(default 2)
```

### 4. 바디 (BodySegment)

롱노트의 몸통. 홀드 유지 중임을 표현.

**구조:**

- 컨테이너 너비보다 좁음 (양쪽 8px 인셋)
- 좌→우 그라데이션 배경 (edge → base → base → edge)
- 중앙에 와이어(Wire) + 라인(Line)

**와이어(Wire):**

- 라인보다 굵은 하나의 검은 바 (라인 뒤에 깔림)
- wireThickness로 굵기 조절 (default 6)

**라인:**

- 와이어 위에 올라가는 가느다란 선
- lineThickness로 굵기 조절 (default 2)
- **Held 상태:** 밝은 루비색 (`P.core.bright`) + 글로우 번짐
- **Released 상태:** 어두운 루비색 (`P.core.offBright`) — 꺼진 전선처럼 보이되 사라지지 않음

**더블:** 와이어+라인이 2개 (coreGap 간격)

**props:**

```
x, y, height, type, held, coreGap, wireThickness, lineThickness, glowIntensity
```

### 5. 터미널 캡 (TerminalCap)

롱노트 바디의 끝(상단). 바디 디자인을 따라감.

**규칙:**

- 바디와 동일한 배경 그라데이션, 와이어, dimmed 라인
- 높이는 CH (20px)
- 홀더 안의 코어가 **비어있음** (filled=false)
- 노트 컨테이너와 다른 디자인임을 확실히 구분

**props:**

```
x, y, type, coreSize, coreGap, wireThickness, lineThickness
```

### 6. 롱노트 (LongNote)

TerminalCap + BodySegment + NoteContainer의 조합.

**배치 (위→아래):**

1. TerminalCap (y 위치)
2. BodySegment (y + CH부터 bodyH 만큼)
3. NoteContainer (y + CH + bodyH 위치)

**props:**

```
x, y, bodyH, type, held, coreSize, coreGap, dimLeft, dimRight,
wireThickness, lineThickness, glowIntensity
```

### 7. 봄 (Bomb)

노트를 쳤을 때 터지는 이펙트. 16프레임 @ 60fps (~267ms).

**5단계 진행:**
| 단계 | 프레임 | 내용 |
|------|--------|------|
| Flash | 0-2 | 백색 코어 급팽창, 글로우 확산 시작 |
| Expand | 3-5 | 코어 수축, 12방향 버스트라인 성장, 6개 다이아몬드 파편 생성, 링 등장 |
| Peak | 6-8 | 글로우 최대 반경, 링 확장, 버스트 최대 길이 |
| Scatter | 9-11 | 코어 소멸, 파편 원거리 비산, 전체 opacity 감소 |
| Fade | 12-15 | 글로우/버스트 소멸, 파편만 멀리서 회전하다 사라짐 |

**프레임별 파라미터 (12개):**

```
coreR, coreOp, glowR, glowOp, burstLen, burstOp,
shardDist, shardSz, shardOp, ringR, ringOp, ringW
```

**구성 요소:**

- Radial gradient (중심 백색 → 루비 → 투명)
- 12방향 burst line (30도 간격)
- 6개 다이아몬드 파편 (4 대각 + 2 상하, 회전하며 비산)
- 확장하는 ring

**BombFrame 컴포넌트:** `{ cx, cy, frame, id }` — 어디서든 특정 프레임을 렌더할 수 있음.

**BombPlayer 컴포넌트:** requestAnimationFrame으로 60fps 실시간 재생.

### 8. 키빔 (Key Beam)

레인이 눌렸을 때(버튼 pressed) 해당 레인 전체에 표시되는 빛.

**원칙:** 레인 하단에 광원이 있는 것처럼 아래→위로 페이드.

**Crystal 기본형:**

- linearGradient bottom→top (white 0.18 → 0)
- 넓은 빔 (레인 전체 폭) + 가는 코어 빔 (중앙 집중)
- 바닥 타원형 핫스팟 글로우

**스킨별 변형 가능:** 바이올루미네선스 입자(ABYSSAL), CRT 스캔라인(CIRCUIT), 벚꽃잎 파티클(SAKURA), 용암 균열(FORGE), 오로라 커튼(PRISM), 모래 기둥(FOSSIL)

---

## 기어 (Gear)

4레인 전체를 감싸는 프레임 + 버튼부.

### 계층 구조 (위→아래)

1. **아우터 프레임** — 기어 전체를 감싸는 외곽. 검은 배경의 레인과 대비되어야 하므로 **밝은 색** (Crystal: 밝은 크롬 #c8ccd8). 베벨로 입체감.
2. **레인 필드** — 어두운 인셋 영역 (#04060c). 노트가 낙하하는 공간.
3. **레인 구분선** — 4레인 경계. 미세한 수직선.
4. **판정선** — 레인 하단에서 노트 2개 높이(CH×2) 위에 위치. 3중 레이어 (넓은 글로우 + 메인라인 + 스페큘러).
5. **커넥터** — 판정선 아래, 레인 너비→버튼 너비로 테이퍼되는 사다리꼴. 레인-버튼 연결감.
6. **버튼** — 각 레인에 하나씩. 원형 베젤 + 내부 면 + 다이아몬드 리셉터. Idle/Pressed 2상태. 눌렸을 때 베벨 반전 + 루비 글로우.
7. **코너 볼트** — 프레임 모서리 장식.

### 레이아웃 상수 (Crystal v6 기준)

```javascript
const LANE_GAP = 4; // 레인 간 여백 (아주 좁게)
const LANE_W = CW + LANE_GAP; // 104px
const GEAR_PAD = 18; // 프레임 안쪽 여백
const FIELD_W = LANE_W * 4; // 416px
const LANE_H = 340; // 레인 세로 길이
const LANE_TOP = GEAR_PAD;
const LANE_BOT = LANE_TOP + LANE_H;
const JUDGE_Y = LANE_BOT - CH * 2; // 판정선 Y좌표
```

### 노트 X좌표 계산

```javascript
const noteX = (laneIndex) => GEAR_PAD + laneIndex * LANE_W + (LANE_W - CW) / 2;
```

---

## 색상 시스템 (Crystal 스킨)

```javascript
const P = {
  single: {
    // 파스텔 페리윙클 (Pastel Periwinkle)
    deep: "#2a3468",
    base: "#4a5a98",
    mid: "#7088cc",
    bright: "#9ab4ee",
    highlight: "#c0d4ff",
    specular: "#e4ecff",
  },
  double: {
    // 파스텔 버터 (Pastel Butter)
    deep: "#5e5028",
    base: "#8a7a40",
    mid: "#b8a860",
    bright: "#dece88",
    highlight: "#f0e4aa",
    specular: "#fdf6d8",
  },
  core: {
    // 루비 (Ruby)
    deep: "#4a0018",
    base: "#8b0028",
    mid: "#cc1040",
    bright: "#ff3060",
    highlight: "#ff7098",
    specular: "#ffc0d4",
    glow: "rgba(255,48,96,0.55)",
    off: "#1e0a0a",
    offBase: "#2e1010",
    offMid: "#3a1818",
    offBright: "#4a2222",
  },
  holder: { stroke: "#080808", fill: "#0c0c0c" },
  body: {
    single: { base: "#2a3468", edge: "#1a2248" },
    double: { base: "#5e5028", edge: "#3a3218" },
  },
  bg: "#06070c", // 앱 배경
  bgCard: "#0c0e16", // 카드 배경
  text: "#c8cdd8", // 일반 텍스트
  textDim: "#4a5068", // 보조 텍스트
  border: "#181c2a", // 테두리
  accent: "#ff3060", // 강조색 (루비와 동일)
};
```

각 스킨은 동일한 키 구조의 팔레트 객체를 가지며, 컴포넌트는 `palette.bright` 같은 방식으로 참조.

---

## 조절 가능 파라미터

UI 슬라이더로 노출되는 옵션:

| 파라미터      | 범위            | 기본값 | 설명                                                    |
| ------------- | --------------- | ------ | ------------------------------------------------------- |
| coreSize      | 5-12            | 7      | 코어 크기 (px). 컨테이너 높이 초과 가능                 |
| coreGap       | 14-40           | 26     | 더블 노트의 두 코어 간 거리 (px)                        |
| glowIntensity | 0-10            | 3      | 코어/라인 글로우 번짐 강도 (Gaussian blur stdDeviation) |
| lineThickness | 1-6             | 2      | 바디 라인 굵기 (px)                                     |
| wireThickness | 4-16            | 6      | 바디 와이어 굵기 (px)                                   |
| dimMode       | none/left/right | none   | 더블 노트 한쪽 코어 dimmed                              |
| holdState     | bool            | false  | 홀드 상태 (키빔, 라인 점등, 버튼 pressed)               |

---

## 스킨 시스템

### 공통 인터페이스

모든 스킨은 아래 컴포넌트를 export:

```typescript
interface Skin {
  id: string;
  name: string;
  palette: PaletteObject;
  NoteContainer: Component;
  TerminalCap: Component;
  BodySegment: Component;
  LongNote: Component; // 위 3개의 조합
  Core: Component;
  Holder: Component;
  Wire: Component;
  BombFrame: Component;
  KeyBeam: Component;
  GearFrame: Component; // 아우터 프레임 + 볼트
  GearButton: Component; // 개별 버튼
  GearConnector: Component; // 레인→버튼 커넥터
  JudgmentLine: Component;
}
```

### 공유 골자 (스킨이 바뀌어도 불변)

- 노트 비율 ≈ 5:1 (CW, CH)
- 코어 filled/empty/dimmed 3상태
- 바디 held/released 2상태
- 터미널 캡은 바디 스타일 따라감 + 빈 코어
- 기어 5계층 (프레임→레인→판정선→커넥터→버튼)
- 판정선은 레인 하단에서 노트 2높이 위
- 키빔은 하단 광원 → 상방 페이드
- 봄은 16F@60fps, Flash→Expand→Peak→Scatter→Fade 5단계
- 싱글/더블은 색상 또는 형태로 구분, 코어 1/2개
- 레인 간격은 아주 좁게 (LANE_GAP ≈ 4px)

### 스킨별 변형 범위

| 요소          | 변형 가능 항목                                              |
| ------------- | ----------------------------------------------------------- |
| 노트 컨테이너 | 외형, 내부 5레이어 전부, 색상                               |
| 코어          | 형태 (다이아몬드/원/별/꽃/룬/태양 등), 파셋 구조, 발광 방식 |
| 홀더          | 형태 (사각/원/enso 등), 장식                                |
| 와이어/라인   | 재질감, 발광 색상                                           |
| 터미널 캡     | 바디를 따라가되 캡 특유의 마감                              |
| 기어 프레임   | 재질 (크롬/산호/대나무/철판/아크릴/사암), 색상, 장식        |
| 버튼          | 형태 (원형/사각/모루/자갈/사다리꼴 등), 리셉터 디자인       |
| 키빔          | 형태 (단색빔/파티클/스캔라인/균열/오로라/모래 등)           |
| 봄            | 파편 형태, 궤적, 색상, 속도감, 잔상                         |
| 레인 구분선   | 실선/점선/기포/먹선/쇠사슬/홀로그램 등                      |
| 판정선        | 색상, 두께, 장식                                            |

---

## 설계된 스킨 6종

### 1. CRYSTAL (기본) — 크리스탈 × 단색 입체 × 크롬

- 노트: 직사각형, 상→하 그라데이션
- 코어: 45도 다이아몬드, 4+2 파셋, 루비
- 기어: 밝은 크롬 프레임
- 키빔: 백색 하→상 리니어 페이드
- 봄: 루비색 방사 + 다이아몬드 파편

### 2. ABYSSAL — 심해 × 유리 × 해파리

- 노트: 캡슐형, 동심 타원 링 3겹, 수직 촉수선, 방사형 발광 배경
- 코어: 원형, 촉수 장식
- 기어: 남색 배경, 산호초 프레임, 말미잘 버튼
- 키빔: 바이올루미네선스 파티클 상승
- 봄: 촉수 흩어짐 + 물방울 파편, 느린 수중 물리

### 3. CIRCUIT — 사이버펑크 × 와이어프레임 × 네온

- 노트: 양끝 셰브론 육각형, PCB 트레이스+비아+IC패드, 솔더마스크 배경
- 코어: 다이아몬드 + 바이너리 글리치
- 기어: 검정+네온 와이어프레임, 키캡 버튼
- 키빔: CRT 스캔라인 상승
- 봄: 글리치 폭발, 픽셀 파편, RGB 색분리

### 4. SAKURA — 일본전통 × 수채화 × 벚꽃

- 노트: 직사각형(상단 라운드), 와시 종이 섬유, enso 홀더, 꽃잎 워터마크, 금박 상단선
- 코어: 5잎 꽃 형태
- 기어: 남색+먹그림 배경, 대나무 프레임, 자갈 버튼
- 키빔: 벚꽃잎 파티클 상승
- 봄: 꽃잎 펼침 + 먹물 splash, 느린 곡선 궤적

### 5. FORGE — 용암 × 메탈 × 중세

- 노트: 방패형 오각형, 해머 디봇+다마스커스 crosshatch, 잔열 보더
- 코어: 룬 각인 다이아몬드
- 기어: 철판+리벳 프레임, 모루 버튼
- 키빔: 용암 균열 크랙 라인
- 봄: 불꽃 포물선 + 금속 파편 중력 낙하 + 연기

### 6. PRISM — 홀로그램 × Y2K × 오로라

- 노트: 평행사변형, 7밴드 스펙트럼+CD간섭 오버레이, noise 텍스처
- 코어: 4각 별, 꼭짓점마다 스펙트럼 색
- 기어: 반투명 아크릴+무지개 엣지, 프리즘 버튼
- 키빔: 오로라 곡선 커튼 (초록/보라/핑크 물결)
- 봄: 7색 방사선 + 별 파편 + 무지개 링

### 7. FOSSIL — 사암 × 아즈텍 × 미니멀

- 노트: 계단형, 동심 직사각형 3겹+삼각형 meander 띠, 퇴적층 텍스처
- 코어: 태양 디스크 (원+삼각 광선 8방향)
- 기어: 사암색 프레임, 옥색 레인, 사다리꼴 버튼
- 키빔: 모래 파티클 기둥
- 봄: 돌 균열 → 석재 파편 튕김 + 먼지 구름

---

## 컨테이너 내부 디자인 패턴 유형 참조

| 패턴 유형             | 적합한 컨셉       | 예시                                    |
| --------------------- | ----------------- | --------------------------------------- |
| 동심 도형 (링/프레임) | 깊이감, 중앙 집중 | ABYSSAL 타원링, FOSSIL 직사각형         |
| 경로/트레이스         | 방향성, 연결감    | CIRCUIT PCB 트레이스                    |
| 텍스처 충진           | 재질감            | SAKURA 종이결, FORGE 해머, PRISM 노이즈 |
| 분할 밴드             | 색상 다양성       | PRISM 스펙트럼                          |
| 워터마크/심볼         | 문화적 깊이       | SAKURA 꽃잎, FOSSIL 뱀 문양             |
| 교차 격자             | 금속/직조         | FORGE 다마스커스                        |
| 보더 장식             | 마감 디테일       | FORGE 잔열, SAKURA 금박, FOSSIL 삼각띠  |

---

## 구현 순서 (추천)

1. 공통 base 컴포넌트 (`Core`, `Holder`, `Wire`, `BombFrame`, `BombPlayer`, `SharedDefs`, 기어 레이아웃 유틸, UI 컴포넌트)
2. 스킨 인터페이스 타입 정의 + 스킨 레지스트리
3. Crystal 스킨 (기존 v6 기반, 리팩터)
4. 나머지 스킨 하나씩 (ABYSSAL → CIRCUIT → SAKURA → FORGE → PRISM → FOSSIL)
5. 탭 전환 UI + 스킨 통합 뷰어

---

## 기술 스택

- React (JSX artifact)
- SVG 기반 렌더링
- 인라인 스타일 + Tailwind 유틸 (artifact 환경)
- 애니메이션: requestAnimationFrame (봄 플레이어)
- 상태: React useState/useEffect/useRef
- 외부 라이브러리 사용하지 않음
