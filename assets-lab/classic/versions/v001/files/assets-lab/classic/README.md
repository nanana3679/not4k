# Classic

승인된 유광 포인트·어두운 금속 바디·직사각형 터미널을 편집 가능한 SVG로 보존한다. 기존 단색 Classic은 `../simple/`로 이름을 옮겼다.

인게임에서 `Settings → Skin → Classic`을 선택해 사용한다. 선택은 로컬 설정에 저장된다. `pnpm build:classic`은 Lab SVG를 `public/lab/note-assets/classic/`에, 공통 런타임 PNG58개를 `public/skins/classic/`에 생성한다. 실제 플레이와 Lab이 같은 PNG를 읽고, 프로덕션 빌드에도 포함한다. 런타임 PNG를 저장소에 보관하므로 일반 빌드 때 다시 생성할 필요는 없다.

원본·작업 자료, Lab SVG, 런타임 PNG는 현재 폴더 분리를 유지한다. 개발 서버와 공개 Lab은 같은 산출물을 읽으며, `withPublicBase`(`withLabPublicBase`)가 배포 위치에 맞춰 URL 접두사만 붙인다. 예를 들어 같은 `public/skins/classic/note-single.png`를 루트 배포에서는 `/skins/classic/note-single.png`, `/not4k/` 배포에서는 `/not4k/skins/classic/note-single.png`로 요청한다.

Penpot에서 확정한 싱글 바디·시작 터미널을 공통 빌드 입력에 적용했다. [확정본](./revisions/penpot-approved/README.md)의 모양·채색·그리는 순서를 유지하고 상태를 나누는 그룹 정보만 추가했다. 끝 터미널은 시작 전체의 상하반전이다. SVG는1000×200, PNG는200×40이며 투명 여백 없이 바디를 터미널 아래까지 이어 그린다.

`CLASSIC_SOURCE_NAMES`의 포인트·바디 원본4개와 `sources/terminal-start-{single,double}.svg`를 읽고 저장소 루트에서 `pnpm build:classic`을 실행한다. 두 시작 터미널 모두 독립 원본이며 이전 생성기로 다시 만들지 않는다. 더블은 싱글의 Penpot 수정본과 같은 금속 마감·반사광·V 형태를 사용하고 금색으로 채색했다. 플레이어 코드는 수정할 필요가 없다. 생성 결과는 `/lab/note-assets?design=classic`에서 시연한다.

