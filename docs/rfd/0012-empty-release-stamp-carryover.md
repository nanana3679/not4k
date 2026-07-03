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
- 구현은 **상호보완적 두 메커니즘**이다. `update()`는 한 프레임에서 `checkLongNoteBodyHold`(회수) → `checkLongNoteBodyEnd`/`checkLengthZeroHoldOnly`(부여) 순으로 돈다:
  - **(1) 회수** — `checkLongNoteBodyHold`에서 바디의 `hasBeenPressed`가 `false→true`로 전이하는 순간, 그 레인의 현재 눌린 키들을 `emptyReleaseKeys`에서 제거한다. **부여가 앞 프레임에 먼저 일어난 다중 프레임 케이스**(앞 프레임에서 도장 부여 → 뒤 프레임에서 새 바디 시작)를 담당한다.
  - **(2) 부여 조건화** — `markEmptyRelease`가 도장을 찍기 전, 그 레인에 눌린 키가 load-bearing 중인 다른 롱이 있으면 도장을 찍지 않는다. **load-bearing = `BODY_ACTIVE`(유지 성립: `hasBeenPressed`) 또는 `BODY_AWAITING_RELEASE`(끝점 지나 release 대기 — 그 키의 다음 release가 곧 종결이라 놓기가 아님).** **한 프레임이 부여와 회수를 함께 덮는 케이스**를 담당한다. 이때 회수는 아직 도장이 없어 no-op이라, 회수만으로는 못 막는다.
- **왜 둘 다인가 (프레임 독립성)**: 한 프레임이 앞 노트의 held 완료(부여)와 다음 롱의 바디 시작(회수)을 함께 덮으면, pass 순서상 회수(Hold)가 부여(End)보다 먼저 실행돼 no-op이 되고, 도장이 뒤늦게 부여돼 잔류한다 → 다음 롱의 정당한 종결이 막혀 Miss. 이는 랙 스파이크가 아니라 **평범한 30fps 프레임 흔들림 + 촘촘한 HARD 차트**에서 재현되는 **프레임레이트 의존 correctness 버그**다(프로젝트 최상위 품질 축 IO 타이밍/판정 일관성에 정면으로 걸림). 회수만으로는 단일 프레임을, 부여 조건화만으로는 다중 프레임을 각각 못 막으므로, 둘을 함께 둬 **프레임 정렬과 무관하게** 견고하게 만든다. 실증: 회수를 끄면 다중 프레임 회귀 테스트가, 부여 조건화를 끄면 단일 프레임 회귀 테스트가 각각 red로 떨어진다.
- **부여는 롱의 모든 죽음 경로를 커버해야 한다**: 부여 조건화(2)가 도장을 스킵하는 암묵적 전제는 "그 keyup은 load-bearing 롱의 종결로 소비되고 [RFD 0011](0011-normal-release-consume.md)의 `didTerminate` 도장이 이어받는다"이다. 그런데 대기 중이던(`BODY_AWAITING_RELEASE`) 롱이 keyup이 아니라 **update 타임아웃**으로 먼저 죽으면 아무도 도장을 안 남겨, 이후의 놓기 keyup이 후속 슬라이드로 샌다(관대형 누설 — 공짜 Perfect). 따라서 **타임아웃 Miss 분기에서도, 죽은 롱을 아직 잡고 있는 키가 있으면 `markEmptyRelease`로 도장을 남긴다.** 이로써 도장 부여가 롱의 세 결말 — **keyup 종결(0011) · held 완료(0008) · 타임아웃(이 RFD)** — 을 모두 덮어, keyup/타임아웃 어느 경로로 죽든 프레임 정렬과 무관하게 놓기 누설이 닫힌다.

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
| **A 끝점과 B 바디 시작이 한 프레임**에 겹침 | **B Perfect** | 부여 조건화(2)가 B의 `hasBeenPressed`를 보고 도장을 안 찍음 — 프레임 독립 (30fps 흔들림급 재현 회귀) |
| 일반 롱 B가 `AWAITING_RELEASE`인 채 직후 슬라이드 완료 → B 지각 release | **B 정상 종결** | 부여 조건화(2)가 `AWAITING_RELEASE`도 load-bearing으로 봄 (RFD 0008부터 있던 거울상 누설, 리뷰 발견) |
| B가 keyup 아닌 **타임아웃**으로 죽은 뒤 놓기 keyup → 직후 슬라이드 S | **S 미리-떼기 안 됨(→ 타임아웃 Miss)** | 타임아웃 Miss 분기가 held 키에 도장을 남김 — keyup/타임아웃 결말 무관하게 놓기 차단 (부여 조건화가 만든 회귀, 리뷰 발견) |

