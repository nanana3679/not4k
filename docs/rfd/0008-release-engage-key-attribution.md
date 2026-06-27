# RFD 0008: release를 engage-키에 귀속 (누설 근본 차단 + 홀드 이어잡기 deprecate)

**Status:** Accepted (2026-06-27)

## 관련 문서

- [`docs/rfd/0006-earliest-matching-headless-long-note.md`](0006-earliest-matching-headless-long-note.md) — keydown 흡수(engage-키의 출처)
- [`docs/rfd/0007-release-lockout.md`](0007-release-lockout.md) — 이 RFD가 대체하는 슬라이드 락아웃
- [`docs/spec/game-core.md`](../spec/game-core.md), [`docs/spec/note-system.md`](../spec/note-system.md), [`docs/context/glossary.md`](../context/glossary.md)

---

## 1. 배경

keydown은 "가장 이른 노트 매칭 + 흡수(RFD 0006)"로 한 입력이 한 노트에 귀속된다. 그러나 release(keyup)는 레인 단위 브로드캐스트라 귀속이 없어, **held로 완료된(hold-only) 노트를 놓는 release가 직후 노트(슬라이드 미리-떼기·릴리즈 노트·롱 끝점)로 새는 누설**이 있다(재현됨). RFD 0007은 슬라이드 표면만 시간 락아웃으로 막았고, 끝점·릴리즈 노트는 lane-held 모델 때문에 못 막았다.

## 2. 핵심 결정

**release 판정도 keydown처럼 "그 노트를 engage(눌러서 매칭/흡수)한 키"에 귀속한다.** 한 노트의 release-판정(끝점 종결, 슬라이드 미리-떼기)은 **그 노트를 engage한 키가 떼어졌을 때만** 발화한다. 다른 노트의 engage-키를 놓는 release는 그 노트로 가지 않는다.

이를 위해 **홀드 이어잡기(한 롱노트 진행 중 다른 키로 이어받기)를 deprecate**한다 — 한 롱노트는 자기 engage-키로 유지·판정된다.

## 3. 규칙

### 3.1 engage-키와 소진(spent)

- **engage-키(`engageKeys`)**: 헤드 없는 롱노트/슬라이드를 fresh keydown으로 흡수(RFD 0006)한 키. release 가드의 "그 노트를 engage한 키는 통과" 조건에만 쓴다(아래 §3.2). held-marker(held로 진입한 키)는 포함하지 않는다.
- **소진(`spentReleaseKeys`)**: hold-only/슬라이드/연결을 **held로 완료한 시점의 실제 held 키**가 소진된다. engage-키가 아니라 held 키를 쓰므로, **흡수 없이 held로 진입한 pre-held 입력도 닫힌다.** 소진 키는 그 키를 떼거나(놓기 처리 후) 다시 누르면 해제된다.

### 3.2 release 귀속

- **끝점 종결(`tryEndpointJudgmentOnRelease`)**: 떼어진 키가 그 롱노트의 engage-키일 때만 종결 판정. 다른 키(예: 홀드 중 탭의 탭 키)를 떼는 건 그 롱을 종결시키지 않는다.
- **슬라이드 미리-떼기(`checkSlideReleaseOnRelease`)**: 떼어진 키가 그 슬라이드를 engage한 키일 때만 미리-떼기 Perfect. **선행 hold-only를 놓는 키는 슬라이드를 engage한 적 없으므로 안 샌다.** → RFD 0007 락아웃 불필요.
- **릴리즈 노트(길이 0 일반)**: 떼어진 키가 직전에 다른 held 완료 노트를 engage했던 "소진된(spent)" 키가 아니면 keyup 판정. 소진 키의 keyup은 "놓기"라 릴리즈 노트로 안 간다.

### 3.3 유지(보존)

- **유지 충족(`checkLongNoteBodyHold`)** 자체는 바꾸지 않는다(회귀 최소화). 비-이어잡기 플레이에서는 engage-키 = 유지 키라 lane-held와 결과가 같다. 이어잡기(키 스왑)만 결과가 달라진다(§4).
- **연결 판정(held 체크)**, **홀드 중 탭**, **같은 키 slip grace**는 그대로.

## 4. 홀드 이어잡기 deprecate

