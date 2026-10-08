# RFD 0030: 운영체제의 `prefers-reduced-motion` 설정을 따르지 않는다

**Status:** 채택 (2026-10-07, 사용자 결정) · 구현 대기: 게임 화면·메뉴 UI·Lab ([#236](https://github.com/nanana3679/not4k/issues/236))

## 기존 결정과 문제

[PRODUCT.md](../../PRODUCT.md)는 접근성 원칙으로 "`prefers-reduced-motion` 존중"을 두었고, [RFD 0029](0029-frame-aspect-fit-narrow-lanes.md)는 [기어 움직임 게임 적용](0029-frame-aspect-fit-narrow-lanes.md#프레임-움직임-게임-적용-2026-10-05)과 [고도 게이지 게임 적용](0029-frame-aspect-fit-narrow-lanes.md#고도-게이지-게임-적용-2026-10-06)에서 같은 원칙을 따랐다. 운영체제·브라우저의 모션 감소 설정(`prefers-reduced-motion: reduce`. macOS·iOS '동작 줄이기', Android '애니메이션 삭제', Windows 11 '애니메이션 효과')이 켜져 있으면 지금은 다음이 달라진다.

- **게임 화면:** 기어 움직임을 만들지 않고 자료도 받지 않는다. 비행 배경의 움직임 시계를 0으로 둔다. 고도 게이지는 이징 없이 바로 맞춘다.
- **메뉴 UI:** `src/global.css`가 앱 전체(게임·에디터)의 CSS 전환·애니메이션을 0.01ms로 줄이고, 설정·캘리브레이션·튜토리얼 도움말 모달·튜토리얼 미리보기도 각자 전환을 1ms로 줄인다.
- **Lab:** 기어 페이지는 운영체제 설정을 실시간으로 읽어 움직임을 숨기고, 비교 영역에 넣는 승인 SVG도 자체 `@media` 규칙으로 움직임 레이어를 숨긴다. 노트 에셋 시연실·키봄 CSS도 같은 설정을 읽는다.

PR #235(고도 게이지) 이해 확인 중 사용자가 운영체제 설정과 인게임 설정이 다를 때의 동작을 물었고, 다음 문제가 드러났다.

- 기어 움직임은 `settings.gearMotion && !prefersReducedMotion()`일 때만 만든다. 운영체제 설정이 켜져 있으면 인게임 `Gear Motion`이 켜져 있다고 표시되어도 움직이지 않고, 이유를 알려 주는 표시도 없어 버그처럼 보인다.
- Windows의 "애니메이션 효과" 끄기는 창 전환을 빠르게 하려고 흔히 끄는데, 이 설정이 그대로 `prefers-reduced-motion: reduce`로 전달된다. 그런 플레이어는 이유를 모른 채 기어 움직임·배경 움직임이 빠진 게임을 하게 된다.
- 노트가 흘러가는 화면 자체가 움직임이라, 장식 움직임만 꺼서 얻는 보호 효과가 작다.

## 결정

1. **not4k는 `prefers-reduced-motion`을 읽지 않는다.** 앱 전체(플레이 화면, 메뉴 UI, 설정·캘리브레이션·튜토리얼 화면, 에디터)와 게임 동작을 보여 주는 Lab 페이지가 같다. 화면 효과는 인게임 설정만 따른다.
2. **기어 움직임은 인게임 `Gear Motion`(기본 켬)만으로 정한다.** 비행 배경과 고도 게이지 이징은 항상 움직인다.
3. **메뉴 UI의 전환·애니메이션은 운영체제 설정과 관계없이 같다.**
4. **움직임에 민감한 플레이어를 위한 선택지는 효과별 인게임 설정으로 둔다.** 무엇이 꺼지는지 이름에서 드러나게 하며(지금은 기어 움직임을 끄는 `Gear Motion`), 노트까지 멈추는 것처럼 읽힐 수 있는 "애니메이션 끄기" 같은 묶음 이름은 쓰지 않는다. 비행 배경 끄기는 [#237](https://github.com/nanana3679/not4k/issues/237)에서 검토하며 지금은 하지 않는다. 남은 선택은 [PRD §12](../prd.md#12-미정-사항)에서 추적한다.
5. **보관·시연 기록은 그대로 둔다.** 해시로 고정한 Classic 보관본(`assets-lab/classic/versions/*`), 이미지 갤러리(`lab/image-galleries/*`), 독립 시연(`output/prototypes/*`), 리비전 생성 스크립트, 지난 CHANGELOG는 당시 동작을 기록한 것이라 고치지 않는다. 게임 동작을 보여 주는 Lab 페이지가 이런 기록을 불러와 쓸 때는 그 페이지에서 운영체제 설정의 영향을 걷어 낸다.

## 검토한 대안

- **운영체제 설정을 우선하고 설정 화면에 알리기(기각):** `prefers-reduced-motion`이 켜져 있으면 `Gear Motion` 토글을 비활성화하거나 "적용되지 않음"을 보여 주는 방식이다. 토글과 실제가 어긋나는 혼란은 줄지만, 창 전환 때문에 애니메이션 효과를 끈 플레이어가 고르지도 않은 채 움직임을 잃는 문제는 남는다.
- **인게임 `Reduce Motion`(자동·켬·끔)을 두고 자동이면 운영체제를 따르기(기각):** 운영체제 설정을 기본값으로만 쓰고 인게임 선택이 이기게 하는 방식이다. 기본값이 여전히 운영체제 설정이라 위와 같은 플레이어가 처음부터 움직임을 잃고, 설정이 하나 늘어난다. 게임은 설정을 스스로 관리하는 편이 플레이어가 찾기 쉽고 결과를 예측하기 쉽다고 보았다.

## Trade-off

멀미 같은 이유로 운영체제에서 모션 감소를 켠 플레이어도 처음에는 기어 움직임과 비행 배경 움직임을 보게 된다. 기어 움직임은 `Gear Motion`으로 끌 수 있지만, 비행 배경은 아직 끌 수 없다(#237). 노트가 흘러가는 화면을 견딜 수 있어야 플레이할 수 있는 게임이라 이 비용을 받아들인다. 필요가 확인되면 인게임 선택지를 더한다.

## 영향

구현은 성격별로 나눈 작은 PR로 진행한다(#236). 동작을 바꾸는 PR이 그 동작을 적은 명세·glossary 문장을 함께 고친다. 문서에서 운영체제 설정은 `prefers-reduced-motion`(처음 나올 때 "모션 감소 설정"과 플랫폼별 이름을 함께)으로 부르고, 지금 문서에 남은 "움직임 줄이기"라는 표현은 고칠 때 함께 바꾼다. 각 PR은 `prefers-reduced-motion|prefersReducedMotion|reducedMotion|ReducedMotion`을 검색해 자기 범위에 남은 곳이 없는지 확인하고 끝낸다(결정 5의 기록은 제외).

1. **결정 기록(이 RFD):** `PRODUCT.md` 접근성 원칙, RFD 0029 상단의 RFD 0030 안내, [PRD §12](../prd.md#12-미정-사항) 움직임 선택지 행
2. **게임 화면:**
   - 코드: `src/game/renderer/reducedMotion.ts`(`prefersReducedMotion`), `src/game/screens/PlayScreen.tsx`(기어 움직임 자료 유지 조건), `src/game/screens/gearMotionKeepAlive.ts`(주석)와 테스트 이름, `src/game/renderer/GameRenderer.ts`(기어 움직임 `gearMotionReducedMotion`, 고도 게이지 `reducedMotion`), `src/game/renderer/flight/FlightBackground.ts`, `src/game/renderer/gearMotion.ts`·`GearMotionController.ts`·`gearGauge.ts`와 관련 단위 테스트·E2E(`e2e/game/gear-motion.spec.ts`)
   - 문서: [게임 코어](../spec/game-core.md)의 `altitude` 시각화·게임 배경 수명·기어 움직임(시간 기준·`prefers-reduced-motion`·읽기와 곡 시작 항목)·고도 게이지 문장, glossary `기어` 항목의 기어 움직임·유리관 게이지·코드 식별자(`gearMotionReducedMotion`) 문장
3. **메뉴 UI:** `src/global.css`(PRODUCT.md 원칙 주석 포함), `src/game/screens/settings/SettingsPanel.tsx`, `src/game/screens/settings/CalibrationView.tsx`, `src/game/screens/songSelect/TutorialHelpModal.tsx`(전환 시간 `matchMedia`와 CSS), `src/game/screens/songSelect/TutorialPreviewPlayer.tsx`와 `@media` 존재를 확인하는 테스트(`TutorialHelpModal.test.ts`, `TutorialPreviewPlayer.test.ts`)
4. **Lab:**
   - 코드: `src/lab/GearPage.tsx`(실시간 읽기 `usePrefersReducedMotion`, `'hide'` 렌더러, 화면 문구), `src/lab/GearMotionCompare.tsx`(불러온 승인 SVG의 `@media (prefers-reduced-motion: reduce)` 규칙은 보관 파일을 두고 페이지에 넣을 때 걷어 낸다), `src/lab/NoteAssetShowcasePage.tsx`·`.css`, `src/lab/noteAssetKeybomb.css`와 테스트(`src/lab/GearPage.test.ts`, `e2e/lab/gear.spec.ts`, `e2e/lab/frame-ambient-motion.spec.ts`)
   - 문서: [Lab 미리보기 카탈로그](../spec/lab-preview-catalog.md)의 고도·`prefers-reduced-motion`·프레임 간격 문장
