# not4k — 문서 교차 검토 결과

> 28개 문서(설계 19개 + 리서치 6개 + PRD + README + AGENTS.md)를 교차 검토하여 발견한 모순, 누락, 불일치 사항을 정리한다.

> 검토 당시의 문서 수·피스 개수와 미해결 판정을 포함한 기록이다. 현행 정의와 결정은 glossary와 PRD §12를 따른다. 2026-10-29 구 홀드 트릴(`PP-010`)은 롱노트 중 탭(`PP-003`)으로 통합했다([RFD 0079](../rfd/0079-merge-hold-trill-into-mid-tap.md)).

---

## 해결 완료

이번 리뷰에서 발견하고 즉시 수정한 항목:

| 항목 | 수정 내용 | 수정된 문서 |
|------|-----------|-------------|
| README 파일명 오류 | `review-document-clarity.md` → `review.md` | README.md |
| README 누락 문서 | tech-stack.md, mvp-scope.md, grace-period-polling-rate.md 추가, 문서 수 16→19 | README.md |
| README 배치 제약 조건 | "4종" → "3종", "롱노트 시작점" 삭제 (이미 삭제된 제약의 미반영) | README.md |
| PRD 스페셜 땡스 | S-10 스페셜 땡스 추가, 상태 흐름에 `타이틀 → 스페셜 땡스 → 타이틀` 추가 | prd.md |
| TGood 표기 | "TGood" → "`goodTrill`" 통일 | mvp-scope.md |
| PRD 관련 문서 누락 | §14에 tech-stack.md, mvp-scope.md 추가 | prd.md |
| 차트 JSON/에디터 통일 | JSON 타입명을 chart-editor.md 엔티티와 1:1 대응, `trillZone` 엔티티 추가, 메타데이터 필드 통일 | tech-stack.md, chart-editor.md |

---

## 1. 미해결 모순 (Contradictions)

### 1-1. 프로젝트 구조 불일치 — **해결 완료**

모노레포(`apps/web/` + `packages/shared/`)에서 단일 패키지(`src/`)로 전환하면서 모든 문서를 통일했다. 현재 구조: `src/{game,editor,supabase,shared}`. PRD, tech-stack.md, mvp-scope.md 모두 동일한 경로를 참조한다.

---

### 1-2. 입문 등급(Lv.1～3) 노트 구성 불일치 — **해결 완료**

2026-10-28 채택 기준으로 정리했다. 당시 권고했던 입문 입력방식의 일괄 제외는 적용하지 않는다. PLv.는 본격 활용의 기준이며, 충분히 느리고 단순한 짧은 체험은 더 낮은 레벨에서도 허용한다([RFD 0046](../rfd/0046-piece-levels-and-early-exposure.md)). 입문 트릴·더블도 실제 부담이 낮으면 외측 레인에서 허용한다([RFD 0057](../rfd/0057-beginner-trill-double-on-outer-lanes.md)).