홀드 이어잡기(롱노트 진행 중 다른 키로 이어받기)는 **대응 피스가 없는 메커니즘 단위**다(`glossary.md` — "대응 피스 없음"). 이를 요구하는 차트 패턴이 없고, 이를 쓰는 피스(레인 내 분리 PP-003)는 모두 **홀드 중 탭으로 대체 가능**하다.

- **릴리즈탭**(PP-004): 롱 끝에서 소유 키를 떼며 다음 노트를 누름 — 한 롱 안 스왑이 아님. 보존.
- **홀드 트릴**(PP-010): `o-o-`를 롱마다 키 하나로 ABAB 교대 — 교대는 롱 *사이*이고 연결 판정(held 체크)이라 release 귀속과 무관. 보존.

→ 따라서 deprecate해도 깨지는 피스가 없다. `glossary.md`·`note-system.md`에서 홀드 이어잡기를 제거/주석하고, grace period의 목적을 "같은 키 brief slip + 연결 경계 전환"으로 재정의한다(12ms 수치는 유지).

## 5. 케이스 검증

| 케이스 | 기대 | engage-키 귀속 |
|---|---|---|
| hold-only A 완료 후 놓기 → 직후 슬라이드 B | B 보호 | A 놓는 키는 B를 engage 안 함 → B 미발화 ✅ |
| hold-only A → 직후 릴리즈 노트 | 보호 | A engage-키 = spent → keyup이 릴리즈 노트로 안 감 ✅ |
| 동시 롱노트(`o-=`) 한쪽 끝점 release | 그 롱만 | 떼는 키 = 그 롱 engage-키 → 그 롱만 종결 ✅ |
| 릴리즈탭(소유 키 떼기+다음 노트) | 정상 | 떼는 키 = 그 롱 engage-키 → 정상 종결 ✅ |
| 홀드 트릴(롱마다 키, 연결) | 정상 | 연결은 held 체크, release 귀속 무관 ✅ |
| 홀드 중 탭(탭 키 떼기) | 롱 유지 | 탭 키 ≠ 롱 engage-키 → 롱 종결 안 됨 ✅(더 정확) |

## 6. RFD 0007 대체

슬라이드 락아웃(`releaseLockoutUntilMs` + held 완료 시 설정 + `checkSlideReleaseOnRelease` 가드)은 engage-키 귀속이 더 정밀하게 대체하므로 **제거**한다.

## 7. 영향 문서/코드

- 구현: `src/game/judgment/JudgmentEngine.ts` — engage-키 추적(absorbedLongKeys 생애 유지 + 헤드/활성화 시 기록), `tryEndpointJudgmentOnRelease`/`checkSlideReleaseOnRelease`/릴리즈 노트 경로의 engage-키 가드, RFD 0007 락아웃 제거.
- `docs/spec/note-system.md`·`docs/context/glossary.md` — 홀드 이어잡기 deprecate, grace period 목적 재정의.
- `docs/spec/game-core.md` — release 귀속 한 줄.
- 회귀 테스트: 릴리즈탭, 홀드 트릴, 연결 체인, 홀드 중 탭, 더블롱, 누설 3표면.

## 8. 한계/미해결

- **소진은 완료 시점 held 키 기준**이라 흡수(engage) 없이 held로 진입한 pre-held 입력도 닫힌다(적대적 검증으로 확인). `engageKeys`(fresh keydown)는 가드의 "그 노트를 engage한 키는 통과" 조건에만 쓴다.
- **유지 충족(`checkLongNoteBodyHold`)은 lane-held 유지(§3.3)**: 비-이어잡기에선 engage-키와 동일하므로 1차는 유지 모델을 안 건드린다. deprecate된 이어잡기(스왑) 후 끝점 release는 귀속이 어긋날 수 있으나 허용한다.
- **(별개·기존 빈틈) 홀드 중 탭의 탭 키 과발화**: KeyA로 롱 유지 중 KeyB로 탭한 뒤 KeyB를 그 롱의 끝점 윈도우에서 떼면 롱이 조기 종결된다. 이는 끝점 종결이 키를 가리지 않는 **RFD 0008 이전부터 있던 동작**(대조 검증 확인)이며 이 RFD가 만든 것이 아니다 — 별도 과제로 추적.
