# Lab preview workflow

## 기본 원칙

에셋, 렌더링, 인터랙션을 사용자에게 보여주기 위한 개발용 미리보기는 저장소의 `/lab` 카탈로그에서 찾을 수 있어야 한다. 날짜가 붙은 산출물 경로나 임시 포트만 전달하지 않는다.

- 사용자 확인 경로: `/lab/<고유-id>`
- 카탈로그 등록: `src/lab/labPreviewCatalog.ts`
- 이미지 HTML 등록: `src/lab/labImageGalleryCatalog.ts`
- React 라우팅: `src/lab/LabRoutes.tsx`
- 카탈로그 홈: `/lab`
- 메인 프로덕션 빌드: Lab 코드와 `public/lab` 자산을 포함하지 않는다.
- 공개 정적 빌드: `pnpm run build:lab`으로 Lab만 `dist-lab`에 생성한다.

## 새 미리보기 추가

1. 기존 미리보기와 성격이 겹치는지 `/lab` 카탈로그에서 먼저 확인한다.
2. React 기반 시연은 `src/lab/` 아래에 페이지와 같은 디렉토리의 `*.test.ts`를 만든다.
3. `labPreviewCatalog.ts`에 고유 `id`, 이름, 한 줄 설명, 분류, `/lab/<id>` 경로를 등록한다.
4. `LabRoutes.tsx`에 같은 경로를 연결한다.
5. 등록 정보, 화면 렌더링, 사용자가 카탈로그에서 미리보기를 열고 돌아오는 흐름을 테스트한다.
6. 사용자에게 보여줄 때 `/lab/<id>`를 기준 경로로 안내한다.

독립 HTML/WebGL 서버나 대용량 자산 경로가 필요한 시연은 원래 구현을 억지로 React로 옮기지 않는다. 개발 서버 adapter를 두고 `/lab/<id>`에서 iframe으로 같은 실행 모듈을 연다. 카탈로그에는 실행 방식이 아니라 사용자가 이해할 이름과 목적만 노출한다.

## 이미지 HTML 컬렉션 추가

이미지 생성 작업에서 이미 비교용 HTML 페이지를 만들었다면 별도의 React 갤러리를 다시 만들지 않는다. HTML 페이지 하나를 컬렉션 하나로 취급해 Lab의 `IMAGE GALLERIES` 그룹에 등록한다.

1. 공개할 HTML과 그 HTML이 상대 경로로 참조하는 이미지만 `lab/image-galleries/<고유-id>/`에 둔다. 진입 파일명은 `index.html`로 통일한다.
2. `labImageGalleryCatalog.ts`에 `id`, 이름, 한 줄 설명, 생성일을 한 번 등록한다. 공개 경로 `/lab/images/<고유-id>/`와 정적 소스 폴더는 `id`에서 자동으로 결정된다.
3. 생성 원본 전체, 프롬프트, 중간 검사 JSON, 선택하지 않은 이미지는 컬렉션 폴더에 복사하지 않는다.
4. 모바일에서 캡션을 읽을 수 있도록 viewport와 좁은 화면 레이아웃을 포함하고, 큰 원본이 여러 장이면 첫 화면 밖 이미지는 실제 노출 시점까지 로드를 미룬다.
5. `pnpm run build:lab` 후 `dist-lab/lab/images/<고유-id>/index.html`과 HTML의 모든 상대 이미지가 생성되는지 확인한다.
6. 사용자에게는 `https://nanana3679.github.io/not4k/lab/`의 `IMAGE GALLERIES` 항목 또는 해당 `/lab/images/<고유-id>/` URL을 안내한다.

이미지를 한 장 추가할 때마다 카탈로그 항목을 만들지 않는다. 새 HTML 비교 페이지를 만든 시점에만 컬렉션 하나를 등록한다. 등록되지 않은 `lab/image-galleries/` 폴더는 정적 배포물에 복사되지 않는다.

## 공개 공유

기본 공개 주소는 `https://nanana3679.github.io/not4k/lab/`이다. `main`에 Lab 관련 변경이 들어오면 `.github/workflows/deploy-lab-pages.yml`이 Lab 전용 정적 빌드를 GitHub Pages에 배포한다.

- 정적 빌드 명령: `pnpm run build:lab`
- GitHub Pages의 저장소 하위 경로를 지원하도록 에셋 URL은 `withLabPublicBase`를 사용한다.
- 새 페이지를 `labPreviewCatalog.ts`에 등록하면 정적 빌드가 `/lab/<id>/index.html`도 생성해 직링크를 지원한다.
- 새 이미지 HTML 페이지를 `labImageGalleryCatalog.ts`에 등록하면 해당 번들만 `/lab/images/<id>/`로 복사한다.
- Node API, 로컬 파일 쓰기, 개발 미들웨어에 의존하는 기능은 공개 빌드에서 비활성화하거나 정적 파일로 export해야 한다.
- Flight Background Preview는 서버의 파일 allowlist를 재사용해 정적 파일만 export하며 `preview-server.mjs` 자체는 배포하지 않는다.

긴급한 임시 공유가 필요해도 Vite 개발 서버 전체를 터널링하지 않는다. 필요한 파일만 허용하는 독립 서버 또는 위 정적 배포를 사용한다. 공개 실행본을 만들더라도 같은 시연을 `/lab/<id>`에 등록해 저장소 안의 기준 진입점을 유지한다.

## 분류

- `Flight`: 난이도명과 비행 연출
- `Rendering`: 배경·투영·오브젝트 렌더링
- `Interface`: 기어·HUD·조절 UI
- `Gameplay`: 판정·튜토리얼·플레이 흐름

새 분류는 기존 네 분류로 의미가 전달되지 않을 때만 추가한다.
