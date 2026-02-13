# not4k — 문서 교차 검토 결과

> 28개 문서(설계 19개 + 리서치 6개 + PRD + README + AGENTS.md)를 교차 검토하여 발견한 모순, 누락, 불일치 사항을 정리한다.

---

## 1. 모순 (Contradictions)

### 1-1. 프로젝트 구조 불일치

**심각도: 높음**

PRD와 README는 `packages/{core,game,editor,server}` 구조를 사용하고, tech-stack.md와 mvp-scope.md는 `apps/{game,editor}` + `packages/shared` 구조를 사용한다.

| 문서 | 구조 |
|------|------|
| `prd.md` (§4.1~4.4) | `packages/game`, `packages/editor`, `packages/core`, `packages/server` |
| `README.md` (프로젝트 예상 구조) | `packages/game`, `packages/editor`, `packages/core`, `packages/server` |
| `tech-stack.md` (§8 모노레포) | `apps/game`, `apps/editor`, `packages/shared` |
| `mvp-scope.md` (§Phase A) | `apps/game`, `apps/editor`, `packages/shared` |

추가로 공유 패키지의 이름이 다르다:
- PRD/README: `packages/core` — models, validation, timing, chart-io
- tech-stack.md/mvp-scope.md: `packages/shared` — types, chart, constants

**`packages/server`의 존재 여부도 불일치한다.** PRD/README는 `packages/server`를 별도 패키지로 정의하지만, tech-stack.md의 배포 아키텍처(§6)에서는 Supabase가 서버 역할을 하며 별도 서버 패키지가 없다. mvp-scope.md에도 server 패키지가 없다.

**권장**: tech-stack.md/mvp-scope.md의 `apps/` + `packages/shared` 구조가 실제 구현 계획에 가까우므로, PRD와 README를 이에 맞춰 수정해야 한다.

---

### 1-2. 키 수 확장 범위 불일치

**심각도: 중간**

README.md에서 키 수 확장 범위가 다른 모든 문서와 다르다.

| 문서 | 기술 |
|------|------|
| `README.md` (7행) | "키 수가 4개에서 **10개**로 확장" |
| `README.md` (42행, tutorial.md 설명) | "Phase 4(**10키**)" |
| `prd.md` (§2 해법) | "4키→**16키**가 하나의 연속된 성장 경로" |
| `keybinding.md` (기본 프리셋) | 레인당 4키, **총 16키** |
| `tutorial.md` (Phase 4) | "**16키** — 한 레인에 4키 활용" |
| `difficulty-design.md` (최상급) | "**16키** 완전 활용" |

README만 "10키"를 사용하며, 나머지 모든 문서는 "16키"로 일관된다.

**권장**: README의 "10개" → "16개"로, "Phase 4(10키)" → "Phase 4(16키)"로 수정.

---

### 1-3. 배치 제약 조건 개수 불일치

**심각도: 중간**

| 문서 | 개수 |
|------|------|
| `README.md` (프로젝트 예상 구조) | "배치 제약 조건 **4종** (동일 위치 중복, 롱노트 겹침, 트릴 전용, 롱노트 시작점)" |
| `chart-editor.md` (§배치 제약 조건) | **3가지** (동일 위치 중복 금지, 롱노트 구간 내 겹침 금지, 트릴 구간 전용) |
| `prd.md` (C-02) | "**3가지** 배치 제약 조건의 검증 로직" |
| `tech-stack.md` (§8 모노레포) | "chart-editor.md의 **3가지** 제약 조건" |

README만 4종으로 기술하며 "롱노트 시작점"을 4번째 제약으로 나열하지만, chart-editor.md에는 이 제약이 없다.

**권장**: README를 3가지로 수정하고 "롱노트 시작점" 항목을 삭제. 또는 4번째 제약이 의도된 것이면 chart-editor.md에 추가.

---

### 1-4. 입문 등급(Lv.1~3) 노트 구성 불일치

**심각도: 중간**

note-system.md와 difficulty-design.md가 입문 등급의 노트 구성에 대해 다르게 기술한다.

| 문서 | 입문 등급 노트 구성 |
|------|---------------------|
| `note-system.md` (노트 타입의 등장 원칙) | "싱글 90%↑ / 트릴·더블·**홀드 이어잡기·홀드 중 탭** 극소량으로 존재를 인지" |
| `difficulty-design.md` (입문 §) | "싱글 90%↑ / **트릴·더블** 극소량 등장" |
| `difficulty-design.md` (설계 원칙 4) | "트릴·더블·**홀드 중 탭**이 극소량 등장" |

