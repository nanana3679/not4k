# RFD 0012: 이어잡힌 키의 공릴리즈 도장 잔류 차단 (release 소비의 키 귀속 정밀화)

**Status:** Accepted (2026-07-03)

## 관련 문서

- [`docs/rfd/0008-release-engage-key-attribution.md`](0008-release-engage-key-attribution.md) — 공릴리즈(`emptyReleaseKeys`). 이 RFD가 그 도장의 **수명**을 정밀화한다(대체 아님, 확장).
- [`docs/rfd/0011-normal-release-consume.md`](0011-normal-release-consume.md) — release 소비. 같은 `emptyReleaseKeys` 가드를 공유한다.
- [`docs/spec/note-system.md`](../spec/note-system.md) — 헤드 없는 롱노트, 릴리즈탭, 키 단위 종결.

---

## 1. 배경

RFD 0008의 **공릴리즈 도장**(`emptyReleaseKeys`)은 terminal hold-only/슬라이드를 held로 완료시킨 키를 표시해, 그 키의 "놓기" release가 직후 노트의 release 판정으로 새는 것을 막는다. 도장은 **키를 떼거나(`onLaneRelease` 끝) 다시 누르면(`onLanePress`) 회수**된다(RFD 0008 §3.1).

이 회수 조건은 암묵적 전제를 깔고 있다: **held 완료 후 유저는 그 키를 곧 뗀다(놓기).** 그 놓기가 도장을 회수하는 계기다.

## 2. 문제 — 안 떼고 이어잡으면 도장이 잔류한다

hold-only가 held로 완료된 뒤, 유저가 그 키를 **떼지 않고 같은 레인의 다음 롱노트를 계속 유지**하면(예: 헤드 없는 롱노트 `.-`를 `a--`로 이어 잡음), 도장 회수 계기(뗌/재입력)가 오지 않는다. 도장이 다음 롱노트 유지 구간 내내 **잔류**한다.

그 다음 롱노트의 끝점에서 유저가 정당하게 그 키를 떼어 종결시키려 하면:

- `tryEndpointJudgmentOnRelease`의 공릴리즈 가드(400줄, `isEmptyRelease`)가 **아직 참**이라 종결을 스킵한다.
- 롱노트는 릴리즈를 못 받고 타임아웃 → **Miss**.

정확히 유지하고 정확히 뗀 플레이가 잘못된 Miss + 콤보 끊김으로 처벌된다.

## 3. 재현 (확정)

같은 레인 L1:

```
hold-only A [1000~2000]   ← KeyA로 유지, 끝점 held Perfect → KeyA 공릴리즈 도장
   (갭)                    ← KeyA 안 떼고 계속 누름
헤드없는 롱 B  .-  [2500~3000]  ← KeyA pre-held로 유지 시작(허용, note-system §헤드 없는 롱노트)
   KeyA를 3000에 뗌         ← B 종결 시도
```

결과: `A: perfect / B: miss` (기대: B `perfect`). `emptyReleaseKeys`에 KeyA가 잔류해 B 종결이 400줄 가드에 막힘.

**심각도**: 이 레이아웃은 `validateChart`를 통과한다(`validateNoLongOverlap`은 strict-inside만 겹침으로 보므로 갭 배치는 무해, `validateNoDuplicates`도 무관). 즉 에디터로 만들 수 있는 유효한 HARD 차트이며, 자연스러운 "계속 잡기" 플레이로 재현된다. 실플레이 correctness 버그다(발생 빈도는 낮음 — hold-only 뒤 같은 레인 갭 롱은 흔한 패턴이 아님).

## 4. 대안 검토

| 안 | 내용 | 평가 |
|---|---|---|
| **(A) 종결 트리거를 "lane held 수 == 0"으로 변경** | 롱노트 종결을 개별 키 release가 아니라 레인의 모든 키가 떼어질 때로 | **기각.** RFD 0008 §10이 이미 기각한 안이다. 릴리즈탭 `A(release)+B(press)`는 종결 순간 `heldKeys={B}`(size 1)이라 종결이 안 걸려 타임아웃 Miss. note-system이 "유효·자연스러워야" 한다고 보호하는 입력을 처벌한다. |
| **(B) 도장 회수 시점 확장 (채택)** | 키가 **새 롱노트 바디를 떠받치기 시작할 때** 그 키의 공릴리즈 도장을 회수 | 국소 변경. 0008 §10이 가리킨 "*레인 무차별이 아니라 더 정밀한 키 귀속*" 방향과 정합. |

