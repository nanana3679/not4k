# Classic 확정 에셋 · 판정 연결 검토용

2026-10-25. 선택을 마친 에셋 46개를 `assets/`에 묶었다. 이 묶음은 판정·렌더러 담당자가 적용 위치와 상태 대응을 검토하기 위한 자료다. 현재 `public/skins/classic/`, 스킨 로더, 판정 엔진은 변경하지 않는다.

`manifest.json`에는 각 파일의 크기·SHA-256·용도와 제안 스킨 키·런타임 경로를 적었다. `skinKey`와 `proposedRuntimePath`는 구현 제안이며 기존 API나 확정된 도메인 모델이 아니다. `source`는 제작 워크스페이스의 출처 기록이다. 이 묶음의 PNG·SVG는 모두 자체 포함 파일이며 해당 출처 경로나 Lab 갤러리 없이 열 수 있다.

## 확정 디자인

| 역할 | 싱글 | 더블 |
| --- | --- | --- |
| 누름 | ![기존 싱글](assets/note-single.png) | ![M6 70% 더블](assets/note-double-anodized-contrast-070.png) |
| 대기 바디 | ![싱글 바디](assets/body-single.png) | ![중앙 두 광선 더블 바디](assets/body-double-center-dual-beam.png) |
| 터미널 J2-C | ![싱글 터미널](assets/terminal-j2-shadow-3-single.png) | ![더블 터미널](assets/terminal-j2-shadow-3-double.png) |
| 일반 릴리즈 | ![싱글 릴리즈](assets/release-single.png) | ![더블 릴리즈](assets/release-double.png) |
| 유지 노트 D | ![싱글 유지](assets/sustain-single.png) | ![더블 유지](assets/sustain-double.png) |

- 싱글 누름은 기존 디자인을 유지한다. 더블 누름은 **M6 아노다이징 대비 70%**다.
- 더블 바디는 바깥 면을 유지하고 중앙 영역만 넓혀 **42%·58%**에 두 광선을 둔다.
- 터미널은 **J2-C**다. 광선 끝을 덮는 마감부이며 릴리즈 노트와 다른 에셋이다. PNG와 2배 PNG를 제공한다. 래스터 생성본이므로 벡터 SVG는 없다.
- 유지 노트는 **D 매듭 1.8배**다. 싱글은 x=100, 더블은 x=84·116에 매듭을 둔다(200×40 기준). 투명 표식만 들어 있으므로 바디 위에 얹는다. 길이 0도 길이 0 바디 위에 같은 표식을 얹는 디자인이다.
- Grace는 실제 윤곽을 따르는 별도 overlay다. 더블 릴리즈 일부 실패도 **전체 외곽**에 Grace를 둔다.

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

`*-grace.png`는 overlay를 본체에 합친 참고본이다. 실제 렌더러에서 별도 overlay를 사용할 경우 합성본을 다시 겹쳐 그리지 않는다. `@2x.png`는 400×80이며 기본 PNG와 같은 비율로 배치한다. SVG는 기존 제작 좌표계인 1000×200 또는 1060×200을 주로 사용하고, 유지 노트 SVG의 표시 크기만 200×40이다. 개별 크기는 매니페스트를 따른다.

## 판정 에이전트가 PR에 남길 내용

1. 독립 릴리즈·유지 노트 데이터에서 스킨 키로 연결할 이름과 렌더러 진입점. 현재 코드의 `holdOnly`·기존 롱노트 끝을 새 개념과 자동으로 같은 것으로 취급하지 않는다.
2. 바디·터미널·릴리즈·유지 노트의 레이어, 기준 시각, 시작/끝 터미널 반전·겹침 처리. 특히 길이 0 바디와 누름이 같은 위치에 있는 경우의 적용 위치.
3. 실패·일부 실패·처리 완료 때 각 에셋을 남길지 숨길지, 더블 좌우 유닛과 실패 에셋의 대응. 릴리즈 실패 그림이 있다는 이유로 바디 실패 후 릴리즈 입력 기회를 남기지 않는다.
4. 추가로 필요한 상태별 에셋. 이번 묶음에는 **새 더블 바디의 켜짐·부분 충족·실패**, **J2-C의 상태별 변형**, **M6 더블 누름의 실패 변형**, **유지 노트 실패·일부 실패**가 없다. 기존 상태 에셋을 섞으면 모양이 달라지므로 필요한 상태와 표시 규칙을 먼저 지정한다.

정책은 기존 도메인 문서와 판정 작업의 결정을 따르고, 이 자료에서 새 판정 규칙을 정하지 않는다. 현재 구현을 살필 경로는 `src/game/skin/{types,skins,SkinManager}.ts`, `src/game/renderer/GameNoteRenderer.ts`, `assets-lab/classic/states.mjs`, `scripts/build-classic-skin.ts`다. 실제 반영 시에는 생성 원본·빌드 경로와 `public/skins/classic/`를 함께 갱신해 재생성으로 되돌아가지 않게 한다.
