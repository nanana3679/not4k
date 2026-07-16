# RFD 0019: 휴지 구간(`restZone`) — 저작 레인 안내

**Status:** Accepted (2026-07-16) · Phase 1 시각 프로토타입 구현 (2026-07-16, commit b9d74d8, throwaway 자동 파생) · Phase 2 데이터 모델·직렬화·검증 구현 (2026-07-16, commit 1d593d5) · Phase 2 게임 렌더 저작 소스 교체+파생기 삭제 (2026-07-16, commit d85a8b7) · 에디터 검증 게이트 restZones 배선 (2026-07-16, commit c1ba67e) · 에디터 저작 UX·restZone 렌더·위반 해칭 미구현

**구현 기록 (2026-07-16, Phase 1):** 시각 효과만 눈으로 확정하기 위한 프로토타입. 활성 레인 base 톤을 올리고(`LANE_BG_EVEN/ODD` = 0x26263f/0x202038) 빈 구간을 어두운 밴드로 dim(`REST_ZONE_ALPHA` = 0.72). 밴드는 `trillZone` 렌더 패턴을 복제(스크롤·컬링·풀), 다음 점유 1박 전에 종료. 이 단계의 구간 데이터는 **`restZonePreview.ts`의 throwaway 자동 파생**(노트 공백 threshold 4박)이며 Phase 2에서 저작 데이터로 교체·삭제한다. threshold 4박·margin 1박·dim/리프트 값이 시각 검증으로 확정됐다.

**관련 문서:**

- [`src/shared/CONTEXT.md`](../../src/shared/CONTEXT.md) — Shared chart model(차트 구조·구간 이벤트·직렬화)
- [`src/editor/CONTEXT.md`](../../src/editor/CONTEXT.md) — Chart editor(편집 모드·배치 제약·선택)
- [`docs/context/glossary.md`](../context/glossary.md) — `restZone` 정의
- [`docs/context/term-map.md`](../context/term-map.md) — A(발명+코드) 분류: `restZone`
- 코드: [`src/game/renderer/GameRenderer.ts`](../../src/game/renderer/GameRenderer.ts)(밴드 렌더), [`src/game/renderer/constants.ts`](../../src/game/renderer/constants.ts)(색)

---

## 1. 배경

not4k의 정체성은 **가변 손배치**다 — 유저가 곡 흐름에 따라 담당 레인을 실시간으로 옮긴다(수평 손 이동, `PP-009`). 차트 제작자는 특정 구간에서 **한 손을 파킹**시키는(그 레인을 당분간 비우는) 배치를 의도적으로 설계한다. 그 빈 구간이 "손을 떼서 옮겨도 되는 창"이다.

그러나 **첫 플레이에 이 의도를 알아채기 어렵다.** 레인이 당분간 비는 것은 화면상 노트가 안 떨어지는 것으로만 드러나고, 유저는 그 빈틈이 "충분히 길어서 손을 옮겨도 되는지"를 스스로 확신하지 못한다. 결과적으로 제작자가 유도한 손 이동이 전달되지 않는다.

## 2. 문제

제작자가 "이 레인은 이 구간 동안 안 쓴다"는 **의도**를 표면화할 장치가 없다. 이 정보가 보이면 유저는 "이 레인은 당분간 안 쓰니 맘놓고 손을 옮기면 되겠다"로 읽어 손 이동을 자신 있게 수행할 수 있다.

## 3. 검토한 대안

### 3-1. (기각) 손 분배 색 가이던스 — 레인을 왼손/오른손 색으로 틴트

제작자가 의도한 왼손/오른손 분배를 레인 배경색(적/청)으로 표시하는 안.

- **기각 근거 1 — 코어 난이도 노출:** not4k는 "손배치 인식이 핵심 난이도"인 게임이다(glossary 149행). 손 분배(양의 정답)를 상시 노출하면 게임의 코어 퍼즐을 지운다.
- **기각 근거 2 — 가변 손배치와 모순:** 레인은 한 손에 고정 소속되지 않는다. 수평 이동(`L1L2→L3L4→L2L3`)에서 같은 레인의 담당 손이 곡 중에 바뀐다. 정적 레인 틴트는 정확히 손 이동이 필요한 구간에서 거짓 정보를 준다.

