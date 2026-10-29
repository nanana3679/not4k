# 명시적 노트 정적 export

[RFD 0037](../../../docs/rfd/0037-explicit-score-notes-and-body.md)의 E1/G1에서 함께 읽는 정적 도안 계약이다. 이 정적 view는 이미지·좌표 정보만 제공한다. 스킨 로딩은 `ExplicitSkinLoader`가, 판정 상태에 따른 도안 선택·성공 alpha·표시 수명은 `ExplicitNotePresenter`(G1)가 공개 snapshot으로 맡는다. 게임·에디터 타임라인·판정 사례 도구(`pnpm case:image --explicit`)가 같은 도안을 쓴다.

## 원본과 출처

#360(2026-10-29)부터 트릴을 뺀 역할은 #348의 선택 도안을, 트릴 역할은 이전 도안을 그대로 쓴다. 사용자 결정은 "#348 선택 도안을 쓰고 스킨 교체는 별도 PR"(2026-10-27)과 "트릴은 예전거 쓰는데 트릴 릴리즈는 이제 안씀"(2026-10-29)이다. 트릴 구간 안 릴리즈는 [RFD 0038](../../../docs/rfd/0038-release-notes-in-trill-zones.md)로 금지되어 트릴 릴리즈 도안이 없다.

| 역할 | 원본 | 고정 |
| --- | --- | --- |
| 트릴을 뺀 27개 역할 | `sources/selected-notes-20261026/assets/`의 고정 사본. #348 `../revisions/selected-notes-20261026/`의 `manifest.selectedStatePreview` 파일 중 쓰는 것만 같은 상대 경로로 복사했다. 싱글 파랑 50%·더블 금색 75%, 릴리즈 A, 틱 싱글 44px·더블 각 32px(윤곽선 포함), 선택 실패·한쪽 미충족·한쪽 실패 파생본, 탭·릴리즈 Grace overlay | #348 squash `86285403b14e8314aebb80bcaaff908a521f3613` |
| 트릴 Grace overlay | `../revisions/approved-notes-20261025/assets/trill-grace-overlay.png` | #339 squash `e563cb5d48580db81e8bc3483d2563bee2410a56` |
| 트릴 탭·바디 5개 | `../versions/v014/files/public/skins/classic/`의 `note-trill*`·`body-trill*` | v014 `manifest.json` 기록 |

- #348 폴더는 비교안·제작기를 계속 재생성하는 작업 경로라 빌드가 직접 읽지 않는다. 그 폴더를 재생성해도 고정 사본과 게임 도안은 바뀌지 않는다. #339 보관본은 `source-archive.test.ts`가, v014 보관본은 자기 manifest가 지키는 고정 폴더라 그 자리에서 읽는다.
- `provenance.json`은 두 revision의 커밋·PR 번호·원본 폴더와 그 커밋의 폴더 Git tree, 실제로 읽는 revision PNG 55개(@2x 포함)의 크기·SHA-256과 그 커밋의 revision `manifest.json`이 적은 PNG 크기·`targetSize`·`padding`·`approval`, v014 manifest와 트릴 PNG 5개의 기록을 담는다. 빌드는 revision manifest를 읽지 않고 이 기록만 대조한다.
- `provenance.json`과 고정 사본은 손으로 고치지 않고 `pnpm build:explicit-skin --freeze-sources`로 만든다. 이 명령은 `roles.json`이 읽는 원본과 revision manifest에 있는 그 `@2x`를 `scripts/build-explicit-skin.ts`의 `EXPLICIT_SKIN_REVISIONS`에 적은 고정 커밋의 Git object에서 가져오고 그 커밋의 manifest 크기·SHA-256과 대조한다. `roles.json`의 #348 원본은 사본 경로로 적으며 아직 없는 파일도 이 명령이 고정 커밋에서 가져온다. 사본 폴더에 남은 다른 파일은 지운다. `scripts/build-explicit-skin.test.ts`는 고정 커밋이 있는 저장소에서 같은 과정을 다시 실행해 커밋된 `provenance.json`·고정 사본과 같은지 확인한다. 고정 커밋이 없는 얕은 clone에서는 이 Git 대조만 건너뛴다.
- 새 manifest의 `sourceApproval`은 원본 revision manifest의 `approval`을 그대로 옮긴다. #348은 선택 팔레트의 대기·유지 도안에 `approved-artwork`를, 그 밖의 파생본(실패·한쪽 미충족·한쪽 실패, 더블 틱 노트 좌우 몫 레이어, 탭·릴리즈 Grace overlay)에 `proposed-state-treatment`를 적었다. 탭 Grace overlay는 #339 원본에서 `approved-artwork`였으나 #348이 다시 생성하며 `proposed-state-treatment`가 됐다(1배 바이트는 같다). 런타임은 이 값을 읽지 않는다. 파일 공급과 최종 실패색 강도의 제품 확정을 구별하는 기록이며, 보관본의 미정 표시·수명 설명보다 RFD 0037 §7을 우선한다. 원본에 남아 있는 `skinKey`·`proposedRuntimePath`는 당시 제안이며 런타임 이름은 아래 출력 이름을 따른다.
- 원본 폴더와 보관본은 읽기만 한다. 수정하거나 생성기로 다시 쓰지 않는다.

## 생성과 검증

```sh
pnpm build:explicit-skin
pnpm build:explicit-skin --check
pnpm build:explicit-skin --freeze-sources  # 원본 커밋이나 roles.json의 원본을 바꿀 때만
```

