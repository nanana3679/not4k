# RFD 0108: 편집 값의 단계를 초안·지금 값·마지막 저장 값으로 부른다

**Status:** Accepted (2026-11-14) · glossary·term-map·에디터 식별자·스펙·컨텍스트 반영 (2026-11-14)

## 기존 결정과 문제의식

에디터는 편집한 값을 입력칸, store, DB 순서로 넘긴다. 단계마다 부르는 말이 문서와 코드에서 달랐다. 마지막으로 불러오거나 저장한 값은 곡 쪽 코드에서 `song.baseline`, 차트 쪽 코드에서 `savedChartJson`, 문서에서 "저장 기준"이었다. store에 적용했지만 저장하지 않은 값은 문서에서 "편집 초안"이었는데, 코드의 `draft`(`offsetDraft`)는 store에 적용하기 전 입력칸의 값이었다. #456 이해 확인에서 사용자는 `baseline`이 마지막 저장 값이라는 것을 이름만으로 알 수 없고, 같은 말이 두 단계를 가리켜 헷갈린다고 했다(2026-11-14).

## 검토한 대안과 채택안

사용자가 단계별 후보를 비교해 고른 이름을 저장소 전체에서 쓴다(2026-11-14).

| 단계 | 문서 | 식별자 | 다음 단계로 넘기는 동작 |
| --- | --- | --- | --- |
| 입력칸에만 있음 | 초안 | `draft` | commit |
| store에 적용했고 DB에 저장하기 전 | 지금 값 | `current` | save |
| DB에 저장됨 | 마지막 저장 값 | `lastSaved` | 없음 |

- **초안**: `input`은 게임의 키 입력(`src/game/input`)과 겹치고, `uncommitted`는 길고 부정형이다.
- **지금 값**: `store`는 마지막 저장 값도 store에 있어 단계를 가르지 못하고 '저장하다'로 읽힌다. `edited`는 편집하지 않았을 때 틀린 말이 되고, `working`은 낯설다.
- **마지막 저장 값**: `saved`는 '저장하려는 것'으로도 읽히고(`completeSongSave(saved)`), `persist`는 브라우저 저장소(게임 설정 `not4k-settings`, `persistTutorialViewedIds`)와 Supabase Storage·DB(`chartAssetPersistence`) 양쪽에 쓰는 동작이라, `persisted`만으로는 어느 저장소의 값인지 드러나지 않는다. `committed`는 commit이 이미 초안을 지금 값으로 넘기는 동작이라 맞지 않고, `initial`은 저장하면 바뀌는 값이라 맞지 않는다. `baseline`은 비교 기준이라는 역할만 말하고 출처를 드러내지 않는다.

`pending`은 판정 엔진·렌더러·붙여넣기·곡 저장에서 '무언가를 기다린다'는 일반 뜻으로 쓰므로 단계 이름으로 정하지 않는다. 저장할 때 올릴 파일과 다시 만들 프리뷰 클립의 구간은 지금 값에 속하며 지금 이름(`pendingAudioFile`·`pendingJacketFile`·`pendingPreviewRange`)을 유지한다. 단계를 가리키지 않는 쓰임(`currentTime`, `ref.current` 등)은 이 규칙의 대상이 아니다.

## 영향과 검증

glossary에 [편집 값의 단계](../context/glossary.md#편집-값의-단계)를 두고 term-map E 표에 세 행을 더한다. 에디터 식별자(`song.baseline` → `song.lastSaved`, `songValues` → `currentSongValues`, `savedChartJson` → `lastSavedChartJson` 등)와 스펙·컨텍스트·코드 주석·테스트 이름의 "저장 기준"·"편집 초안"을 같은 PR에서 고친다. 지난 RFD는 결정 기록이라 고치지 않는다. 동작은 바꾸지 않으며 타입 검사와 단위 테스트로 확인한다.
