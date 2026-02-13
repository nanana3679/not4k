# not4k — 문서 교차 검토 결과

> 28개 문서(설계 19개 + 리서치 6개 + PRD + README + AGENTS.md)를 교차 검토하여 발견한 모순, 누락, 불일치 사항을 정리한다.

---

## 해결 완료

이번 리뷰에서 발견하고 즉시 수정한 항목:

| 항목 | 수정 내용 | 수정된 문서 |
|------|-----------|-------------|
| README 파일명 오류 | `review-document-clarity.md` → `review.md` | README.md |
| README 누락 문서 | tech-stack.md, mvp-scope.md, grace-period-polling-rate.md 추가, 문서 수 16→19 | README.md |
| README 배치 제약 조건 | "4종" → "3종", "롱노트 시작점" 삭제 (이미 삭제된 제약의 미반영) | README.md |
| PRD 스페셜 땡스 | S-10 스페셜 땡스 추가, 상태 흐름에 `타이틀 → 스페셜 땡스 → 타이틀` 추가 | prd.md |
| TGood 표기 | "TGood" → "Good◇" 통일 | mvp-scope.md |

---

## 1. 미해결 모순 (Contradictions)

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

### 1-2. 입문 등급(Lv.1~3) 노트 구성 불일치

**심각도: 중간**

입문 등급에는 가장 단순한 개별 노트 타입만 등장해야 한다. 입력방식(홀드 이어잡기, 홀드 중 탭 등)은 입문에서 등장하지 않는다.

| 문서 | 입문 등급 기술 | 문제 |
|------|---------------|------|
| `note-system.md` (노트 타입의 등장 원칙) | "싱글 90%↑ / 트릴·더블·**홀드 이어잡기·홀드 중 탭** 극소량으로 존재를 인지" | **홀드 이어잡기·홀드 중 탭은 입력방식이며, 입문에서 등장하지 않아야 함** |
| `difficulty-design.md` (입문 §) | "싱글 90%↑ / 트릴·더블 극소량 등장" | 올바름 |
| `difficulty-design.md` (설계 원칙 4) | "트릴·더블·**홀드 중 탭**이 극소량 등장" | **홀드 중 탭은 입문에서 등장하지 않아야 함** |

**권장**: note-system.md의 입문 기술에서 "홀드 이어잡기·홀드 중 탭"을 제거. difficulty-design.md 설계 원칙 4에서도 "홀드 중 탭"을 제거.

---

### 1-3. 차트 JSON 포맷과 에디터 데이터 모델 불일치

**심각도: 낮음 (구현 시 결정 가능)**

tech-stack.md의 차트 JSON 예시에서 사용하는 엔티티 타입이 chart-editor.md의 엔티티 목록과 일치하지 않는다.

| tech-stack.md JSON 타입 | chart-editor.md 대응 엔티티 | 불일치 |
|------------------------|-----------------------------|--------|
| `"single"` | 싱글 노트 | 일치 |
| `"double"` | 더블 노트 | 일치 |
| `"trill"` | 트릴 노트 | 일치 |
| `"longStart"` (endBeat 포함) | 싱글 롱노트 바디 시작 + 바디 끝 | **불일치**: JSON은 단일 엔티티에 endBeat를 포함하지만, chart-editor.md는 시작/끝 쌍 |
| `"trillZoneStart"` (endBeat 포함) | 트릴 롱노트 바디 시작 + 바디 끝 | **불일치**: 구조(단일 vs 쌍) |
| — | 더블 롱노트 바디 시작/끝 | **누락**: JSON 예시에 더블 롱노트 없음 |

참고: `trillZoneStart`는 트릴 구간(트릴 노트/롱노트가 존재할 수 있는 영역)을 나타내며, 트릴 롱노트(트릴 노트가 헤드가 되어 바디를 가지는 형태)와는 완전히 다른 개념이다. chart-editor.md에서 "트릴 롱노트 바디"라는 이름으로 트릴 구간을 표현하고 있어, 이름만으로는 두 개념을 혼동하기 쉽다.

