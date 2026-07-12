# RFD 0018: 레인 단일 모델 — Extra 노트를 차트의 확장 레인으로 통합

**Status:** Draft (2026-07-12)

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

### 3-1. 모델 (결정 후보)

- **A안(제안): `NoteEntity.lane: number`로 확장.** `Lane`(1|2|3|4)은 **게임 도메인 타입**으로 유지하고, 게임 경계(차트 로드/파서)에서 내로잉한다. 에디터·공유 모델은 `lane: number`.
- B안: `lane: Lane` 유지 + `extraLane?: number` 선택 필드 — 분기가 필드로 옮겨갈 뿐 이원화가 잔존. 기각 후보.

### 3-2. 규칙 × 레인 조건표

| 규칙 | 적용 범위 | 근거 |
| --- | --- | --- |
| `duplicate` / `longOverlap` | **전 레인** | 레인 축 검사라 자동 — 이 RFD의 발단(비대칭) 해소 지점 |
| `rangeInverted` / `beatMalformed` (구조) | **전 레인** | malformed는 레인 무관 |
| `trillExclusive` / `trillZoneOverlap` / `trillLong` | 메인만 | `trillZone.lane`은 `Lane` 유지 — 보조 레인에 존 배치 불가 |
| `stopZones` / 이벤트 계열 | 메인만 | 게임 판정 전제. 이벤트·존은 보조 레인에 **배치 자체가 불가**(생성 UI 제외) |

### 3-3. 게임 경계 — "게임은 lane ≤ 4만 본다"를 어디서 강제하나

- **(a) 직렬화 경계 분리(제안):** 저장 시 `lane > 4` 노트를 분리해 현행 보조 파일에 그대로 저장하고, 게임은 지금과 똑같이 차트 파일만 읽는다. **게임 런타임 코드 무변경 = 소비자 감사 불요, 파일 포맷 호환 자동.** 에디터 로드 시 두 파일을 병합(`extraLane → lane+4`)한다.
- (b) 런타임 필터: 게임 로더에서 `filter(lane <= 4)` — `JudgmentEngine`·`AutoPlayer`·`tutorialPreview` 등 소비자 감사 필요. (a) 대비 이득 없음, 기각 후보.

### 3-4. 저장 포맷

- **(a) 현행 2파일 유지(제안):** 3-3(a)의 귀결. 마이그레이션 불요 — 기존 보조 파일은 로드 병합 경로가 그대로 소화.
- (b) 단일 파일 v2: 마이그레이션 필요, 게임 로더 변경 필요. 이득 불명, 기각 후보.

### 3-5. 에디터 파급 — 사라지는 것

`LaneConversion` 모듈(변환 개념 소멸 — 그냥 레인 이동), 드래그 크로싱(`tryCrossToExtra/ToMain` + 취소 스냅샷), `Selection.extraNotes`(+`clearExtraSelection`, §3-5 특례), `moveExtra` 드래그 축과 `buildMovedExtraNotes`, `extraNoteViolationIndices`(→ `validateChart`로 흡수), 키보드 변환 특례(전부-lane4 조건), 클립보드 Extra 특례(RFD 0016 D3 자동 확장은 레인 클램프/확장으로 단순화), 히스토리 병렬 스냅샷.

**얻는 것:** 해칭·§3-5 게이트·저장/플레이 게이트·토스트가 보조 레인까지 자동 통일. 이후 모든 신규 기능이 "Extra는?"을 답할 필요가 없어진다.

### 3-6. 게이트 의미론 (결정 필요)

보조 레인 위반(보조끼리 겹침)도 **저장·플레이 게이트에 걸리는가?**

- **(a) 동일 취급(제안):** 보조도 제작 데이터고, §3-5의 목적(위반 방치 방지)이 레인을 가리지 않는다. 규칙이 하나라 단순.
- (b) 메인만 게이트: "게임에 안 나가는 데이터가 플레이를 막는 건 과하다"는 관점 — 단 검증 결과를 레인으로 다시 쪼개는 이원화가 재도입된다.

## 4. 대안

- **A. 현행 유지 + 소패치**(Extra 위반을 게이트·토스트에 포함): 비대칭 일부 해소, 2·3번 비용(변환 개념·코드 두 벌)은 잔존.
- **B. 검증만 통합**(모델은 유지, 검증 입력에 Extra 합성): 게이트는 통일되나 인덱스 공간이 둘이라 refs·선택 연동이 오히려 복잡해짐.
- **C. 레인 단일 모델(본 제안).**

## 5. 채택 방향 (제안)

**C + 3-1(A) + 3-3(a) + 3-4(a) + 3-6(a).** 게임·저장은 경계에서 무변경으로 봉인하고, 통합의 수술은 에디터·공유 모델 안에서만 일어난다.

## 6. 구현 제약 (실측 2026-07-12)

1. `extraNotes` 소비 24파일 — 슬라이스 분해 필수(모델→검증→선택/드래그→렌더→저장 경계 순 제안).
2. `Lane` 참조 18파일 — 게임 쪽은 `Lane` 유지, 에디터·모델 쪽만 `number`로. 내로잉 지점은 차트 파서.
3. 저장 경계는 `chartAssetPersistence`(두 파일 저장을 이미 한 곳에서 수행) — 분리 로직은 이 모듈만 수술.
4. 로드 병합: 기존 보조 파일(`parseExtraNotes`) → `lane = extraLane + 4` 매핑. 저장 시 역매핑.
5. `extraLaneCount` 축소 시 범위 밖(lane > 4+N) 노트 처리 규칙 필요(현행은 표시만 사라짐) — §8.

## 7. 영향 받는 문서

- `docs/context/glossary.md` — "Extra 노트"(재정의: 보조 레인 노트), "SelectionSlice"(extraNotes 축 소멸), "선택 해제 게이트"(특례 삭제), "차트 변이 게이트"
- `src/editor/CONTEXT.md` — Extra 노트·선택 서술
- `docs/spec/chart-editor.md` — 레인 이동·변환 행(변환 개념 삭제, 단일 레인 이동으로)
- RFD 0016 — 공존 서술 중 extraNotes 축 관련 각주

## 8. 미해결 질문 (grilling 대상)

1. **보조 레인에 `trill`/`trillLong` 타입 허용 유지?** 현행 `ExtraPointNote`는 trill을 허용한다(표시 전용이라 무해). 단일 모델에서는 "보조 레인 trill은 존 없이 존재"가 되는데, `trillLong` 헤드 필수 규칙을 보조에 적용할지(3-2 표의 메인-한정 목록에 넣을지) 결정 필요.
2. **3-6 게이트 범위** — (a) 동일 취급 vs (b) 메인만.
3. **`extraLaneCount`의 소속** — 현행 store 설정 → 차트 메타로 이동?(보조 노트가 차트 배열에 살면 레인 수도 차트 사실이 됨)
4. **레인 수 축소 시 범위 밖 보조 노트** — 삭제? 유지(표시만 숨김, 현행)? 축소 차단?
5. **선택·이동의 레인 연속성** — 메인 4와 보조 1(=lane 5) 사이를 한 칸 이동으로 취급(현행 키보드 변환과 동일 UX)하면 되는지, 시각 간극(경계선)과 함께 확인.
