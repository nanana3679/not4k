# RFD 0018: 레인 단일 모델 — Extra 노트를 차트의 확장 레인으로 통합

**Status:** Accepted (2026-07-12) — §8 미결 grilling으로 전량 확정 · 개정 R1 (`laneAxis` 경계 레이어·라이브 진입 경계) · 개정 R2 (슬라이스 착지 전략 shim+store flip, `laneAxis` 프리미티브 보강, D3 상태 정정 — R2 리뷰에서 R1 발견 전량 RESOLVED 판정) · **구현 완료 (2026-07-13, ①~⑤ 전량 main merged: PR #96 문서·#97 ③ store flip·#98 ④⑤ 이원축 제거+D3+docs)** · 차트 파일 쌍 DB revision 원자 게시와 단계적 배포 gate 구현 (2026-07-31, PR #157)

**관련 문서:**

- [`docs/rfd/0016-editor-selection-handle-model.md`](0016-editor-selection-handle-model.md) — 선택 모델(Extra 공존 축은 본 RFD로 소멸 후보)
- [`docs/rfd/0017-optimistic-edit-transient-invalid.md`](0017-optimistic-edit-transient-invalid.md) — 검증·게이트 체계(본 RFD가 그 적용 범위를 전 레인으로 확장)
- [`src/shared/types/chart.ts`](../../src/shared/types/chart.ts) — `NoteEntity`·`ExtraNoteEntity`·`Lane`
- [`docs/context/glossary.md`](../context/glossary.md) — "Extra 노트"·"SelectionSlice"·"선택 해제 게이트"
- [`docs/spec/chart-editor.md`](../spec/chart-editor.md) — 레인 이동·변환 행

---

## 1. 배경 — 현행: 전 층위 이원화

Extra 노트는 "게임 플레이에 등장하지 않는 에디터 보조 노트"로, **차트 밖 별도 모델**로 설계되었다. 그 결과 모든 층위가 두 벌이다:

| 층 | 메인 | Extra |
| --- | --- | --- |
| 모델 | `chart.notes` (`lane: Lane = 1\|2\|3\|4`) | store 별도 `extraNotes: ExtraNoteEntity[]` (`extraLane: number`) — 차트 밖 |
| 검증 | `validateChart` → 해칭 + 선택 해제 게이트(§3-5) + 저장·플레이 게이트 + 토스트 | `extraNoteViolationIndices` → **해칭만**(게이트·토스트 없음) |
| 선택 | `selection.notes` (§3-5 게이트 대상) | `selection.extraNotes` (게이트 제외 특례) |
| 이동 | `move` 드래그 축, `buildMovedNotes` | `moveExtra` 축, `buildMovedExtraNotes`, 레인 경계에선 **변환**(`LaneConversion`) |
| 저장 | 차트 파일(`songChartPath`) | 별도 파일(`songChartExtraPath`, `serializeExtraNotes`) |
| 히스토리 | `chart` 스냅샷 + 축소 커밋 원자 clear | `extraNotes` 병렬 스냅샷, 축소 clear 규칙 없음 |

**실측(2026-07-12):** `extraNotes`/`ExtraNoteEntity`/`extraLane`을 만지는 파일 **24개**(에디터 19·shared 5). `Lane` 리터럴 타입 참조 파일 **18개**.

## 2. 문제 — 이원화의 비용 (전부 실사용에서 실측된 사례)

1. **검증 비대칭.** 같은 "겹침"인데 Extra 레인에서는 알림(토스트)·게이트가 없다 — 2026-07-12 수동 회귀에서 사용자 혼란으로 보고. 해칭도 별도 함수(`extraNoteViolationIndices`)로 뒤늦게 붙였고(§ 통합 슬라이스 4), §3-5 게이트는 `removed.extraNotes`를 특례로 제외한다.
2. **"변환"이라는 개념 자체가 이원화의 산물.** 메인↔Extra 이동이 레인 이동이 아니라 타입·배열을 바꾸는 변환(`convertMainToExtra`/`convertExtraToMain`)이다. 그래서 키보드(lane4↔extra1 스텝 변환)와 드래그(경계 즉시 변환 + 리베이스 + 취소 스냅샷 복원)에 각각 특례가 필요했고, 드래그 판은 "순간이동" 문제까지 겪었다.
3. **코드 두 벌.** 선택 두 집합, 드래그 두 축, 이동/삭제/복사/히트테스트/렌더 두 경로, 히스토리 병렬 스냅샷. 새 기능마다 "Extra는?"을 따로 답해야 하고, 빠뜨리면 1번 같은 비대칭이 태어난다.

## 3. 제안 — 레인 단일 모델

**핵심: "Extra 노트"라는 별도 엔티티를 없앤다.** 노트는 하나의 배열(`chart.notes`)에 살고 `lane` 번호로만 구분한다 — 메인 레인 `1..4`는 게임이 판정하고, **보조 레인 `5..4+extraLaneCount`는 에디터 표시 전용**이다. 시각(렌더 위치·색)과 제약(규칙별 레인 조건)만 레인 번호로 갈린다.

### 3-1. 모델 (확정)

- **A안(채택): `NoteEntity.lane: number`로 확장.** `Lane`(1|2|3|4)은 **게임 도메인 타입**으로 유지하고, 게임 경계에서 내로잉한다. 에디터·공유 모델은 `lane: number`.
- B안: `lane: Lane` 유지 + `extraLane?: number` 선택 필드 — 분기가 필드로 옮겨갈 뿐 이원화가 잔존. 기각.

**`laneAxis` 경계 레이어 (2026-07-12 개정 확정):** 메인/보조 경계 지식(어디까지가 게임 레인인가)을 **아주 얇은 단일 모듈이 단독 소유**한다 — 경계마다 `lane <= 4` 필터를 흩뿌리지 않는다(`ViewportSlice`·`SelectionSlice`의 단독 소유 철학과 동형). 가칭 `src/shared/chart/laneAxis.ts`:

- `MAIN_LANE_COUNT = 4` — 경계 상수의 유일한 서식지
- `isMainLane(lane)` / `isAuxLane(lane)` — 규칙 조건표(§3-2)·렌더 분기가 사용
- `mainNotes(notes)` / `auxNotes(notes)` — **게임으로 노트가 넘어가는 모든 진입점과 직렬화 분리가 사용하는 유일한 필터**
- `toAuxIndex(lane)` / `fromAuxIndex(i)` — 보조 파일 포맷(`extraLane` 1-기반)·보조 영역 렌더 x 계산과의 왕복 매핑
- `maxAuxLane(notes)` — 로드 병합의 자동 확장(`maxUsedLane` 계승) 산술의 중앙화 (R2 보강)
- `isVisibleLane(lane, extraLaneCount)` — §6-5 숨김 경계 판정. 이것이 없으면 `MAIN_LANE_COUNT + extraLaneCount` 산술이 렌더 사이트로 새 나가 불변식이 무너진다 (R2 보강, 사실상 필수)

**불변식: `lane > MAIN_LANE_COUNT`를 아는 코드는 이 모듈과 그 직접 소비자(경계 지점)뿐이다.** 직접 소비자 범주: 게임 진입 필터·직렬화 분리/병합·규칙 조건(§3-2)·**좌표 투영(보조 영역 x·시각 경계선)**·숨김 경계. 나머지 코드(이동 델타·선택·삭제·복사·히스토리·검증 refs)는 노트를 레인 무차별로 다룬다. **관할 밖:** 이벤트의 `editorLane`(별도 1-기반 배치 공간, Extra 노트가 아님)은 이 레이어가 통합하지 않는다.

### 3-2. 규칙 × 레인 조건표

| 규칙 | 적용 범위 | 근거 |
| --- | --- | --- |
| `duplicate` / `longOverlap` | **전 레인** | 레인 축 검사라 자동 — 이 RFD의 발단(비대칭) 해소 지점 |
| `rangeInverted` / `beatMalformed` (구조) | **전 레인** | malformed는 레인 무관 |
| `trillExclusive` / `trillZoneOverlap` / `trillLong` | 메인만 | `trillZone.lane`은 `Lane` 유지 — 보조 레인에 존 배치 불가. **보조 레인의 `trill`·`trillLong` 타입 배치는 허용**(현행 계승, 표시 전용) — 존 배타·헤드 필수 규칙은 보조에 미적용(§8-1 결정) |
| `stopZones` / 이벤트 계열 | 메인만 | 게임 판정 전제. 이벤트·존은 보조 레인에 **배치 자체가 불가**(생성 UI 제외) |

### 3-3. 게임 경계 — "게임은 lane ≤ 4만 본다"를 어디서 강제하나 (2026-07-12 개정)

**원칙: 게임으로 노트가 넘어가는 진입점은 전부 `laneAxis.mainNotes()`를 지난다.** 진입점은 파일만이 아니다 — 리뷰 실측(2026-07-12)으로 확정한 전수 목록:

| 진입점 | 경로 | 처리 |
| --- | --- | --- |
| 곡 선택 플레이 | 차트 **파일** 로드(`LoadingScreen` → `loadSongData`) | 저장 시 이미 분리돼 파일에 lane ≤ 4만 → **게임 로더 무변경** |
| **테스트플레이**(프리뷰 진입도 동일 경로 공유) | 에디터 라이브 `chart` 객체를 **직렬화 없이 직접** 전달(`performPlayTest` → `game.setChartData`, `useFileOperations.ts:91`) | **`mainNotes()` 필터 필수 — 위치는 호출자가 아니라 `performPlayTest` 내부**(현행 진입 게이트 자리): 에디터 툴바와 DEV lab(`JudgmentPlaytestPage`)이 이 함수를 공유하는 **유일 초크포인트**라 한 곳으로 전부 커버된다(R2 실측). 현행은 보조가 별도 배열이라 이 경로가 *공짜로* 안전했다 — 통합이 그 암묵 보호를 없애므로 명시 필터로 대체한다. 게임의 판정·렌더·점수 분모는 전부 `gameStore.chartData` 단일 퍼널에서 파생되므로(`PlayScreen`) 진입 필터 하나가 아래 피해 전부를 동시 봉인한다. 필터 후 `totalJudgments` 등 분모가 lane ≤ 4 기준인지 확인 |
| 저장 | `chartAssetPersistence` | `mainNotes()` → 차트 파일, `auxNotes()`+`toAuxIndex` → 보조 파일(현행 포맷 유지) |

미필터 시 실측 피해(리뷰 감사): 보조 포인트 노트 auto-Miss로 콤보 파괴(`JudgmentEngine:546-581`), 보조 롱노트 영구 미판정(`:959-972`), 달성률 분모 오염(`PlayScreen:120-139`), 필드 밖 렌더(`GameNoteRenderer:461`). (안전 확증: 곡 선택 튜토리얼 프리뷰(`TutorialPreviewPlayer`)는 `gameStore`를 거치지 않는 하드코딩 차트 별도 경로라 관할 밖 — `src/game/` 트리에 extraNotes 참조 0건.)

(기각: 게임 로더 내부 필터 — 게임 코드 수정이 필요하고, 위 표처럼 에디터 쪽 진입점에서 `mainNotes()`로 벗기면 게임 내부는 실제로 무변경이다. "무변경" 주장의 유효 범위는 **게임 내부 코드**이지 "필터 불요"가 아니다.)

### 3-4. 저장 포맷

- **(a) 현행 2파일 유지(제안):** 3-3(a)의 귀결. 마이그레이션 불요 — 기존 보조 파일은 로드 병합 경로가 그대로 소화.
- (b) 단일 파일 v2: 마이그레이션 필요, 게임 로더 변경 필요. 이득 불명, 기각 후보.

### 3-5. 에디터 파급 — 사라지는 것 (대표 목록 — 전수 인벤토리는 구현 슬라이스에서)

`LaneConversion` 모듈(변환 개념 소멸 — 그냥 레인 이동), 드래그 크로싱(`tryCrossToExtra/ToMain` + 취소 스냅샷), `Selection.extraNotes`(+`clearExtraSelection`, §3-5 특례), `moveExtra` 드래그 축(`buildMovedExtraNotes`·`moveExtraByLane`·`moveExtraBySnapImpl`·`areExtraNotesInBounds`·`originalExtraPositions`), **SelectMode 박스 셀렉트의 두 번째 축**(`_boxEndExtraLane`·`dragStartExtraLane`·`xToExtraLane`/`getExtraLaneCount` 콜백 — 약 20참조), 좌표 이원축(`timelineXToExtraLane`·`hitTestExtraNoteAt`), 렌더러 보조 뷰 상태(`_selectedExtraNotes`·`_violatingExtraNoteIndices`), `extraNoteViolationIndices`(→ `validateChart`로 흡수), 키보드 변환 특례(전부-lane4 조건), 히스토리 병렬 스냅샷, **dirty 스냅샷의 별도 `serializeExtraNotes` 호출**(App·EditorToolbar).

클립보드: 상속된 RFD 0016 **D3(붙여넣기 시 보조 레인 자동 확장)는 유지**한다 — §8-6 결정 참조(§8-4 숨김과의 관계 포함).

**얻는 것:** 해칭·§3-5 게이트·저장/플레이 게이트·토스트가 보조 레인까지 자동 통일. 이후 모든 신규 기능이 "Extra는?"을 답할 필요가 없어진다.

### 3-6. 게이트 의미론 — **결정: (a) 동일 취급 (2026-07-12)**

보조 레인 위반(보조끼리 겹침)도 저장·플레이 게이트, §3-5 해제 게이트, 토스트에 **메인과 동일하게** 걸린다. 보조도 제작 데이터고, §3-5의 목적(위반 방치 방지)이 레인을 가리지 않으며, 규칙이 하나라 단순하다. (기각: 메인만 게이트 — 검증 결과를 레인으로 다시 쪼개는 이원화가 재도입됨.)

**경계 명시(리뷰 반영):** 보조 레인 위반은 **전 레인 규칙(`duplicate`·`longOverlap`·구조 검사)에서만** 발생한다 — 트릴 전용 규칙은 §3-2대로 메인 한정이므로 보조 trill의 헤드 부재·존 밖 존재는 위반이 아니다. 따라서 "동일 취급" 게이트는 공허하지 않되(보조끼리 겹침은 실제로 걸림) 트릴 규칙과 모순되지도 않는다.

**숨은 위반의 저장 차단(리뷰 CONCERN, §8-7 결정):** §8-4(축소 시 숨김)와 결합하면 화면에 없는 보조 노트의 위반이 저장을 막을 수 있다. 저장 게이트 차단 토스트는 위반 노트가 **현재 표시 범위 밖 보조 레인에 있으면 그 사실과 필요한 레인 수를 명시**한다(예: "숨은 보조 레인(7)의 위반 — 보조 레인 수를 7까지 늘리면 보입니다"). 로드 시에는 현행 `maxUsedLane` 자동 확장이 이 상태를 예방하며, 그 보장은 로드 병합(§3-3 표)이 계승한다.

## 4. 대안

- **A. 현행 유지 + 소패치**(Extra 위반을 게이트·토스트에 포함): 비대칭 일부 해소, 2·3번 비용(변환 개념·코드 두 벌)은 잔존.
- **B. 검증만 통합**(모델은 유지, 검증 입력에 Extra 합성): 게이트는 통일되나 — `validateChart`의 `refs`는 단일 note-index 공간을 전제하고(RFD 0017의 `violationsInvolving`·해칭·§3-5 게이트가 전부 이 인덱스로 귀속), 두 배열을 합성 검증하면 위반→선택→해칭 귀속마다 합성 인덱스 ↔ (notes[i] | extraNotes[j]) 번역 층이 필요해진다. C는 배열이 하나라 이 번역 자체가 소멸.
- **C. 레인 단일 모델(본 제안).**

## 5. 채택안 (확정 2026-07-12, 개정 반영)

**C(레인 단일 모델) + 3-1(A: `lane: number` + `laneAxis` 경계 레이어) + 3-3(모든 게임 진입점 = `mainNotes()` 경유, 파일·라이브 공통) + 3-4(a: 현행 2파일 유지) + 3-6(a: 게이트 동일 취급).** 게임 내부 코드·파일 포맷은 경계에서 봉인하고, 통합의 수술은 에디터·공유 모델 안에서만 일어난다. §8 미결은 grilling·리뷰로 7건 전량 확정.

## 6. 구현 제약 (실측 2026-07-12, 리뷰 보정 반영)

1. `extraNotes` 소비 **24파일**(에디터 19·shared 5, §1과 동일 실측) — 슬라이스 분해 필수. **착지 전략(R2 재설계 — 핵심: 데이터 이주 전에 리더를 먼저 옮긴다):**
   - **①a** `NoteEntity.lane: Lane → number` 타입 확장만 — supertype 확장이라 무동작·전부 green(`chart.notes`엔 여전히 lane ≤ 4만)
   - **①b** `laneAxis` 모듈 신설 + 단위 테스트 — 소비처 없는 휴면 착지
   - **①c** 게임 진입 필터를 `performPlayTest` 내부에 배치 + 경계 테스트 — 보조가 아직 별도 배열이라 no-op이지만 경계를 먼저 고정
   - **② 파생 통합 읽기뷰 shim**: `[...chart.notes, ...extraNotes를 fromAuxIndex로 변환]` 셀렉터를 도입하고 **읽기 소비자**(렌더·미니맵 `isMainLane`·검증 흡수)를 점진 이전 — 데이터는 아직 `extraNotes[]`에 존재하므로 각 이전이 독립 green
   - **③ 원자 store flip**: 보조 노트를 `chart.notes`로 이주 + `extraNotes[]` 삭제 + **writer 전환**(저장 분리·로드 병합·dirty 스냅샷·히스토리 단일화)을 한 커밋으로 — 리더가 이미 shim을 소비 중이라 폭발 반경이 writer/store로 국한. 저장 분리+로드 병합은 왕복 짝이라 반드시 이 커밋에 함께
   - **④** 선택/드래그 세분(박스 2축 제거 / 크로싱 제거 / moveExtra 흡수) → **⑤** docs
   - (기각: 초안의 "②저장→⑤렌더" 순서 — 데이터 이주(②)와 리더 전환(⑤) 사이 중간 커밋이 red가 되는 결함을 R2가 실측)
2. `Lane` 참조 총 26파일 중 **전환 대상 ~18**(에디터·모델 → `number`), **게임 8파일은 `Lane` 유지**. `as Lane` 캐스트 비테스트 16지점(테스트 포함 196 — green엔 무영향이나 테스트 수정 작업량 주의). 타입만으로 lane>4 유입을 못 잡으므로 게임 경계 필터에 **테스트를 명시**.
3. 직렬화 경계는 1모듈이 아니라 **3사이트**: 저장 분리(`chartAssetPersistence.buildChartAsset`) + **에디터 로드 병합**(`App.tsx:137-154` — legacy-embedded fallback·`maxUsedLane` 자동 확장과 엉킴, 그 보장 계승 필수) + **dirty 스냅샷**(App·EditorToolbar의 별도 `serializeExtraNotes` 비교). 자동 저장·백업·export 등 제4 경로 없음(R2 전수 확인). **추가 제약 2건**: (a) 로드 직후 `auxNotes()+toAuxIndex` 재직렬화가 원본 보조 파일과 **바이트 동일**해야 허위 dirty가 안 뜬다 — 보조 노트의 상대 순서 보존 필수. (b) `SaveChartAssetInput`에서 `extraNotes` 필드는 제거(차트에서 파생)하되 `extraLaneCount`는 유지(§8-3).
4. 로드 병합: 기존 보조 파일(`parseExtraNotes`) → `laneAxis.fromAuxIndex` 매핑. 저장 시 역매핑. 마이그레이션 불요(포맷 무변경).
5. `extraLaneCount` 축소 시 범위 밖(lane > 4+N) 노트는 **숨김 유지**(§8-4 결정 — 현행 계승): 데이터는 남고 표시만 사라지며, 레인 수를 되돌리면 다시 보인다. 숨은 위반의 저장 차단 안내는 §3-6.
6. **`chart.notes`의 lane≤4 가정 소비자 전수 감사**(RFD 0017 §3-4 방법론의 대칭 작업): 게임 런타임은 §3-3 표로 봉인되나, **에디터 내 소비자**(미니맵 `MinimapRenderer:243-249` — lane>4를 4레인 트랙 밖에 그림, 파형·그리드·클립보드 등)를 구현 전 전수 확인. 미니맵은 스펙("보조 레인은 미니맵에 표시하지 않음")대로 `isMainLane` 필터.

## 7. 영향 받는 문서·기존 결정

- `docs/context/glossary.md` — "Extra 노트"(재정의: 보조 레인 노트), "SelectionSlice"(extraNotes 축 소멸), "선택 해제 게이트"(특례 삭제), "차트 변이 게이트", **`laneAxis` 표제어 신설**
- `src/editor/CONTEXT.md` — Extra 노트·선택 서술
- `docs/spec/chart-editor.md` — 레인 이동·변환 행(변환 개념 삭제, 단일 레인 이동으로), **미니맵 행("보조 레인 미표시" — `isMainLane` 필터로 이행)**
- `e2e/` — 선택·이동·메인↔보조 드래그 플로우 스펙
- RFD 0016 — 공존 서술 중 extraNotes 축 관련 각주. D3(자동 확장)는 §8-6으로 계승.
- **RFD 0017 충돌 기록**: 0017 §3-4가 "신설 예정"으로 남긴 **레인범위 구조 검사**("존재하지 않는 레인 참조 = malformed")는 본 RFD로 **재정의된다** — `lane > 4`는 더 이상 malformed가 아니고, 상한(`4+extraLaneCount`)은 차트 밖 store 설정(§8-3)이라 **구조 검증(차트만 입력)으로는 판정 불가능**하다. 하한·비정수(`lane < 1`, 소수)만 구조 후보로 남고, 상한 초과는 로드 병합의 `maxAuxLane` 확장과 §8-4 숨김이 담당한다. **역방향 동기화 필수(R2)**: 0017 §3-1·§3-4·§7의 해당 문구에 본 RFD를 가리키는 전방 note를 삽입하는 작업을 **구현이 아니라 문서 동기화 슬라이스(⑤)에 명시 포함**할 것 — 0017만 읽은 구현자가 `lane > 4` 거부 검사를 신설하는 사고 방지.

## 8. 미해결 질문 — **전량 결정 (2026-07-12 grilling)**

1. ~~보조 레인에 `trill`/`trillLong` 타입 허용 유지?~~ **→ 허용.** 표시 전용이라 무해(현행 계승). 트릴 계열 규칙(존 배타·헤드 필수)은 메인 한정 — 3-2 표에 반영.
2. ~~3-6 게이트 범위~~ **→ (a) 동일 취급.** 3-6에 반영.
3. ~~`extraLaneCount`의 소속~~ **→ 현행 store 설정 유지.** 차트 메타로 옮기지 않는다 — 보조 레인 수는 제작 환경 설정이지 차트 사실이 아니다. **단(R2 명확화):** 이 값은 로드 병합(`maxAuxLane` 자동 확장)과 붙여넣기(§8-6 자동 확장)에서 **노트 데이터로부터 자동 유도**되고, 사용자의 명시 축소만 순수 설정으로 남는다 — "설정"이되 데이터에 하향 종속되는 설정이다.
4. ~~레인 수 축소 시 범위 밖 보조 노트~~ **→ 숨김 유지(현행 계승).** 데이터 보존, 표시만 숨김 — §6-5에 반영.
5. ~~선택·이동의 레인 연속성~~ **→ 확정.** 메인 4 ↔ 보조 1(lane 5)은 한 칸 이동으로 연속 취급(현행 키보드 변환 UX 계승) — "변환"이 아니라 그냥 레인 이동이 된다. **연속은 논리적(lane±1)이다** — 렌더 x는 시각 경계선을 사이에 둔 별도 보조 영역이라 기하학적으로 연속이 아니다(오독 주의, R2).
6. **(리뷰 추가) 붙여넣기의 보조 레인 초과 → D3 자동 확장 채택 (2026-07-12).** 정정(R2): D3는 RFD 0016이 **미구현 후속**으로 남긴 계획 델타라 "유지"가 아니라 **본 통합에서 신규 구현**하는 것이다(현행 paste 경로는 `setExtraLaneCount`를 호출하지 않음). §8-4(숨김)와 충돌이 아니라 **연산별 정책으로 양립**: 방금 붙여넣은 노트가 안 보이면 안 되므로 **붙여넣기는 자동 확장**, 사용자가 의도적으로 줄인 **레인 수 축소는 숨김 유지**.
7. **(리뷰 추가) 숨은 보조 위반의 저장 차단 안내 (2026-07-12).** §3-6에 반영 — 차단 토스트가 숨은 보조 레인 위반임과 필요한 레인 수를 명시한다.
