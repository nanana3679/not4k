# RFD 0008: release를 engage-키에 귀속 (놓기 누설 근본 차단)

**Status:** Accepted (2026-06-27)

## 관련 문서

- [`docs/rfd/0006-earliest-matching-headless-long-note.md`](0006-earliest-matching-headless-long-note.md) — keydown 흡수(engage-키의 출처)
- [`docs/rfd/0007-release-lockout.md`](0007-release-lockout.md) — 이 RFD가 대체하는 슬라이드 락아웃
- [`docs/spec/game-core.md`](../spec/game-core.md), [`docs/spec/note-system.md`](../spec/note-system.md), [`docs/context/glossary.md`](../context/glossary.md)

---

## 1. 배경

keydown은 "가장 이른 노트 매칭 + 흡수(RFD 0006)"로 한 입력이 한 노트에 귀속된다. 그러나 release(keyup)는 레인 단위 브로드캐스트라 귀속이 없어, **held로 완료된(hold-only) 노트를 놓는 release가 직후 노트(슬라이드 미리-떼기·릴리즈 노트·롱 끝점)로 새는 누설**이 있다(재현됨). RFD 0007은 슬라이드 표면만 시간 락아웃으로 막았고, 끝점·릴리즈 노트는 lane-held 모델 때문에 못 막았다.

## 2. 핵심 결정

**release 판정도 keydown처럼 "그 노트를 engage(눌러서 매칭/흡수)한 키"에 귀속한다.** 한 노트의 release-판정(끝점 종결, 슬라이드 미리-떼기, 릴리즈 노트)은 **그 노트를 engage하지 않은 "소진된" 키가 떼어졌을 때는 발화하지 않는다.** 다른 노트(hold-only)를 held로 완료시킨 키를 놓는 release는 그 노트로 가지 않는다.

**유지 충족(`checkLongNoteBodyHold`)은 바꾸지 않는다(lane-held 유지).** 따라서 이 변경은 release 판정의 귀속만 좁히고, 한 롱노트를 어떤 키로든 유지하거나 키를 교대(홀드 이어잡기)하는 것은 그대로다(§4).

## 3. 규칙

### 3.1 engage-키와 소진(spent)

- **engage-키(`engageKeys`)**: 헤드 없는 롱노트/슬라이드를 fresh keydown으로 흡수(RFD 0006)한 키. release 가드의 "그 노트를 engage한 키는 통과" 조건에만 쓴다(아래 §3.2). held-marker(held로 진입한 키)는 포함하지 않는다.
- **소진(`spentReleaseKeys`)**: hold-only/슬라이드/연결을 **held로 완료한 시점의 실제 held 키**가 소진된다. engage-키가 아니라 held 키를 쓰므로, **흡수 없이 held로 진입한 pre-held 입력도 닫힌다.** 소진 키는 그 키를 떼거나(놓기 처리 후) 다시 누르면 해제된다.

### 3.2 release 귀속

- **끝점 종결(`tryEndpointJudgmentOnRelease`)**: 떼어진 키가 그 롱노트의 engage-키일 때만 종결 판정. 다른 키(예: 홀드 중 탭의 탭 키)를 떼는 건 그 롱을 종결시키지 않는다.
- **슬라이드 미리-떼기(`checkSlideReleaseOnRelease`)**: 떼어진 키가 그 슬라이드를 engage한 키일 때만 미리-떼기 Perfect. **선행 hold-only를 놓는 키는 슬라이드를 engage한 적 없으므로 안 샌다.** → RFD 0007 락아웃 불필요.
- **릴리즈 노트(길이 0 일반)**: 떼어진 키가 직전에 다른 held 완료 노트를 engage했던 "소진된(spent)" 키가 아니면 keyup 판정. 소진 키의 keyup은 "놓기"라 릴리즈 노트로 안 간다.

### 3.3 유지(보존)

- **유지 충족(`checkLongNoteBodyHold`)은 lane-held 그대로 둔다**(회귀 최소화). 키 스왑(홀드 이어잡기)은 release 판정이 아니라 유지 충족의 영역이라 그대로 동작한다(§4). engage-키/소진은 release 판정 귀속에만 쓴다.
- **연결 판정(held 체크)**, **홀드 중 탭**, **홀드 이어잡기**, **같은 키 slip grace**는 모두 그대로.