## 5. 핵심 결정 — 채택: (B)

**공릴리즈 도장의 회수 계기에 "그 키가 새 롱노트 바디를 유지하기 시작함"을 추가한다.**

- 도장의 의미는 "이 키의 다음 release는 이미 완료된 hold의 놓기다"이다. 그런데 그 키가 새 롱노트의 바디를 유지하기 시작하면, 그 키는 더 이상 "쉬는 키"가 아니라 **새 노트를 떠받치는 load-bearing 키**다. 그 키의 release는 놓기가 아니라 **새 노트의 종결**이다. 따라서 도장은 낡았고 회수해야 한다.
- 구현: `checkLongNoteBodyHold`에서 롱노트 바디의 `hasBeenPressed`가 `false→true`로 전이하는 순간(= 시작 허용 구간에서 레인이 held라 유지가 성립한 순간), 그 레인의 **현재 눌린 키들**을 `emptyReleaseKeys`에서 제거한다.

**"lane held == 0" 종결 게이트(대안 A)는 도입하지 않는다** — 키 단위 종결은 릴리즈탭·홀드 중 탭을 위해 유지되는 의도된 설계다(note-system "종결 판정", RFD 0008 §10). 이 RFD는 종결 트리거를 바꾸지 않고, 오직 **낡은 도장의 회수 시점만** 정밀화한다.

## 6. 의존하는 불변 — 롱노트 겹침 불가

RFD 0008 §4·0011 §7과 동일. 한 레인에 진행 중 롱은 최대 하나이므로, "새 롱 바디 유지 시작 시 held 키 도장 회수"가 **동시에 진행 중인 다른 롱의 정당한 공릴리즈 도장을 잘못 지울** 경로가 없다. 검증은 `validateNoDuplicates` + `validateNoLongOverlap`가 강제.

## 7. 케이스 검증 (회귀)

| 케이스 | 기대 | 근거 |
|---|---|---|
| hold-only A → 갭 → 헤드없는 롱 B, 안 떼고 유지 후 B 끝 release | **B Perfect** | B 유지 시작 시 KeyA 도장 회수 → 종결 정상 (이 RFD) |
| hold-only A → 슬라이드 B, A 놓기 | B 미판정(보호) | 슬라이드는 바디가 없어 회수 전이가 없음 → 공릴리즈 유지 (RFD 0008 무영향) |
| 릴리즈탭 `A(release)+B(press)` | 롱 정상 종결 | 키 단위 종결 유지, 도장 회수는 새 바디 유지 시작에만 (RFD 0008 §10 무영향) |
| 연결 체인(hold-only→일반 롱) 끝 release-tap | 정상 종결 | 연결은 애초에 도장을 안 찍음 (RFD 0008 §3.3) |
| 두 키(KeyA 도장 + KeyB fresh)로 B 유지 | 정상 종결 | 둘 다 load-bearing → 둘 다 회수, 어느 키 release로도 종결 |

## 8. 영향 문서/코드

- 구현: `src/game/judgment/JudgmentEngine.ts` — `checkLongNoteBodyHold`의 `hasBeenPressed` 전이에서 held 키의 `emptyReleaseKeys` 회수.
- 회귀: `src/game/judgment/JudgmentEngine.test.ts` — 이 RFD §7 케이스(누설 차단 + 슬라이드 보호·릴리즈탭 무회귀).
- [`docs/context/glossary.md`](../context/glossary.md), [`src/game/CONTEXT.md`](../../src/game/CONTEXT.md) — 공릴리즈 도장의 회수 조건에 "새 롱노트 바디 유지 시작"을 추가.
- RFD 0008 §10 / RFD 0011 §10 미해결 항목에 이 케이스가 해소되었음을 링크.

## 9. 미해결 / 열린 질문

- **분할 릴리즈(`D=-`)와의 상호작용**: 더블 롱노트의 두 키를 시간차로 뗄 때, 앞선 hold-only 도장이 두 키에 걸쳐 있으면 회수가 키별로 정확히 동작하는지 — 현재 회수는 "유지 시작 시점의 held 키 전체"라 두 키를 함께 회수한다. doubleLong 바디 유지 케이스의 회귀를 추가로 확인할 것.
