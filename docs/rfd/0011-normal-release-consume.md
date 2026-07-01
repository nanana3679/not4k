# RFD 0011: 일반 롱노트 종결 release의 직후 슬라이드 누설 차단 (release 소비)

**Status:** Accepted (2026-07-01)

## 관련 문서

- [`docs/rfd/0008-release-engage-key-attribution.md`](0008-release-engage-key-attribution.md) — 공릴리즈(emptyRelease). 이 RFD가 확장한다(대체 아님).
- [`docs/rfd/0007-release-lockout.md`](0007-release-lockout.md) — release 소비를 "기각안"으로 남긴 원출처(§5).
- [`docs/rfd/0006-earliest-matching-headless-long-note.md`](0006-earliest-matching-headless-long-note.md) — keydown 흡수(`consume`). 이 RFD는 그 release 대칭.
- [`docs/spec/note-system.md`](../spec/note-system.md), [`docs/context/glossary.md`](../context/glossary.md)

---

## 1. 배경 — RFD 0008이 남긴 갭

RFD 0008의 **공릴리즈(`emptyReleaseKeys`)**는 *hold-only/슬라이드를 held로 완료시킨 키*만 표시한다. 그 전제는 "held로 완료된 노트의 release는 이미 판정이 끝난 **잉여**라, 직후 노트로 새면 안 된다"였다.

그런데 **일반 롱노트의 종결 release는 잉여가 아니라 그 노트의 판정 자체**라서 공릴리즈로 표시되지 않는다. 문제는 `onLaneRelease`의 한 keyup이 레인에 브로드캐스트되어 **끝점 종결(`tryEndpointJudgmentOnRelease`)로 A를 종결시킨 뒤, 같은 keyup이 직후 슬라이드의 미리-떼기(`checkSlideReleaseOnRelease`)까지 촉발**한다는 점이다. 즉 release가 A를 종결하고도 "소비"되지 않고 남아 B로 샌다.

RFD 0008 §10은 공릴리즈 가드의 안전성이 "롱노트 겹침 불가" 불변에 의존한다고만 적었고, **일반 롱 종결 release가 직후 슬라이드로 새는 이 표면은 다루지 않았다.**

## 2. 재현 (확정)

180 BPM · 16비트(83.3ms 간격). 일반 롱노트 A[0, 1000] 직후 슬라이드 B@1050 — 자연스러운 차트 패턴.

```
A: 일반 롱노트를 끝점(1000) 지나 유지 → BODY_AWAITING_RELEASE
   1040ms에 KeyA 놓음
결과:  A 종결 Perfect (정상)
       B(슬라이드) 판정 = { grade: 'perfect', deltaMs: -10 }   ← 누설
대조군: A가 hold-only면 → 완료 키가 공릴리즈 → B 판정 = undefined (보호됨)
```

플레이어는 1040에 손을 뗐다. 슬라이드 B는 1050에 held여야 통과인데 그 전에 손이 올라갔으므로 **B는 Miss여야 하지, Perfect를 받으면 안 된다.** 출처가 hold-only면 보호되고 일반 롱이면 누설되는 **비대칭**이 버그의 핵심이다.

재현·회귀: `src/game/judgment/normalReleaseConsume.test.ts`.

## 3. 문제의식

- 이 패턴(롱 끝 + GOOD 윈도우 이내 슬라이드/릴리즈 노트)은 고BPM 세밀 배치에서 흔하다. "차트 배치로 금지"(RFD 0007 §5의 현행 관리 방식)는 표현 자유도를 과하게 제한한다.
- 슬라이드 미리-떼기(`checkSlideReleaseOnRelease`)는 **의도된 기능**이다 — 고립된 슬라이드를 미리 떼면 Perfect. 따라서 "슬라이드 미리-떼기를 끄는" 식의 해법은 안 된다. 문제는 오직 **A를 종결시킨 release가 B로도 번지는 것**이다.

## 4. 대안 검토

| 안 | 내용 | 평가 |
|---|---|---|
| **(A) 현행 유지 (차트 배치 관리)** | "롱 끝 근처(GOOD 이내)에 슬라이드/릴리즈 노트 금지"를 검증/작법으로 강제 | 판정 엔진 무변경이나 표현 자유도 제한. 재현이 자연 패턴이라 부적절. |
| **(B) 일반 롱 종결 release도 공릴리즈로 표시** | A를 release로 종결한 그 키를 같은 keyup 처리 내에서 공릴리즈에 넣어, 뒤이은 슬라이드/릴리즈 노트 가드가 스킵 | 최소 변경. 다만 "공릴리즈=잉여" 의미가 "소비된 release"로 넓어짐. |
| **(C) release 소비(消費) — 채택 추천** | keydown `consume`의 대칭. **한 keyup은 자신이 정당히 판정한 가장 이른 release-대상 하나에만 귀속되고, 같은 레인의 다음 release-대상으로 번지지 않는다.** | 개념적으로 완결. §5 불변이 과차단 우려를 무력화. (B)는 이 원리의 한 구현 형태. |

RFD 0007 §5가 release 소비를 기각했던 이유는 "lane-held 모델에서 release를 노트에 귀속 못 해 동시 롱·릴리즈탭을 과차단"이었다. 그러나 **§5 불변(한 레인 진행 중 롱 최대 하나)** 때문에 동시 롱은 존재 불가능하고, 릴리즈탭은 release가 아니라 새 keydown이 새 노트를 만드는 것이라 release 소비에 안 걸린다. 즉 **당시 기각 근거가 지금은 성립하지 않는다.**

## 5. 핵심 결정