**권장**: tech-stack.md의 JSON 예시를 chart-editor.md의 데이터 모델(쌍 구조)에 맞춰 수정. 트릴 구간 엔티티의 이름을 `trillZone`으로 통일하여 트릴 롱노트와 명확히 구분.

---

## 2. 미해결 누락 (Missing Content)

### 2-1. PP-006 부재

**심각도: 중간**

piece-definition.md의 피스 카탈로그에서 PP-006이 누락되어 있다. PP-005(싱글→더블 전환)에서 PP-007(가변 분할)로 건너뛴다. PRD는 "PP-001~PP-010"이라고 기술하므로 10개가 정의되어야 하지만 9개만 존재한다.

**권장**: PP-006을 정의하거나, 의도적 결번이면 그 이유를 piece-definition.md에 명시.

---

### 2-2. PRD에서 tech-stack.md, mvp-scope.md 미참조

**심각도: 낮음**

PRD의 관련 문서 섹션(§14)에 `tech-stack.md`와 `mvp-scope.md`가 나열되지 않는다. 이 두 문서는 PRD의 기술 요구사항(§10)과 제품 범위(§4)를 구체화하는 핵심 문서이므로 참조되어야 한다.

**권장**: PRD §14에 tech-stack.md와 mvp-scope.md를 추가.

---

### 2-3. overview.md 피스 테이블에 짧은 트릴(PP-001) 누락

**심각도: 낮음**

overview.md의 피스 요약 테이블(72~82행)에 8개 피스가 나열되지만, PP-001 "짧은 트릴"(PLv.1)이 빠져 있다. PRD의 피스 테이블(191~202행)에는 포함되어 있다.

**권장**: overview.md 피스 테이블에 짧은 트릴(PLv.1)을 추가.

---

### 2-4. chart-editor.md에 헤드 없는 롱노트 미반영

**심각도: 낮음 (구현 시 결정 가능)**

note-system.md(397~422행)에서 "헤드 없는 롱노트"를 정의하고 판정 규칙까지 기술하지만, chart-editor.md의 엔티티 목록과 편집 워크플로우에는 이에 대한 언급이 없다. 에디터에서 헤드 없는 롱노트를 어떻게 생성/편집하는지 정의되지 않았다.

**권장**: chart-editor.md에 헤드 없는 롱노트의 에디터 표현과 생성 방법을 추가.

---

### 2-5. AGENTS.md 미작성

**심각도: 낮음**

AGENTS.md가 빈 템플릿 상태이다. AI 에이전트 설정 파일로서 내용이 채워져야 한다.

---

## 3. 미해결 용어/표기 불일치

### 3-1. 릴리즈탭: 입력방식이자 피스 — 혼동 방지 필요

릴리즈탭은 **입력방식이면서 동시에 피스**이다. 그러나 현재 문서에서 이 이중 성격이 명시되지 않아 혼동이 발생한다.

| 문서 | 릴리즈탭의 취급 |
|------|-----------------|
| `note-system.md` (§입력방식) | 입력방식으로 메커니즘 설명 |
| `glossary.md` | 입력방식으로 정의 |
| `prd.md` (§5.3 피스 테이블) | 피스(PLv.4)로 나열 |
| `overview.md` (피스 테이블) | 피스(PLv.4)로 나열 |
| `piece-definition.md` | PP-004 "롱노트 끝 교대에서 트릴로"에 포함 — 릴리즈탭 단독 PP 없음 |

문제:
- 릴리즈탭이 입력방식과 피스 양쪽에서 같은 이름으로 등장하지만, 문맥에 따라 어느 쪽인지 불명확
- PP-004의 정식 명칭("롱노트 끝 교대에서 트릴로")은 릴리즈탭 + 트릴 연결의 복합이므로, 릴리즈탭 단독 피스에 대한 PP가 없음

