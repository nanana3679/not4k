# RFD 0017: 낙관적 편집 — 편집 중 transient invalid 허용, 저장에서 검증

**Status:** Accepted (2026-07-09)

**관련 문서:**

- [`src/editor/CONTEXT.md`](../../src/editor/CONTEXT.md) — 배치 제약 2층, 차트 변이 게이트, `loadChart` 예외
- [`src/editor/stores/editorStore.ts`](../../src/editor/stores/editorStore.ts) — `setChart`(변이 게이트)·`loadChart`
- [`src/shared/validation/index.ts`](../../src/shared/validation/index.ts) — `validateChart`(층1 모델 불변)
- [`src/editor/hooks/useFileOperations.ts`](../../src/editor/hooks/useFileOperations.ts) — 저장 게이트
- [`docs/rfd/0016-editor-selection-handle-model.md`](0016-editor-selection-handle-model.md) — 이 RFD를 **prerequisite로 의존**하는 후속 결정

---

## 1. 배경

현재 차트 쓰기는 단일 관문 `setChart`를 지난다(차트 변이 게이트). `setChart`는 층1 모델 불변(`validateChart`: 롱노트 겹침 불가, 트릴 롱 헤드 필수, stop 구간 내 배치 금지 등)을 검사하고, **위반 시 통째 거부**한다 — 차트·히스토리 무변, 토스트로 사유 통지. 유일한 관대 통로는 `loadChart`로, 위반 차트도 **열어서 수리**하게 허용하되(경고만) 재저장은 저장 게이트가 막는다.

이 모델의 성질: **라이브 차트는 항상 valid**하다. 게임/프리뷰/undo가 이를 신뢰한다.

## 2. 문제

`setChart`의 하드 거부는 **다중 요소 편집을 통째로 무력화**한다.

- 여러 노트를 선택해 이동하거나 한 구간을 다른 위치에 붙여넣을 때, **중간 또는 최종 상태가 겹침 등 제약을 위반하면 연산 전체가 거부**된다(토스트만, 아무 일도 안 일어남).
- 사용자는 "일단 옮겨 놓고 겹치는 부분만 미세 조정"하는 자연스러운 편집을 할 수 없다. 제약을 만족하는 **완성된 배치를 한 번에** 만들어 넣어야만 반영된다.

`loadChart`는 "이미 깨진 것을 열어 고치는" 관대함을 이미 갖고 있지만, 그 관대함이 **편집에는 적용되지 않는다.**

## 3. 제안 (결정 후보)

`loadChart`의 관대함을 **편집 전반으로 일반화**한다: 편집은 transient invalid 상태로 진행할 수 있고, **검증의 강제 지점을 "매 변이"에서 "저장(및 플레이/프리뷰 진입)"으로 옮긴다.**

### 3-1. 제약을 두 검증 함수로 분리한다

층1 검증을 성질에 따라 **두 함수**로 가른다 — 아예 허용 안 하는 것과, 편집 중 허용하고 커밋 때만 보는 것.

- **구조 검증 (structural)** — 위반 시 차트가 **데이터로서 성립하지 않거나(파싱 불가: `endBeat < beat` 역전·존재하지 않는 레인 참조·범위 이탈), 소비자를 크래시시킨다(§3-4의 measure 무한루프처럼 transient로도 견딜 수 없는 것).** 즉 구조 버킷의 판정 기준은 **"데이터 malformed" ∨ "크래시 유발"** 2요소다(둘 중 하나면 구조). **편집 중에도 절대 불가** → `setChart`가 항상 하드 거부한다. (크래시 유발분은 소비자 하드닝으로 크래시를 제거하면 의미로 강등 가능 — 라벨이 아니라 소비자 내성이 경계다.)
- **의미 검증 (semantic)** — 구조는 멀쩡하나 **게임 판정 전제를 깬다**(롱노트 겹침, 트릴 롱 헤드 필수, stop 구간 내 배치, 중복 등). **편집 중 잠깐 허용** → 저장·플레이 진입 게이트가 강제한다.

