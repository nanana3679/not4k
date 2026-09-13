# Lab 미리보기 카탈로그

## 목적

개발용 시연을 날짜나 파일 위치로 기억하지 않고 `/lab`에서 이름과 역할로 다시 찾는다. 카탈로그와 각 시연은 로컬 개발 서버와 Lab 전용 GitHub Pages 정적 사이트에서 제공하며, 메인 게임의 프로덕션 번들에는 포함하지 않는다.

## 등록 규칙

`src/lab/labPreviewCatalog.ts`가 미리보기 목록의 단일 인터페이스다. 새 시연은 중복 없는 `id`, 표시 이름, 한 줄 설명, 분류, `/lab/` 경로를 등록한다. 대표 시연 하나에는 `featured`를 설정할 수 있다.

다른 에이전트가 새 에셋·렌더링·인터랙션 미리보기를 만들어 사용자에게 보여줄 때도 `/lab/<고유-id>`를 기준 경로로 사용한다. 등록 순서와 공개 공유 예외는 [Lab preview workflow](../agents/lab-previews.md)를 따른다.

카탈로그는 다음 분류를 사용한다.

- `Flight`: 난이도명과 비행 연출 비교
- `Rendering`: 배경·투영·오브젝트 렌더 실험
- `Interface`: 기어와 조절 UI 실험
- `Gameplay`: 판정과 튜토리얼 동작 실험

React 기반 시연은 `LabRoutes.tsx`에 라우트를 연결한다. 독립 서버가 필요한 대용량 시연은 구현과 자산을 원래 모듈에 유지하고, 로컬에서는 Vite 개발 서버 adapter를, 공개 사이트에서는 정적 export를 사용해 Lab 화면에 삽입한다. 이 seam 덕분에 Lab 카탈로그는 시연별 파일 제공 방식이나 서버 내부 경로를 알 필요가 없다.

## Flight Background Preview

`/lab/flight-background-preview`는 `/__lab/flight-background-preview/`에 마운트한 독립 공개 미리보기를 iframe으로 연다. Lab 복귀 링크만 바깥에 두며, iframe 안의 `LIFTOFF`, `INFILTRATION`, `BREAKTHROUGH` 탭과 고도 슬라이더는 공개 미리보기와 같은 소스를 사용한다.

정식 공개 진입점은 `https://nanana3679.github.io/not4k/lab/flight-background-preview/`다. Cloudflare Quick Tunnel은 브랜치가 `main`에 반영되기 전 임시 확인용으로만 사용한다.

## GitHub Pages 정적 배포

- `vite.lab.config.ts`가 `/not4k/` base를 사용하는 별도 산출물 `dist-lab`을 만든다.
- 각 카탈로그 항목에 `index.html`을 생성해 `/lab/<id>/` 직링크를 지원한다.
- Flight Background Preview는 서버 allowlist와 스타일 주입 결과를 정적 파일로 export한다.
- 개발 서버에서만 가능한 Perspective Surface Grid 프리셋 파일 저장은 공개 페이지에서 비활성화한다.
- `.github/workflows/deploy-lab-pages.yml`이 `main`의 Lab 관련 변경에만 반응해 Pages를 갱신한다.

## 검증

- `labPreviewCatalog.test.ts`: 7개 항목의 고유 `id`·경로와 대표 비행 미리보기 등록을 확인한다.
- `LabIndexPage.test.ts`: 카탈로그의 전체 링크와 대표 실행 링크를 확인한다.
- `FlightBackgroundPreviewLabPage.test.ts`: 개발 서버 iframe 경로와 Lab 복귀 링크를 확인한다.
- `e2e/lab/catalog.spec.ts`: `/lab`에서 비행 미리보기를 열어 세 장면 탭이 나타나는지, 390px에서 끝까지 스크롤해 마지막 시연을 여는지, 912px 태블릿 경계에서 목록이 넘치지 않는지 확인한다.
- 공개 미리보기 자체는 해당 시연 폴더의 Vitest와 Playwright 검사를 계속 사용한다.
- `pnpm run build:lab`: Pages base, 7개 직링크, 세 비행 장면, 서버 코드 제외를 정적 산출물에서 확인한다.