difficulty-design.md 내부에서도 불일치가 있다. 설계 원칙 4(23행)에서는 "홀드 중 탭"을 포함하지만, 입문 테이블(45행)에서는 "트릴·더블"만 나열하고 홀드 이어잡기·홀드 중 탭을 언급하지 않는다.

note-system.md는 "입력방식"과 "노트 타입"을 구분하여 입력방식의 극소량 배치도 포함하지만, difficulty-design.md의 입문 테이블은 노트 타입만 나열한다.

**권장**: difficulty-design.md 입문 테이블에 "홀드 이어잡기·홀드 중 탭 극소량"을 추가하여 note-system.md와 일치시키거나, note-system.md에서 입문에는 노트 타입만 등장한다고 명시하고 입력방식 극소량 배치는 초급부터로 수정.

---

### 1-5. 트릴 구간 vs 트릴 롱노트 용어 혼용

**심각도: 중간**

| 문서 | 용어 | 의미 |
|------|------|------|
| `note-system.md` | **트릴 구간** | 트릴 노트가 등장할 수 있는 시각적 영역 |
| `note-system.md` | **트릴 롱노트** | 트릴 노트가 헤드가 되어 바디를 가지는 형태 |
| `chart-editor.md` | **트릴 롱노트 바디** | 트릴 구간을 나타내는 에디터 엔티티 |
| `tech-stack.md` | **trillZoneStart** | 차트 JSON의 트릴 구간 엔티티 타입 |

note-system.md에서 "트릴 구간"과 "트릴 롱노트"는 별개의 개념이다. 그런데 chart-editor.md에서는 "트릴 롱노트 바디"가 "트릴 구간"의 역할을 겸한다. 배치 제약 3번(chart-editor.md:185)에서 "트릴 롱노트 바디 구간 안에는 트릴 노트만 존재할 수 있고"라고 기술하는데, 이것은 note-system.md의 "트릴 구간"의 정의와 같다.

한편 tech-stack.md의 차트 JSON은 `trillZoneStart`라는 별도 타입을 사용하여 note-system.md의 "트릴 구간" 개념에 더 가깝다.

**권장**: 트릴 구간과 트릴 롱노트의 관계를 명확히 정의. chart-editor.md에서 "트릴 구간"이라는 별도 엔티티를 정의하거나, "트릴 롱노트 바디 = 트릴 구간"임을 명시.

---

### 1-6. 차트 JSON 포맷과 에디터 데이터 모델 불일치

**심각도: 낮음 (구현 시 결정 가능)**

tech-stack.md의 차트 JSON 예시에서 사용하는 엔티티 타입이 chart-editor.md의 엔티티 목록과 일치하지 않는다.

| tech-stack.md JSON 타입 | chart-editor.md 대응 엔티티 | 불일치 |
|------------------------|-----------------------------|--------|
| `"single"` | 싱글 노트 | 일치 |
| `"double"` | 더블 노트 | 일치 |
| `"trill"` | 트릴 노트 | 일치 |
| `"longStart"` (endBeat 포함) | 싱글 롱노트 바디 시작 + 바디 끝 | **불일치**: JSON은 단일 엔티티에 endBeat를 포함하지만, chart-editor.md는 시작/끝 쌍 |
| `"trillZoneStart"` (endBeat 포함) | 트릴 롱노트 바디 시작 + 바디 끝 | **불일치**: 이름(zone vs 롱노트)과 구조(단일 vs 쌍) |
| — | 더블 롱노트 바디 시작/끝 | **누락**: JSON 예시에 더블 롱노트 없음 |

**권장**: tech-stack.md의 JSON 예시를 chart-editor.md의 데이터 모델(쌍 구조)에 맞춰 수정.

---

## 2. 누락 (Missing Content)

### 2-1. PP-006 부재

**심각도: 중간**

piece-definition.md의 피스 카탈로그에서 PP-006이 누락되어 있다. PP-005(싱글→더블 전환)에서 PP-007(가변 분할)로 건너뛴다. PRD는 "PP-001~PP-010"이라고 기술하므로 10개가 정의되어야 하지만 9개만 존재한다.

