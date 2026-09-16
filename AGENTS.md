# Project Guidelines

이 파일은 이 저장소에서 작업하는 AI agent가 따라야 할 공통 규칙이다. `CLAUDE.md`는 `@AGENTS.md`만 참조하며, 실제 지침은 이 파일에서 관리한다.

## 작업 수행 원칙

- 변경 요청은 구현, 관련 테스트·문서 갱신, 적절한 검증까지 완료한다. 안전하게 수행할 작업이 남아 있으면 첫 구현만 제시하고 멈추지 않는다
- 요청 범위 안의 읽기, 로컬 파일 수정, 관련 테스트·검증은 별도 승인을 기다리지 않고 진행한다
- 문서로 확정되지 않은 제품 결정이 결과를 크게 바꾸거나, 사용자 요청으로 승인되지 않은 배포·병합·외부 쓰기·데이터 삭제·파괴적 Git 작업이 필요하면 사용자에게 결정을 요청한다
- 사용자가 명시한 범위와 결과는 선택적인 skill 절차보다 우선한다. 저장소의 필수 불변식과 승인 경계는 유지한다

## 테스트 규칙

- 동작을 추가·변경하거나 버그를 수정할 때 회귀 위험을 검증하는 단위 테스트를 작성하거나 수정할 것
- 문서·문구·시각 스타일만 바꾸고 동작에 영향이 없으면 새 단위 테스트를 요구하지 않는다
- 테스트 프레임워크는 Vitest이다. 전체 단위 테스트는 `pnpm test`, 대상 테스트는 `pnpm exec vitest run <path>`로 실행한다
- 테스트 파일은 소스 파일과 같은 디렉토리에 `*.test.ts` 패턴으로 둔다
- 관련 테스트를 먼저 실행한다. 공유 모델이나 여러 모듈에 걸친 변경, 빌드·테스트 기반 변경, 출시 준비에서는 전체 단위 테스트를 실행한다
- 요청한 변경 때문에 실패한 테스트는 수정하고 다시 실행한다. 무관한 기존 실패는 작업 범위를 넓혀 수정하지 말고 결과에 명시한다

### 테스트명 작성 규칙

테스트명은 구체적인 동작 문서를 대신해야 한다. 코드를 읽지 않아도 테스트명만으로 기능의 동작을 이해할 수 있게 작성할 것.

- **[상황] + [행동] + [결과]** 패턴으로 작성
  - 좋은 예: `"120 BPM에서 1박 = 500ms"`, `"Miss 있으면 Full Combo 아님"`, `"음원 길이를 초과하는 위치로 이동 가능"`
  - 나쁜 예: `"테스트1"`, `"beatToMs 작동"`, `"에러 처리"`
- 구체적인 입력값과 기대값을 테스트명에 포함할 것
  - 좋은 예: `"99.5% → SSS"`, `"snap=4에서 중간값은 가까운 박으로 스냅"`
  - 나쁜 예: `"랭크 계산"`, `"스냅 동작"`
- 경계값/에지케이스는 조건을 명시할 것
  - 좋은 예: `"빈 마커 배열이면 에러"`, `"노트 0개일 때 달성률 0%"`
- 한국어로 작성하되, 코드 식별자는 원문 그대로 사용

## 커밋 메시지 규칙

커밋할 때는 `<type>: <한국어 설명>` 형식을 반드시 따를 것.

### Type 목록

| type | 용도 |
| --- | --- |
| `feat` | 새 기능 추가 |
| `fix` | 버그 수정 |
| `refactor` | 동작 변경 없는 코드 구조 개선 |
| `docs` | 문서만 변경 |
| `test` | 테스트 추가/수정 |
| `chore` | 빌드, 설정, 의존성 등 기타 변경 |
| `perf` | 성능 개선 |
| `style` | 포맷팅, CSS 등 시각적 변경 |

### 작성 규칙

- type 뒤에 콜론과 공백 하나를 붙이고 한국어 설명 작성: `feat: 복사/붙여넣기 기능 구현`
- 설명은 간결하게, 무엇을 했는지 한 문장으로 작성
- 부연이 필요하면 `-` 뒤에 추가: `fix: 롱노트 히트테스트 수정 - 범위 노트에 tolerance 적용`
- 여러 type에 걸치는 변경이면 핵심 변경의 type을 사용

## 용어 규칙

- **용어 정의의 권위는 `docs/context/glossary.md`이다.** 풀 정의·세부 규칙·배경 링크는 glossary에 둔다
- **용어 표기 언어는 출처 기반으로 정한다(RFD 0010):** 프로젝트가 발명한 구성물(코드 식별자가 있는 것)은 영어 코드 식별자(`백틱`)로, 원래 있는 개념은 established 이름(자연스러우면 한국어, 커뮤니티 표준이 영어면 영어)으로 표기한다. prose(서술)는 한국어를 유지한다. 용어별 분류는 `docs/context/term-map.md`를 따른다
- 루트 및 모듈 `CONTEXT.md`에는 한두 줄 요약 정의만 두고, 세부는 glossary 또는 관련 RFD 링크로 연결할 것
- 새로운 공식 도메인 개념이나 사용자에게 노출되는 용어를 도입할 때는 glossary에 먼저 정의하고 관련 `CONTEXT.md`에 요약을 동기화할 것
- 공식 도메인 용어의 의미가 바뀌면 glossary를 먼저 갱신하고, 같은 용어를 요약한 `CONTEXT.md`들을 함께 동기화할 것

