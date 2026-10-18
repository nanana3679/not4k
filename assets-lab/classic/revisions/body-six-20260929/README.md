# 롱노트 바디 6개 시안

## 최종 선택: 아주 밝은 바디 + 고채도 포인트

2026-09-29 사용자 선택으로 싱글·더블 모두 **바디 1단계 ‘아주 밝게’ + 기존 ‘고채도’ 포인트**를 확정했다. 파랑·금색의 고유색을 유지한다. 선택 파일은 [`selected/`](selected/README.md), 원본 경로·규격·SHA-256은 [`selected/selection.json`](selected/selection.json)에 모았다. 바디와 시작·끝 터미널은 같은 타일이다.

갤러리 첫 화면 `#selected-combination`에서 선택한 조합과 PNG 다운로드, 전체 ZIP을 제공한다. 아래의 스펙트럼과 추천은 선택 전 비교 기록이다. 사용자의 후속 요청으로 `classic` 런타임에 반영했다. 여기서 확정한 파일을 대기 바디·고채도 포인트의 기준으로 사용하며 `pnpm build:classic`으로 상태별 바디·공용 터미널까지 재생성한다.

기본 `image_gen` 도구로 여섯 방향을 각각 생성했다. 외부 참조는 `public/skins/classic/note-single.png` 하나이며 기존 바디는 사용하지 않았다. 전체 프롬프트와 두 시안의 수정 프롬프트는 `prompts.json`, 채택한 생성 원본은 `generated/`에 보존한다.

| 번호 | 방향 | 반복 구성 |
| --- | --- | --- |
| 01 | 유리 리본 | 넓은 유리 면과 얇은 은색 가장자리 |
| 02 | 이중 레일 | 두 레일과 어두운 중앙 |
| 03 | 은색 중심축 | 은색 중심축과 푸른 양쪽 면 |
| 04 | 사선 연결 | 연속하는 V자 절삭면 |
| 05 | 교차 패널 | 엇갈리는 금속 패널 |
| 06 | 유선형 흐름 | 두 개의 곡선 광선 |

`node assets-lab/classic/revisions/body-six-20260929/export.mjs`로 생성 픽셀을 1000×200 및 200×40 PNG로 내보낸다. 01–03은 생성 이미지 중앙부의 가로 재질을 세로로 연장한다. 04–06은 생성 원본의 한 주기를 보존하고 연결 부위만 혼합해 상하 경계 픽셀을 맞춘다. SVG로 다시 그리지 않는다.

최종 PNG와 비교 보드는 `lab/image-galleries/long-note-body-six-20260929/`에 있으며 기준 확인 경로는 `/lab/images/long-note-body-six-20260929/`이다. 각 시안의 타일 한 장과 포인트 노트에 연결한 5회 반복을 제공한다. 게임 런타임 적용 전의 디자인 시안이다.

## 1+2 조합

`combined-01-02`는 사용자가 선택한 1번의 넓은 유리 중심부와 2번의 양쪽 금속·청록색 발광 레일을 합친 생성 시안이다. 두 최종 PNG를 기본 `image_gen` 도구에 참조로 전달했다. 생성 원본은 `generated/combined-01-02.png`, 프롬프트와 참조 경로는 `prompts.json`의 `combinations`에 보존한다.

`node assets-lab/classic/revisions/body-six-20260929/export.mjs combined-01-02`로 이 조합만 다시 내보낼 수 있다. 같은 갤러리에서 조합 결과와 참조한 두 원안을 함께 확인한다.

## 싱글·더블 바디와 터미널 공용 타일

후속 요청에 따라 1+2 조합의 100:20 타일을 시작·끝 터미널에도 그대로 사용한다. `terminal-single.png`와 `terminal-single-200x40.png`는 해당 싱글 타일과 바이트 단위로 같은 파일이다. 별도의 시작·끝 모양은 만들지 않는다.

`combined-01-02-double`은 같은 구조를 최신 더블 포인트의 샴페인 골드·크림색 광선으로 바꾼 생성 시안이다. 더블도 같은 타일을 `terminal-double.png`와 `terminal-double-200x40.png`로 제공한다. 각 색의 바디·터미널은 동일한 가로 색면과 규격을 사용한다.

최신 포인트는 `/home/nanana3679/not4k` 작업 폴더에서 찾은 2026-09-23 `readability-face` 버전이다. 중앙 세 분할면을 하나로 합친 싱글·더블 PNG를 `references/note-{single,double}-readability-a.png`에 복사했다. 출처·SHA-256은 `prompts.json`의 `pointReferences`에 기록하며, 파랑·금색 조합 미리보기는 이 참조를 사용한다. 기존 여섯 시안의 제작 당시 참조는 별도로 유지한다.

`node assets-lab/classic/revisions/body-six-20260929/export.mjs combined-01-02-double`로 더블만 다시 내보낸다. `terminalAlias`가 있는 시안은 바디와 같은 바이트의 터미널 PNG를 함께 출력한다.