→ "여기에 손을 놔라"(양의 정답)가 아니라 **"여기엔 손이 필요 없다"(음의 여백)** 만 보여주는 방향으로 선회. 유저는 여전히 손을 어디로 옮길지 스스로 판단한다 — 코어 보존.

### 3-2. (기각) 자동 파생 dim — 노트 공백에서 런타임 계산

빈 구간을 노트 배치에서 자동 계산해 dim하는 안. 새 데이터·저작 없이 렌더러만 건드린다.

- **기각 근거 — 의도와 우연을 구분 못 함:** 자동 파생은 "제작자가 파킹 의도로 남긴 쉼"과 "우연히 빈 짧은 구간"을 구분할 수 없다. threshold로 길이는 거를 수 있으나, 어떤 빈틈이 "설계된 손 이동 창"인지는 제작자 의도이지 노트 밀도의 함수가 아니다.

→ 단, 이 파생은 **Phase 1 시각 검증용 비계**로만 채택(§구현 기록). 최종 데이터 출처는 저작이다.

### 3-3. (기각·향후에도 계획 없음) 세이프존 — 휴지 구간에서 입력 판정 면제

휴지 구간에서 그 레인의 stray 입력을 판정 면제해, 실수로 눌러도 페널티가 없게 하는 안(진짜 "맘놓고").

- **기각 근거:** 판정 엔진을 건드리고(기록/랭킹/실패 조건 영향), 세이프존에서 막 눌러도 되는 어뷰징 표면을 연다. 시각 안내라는 목적에 비해 위험·복잡도가 과하다.
- **결정:** 입력 판정 면제는 **계획 없음.** `restZone`은 판정에 **일절 개입하지 않는다.** 향후에도 이 문서의 결정을 뒤집지 않는 한 판정과 엮지 않는다.

## 4. 채택안 — 저작 `restZone`

차트 제작자가 직접 배치하는 **레인별 구간** `restZone`을 도입한다. `trillZone`의 형제(레인 + 박 범위 저작 구간)다.

### 4-1. 데이터 모양

```
RestZone { lane, beat, endBeat }
```

`ChartData`에 `restZones: RestZone[]` 축을 추가하고 JSON 직렬화에 round-trip시킨다. 전역 이벤트(`ChartEvent`)가 아니라 레인 귀속이라 `trillZone`과 같은 top-level 배열로 둔다. 여러 레인이 동시에 쉴 수 있다(오른손 파킹 = L3·L4에 각각 하나). `lane`은 `trillZone`과 동일하게 **가시 레인 1–4**만 대상으로 한다(not4k는 항상 4개 레인, glossary "레인"). 보조 레인(RFD 0018 aux)은 별도 가시 레인이 아니라 dim 대상이 아니다.

### 4-2. 두 가지 기능 — 그리고 오직 이 둘

1. **시각 효과:** 게임에서 해당 레인 구간을 dim해 "가라앉은" 것으로 보인다(§구현 기록의 밴드). 활성 레인 대비 명도 차로 "이 레인 쉼"이 읽힌다. 제작자가 배치를 확인·조작할 수 있도록 **에디터 타임라인에도 렌더**한다(`trillZone`이 타임라인에 보이는 것과 동형).
2. **배치 제약(의미 위반):** `restZone`이 덮은 레인·구간에 **노트 또는 `trillZone`이 존재하면 의미 위반**이다. `trillZone`은 트릴 노트가 등장한다는 암시이므로 "레인 안 씀"과 정면 모순이라 `restZone` 안에 존재할 수 없다. 이 제약은 **RFD 0017의 낙관적 편집 모델을 따른다** — 편집 중에는 transient로 허용해 커밋하고(해칭 표시), **저장 게이트(`validateChart`)와 플레이/프리뷰 진입 게이트에서 차단**한다. structural 하드 거부(`setChart`)가 아니다. 역방향(노트·`trillZone`이 있는 자리에 `restZone` 배치)도 같은 의미 위반으로 대칭 처리한다.