- 포인트: 원본1060×200, 런타임212×40, 화면106×20. 윗면은100px 바디와 접합한다.
- 바디: 원본1000×200, 런타임200×40, 화면100×20 주기로 반복한다.
- 터미널: SVG1000×200, 런타임200×40, 화면100×20. 바디와 같은 너비·열린 단면으로 연결한다. 흰빛은 바디와 같은5.6px이다.
- `terminal-start-single.svg`, `terminal-start-double.svg`는 아래가 닫힌 시작 파츠다. `terminal-end-single.svg`, `terminal-end-double.svg`는 시작의 정확한 상하반전이다. 기존 `terminal-single.svg`, `terminal-double.svg` 이름은 끝 파츠를 가리킨다. 이6개 파일은 빌드 때 `sources/`에도 편집 가능한 독립 SVG로 출력한다.
- 기준은 [바디 주변 연결 시안 4번](./references/terminal-approved.png)을 Penpot 댓글로 수정한 싱글이다. 중앙 V의 끝은 y=113/165, 사이 간격은18단위이며 더블도 같다. 더블의 넓은 중앙광(180단위)은 꺾임 시작점을22단위 올려 모든 사선을45도로 유지한다. 흰빛56단위와 양옆 노란빛은 더블 바디의 원래 그라데이션을 사용한다. 바깥으로 돌출되지 않는다.
- 양 맨 끝 회색·하늘색 띠는 바디와 같은 가로 위치·색으로 y=0~194까지 연속된다. 더블에는 같은 구조의 노란색을 사용한다. 닫힌 쪽은 y=194~200의 얇은 마감과 한 줄의 빛으로 끝난다.
- 싱글은 Penpot 확정본의 금속 그라데이션·푸른 경계 반사·V를 따라 좁아지는 번짐을 사용한다. 대기에서는 중앙광과 그 주변 번짐을 끄며, 실패에서는 발광을 없애고 금속을 무채색으로 바꾼다. 더블도 같은 금속 면과 경계 반사·번짐 구조를 금색으로 적용한다. 현재 더블 바디와 맞닿는 단면과 외곽 띠를 보존하고, y=70까지 재질을 점진적으로 연결한다. 중앙 연결 영역도 V 형태로 잘라 틈새가 메워지지 않게 한다. 대기는 흰빛만 끄고, 부분충족은 노란빛과 번짐만 끄며, 실패는 무채색으로 바꾼다.
- 기준 이미지 사본은 `references/terminal-approved.png`, 직전 SVG·생성기·기준 이미지는 `revisions/pre-concept-04/`, 이전1040px 터미널은 `revisions/pre-seamless-terminal/`에 보존한다.
- 색 수정 전 45° SVG와 생성기는 `revisions/concept-04-before-color/`에 보존한다. 미리보기에서 4번 원본과 현재 SVG를 나란히 확인할 수 있다.
- Penpot 통합 전 싱글은 `revisions/pre-penpot/`, 상태 그룹을 추가하기 전의 확정 원본은 `revisions/penpot-approved/`에 보존한다. 브라우저 테스트에서 켜짐 상태와 확정 원본의 모든 픽셀이 동일한지 비교한다.
- 더블 수정 전 시작·끝 SVG는 `revisions/pre-penpot-double/`에 보존한다. 새 더블 역시 원본과 시작 출력, 원본 전체를 뒤집은 결과와 끝 출력을 픽셀 비교한다.
- 시작/끝 조립·실제 크기·길이0·SVG 다운로드: `/assets-lab/classic/terminal-preview.html`.
- `states.mjs`는 고유색을 유지하는 대기, 중앙광만 남기는 더블 부분충족, 발광과 고유색을 지운 실패 에셋을 만든다.
- Grace는 검정1px→흰색1px 외곽과10px 알파80%→0% 발광이다. 본체를 줄이지 않는 별도 overlay로 제공한다.
- 봄은 기존 CSS 실버 링을 고정 시간으로 샘플링한120×120 PNG16프레임,280ms이다. 싱글·더블이 공유한다. CSS6종은 Lab에서 계속 비교할 수 있다.

제작 기준과 시안 등록 방법은 [노트 에셋 Lab 명세](../../docs/spec/note-asset-lab.md)를 따른다.

## 석영 Trill SVG 시안

6번의 밝은 흰 포인트·회색 석영 바디와 바디 재질의 마름모 끝 터미널은 [별도 미리보기](./trill-quartz-preview.html)에서 확인한다. `sources/point-trill.svg`, `sources/body-trill.svg`, `sources/terminal-end-trill.svg`는 모두1000×200이며 최대 너비가 같다. 바디는 세로 반복·자르기로 채우고 터미널과 색면·반사를 공유한다.

바디와 끝 터미널에는 켜짐(`-on`)·실패(`-failed`) 원본을 각각 추가해 SVG7개를 관리한다. 켜짐은 넓은 내부 흰빛, 실패는 어두운 무채색 재질이다. 각 상태의 바디·끝 터미널은 같은 표면을 공유한다.

`node scripts/build-trill-quartz.mjs`로 SVG7개와 상태별 조립 SVG·ZIP을 생성한다. 이어 `pnpm build:classic`을 실행하면 저장된 석영 원본을200×40 PNG로 내보내 Lab Classic의 트릴 텍스처8개에 연결한다. `/lab/note-assets?design=classic`의 `트릴`·`트릴 롱` 차트와 에셋 랙에서 확인한다. 세부는 [미리보기 스펙](../../docs/spec/trill-quartz-svg-preview.md)을 따른다.