PP-006에 해당할 수 있는 후보:
- PRD와 overview.md에서 "릴리즈탭"을 독립 피스로 나열하지만, piece-definition.md에는 독립 PP 번호가 없다 (PP-004에 "릴리즈탭 → 트릴 연결"로 통합)
- 또는 의도적 결번인지 여부가 불명

**권장**: PP-006을 정의하거나, 의도적 결번이면 그 이유를 piece-definition.md에 명시.

---

### 2-2. PRD에 스페셜 땡스 화면 누락

**심각도: 낮음**

game-core.md(229행, 282~290행)에서 "스페셜 땡스" 화면을 정의하고, 타이틀에서 접근하는 흐름과 표시 내용(크레딧, 라이선스)을 상세히 기술한다. 그러나 PRD의 화면 목록(S-01~S-09)에는 스페셜 땡스가 포함되지 않는다.

**권장**: PRD 화면 목록에 S-10으로 스페셜 땡스를 추가.

---

### 2-3. README에서 tech-stack.md, mvp-scope.md, grace-period-polling-rate.md 누락

**심각도: 중간**

README의 설계 문서 목록과 문서 구조 트리에 다음 3개 문서가 누락되어 있다:
- `tech-stack.md` — 기술 스택
- `mvp-scope.md` — MVP 스코프
- `grace-period-polling-rate.md` — 유예 시간과 폴링 레이트

README는 "게임 설계 문서 (16개)"라고 기술하지만, 실제로는 19개 파일이 존재한다.

**권장**: README에 3개 문서를 추가하고 문서 수를 19개로 수정.

---

### 2-4. PRD에서 tech-stack.md, mvp-scope.md 미참조

**심각도: 낮음**

PRD의 관련 문서 섹션(§14)에 `tech-stack.md`와 `mvp-scope.md`가 나열되지 않는다. 이 두 문서는 PRD의 기술 요구사항(§10)과 제품 범위(§4)를 구체화하는 핵심 문서이므로 참조되어야 한다.

**권장**: PRD §14에 tech-stack.md와 mvp-scope.md를 추가.

---

### 2-5. README 파일명 오류

**심각도: 높음 (링크 깨짐)**

README.md(63행)가 `review-document-clarity.md`를 참조하지만, 이 파일은 review.md로 통합되어 더 이상 존재하지 않는다 (review.md 3행에서 통합 사실을 명시).

README.md(102행)의 문서 구조 트리에서도 `review-document-clarity.md`로 기술되어 있다.

**권장**: `review-document-clarity.md` → `review.md`로 수정.

---

### 2-6. overview.md 피스 테이블에 짧은 트릴(PP-001) 누락

**심각도: 낮음**

overview.md의 피스 요약 테이블(72~82행)에 8개 피스가 나열되지만, PP-001 "짧은 트릴"(PLv.1)이 빠져 있다. PRD의 피스 테이블(191~202행)에는 포함되어 있다.

**권장**: overview.md 피스 테이블에 짧은 트릴(PLv.1)을 추가.

---

### 2-7. chart-editor.md에 헤드 없는 롱노트 미반영

**심각도: 낮음 (구현 시 결정 가능)**

note-system.md(397~422행)에서 "헤드 없는 롱노트"를 정의하고 판정 규칙까지 기술하지만, chart-editor.md의 엔티티 목록과 편집 워크플로우에는 이에 대한 언급이 없다. 에디터에서 헤드 없는 롱노트를 어떻게 생성/편집하는지 정의되지 않았다.

**권장**: chart-editor.md에 헤드 없는 롱노트의 에디터 표현과 생성 방법을 추가.

---

### 2-8. AGENTS.md 미작성

**심각도: 낮음**

AGENTS.md가 빈 템플릿 상태이다. AI 에이전트 설정 파일로서 내용이 채워져야 한다.

---

## 3. 용어/표기 불일치

### 3-1. TGood vs Good◇

| 문서 | 표기 |
|------|------|
| `mvp-scope.md` (32행) | "TGood" |
| `prd.md`, `scoring.md`, `note-system.md`, `glossary.md`, 기타 전체 | "Good◇" |

mvp-scope.md만 "TGood"을 사용하며, 나머지 모든 문서는 "Good◇"으로 통일되어 있다.

**권장**: mvp-scope.md의 "TGood"을 "Good◇"으로 수정.

---

### 3-2. 릴리즈탭의 분류: 피스 vs 입력방식

