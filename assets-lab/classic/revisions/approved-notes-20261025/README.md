# Classic 확정 도안과 상태별 에셋 · 판정 연결 검토용

2026-10-25. 보존 원본 24개와 복사·상태별 생성물 114개, 총 138개 파일을 `assets/`에 묶었다. 이 묶음은 판정·렌더러 담당자가 적용 위치와 상태 대응을 검토하기 위한 자료다. 현재 `public/skins/classic/`, 스킨 로더, 판정 엔진은 변경하지 않는다.

`manifest.json`에는 각 파일의 크기·SHA-256·용도와 제안 스킨 키·런타임 경로를 적었다. `skinKey`와 `proposedRuntimePath`는 구현 제안이며 기존 API나 확정된 도메인 모델이 아니다. `source`는 제작 워크스페이스의 출처 기록이다. 이 묶음의 PNG·SVG는 모두 자체 포함 파일이며 해당 출처 경로나 Lab 갤러리 없이 열 수 있다.

## 확정 디자인

| 역할 | 싱글 | 더블 |
| --- | --- | --- |
| 누름 | ![기존 싱글](assets/note-single.png) | ![M6 70% 더블](assets/note-double-anodized-contrast-070.png) |
| 대기 바디 | ![싱글 바디](assets/body-single.png) | ![중앙 두 광선 더블 바디](assets/body-double-center-dual-beam.png) |
| 터미널 J2-C | ![싱글 터미널](assets/terminal-j2-shadow-3-single.png) | ![더블 터미널](assets/terminal-j2-shadow-3-double.png) |
| 일반 릴리즈 J2-C | ![싱글 릴리즈](assets/release-single.png) | ![더블 릴리즈](assets/release-double.png) |
| 유지 노트 D | ![싱글 유지](assets/sustain-single.png) | ![더블 유지](assets/sustain-double.png) |

- 싱글 누름은 기존 디자인을 유지한다. 더블 누름은 **M6 아노다이징 대비 70%**다.
- 더블 바디는 바깥 면을 유지하고 중앙 영역만 넓혀 **42%·58%**에 두 광선을 둔다.
- **릴리즈도 마지막에 선택한 C안(J2-C)**으로 맞췄다. 초기 릴리즈 도안은 교체했다. `terminal-j2-shadow-3-{single,double}`에 보존된 선택 PNG를 `release-{single,double}.png`와 `@2x.png`로 바이트 그대로 복사한다. 릴리즈 SVG는 2배 PNG를 내장한 래퍼이며 벡터 원본이 아니다.
- 바디 마감 자료도 같은 J2-C 도안을 참조하되 바디 마감과 명시적인 릴리즈의 역할·상태는 구별한다. 그림 공유가 일반 바디 끝에 릴리즈를 자동으로 붙이는 뜻은 아니다.
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
| `terminal-j2-shadow-3-{single,double}.png` | `terminal-{single,double}.png` / `terminalSingle`, `terminalDouble` | 200×40, 바디와 폭 일치 |
| `release-{single,double}.png` | 같은 이름 / `releaseSingle`, `releaseDouble` 제안 | 200×40 |
| `release-{single,double}-failed.png` | 같은 이름 / `releaseSingleFailed`, `releaseDoubleFailed` 제안 | 200×40 |
| `release-double-partial-failed-{left,right}.png` | 같은 이름 / `releaseDoublePartialFailedLeft/Right` 제안 | 200×40, 실패한 절반만 무채색 |
| `sustain-{single,double}.png` | 같은 이름 / `sustainSingle`, `sustainDouble` 제안 | 200×40 투명 overlay |
| `point-grace-overlay.png` | 같은 이름 / `pointGraceOverlay` | 260×88, 본체 212×40, 좌상단 (24, 24) |
| `release-grace-overlay.png` | 같은 이름 / `releaseGraceOverlay` 제안 | 248×88, 본체 200×40, 좌상단 (24, 24) |
| `trill-grace-overlay.png` | 같은 이름 / 트릴용 별도 키 검토 | 248×88, 마름모 윤곽 |
| `terminal-grace-overlay.png` | 같은 이름 / `terminalGraceOverlay` | 248×88, 직사각형 윤곽 |

`*-grace.png`는 overlay를 본체에 합친 참고본이다. 실제 렌더러에서 별도 overlay를 사용할 경우 합성본을 다시 겹쳐 그리지 않는다. 일반 `@2x.png`는 400×80, Grace의 2배 PNG는 496×176이며 기본 PNG와 같은 논리 크기로 배치한다. 릴리즈·유지 SVG의 표시 크기는 200×40, 릴리즈 Grace SVG는 248×88이다. 다른 SVG는 기존 제작 좌표계를 보존하므로 개별 크기는 매니페스트를 따른다.