## 문서 업데이트 규칙

코드 변경 시 해당 스코프의 기존 문서가 영향을 받으면 함께 수정할 것.

- `docs/spec/`: 사용자에게 보이는 기능이나 도메인 동작을 추가·변경할 때 관련 스펙을 업데이트한다
- `e2e/`: UI 동작이나 사용자 플로우가 바뀌면 관련 E2E 스펙을 업데이트한다
- 문서가 없는 새로운 사용자 동작이나 도메인 규칙을 추가할 때는 기존 컨벤션에 맞춰 스펙을 만든다. 내부 리팩터링이나 개발 도구는 기존 계약을 바꾸지 않는 한 새 스펙을 요구하지 않는다
- 변경사항과 무관한 문서는 건드리지 않을 것

## 결정 기록 규칙

기존 `CONTEXT.md`, `docs/context/`, `docs/spec/`, `docs/prd.md`의 결정과 충돌하거나 플레이 철학, 도메인 용어, 게임 플로우, 기록·랭킹·실패 조건처럼 되돌리기 어려운 제품 결정을 바꿀 때는 먼저 `docs/rfd/`에 RFD를 작성할 것.

- 단순 구현 세부사항이나 되돌리기 쉬운 변경은 RFD를 만들지 않는다
- 결정 문서의 정식 명칭은 **RFD**로 통일한다. 파일 제목과 본문에서 RFC, ADR을 사용하지 않는다
- RFD 작성과 구현 진척 기록은 `docs/agents/rfd.md`를 따른다
- 미정·미결정 사항은 `docs/prd.md`의 "미정 사항" 섹션에서 단일 관리한다. 다른 문서에 추적 표를 중복하지 말고 PRD를 링크한다

## Deploy Configuration (configured by /setup-deploy)

- Platform: GitHub Pages (Lab 전용, 기존 앱 배포와 분리)
- Production URL: https://nanana3679.github.io/not4k/lab/
- Deploy workflow: `.github/workflows/deploy-lab-pages.yml`
- Deploy status command: `gh run list --workflow deploy-lab-pages.yml --limit 1`
- Merge method: squash
- Project type: static Lab preview site
- Post-deploy health check: `https://nanana3679.github.io/not4k/lab/`

### Custom deploy hooks

- Pre-merge: `pnpm run build:lab`
- Deploy trigger: `main`의 Lab 관련 경로 변경 또는 수동 `workflow_dispatch`
- Deploy status: `gh run watch $(gh run list --workflow deploy-lab-pages.yml --limit 1 --json databaseId --jq '.[0].databaseId')`
- Health check: `curl -fsS https://nanana3679.github.io/not4k/lab/`

## Agent workflows

### Issue tracker

이슈나 GitHub Issues 기반 PRD를 조회·생성·수정할 때는 저장소 루트에서 `gh` CLI를 사용하고 `docs/agents/issue-tracker.md`를 따른다.

### Triage labels

이슈 triage 작업에서는 `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`를 사용한다. 매핑과 의미는 `docs/agents/triage-labels.md`를 따른다.

### Domain docs

- 도메인 동작·용어·데이터 모델을 다룰 때 `CONTEXT-MAP.md`에서 작업 영역을 찾고, 루트 `CONTEXT.md`와 관련 모듈 `CONTEXT.md`를 읽는다
- 특정 용어는 `docs/context/glossary.md`의 해당 항목을 검색하고, 기존 제품 결정에 영향을 주는 경우에만 관련 RFD를 읽는다
- 문구·시각 스타일·격리된 빌드 설정처럼 도메인과 무관한 변경에는 도메인 문서 열람을 선행 조건으로 요구하지 않는다
- 자세한 탐색 방법은 `docs/agents/domain.md`를 참고한다

### Lab previews

에셋·렌더링·인터랙션을 사용자에게 확인받기 위한 개발용 미리보기는 `/lab/<고유-id>`를 기본 경로로 사용하고 `/lab` 카탈로그에 등록한다. 기존 미리보기와 새 미리보기의 등록·라우팅·검증 규칙은 `docs/agents/lab-previews.md`를 따른다.

이미지 생성 결과를 독립 HTML 비교 페이지로 만든 경우 개별 이미지를 다시 등록하지 않는다. 완성된 HTML 번들을 `lab/image-galleries/<고유-id>/`에 두고 `src/lab/labImageGalleryCatalog.ts`에 컬렉션 하나만 등록해 `/lab/images/<고유-id>/`로 공개한다.
