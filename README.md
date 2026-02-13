# not4k

> 4레인 노트낙하형 가변 손배치 PC 리듬게임

기존 PC 4키 리듬게임의 세 가지 구조적 한계 — **연타의 물리적 고통**, **키 수 간 난이도 단절**, **고정 손배치가 만드는 해부학적으로 불리한 패턴** — 를 "레인당 다중키 바인딩"이라는 단일 메커니즘으로 동시에 해결한다.

화면에는 항상 4개의 레인만 존재하지만, 유저는 각 레인에 2개 이상의 키를 바인딩하여 연타를 트릴로, 고정 손배치를 가변 손배치로 전환할 수 있다. 키 수가 4개에서 10개로 확장되어도 레인 구조는 변하지 않으므로, 하나의 연속된 성장 경로를 제공한다.

---

## 문서 분류 기준

문서를 **context**(기획)와 **spec**(구현) 두 폴더로 나눈다.

- **context/** — 설계 의도와 맥락을 담은 문서. "왜 이렇게 만드는가", "무엇을 만드는가"에 답한다. 코드를 쓰지 않아도 읽을 수 있고, 구현 중에는 설계 결정의 근거가 필요할 때만 참조한다.
- **spec/** — 구현에 필요한 구체적 수치·포맷·규칙을 담은 문서. "어떻게 만드는가"에 답한다. 코딩할 때 옆에 펴놓고 보는 문서다.
- **research/** — 기존 리듬게임의 역기획 분석. context의 근거 자료로, 설계 결정이 어떤 사례에서 출발했는지 보여준다.

분류 판단 기준: 해당 문서를 읽지 않으면 **코드를 작성할 수 없는가?** 그렇다면 spec, 아니라면 context.

---

## context — 기획 문서 (8개)

"왜, 무엇을" — 설계 철학, 게임 디자인 의도, 용어 정의

| 문서 | 설명 |
|------|------|
| [overview.md](docs/context/overview.md) | **게임 설계 개요**. 핵심 메커니즘(4레인 + 다중키 바인딩), 노트 타입/피스 요약, 난이도 체계 요약. 전체 문서의 진입점 |
| [rationale.md](docs/context/rationale.md) | **이 게임은 왜 존재하는가**. 기존 리듬게임의 3가지 구조적 문제와 아케이드 게임이 보여준 해법의 단서 |
| [glossary.md](docs/context/glossary.md) | **용어 사전**. 게임 구조, 입력 체계, 노트 타입, 피스, 채보 설계, 판정/스코어링, 표기법 심볼의 통합 정의 |
| [chart-design.md](docs/context/chart-design.md) | **차트 디자인 어휘**. 앵커, 레인 내 분리, 가변 분할, 건너가기 등 not4k 고유의 채보 설계 개념 |
| [difficulty-design.md](docs/context/difficulty-design.md) | **난이도 설계**. Lv.1~15의 5단계 등급, 등급별 핵심 경험, 등급 간 전이 설계 |
| [tutorial.md](docs/context/tutorial.md) | **튜토리얼 설계**. Phase 1~4의 단계적 학습 구조 |
| [review.md](docs/context/review.md) | **문서 리뷰**. 문서 교차 검토 결과 — 해결된 모순/불일치, 미완료 항목 추적 |
| [review-cross-reference.md](docs/context/review-cross-reference.md) | **교차 검토 결과**. 문서 간 모순·불일치 정리 |

## spec — 구현 문서 (12개)

"어떻게" — 구체적 수치, 데이터 포맷, 판정 규칙, 기술 스택

| 문서 | 설명 |
|------|------|
| [mvp-scope.md](docs/spec/mvp-scope.md) | **MVP 스코프**. Phase A(프로토타입) / Phase B(알파) 기능 범위. **구현 진입점** |
| [tech-stack.md](docs/spec/tech-stack.md) | **기술 스택**. React 19 + PixiJS v8 + Supabase + Web Audio API. 모노레포, 배포, 차트 JSON 포맷 |
| [note-system.md](docs/spec/note-system.md) | **노트 시스템 상세**. 싱글/롱/트릴/더블 노트의 메커니즘, 판정, 유예 시간(12ms), 피스 정의 |
| [piece-definition.md](docs/spec/piece-definition.md) | **피스 정의 (PP-000 체계)**. PP-001~PP-010 카탈로그, PLv. 메타데이터 |
| [piece-notation.md](docs/spec/piece-notation.md) | **피스 표기법**. 수직/수평 표기법 문법, 심볼 정의 |
| [chart-editor.md](docs/spec/chart-editor.md) | **차트 편집기**. 타임라인·줌·스냅·편집 모드·단축키·배치 제약 조건, 엔티티 정의 |
| [scoring.md](docs/spec/scoring.md) | **스코어링 시스템**. 판정 윈도우(Perfect ±41ms ~ Bad ±160ms), 달성률, 랭크, 콤보 규칙 |
| [game-core.md](docs/spec/game-core.md) | **게임 코어 설계**. 플랫폼, 인증, 랭킹, 입력 매칭, 스크롤, 오프셋, 상태 흐름 |
| [keybinding.md](docs/spec/keybinding.md) | **키 바인딩 시스템**. 약중검엄 손배치, 키보드 레이아웃, 4키→10키 프리셋 |
| [observer-mode.md](docs/spec/observer-mode.md) | **옵저버 모드**. 자유 스크롤, 구간 반복 재생, 손배치 정보 제공 |
| [grace-period-polling-rate.md](docs/spec/grace-period-polling-rate.md) | **유예 시간과 폴링 레이트**. 12ms 유예 시간의 폴링 레이트별 동작 분석 |
| [project-assets.md](docs/spec/project-assets.md) | **프로젝트 에셋 정의**. 비주얼/오디오/폰트 에셋 카탈로그, 단계별 수급 계획 |

## 제품 요구사항

| 문서 | 설명 |
|------|------|
| [prd.md](docs/prd.md) | **PRD**. 문제 정의, 해법, 타겟 유저, 기능 범위, 성공 지표를 종합. context와 spec을 하나로 요약한 최상위 문서 |

## research — 역기획 (6개)

기존 리듬게임의 역기획 분석. context의 근거 자료.

| 문서 | 대상 게임 | 핵심 참조 포인트 |
|------|-----------|-----------------|
| [beatmania.md](docs/research/beatmania.md) | beatmania IIDX | 7+1키 구조, 스크래치 복합, 4756 문제, 파지법, 소플란, 지력표 |
| [djmax.md](docs/research/djmax.md) | DJMAX RESPECT V 5B | 중앙 레인 공유(가변 손배치의 원형), 키 모드 간 전이 비용, 연타 문제 |
| [soundvoltex.md](docs/research/soundvoltex.md) | Sound Voltex | 아날로그 노브 + 건반 복합, BT 버튼 근접 배치에 의한 손배치 자유도, 볼포스 |
| [chunithm.md](docs/research/chunithm.md) | CHUNITHM | 물리적 칸막이 없는 슬라이더, 32분할 센서, 홀드 위 탭 공존, 입력의 면적화 |
| [maimai.md](docs/research/maimai.md) | maimai DX | 8버튼 원형 배치, 교차 패턴, Break 노트의 가중치, 실시간 손배치 재구성 |
| [judgment-windows.md](docs/research/judgment-windows.md) | 복수 게임 비교 | IIDX/SDVX/DDR/PIU/EZ2ON/DJMAX/osu!/프세카/Arcaea의 판정 윈도우 수집·비교 |

---

## 문서 구조

```
docs/
├── prd.md                          # 제품 요구사항 (최상위)
├── context/                        # 기획 — "왜, 무엇을" (8개)
│   ├── overview.md                 #   게임 설계 개요 ← 시작점
│   ├── rationale.md                #   존재 이유
│   ├── glossary.md                 #   용어 사전
│   ├── chart-design.md             #   차트 디자인 어휘
│   ├── difficulty-design.md        #   난이도 설계
│   ├── tutorial.md                 #   튜토리얼 설계
│   ├── review.md                   #   문서 리뷰
│   └── review-cross-reference.md   #   교차 검토 결과
├── spec/                           # 구현 — "어떻게" (12개)
│   ├── mvp-scope.md                #   MVP 스코프 ← 구현 진입점
│   ├── tech-stack.md               #   기술 스택
│   ├── note-system.md              #   노트 시스템 상세
│   ├── piece-definition.md         #   피스 정의 (PP-000 체계)
│   ├── piece-notation.md           #   피스 표기법
│   ├── chart-editor.md             #   차트 편집기
│   ├── scoring.md                  #   스코어링 시스템
│   ├── game-core.md                #   게임 코어
│   ├── keybinding.md               #   키 바인딩 시스템
│   ├── observer-mode.md            #   옵저버 모드
│   ├── grace-period-polling-rate.md #  유예 시간과 폴링 레이트
│   └── project-assets.md           #   프로젝트 에셋 정의
└── research/                       # 역기획 보고서 (6개)
    ├── beatmania.md
    ├── djmax.md
    ├── soundvoltex.md
    ├── chunithm.md
    ├── maimai.md
    └── judgment-windows.md
```

---

## 프로젝트 예상 구조

게임 클라이언트와 차트 편집기는 별도 애플리케이션이지만(`game-core.md`), 차트 데이터 모델·배치 제약 조건·박자/시간 변환 등 핵심 도메인 로직을 공유한다. 모노레포 + 공유 패키지 구조로 이 의존성을 관리한다.

```
not4k/
├── packages/
│   ├── core/                    # 공유 도메인 로직
│   │   ├── models/              #   노트 9종, 마커, 위치(레인+분수 박자수), 차트 메타데이터
│   │   ├── validation/          #   배치 제약 조건 3종 (동일 위치 중복, 롱노트 겹침, 트릴 전용)
│   │   ├── timing/              #   BPM 마커 기반 박자수↔ms 변환, 분수 박자 연산
│   │   └── chart-io/            #   차트 직렬화/역직렬화
│   │
│   ├── game/                    # 게임 클라이언트 (웹)
│   │   ├── engine/              #   판정 엔진 (윈도우, 입력-노트 매칭, 홀드 이어잡기)
│   │   ├── scoring/             #   달성률, 랭크, 콤보, Good◇ 집계
│   │   ├── renderer/            #   노트 낙하, 레인, 이펙트 렌더링
│   │   ├── input/               #   키 바인딩, 입력 처리
│   │   ├── screens/             #   타이틀, 곡 선택, 플레이, 결과, 설정, 튜토리얼, 옵저버
│   │   └── audio/               #   음원 재생, 오프셋 보정, 프리뷰
│   │
│   ├── editor/                  # 차트 편집기 (웹, 개발자 전용)
│   │   ├── timeline/            #   타임라인 UI, 줌, 파형 표시
│   │   ├── modes/               #   Create / Select / Delete 모드
│   │   ├── snap/                #   스냅 그리드 계산
│   │   ├── controls/            #   단축키, 모바일 터치 조작
│   │   └── io/                  #   서버 업로드/다운로드
│   │
│   └── server/                  # 백엔드 서버
│       ├── auth/                #   Google 소셜 로그인
│       ├── chart-api/           #   차트 데이터 스트리밍
│       ├── ranking/             #   차트별 달성률 순위
│       └── records/             #   플레이 기록 저장
│
├── docs/                        # 설계 문서 (현재)
│   ├── context/                 #   기획 문서 (8개)
│   ├── spec/                    #   구현 문서 (12개)
│   └── research/                #   역기획 보고서 (6개)
│
└── assets/                      # 에셋 원본
    ├── visual/                  #   노트 그래픽, UI, 레인, 이펙트
    ├── audio/                   #   효과음, UI 사운드
    └── fonts/                   #   UI 본문, 숫자 전용, 타이틀
```

### 패키지 의존 관계

```
game ──→ core ←── editor
              ↑
           server
```

- **core**: 게임·편집기·서버가 모두 의존하는 공유 계층. 타입 정의, 검증 로직, 직렬화 포맷을 단일 소스로 관리하여 데이터 불일치를 방지한다.
- **game**: core를 읽기 전용으로 소비. 판정·렌더링·입력은 게임 전용.
- **editor**: core를 읽기/쓰기로 소비. 타임라인 UI·편집 모드는 편집기 전용.
- **server**: core의 모델과 직렬화를 사용하여 차트를 저장·제공하고, 랭킹·기록을 관리.

---

### 읽기 순서 (권장)

**기획을 이해하려면** (context → research 순):

1. [rationale.md](docs/context/rationale.md) — 왜 이 게임이 필요한지
2. [overview.md](docs/context/overview.md) — 게임이 어떻게 작동하는지
3. [difficulty-design.md](docs/context/difficulty-design.md) — 난이도가 어떻게 상승하는지
4. 나머지 context/ 문서와 research/ 는 필요에 따라 참조

**구현을 시작하려면** (spec 순):

1. [mvp-scope.md](docs/spec/mvp-scope.md) — 무엇을 먼저 만들어야 하는지
2. [tech-stack.md](docs/spec/tech-stack.md) — 어떤 기술로 만드는지
3. 구현 영역에 해당하는 spec/ 문서를 참조 (예: 판정 → scoring.md, 입력 → keybinding.md)
