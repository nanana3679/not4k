# RFD 0030: 운영체제 움직임 줄이기 설정을 따르지 않는다

**Status:** 채택 (2026-10-08, 사용자 결정) · 구현 대기: 게임 화면·메뉴 UI·Lab ([#236](https://github.com/nanana3679/not4k/issues/236))

## 기존 결정과 문제

[PRODUCT.md](../../PRODUCT.md)는 접근성 원칙으로 "`prefers-reduced-motion` 존중"을 두었다. 운영체제·브라우저의 움직임 줄이기 설정(`prefers-reduced-motion: reduce`)이 켜져 있으면 지금은 다음이 달라진다.

- **게임 화면:** 기어 움직임을 만들지 않고 자료도 받지 않는다([게임 코어](../spec/game-core.md)). 비행 배경의 움직임 시계를 0으로 둔다. 고도 게이지는 이징 없이 바로 맞춘다.
- **메뉴 UI:** `src/global.css`가 앱 전체의 CSS 전환·애니메이션을 0.01ms로 줄이고, 설정·캘리브레이션·튜토리얼 도움말 모달·튜토리얼 미리보기도 각자 전환을 줄인다.
- **Lab:** 기어 페이지가 움직임 줄이기 미리보기를 두고, 노트 에셋 시연실·키봄 CSS도 같은 설정을 읽는다.

PR #235(고도 게이지) 이해 확인 중 사용자가 운영체제 설정과 인게임 설정이 다를 때의 동작을 물었고, 다음 문제가 드러났다.

- 기어 움직임은 `settings.gearMotion && !prefersReducedMotion()`일 때만 만든다. 운영체제 설정이 켜져 있으면 인게임 `Gear Motion`이 켜져 있다고 표시되어도 움직이지 않고, 이유를 알려 주는 표시도 없어 버그처럼 보인다.
- Windows의 "애니메이션 효과" 끄기는 창 전환을 빠르게 하려고 흔히 끄는데, 이 설정이 그대로 `prefers-reduced-motion: reduce`로 전달된다. 그런 플레이어는 이유를 모른 채 기어 움직임·배경 움직임이 빠진 게임을 하게 된다.
- 노트가 흘러가는 화면 자체가 움직임이라, 장식 움직임만 꺼서 얻는 보호 효과가 작다.

## 결정

1. **not4k는 운영체제·브라우저의 움직임 줄이기 설정을 읽지 않는다.** 플레이 화면, 메뉴 UI(설정·캘리브레이션·튜토리얼 화면 포함), 게임 동작을 보여 주는 Lab 페이지 모두 같다. 화면 효과는 인게임 설정만 따른다.
2. **기어 움직임은 인게임 `Gear Motion`(기본 켬)만으로 정한다.** 비행 배경과 고도 게이지 이징은 항상 움직인다.
3. **메뉴 UI의 전환·애니메이션은 운영체제 설정과 관계없이 같다.**
4. **움직임을 줄이는 선택지가 필요하면 인게임 설정으로 둔다.** 비행 배경 끄기는 [#237](https://github.com/nanana3679/not4k/issues/237)에서 검토하며 지금은 하지 않는다.

## 검토한 대안

- **운영체제 설정을 우선하고 설정 화면에 알리기(기각):** 운영체제 움직임 줄이기가 켜져 있으면 `Gear Motion` 토글을 비활성화하거나 "적용되지 않음"을 보여 주는 방식이다. 토글과 실제가 어긋나는 혼란은 줄지만, 창 전환 때문에 애니메이션 효과를 끈 플레이어가 고르지도 않은 채 움직임을 잃는 문제는 남는다.
- **인게임 `Reduce Motion`(자동·켬·끔)을 두고 자동이면 운영체제를 따르기(기각):** 운영체제 설정을 기본값으로만 쓰고 인게임 선택이 이기게 하는 방식이다. 기본값이 여전히 운영체제 설정이라 위와 같은 플레이어가 처음부터 움직임을 잃고, 설정이 하나 늘어난다. 게임은 설정을 스스로 관리하는 편이 플레이어가 찾기 쉽고 결과를 예측하기 쉽다고 보았다.

## Trade-off

멀미 같은 이유로 운영체제 움직임 줄이기를 켠 플레이어도 처음에는 기어 움직임과 비행 배경 움직임을 보게 된다. 기어 움직임은 `Gear Motion`으로 끌 수 있지만, 비행 배경은 아직 끌 수 없다(#237). 노트가 흘러가는 화면을 견딜 수 있어야 플레이할 수 있는 게임이라 이 비용을 받아들인다. 필요가 확인되면 인게임 선택지를 더한다.

## 영향

구현은 성격별로 나눈 작은 PR로 진행한다(#236).

1. 이 RFD와 `PRODUCT.md` 접근성 원칙 갱신
2. 게임 화면: `src/game/renderer/reducedMotion.ts`(`prefersReducedMotion`), `PlayScreen.tsx`(기어 움직임 자료 유지 조건), `GameRenderer.ts`(기어 움직임 `gearMotionReducedMotion`, 고도 게이지 `reducedMotion`), `flight/FlightBackground.ts`, `gearMotion.ts`·`GearMotionController.ts`·`gearGauge.ts`와 관련 테스트·E2E, [게임 코어](../spec/game-core.md)의 움직임 줄이기 문장, glossary `기어` 항목의 기어 움직임·유리관 게이지 문장
3. 메뉴 UI: `src/global.css`, `SettingsPanel.tsx`, `CalibrationView.tsx`, `TutorialHelpModal.tsx`(전환 시간 `matchMedia`와 CSS), `TutorialPreviewPlayer.tsx`와 `@media` 존재를 확인하는 테스트
4. Lab: `GearPage.tsx`·`GearMotionCompare.tsx`(움직임 줄이기 미리보기), `NoteAssetShowcasePage.tsx`·`.css`, `noteAssetKeybomb.css`, [Lab 미리보기 카탈로그](../spec/lab-preview-catalog.md)의 움직임 줄이기 문장
