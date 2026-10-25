# Classic 확정 도안과 상태별 에셋 · 판정 연결 검토용

2026-10-25. 보존 원본 24개와 복사·상태별 생성물 108개, 총 132개 파일을 `assets/`에 묶었다. 이 묶음은 판정·렌더러 담당자가 적용 위치와 상태 대응을 검토하기 위한 자료다. 현재 `public/skins/classic/`, 스킨 로더, 판정 엔진은 변경하지 않는다.

`manifest.json`에는 각 파일의 크기·SHA-256·용도와 제안 스킨 키·런타임 경로를 적었다. `skinKey`와 `proposedRuntimePath`는 구현 제안이며 기존 API나 확정된 도메인 모델이 아니다. `source`는 제작 워크스페이스의 출처 기록이다. 이 묶음의 PNG·SVG는 모두 자체 포함 파일이며 해당 출처 경로나 Lab 갤러리 없이 열 수 있다.

## 확정 디자인

| 역할 | 싱글 | 더블 |
| --- | --- | --- |
| 누름 | ![기존 싱글](assets/note-single.png) | ![M6 70% 더블](assets/note-double-anodized-contrast-070.png) |
| 대기 바디 | ![싱글 바디](assets/body-single.png) | ![중앙 두 광선 더블 바디](assets/body-double-center-dual-beam.png) |
| 일반 릴리즈 J2-C | ![싱글 릴리즈](assets/release-single.png) | ![더블 릴리즈](assets/release-double.png) |
| 유지 노트 D | ![싱글 유지](assets/sustain-single.png) | ![더블 유지](assets/sustain-double.png) |