**실측 주의 (2026-07-09):** 현재 `validateChart`의 규칙 11개는 **전부 의미 검증**이며, 위에 든 구조 검사(역전·레인 범위 등)는 **코드에 존재하지 않는다**(0건). 따라서 이 분리는 한 함수를 쪼개는 게 아니라, 기존 `validateChart`를 **의미 검증**으로 두고 **구조 검증 함수를 신설**하는 작업이다. 각 규칙의 정확한 구조/의미 귀속은 §7.

이 분리는 배치 제약 2층(모델 vs UX)과는 **다른 축**이다 — 여기서는 층1 안에서 "언제 강제하나"(항상 vs 커밋 시)를 가른다.

### 3-2. 게이트를 이동한다

- `setChart`: **구조 검증만** 하드 거부(항상). 의미 위반은 허용해 반영한다. (구조 검증 함수는 신설 — §3-1.)
- **저장 게이트 + 플레이/프리뷰 진입 게이트**: 의미 검증을 강제한다. 위반이 남아 있으면 저장·플레이를 막고, **어떤 제약이 왜 위반됐는지** 명시한다. (저장 게이트는 `useFileOperations`에 **이미 존재** — 재사용. 플레이/프리뷰 진입 게이트는 **신설**.) 단 이 저장 게이트는 지금껏 "라이브가 항상 valid"라 **사실상 사문**이었다(`useFileOperations:172,307`). 상시 통과 경로가 되면 **위반별 메시징 품질(어떤 노트가 왜)**이 실사용에 걸리므로, "재사용"은 배선상 맞아도 실질 재사용은 §3-3 위반 시각화 확정에 달려 있다.
- undo 히스토리: 의미 위반 상태도 포함한다(구조적으론 성립하므로 안전).

### 3-3. invalid를 읽는 쪽 처리

라이브 차트가 의미상 invalid일 수 있으므로:

- **렌더러**: 겹친 롱노트·헤드 없는 트릴 등 invalid 상태를 그릴 수 있어야 한다(크래시 금지).
- **에디터 내 플레이/프리뷰**: invalid 동안 **비활성**(게임은 valid를 전제하므로). 위반 해소 후 진입 허용.
- **위반 시각화**: 현재 위반 요소(겹치는 노트 등)를 **표시**해 사용자가 무엇을 고쳐야 하는지 알린다. 기존 "토스트 후 거부"를 "허용 + 위반 표시"로 대체.
- **되돌리기·수정 경로**: 낙관적 편집이 의미 위반을 만들면 사용자는 두 경로로 벗어난다 — (a) **수정**: 커밋 후에도 선택이 유지되므로(이동은 놓는 순간 커밋, 선택 해제 아님), 그대로 재드래그해 위반을 해소한다. (b) **되돌리기**: **undo로 편집 직전 상태로 복귀**한다(위반 상태도 커밋이므로 히스토리에 남고, 매 변이가 `captureHistory`를 찍는다). **성격 변화 주의**: 현행은 놓는 순간 검증해 위반이면 **자동 롤백**(place-then-fix 불가)이지만, 이 모델은 위반을 커밋하므로 되돌리기가 **사용자의 능동적 undo**로 바뀐다. 이에 맞춰 이동 프리뷰도 현행 "위반 위치 미표시(마지막 valid 유지)"에서 **위반 위치를 그대로 표시**로 바꿔야 한다(위 렌더러 항목과 짝).

### 3-4. 구조/의미 분류 확정 (소비자 감사 2026-07-09)

§7의 두 선행 항목(불변 신뢰 소비자 전수 / 규칙 귀속)을 세 클러스터(게임 런타임·에디터 렌더링·직렬화/undo) 전수 감사로 해소했다. 결과:

