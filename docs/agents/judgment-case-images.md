# 판정 사례 이미지

노트와 키 누름·뗌, 판정 또는 설계 가설을 사용자에게 설명할 때는 텍스트 표 대신 이 도구로 PNG를 만들어 보여준다. 기본 모드는 구형 에디터 차트 모델(노트 = `NoteEntity`, 키 입력 = `tutorialInput`)을 기존 판정 엔진(`compileJudgmentChart` + `NoteJudgmentSession`)으로 재생한다. **새 명시 노트의 실제 판정은 `--explicit`과 v4 `ChartDocument` JSON을 사용한다.** 아직 구현하지 않은 규칙이나 원하는 판정 창을 논의할 때는 **`--design` 설계 모드**로 직접 지정한 내용을 그린다.

## 실행

```bash
pnpm case:image <case.txt|chart.json|-> [더 많은 사례…] --out <file.png> [--engine <repoPath>]… [--scale <px/ms>] [--skin classic|crystal|simple]
pnpm case:image --explicit <chart-v4.json|-> --out <file.png> [--engine <repoPath>]… [--scale <px/ms>] [--skin classic-explicit]
```

- `--out`: 저장할 PNG 경로. 필수다.
- `--engine`: 판정 엔진을 불러올 저장소(워크트리) 경로. 생략하면 이 도구가 있는 워크트리의 엔진을 쓴다. 여러 번 쓰면 같은 사례를 엔진마다 한 번씩 그린다(legacy는 가로, explicit은 세로).
- `--scale`: 시간 축 배율(px/ms). 주면 빈 구간을 줄이지 않는 선형 축이 된다. 생략하면 아래 [시간 축](#시간-축) 규칙으로 자동 배율을 고른다.
- `--skin`: 노트를 그릴 게임 스킨. `classic`(기본, 인게임 기본 스킨)·`crystal`·`simple` 중 하나다. 아래 [노트 스킨](#노트-스킨)을 따른다. `--explicit`은 `classic-explicit`만 쓴다.
- `--design`: [설계 JSON](#설계-모드엔진-미실행)을 읽어 기존 스킨으로 그린다. 판정 엔진은 실행하지 않으며 `--engine`과 함께 쓰면 오류다. `--skin`은 기본 모드와 똑같이 사용할 수 있다.
- `--explicit`: [v4 실제 명시 판정](#v4-실제-명시-판정)의 `compileExplicitJudgmentChart` + `ExplicitJudgmentSession` + 실제 `ScoreManager` 경로를 사용한다. `--design`과 함께 쓸 수 없고 스킨은 `classic-explicit`만 사용한다.
- 사례 자리에 `-`를 쓰면 표준 입력에서 읽는다. 대화 중 임시 파일 없이 heredoc으로 넘길 수 있다.

실행이 끝나면 PNG 경로·스킨 이름과 패널별 요약(등급 개수·달성률·Full Combo 또는 `판정 불가(finalize 전)`·미정산 수·검증 오류·엔진 예외)을 표준 출력에 찍는다. 이미지를 보기 전에 숫자부터 확인할 수 있다.

사례 파일·`--out`·`--engine`의 상대 경로는 명령을 친 디렉터리 기준이다(`pnpm`이 넘기는 `INIT_CWD`, 없으면 현재 디렉터리). 사례를 여러 개 줄 때 문법 오류는 `bad.txt: 2행: …`처럼 사례 출처를 앞에 붙여 알린다.

```bash
pnpm -s case:image - --out /tmp/case.png --engine ../terminal-holdonly-settlement <<'EOF'
제목: 결정 ④ — A를 1430에 뗌
노트: holdOnly 1000-1500 | long 1500-1560 | head 1560 | long 1560-1760
입력: A 1000-1430 | D 1490-1760
메모: A는 holdOnly 끝(1500) 전에 떼고, D로 head 1560을 일찍(1490) 친다
EOF
```

이 사례의 노트는 `N1`(holdOnly 1000–1500), `N2`(바디 1500–1560), `N3`(head 1560), `N4`(바디 1560–1760)이고, 이미지의 `N2` 판정은 다음과 같이 읽힌다.

```
N2 시작 실패 1620
  A↑1430 < 끝−Good 1440 · D↓1490 → N3 head
```

## v4 실제 명시 판정

```bash
pnpm case:image --explicit chart-v4.json --out /tmp/explicit.png
pnpm case:image --explicit chart-v4.json --engine . --engine ../other-explicit-engine --out /tmp/compare.png
```

`--explicit`은 `version: 4`인 `ChartDocument` JSON만 받는다. 노트의 `tap`·`body`·`release`·`tick` 의미를 그대로 새 compiler/session에 전달하며 구형 `NoteEntity`로 변환하지 않는다. 구형 텍스트·v3와 `judgment-case-design` JSON은 거부한다. 기본 legacy 모드에 v4를 넘기면 `--explicit`, `judgment-case-design` JSON을 넘기면 `--design` 사용 안내와 함께 거부한다. 깨진 JSON은 기존처럼 차트 파서의 `유효한 JSON이 아닙니다` 오류로 알린다.

아래는 BPM 120에서 `N1` 탭 노트 1000ms, `N2` 바디 1000～2000ms, `N3` 틱 노트 1500ms, `N4` 릴리즈 2000ms를 실제 입력으로 실행하는 v4 예시다.

```json
{
  "version": 4,
  "meta": { "title": "실제 명시 릴리즈", "artist": "case", "difficultyLabel": "NORMAL", "difficultyLevel": 1, "imageFile": "", "audioFile": "", "previewAudioFile": "", "offsetMs": 0 },
  "notes": [
    { "type": "tap", "kind": "single", "lane": 1, "beat": "2/1" },
    { "type": "body", "holdCount": 1, "lane": 1, "beat": "2/1", "endBeat": "4/1" },
    { "type": "tick", "count": 1, "lane": 1, "beat": "3/1" },
    { "type": "release", "count": 1, "lane": 1, "beat": "4/1" }
  ],
  "trillZones": [],
  "restZones": [],
  "events": [
    { "type": "bpm", "beat": "0/1", "bpm": 120 },
    { "type": "tutorialInput", "beat": "2/1", "endBeat": "4/1", "lane": 1, "keyCode": "KeyA", "keyLabel": "A" }
  ]
}
```

- 시각은 `ChartTiming`으로 파생하고 입력은 `tutorialInput`의 실제 down/up으로 재생한다. 같은 시각 입력은 문서 순서대로 한 batch로 전달한다. 사이는 0ms 기준 16ms 격자로 진행하고 실제 세션의 `latestJudgmentDeadlineMs` 이후 `finalize`한다.
- `--engine`은 **새 실행 계열**의 `explicitCompiledChart.ts`·`ExplicitJudgmentSession.ts`·`documentValidation.ts`·`shared/constants/judgment.ts`를 선택한 저장소에서 읽는다. 미지원 엔진을 legacy 실행으로 대체하지 않는다. 창과 유지 유예는 해당 엔진의 기본값을 출력하며 수동 창을 주입하지 않는다. 같은 입력을 엔진마다 실행하고 사례 × 엔진 순서대로 세로 패널을 쌓는다.
- main에 구형 항목이 남은 문서는 compiler가 거부한다. 오류·진단을 담은 PNG/요약은 만들되 종료 코드는 1이다. aux 항목은 원문 문서에 보존하고 새 게임 판정·PNG 노트에서는 제외한다. `N1` 등의 이름은 원래 `chart.notes` 인덱스이므로 aux가 사이에 있으면 번호가 건너뛴다.
- PNG와 요약에 **explicit · 실제 엔진 실행**을 표시한다. 점수·분모·현재 콤보(세션이 끝난 시점의 값이며 최대 콤보가 아니다)·미정산·종속 0점은 세션의 실제 결과이며 바디 가중치는 0이다. 대표 판정 등급은 PNG 바닥글과 요약 모두 `Perfect`처럼 같은 표기를 쓴다. 전체 이론 가중치가 0인 무점수 차트는 [RFD 0039](../rfd/0039-unscored-chart-results.md)에 따라 달성률을 숨기고 요약에 `달성률 없음(무점수 차트)`을 쓴다. 점수 항목이 있는 차트는 모두 놓쳐도 `달성률 0.00%`를 표시한다. 시작/유지 실패는 확정 fact를 사용한다. provisional 바디 시작·완료 중 `bodyProgressInvalidated`로 무효화된 것은 라벨에서 빼고, finalize 전에 남은 것만 `(잠정)`을 붙인다. finalize 뒤에는 늦은 입력이 없으므로 남은 provisional 진행을 확정으로 표시한다. 현재 바디 상태는 요약의 `현재` 줄(세션 `snapshot`)로 읽는다. 대표 판정은 같은 확정 시각의 `session.effects[].displayUpdate` 최종 개정을 사용한다.
- 정식 `buildExplicitSkinView`·`getExplicitSkinAsset`의 `public/skins/classic-explicit/` PNG를 사용한다. 트릴을 뺀 노트는 #348 선택 도안(싱글 파랑·더블 금색, 릴리즈 A, 틱 노트 싱글 44px·더블 각 32px)이고 트릴 탭·바디·Grace는 이전 도안이다([명시 스킨 원본](../../assets-lab/classic/explicit/README.md#원본과-출처)). 노트는 사례 구조를 읽기 위한 대기 도안이며 성공·실패는 실제 사실 라벨로 표시한다. 바디는 실제 경계 안에서 반복하고 cap·숨은 끝점은 그리지 않는다. 길이 0을 포함해 타일 한 장보다 짧은 바디는 사라지지 않게 타일 한 장(노트 한 칸) 높이로 실제 경계의 가운데에 그린다. 게임은 모든 바디를 시작·끝 시각보다 노트 반 칸씩 더 길게 그리지만 이 도구는 그 반 칸을 더하지 않는다. 그래서 게임과 같은 한 칸으로 보이는 것은 길이 0 바디뿐이고, 그보다 긴 바디는 게임보다 짧게(최대 노트 한 칸) 보인다. double 틱 노트는 #348 좌우 몫 레이어 두 장을 겹쳐 그린다. `--skin classic-explicit`은 생략할 수 있고 다른 스킨은 거부한다.
- 점선 띠는 탭·릴리즈의 **엔진 기본 Good 창**이다. 틱 노트는 독립 창을 그리지 않는다. 제목·설명 본문은 이미지 밖 텍스트 규칙을 유지하며 제목과 상세 결과는 stdout에 남긴다. 이미지 열람이 어려우면 PNG 경로와 stdout 패널 요약을 그대로 함께 전달한다.

## 설계 모드(엔진 미실행)

`--design`은 현재 엔진의 판정 결과와 무관하게 노트·입력·창·설명을 직접 지정하는 모드다. **노트는 기본 모드와 같은 게임 스킨 PNG로 그린다.** 그림 상단과 패널 요약에 **설계 예시 · 엔진 미실행 · 판정과 설명은 직접 지정**을 항상 붙인다. 가설을 엔진 검증 결과로 설명하지 않는다.

**제목과 설명 본문은 이미지에 넣지 않고 대화나 이미지 밖의 텍스트로 표시한다.** PNG에는 노트·키 입력·판정 창과 짧은 라벨만 남긴다. `title`·`annotations[].text`·`summary`·`memo`는 표준 출력에 보존하며, 공유 페이지를 만들 때도 `<img>` 밖의 본문으로 배치한다.

```bash
pnpm case:image --design design.json --out /tmp/design.png --skin classic
```

다음은 문법을 설명하기 위한 수동 예시이며 게임 규칙을 확정하는 사례가 아니다.

```json
{
  "format": "judgment-case-design",
  "title": "비대칭 창을 직접 지정한 설계 예시",
  "notes": [
    { "kind": "body", "startMs": 1000, "endMs": 2000 },
    { "kind": "tap", "atMs": 1000 },
    { "kind": "tick", "atMs": 1500 },
    { "kind": "release", "atMs": 2000 }
  ],
  "inputs": [{ "key": "A", "downMs": 950, "upMs": 1950 }],
  "windows": [
    { "note": "N2", "startMs": 880, "endMs": 1080, "label": "가정한 시작 창" },
    { "note": "N4", "startMs": 1800, "endMs": 2120, "label": "가정한 종료 창", "tone": "proposal" }
  ],
  "annotations": [
    { "note": "N2", "atMs": 950, "label": "Great", "text": "이 입력을 Great로 가정", "tone": "success" },
    { "note": "N4", "atMs": 1950, "label": "이른 뗌", "text": "이 뗌을 허용할지 논의", "tone": "proposal" }
  ],
  "summary": "창과 판정은 모두 직접 지정한 예시",
  "memo": "현재 엔진의 창이나 점수를 가져오지 않음"
}
```

| 필드 | 내용 |
| --- | --- |
| `format` | 반드시 `judgment-case-design`. 에디터 JSON과 구분한다 |
| `title` | 이미지 밖에 표시할 제목. 생략하면 파일 이름, 표준 입력이면 `설계 예시` |
| `notes` | 1개 이상. `kind`는 `body`·`tap`·`release`·`tick`·`marker`(자유 표식). `body`는 `startMs`·`endMs`, 나머지는 `atMs`를 쓴다 |
| 노트 `id`·`name` | `id`를 생략하면 배열 순서대로 `N1`, `N2`, …. `id`는 중복 불가이며 창·설명이 참조하는 이름이다. `name`은 선택 부연 이름이다 |
| 노트 `lane`·`count` | 각각 기본 1인 양의 정수. `count`는 그림의 수량 표기이며 점수 유닛 생성이나 물리 키 배정을 뜻하지 않는다 |
| `inputs` | 선택 배열. `key`·`downMs`, 선택 `lane`(기본 1)·`upMs`. 뗌을 생략하거나 `null`이면 계속 누르는 입력이다 |
| `windows` | 선택 배열. `note`(노트 id)·`startMs`·`endMs`·`label`, 선택 `tone`. 비대칭·겹침·음수 시각도 지정할 수 있다 |
| `annotations` | 선택 배열. `atMs`·`text`, 선택 `note`·`tone`·`label`. `text`는 이미지 밖의 설명 본문이다. `label`을 지정한 항목만 해당 시각에 짧은 라벨로 그린다 |
| `tone` | `neutral`(기본, 설명)·`success`(성공 가정)·`failure`(실패 가정)·`proposal`(제안). 색뿐 아니라 글자로도 구분한다 |
| `summary`·`memo` | 선택 문자열. 이미지 밖의 텍스트와 표준 출력에 표시한다 |

- 시각은 유한한 숫자(ms)이며 음수를 허용한다. 구간 끝이 시작보다 이르거나 참조 노트가 없거나 알 수 없는 필드를 쓰면 출처와 필드 위치를 붙여 실패한다.
- `count` 1·2인 `tap`·`body`는 기본 모드와 같은 single·double 에셋, 크기, 타일링, 캡, 접촉 그림자를 쓴다. 실패 설명을 적어도 노트 자체는 기본 모드처럼 대기 상태로 표시한다. `release` 표시는 기존 대기 terminal 에셋을 재사용하며, 새로운 release 에셋 디자인을 확정하는 것은 아니다.
- 전용 에셋이 없는 `tick`은 ◇, 자유 표식 `marker`와 3개 이상 수량은 ○로 표시한다(바디 구간은 점선). 해당 사례의 바닥글에 **임시 표식(전용 에셋 없음)**을 명시하며 정식 노트 디자인으로 설명하지 않는다.
- **게임의 배치 규칙은 검사하지 않는다.** 같은 위치에 서로 다른 종류를 놓은 금지 예시도 그릴 수 있다. 단, 그림으로 표현하는 구조가 잘못된 입력은 거부한다.
- 창은 `W1`, `W2`, … 번호와 반투명 띠·점선 경계로 표시한다. 노트·입력·라벨과 같은 시간 축을 쓰며, 지정한 끝점을 축 눈금에 포함한다. 라벨이 밀려도 창의 경계는 실제 지정 시각에 남는다. 현재 엔진의 Good 창으로 치환하지 않는다. `label` 없는 설명 본문은 이미지의 축·배치에 영향을 주지 않는다.
- `--scale`과 표준 입력 `-`도 사용할 수 있다. 여러 설계 파일은 각자 시간 축을 가진 패널로 **세로로** 쌓는다.
- 자동 판정·점수·달성률·Full Combo 집계는 없다. 표준 출력에는 노트·입력·창·수동 설명·요약을 모두 찍는다. 이미지 열람이 어려운 환경에서는 PNG 경로와 함께 이 패널 요약을 대화에 그대로 붙인다.
- 아래의 텍스트 문법·에디터 JSON·엔진 비교는 기본 엔진 모드에 해당한다. [노트 스킨](#노트-스킨)의 에셋 렌더링은 기본 모드와 설계 모드가 공유한다. `--explicit`은 이 렌더링을 쓰지 않고 [v4 실제 명시 판정](#v4-실제-명시-판정)의 `classic-explicit` 정식 에셋으로 그린다.

## 텍스트 문법

대화에서 쓰는 ms 기반 문법이다. 피스 표기법은 ms 오프셋을 나타낼 수 없어서 따로 둔다. 문법은 1ms = 1박(BPM 60000, 1마디 = 1000박)인 에디터 차트로 바뀌므로 결과는 에디터 사례와 같은 모델이다.

| 머리글 | 영어 | 내용 |
| --- | --- | --- |
| `제목:` | `title:` | 이미지 맨 위 제목. 한 번만 쓴다 |
| `노트:` | `notes:` | 노트 토큰을 `\|`로 구분. `노트:` 줄을 여러 번 쓰면 토큰을 이어 붙인다. 머리글 없는 줄로 이어 쓰면 문법 오류다 |
| `입력:` | `inputs:` | 입력 토큰을 `\|`로 구분. `입력:` 줄도 여러 번 쓸 수 있다 |
| `메모:` | `memo:` | 선택. 머리글 없는 다음 줄들도 다음 머리글 전까지 메모로 이어진다(가설 설명 등) |

메모 밖에서는 `#`으로 시작하는 줄과 빈 줄을 무시한다. 메모 안에서는 `#1 가설` 같은 `#` 줄과 가운데 빈 줄도 메모 그대로 남고, 메모 앞뒤의 빈 줄만 뺀다. 머리글 이름은 대소문자를 가리지 않는다.

### 노트 토큰

시간은 0 이상의 ms(소수 가능)다. 기본 레인은 1이고 `L2:` 접두사로 바꾼다(`L2: head 1000`). 레인은 1～4이며 범위 밖은 문법 오류다. 종류 이름은 대소문자를 가리지 않는다.

| 토큰 | 노트 |
| --- | --- |
| `head T` | single 포인트 |
| `dhead T` | double 포인트 |
| `trill T` | trill 포인트 |
| `grace head T` | `grace` single (`grace dhead`, `grace trill`도 가능) |
| `long S-E` | `long` 바디 |
| `dlong S-E` | `doubleLong` 바디 |
| `tlong S-E` | `trillLong` 바디 |
| `holdOnly S-E` | `holdOnly` `long` |
| `dholdOnly S-E` | `holdOnly` `doubleLong` (`holdOnly dlong S-E`와 같다) |
| `holdOnly T-T` | 길이 0 `holdOnly` |
| `zone S-E` | `trillZone` |

trill 노트가 있는데 그 레인에 `zone`이 없으면 trill 노트 범위를 덮는 `trillZone`을 자동으로 만든다. head는 에디터처럼 같은 레인·같은 시각의 포인트로 바디와 짝지어진다.

### 노트 이름

모든 노트에는 이미지 전체에서 쓰는 이름이 붙는다. 대화에서 "N2가 시작 실패"처럼 노트를 가리킬 때 이 이름을 쓴다.

- **자동 이름**: `노트:` 줄에 적은 순서대로 `N1`, `N2`, …. 에디터 JSON이면 `chart.notes` 순서다. head(포인트)와 바디는 엔진에서 별개 노트이므로 따로 센다. `head 1000 | long 1000-2000`은 `N1`(head)과 `N2`(바디)다. `zone`은 노트가 아니라서 세지 않는다.
- **직접 붙인 이름**: 노트 토큰 끝에 `[이름]`을 붙인다. 예: `long 1500-1560 [가운데]`, `L2: grace head 1000 [왼손]`. 판정 라벨에는 `가운데`로 쓰고, 레인 옆 이름표에는 자동 이름과 함께 `N2 가운데`로 써서 자동 이름도 계속 쓸 수 있게 한다.
- 이름 안의 공백·하이픈은 그대로 둔다. `|`·`[`·`]`는 쓸 수 없다.
- 빈 이름 `[]`, 두 노트에 같은 이름, 자동 이름과 헷갈리는 `[N2]`·`[N2u1]`(대소문자 무관), `zone`에 붙인 이름, 토큰 중간의 `[이름]`은 문법 오류다.
- double 노트의 유닛은 이름 뒤에 `u1`·`u2`를 붙인다(`N2u1`, `가운데u2`). 유닛 1이 왼쪽 절반, 유닛 2가 오른쪽 절반이다.

### 입력 토큰

| 토큰 | 뜻 |
| --- | --- |
| `A 1000-1430` | 키 A를 1000에 누르고 1430에 뗀다 |
| `A 1000-` | 1000에 누르고 끝까지 떼지 않는다. 이미지에 `A↓1000 (계속)`으로 표시한다 |
| `A 0-100 \| A 200-300` | 같은 키를 여러 번 누른다 |
| `L2:A 1000-1100` | 레인 2 입력 (`tutorialInput` 레인은 1～4) |

같은 ms의 입력은 한 batch로 엔진에 넘기고 적은 순서를 지킨다(같은 입력은 down 다음 up). 엔진의 키 식별자는 적은 키 이름 그대로다.

### 오류 처리

- 문법 오류(알 수 없는 종류, 포인트에 구간 시간, 시간 형식 등)는 줄 번호와 함께 실패하고 이미지를 만들지 않는다.
- 겹침·구간 역전·판정 제약 같은 의미 오류는 거부하지 않는다. `validateChart` 결과를 이미지 바닥글에 표시하고 엔진도 그대로 돌린다.
- 엔진이 예외를 던지면 그 시각과 메시지를 바닥글에 빨간 상자로 표시하고 그때까지의 판정을 그린다. finalize 전에 멈춘 등급 개수·달성률은 중간값이므로 Full Combo 자리에는 흐린 `판정 불가(finalize 전)`를 쓴다.

## 에디터 차트 JSON

에디터가 저장한 v3 차트 JSON(`serializeChart` 결과)을 그대로 사례로 넘길 수 있다. 첫 글자가 `{`이면 JSON으로 읽는다. 에디터에서 사례를 만들고 저장하면 된다.

- 노트는 게임과 같은 `createChartTiming`으로, 입력은 튜토리얼 재생기와 같은 `getTutorialInputTimings`로 ms를 구한다. `BpmChangeEvent`와 `offsetMs`가 반영된다.
- 키 입력은 `tutorialInput` 이벤트다. 누름 = `beat`, 뗌 = `endBeat`, 엔진 키 식별자 = `keyCode`, 표시 이름 = `keyLabel`(없으면 `KeyF` → `F`처럼 줄임)이다.
- 제목은 `meta.title`이고, 비어 있으면 파일 이름을 쓴다.

## 엔진 선택

파서·러너·렌더러는 항상 이 도구가 있는 워크트리의 `src/lab/judgmentCase/`를 쓰고, 판정 엔진만 `--engine` 저장소에서 불러온다. 저장소마다 Vite 서버를 하나 띄워 기본 모드는 다음 안정 API를 `ssrLoadModule`로 읽는다. `--explicit`이 읽는 모듈은 [v4 실제 명시 판정](#v4-실제-명시-판정)을 따른다.

- `src/game/judgment/compiledJudgmentChart.ts`의 `compileJudgmentChart`
- `src/game/judgment/NoteJudgmentSession.ts`의 `NoteJudgmentSession`
- `src/shared/validation/index.ts`의 `validateChart`

리뷰 중인 PR의 엔진과 `main` 엔진을 같은 사례로 비교할 때 쓴다. 예: `--engine . --engine ../terminal-holdonly-settlement`. 각 패널에는 엔진 표시(워크트리 이름 · 브랜치 @짧은 커밋, 판정·shared 코드에 커밋 안 된 수정이 있으면 `(+커밋 안 된 수정)`)와 저장소 경로가 붙는다.

엔진 구동은 기존 프로브와 같다. 입력 시각마다 `processBatch`, 그 사이는 16ms 프레임으로 `advance`, 마지막 노트 시각 + Good을 처음 넘는 프레임까지 진행한 뒤 `finalize`한다. 입력 batch마다 그 직전과 재생을 마친 뒤의 엔진 유닛 상태(`NoteJudgmentSession.unitStates`: 유닛별 시작 여부 `hasStarted`·실패·완료, 기존 코어는 경계 밖 필드로 등록된 유지 키 `registeredKeys`도 싣는다)도 함께 담아 실패 라벨에 쓴다. 세션에 `bodyStates` 속성이 있으면(이전 엔진, prototype getter 포함) `bodyStates`만 읽고, 없을 때만 `unitStates`를 읽는다. 그래서 `bodyStates`가 undefined를 주는 세션은 `unitStates`가 있어도 유닛 상태 없이 그린다. 사례 이미지 엔진 워크트리(`~/not4k-case-engines`)가 실패 사유 줄을 끄는 방법이다. 시작 여부가 `hasStarted`가 아니라 `active`이면 그 값을 쓴다. 둘 다 없는 엔진이면 유닛 상태 없이 그린다.

프레임은 0ms에서 시작하는 16ms 격자다. 기한 시각을 그대로 확정 시각으로 쓰는 이벤트(예: `N3 head Miss 1120`)와 달리, 프레임에서 발견해 그 프레임 시각으로 확정되는 이벤트(예: 보류한 up이 풀리며 확정되는 유지 실패)는 확정 시각이 이 격자에 맞춰진다. 그래서 같은 사례도 프레임 간격이 다르면 확정 시각이 몇 ms 달라질 수 있다(등급은 같다). 예를 들어 `노트: head 1000 | long 1000-1100 | head 1100 | long 1100-1200 | head 1200` / `입력: A 990-1210 | D 980-1060 | D 1170-1290`의 `N2 유지 실패 1072`는 1ms 프레임이면 1060, 33ms 프레임이면 1089다. 이미지 범례에도 이 기준을 적는다.

## 비교 모드

사례 여러 개와 엔진 여러 개를 주면 (사례 × 엔진) 패널을 사례 순서, 그 안에서 엔진 순서로 나란히 그린다.

- 같은 사례의 패널끼리는 시간 축을 공유해 같은 시각이 같은 높이에 온다.
- 다른 사례끼리는 각자 축을 쓰고 가장 이른 시각(바닥)을 맞춘다.
- 패널이 둘 이상이면 각 패널 머리글에 엔진 표시를 붙인다.

## 이미지 읽는 법

시간은 게임처럼 아래에서 위로 흐른다.

- **ms 축**(왼쪽): 노트 시작·끝과 입력 시각마다 눈금과 값을 단다. 노트 시각은 굵게, 입력 시각은 주황, 둘 다면 흰색이다.
- **노트 레인**: 게임 스킨 에셋으로 노트를 그린다(아래 [노트 스킨](#노트-스킨)). `trillZone`은 게임과 같은 초록 띠(`#00ff88`, 불투명도 15%)이고, 게임처럼 같은 구간 롱노트 바디의 범위(끝 박스 윗변부터 시작 박스 아랫변까지, 길이 0이면 노트 한 칸)를 덮는다. 판정 결과와 상관없이 모든 노트를 판정 전(대기) 모양으로 그린다. 실패한 바디도 실패 에셋으로 바꾸거나 덧칠하지 않으며, 실패는 판정 열의 라벨(`N2 시작 실패 1620`과 이유 줄)로만 보여준다.
- **노트 경계선**: 노트 시작·끝 시각마다 레인을 가로지르는 어두운 선을 긋는다(포인트 노트는 선 위에 그린다). 맞닿은 바디(예: `N2` 1500–1560과 `N4` 1560–1760)가 하나의 긴 바디가 아니라 별개 노트임을 보여준다. Classic의 대기 터미널은 바디와 같은 타일이라, head가 없는 접합부는 이 선과 이름표 괄호로 구분한다.
- **노트 이름표**(레인 오른쪽 `노트` 열): 노트마다 `이름 종류 구간`을 단다. 예: `N1 holdOnly 1000–1500`, `N2 바디 1500–1560`, `N3 head 1560`, `N4 바디 1560–1760`. 바디는 레인 옆 괄호가 그 구간을 감싸고(맞닿은 괄호는 끝을 조금씩 띄운다) 괄호 가운데에서, 포인트는 그 시각에 레인에서 뻗은 짧은 선에서 리더선으로 이름표를 잇는다. 겹치는 이름표는 위아래로 벌린다. 레인이 여럿이면 이름표에 레인을 넣고(`N1 L2 head 1000`) 괄호 x를 레인마다 어긋나게 한다(오른쪽 레인일수록 레인 가까이).
  - 종류어: `head`·`double head`·`trill`(포인트, grace면 앞에 `grace`), `바디`·`double 바디`·`trill 바디`, `holdOnly` 바디는 `holdOnly`·`double holdOnly`·`trill holdOnly`
  - 이름은 노트 종류별 색(single·바디 파랑, double·double 바디 금색, trill 흰색, trill 바디 회색)으로 칠하고, 판정 라벨의 이름도 같은 색이다. 스킨과 관계없이 같은 색을 쓴다.
- **키 열**: 키마다 한 열. 누름부터 뗌까지 막대를 긋고 `A↓1000`, `A↑1430`을 단다. 떼지 않은 입력은 위쪽 화살표와 `(계속)`으로 표시한다.
- **점선**: 입력 시각마다 축부터 키 열까지 가로 점선을 긋는다.
- **판정 열**(오른쪽): 엔진 이벤트마다 확정 시각(`confirmedAt`)에 점을 찍고 노트 이름으로 시작하는 라벨을 단다. 시작·유지 실패에 확인되는 이유가 있으면 라벨 아래 둘째 줄에 들여 쓴다. 겹치는 라벨은 위아래로 벌리고(두 줄 라벨은 두 칸을 차지) 리더선으로 잇는다.
- **바닥글**: Perfect·Great·Good(·Good◇)·Miss 개수, 달성률, Full Combo 여부(finalize 전에 멈췄으면 흐린 `판정 불가(finalize 전)`), 정산된 score item 수, 미정산 score item(빨간 상자), 엔진 예외, 검증 오류, 범례, 엔진 표시.

### 판정 라벨

모든 판정 라벨은 그 이벤트의 노트 이름으로 시작한다(double은 `N2u1`처럼 유닛을 붙인다).

| 라벨 | 뜻 |
| --- | --- |
| `N3 head Great −70 ← D↓1490` | `N3`의 head 판정, 등급, 타이밍(입력 − 노트), 판정에 쓰인 입력 |
| `N4 release Perfect ±0 ← D↑1760` | 실제 release 판정 |
| `N1 holdOnly Perfect ← A↑1430` | `holdOnly` 상태 판정이 그 뗌 시각에 확정됨 |
| `N1 holdOnly Perfect 1500 (유지 완료)` | 입력 없이 끝까지 유지해 확정됨 |
| `… · 확정 1610` | 입력 시각과 확정 시각이 다름(보류 뒤 확정) |
| `N3 head Miss 1120 (입력 없음)` | 판정 창 안 입력이 없어 기한에 Miss |
| `N2 시작 실패 1620` | 한 번도 시작하지 못한 바디 유닛의 유지 실패(무점수 Miss). 보통 시작 기한(S + Good)에 확정된다 |
| `N2 유지 실패 1500` | 시작했던 바디 유닛이 중간 또는 끝 기한에 실패함 |
| `N2 실패 1500` | 엔진이 유닛 상태를 주지 않아 시작·유지 실패를 가릴 수 없음(이유 줄도 달지 않는다) |
| `N4 release 0점 처리 1120` | 종속 끝점의 0점 정산(`dependentZero`, 등급 개수에는 들어가지 않음) |
| `N2u1 …` | double head·`doubleLong`의 유닛 1 |

라벨의 입력 표기는 엔진 이벤트의 `inputAt`과 같은 시각·그 노트와 같은 레인의 입력 중 이벤트 `key`가 있으면 그 키에서 찾는다. head는 누름, release와 `holdOnly`는 뗌을 먼저 고른다(`holdOnly` 이벤트에는 `key`가 없고, 입력 시각이 있는 `holdOnly`는 뗌에서 확정된다). 찾지 못하면 `@1234`처럼 시각만 쓴다.

### 실패 이유(둘째 줄)

시작·유지 실패 라벨 아래에는 사례 데이터·엔진 이벤트·엔진 유닛 상태로 확인되는 사실만 짧게 적는다. 확인할 수 없는 조각은 추측하지 않고 빼며, 조각이 하나도 남지 않으면 둘째 줄을 그리지 않는다. 조각은 ` · `로 잇는다.

| 이유 조각 | 언제 | 뜻 |
| --- | --- | --- |
| `A↑1430 < 끝−Good 1440` | 시작 실패 | 이 바디 시작(S)에서 끝나는 같은 레인의 앞 바디가 시작했고, 엔진이 그 앞 바디에 등록한 유지 키로 앞 바디 구간 동안 누른 입력이 **모두** 이 바디의 끝−Good(E − Good) 전에 떼졌다. 끝−Good 이후에 뗐다면 이 바디의 유효한 이른 완료가 될 수 있었다. 앞 바디가 시작하지 않았거나 끝−Good 이후까지 쥔 입력이 하나라도 있으면 이 조각은 뺀다 |
| `D↓1490 → N3 head` | 시작 실패 | 시작 창(S − Good ～ S + Good)의 같은 레인 누름과, 그 누름을 쓴 head 판정(같은 시각·같은 키). 시작 창의 누름 중 하나라도 쓴 head 판정을 찾지 못하면(head 없는 바디 시작에 쓰였을 수도 있으므로) 이 조각을 뺀다 |
| `새 입력 없음` | 시작 실패 | 시작 창에 같은 레인 누름이 없다 |
| `A↑1500 (끝−Good 1880 전)` | 바디 중간 유지 실패 | 확정 시각의 같은 레인 뗌 중, 그 시각 입력 batch 직전에 엔진이 이 노트에 등록한 유지 키의 뗌. double은 엔진이 쥔 키 수로 뒤 유닛부터 실패시키므로 같은 노트의 두 유닛 등록 키를 모두 본다. 끝−Good 전이면 괄호를 붙인다. 확정이 바디 시작 전이거나 끝 이후, 또는 그런 뗌이 없으면(프레임에서 확정된 실패 포함) 이유를 달지 않는다 |

`maintenanceMiss`를 시작 실패와 유지 실패로 가르는 기준은 엔진 유닛 상태다. 재생을 마친 뒤 그 유닛이 실패(`failed`)했고 한 번도 시작(`hasStarted`)하지 않았으면 시작 실패, 시작했다가 실패했으면 유지 실패다. 엔진에서 `hasStarted`는 true로만 바뀌므로 재생 뒤 상태로 가릴 수 있다. 확정 시각이나 그 시각의 입력으로는 가리지 않는다(시작 기한 S + Good에 다른 키를 떼도 시작 실패는 시작 실패다). 엔진이 유닛 상태를 주지 않으면(위 엔진 구동 절의 읽기 규칙) `실패`로만 쓰고 이유를 달지 않는다. 길이 0 `holdOnly`에는 이유를 달지 않는다.

미정산 score item은 바닥글에 `N4 release @2000 (n3:release:0)`처럼 쓴다. 괄호 안 id의 `n3`은 0부터 세는 엔진 인덱스라 노트 이름 `N4`와 숫자가 하나 다르다.

### 시간 축

자동 축은 노트·입력·확정 시각을 주요 시각으로 삼아 구간별 선형으로 그린다.

- 인접한 주요 시각 사이는 최소 22px를 보장한다. 20ms 바디나 10ms 차이의 입력도 읽히지만, 짧은 간격은 실제 비율보다 길어 보인다. 값은 축 눈금으로 읽는다.
- 긴 빈 구간은 최대 220px로 줄이고 축에 물결(≈)을 그린다.
- 전체 플롯 높이가 약 720px 안에 들어가는 가장 큰 배율(최대 1.2px/ms)을 고른다.
- `--scale`을 주면 빈 구간을 줄이지 않는다(최소 간격만 보장). 길이 비율을 그대로 보고 싶을 때 쓴다.

휴대폰 스크린숏에서 읽히도록 SVG 폭이 1200px보다 좁으면 1～2배로 키워 PNG 폭을 약 1200px로 맞춘다. 비교 모드처럼 이미 넓으면 원래 크기로 저장한다.

## 노트 스킨

이 절은 기본 모드와 설계 모드에 해당한다. `--explicit`의 에셋은 [v4 실제 명시 판정](#v4-실제-명시-판정)을 따른다. 노트는 게임 스킨 매니페스트(`src/game/skin/skins.ts`)가 가리키는 `public/skins/<스킨>/` PNG로 그린다. 기본은 인게임 기본 스킨인 Classic이고 `--skin`으로 Crystal·Simple을 고른다. 에셋 선택과 배치는 게임 `GameNoteRenderer`·`SkinManager`의 판정 전(대기) 규칙과 [노트 에셋 Lab의 Classic 매핑](../spec/note-asset-lab.md#classic-스킨-매핑)을 따른다.

- **대기 모양만 그린다.** 켜짐(Held)·실패(Failed)·부분 실패·부분 충족 에셋은 고르지도 넣지도 않는다. 판정 결과는 판정 열에서 읽는다.
- **포인트**: `noteSingle`·`noteDouble`·`noteTrill` 이미지 전체를 레인 폭에 맞춘다(Classic 212×40 원본 → 레인 80px × 16px).
- **바디**: 대기 바디 `bodySingle`·`bodyDouble`·`bodyTrill`. 포인트 이미지보다 바디 이미지가 좁으면 그 비율만큼 바디·터미널·그림자를 줄여 가운데에 둔다(Classic 싱글·더블 200/212 → 약 75.47px). Classic(`longNoteBodyMode: "repeat"`)은 게임 `TilingSprite`처럼 바디 폭에 맞춘 원본 비율(약 15.09px 주기)로 끝 쪽부터 반복하고 바디 길이에서 자른다. 시간 축이 구간마다 배율이 달라도 무늬는 늘이거나 줄이지 않는다. 다른 스킨은 위아래 4px 테두리를 남기고 가운데를 늘인다.
- **터미널**: 대기 터미널(중앙광 꺼짐) `terminalSingleIdle`·`terminalDoubleIdle`·`terminalTrillIdle`. 대기 전용 에셋이 없는 스킨은 일반 `terminal*`을 쓴다. Classic(전체 높이 터미널)은 끝 시각과 시작 시각에 노트 한 칸 높이 터미널을 그리고 시작 터미널은 상하반전한다. Crystal·Simple(반쪽 캡)은 바디 안쪽 위·아래 끝에 반쪽 캡을 그린다. 캡은 전용 `endCap*`(Crystal)이 있으면 그것을, 없으면(Simple) 터미널 이미지 윗부분 절반을 잘라 쓴다.
  - 정지 그림이라 시작·끝 터미널을 모두 그린다. 길이 0 롱노트는 Classic에서 시작 터미널 하나만 그린다.
  - head가 있는 롱노트도 게임처럼 시작 터미널을 그리고, 같은 시각의 head 포인트가 그 위를 덮는다.
  - `trillLong`은 두 마름모 가운데(시작·끝 시각) 사이에 바디를 채우고 끝 터미널 마름모만 그린다. 시작 마름모는 같은 시각의 trill 포인트다.
- **레이어**: 게임과 같이 바디 < 끝 터미널 < 시작 터미널 < 노트 경계선 < 포인트(그림자·overlay 포함) 순서다. 맞닿은 두 바디에서는 뒤 바디의 시작 터미널이 앞 바디의 끝 터미널을 덮는다.
- **접촉 그림자**: 스킨이 테마 `pointContactShadow`와 에셋을 함께 선언하면(Classic) 싱글·더블 포인트 위아래 5px에 바디 폭 `pointContactShadow`(위는 뒤집음)를, trill 포인트에는 마름모를 따르는 `pointContactShadowTrill`을 포인트 아래에 깐다.
- **Grace·`holdOnly`**: `grace` 포인트는 `pointGraceOverlay`, `holdOnly`(`long`·`doubleLong`·`trillLong`) 끝 터미널은 `terminalGraceOverlay`를 사방 12px 여백(`graceOverlayPaddingPx`)으로 본체 아래에 겹친다. 검정 1px → 흰색 1px 보더와 바깥 10px 흰빛이다. 길이 0 `holdOnly`는 시작 터미널에 overlay를 단다(Classic). overlay 에셋이 없는 스킨(Crystal·Simple)은 게임 대체 글로우(흰 둥근 사각형 4겹 + 바깥 2px 흰 윤곽)를 그린다.
- **크기**: 이미지 레인은 80px·노트 높이 16px다. 게임 논리 px(레인 62.5·노트 12.5, [RFD 0029](../rfd/0029-frame-aspect-fit-narrow-lanes.md))에는 80/62.5를, 레인 100 기준 설계 px인 스킨 테마 값(그림자 높이·overlay 여백·터미널 돌출)과 캡 사이 심지에는 0.8을 곱한다. 그래서 이미지는 게임 레인을 좁히기 전과 같은 크기로 그려진다.
- PNG는 data URI로 SVG `<defs>`에 한 번씩만 넣고 노트는 `<use href="#jc-skin-<에셋 키>">`로 참조한다(Playwright `setContent`는 상대 경로 이미지를 읽지 못한다). Classic 에셋 13장은 원본 약 45KB(base64 약 60KB)다.

## 구성

| 파일 | 역할 |
| --- | --- |
| `src/lab/judgmentCase/parseJudgmentCase.ts` | 텍스트 문법 → 차트(+ 직접 붙인 노트 이름) |
| `src/lab/judgmentCase/chartCase.ts` | 차트(JSON·텍스트) → ms로 정규화하고 노트 이름(N1…)을 붙인 사례 |
| `src/lab/judgmentCase/runJudgmentCase.ts` | 주입한 엔진으로 사례 재생, 이벤트·점수·미정산 항목·유닛 상태 수집 |
| `src/lab/judgmentCase/judgmentCaseSkin.ts` | 게임 스킨 매니페스트 → 판정 전(대기) 에셋 경로 선택, PNG 크기·data URI로 렌더러용 스킨 구성 |
| `src/lab/judgmentCase/judgmentCaseNoteSvg.ts` | 기본 모드와 설계 모드가 공유하는 노트 PNG 렌더링. 크기·타일링·캡·그림자·레이어 순서 |
| `src/lab/judgmentCase/renderJudgmentCaseSvg.ts` | 사례 + 결과 + 스킨 → SVG 문자열(스킨 에셋 노트·노트 이름표·판정 라벨·실패 이유 포함) |
| `src/lab/judgmentCase/judgmentCaseLayout.ts` | 세 모드가 공유하는 엔진 독립 시간 축·텍스트 배치 |
| `src/lab/judgmentCase/judgmentCaseDesign.ts` | 설계 JSON 구조 검증·수동 요약. 게임 규칙은 검사하지 않음 |
| `src/lab/judgmentCase/renderJudgmentCaseDesignSvg.ts` | 설계 + 스킨 → SVG. 기존 노트 에셋·입력·창·수동 설명 |
| `src/lab/judgmentCase/explicitChartCase.ts` | v4 `ChartDocument` → 원문을 보존한 채 ms 시각·노트 이름·입력 동작을 붙인 explicit 사례. 구형 입력은 거부 |
| `src/lab/judgmentCase/runExplicitJudgmentCase.ts` | 주입한 엔진의 명시 compiler·session으로 사례 재생, fact 라벨·대표 판정·요약 |
| `src/lab/judgmentCase/explicitCaseSkin.ts` | 정식 `classic-explicit` 매니페스트의 에셋 경로와 PNG 크기 검증 |
| `src/lab/judgmentCase/renderExplicitJudgmentCaseSvg.ts` | explicit 사례 + 실제 세션 결과 + `classic-explicit` → SVG |
| `src/lab/judgmentCase/judgmentCaseCli.ts` | 명령 인자 해석 |
| `scripts/judgment-case-image.ts` | Vite로 모듈과 스킨 매니페스트를 읽고 `public/skins` PNG를 data URI로 넣어 Playwright로 SVG를 PNG로 저장 |

모두 개발 도구다. 앱과 Lab 번들 어디에서도 import하지 않으므로 `pnpm run build`·`pnpm run build:lab` 산출물에 들어가지 않는다.

## 한계

- 기본 엔진 모드의 판정 창은 Normal(±41/82/120ms) 기본값만 쓴다. 설계 모드의 창은 직접 지정한다. explicit 모드는 선택한 엔진의 기본 창·유지 유예를 그대로 쓰고 수동 창을 주입하지 않는다.
- 텍스트 문법은 음수 시각을 받지 않는다. 이른 입력이 필요하면 사례를 1000ms쯤에서 시작한다.
- 글자 폭은 Noto Sans CJK 실측값으로 어림한다. 다른 글꼴로 렌더되면 라벨 폭이 약간 어긋날 수 있다.
- 노트 레인에는 켜짐·실패 상태를 그리지 않는다. 어느 바디·유닛이 언제 실패했는지는 판정 열의 시작·유지 실패 라벨로 읽는다.
- 기본 모드와 설계 모드는 게임과 같이 포인트·터미널 박스 가운데를 시각 선에 맞춘다([#224](https://github.com/nanana3679/not4k/issues/224), [게임 코어 명세의 노트 그리는 기준](../spec/game-core.md#플레이-화면-배치)). 그래서 축 눈금·경계선이 노트 가운데를 지나고, 바디와 기본 모드의 `trillZone` 띠는 게임처럼 시작·끝 시각보다 노트 반 칸(8px)씩 더 길게 보인다. `--explicit`의 바디는 이 반 칸을 더하지 않는다([v4 실제 명시 판정](#v4-실제-명시-판정)).
- 게임의 시간 흐름에 따른 표시(판정선 고정, 짧은 바디에서 시작 전·후에 한쪽 터미널만 보이기, 성공한 노트 숨기기)는 정지 그림에 없으므로 그리지 않는다.
- 접촉 그림자가 없는 스킨의 예전 `pointShadow`(Classic 보관본 v001·v002 등)와 Lab 보관 버전·`note-asset-lab` 스킨은 고를 수 없다. 기본 모드와 설계 모드의 `--skin`은 `classic`·`crystal`·`simple`만 받고, `--explicit`은 `classic-explicit`만 쓴다.
- 실패 이유는 사례 입력, 엔진 이벤트, 엔진 유닛 상태(시작 여부와 등록된 유지 키)만으로 만들고 보류한 up 같은 다른 내부 상태는 보지 않는다. 그래서 확실한 조각만 쓰며, 엔진이 실제로 따진 조건 전체를 설명하지는 않는다.
- 패널 하나의 폭이 800～1200px 안팎이라 패널이 많으면 이미지가 매우 넓어진다(사례 2개 × 엔진 2개면 3300～4900px). 폭이 1200px를 넘으면 확대 없이 원래 크기로 저장하므로 휴대폰에서는 확대해야 읽힌다. 비교는 사례 하나 × 엔진 둘씩 나눠 만드는 편이 낫다.
