# Classic

현재 선택은 **v014: 흰빛 포인트 + 세로 트렌치 바디 + 포인트 접촉 그림자 + 반투명 사각 기둥 트릴 켜짐 바디 + 에디터와 같은 회색 마름모 트릴 끝 터미널**이다. 싱글 파랑·더블 금색을 바디에 유지하고, 바디와 시작·끝 터미널에 같은 100:20 반복 타일을 사용한다. 싱글·더블 포인트 위아래와 트릴 포인트 마름모 테두리에 접촉 그림자를 깔아 포인트가 바디 위에 올 때도 경계를 구분한다. 트렌치 바디 원본·출처는 [트렌치 기록](./revisions/body-trench-20260930/README.md), 트릴 켜짐 바디는 [frosted-fill 기록](./revisions/trill-body-on-imagegen-20261001/README.md)에 있다.

인게임에서 `Settings → Skin → Classic`을 선택한다. `pnpm build:classic`은 Lab SVG를 `public/lab/note-assets/classic/`에, 런타임 PNG를 `public/skins/classic/`에 생성한다. 런타임 PNG는 접촉 그림자 2개를 포함해 60개다. 실제 플레이와 Lab이 같은 PNG를 읽으며 프로덕션 빌드에도 포함한다. 런타임 PNG를 저장소에 보관하므로 일반 빌드 때 다시 생성할 필요는 없다.

## 빌드 입력과 상태

현재 선택은 `v014`다. 이전 Classic은 `v001`, 고채도 포인트·아주 밝은 바디는 `v002`, 트릴 접촉 그림자가 없는 후보는 `v012`, 트릴 켜짐 바디가 이전 석영인 버전은 `v013`으로 [버전 보관 폴더](./versions/README.md)에 저장한다. 그 사이의 탐색 후보 v003~v011은 보관 폴더의 탐색 기록에 요약했다. 각 버전은 전체 런타임 PNG·Lab SVG·원본·생성 코드·설정과 파일 해시를 포함한다. 이후 확정본은 `node scripts/classic-versions.ts save v015 "설명"`처럼 새 번호로 보관한다.

- `sources/point-{single,double}.svg`: 싱글 푸른 흰색·더블 크림색 흰색 중앙 면의 흰빛 포인트 원본. 흰 레일 안쪽 검은 세로띠와 바깥 외곽선은 없다. 1060×200 SVG를 212×40 PNG로 내보내 화면에서는 전체를 100×20으로 표시해 레인 폭을 기준으로 맞춘다. 가운데 접합부의 바디·터미널은 약94.34px 폭으로 중앙 정렬한다.
- `sources/body-{single,double}-bright.svg`: imagegen 세로 트렌치 1000×200 타일을 내장한 SVG. 대기 상태는 타일 픽셀을 그대로 사용한다. 가로선 위주 무늬는 포인트와 겹쳐 보여 쓰지 않는다.
- `bright-body.mjs`: 대기는 선택 타일 그대로, 홀드는 폭 56단위 중앙 흰빛과 주변 빛, 더블 부분충족은 중앙 흰빛만 표시한다. 실패는 같은 재질을 무채색·45% 밝기로 표시한다. 각 상태는 세로로 일정해 반복 경계가 없다. PNG 내보내기는 SVG 그라데이션 디더링의 1/255 행 차이까지 없애도록 중앙 한 행을 세로로 반복한다.
- `states.mjs`: 같은 상태의 바디·시작·끝 터미널을 동일한 SVG로 출력한다. 런타임에서 시작 텍스처를 상하반전해도 동일한 타일이다. PNG는 200×40이다. 플레이 바디 타일은 약94.34×18.87로 반복하고 터미널은 같은 폭·20px 높이로 표시한다.
- `CLASSIC_SOURCE_NAMES`는 현재 포인트·밝은 바디 4개, 석영 트릴 포인트·대기·실패 바디 3개, 반투명 기둥 트릴 켜짐 바디 1개(`body-trill-on-frosted.svg`), 에디터 회색 마름모 트릴 끝 터미널 1개(`terminal-end-trill-editor.svg`)를 읽는다. 석영 켜짐 바디·끝 터미널 원본 4개는 석영 미리보기 생성기가 다시 쓰는 파일이라 Classic 빌드 입력에서 뺀다. 이전 Penpot 바디·독립 터미널은 제작 이력으로 `sources/`와 `revisions/`에 보존하며 현재 빌드 입력에서 제외한다. 빌드는 원본 파일을 덮어쓰지 않는다.
- 트릴 포인트·대기·실패 바디는 기존 석영 원본을 사용한다. 켜짐 바디는 반투명 사각 기둥이 안에서 빛나는 imagegen 타일이다. 봄 16프레임과 버튼 8개도 기존 산출 방식을 유지한다.
- Grace는 검정 1px→흰색 1px 외곽과 10px 알파 80%→0% 발광을 별도 overlay로 표시한다.
- 접촉 그림자: `point-contact-shadow`는 싱글·더블 포인트 위아래 5px 바디 폭 그라디언트(농도 0.4→0)다. `point-contact-shadow-trill`은 트릴 마름모를 위아래 5px 여백 가운데 두고 테두리에서 멀어질수록 옅어지는(농도 0.7 × (1 − 거리/5px)^1.3) 마름모를 겹쳐 만든다. 불투명한 포인트의 안티에일리어싱 가장자리 밑에서도 짙게 남도록 테두리 1px 안쪽에서 자른다. 두 그림자 모두 스킨 설정 `pointContactShadow { above: 5, below: 5 }`와 함께 선언해야 그린다.