## 8. 영향 문서/코드

- 구현: `src/game/judgment/JudgmentEngine.ts` — (1) `checkLongNoteBodyHold`의 `hasBeenPressed` 전이에서 held 키의 `emptyReleaseKeys` 회수, (2) `markEmptyRelease`가 load-bearing 롱(`BODY_ACTIVE`+`hasBeenPressed` 또는 `BODY_AWAITING_RELEASE`)이 있으면 도장 부여 스킵, (3) `checkLongNoteBodyEnd`의 `BODY_AWAITING_RELEASE` 타임아웃 Miss 분기에서 held 키에 `markEmptyRelease`.
- 회귀: `src/game/judgment/JudgmentEngine.test.ts` — 다중 프레임 누설 + **단일 프레임 프레임 독립성** + **AWAITING 거울상** + **타임아웃 결말** + 슬라이드 보호·릴리즈탭 무회귀.
- [`docs/context/glossary.md`](../context/glossary.md), [`src/game/CONTEXT.md`](../../src/game/CONTEXT.md) — 공릴리즈 도장의 회수 조건에 "새 롱노트 바디 유지 시작"을 추가.
- RFD 0008 §10 / RFD 0011 §10 미해결 항목에 이 케이스가 해소되었음을 링크.

## 9. 미해결 / 열린 질문

- **(해소, 리뷰 발견 1차)** 1차 구현은 회수(1)만 뒀다가, 한 프레임이 부여와 회수를 함께 덮으면 pass 순서로 회수가 no-op이 되는 **프레임레이트 의존 누설**이 리뷰에서 발견됐다. 부여 조건화(2)를 추가해 해소(§5). "부여 조건화로 회수를 *교체*"하는 안은 다중 프레임을 되레 회귀시켜 기각 — 둘 다 필요함을 실증했다.
- **(해소, 리뷰 발견 3차 — 부여 조건화가 만든 회귀)** 부여 조건화(2)로 도장을 스킵한 뒤, 대기 중이던 롱이 keyup이 아니라 **update 타임아웃**으로 죽으면 아무도 도장을 안 남겨 이후 놓기 keyup이 후속 슬라이드로 새던 **관대형 누설(공짜 Perfect)**이 발견됐다(535a5f5가 만든 좁은 회귀, 심각도 낮음 — 이미 BAD 넘겨 Miss난 뒤라 처벌이 아니라 관대 방향). 타임아웃 Miss 분기에서 held 키에 `markEmptyRelease`를 남겨 해소(§5 "모든 죽음 경로 커버"). 이로써 도장이 프레임 정렬로 갈리던 성질(§5가 배격한 것)도 제거.
- **(해소, 리뷰 발견 2차)** 부여 조건화(2)의 스캔이 `BODY_ACTIVE`만 봐서, 일반 롱이 `BODY_AWAITING_RELEASE`(끝점 지나 release 대기)인 채 같은 키로 직후 슬라이드가 완료되면 도장이 찍혀 그 롱의 지각 종결이 막히던 누설이 발견됐다(RFD 0008부터 있던 **거울상** — 0012는 도장이 *나중* 노트 종결을, 이 건은 *먼저* 노트 종결을 막음. 프레임 독립·결정론적). 스캔에 `BODY_AWAITING_RELEASE`를 추가해 해소.
- **분할 릴리즈(`D=-`)와의 상호작용**: 더블 롱노트의 두 키를 시간차로 뗄 때, 앞선 hold-only 도장이 두 키에 걸쳐 있으면 회수가 키별로 정확히 동작하는지 — 현재 회수는 "유지 시작 시점의 held 키 전체"라 두 키를 함께 회수한다. doubleLong 바디 유지 케이스의 회귀를 추가로 확인할 것.