- **크래시는 단 하나 — `timeSigNatural`.** 분자/분모 ≤ 0인 박자표(예: 입력 중 "0/4")는 마디 길이 0/음수를 만들어, `measureStartBeat`로 도는 **무제한 measure 루프 3곳을 무한루프**로 만든다(탭·게임 행). 실측 3곳 확인: `GridRenderer.ts:161`(그리드)·`MinimapRenderer.ts:195`(미니맵)·`GameRenderer.ts:1157`(런타임 measureTimesMs — 라이브 테스트플레이도 얼어붙음). → **`timeSigNatural`은 구조로 분류(setChart 항상 거부).** 세 루프에 step≤0 가드를 넣어 하드닝하면 이후 의미로 강등 가능.
- **나머지 10개 규칙은 CRASH·DATA-LOSS 소비자가 없다 → 전부 의미(transient 허용), 하드닝 불요.** 최악이 GLITCH(겹쳐 그림·오정렬) 또는 SILENT(콤보 이중 계상·타이밍 미세 오차). 근거: JudgmentEngine 상태맵이 전부 **note index 키**라 중복·겹침이 크래시가 아니라 이중 계상에 그치고(`JudgmentEngine.ts:190-254`), 렌더러는 각 엔티티를 독립 렌더(헤드 없는 트릴은 `hasHead` 분기라 역참조 없음), `storage.ts`는 배열을 JSON 통째 왕복해 중복도 보존(DATA-LOSS 없음), `loadChart`는 이미 advisory.
- **`timeSigAtMeasureStart`는 의미다** — 비경계 박자표도 유효 Beat라 루프가 정상 전진(무한루프 아님), 결과는 마디선 오정렬(GLITCH)뿐. **timesig 2개를 한 묶음으로 다루지 말 것**(Natural=구조/크래시, AtMeasureStart=순수 의미로 비대칭).

**결론:** setChart의 구조 버킷 = `timeSigNatural` 1건 + 신설할 역전·레인범위 검사. 의미 버킷 = 나머지 전부. 유일한 선행 하드닝은 **measure 루프 step≤0 가드 3곳**이며, 이것만 하면 낙관적 편집이 어떤 소비자도 크래시시키지 않는다.