**판정 불개입:** 런타임 입력·판정·기록·랭킹·실패 조건은 `restZone`과 무관하다(§3-3).

### 4-3. 시각 결과 — 레인 base 밝기 상향(전역)

dim이 보이려면 활성 레인이 완전 검정보다 밝아야 한다(near-black은 더 어둡게 눌러도 안 보임). 따라서 레인 base 톤을 전역으로 올린다 — `restZone`이 없는 차트도 레인이 살짝 밝아지는 시각 변화가 따른다. 수용된 결과다. 레인 base색은 스킨이 아니라 `constants.ts`에 하드코딩되므로 이 리프트는 **스킨 무관 전역**이다(스킨별 제어로 분리하지 않고 현행 단순성을 유지한다).

## 5. Trade-off

- **비용:** 자동 파생(렌더러만) 대비 새 차트 프리미티브 = 데이터 타입·직렬화·검증·에디터 저작 UX(배치·이동·리사이즈·복붙·배치 제약)까지 번진다. 작업량 대부분이 에디터 저작에 있다.
- **얻는 것:** 제작자 의도의 정확한 표현(우연 공백과 구분), 저작 시점 배치 제약으로 모순 예방, 코어 난이도 보존(음의 여백만 노출).
- **되돌리기 어려움:** 차트가 `restZone`을 쓰기 시작하면 포맷에서 빼기 어렵다 → 이 RFD로 결정을 못 박는 이유.

## 6. 영향 문서

- `docs/context/glossary.md` — `restZone` 정의 신규(권위)
- `docs/context/term-map.md` — A 표에 `restZone` 추가
- `src/shared/CONTEXT.md` — 차트 구조에 `restZones` 축 요약
- `src/editor/CONTEXT.md` — 배치 제약에 `restZone` 반영

## 7. 구현 단계

- **Phase 1 (완료):** 시각 프로토타입 — 밴드 렌더 + base 리프트, throwaway 자동 파생으로 값 확정.
- **Phase 2:**
  1. **(완료, commit 1d593d5)** `Chart.restZones` 타입 + JSON 직렬화(하위호환 부재→[]) + 검증 2버킷:
     - **structural**(`setChart` 하드 거부): `endBeat > beat`(구간 역전·길이 0 금지), 레인 1–4, beat well-formed.
     - **semantic**(저장·플레이 게이트): 같은 레인 `restZone` 자기 겹침 금지(`trillZone`의 `validateNoTrillZoneOverlap` 대응), `restZone`×노트/`trillZone` 겹침 금지(§4-2). `ChartViolationIndices`에 `restZones` 축 추가(해칭).
  2. **(완료, commit d85a8b7)** 게임 렌더 소스 교체 — 파생기(`restZonePreview.ts`) 삭제, `GameRenderer.setChart`가 저작 `restZones`를 받아 밴드로 dim.
  3. **(일부 완료, commit c1ba67e)** 배치 제약(의미 위반) 강제 — 에디터의 전 `validateChart` 게이트(저장·플레이 진입·`setChart`·`loadChart`·위반 배지·편집 프리뷰)가 `restZones`를 전달해 restZone 규칙이 실제 평가된다.
  4. **(미구현)** 에디터 저작 UX + restZone 렌더 + 위반 해칭 — 배치 툴 + 선택/이동/리사이즈/복붙 + `restZone` 타임라인 밴드 렌더 + 위반 해칭(`chartViolationIndices`의 `restZones` Set을 `TimelineRenderer.setViolations`가 소비), `trillZone` 에디터 경로 복제. 현재 `chartViolationIndices`는 `restZones` 위반 인덱스를 내지만 `setViolations`는 아직 3축만 소비한다(해칭 렌더 잔여).