`/lab/note-assets?design=classic`에서 실제 재생기와 전체 상태 랙을 확인한다. `/assets-lab/classic/terminal-preview.html`은 바디·시작·끝 공용 타일의 조립, 실제 크기, 길이 0과 SVG 다운로드를 제공한다.

원본·작업 자료, Lab SVG, 런타임 PNG의 폴더 분리를 유지한다. `withPublicBase`와 `withLabPublicBase`는 배포 위치에 맞춰 URL 접두사만 붙인다. 기존 단색 Classic은 `../simple/`에 보존한다.

## 이전 터미널 제작 기록

Penpot 확정본과 이전 V 형태는 `revisions/penpot-approved/`, `revisions/pre-penpot/`, `revisions/pre-penpot-double/`에 남아 있다. 색 수정 전 SVG는 `revisions/concept-04-before-color/`, 이전 생성기와 기준 이미지는 `revisions/pre-concept-04/`, 이전 1040px 터미널은 `revisions/pre-seamless-terminal/`에 보존한다.

제작 기준과 시안 등록 방법은 [노트 에셋 Lab 명세](../../docs/spec/note-asset-lab.md)를 따른다.

## 석영 Trill SVG 시안

6번의 밝은 흰 포인트·회색 석영 바디는 [별도 미리보기](./trill-quartz-preview.html)에서 확인한다. 현재 Classic의 끝 터미널은 석영 재질 대신 에디터가 트릴 롱 끝에 그리는 것과 같은 납작한 `#888888` 마름모를 대기·켜짐·실패에 공통으로 쓰고, 켜짐 바디는 석영 `-on` 원본 대신 반투명 사각 기둥 내부 조명 타일을 쓴다. `sources/point-trill.svg`, `sources/body-trill.svg`, `sources/terminal-end-trill.svg`는 모두1000×200이며 최대 너비가 같다. 바디는 세로 반복·자르기로 채우고 터미널과 색면·반사를 공유한다.

바디와 끝 터미널에는 켜짐(`-on`)·실패(`-failed`) 원본을 각각 추가해 SVG7개를 관리한다. 켜짐은 넓은 내부 흰빛, 실패는 어두운 무채색 재질이다. 각 상태의 바디·끝 터미널은 같은 표면을 공유한다.

`node scripts/build-trill-quartz.ts`로 SVG7개와 상태별 조립 SVG·ZIP을 생성한다. 이어 `pnpm build:classic`을 실행하면 저장된 석영 원본을200×40 PNG로 내보내 Lab Classic의 트릴 텍스처8개에 연결한다. `/lab/note-assets?design=classic`의 `트릴`·`트릴 롱` 차트와 에셋 랙에서 확인한다. 세부는 [미리보기 스펙](../../docs/spec/trill-quartz-svg-preview.md)을 따른다.