**채택: (C) release 소비.** (A) 차트 배치 제한은 기각한다 — "롱 끝 직후 슬라이드/릴리즈 노트 금지"는 고BPM 세밀 배치에서 자연스러운 패턴을 막아 **차트 다양성을 해친다**(도메인 결정). (C)를 (B) 형태로 최소 구현한다.

**한 keyup(release)은 같은 레인에서 자신이 정당히 판정한 첫 release-대상에 소비되고, 그 뒤의 다른 release-대상(슬라이드 미리-떼기·릴리즈 노트·다른 끝점)을 트리거하지 않는다.**

- 구체: `onLaneRelease` 처리 중 그 키가 끝점 종결(`tryEndpointJudgmentOnRelease`)로 노트를 실제 종결시켰다면, 같은 keyup 처리 내 후속 release-대상 가드(`checkSlideReleaseOnRelease` 등)에서 그 키를 **소비됨**으로 보고 스킵한다.
- 공릴리즈(RFD 0008)와 통합: 공릴리즈는 "held 완료로 잉여가 된 키", 이 RFD의 소비는 "판정에 이미 쓰인 키" — 둘 다 "이 keyup은 직후 노트로 가지 않는다"는 같은 가드를 공유하되 표시 시점만 다르다. 구현상 기존 `emptyReleaseKeys` 가드 경로를 재사용할 수 있다(§7).

## 6. 보존되어야 할 것 (회귀)

- **고립 슬라이드 미리-떼기**: 선행 종결이 없으면 소비도 없으므로 정상 Perfect (RFD 0007 §4 케이스).
- **릴리즈탭 / 홀드 이어잡기 / 홀드 중 탭 / 홀드 트릴**: release가 새 노트를 만들거나 유지 충족(lane-held)에 속하는 케이스는 소비와 무관 — 전부 보존 (RFD 0008 §5·§6 회귀 재사용).
- **연결(`o-o-`)**: 연결은 release 판정이 아니라 끝점 update(held-or-grace)에 위임되므로 무영향 (RFD 0008 §3.3).
- **키 단위 종결**(RFD 0008 §10): 유지 키가 아닌 다른 키의 release가 종결을 촉발하는 확정 동작은 유지. 소비는 "종결 뒤 직후 노트로 번지는 것"만 막는다.

## 7. 의존하는 불변 — 롱노트 겹침 불가

RFD 0008 §4와 동일: 한 레인에 진행 중 롱은 최대 하나(다중키 동시 유지는 `doubleLong` 한 노트, 순차 전환은 연결). 따라서 한 keyup이 "롱 A 종결"과 "롱 B 정당 종결"을 동시에 해야 하는 상황은 배치상 불가능하다 → 소비가 정당한 다른 종결을 잘못 삼킬 경로가 없다. 검증은 `validateNoDuplicates` + `validateNoLongOverlap`가 강제.

## 8. 케이스 검증 (예정 회귀)

| 케이스 | 기대 | 근거 |
|---|---|---|
| 일반 롱 A 종결 후 직후 슬라이드 B | **B 미발화(→ 이후 Miss)** | A가 release 소비 → B 가드 스킵 (이 RFD) |
| 고립 슬라이드 미리-떼기 | Perfect | 선행 종결 없음 → 소비 없음 |
| hold-only A → 직후 슬라이드 | B 보호 | 공릴리즈 (RFD 0008, 무영향) |
| 릴리즈탭(소유 키 떼기+새 노트) | 정상 | 소비는 release-대상만, 새 keydown 무관 |
| 홀드 이어잡기(키 스왑) | 정상 | 유지=lane-held, release 소비 무관 |
| 연결 체인 끝 release-tap | 정상 종결 | 연결은 공릴리즈/소비 안 함 |

## 9. 영향 문서/코드 (구현 완료)

- 구현: `src/game/judgment/JudgmentEngine.ts` — `tryEndpointJudgmentOnRelease`가 실제로 종결을 판정하면(`didTerminate`) 그 키를 `emptyReleaseKeys`에 등록해, 같은 keyup의 후속 release-대상 가드가 스킵하게 함. `onLaneRelease` 끝에서 키와 함께 해제.
- 회귀: `normalReleaseConsume.test.ts` — 누설 차단 + 슬라이드 Miss + hold-only 보호(RFD 0008 무영향) + 고립 슬라이드 미리-떼기 보존. 기존 JudgmentEngine 92 테스트(릴리즈탭·이어잡기·연결·o-o) 무회귀.
- `docs/context/glossary.md`, `src/game/CONTEXT.md` — `emptyRelease` 정의를 "held 완료 잉여 **또는** 판정에 소비된 release"로 확장(용어 권위는 glossary).
- `docs/spec/note-system.md` — release 소비 한 줄. RFD 0007 §5의 "차트 배치로 관리"를 이 RFD가 대체함을 명시.

## 10. 미해결 / 열린 질문

- **소비의 표시 단위**: 키 단위(그 keyup만) vs 레인 단위. §7 불변상 키 단위로 충분해 보이나, `doubleLong`의 두 키를 시간차로 떼는 **분할 릴리즈**와의 상호작용을 구현 시 확인해야 한다.
- **릴리즈 노트(길이 0 일반)**: 현재 판정 경로 구현 여부와 무관하게, 같은 원리로 소비가 적용되어야 함(도입 시 함께 잠금).
- **채택안 확정 (완료)**: 개념은 (C) release 소비, 구현은 (B) 형태(기존 `emptyReleaseKeys` 가드 재사용) — §5·§9대로 확정·구현됨.