## 포인트 채도별 원본 위치

2026-09-23 제작한 진한 포인트와 고채도 포인트를 현재 워크트리 밖의 `/home/nanana3679/not4k/public/lab/note-assets/classic-recessed-frame/{dark-point,saturated-point}/`에서 찾았다. 기본 원본은 같은 작업 폴더의 `public/skins/classic/note-{single,double}.png`이다.

진한·고채도 PNG와 SVG를 `references/note-{single,double}-{dark,saturated}.{png,svg}`에 원본 그대로 복사했다. 생성기는 외부 작업 폴더의 `assets-lab/classic/dark-point.mjs`, 당시 결정은 `docs/spec/classic-recessed-frame.md`의 ‘고채도 포인트 역할 분리’에 있다. 고채도 포인트가 유형의 색을 맡고 바디의 어두운 면·밝은 면이 명도 차이를 맡는 방향이다.

후속 사용자 요청으로 진한 포인트는 활성 참조와 갤러리에서 제외했다. 갤러리의 `#point-saturation`에서는 원본 / 고채도 2종만 싱글·더블로 비교하고 PNG를 내려받을 수 있다. 출처와 복사본 SHA-256은 `prompts.json`에 기록했다. 제외한 진한 포인트의 검색 기록은 `rejectedPointReferences`와 `references/`에 남긴다.

## 흰 면과 어두운 프레임의 대비

`combined-01-02-contrast-{single,double}`은 기존 조합과 찾은 고채도 포인트를 참조해 기본 `image_gen` 편집 모드로 생성했다. 넓은 중심면과 양쪽 레일을 유지하면서 중심을 흰색에 가깝게 밝히고, 홈과 프레임을 짙게 낮췄다. 싱글은 약한 청회색, 더블은 약한 회갈색을 남겼다. 한 타일 내부의 명도 대비를 높인 시안이며 게임 상태별 색 매핑을 지정하지 않는다.

생성 원본과 전체 프롬프트는 `generated/` 및 `prompts.json`에 보존한다. 각 ID를 `export.mjs`에 전달하면 1000×200·200×40 PNG와 바이트 단위로 같은 `terminal-{single,double}-contrast` 별칭을 내보낸다. 가로 재질을 세로로 연장해 상하 반복 경계가 일치한다.

갤러리의 ‘이전 바디 시안 보기’를 열면 `#contrast`에서 고채도 포인트에 연결한 반복 결과를 확인한다. 이전 파랑·금색 조합도 이 접힌 영역에 보존한다.

## 제외한 무채색 바디 탐색

명도 배치와 재질을 달리한 무채색 바디 6종을 생성했으나, 바디 자체로 싱글·더블이 구분되지 않아 사용자 피드백으로 제외했다. 이 탐색은 활성 비교에 사용하지 않는다. 기록용 메타데이터는 `color-studies.json`, 당시 내보낸 PNG는 `rejected-neutral/`에 보존한다.

| 구분 | 파일 ID | 명도 배치 |
| --- | --- | --- |
| A | `color-a-porcelain` | 넓은 흰 중심면과 검은 홈 |
| B | `color-b-obsidian` | 넓은 어두운 중심면과 흰 레일 |
| C | `color-c-silver-spine` | 밝은 중앙 띠 하나와 어두운 양쪽 면 |
| D | `color-d-twin-white` | 밝은 패널 두 개와 어두운 중앙 홈 |
| E | `color-e-smoke-blue` | 중간 밝기의 청회색 유리와 흰 안쪽 테두리 |
| F | `color-f-warm-graphite` | 회갈색 중심면과 넓은 크림색 양옆 면 |

`color-studies.json`에 전체 프롬프트와 참조, `generated/`에 생성 원본을 보존했다. 제외한 6개는 `prompts.json`의 활성 내보내기 목록에서 제거했다.

## 고유색을 유지한 싱글·더블 바디 6쌍

**싱글 바디는 파랑·청록, 더블 바디는 금색·노랑이어야 하며, 포인트가 없어도 바디 자체로 유형이 구분되어야 한다.** 같은 유형 안에서 밝기·채도·밝은 면과 어두운 면의 배치를 바꾼다. 흰색은 하이라이트에 사용하며 넓은 면의 고유색을 유지한다.

기본 `image_gen` 편집 도구로 싱글 6개를 만들고, 각 싱글을 참조해 같은 형태의 금색 더블을 생성했다. 총 12개이며, 전체 프롬프트와 참조는 `paired-color-studies.json`, 생성 원본은 `generated/`에 보존한다.

| 구분 | 파일 ID (`single` / `double`) | 대비 방식 |
| --- | --- | --- |
| A | `type-a-pearl-{single,double}` | 밝은 고유색 유리 면과 짙은 홈 |
| B | `type-b-deep-{single,double}` | 짙은 고유색 유리 면과 밝은 레일 |
| C | `type-c-spine-{single,double}` | 밝은 중앙 띠와 넓은 고유색 양쪽 면 |
| D | `type-d-twins-{single,double}` | 밝은 고유색 패널 두 개와 어두운 중앙 홈 |
| E | `type-e-glass-{single,double}` | 중간 밝기의 선명한 유리 면과 흰 레일 |
| F | `type-f-shoulders-{single,double}` | 어두운 중심면과 넓고 밝은 색 레일 |

