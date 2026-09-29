# Classic 버전 보관

| 버전 | 구성 | 출처 |
| --- | --- | --- |
| [v001](v001/manifest.json) | 이전 유광 포인트·어두운 금속 바디·V 형태 터미널 | 교체 전 Git 상태 |
| [v002](v002/manifest.json) | 현재 고채도 포인트·아주 밝은 바디·바디와 같은 터미널 | 2026-09-29 적용 작업본 |
| [v003](v003/manifest.json) | 고채도 포인트·S05/D05 짙은 바디·바디와 같은 터미널 | 2026-09-29 Lab 비교용 |
| [v004](v004/manifest.json) | 옅은 원본 포인트·S05/D05 짙은 바디·공용 터미널 | 2026-09-29 사용자 정정 반영 |

현재 적용본은 **v002**다. v003은 밝기 비교 페이지의 5단계 싱글(S05)·더블(D05) 바디를 적용한 Lab 비교용이다. v004는 사용자 정정에 따라 같은 짙은 바디에 옅은 원본 포인트를 조합한다. 네 버전 모두 싱글·더블·트릴, 대기·홀드·부분충족·실패, 봄과 버튼을 포함한다. 공유 기어 이미지도 함께 보관한다. 비교 시안은 기존 `../revisions/`에 유지한다.

## 보관 범위

각 버전의 `files/`는 저장소 상대 경로를 보존한다.

- `public/skins/classic/`: 실제 플레이에 쓰는 전체 PNG
- `public/lab/note-assets/classic/`: 같은 버전의 Lab SVG
- `assets-lab/classic/sources/`: 원본 SVG
- Classic 생성 모듈, 빌드 스크립트, 봄 CSS·효과 코드
- 스킨 설정·타입·공유 기어 PNG, 의존성 버전 파일

`manifest.json`에는 출처 Git 커밋, 작업본 여부, 저장 시각과 각 파일의 SHA-256을 기록한다. `source.baseCommit`은 복원 기준 커밋이며, 작업본 버전의 변경이 그 커밋에 커밋되었다는 뜻은 아니다. 보관본 전체는 `assets-lab/`에 유지한다. Lab에 등록한 버전은 PNG·Lab SVG·기어 이미지만 공개 Lab 빌드에 포함하며 일반 게임 빌드에는 추가하지 않는다.

## Lab에서 비교

`/lab/note-assets?design=classic`의 ‘버전’ 선택기에서 현재 적용본·v004·v003·v002·v001을 고른다. 직접 링크는 `/lab/note-assets?design=classic&version=v001`이며 S05/D05와 옅은 포인트는 `/lab/note-assets?design=classic&version=v004`으로 연다. 선택한 차트를 유지한 채 해당 버전의 재생기와 에셋 랙을 함께 교체하며, 실제 게임의 스킨 설정이나 현재 에셋 파일에는 영향을 주지 않는다.

새 보관 버전을 Lab에 공개하려면 `src/lab/classicSkinVersions.ts`에 해당 보관본의 스킨 매니페스트·ID·설명을 추가한다. 이전 버전의 테마를 현재 설정에서 가져오지 않는다. 개발 서버와 Lab 빌드는 등록된 버전만 검증하고 공개한다.

## 다음 버전 저장

현재 에셋을 생성·확인한 다음 새 번호로 저장한다.

```sh
pnpm build:classic
node scripts/classic-versions.mjs save v005 "변경한 디자인 설명"
node scripts/classic-versions.mjs verify v005
```

기존 번호로 저장하면 오류로 종료한다. 보관본의 파일을 수정하지 않고 새 버전을 만든다. 저장·검증 명령은 현재 스킨을 교체하지 않는다.

과거 커밋의 버전도 현재 작업 파일을 건드리지 않고 저장할 수 있다.

```sh
node scripts/classic-versions.mjs save v006 "과거 디자인 설명" <Git-commit>
```

## 이전 버전 복원

먼저 `verify`로 보관본을 검증한다. PNG만 다시 사용할 때는 해당 버전의 `files/public/skins/classic/`와 Lab SVG를 함께 가져온다. 계속 편집하거나 재생성하려면 원본·생성 코드·설정도 같은 버전으로 맞춘다.

안전하게 검토하려면 `manifest.json`의 `source.baseCommit`에서 별도 워크트리를 만들고 `files/` 전체를 그 루트에 겹쳐 복사한다. 보관된 `package.json`과 `pnpm-lock.yaml`로 의존성을 설치하면 해당 빌드 입력으로 재생성할 수 있다. 이 절차는 현재 작업본에 덮어쓰지 않고 과거 버전을 확인하기 위한 방법이다.