**추가(2026-07-11, PR #92 리뷰 반영):** 구조 버킷에 `beatMalformed`(분모 0·NaN·Infinity Beat) 검사를 신설 — "데이터 malformed" 쪽으로 무조건 구조다. 값 비교 fix(`beatKey` 약분)가 `beat()` 생성자를 쓰면서 d=0 입력에서 **검증 함수 자체가 throw**하게 된 회귀를 막는다: 검증은 위반 목록을 반환해야지 예외를 전파하면 `loadChart`의 "malformed 외부 파일도 열어 수리"가 깨진다. 같은 리뷰에서 이벤트 중복 검사(`eventDuplicate`)도 노트와 동일하게 값 기준(약분) 비교로 통일했다.

**라벨 주의:** `timeSigNatural`이 구조인 것은 §3-1 2요소 기준의 **"크래시 유발"** 쪽 때문이지 **"데이터 malformed"** 쪽이 아니다 — `0/4`는 데이터로는 성립한다(0은 유효한 수). 따라서 이 규칙의 구조 귀속은 **소비자 내성에 조건부**다: measure 루프 3곳에 step≤0 가드를 넣어 크래시를 제거하면 의미로 강등 가능하다. 신설할 역전·레인범위는 "malformed" 쪽이라 무조건 구조다. 즉 구조 버킷은 성질이 다른 두 종류가 섞여 있으니, CONTEXT/glossary 동기화(§6) 시 "구조 = malformed ∨ 크래시 유발"임을 함께 명시한다.

#### 규칙×소비자 교차표 (감사 근거)

아래 표가 위 결론의 판정 근거다(빈칸 없음 = 모든 규칙이 최소 한 소비자 열까지 안전 확인됨). 열 = 세 클러스터의 대표 소비자, 셀 = 그 규칙 위반 시 최악 등급.

| 규칙 | 게임 런타임 (`JudgmentEngine`/`GameRenderer`) | 에디터 렌더 (`Grid`/`Minimap`/트릴핸들) | 직렬화·undo (`storage.ts`/history) | 귀속 |
| --- | --- | --- | --- | --- |
| `validateNoDuplicates` | SILENT (콤보 이중 계상, index 키라 크래시 없음) | GLITCH (겹쳐 그림) | 보존 (JSON 왕복) | 의미 |
| `validateNoLongOverlap` | SILENT (이중 계상) | GLITCH | 보존 | 의미 |
| `validateTrillExclusive` | SILENT | GLITCH | 보존 | 의미 |
| `validateTrillLong` (헤드 필수) | 무해 (`hasHead` 분기, 역참조 없음) | GLITCH (헤드 없는 트릴) | 보존 | 의미 |
| `validateNoTrillZoneOverlap` | 무해 | GLITCH (zone 겹쳐 그림) | 보존 | 의미 |
| `validateNoEventDuplicate` | SILENT | GLITCH | 보존 | 의미 |
| `validateNoEventOverlap` | SILENT | GLITCH | 보존 | 의미 |
| `validateNoTutorialInputOverlap` | SILENT | GLITCH | 보존 | 의미 |
| `validateStopZones` | SILENT (판정 전제) | GLITCH | 보존 | 의미 |
| `validateTimeSigAtMeasureStart` | GLITCH (마디선 오정렬, 루프 정상 전진) | GLITCH | 보존 | 의미 |
| `validateTimeSigNatural` | **CRASH** (measure 무한루프 `GameRenderer:1157`) | **CRASH** (`Grid:161`·`Minimap:195`) | 보존 | **구조** |

읽는 법: **CRASH가 한 칸이라도 있으면 그 규칙은 구조**(transient로 못 견딤). 나머지는 최악이 GLITCH/SILENT라 의미. `timeSigNatural`만 CRASH 열을 가진다.

### Trade-off

- **얻는 것**: 다중 선택 이동·붙여넣기 등 자연스러운 편집("일단 옮기고 나중에 고치기"). [[0016]]의 구간 조작이 실효를 갖는다.
- **비용/잃는 것**: 라이브 차트가 더 이상 항상 valid가 아니다 → 렌더러·프리뷰·undo가 invalid를 견뎌야 한다. 위반 시각화 UI 필요. "구조 vs 의미" 규칙 분류 + **구조 검증 함수 신설**. **플레이/프리뷰 진입 게이트 신설**(저장 게이트는 이미 있어 재사용). setChart의 자동 롤백 제거로 되돌리기가 능동 undo로 바뀜. **불변 신뢰 소비자 전수 조사**(§7). 연속 편집 증가가 undo 병합창(정상 편집 undo 입도) 재검토를 압박(별도 결정).

## 4. 대안

### A. 현행 유지 — 하드 거부 (기각 후보)
다중 요소 편집이 통째 거부되는 문제가 남는다. [[0016]]도 실효를 갖지 못한다.

### B. 스테이징 버퍼 — 다중 연산을 별도 버퍼에서 하고 valid할 때만 커밋 (보류)
라이브 차트는 항상 valid로 유지되지만, "일단 저장 전까지 invalid로 두고 나중에 고치기" 워크플로가 안 된다. 구현도 복잡(이중 상태). transient invalid 자체를 원하는 동기와 배치된다.

### C. 부분 적용 — 유효한 부분만 반영하고 위반 부분은 거부 (기각 후보)
결과가 예측 불가(무엇이 적용되고 무엇이 빠졌는지 불명). 다중 이동의 상대 배치가 깨진다.

## 5. 채택 방향

3-1(구조/의미 분리) + 3-2(게이트 이동) + 3-3(invalid 리더 처리)을 함께 채택하는 방향을 제안한다. 각 층1 규칙의 정확한 "구조 vs 의미" 분류와 위반 시각화의 형태는 구현 단계에서 경험적으로 확정한다(이 RFD는 모델과 강제 지점만 확정).

## 6. 영향 받는 문서

- `src/editor/CONTEXT.md` — "차트 변이 게이트"·배치 제약 서술 갱신(setChart는 구조 불변만, 의미 제약은 저장 게이트로)
- `docs/context/glossary.md` — 차트 변이 게이트·저장 게이트 정의 갱신
- (구현 시) `docs/spec/` 편집 스펙, `e2e/` 저장·플레이 진입 플로우
- [[0016]] — 이 RFD가 선행 완료된 뒤 진행

## 7. 미해결 질문

- ~~**불변 신뢰 소비자 전수 열거**~~ **→ 감사 완료(§3-4, 2026-07-09): 크래시는 `timeSigNatural` 1건뿐.** "라이브 차트는 항상 valid"는 load-bearing 불변이다. §3-3이 든 렌더러·프리뷰·undo는 **예시**일 뿐이며, 깨뜨리기 전에 "겹침 없음" 등을 가정하는 소비자를 전수 조사해야 한다 — 실측 후보: `MinimapRenderer`·`minimapTrillZone`·`AutoPlayer`·각종 selector·직렬화/export(`editApplication`·`supabase/storage`). 하나라도 invalid에서 크래시하면 이 모델이 무너진다.
- ~~**각 규칙의 구조/의미 잠정 귀속**~~ **→ 감사 완료(§3-4): `timeSigNatural`=구조(크래시), 나머지 10=의미.** (아래는 감사 전 잠정 초안, §3-4가 정본.) `validateChart`는 11개 하위 함수로 구성된다:
  - **의미(초안):** `validateNoDuplicates`(중복)·`validateNoLongOverlap`(롱 겹침)·`validateTrillExclusive`(트릴↔zone 배타)·`validateTrillLong`(트릴 롱 헤드)·`validateNoTrillZoneOverlap`(zone 겹침)·`validateNoEventDuplicate`·`validateNoEventOverlap`·`validateNoTutorialInputOverlap`·`validateStopZones`(stop 구간).
  - **애매(전수 검토 필요):** `validateTimeSigNatural`(박자표 자연수 아님)·`validateTimeSigAtMeasureStart`(마디 경계 아님) — "malformed 데이터(구조)"인지 "판정 전제 위반(의미)"인지 진짜 불분명.
  - **구조: 감사 결과 `timeSigNatural` 1건(§3-4) + 신설 대상.** timeSigNatural(분자/분모 ≤0)은 measure 루프 3곳을 무한루프로 만들어 구조로 확정. 그 외 역전(`endBeat<beat`)·레인 범위 이탈·존재하지 않는 레인 참조는 검사 자체가 없어 **신설 대상**(§3-1).
  - **위 두 선행 항목(소비자 전수 / 규칙 귀속)은 독립이 아니라 결합이다.** 한 규칙을 "의미(transient 허용)"로 안전하게 내리려면 그 위반을 **모든 소비자가 견뎌야** 한다 — 예: `validateNoTrillZoneOverlap`을 허용하려면 `MinimapRenderer`·zone 핸들 렌더가 겹친 zone을 견뎌야 한다. 따라서 **규칙×소비자 교차표**로 함께 판정한다(빈칸 = "이 규칙은 이 소비자 때문에 의미로 못 내림"). **→ 이 교차표는 §3-4에 실려 있다**(감사 결과 CRASH 열을 가진 규칙은 `timeSigNatural` 하나뿐).
- 위반 시각화의 언어(색·아이콘·목록 패널)와, 위반이 화면 밖일 때의 안내(미니맵 표시 등).
- 저장뿐 아니라 **플레이/프리뷰 진입 게이트**의 정확한 경계(부분 구간 프리뷰는 invalid 구간만 피하면 허용할지).
- undo/redo가 invalid 상태를 오가는 동안의 엣지케이스(자동 수리 유혹 금지 — 그대로 보존).
- **막다른 상태 탈출 어포던스 (범위 밖, 미래):** 위반을 파악·해소하지 못해 히스토리만 길어질 때를 위한 "마지막으로 차트 전체가 valid였던 상태로 한 번에 복귀"(②)를 검토. 위반 배너 내 **맥락 버튼**으로 두어 전역 undo(Ctrl+Z, 그대로 유지)와 충돌하지 않게 한다. 구현은 `lastValidSnapshot` 포인터로 **O(1) 점프**(씨앗=로드/저장 = valid 보장), 폐기되는 편집 수를 고지. undo 자체는 커밋 후 유일한 되돌리기 수단이며(`cancel()`/Esc는 드래그 중에만 동작), **undo 입도(병합창, 현행 600ms)가 연속 편집 되돌리기 품질을 좌우**한다. 다만 병합창 조정은 invalid 편집만이 아니라 **모든 정상 편집의 undo 입도를 바꾸는 전역 UX 변경**이므로 **별도 결정**으로 다룬다 — 이 RFD는 "낙관적 편집이 연속 편집을 늘려 그 결정을 압박한다"는 사실만 기록한다(수치 미확정).
- 자동저장(있다면)과의 상호작용 — invalid 상태를 자동저장하지 않도록.