각 ID를 `export.mjs`에 전달하면 1000×200·200×40 PNG를 내보낸다. 각 유형 안에서 바디·시작 터미널·끝 터미널은 같은 타일을 사용하며, 싱글과 더블은 서로 다른 파일이다.

이 형태별 비교는 갤러리의 ‘이전 형태별 시안 보기’ 아래 `#color-studies`에 보존한다. 각 카드에서 싱글·더블 바디 단독을 나란히 보여주고, 그 아래 같은 유형의 원본·고채도 포인트만 연결한다. 연결부는 100px 폭 바디를 5회 반복해 보여준다. 포인트는 원본·고채도 두 종류를 유지한다.

## 선택 전 비교: 고유색 안의 밝기 스펙트럼

사용자 요청에 따라 형태 변형을 멈추고 A의 넓은 중심면 하나와 양쪽 레일을 기준으로 색만 바꿨다. 싱글은 파랑 계열, 더블은 금색 계열 안에서 각각 아주 밝게 / 밝게 / 중간 / 선명하게 / 짙게 / 아주 짙게의 6단계를 만든다. 무지개 색상으로 유형의 고유색을 바꾸지 않는다.

각 단계는 기본 `image_gen` 편집 도구로 A 타일을 참조해 생성했다. `intrinsic-spectrum.json`에 전체 프롬프트와 목표 색을 보존하며, 목표 HSL은 생성 지시용 값이다. 생성된 PNG의 모든 픽셀이 그 값과 일치한다는 의미는 아니다. 최종 파일은 `spectrum-{single,double}-{01..06}.png` 및 `-200x40.png`, 생성 원본은 `generated/`에 있다.

현재 기준 확인 경로는 `/lab/images/long-note-body-six-20260929/`의 `#intrinsic-spectrum`이다. 파랑 6단계와 금색 6단계를 각각 밝은 쪽부터 짙은 쪽으로 배치하고, 각 단계에 원본·고채도 포인트를 연결한다. 전부 100:20 비율이며 각 유형의 바디·터미널 공용 타일이다. `export.mjs`로 내보내어 모든 행을 동일하게 맞추므로 상하로 반복할 수 있다.

## 포인트 6단계와 바디·포인트 대비 추천

포인트도 승인된 바디와 같은 6단계로 확장했다. 편집 가능한 기존 SVG 원본의 `readability-face` 그라데이션만 바꾸므로 중앙 분할을 제거한 형태, 외곽·레일·알파는 그대로 유지한다. 이미지 생성 도구로 새 형상을 만들지 않는다. 각 단계의 기준색은 같은 단계 바디 PNG의 중앙 면에서 직접 추출한다.

생성 명령은 `node assets-lab/classic/revisions/body-six-20260929/export-point-spectrum.mjs`이다. SVG는 `point-spectrum/`, 공개 SVG·PNG는 기존 갤러리에 저장한다. PNG 규격은 1060×200 및 212×40이며, 포인트 외곽 폭 106 안에서 바디 연결 폭 100을 유지한다. 파일 ID는 `point-spectrum-{single,double}-{01..06}`이다.

`point-spectrum.json`에는 기준색, 그라데이션, 중앙 면 명도, 전체 72개 조합과 추천 순위를 기록한다. sRGB를 선형화한 상대 명도를 각 이미지의 가로 30–70%, 세로 40–70% 영역에서 평균하고 `(밝은 명도 + 0.05) / (어두운 명도 + 0.05)`로 중앙 면 대비를 비교한다. 실제 플레이 중 시인성이나 전체 형상의 식별성을 보장하는 수치는 아니다.

사용자가 밝은 포인트를 선호한 맥락을 반영해 포인트 1·2단계와 바디 4–6단계 중 싱글·더블 양쪽 대비의 최솟값이 큰 순서로 추천한다. 현재 상위 두 조합은 **포인트 1 + 바디 6**(싱글 5.11:1, 더블 2.70:1), **포인트 2 + 바디 6**(싱글 4.48:1, 더블 2.55:1)이다. 어두운 포인트 조합도 전체 비교 표에서 확인할 수 있다.

`node assets-lab/classic/revisions/body-six-20260929/render-point-comparisons.mjs`로 선택한 조합과 측정 결과를 비교 페이지에 반영한다. 첫 부분은 `#selected-combination`이며, 선택 전 추천은 접힌 `#contrast-recommendations`, 포인트 12개는 `#point-spectrum`, 모든 조합은 펼쳐 보는 `#all-point-body-combinations`에 있다. 기존 원본·고채도 포인트와 승인된 바디 스펙트럼도 보존한다.