## 4. 홀드 이어잡기는 보존된다

이 RFD는 **release 판정의 귀속만 좁히고 유지 충족(`checkLongNoteBodyHold`)은 lane-held 그대로 둔다**(§3.3). 따라서 한 롱노트 진행 중 다른 키로 이어받는 **홀드 이어잡기는 lane-held + grace로 계속 동작한다** — 키 스왑은 release 판정이 아니라 유지 충족의 영역이고, 일반 롱노트의 release-tap은 소진 키가 아니므로 engage-키 귀속에 막히지 않는다(테스트 확인: KeyA→KeyB 키 교대 후 KeyB release-tap → Perfect).

소진(spent)이 영향을 주는 건 **hold-only를 held로 완료시킨 키의 "놓기" release**뿐이며, 그 노트는 떼는 판정이 면제돼 어차피 판정이 없다. 따라서 **릴리즈탭·홀드 트릴·홀드 이어잡기·홀드 중 탭이 모두 보존**되고, grace period의 목적("키 전환 수용")도 그대로다.

## 5. 케이스 검증

| 케이스 | 기대 | engage-키 귀속 |
|---|---|---|
| hold-only A 완료 후 놓기 → 직후 슬라이드 B | B 보호 | A 놓는 키는 B를 engage 안 함 → B 미발화 ✅ |
| hold-only A → 직후 릴리즈 노트 | 보호 | A engage-키 = spent → keyup이 릴리즈 노트로 안 감 ✅ |
| 동시 롱노트(`o-=`) 한쪽 끝점 release | 그 롱만 | 떼는 키 = 그 롱 engage-키 → 그 롱만 종결 ✅ |
| 릴리즈탭(소유 키 떼기+다음 노트) | 정상 | 떼는 키 = 그 롱 engage-키 → 정상 종결 ✅ |
| 홀드 트릴(롱마다 키, 연결) | 정상 | 연결은 held 체크, release 귀속 무관 ✅ |
| 홀드 이어잡기(키 스왑 후 release-tap) | 정상 종결 | 유지=lane-held 보존, release 키 소진 아님 ✅ |

## 6. RFD 0007 대체

슬라이드 락아웃(`releaseLockoutUntilMs` + held 완료 시 설정 + `checkSlideReleaseOnRelease` 가드)은 engage-키 귀속이 더 정밀하게 대체하므로 **제거**한다.

## 7. 영향 문서/코드

- 구현: `src/game/judgment/JudgmentEngine.ts` — engage-키 추적(absorbedLongKeys 생애 유지 + 헤드/활성화 시 기록), `tryEndpointJudgmentOnRelease`/`checkSlideReleaseOnRelease`/릴리즈 노트 경로의 engage-키 가드, RFD 0007 락아웃 제거.
- `docs/context/glossary.md` — "흡수"·release 귀속 용어. **홀드 이어잡기·grace period는 변경 없음(보존)**.
- `docs/spec/game-core.md` — release 귀속 한 줄.
- 회귀 테스트: 릴리즈탭, 홀드 트릴, 연결 체인, 홀드 중 탭, 더블롱, 누설 3표면.

## 8. 한계/미해결

- **소진은 완료 시점 held 키 기준**이라 흡수(engage) 없이 held로 진입한 pre-held 입력도 닫힌다(적대적 검증으로 확인). `engageKeys`(fresh keydown)는 가드의 "그 노트를 engage한 키는 통과" 조건에만 쓴다.
- **유지 충족(`checkLongNoteBodyHold`)은 lane-held 유지(§3.3)** — 홀드 이어잡기(키 스왑)가 그대로 동작한다. 일반 롱노트의 release-tap은 소진 키가 아니므로 engage-키 귀속에 막히지 않는다(테스트 확인).
- **(별개·기존 빈틈) 홀드 중 탭의 탭 키 과발화**: KeyA로 롱 유지 중 KeyB로 탭한 뒤 KeyB를 그 롱의 끝점 윈도우에서 떼면 롱이 조기 종결된다. 이는 끝점 종결이 키를 가리지 않는 **RFD 0008 이전부터 있던 동작**(대조 검증 확인)이며 이 RFD가 만든 것이 아니다 — 별도 과제로 추적.
