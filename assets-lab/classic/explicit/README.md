# 명시적 노트 정적 export

[RFD 0037](../../../docs/rfd/0037-explicit-score-notes-and-body.md)의 E1/G1에서 함께 읽는 정적 도안 계약이다. 이번 연결은 이미지·좌표 정보만 제공한다. 실제 스킨 로딩, 판정 상태 선택, 성공 알파, 표시 수명과 기본 게임 전환은 후속 G1/G2 작업이다.

## 원본과 출처

- PR #339 squash `e563cb5d48580db81e8bc3483d2563bee2410a56`의 `assets-lab/classic/revisions/approved-notes-20261025/` 전체 132개 파일을 Git object에서 바이트 그대로 가져왔다. 원래 manifest·README·생성기·테스트와 126개 PNG/SVG를 보존한다. 이 보관본을 수정하거나 생성기로 다시 쓰지 않는다.
- 트릴 Point·바디 PNG 5개는 같은 커밋의 기존 Classic 이미지와 `assets-lab/classic/versions/v014/manifest.json` 및 해당 보관 파일의 SHA-256이 일치한다. 해당 `v014/files/` 파일을 직접 입력으로 읽으며 보관본을 수정하지 않는다.
- `provenance.json`은 승인 커밋·원본 tree·PR 번호, 132개 보관 파일 해시와 크기, 기존 v014 manifest 및 트릴 PNG 5개의 기록을 고정한다. 원본에 남아 있는 `skinKey`·`proposedRuntimePath`는 당시 제안이다.
- 실패·held 도안의 `proposed-state-treatment` 표시는 새 manifest의 `sourceApproval`에 그대로 남긴다. 파일 공급과 최종 실패색 강도의 제품 확정을 구별한다. 보관본의 미정 표시·수명 설명보다 후속 RFD 0037 §7을 우선한다.

## 생성과 검증

```sh
pnpm build:explicit-skin
pnpm build:explicit-skin --check
```

`scripts/build-explicit-skin.ts`는 저장소 안의 보관본과 이 폴더의 `roles.json`만 읽는다. 모든 원본 해시를 검사한 뒤 선택한 PNG를 재인코딩 없이 복사하고 결정적인 metadata를 만든다. 시각 제작 도구·브라우저·외부 파일·Git 접근은 생성에 필요하지 않다. SVG 자연 크기 나누기나 원본 갤러리 재생성을 하지 않는다.

출력은 `public/skins/classic-explicit/`의 PNG 55개와 `manifest.json`, 그리고 같은 바이트인 `src/game/skin/explicitSkinManifest.json`이다. `--check`는 쓰기 없이 원본과 출력의 일치를 검증하고 런타임 폴더에 예상하지 않은 파일이 있어도 거부한다. 기존 `public/skins/classic/`와 기존 빌더·loader·default manifest는 그대로 둔다.

## 순수 view 계약

`src/game/skin/explicitSkin.ts`의 `buildExplicitSkinView(baseUrl?)`와 `getExplicitSkinAsset(view, id)`를 사용한다. view는 Pixi·DOM·오디오·store·판정 세션을 import하지 않는다. 이미지 descriptor의 `url`, `pixelSize`, `logicalSize`, `contentRect`, 정규화 `anchor`, 선택적 `highResolution`과 역할·상태·방향을 제공한다. ID 전체는 `EXPLICIT_SKIN_ASSET_IDS`에 있다.

| ID 구성 | 가용 상태 |
| --- | --- |
| `point.single` | `pending` |
| `point.double`, `point.trill` | `pending`, `failed` |
| `body.single`, `body.double`, `body.trill` | `idle`, `held`, `failed` |
| `body.double` | `partialHeld.left/right`, `partialFailed.left/right` |
| `release.single`, `release.double` | `pending`, `failed` |
| `release.double` | `partialFailed.left/right` |
| `sustain.single` | `pending`, `failed` |
| `sustain.double` | `pending.left/right`, `failed.left/right` |
| `graceOverlay.point`, `graceOverlay.trill`, `graceOverlay.release` | `overlay` |

실제 ID에서는 `/`로 요약한 방향 중 하나만 쓴다(예: `sustain.double.failed.left`). 총 33개 역할이다. `point.single.failed`, Point의 좌우 부분 실패, 트릴 릴리즈·별도 트릴 유지·바디 Grace·terminal cap 등 공급하지 않은 역할은 거부한다. 다른 역할·스킨으로 fallback하지 않으며 필수 역할 누락·중복·잘못된 좌표·방향도 view 생성 때 거부한다.

- 싱글·더블 Point는 212×40, 트릴 Point와 모든 바디·릴리즈·유지는 200×40이다. 레인 중앙·자기 beat에 전체 캔버스 anchor `(0.5, 0.5)`를 맞춘다. 바디는 200×40 타일을 세로 반복하며 Point 기준 폭 212와의 비율을 보존한다. 시작·끝 마감은 없다.
- Grace는 본체와 별도 이미지다. Point overlay 260×88의 본체는 `(24,24,212,40)`, 릴리즈·트릴 overlay 248×88의 본체는 `(24,24,200,40)`이다. `@2x`도 동일한 논리 크기·패딩을 쓴다. `*-grace.png` 합성 참고본과 과거 terminal overlay는 export하지 않는다.
- 유지 single은 x=100, double은 x=84·116에 놓인다. double 좌우 파일 각각의 **전체 200×40 캔버스**와 투명 여백을 유지한다. 한쪽을 숨긴 뒤 남은 쪽을 잘라 재중앙 정렬하지 않는다.
- `partialHeld`의 side는 미충족 쪽(`sideMeaning: unmet`), `partialFailed`는 실패 쪽(`failed`), 유지 분리 레이어는 표식 쪽(`marker`)이다. 물리 키·손을 나타내지 않는다.
- 성공 alpha 0.7과 실패 도안 합성, 유지 성공 표식만 숨김, Grace 외곽의 독립 밝기는 이 정적 view가 판단하지 않는다. M1 공개 상태를 쓰는 후속 G1에서 적용한다.