| 문서 | 릴리즈탭의 분류 |
|------|-----------------|
| `prd.md` (§5.3 피스 테이블) | **피스** (PLv.4) |
| `overview.md` (피스 테이블) | **피스** (PLv.4) |
| `note-system.md` (§입력방식) | **입력방식** |
| `glossary.md` | **입력방식** |
| `piece-definition.md` | PP-004는 "릴리즈탭 → 트릴 연결"이며, 릴리즈탭 단독 PP 없음 |

PRD와 overview.md는 "릴리즈탭"을 독립 피스로 나열하지만, note-system.md와 glossary.md는 입력방식으로 분류한다. piece-definition.md에서는 PP-004가 "릴리즈탭 + 트릴 연결"이라는 복합 피스이며, 릴리즈탭 단독의 PP 번호가 없다.

**권장**: PRD와 overview.md에서 릴리즈탭을 피스가 아닌 입력방식으로 재분류하거나, PP-006에 릴리즈탭 단독 피스를 정의.

---

### 3-3. 피스명 불일치: overview.md vs piece-definition.md

| overview.md / PRD 피스명 | piece-definition.md PP 번호 및 명칭 |
|--------------------------|--------------------------------------|
| 릴리즈탭 | PP-004: 롱노트 끝 교대 → 트릴 연결 |
| 홀드 중 탭 | PP-003: 레인 내 분리 (홀드 + 탭 공존) |

이름이 달라 대응 관계를 파악하기 어렵다.

**권장**: overview.md/PRD의 피스명을 piece-definition.md의 정식 명칭과 일치시키거나, piece-definition.md에 별칭(alias)을 명시.

---

## 4. 이미 추적 중인 항목 (review.md)

review.md에서 이미 추적 중인 항목은 중복 기재하지 않으며 참조만 남긴다:

- **#12**: 색각 이상 유저 접근성 미고려
- **리서치 보완**: osu!mania, Arcaea/Phigros 독립 리서치 문서 미작성
- **#5~#11**: 난이도명, 판정명, 스코어링 실력 지표, 차트 가이드라인, 비주얼, 튜토리얼 결합 방식, 피스-PP 대응 등 미정 사항

---

## 5. 요약

### 우선순위 높음 (즉시 수정 권장)

| # | 유형 | 내용 | 관련 문서 |
|---|------|------|-----------|
| 1-1 | 모순 | 프로젝트 구조 `packages/` vs `apps/` | PRD, README, tech-stack, mvp-scope |
| 2-5 | 누락 | README 파일명 오류 (review-document-clarity.md → review.md) | README |
| 1-2 | 모순 | 키 수 "10키" vs "16키" | README |

### 우선순위 중간 (수정 권장)

| # | 유형 | 내용 | 관련 문서 |
|---|------|------|-----------|
| 1-3 | 모순 | 배치 제약 조건 "4종" vs "3가지" | README |
| 1-4 | 모순 | 입문 등급 노트 구성 불일치 | note-system, difficulty-design |
| 1-5 | 모순 | 트릴 구간 vs 트릴 롱노트 용어 혼용 | note-system, chart-editor, tech-stack |
| 2-1 | 누락 | PP-006 부재 | piece-definition |
| 2-3 | 누락 | README에서 3개 문서 누락 | README |
| 3-1 | 표기 | TGood vs Good◇ | mvp-scope |
| 3-2 | 표기 | 릴리즈탭의 분류 (피스 vs 입력방식) | PRD, overview, note-system, piece-definition |
| 3-3 | 표기 | 피스명 불일치 | overview, piece-definition |

### 우선순위 낮음 (구현 단계에서 해결 가능)

| # | 유형 | 내용 | 관련 문서 |
|---|------|------|-----------|
| 1-6 | 모순 | 차트 JSON 포맷과 에디터 데이터 모델 불일치 | tech-stack, chart-editor |
| 2-2 | 누락 | PRD에 스페셜 땡스 화면 누락 | PRD, game-core |
| 2-4 | 누락 | PRD에서 tech-stack, mvp-scope 미참조 | PRD |
| 2-6 | 누락 | overview.md 피스 테이블에 짧은 트릴 누락 | overview |
| 2-7 | 누락 | chart-editor.md에 헤드 없는 롱노트 미반영 | chart-editor, note-system |
| 2-8 | 누락 | AGENTS.md 미작성 | AGENTS.md |

---

## 관련 문서

- 기존 리뷰: `review.md`
- PRD: `../prd.md`
- README: `../../README.md`