`scripts/build-explicit-skin.ts`는 저장소 안의 고정 원본과 이 폴더의 `roles.json`·`provenance.json`만 읽는다. 모든 고정 원본의 해시를 검사한 뒤 선택한 PNG를 재인코딩 없이 복사하고 결정적인 metadata를 만든다. export와 `--check`에는 시각 제작 도구·브라우저·외부 파일·Git 접근이 필요하지 않다(Git은 위 `--freeze-sources`만 쓴다). SVG 자연 크기 나누기나 원본 갤러리 재생성을 하지 않는다. 고정하지 않은 원본, 원본 옆에 있는데 고정하지 않은 `@2x`, 사본 폴더의 고정하지 않은 파일, 해시가 다른 원본은 거부한다. 고정 기록은 역할이 읽는 1배·2배 원본과 정확히 같아야 하며 쓰지 않는 기록이 있어도 거부한다.

`roles.json`의 `output`이 런타임 파일 이름이다. 원본 파일 이름(`basename`)을 복사하지 않고 역할 ID에서 정한 이름을 쓴다. 이름은 `역할-변형[-상태][-방향].png`이며 기본 상태 `pending`·`idle`은 생략하고 상태는 kebab-case로 쓴다(`tap-single.png`, `body-double-partial-held-left.png`, `tick-double-failed-right.png`). Grace overlay는 `{tap,trill,release}-grace-overlay.png`다. 2배 PNG는 같은 이름에 `@2x`를 붙인다. 빌드는 `output`이 이 규칙(`explicitSkinOutputName`)과 다르면 거부한다.

출력은 `public/skins/classic-explicit/`의 PNG 60개(1배 33개, 트릴을 뺀 27개 역할의 `@2x` 27개)와 `manifest.json`, 그리고 같은 바이트인 `src/game/skin/explicitSkinManifest.json`이다. 트릴 6개 역할은 2배 원본이 없어 1배만 쓴다. `--check`는 쓰기 없이 원본과 출력의 일치를 검증하고 런타임 폴더에 예상하지 않은 파일이 있어도 거부한다. export는 런타임 폴더에 남은 예전 이름의 파일을 지운다. 기존 `public/skins/classic/`와 기존 빌더·loader·default manifest는 그대로 둔다.

## 순수 view 계약

`src/game/skin/explicitSkin.ts`의 `buildExplicitSkinView(baseUrl?)`와 `getExplicitSkinAsset(view, id)`를 사용한다. view는 Pixi·DOM·오디오·store·판정 세션을 import하지 않는다. 이미지 descriptor의 `url`, `pixelSize`, `logicalSize`, `contentRect`, 정규화 `anchor`, 선택적 `highResolution`과 역할·상태·방향을 제공한다. ID 전체는 `EXPLICIT_SKIN_ASSET_IDS`에 있다.

| ID 구성 | 가용 상태 |
| --- | --- |
| `tap.single` | `pending` |
| `tap.double`, `tap.trill` | `pending`, `failed` |
| `body.single`, `body.double`, `body.trill` | `idle`, `held`, `failed` |
| `body.double` | `partialHeld.left/right`, `partialFailed.left/right` |
| `release.single`, `release.double` | `pending`, `failed` |
| `release.double` | `partialFailed.left/right` |
| `tick.single` | `pending`, `failed` |
| `tick.double` | `pending.left/right`, `failed.left/right` |
| `graceOverlay.tap`, `graceOverlay.trill`, `graceOverlay.release` | `overlay` |

실제 ID에서는 `/`로 요약한 방향 중 하나만 쓴다(예: `tick.double.failed.left`). 총 33개 역할이다. `tap.single.failed`, 탭의 좌우 부분 실패, 트릴 릴리즈·별도 트릴 틱·바디 Grace·terminal cap 등 공급하지 않은 역할은 거부한다. #348에는 싱글 탭 실패 도안(`selected-point-single-failed`)이 있지만 이 계약은 싱글 탭 Miss에 대기 도안을 유지하므로 export하지 않는다. 다른 역할·스킨으로 fallback하지 않으며 필수 역할 누락·중복·잘못된 좌표·방향도 view 생성 때 거부한다.

- 싱글·더블 탭은 212×40, 트릴 탭과 모든 바디·릴리즈·틱은 200×40이다. 레인 중앙·자기 beat에 전체 캔버스 anchor `(0.5, 0.5)`를 맞춘다. 바디는 200×40 타일을 세로 반복하며 탭 기준 폭 212와의 비율을 보존한다. 시작·끝 마감은 없다.
- Grace는 본체와 별도 이미지다. 탭 overlay 260×88의 본체는 `(24,24,212,40)`, 릴리즈·트릴 overlay 248×88의 본체는 `(24,24,200,40)`이다. `@2x`(탭 520×176, 릴리즈 496×176)도 동일한 논리 크기·패딩을 쓴다. `*-grace.png` 합성 참고본과 과거 terminal overlay는 export하지 않는다.
- 틱 single은 x=100(폭 44px), double은 x=84·116(각 32px)에 놓인다. double은 #348 `selectedStatePreview.layers`의 좌우 몫 레이어를 쓰며 각 파일의 **전체 200×40 캔버스**와 투명 여백을 유지한다. 두 레이어를 겹치면 #348의 더블 정상·한쪽 실패·전체 실패 그림과 픽셀이 같다. 한쪽을 숨긴 뒤 남은 쪽을 잘라 재중앙 정렬하지 않는다.
- `partialHeld`의 side는 미충족 쪽(`sideMeaning: unmet`, #348의 `inactiveSide`), `partialFailed`는 실패 쪽(`failed`), 틱 분리 레이어는 표식 쪽(`marker`, #348의 `onlySide`)이다. 물리 키·손을 나타내지 않는다.
- 성공 alpha 0.7과 실패 도안 합성, 성공한 틱만 숨김, Grace 외곽의 독립 밝기는 이 정적 view가 판단하지 않는다. `ExplicitNotePresenter`(G1)가 M1 공개 snapshot으로 적용한다.
