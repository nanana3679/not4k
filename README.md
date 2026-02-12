# not4k

> 4레인 노트낙하형 가변 손배치 PC 리듬게임

기존 PC 4키 리듬게임의 세 가지 구조적 한계 — **연타의 물리적 고통**, **키 수 간 난이도 단절**, **고정 손배치가 만드는 불가능 패턴** — 를 "레인당 다중키 바인딩"이라는 단일 메커니즘으로 동시에 해결한다.

화면에는 항상 4개의 레인만 존재하지만, 유저는 각 레인에 2개 이상의 키를 바인딩하여 연타를 트릴로, 고정 손배치를 가변 손배치로 전환할 수 있다. 키 수가 4개에서 10개로 확장되어도 레인 구조는 변하지 않으므로, 하나의 연속된 성장 경로를 제공한다.

---

## 설계 문서

### 핵심 설계

| 문서 | 설명 |
|------|------|
| [overview.md](docs/design/overview.md) | **게임 설계 개요**. 핵심 메커니즘(4레인 + 다중키 바인딩), 노트 타입/피스 요약, 난이도 체계 요약. 전체 문서의 진입점 |
| [rationale.md](docs/design/rationale.md) | **이 게임은 왜 존재하는가**. 기존 리듬게임의 3가지 구조적 문제(연타, 키 수 단절, 불가능 패턴)와 아케이드 게임이 보여준 해법의 단서, not4k의 해법 |
| [game-core.md](docs/design/game-core.md) | **게임 코어 설계**. 플랫폼(웹), 인증(Google SSO), 랭킹, 입력 매칭, 스크롤 속도, 오프셋, 게이지 없음, 미러 옵션, 게임 화면, 상태 흐름 |

### 노트 및 차트 시스템

| 문서 | 설명 |
|------|------|
| [note-system.md](docs/design/note-system.md) | **노트 시스템 상세**. 싱글/롱/트릴/더블 노트의 메커니즘, 판정, 시각적 요구사항. 홀드 이어잡기, 유예 시간(12ms), 피스(릴리즈탭·홀드 트릴·홀드 중 탭) 정의 |
| [piece-notation.md](docs/design/piece-notation.md) | **피스 표기법**. 모든 노트 타입을 텍스트로 표현하기 위한 수직/수평 표기법 문법. 심볼 정의(`o`, `t`, `D`, `-`, `=`, `-o`, `{`, `}` 등) |
| [piece-definition.md](docs/design/piece-definition.md) | **피스 정의 (PP-000 체계)**. PP-001~PP-011까지의 피스 카탈로그. 각 피스의 메타데이터(PLv., 구성 노트, 인지/물리 부하, 선행 피스 등) |
| [chart-design.md](docs/design/chart-design.md) | **차트 디자인 어휘**. 트릴 앵커, 레인 내 분리, 가변 분할 전환, 비트 복합 트릴, 건너가기 등 not4k 고유의 차트 설계 개념과 기존 게임과의 대응 |

### 난이도 및 스코어링

| 문서 | 설명 |
|------|------|
| [difficulty-design.md](docs/design/difficulty-design.md) | **난이도 설계**. Lv.1~15의 5단계 등급(입문/초급/중급/상급/최상급), 등급별 핵심 경험, 등급 간 전이 설계 |
| [scoring.md](docs/design/scoring.md) | **스코어링 시스템**. 판정 윈도우(Perfect ±41ms ~ Bad ±160ms), 판정 등급, 달성률, 랭크(SSS~F), 콤보/풀콤보 규칙, TGood |

### 입력 및 유저 경험

| 문서 | 설명 |
|------|------|
| [keybinding.md](docs/design/keybinding.md) | **키 바인딩 시스템**. 약중검엄 손배치 철학, 키보드 레이아웃(넘버패드/TKL), 난이도별 키 배치(4키→6키→8키→10키), 트릴 키 배치의 인체공학적 근거 |
| [tutorial.md](docs/design/tutorial.md) | **튜토리얼 설계**. Phase 1(연주 방법) → Phase 2(복합 패턴과 판정) → Phase 3(홀드 이어잡기) → Phase 4(10키)의 단계적 학습 구조 |
| [observer-mode.md](docs/design/observer-mode.md) | **옵저버 모드**. 입력 없이 차트를 확인하는 모드. 자유 스크롤, 구간 반복 재생, 손배치 정보 제공 |

### 도구 및 에셋

| 문서 | 설명 |
|------|------|
| [chart-editor.md](docs/design/chart-editor.md) | **차트 편집기**. 타임라인·줌·스냅·편집 모드(Create/Select/Delete)·단축키·모바일 터치 조작·배치 제약 조건. 차트 메타데이터 및 엔티티(노트/BPM 마커/박자 마커) 정의 |
| [project-assets.md](docs/design/project-assets.md) | **프로젝트 에셋 정의**. 비주얼/오디오/폰트 에셋 카탈로그, 수급 방안(자체 제작/오픈소스/커미션), 비영리 무료 게임 우선 공개 전략에 따른 단계별 수급 계획 |

### 참조

| 문서 | 설명 |
|------|------|
| [glossary.md](docs/design/glossary.md) | **용어 사전**. 게임 구조, 입력 체계, 입력방식, 노트 타입, 피스, 채보 설계, 난이도 체계, 판정/스코어링, 외부 참조 용어, 표기법 심볼의 통합 정의 |
| [review-document-clarity.md](docs/design/review-document-clarity.md) | **문서 리뷰**. 16개 문서의 교차 검토 결과 — 해결된 모순/불일치, 용어 정리, 미완료 항목 추적 |

---

## 리서치 문서

기존 리듬게임의 역기획 분석. not4k의 설계 근거를 뒷받침하는 원본 자료.

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
├── design/                  # 게임 설계 문서 (16개)
│   ├── overview.md          # 게임 설계 개요 ← 시작점
│   ├── rationale.md         # 존재 이유
│   ├── game-core.md         # 게임 코어 (플랫폼, 인증, 랭킹, UI)
│   ├── note-system.md       # 노트 시스템 상세
│   ├── piece-notation.md    # 피스 표기법
│   ├── piece-definition.md  # 피스 정의 (PP-000 체계)
│   ├── difficulty-design.md # 난이도 설계
│   ├── chart-design.md      # 차트 디자인 어휘
│   ├── scoring.md           # 스코어링 시스템
│   ├── keybinding.md        # 키 바인딩 시스템
│   ├── observer-mode.md     # 옵저버 모드
│   ├── tutorial.md          # 튜토리얼 설계
│   ├── chart-editor.md      # 차트 편집기
│   ├── project-assets.md    # 프로젝트 에셋 정의
│   ├── glossary.md          # 용어 사전
│   └── review-document-clarity.md  # 문서 리뷰
└── research/                # 역기획 보고서 (6개)
    ├── beatmania.md
    ├── djmax.md
    ├── soundvoltex.md
    ├── chunithm.md
    ├── maimai.md
    └── judgment-windows.md
```

### 읽기 순서 (권장)

1. [rationale.md](docs/design/rationale.md) — 왜 이 게임이 필요한지
2. [overview.md](docs/design/overview.md) — 게임이 어떻게 작동하는지
3. [note-system.md](docs/design/note-system.md) — 노트 타입의 상세 메커니즘
4. [difficulty-design.md](docs/design/difficulty-design.md) — 난이도가 어떻게 상승하는지
5. [keybinding.md](docs/design/keybinding.md) — 키보드에서 어떻게 치는지
6. 나머지 문서는 필요에 따라 참조
