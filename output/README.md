# 비행 연출 시연과 미술 탐색 기록

현재 검수 대상은 [세 난이도 공개 배경 미리보기](prototypes/flight-background-preview-20260913/NOTES.md)다. `LIFTOFF`·`INFILTRATION`·`BREAKTHROUGH`를 한 페이지에서 전환하며 장면별 고도만 조절한다. 돌파 실행 원본은 [돌파 광원 + A~H 건축 시연](prototypes/breakthrough-hangar-integration-20260910/NOTES.md)을 재사용한다. 두 시연 모두 게임 본편과 독립되어 있다.

## 저장 범위

- 현재 시연의 HTML·CSS·모듈·단위 테스트·브라우저 검사 코드, 이륙·침투의 하늘·지표면 PNG와 SHA-256 기록을 저장한다.
- 돌파 시연의 실행 코드, 원본 보존용 SHA-256 명세, Three.js와 라이선스를 저장하며 공개 비교에서 같은 파일을 직접 재사용한다.
- 실행에 필요한 장갑판·창문·문·외벽·밑면·먼 건축 배경 PNG 여섯 장과 생성 프롬프트·출처 명세를 저장한다.
- 이전 이미지 탐색과 개별 시연은 README·NOTES의 설명 기록을 보존한다. 이전 PNG·실행 코드·검사 결과는 로컬 원본과 백업에 보관하며 이 브랜치에는 포함하지 않는다.
- 접속 토큰을 담은 `preview-state.json`, 서버 로그, 재생성 가능한 검사 PNG·JSON은 Git에서 제외한다.

이전 기록의 파일 경로는 당시 자료의 위치다. 이 체크아웃에 없는 자료는 클릭 링크 대신 `로컬 보관`으로 표시했다. 과거 설명의 실행 명령은 자료를 복원한 뒤 사용할 수 있다. `source-manifest.json`의 절대 경로는 출처 기록이며 실행이나 테스트가 그 경로를 읽지는 않는다.

## 새 체크아웃에서 실행

저장소 루트에서 `pnpm install --frozen-lockfile`로 개발 의존성을 설치한다. 시연은 저장한 Three.js 파일을 사용하며 별도 CDN이 필요 없다.

```sh
cd output/prototypes/flight-background-preview-20260913
npm test
npm start
PREVIEW_URL=http://127.0.0.1:<출력된 포트>/ npm run check:browser
```

인터넷 임시 공개가 필요하면 출력된 로컬 주소에 `cloudflared tunnel --url`을 연결한다. 지속적으로 공유할 Lab 기준 주소는 `https://nanana3679.github.io/not4k/lab/`이며, 저장소 루트의 `pnpm run build:lab`과 GitHub Pages 워크플로가 정적 공개본을 만든다. 상세 명령과 고정 기본값은 [공개 미리보기 기록](prototypes/flight-background-preview-20260913/NOTES.md)을 따른다.

돌파 단독 시연은 기존 명령으로 계속 실행할 수 있다.

```sh
cd output/prototypes/breakthrough-hangar-integration-20260910
npm test
npm start
```

`npm start`는 Tailscale IPv4에만 바인딩하며 임의 경로의 24시간 링크를 출력한다. 실제 실행 파일과 여섯 PNG만 제공한다. 브라우저 검사를 실행하려면 Playwright Chromium이 설치되어 있어야 한다(`pnpm exec playwright install chromium`, 저장소 루트에서 실행).

Lab의 `/lab/facility-passage`에서 바로 열거나 같은 화면에서 `시설 사이로 통과`를 선택하면 비행 공간부터 설계한 물류 시설 하나를 통과한다. 직접 열 때는 출력된 링크에 `?study=passage&altitude=0&paused=1&backdrop=architecture`를 붙인다. `먼 곳부터 재생`으로 전체 접근을 보고, 접근·입구·시설 내부·출구 너머 버튼과 고도로 공간 차이를 비교한다.

브라우저 검사는 시연 폴더의 `*-browser-check.mjs`와 `browser-check.mjs`를 실행한다. 서버를 띄운 상태에서 [전체 검사 명령](prototypes/breakthrough-hangar-integration-20260910/NOTES.md#실행과-검수)을 따른다. 결과는 같은 폴더에 생성되며 Git에 추가되지 않는다.

## 로컬 백업

분리 당시 저장소의 수정 파일·미추적 파일, Git 이력 bundle, 저장소 밖 `.gstack`의 이전 시연을 별도 백업했다. 원래 작업 폴더와 당시 시연 서버는 보존한다. 백업의 `manifest.json`에는 원본 파일의 SHA-256, `selected-files.json`에는 분리 직후 복사한 파일 명세가 있다. 호스트별 실제 백업 위치와 이후 검증 결과는 백업 폴더의 `separation-result.json`에 기록한다.

## 분리 검증 (2026-09-10)

새 작업 폴더에서 시연 단위 테스트 110개, 브라우저 검사 252개를 통과했다. A~H 전환·같은 원근·앞뒤 가림·원거리 접근·정지·모바일 표시·원경 안개·배경 확대의 고도 및 반복 경계 회귀를 포함한다. 실행 코드와 PNG 64개 파일은 분리 전 원본과 바이트가 일치한다.

본편 단위 테스트 2,049개도 통과했다. 새 작업 폴더에는 기존 로컬 환경 파일을 복사하지 않았으므로, 본편 검사에만 `VITE_SUPABASE_URL=http://127.0.0.1:9`와 `VITE_SUPABASE_PUBLISHABLE_KEY=test-public-key`를 주입했다. 실제 Supabase 연결 검증 결과를 뜻하지 않는다. 이 환경 변수는 독립 비행 시연에는 필요 없다.

문서의 로컬 링크 대상을 확인했고, 저장하는 파일에 임시 접속 URL·서버 상태·로그·검사 캡처가 포함되지 않음을 확인했다. 원본을 보존한 Three.js vendor 파일은 출처 SHA-256으로 검증하며 포맷을 변경하지 않는다.