싱글 중심 구성의 90%는 필수 비율이 아닌 참고치다([RFD 0059](../rfd/0059-beginner-single-ratio-as-reference.md)). 모든 타입을 각 차트에 넣을 필요는 없으며, 실제 독해·연주 부담이 차트 수준에 맞는지 확인한다. 현행 지침은 [난이도 설계](../spec/difficulty-design.md#입문-lv13)를 따른다.

---

## 2. 미해결 누락 (Missing Content)

### 2-1. PP-006 부재

**심각도: 중간**

piece-definition.md의 피스 카탈로그에서 PP-006이 누락되어 있다. PP-005(싱글→더블 전환)에서 PP-007(가변 분할)로 건너뛴다. PRD는 "PP-001～PP-010"이라고 기술하므로 10개가 정의되어야 하지만 9개만 존재한다.

**권장**: PP-006을 정의하거나, 의도적 결번이면 그 이유를 piece-definition.md에 명시.

---

### 2-2. overview.md 피스 테이블에 짧은 트릴(PP-001) 누락

**심각도: 낮음**

overview.md의 피스 요약 테이블(72～82행)에 8개 피스가 나열되지만, PP-001 "짧은 트릴"(PLv.1)이 빠져 있다. PRD의 피스 테이블(191～202행)에는 포함되어 있다.

**권장**: overview.md 피스 테이블에 짧은 트릴(PLv.1)을 추가.

---

### 2-3. chart-editor.md에 헤드 없는 롱노트 미반영

**심각도: 낮음 (구현 시 결정 가능)**

note-system.md(397～422행)에서 "헤드 없는 롱노트"를 정의하고 판정 규칙까지 기술한다. 헤드 없는 롱노트란 롱노트 시작 지점에 일반 노트(싱글/트릴/더블)가 겹쳐져 있지 않은 롱노트를 의미한다. chart-editor.md의 엔티티 목록과 편집 워크플로우에는 이에 대한 언급이 없다. 에디터에서 헤드 없는 롱노트를 어떻게 생성/편집하는지 정의되지 않았다.

**권장**: chart-editor.md에 헤드 없는 롱노트의 에디터 표현과 생성 방법을 추가.

---

### 2-4. AGENTS.md 미작성

**심각도: 낮음**

AGENTS.md가 빈 템플릿 상태이다. AI 에이전트 설정 파일로서 내용이 채워져야 한다.

---

## 3. 미해결 용어/표기 불일치

### 3-1. 입력방식과 피스 명칭 혼동 — **해결 완료**

2026-10-29 [RFD 0077](../rfd/0077-long-note-end-tap-piece-name.md)에 따라 입력방식명은 릴리즈탭, 피스 `PP-004`의 이름은 롱노트 끝 탭으로 구분했다. 카탈로그의 제목·본문 이름, glossary, PRD, overview와 난이도 설명을 맞췄다. 릴리즈탭을 피스명으로도 쓰거나 별도 PP 번호를 추가하자는 당시 권고는 적용하지 않는다.

---

### 3-2. 피스명 불일치 — **해결 완료**

2026-10-29 [RFD 0077](../rfd/0077-long-note-end-tap-piece-name.md)과 [RFD 0078](../rfd/0078-long-note-mid-tap-piece-name.md)에 따라 `PP-004`는 롱노트 끝 탭, `PP-003`은 롱노트 중 탭으로 통일했다. 입력방식명인 릴리즈탭·홀드 중 탭·홀드 교대는 별도로 유지한다.

---

## 4. 이미 추적 중인 항목 (review.md)

review.md에서 이미 추적 중인 항목은 중복 기재하지 않으며 참조만 남긴다:

- **#12**: 색각 이상 유저 접근성 미고려
- **리서치 보완**: osu!mania, Arcaea/Phigros 독립 리서치 문서 미작성
- **#5～#11**: 난이도명, 판정명, 스코어링 실력 지표, 차트 가이드라인, 비주얼, 튜토리얼 결합 방식, 피스-PP 대응 등 미정 사항

---

## 5. 요약

### 미해결 — 우선순위 높음

(해결 완료 — 해당 없음)

### 미해결 — 우선순위 중간

| # | 유형 | 내용 | 관련 문서 |
|---|------|------|-----------|
| 1-2 | 모순 | 입문 등급 노트 구성 — note-system.md에 홀드 교대·홀드 중 탭 잔존 | note-system, difficulty-design |
| 2-1 | 누락 | PP-006 부재 | piece-definition |

### 미해결 — 우선순위 낮음

| # | 유형 | 내용 | 관련 문서 |
|---|------|------|-----------|
| 2-2 | 누락 | overview.md 피스 테이블에 짧은 트릴 누락 | overview |
| 2-3 | 누락 | chart-editor.md에 헤드 없는 롱노트 미반영 | chart-editor, note-system |
| 2-4 | 누락 | AGENTS.md 미작성 | AGENTS.md |

---

## 관련 문서

- 기존 리뷰: `review.md`
- PRD: `../prd.md`
- README: `../../README.md`