## 상태별 보완 · 검토 중인 시안

[판정 에이전트의 적용 계약](https://github.com/nanana3679/not4k/pull/339#issuecomment-6386397758)에 따라 자료를 보완했다. 새 상태의 색·강도와 표시 수명은 승인된 판정 동작과 구별한다. 실패색은 기존 릴리즈와 같은 **무채색·45% 밝기**를 참고한 시안이다.

| 도안 | 제공한 상태 | 표시 자료의 의미 |
| --- | --- | --- |
| 싱글 바디 | 대기, 전체 유지, 전체 실패 | 기존 싱글 도안 위에 유지·실패 처리를 적용 |
| 중앙 두 광선 더블 바디 | 대기, 전체 유지, 좌/우 미충족, 전체 실패, 좌/우 실패 | 광선 중심 x=84·116 유지. 미충족 쪽은 대기색, 충족 쪽만 흰 코어. 실패한 쪽은 무채색 |
| J2-C 싱글 | 대기, 전체 유지, 전체 실패 | 대기/유지는 같은 승인 PNG를 참조하는 시안 |
| J2-C 더블 | 대기, 전체 유지, 좌/우 미충족, 전체 실패, 좌/우 실패 | 대기/유지/미충족은 같은 PNG를 참조하되 상태 레코드는 구별. 실패는 별도 이미지 |
| M6 더블 누름 | 미처리, 전체 실패, 좌/우 일부 처리 | 이 자료의 일부 처리 시안은 정상 그림 + 전체 alpha 0.5. 실제 일반 더블 `Point`의 일부 성공 alpha 0.7과 구별하며 런타임 값은 바꾸지 않음. 두 기존 일부 실패 키가 정상 그림을 공유하는 제안이며 바디의 좌/우 실패 그림과 다름 |
| D 유지 표식 | 싱글 전체 실패, 더블 전체 실패·좌/우 실패 | 정상 매듭의 좌표·투명 여백 유지. 별도 켜짐/Grace/트릴 유지 도안 없음 |
| 릴리즈·유지 몫별 레이어 | 더블 좌/우 정상, 좌/우 실패를 각각 분리 | 한 몫 성공 뒤 나머지만 표시할 수 있는 자료. 기본 PNG는 두 레이어를 합치면 원본과 일치 |
| 몫별 마스크 | 왼쪽, 오른쪽 200×40 알파 마스크 | 잘라낸 절반도 전체 바디 좌표를 유지하며 x 위치를 다시 중앙 정렬하지 않음 |

모든 새 시안은 기본 PNG·2배 PNG·SVG를 제공한다. 기본 크기는 바디·터미널·릴리즈·유지 200×40, M6 누름 212×40이다. 분리 레이어의 기본 PNG는 승인 PNG의 픽셀을 그대로 나누고, 유지의 2배 PNG와 SVG는 벡터 원본을 사용하고, 릴리즈는 J2-C 2배 PNG를 내장한 SVG에서 만든다. 매니페스트의 `stateGroups`에 상태별 파일·공유 관계·미충족 방향을 기록했다. `PartialHeldLeft/Right`는 **미충족 쪽**, `PartialFailedLeft/Right`는 **실패한 쪽**이다. 물리 키나 손 소유권을 뜻하지 않는다.

새 상태 파일은 `body-double-held`, `body-double-partial-held-{left,right}`, `body-double-failed`, `body-double-partial-failed-{left,right}`, `terminal-{single,double}-failed`, `terminal-double-partial-failed-{left,right}`, `note-double-failed`, `sustain-{single,double}-failed`, `sustain-double-partial-failed-{left,right}`, `{sustain,release}-double-unit-{left,right}[-failed]`, `unit-mask-{left,right}` 이름으로 찾을 수 있다.

## 재생성 및 미리보기

### 더블 릴리즈 일부 성공 · 전체 70% 시안

[일부 성공 표시 검토 요청](https://github.com/nanana3679/not4k/pull/339#issuecomment-6390513121)에 따라 갤러리의 `#release-success`에서 일반 더블 릴리즈를 비교한다. `manifest.releaseSuccessPreview`에 원본·목표 크기·표시 알파·배경을 기록했다.

- 성공 단계는 `assets/release-double.png` 하나에 표시 alpha **1 → 0.7 → 0**을 적용한다. 대기 → 일부 성공 → 모두 성공 숨김이며, 색·모양·위치·200×40 크기는 같다. 반투명 PNG를 중복 제작하지 않는다.
- 대안 비교에서는 같은 전체 70% 시안 옆에 `release-double-unit-right.png`(왼쪽 성공 후 오른쪽만 남김)와 `release-double-partial-failed-left.png`(왼쪽 실패)를 각각 alpha 1로 놓는다. 일부 성공과 일부 실패는 별도 상태다.
- 각 상태를 단색 배경 `#080c12`와 실제 `body-double-center-dual-beam.png` 바디 위에서 확인한다. 바디의 알파는 낮추지 않는다.
- **70%는 미승인 시안**이다. 기존 `Point`·유지·바디 표시를 변경하는 결정이 아니며, Grace 외곽의 알파·표시 범위와 실패 표시 수명도 확정하지 않는다.

### 생성 명령

```sh
node assets-lab/classic/revisions/approved-notes-20261025/build-states.mjs
node assets-lab/classic/revisions/approved-notes-20261025/build-preview.mjs
pnpm build:lab
```

`build-states.mjs`는 이 묶음 안의 확정 원본만 읽는다. `state-artwork.mjs`는 SVG 필터·클립·흰 코어로 상태를 만들고, 출력할 때 **목표 크기를 직접 지정**한다. 기존 빌더의 SVG 자연 크기 ÷ 5 규칙을 쓰지 않으므로 200×40인 유지 SVG가 40×8로 줄어들지 않는다. J2-C 릴리즈 정상본은 기본·2배 PNG를 그대로 복사하고, 실패·일부 실패·분리 레이어·Grace는 같은 원본에서 재생성한다. 보존 원본 24개는 재생성하지 않는다.

더블 릴리즈·유지의 실패 몫 SVG는 정상 원본에 실패색과 좌우 클립을 한 번에 적용한다. 이미 생성한 실패 SVG를 다시 감싸면 내부 ID가 중복되어 투명하게 렌더링될 수 있다. 단위 테스트로 SVG별 ID 중복을 검사하고, 브라우저 테스트로 실패 몫의 SVG·2배 PNG에 표식이 보이며 반대편 알파는 0인지 확인한다. 기본 PNG의 좌우 재합성 검사도 유지한다.

`build-preview.mjs`가 `/lab/images/classic-approved-states-20261025/` 비교 화면과 다운로드 파일을 만든다. 바디 연결·시작 마감 반전·길이 0 바디+유지, 상태별 이미지, 한 몫만 남긴 모습과 전체 Grace 윤곽을 확인할 수 있다. 짧은 바디의 마감 겹침과 실패 그림의 수명은 새 모델의 실제 렌더러 연결 때 검증할 항목이다.

## 실제 연결 담당자에게 전달할 사항

- 런타임 목적지는 위 대응표의 `public/skins/classic/`다. SVG 생성 원본과 J2-C PNG 복사 경로를 `states.mjs`·`build-classic-skin.ts`에 함께 연결해야 재생성으로 옛 그림이 돌아오지 않는다. 이번 PR에서는 현재 게임 파일을 바꾸지 않는다.
- 유지·릴리즈는 명시적인 노트 진입점에서 자기 시각의 세로 가운데에 놓는다. 바디 200×40 좌표계를 쓰고 누름의 212×40 전체 폭으로 늘리지 않는다. Grace 여백 24px도 본체 배율과 함께 줄인다.
- 터미널·유지에는 Grace를 붙이지 않는다. `terminal-grace-overlay`는 과거 표현의 참고 자료다. `*-grace.png` 합성 참고본과 별도 overlay를 중복해서 겹치지 않는다.
- 바디+Point는 가능하지만 같은 위치의 Point+릴리즈·Point+유지·릴리즈+유지는 금지다. 길이 0 유지 시연에는 바디와 표식만 둔다. 트릴 위 유지와 연결점의 허용 조건은 위 판정 계약을 따른다.
- 바디 완료, 각 릴리즈·유지 몫의 미처리/성공/실패/종속 0점을 구별한다. 성공한 몫을 숨기는 제안과 일부 실패는 다른 표시다. 실패 이미지의 존재가 입력 기회 유지나 새 Miss를 뜻하지 않는다.
- 더블 바디 한 몫 실패 후 릴리즈가 하나라면 건강한 몫의 **싱글** 릴리즈를 사용한다. 바디가 더블이라고 무조건 더블 일부 실패 그림을 고르지 않는다. 2→1 감소에서 실패한 몫의 릴리즈는 별도 계약을 따른다.

매니페스트의 `buildContract.missingRequestedStates`는 요청 자료 기준 빈 목록이다. `buildContract.unapproved`에는 새 색·강도, J2-C 그림 공유, 더블 릴리즈 일부 성공의 전체 alpha 0.7, 성공 몫 숨김, 실패·종속 0점의 표시 수명을 미승인 사항으로 구별했다. 실제 정책은 판정 문서와 새 모델 구현에서 결정하며 이 자료에서 바꾸지 않는다.