- 싱글 누름은 기존 디자인을 유지한다. 더블 누름은 **M6 아노다이징 대비 70%**다.
- 더블 바디는 바깥 면을 유지하고 중앙 영역만 넓혀 **42%·58%**에 두 광선을 둔다.
- **릴리즈도 마지막에 선택한 C안(J2-C)**으로 맞췄다. 초기 릴리즈 도안은 교체했다. `terminal-j2-shadow-3-{single,double}`에 보존된 선택 PNG를 `release-{single,double}.png`와 `@2x.png`로 바이트 그대로 복사한다. 릴리즈 SVG는 2배 PNG를 내장한 래퍼이며 벡터 원본이 아니다.
- **바디 시작·끝에는 별도 마감이 없다.** 시작에는 명시한 `Point`만, 끝에는 명시한 릴리즈만 추가한다. 릴리즈 없는 끝은 바디 자체로 끝난다. `terminal-j2-*`는 릴리즈 선택 원본의 출처 파일명이며 새 모델의 terminal 역할을 뜻하지 않는다([정정 댓글](https://github.com/nanana3679/not4k/pull/339#issuecomment-6390954414)).
- 유지 노트는 **D 매듭 1.8배**다. 싱글은 x=100, 더블은 x=84·116에 매듭을 둔다(200×40 기준). 투명 표식만 들어 있으므로 바디 위에 얹는다. 길이 0도 길이 0 바디 위에 같은 표식을 얹는 디자인이다.
- Grace는 실제 윤곽을 따르는 별도 overlay다. J2-C 원본의 모든 픽셀이 alpha 0.5 이상인 것을 검사하고, 그 **200×40 직사각 외곽 전체**에 검정 1px·흰색 1px·바깥 10px 번짐을 둔다. 더블 일부 실패도 반쪽이나 내부 이음선에 새 윤곽을 만들지 않는다.

## 파일과 제안 적용 경로

아래 목적지는 모두 `public/skins/classic/` 기준이다. 이번 PR에서 복사하거나 연결하지 않는다.

| 현재 파일 이름 | 제안 목적지 / 스킨 키 | 크기·배치 |
| --- | --- | --- |
| `note-single.png` | `note-single.png` / `noteSingle` | 212×40, 기존 유지 |
| `note-double-anodized-contrast-070.png` | `note-double.png` / `noteDouble` | 212×40 |
| `body-single.png` | `body-single.png` / `bodySingle` | 200×40 반복 타일 |
| `body-double-center-dual-beam.png` | `body-double.png` / `bodyDouble` | 200×40 반복 타일 |
| `terminal-j2-shadow-3-{single,double}.png` | 릴리즈 생성 입력만 보존, 런타임 키 없음 | 200×40, `@2x`는 400×80 |
| `release-{single,double}.png` | 같은 이름 / `releaseSingle`, `releaseDouble` 제안 | 200×40 |
| `release-{single,double}-failed.png` | 같은 이름 / `releaseSingleFailed`, `releaseDoubleFailed` 제안 | 200×40 |
| `release-double-partial-failed-{left,right}.png` | 같은 이름 / `releaseDoublePartialFailedLeft/Right` 제안 | 200×40, 실패한 절반만 무채색 |
| `sustain-{single,double}.png` | 같은 이름 / `sustainSingle`, `sustainDouble` 제안 | 200×40 투명 overlay |
| `point-grace-overlay.png` | 같은 이름 / `pointGraceOverlay` | 260×88, 본체 212×40, 좌상단 (24, 24) |
| `release-grace-overlay.png` | 같은 이름 / `releaseGraceOverlay` 제안 | 248×88, 본체 200×40, 좌상단 (24, 24) |
| `trill-grace-overlay.png` | 같은 이름 / 트릴용 별도 키 검토 | 248×88, 마름모 윤곽 |
| `terminal-grace-overlay.png` | 과거 참고본, 새 모델 키 없음 | 248×88, 새 바디에는 미사용 |

`*-grace.png`는 overlay를 본체에 합친 참고본이다. 실제 렌더러에서 별도 overlay를 사용할 경우 합성본을 다시 겹쳐 그리지 않는다. 일반 `@2x.png`는 400×80, Grace의 2배 PNG는 496×176이며 기본 PNG와 같은 논리 크기로 배치한다. 릴리즈·유지 SVG의 표시 크기는 200×40, 릴리즈 Grace SVG는 248×88이다. 다른 SVG는 기존 제작 좌표계를 보존하므로 개별 크기는 매니페스트를 따른다.

## 상태별 보완 · 검토 중인 시안

[판정 에이전트의 적용 계약](https://github.com/nanana3679/not4k/pull/339#issuecomment-6386397758)에 따라 자료를 보완했다. 이후 [성공·실패 표시 확인](https://github.com/nanana3679/not4k/pull/339#issuecomment-6390804166)과 [마감 제거 정정](https://github.com/nanana3679/not4k/pull/339#issuecomment-6390954414)을 우선한다. 새 상태의 구체적인 색·강도는 검토 중인 표현으로 구별한다. 실패색은 기존 릴리즈와 같은 **무채색·45% 밝기**를 참고한 시안이다.

| 도안 | 제공한 상태 | 표시 자료의 의미 |
| --- | --- | --- |
| 싱글 바디 | 대기, 전체 유지, 전체 실패 | 기존 싱글 도안 위에 유지·실패 처리를 적용 |
| 중앙 두 광선 더블 바디 | 대기, 전체 유지, 좌/우 미충족, 전체 실패, 좌/우 실패 | 광선 중심 x=84·116 유지. 미충족 쪽은 대기색, 충족 쪽만 흰 코어. 실패한 쪽은 무채색 |
| J2-C 릴리즈 | 싱글 정상·전체 실패, 더블 정상·전체 실패·좌/우 실패, 일반/Grace 성공 단계 | 일부 성공은 본체 전체 70%. Grace 외곽 100% 유지. 모두 성공하면 본체·외곽 숨김 |
| M6 더블 누름 | 미처리, 전체 실패, 좌/우 일부 처리 | 일부 처리 자료도 일반 더블 `Point`의 일부 성공과 같은 정상 그림 + 전체 alpha 0.7로 표시. 두 기존 일부 실패 키가 정상 그림을 공유하는 제안이며 바디의 좌/우 실패 그림과 다름 |
| D 유지 표식 | 싱글 전체 실패, 더블 전체 실패·좌/우 실패 | 정상 매듭의 좌표·투명 여백 유지. 별도 켜짐/Grace/트릴 유지 도안 없음 |
| 릴리즈·유지 몫별 레이어 | 더블 좌/우 정상, 좌/우 실패를 각각 분리 | 기본 PNG는 두 레이어를 합치면 원본과 일치. 릴리즈 일부 성공의 반쪽 숨김은 전체 70%로 대체. 유지 및 성공·실패 혼합의 합성은 별도 검토 |
| 몫별 마스크 | 왼쪽, 오른쪽 200×40 알파 마스크 | 잘라낸 절반도 전체 바디 좌표를 유지하며 x 위치를 다시 중앙 정렬하지 않음 |

모든 새 시안은 기본 PNG·2배 PNG·SVG를 제공한다. 기본 크기는 바디·릴리즈·유지 200×40, M6 누름 212×40이다. 분리 레이어의 기본 PNG는 승인 PNG의 픽셀을 그대로 나누고, 유지의 2배 PNG와 SVG는 벡터 원본을 사용하고, 릴리즈는 J2-C 2배 PNG를 내장한 SVG에서 만든다. 매니페스트의 `stateGroups`에 상태별 파일·공유 관계·미충족 방향을 기록했다. `PartialHeldLeft/Right`는 **미충족 쪽**, `PartialFailedLeft/Right`는 **실패한 쪽**이다. 물리 키나 손 소유권을 뜻하지 않는다.

새 상태 파일은 `body-double-held`, `body-double-partial-held-{left,right}`, `body-double-failed`, `body-double-partial-failed-{left,right}`, `note-double-failed`, `sustain-{single,double}-failed`, `sustain-double-partial-failed-{left,right}`, `{sustain,release}-double-unit-{left,right}[-failed]`, `unit-mask-{left,right}` 이름으로 찾을 수 있다.

## 재생성 및 미리보기

### 유지 표식 가독성 · 광선 홈 폭 + 윤곽선 시안

`#sustain-visibility`에서 기존 D 매듭과 확대안을 싱글·더블, 바디 대기·활성, 게임 배율로 비교한다. 기존 27.36px 폭에서 윤곽 포함 싱글 36px·더블 각 32px로 키운다. 원래 가로세로 비율을 유지하며 광선 중심 x=100 또는 x=84·116에 놓는다. 높이는 40px 캔버스 안에 남는다.

표식의 실제 외곽을 따라 2.4px 어두운 선을 둔다(싱글 `#05243a`, 더블 `#3b2906`). 빛번짐·Grace 효과가 아닌 가독성용 윤곽선이다. 바디와 표식 면 색은 그대로다. `sustain-visibility.mjs`가 기존 SVG의 D 경로를 재사용하며 `sustain-{single,double}-channel-outline`의 PNG·2배 PNG·SVG 6개를 생성한다.

`manifest.sustainVisibilityPreview`에 비교 원본·후보·표시 폭·활성 바디를 기록한다. **비교용 후보이며 기존 승인 정상본·실패본·몫별 레이어와 런타임 키를 교체하지 않는다.** 게임 배율은 누름 폭 62.5px를 기준으로 바디와 overlay를 함께 `62.5 / 212`로 줄인다.

### 바디 위 더블 포인트 일부 성공

갤러리의 `#point-success`에서 선택한 M6 도안에 일반 더블 `Point`의 표시 alpha **1 → 0.7 → 0**을 적용한다. 단색 배경과 실제 더블 바디 위에 대기·일부 성공·모두 성공을 나란히 표시한다.

- 포인트는 212×40, 바디는 200×40이다. 중심을 맞춰 포인트가 바디 양옆으로 6px씩 나오며 바디는 alpha 1로 유지한다.
- `manifest.pointSuccessPreview`에 원본·표시 크기·바디 크기·알파·배경을 기록한다. M6의 재질 대비 70%와 일부 성공 표시 알파 70%는 별개다.
- 기존 상태 목록의 누름 일부 처리도 70%로 맞춘다. 정상 PNG를 재사용하며 실제 게임 표시와 판정은 변경하지 않는다.

### 일반·Grace 릴리즈의 성공·실패 표시

[사용자 확인을 전달한 댓글](https://github.com/nanana3679/not4k/pull/339#issuecomment-6390804166)에 따라 `#release-success`에서 확정한 일반·Grace 성공 단계를 비교한다. `manifest.releaseSuccessPreview`에 원본·목표 크기·표시 알파·배경을 기록했다.

- 일반 릴리즈는 같은 `assets/release-double.png`에 본체 alpha **1 → 0.7 → 0**을 적용한다. 대기 → 일부 성공 → 모두 성공 숨김이며 200×40 위치·모양·색을 유지한다. 앞선 50%·반쪽 숨김 제안을 대체한다.
- Grace도 본체 alpha **1 → 0.7 → 0**, 별도 전체 외곽 alpha **1 → 1 → 0**이다. 일부 성공에서 외곽은 원래 밝기를 유지하고, 모두 성공하면 함께 숨긴다. `release-grace-overlay.png`를 한 번만 올리며 반투명 PNG를 추가하지 않는다.
- 각 단계를 단색 배경과 실제 더블 바디 위에서 비교한다. 바디는 alpha 1로 유지한다. 외곽은 248×88, 본체는 패딩 24px 안의 200×40이다.
- **실패 확정된 릴리즈는 실패색으로 표시하고 스크롤되어 화면 밖으로 나갈 때까지 남긴다.** 바디 실패로 입력 기회를 잃은 종속 0점도 포함한다. 판정 가능·유예 대기 상태를 먼저 실패색으로 바꾸지 않는다. 이는 시각적 잔류이며 새로운 Miss·콤보·고도 이벤트를 만들지 않는다.
- 일부 성공과 실패가 함께 확정된 더블의 최종 합성 및 유지 노트의 표시 방식·수명은 별도 검토다. 실패색의 구체적인 강도도 시안으로 남긴다. 이번 갤러리는 정적 자료이며 실제 게임의 스크롤·판정에 아직 연결하지 않는다.

### 별도 마감 없는 바디 시작·끝

`#body-boundaries`에서 같은 200×160 바디에 `Point` 없음/있음 × 릴리즈 없음/있음 네 조합을 비교한다. 위가 끝, 아래가 시작이며 바디의 경계는 모든 조합에서 같다. 시작 `Point`는 212×40, 끝 릴리즈는 200×40이고 각 노트의 세로 중심을 해당 경계에 맞춘다.

시작 마감 반전·끝 마감·terminal 상태 그룹과 새 모델 terminal 스킨 키를 제거했다. 마감용으로 생성했던 실패 파생 파일 12개도 묶음·갤러리에서 제거했다. J2-C 선택 원본과 과거 `terminal-grace-overlay`는 각각 `release-source`·`historical-reference`로 보존하며 런타임 키를 제안하지 않는다. 바디 구간의 병합이나 암묵적인 `Point`·릴리즈 추가는 하지 않는다.

### 생성 명령

```sh
node assets-lab/classic/revisions/approved-notes-20261025/build-states.mjs
node assets-lab/classic/revisions/approved-notes-20261025/build-preview.mjs
pnpm build:lab
```

`build-states.mjs`는 이 묶음 안의 확정 원본만 읽는다. `state-artwork.mjs`는 SVG 필터·클립·흰 코어로 상태를 만들고, 출력할 때 **목표 크기를 직접 지정**한다. 기존 빌더의 SVG 자연 크기 ÷ 5 규칙을 쓰지 않으므로 200×40인 유지 SVG가 40×8로 줄어들지 않는다. J2-C 릴리즈 정상본은 기본·2배 PNG를 그대로 복사하고, 실패·일부 실패·분리 레이어·Grace는 같은 원본에서 재생성한다. 보존 원본 24개는 재생성하지 않는다.

더블 릴리즈·유지의 실패 몫 SVG는 정상 원본에 실패색과 좌우 클립을 한 번에 적용한다. 이미 생성한 실패 SVG를 다시 감싸면 내부 ID가 중복되어 투명하게 렌더링될 수 있다. 단위 테스트로 SVG별 ID 중복을 검사하고, 브라우저 테스트로 실패 몫의 SVG·2배 PNG에 표식이 보이며 반대편 알파는 0인지 확인한다. 기본 PNG의 좌우 재합성 검사도 유지한다.

`build-preview.mjs`가 `/lab/images/classic-approved-states-20261025/` 비교 화면과 다운로드 파일을 만든다. 마감 없는 바디 경계·길이 0 바디+유지, 일반/Grace 성공 단계, 실패 상태와 참고용 몫별 레이어를 확인할 수 있다. 확정한 실패 잔류를 실제 스크롤에 연결하는 검증은 새 모델 구현에서 진행한다.

## 실제 연결 담당자에게 전달할 사항

- 런타임 목적지는 위 대응표의 `public/skins/classic/`다. SVG 생성 원본과 J2-C PNG 복사 경로를 `states.mjs`·`build-classic-skin.ts`에 함께 연결해야 재생성으로 옛 그림이 돌아오지 않는다. 이번 PR에서는 현재 게임 파일을 바꾸지 않는다.
- 유지·릴리즈는 명시적인 노트 진입점에서 자기 시각의 세로 가운데에 놓는다. 바디 200×40 좌표계를 쓰고 누름의 212×40 전체 폭으로 늘리지 않는다. Grace 여백 24px도 본체 배율과 함께 줄인다.
- 바디 시작·끝에는 별도 terminal을 그리지 않고, 바디·유지에는 Grace를 붙이지 않는다. `terminal-grace-overlay`는 과거 표현의 참고 자료다. `*-grace.png` 합성 참고본과 별도 overlay를 중복해서 겹치지 않는다.
- 바디+Point는 가능하지만 같은 위치의 Point+릴리즈·Point+유지·릴리즈+유지는 금지다. 길이 0 유지 시연에는 바디와 표식만 둔다. 트릴 위 유지와 연결점의 허용 조건은 위 판정 계약을 따른다.
- 바디 완료, 각 릴리즈·유지 몫의 미처리/성공/실패/종속 0점을 구별한다. 릴리즈의 일부 성공은 전체 70%, 모두 성공은 숨김이다. 유지 노트의 표시 방식은 별도 검토다. 일부 실패와 성공·실패 혼합은 구별한다. 실패 이미지의 존재가 입력 기회 유지나 새 Miss를 뜻하지 않는다.
- 더블 바디 한 몫 실패 후 릴리즈가 하나라면 건강한 몫의 **싱글** 릴리즈를 사용한다. 바디가 더블이라고 무조건 더블 일부 실패 그림을 고르지 않는다. 2→1 감소에서 실패한 몫의 릴리즈는 별도 계약을 따른다.

매니페스트의 `buildContract.missingRequestedStates`는 요청 자료 기준 빈 목록이다. `confirmedDisplay`는 전체 70%, Grace 외곽 유지, 모두 성공 숨김, 실패 확정 후 화면 밖까지 잔류, 별도 마감 없음과 확인 댓글을 기록한다. `unapproved`에는 새 색·강도, 성공·실패 혼합 더블의 최종 합성, 유지 노트의 표시 방식·수명과 이번 홈 폭·윤곽선 시안을 남긴다. 판정 계약은 기존 도메인 문서를 따르고 이 자료에서 변경하지 않는다.