**권장**: 릴리즈탭이 입력방식이자 피스임을 glossary.md 또는 note-system.md에 명시. 단독 피스로서의 릴리즈탭에 PP 번호를 부여(PP-006 후보)하거나, PRD/overview의 피스 테이블에서 "(입력방식 겸 피스)" 등의 주석을 추가.

---

### 3-2. 피스명 불일치: PRD/overview vs piece-definition.md

아래 2건의 피스에서 문서 간 이름이 다르다:

| PRD / overview.md 피스명 | piece-definition.md (PP 번호 + 정식 명칭) | chart-design.md 명칭 | 불일치 유형 |
|--------------------------|-------------------------------------------|----------------------|-------------|
| **홀드 중 탭** | PP-003: **레인 내 분리** (홀드 + 탭 공존) | **레인 내 분리** (홀드 + 탭) | PRD/overview가 입력방식 이름으로 피스를 지칭 |
| **릴리즈탭** | PP-004: **롱노트 끝 교대에서 트릴로** | (미언급) | PRD/overview가 입력방식 이름으로 복합 피스를 지칭. 범위도 다름 |

나머지 피스(짧은 트릴, 앵커, 싱글→더블 전환, 가변 분할, 비트 복합 트릴, 건너가기, 홀드 트릴)은 문서 간 이름이 일치한다.

**권장**: piece-definition.md에 별칭(alias)을 추가하거나, PRD/overview에서 정식 명칭을 사용하고 괄호 안에 입력방식명을 부기.

---

## 4. 이미 추적 중인 항목 (review.md)

review.md에서 이미 추적 중인 항목은 중복 기재하지 않으며 참조만 남긴다:

- **#12**: 색각 이상 유저 접근성 미고려
- **리서치 보완**: osu!mania, Arcaea/Phigros 독립 리서치 문서 미작성
- **#5~#11**: 난이도명, 판정명, 스코어링 실력 지표, 차트 가이드라인, 비주얼, 튜토리얼 결합 방식, 피스-PP 대응 등 미정 사항

---

## 5. 요약

### 미해결 — 우선순위 높음

| # | 유형 | 내용 | 관련 문서 |
|---|------|------|-----------|
| 1-1 | 모순 | 프로젝트 구조 `packages/` vs `apps/` | PRD, README, tech-stack, mvp-scope |

### 미해결 — 우선순위 중간

| # | 유형 | 내용 | 관련 문서 |
|---|------|------|-----------|
| 1-2 | 모순 | 입문 등급 노트 구성 — note-system.md에 홀드 이어잡기·홀드 중 탭 잔존 | note-system, difficulty-design |
| 2-1 | 누락 | PP-006 부재 | piece-definition |
| 3-1 | 표기 | 릴리즈탭의 이중 성격(입력방식 + 피스) 미명시 | glossary, note-system, PRD, overview, piece-definition |
| 3-2 | 표기 | 피스명 불일치 (홀드 중 탭 vs 레인 내 분리, 릴리즈탭 vs 롱노트 끝 교대에서 트릴로) | PRD, overview, piece-definition |

### 미해결 — 우선순위 낮음

| # | 유형 | 내용 | 관련 문서 |
|---|------|------|-----------|
| 1-3 | 모순 | 차트 JSON 포맷과 에디터 데이터 모델 불일치 | tech-stack, chart-editor |
| 2-2 | 누락 | PRD에서 tech-stack, mvp-scope 미참조 | PRD |
| 2-3 | 누락 | overview.md 피스 테이블에 짧은 트릴 누락 | overview |
| 2-4 | 누락 | chart-editor.md에 헤드 없는 롱노트 미반영 | chart-editor, note-system |
| 2-5 | 누락 | AGENTS.md 미작성 | AGENTS.md |

---

## 관련 문서

- 기존 리뷰: `review.md`
- PRD: `../prd.md`
- README: `../../README.md`
