# RFD 0013: 트릴 교대 실패의 판정은 상한(Good◇)일 뿐 하한이 아니다

**Status:** Accepted (2026-07-04)

## 관련 문서

- [`docs/spec/note-system.md`](../spec/note-system.md) §트릴 교대 판정(§276, §486 Grace) — 이 RFD가 "고정"의 의미를 상한으로 명확화한다.
- [`docs/spec/scoring.md`](../spec/scoring.md) — Good◇(1점) 등급.
- [`docs/rfd/0004-io-timing-consistency.md`](0004-io-timing-consistency.md) — 판정 일관성이 최상위 품질 축.

---

## 1. 배경 — "Good으로 고정"의 침묵한 하한

`note-system.md` §276은 트릴 교대 실패(직전과 같은 키)를 **"판정이 Good으로 고정된다. 타이밍이 맞았더라도 Perfect/Great를 받을 수 없다"**로 기술한다. 이 문장은 **상한**(정타를 Good◇로 깎음)만 명시하고, 타이밍이 Good보다 나쁠 때(BAD) 어떻게 되는지는 침묵한다.

구현(`processTrillNoteInput`)은 grade 계산 뒤 교대 실패면 **무조건** `grade = GOOD_TRILL`로 덮었다:

```
let grade = calculateGrade(deltaMs);   // Late Bad(delta 140) → BAD
if (교대 실패) grade = GOOD_TRILL;        // BAD를 Good◇(1점)로 '상향'
```

즉 교대 실패가 상한이 아니라 **하한**으로도 작동해, 미스타이밍(Bad)을 Good◇로 끌어올렸다.

## 2. 재현 (확정)

일반 트릴 노트 2개(1000ms, 1200ms). 첫 노트 KeyA(Perfect)로 교대 기록 후, 둘째 노트를 delta=+140ms(Late Bad 윈도우 120~160)에 **같은 KeyA**로 침(교대 실패).

```
기대(스펙 의도): Bad — 타이밍이 Good보다 나쁘므로
실제(수정 전):   Good◇ — 교대 실패 override가 Bad를 상향
```

콤보도 함께 오염된다: Bad는 콤보를 끊어야 하는데 GOOD_TRILL은 `isComboMaintaining`이라 콤보가 유지됐다.

재현·회귀: `JudgmentEngine.test.ts` "트릴 교대 실패의 판정 상한" describe.

## 3. 문제의식

- **판정 역전**: 정확히 친 정타 트릴을 교대 실패하면 Good◇(1점)인데, 크게 빗나가 친(Bad) 것도 교대 실패면 똑같이 Good◇가 된다. 미스타이밍이 처벌받지 않아, "타이밍을 지킬수록 손해"인 역전 구간이 생긴다.
- **일관성 축 위배**: IO 타이밍/판정 일관성은 최상위 품질 축(RFD 0004). "잘못 친 입력이 판정상 이득"은 이 축과 정면 충돌한다.

## 4. 핵심 결정

**교대 실패의 Good◇는 판정의 상한(cap)이지 하한(floor)이 아니다.**

- 타이밍 등급이 **Good 이상**(Perfect/Great/Good)일 때만 교대 실패가 Good◇로 **끌어내린다**.
- 타이밍 등급이 **Good보다 나쁘면**(Bad/Miss) 그 타이밍 등급을 **그대로 유지**한다.

Grace 트릴도 동일하다(§486): Grace는 타이밍 부담을 제거해 Good 윈도우 전체를 Perfect로 매핑하지만, Late Bad(120~160)는 여전히 Bad다. 그 Bad에 교대 실패가 겹쳐도 Good◇로 상향되지 않는다.

## 5. 대안 검토

| 안 | 내용 | 평가 |
|---|---|---|
| **(X) 현행 — 무조건 Good◇** | 교대 실패면 타이밍 무관 항상 Good◇ | "Good으로 고정"의 한 해석이나, 미스타이밍을 보상해 판정 역전. 기각. |
| **(Y) 상한만 — 채택** | 교대 실패는 Good 이상을 Good◇로 하향, Bad/Miss는 유지 | "고정"의 상한 해석. 미스타이밍이 정당히 처벌됨. 일관성 축 부합. |

## 6. 보존되어야 할 것 (회귀)

- **정타/Good 이내 교대 실패 → Good◇**: 기존 동작 유지(§276 상한). delta=0·delta=100 케이스.
- **Grace 교대 성공 → Perfect**: 타이밍 면제 유지(§486).
- **Grace 교대 실패 + Good 이내 → Good◇**: override 상한 유지.
- **교대 성공 시 등급**: 이 RFD는 실패 경로만 건드린다. 성공은 무영향.

## 7. 영향 문서/코드

- 구현: `src/game/judgment/JudgmentEngine.ts` `processTrillNoteInput` — 교대 실패 override를 "타이밍 등급이 Good 이상일 때만" 조건화.
- 회귀: `JudgmentEngine.test.ts` — Late Bad + 교대 실패 → Bad(상향 없음) + 대조군 Good 이내 → Good◇.
- `docs/spec/note-system.md` §276·§486 — "Good으로 고정"을 "상한이 Good◇이며, 타이밍이 그보다 나쁘면 그 판정을 유지"로 명확화.
