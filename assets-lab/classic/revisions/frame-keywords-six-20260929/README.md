# 전체 프레임 키워드 시안 6종


> 저장소 반영 범위: 아래에 기록한 v1–v14 이미지와 보관 페이지, `restored-frame-v15.html`은 저장소 용량 때문에 커밋하지 않았다. 이 폴더의 요청·기록 JSON과 조립 스크립트, 생성 입력·결과 PNG(`button-insert-v15.png`, `white-core-insert-v16.png`, `press-idle-deck-v17-input.png`, `white-core-v16-render.png`, `key1-press-insert-v17.png`, `gauge-empty-insert-v18.png`)는 남아 있다. 갤러리에는 `22-free-b-v6.png`, `52-restored-frame-v15.svg`, `53-white-core-frame-v16.svg`와 시연이 쓰는 생성 이미지만 둔다.
## 시연: 버튼 누름 애니메이션 1단계

2026-09-30 사용자가 v16 버튼부의 누름 애니메이션 가능성을 묻고, 기존 픽셀로 되는 범위의 1단계부터 확인하기로 했다. **사용자 평가:** 자연스럽고, 키가 올라온 뒤 빛이 꺼지는 순서가 좋다. 2단계로 넘어간다. 새 이미지는 생성하지 않았다. 시연 페이지가 열릴 때 `53-white-core-frame-v16.svg`를 캔버스로 읽어 대기·눌림 레이어를 만든다. 최신 임시 시안은 계속 v16이다.

- 시연: `/lab/images/frame-keywords-six-20260929/press-animation.html` — 비교 페이지의 `버튼 누름 애니메이션` 링크
- 페이지: `lab/image-galleries/frame-keywords-six-20260929/press-animation.html`
- 둘째 키 대기: 셋째 키를 x=511.5 축으로 반전해 x 338–511, y 1092–1355에 덮는다. 왼쪽·위·아래 12px 전이, 축 쪽은 경계 없이 이어진다
- 가운데 틈 보정: x 486–536, y 1092–1299의 채도·밝기 보정(끄기 가능)
- 떼는 동작: 키 몸체 x 370–504, y 1128–1268은 키 복귀 시간, 나머지 빛 영역 x 338–519는 잔광 시간. 잔광은 증가분 × 연파랑 이득 (0.25, 0.78, 1)
- 더블 금색(2단계): 눌림 픽셀이 대기보다 더 띠는 색 성분만 같은 선형 휘도의 금색으로 교체. 금색 방향은 `42-b-double-pressed-flash-v10.png`에서 측정한 선형 (0.959, 0.643, 0.163), 잔광 이득 (1, 0.82, 0.44). 기본 싱글, `Shift`로 반대 색
- 1·4번 키(2단계): Codex CLI `gpt-6-astra`·`xhigh`로 내장 `image_gen` 1회. 요청 [key1-press-v17-prompt.json](key1-press-v17-prompt.json), 편집 대상 `press-idle-deck-v17-input.png`(시연 페이지의 대기 레이어 내보내기, 네 키 모두 대기), 발광 참조 `white-core-v16-render.png`(v16 SVG 렌더), 결과 [key1-press-insert-v17.png](key1-press-insert-v17.png)와 [기록](key1-press-v17-output.json). 갤러리에는 같은 파일을 `key1-press-insert-v17.png`로 복사해 페이지가 1번 키 둘레(x 200–372, y 1092–1355)만 쓴다. 4번 키는 반전. 생성된 1번 키는 윗변이 내려가지 않아 2·3번보다 눌림이 약하지만, 사용자가 이 결과를 수용했다
- 게이지 채움: 빈 게이지 레이어가 위에서부터 채움 경계까지 덮는다(경계 8px, 전환 300ms). 레이어는 유리 안쪽 윤곽(x 136–208, 오른쪽은 1023 − x, 위 y 196→203·아래 y 1010→1016 타원 끝, 경계 2px)으로 자른다. 빈 유리는 Codex CLI `gpt-6-astra`·`xhigh`의 `image_gen` 1회 결과 [gauge-empty-insert-v18.png](gauge-empty-insert-v18.png)([요청](gauge-empty-v18-prompt.json), [기록](gauge-empty-v18-output.json), 편집 대상 `press-idle-deck-v17-input.png`)를 쓰고, 비교용 계산 방식은 `scripts/split-gear-gauge.ts`와 같은 판별식으로 남색(휘도 × 0.22, 0.30, 0.42)으로 바꾼다. **사용자 평가:** 유리 안쪽만 바뀌는 생성 빈 유리 게이지가 좋다 [게이지 채움 조절](../../../../docs/design/classic-frame-keywords-20260929.md#게이지-채움-조절)
- 근거와 결정 배경: [버튼 누름 애니메이션 1단계](../../../../docs/design/classic-frame-keywords-20260929.md#버튼-누름-애니메이션-1단계), [2단계: 더블 금색](../../../../docs/design/classic-frame-keywords-20260929.md#버튼-누름-애니메이션-2단계-더블-금색)

검증: 대기 레이어의 두 보정 영역 밖 1,521,728개 픽셀이 v16과 완전히 일치한다. 반전 영역 안쪽은 좌우 대칭이고, 셋째 키 레이어 3종은 둘째 키 레이어의 x↔1022−x 반전과 같다. 누름 즉시 발광 opacity 1, 10배 느리게 뗄 때 키 복귀 뒤 잔광이 남는지, 키보드·포인터 입력이 겹칠 때의 해제를 E2E로 확인했다. 390px·1280px 배치와 10배 느린 떼기의 구간별 화면을 육안으로 확인했다. 더블 금색은 연파랑 주변광의 99% 이상이 연파랑을 벗어나고 흰 중심·무채색 픽셀이 싱글과 같은지, `Shift`와 기본 색 전환을 E2E로 확인했다. 1번 키 발광 안쪽이 생성 이미지와 같고 4번 키가 그 반전이며 네 키의 키 덮개가 각자의 대기 픽셀인지, `D`·`F`·`J`·`K` 입력을 E2E로 확인했다. 게이지는 채움 50%·0%·100%의 덮는 높이, 0%에서도 유리 윤곽 밖 픽셀 변화 0, 빈 유리가 생성 이미지와 같은지, 계산 방식의 연파랑 발광 밝기 절반 이하, 자동 변화와 정지, 전체 프레임 보기 전환을 확인했다. 관련 Vitest 6개, `e2e/lab/frame-keywords-six.spec.ts` E2E 19개, `pnpm run build:lab`의 43개 경로·6개 갤러리 검사가 통과했다.

## 최신: 밝은 백색 버튼과 고유색 주변광

**2026-09-30 사용자 수용:** 사용자가 백색광 수정안 v16을 좋다고 평가하고 Claude로 작업 인계를 요청했다. 후속 디자인은 `53-white-core-frame-v16.svg`를 최신 임시 시안으로 이어간다.

임시 시안 v15에 대한 후속 요청으로, 눌린 둘째 버튼의 누름면은 밝은 백색광으로, 가장자리 번짐과 받침에 비치는 주변광은 고유색인 연파랑으로 수정한다. 내장 `image_gen`으로 버튼 조명만 편집하고 기존 SVG 위에 해당 영역을 제한해 표시한다. 버튼과 바로 주변의 빛 영역 밖은 임시 시안의 픽셀을 보존한다.

- 최신 비교: `/lab/images/frame-keywords-six-20260929/`
- 기준 임시 시안: `52-restored-frame-v15.svg` — 원본 파일 유지
- 수정안: `lab/image-galleries/frame-keywords-six-20260929/53-white-core-frame-v16.svg`
- 실제 프롬프트: [white-core-v16-prompt.json](white-core-v16-prompt.json)
- 생성 원본·저장 경로: [white-core-v16-output.json](white-core-v16-output.json)
- 재조립: `node assets-lab/classic/revisions/frame-keywords-six-20260929/assemble-frame-v16.mjs`
- 이전 복원 비교: `/lab/images/frame-keywords-six-20260929/restored-frame-v15.html`

검증: 버튼 주변 밖 1,539,033개 픽셀이 임시 시안 v15와 완전히 일치한다. 390px·1280px 비교 배치와 원본 크기의 합성 경계를 육안 확인했으며 관련 Vitest 6개, E2E 4개, `pnpm run build:lab`의 33개 경로·6개 갤러리 검사, `git diff --check`가 통과했다.

## 이전: 원본 프레임 복원과 버튼 영역 합성

**2026-09-30 임시 시안 채택:** 사용자가 복원본 `52-restored-frame-v15.svg`를 임시 시안으로 사용하기로 했다. 이후 프레임·버튼 디자인 작업의 기준은 이 버전이다. 최종 외형과 런타임 적용 상태는 [PRD §12](../../../../docs/prd.md#12-미정-사항)에서 관리한다.

사용자가 지적한 반복 생성의 주변 프레임 변형을 복원한다. 초기 B 프레임을 고정 바탕으로 두고, 내장 `image_gen`이 합성한 최신 화이트 LED 버튼 덱만 그 위에 표시한다. 최종 SVG는 두 PNG를 내장하며, 주변 장갑·게이지·배경은 초기 원본 픽셀을 그대로 사용한다. SVG의 clip은 하단 버튼 덱으로 한정하며 어두운 위·아래 접합부만 짧게 전이시킨다.

- 당시 비교: `/lab/images/frame-keywords-six-20260929/restored-frame-v15.html`
- 고정 바탕: `lab/image-galleries/frame-keywords-six-20260929/22-free-b-v6.png`
- 버튼 참조: `lab/image-galleries/frame-keywords-six-20260929/51-white-key-led-v14.png`
- 생성 합성 이미지: [button-insert-v15.png](button-insert-v15.png)
- 최종 저장: `lab/image-galleries/frame-keywords-six-20260929/52-restored-frame-v15.svg`
- 실제 프롬프트: [frame-restore-v15-prompt.json](frame-restore-v15-prompt.json)
- 생성 원본·저장 경로: [frame-restore-v15-output.json](frame-restore-v15-output.json)
- 재조립: `node assets-lab/classic/revisions/frame-keywords-six-20260929/assemble-frame-v15.mjs`
- 비교 구성: 장갑·게이지 확대와 전체 프레임의 복원 전후, SVG 원본 확대·다운로드, 이전 LED 비교 복귀

검증: 1024×1536 복원본에서 버튼 영역 밖 1,422,055개 픽셀이 초기 B 프레임과 완전히 일치한다. 390px·1280px 비교 배치와 합성 경계를 육안 확인했으며 관련 Vitest 6개, 픽셀 보존 검증을 포함한 E2E 3개, `pnpm run build:lab`, `git diff --check`가 통과했다.

## 이전: 1번 화이트 버튼의 내부 LED 발광

사용자가 지목한 1번(A)을 내장 `image_gen`으로 편집했다. 둘째 키의 낮고 평평한 누름면과 눌림을 유지하면서, 유백색 표면을 투과하는 밝은 연파랑 빛·흰 중심광·가장자리 번짐·인접 부위 반사광을 추가했다. 세 키의 소등된 화이트와 아래 단일 개구부의 흰 섬광은 유지한다.

- 당시 비교: `/lab/images/frame-keywords-six-20260929/white-key-led-v14.html`
- 편집 대상: `lab/image-galleries/frame-keywords-six-20260929/45-flat-keycap-a-v13.png`
- 저장 이미지: `lab/image-galleries/frame-keywords-six-20260929/51-white-key-led-v14.png`
- 실제 프롬프트: [white-key-led-v14-prompt.json](white-key-led-v14-prompt.json)
- 생성 원본·저장 경로: [white-key-led-v14-output.json](white-key-led-v14-output.json)
- 비교 구성: 버튼부 확대와 전체 프레임의 전후, 원본 확대, PNG 다운로드, 이전 버튼 6종 복귀

검증: 1024×1536 PNG의 밝아진 누름면·가장자리 번짐·인접 반사광과 평평한 형태 유지를 육안 확인했다. 390px·1280px 전후 배치, 원본 확대와 다운로드를 확인했으며 관련 Vitest 6개, E2E 2개, `pnpm run build:lab`, `git diff --check`가 통과했다.

## 이전: 낮고 평평한 버튼 6종

사용자의 높이·오목함·색상 수정 요청에 따라 내장 `image_gen`으로 A–F를 각각 생성했다. 키 높이를 낮추고 윗면을 평평하게 바꾸며 화이트·실버·블루·코랄·민트·라벤더 재질색과 모서리·측벽 형태를 비교한다. 모든 안은 같은 둘째 버튼의 싱글 눌림·연파랑 발광·흰 중심 섬광을 유지한다. 기본색은 나머지 세 키에서 비교한다.

- 당시 비교: `/lab/images/frame-keywords-six-20260929/flat-keycaps-six-v13.html`
- 편집 대상: `lab/image-galleries/frame-keywords-six-20260929/44-b-sculpted-keycaps-v12.png`
- 저장 이미지: `lab/image-galleries/frame-keywords-six-20260929/45-flat-keycap-a-v13.png`부터 `50-flat-keycap-f-v13.png`까지 6장
- 실제 프롬프트: [flat-keycaps-six-v13-prompts.json](flat-keycaps-six-v13-prompts.json)
- 생성 원본·저장 경로: [flat-keycaps-six-v13-outputs.json](flat-keycaps-six-v13-outputs.json)
- 비교 구성: 버튼부 확대, 전체 프레임, 원본 확대, PNG 다운로드, 이전 키캡 시안과 상태 3종 복귀

B·E는 첫 결과의 눌린 둘째 키에 남은 오목한 윤곽을 제거하는 추가 편집을 거쳤다. 선택하지 않은 중간 결과는 공개 번들에 넣지 않는다.

검증: 최종 6장 모두 1024×1536 PNG다. 평평한 누름면, 직전보다 짧은 측벽, 여섯 가지 기본색, 둘째 키의 눌림·흰 중심 섬광을 육안 확인했다. 1440px의 A–C·D–F 비교와 390px 모바일 배치를 확인했다. 관련 Vitest 6개, E2E 2개, `pnpm run build:lab`이 통과했다.

## 이전: 현재 구도의 키보드 키캡

내장 `image_gen`으로 직전 버튼을 키보드 키캡 형태로 편집했다. 높이 배율을 고정하지 않고 현재 구도에서 읽히는 오목한 윗면, 둥근 모서리, 아래로 벌어지는 측벽과 분리된 틈을 표현했다. 고정 받침·단일 개구부·프레임 구도는 유지하며, 둘째 키는 연파랑으로 눌린 상태와 흰 중심 섬광을 유지한다.

- 당시 비교: `/lab/images/frame-keywords-six-20260929/b-sculpted-keycaps-v12.html`
- 편집 대상: `lab/image-galleries/frame-keywords-six-20260929/43-b-button-redesign-v11.png`
- 저장 이미지: `lab/image-galleries/frame-keywords-six-20260929/44-b-sculpted-keycaps-v12.png`
- 실제 프롬프트: [b-keycaps-v12-prompt.json](b-keycaps-v12-prompt.json)
- 생성 원본·저장 경로: [b-keycaps-v12-output.json](b-keycaps-v12-output.json)
- 비교 구성: 버튼부 확대와 전체 프레임의 전후, 원본 확대, PNG 다운로드, 이전 버튼 시안 복귀

검증: 1024×1536 PNG의 오목한 윗면·둥근 모서리·경사진 측벽과 동일 구도를 육안 확인했다. 390px·1280px 비교 페이지 표시와 관련 Vitest 6개, E2E 2개, `pnpm run build:lab`, `git diff --check`가 통과했다.

## 이전: 같은 구도에서 버튼부 리디자인

내장 `image_gen`으로 직전 싱글 상태의 버튼부만 편집했다. 기존 프레임 구도와 네 키의 위치를 유지하며 누름면의 은색 모따기, 지지부와 낮고 넓은 개구부를 다듬었다. 둘째 키의 연파랑 눌림과 흰 중심 섬광은 유지해 동일한 상태의 전후를 비교한다.

- 당시 비교: `/lab/images/frame-keywords-six-20260929/b-button-redesign-v11.html`
- 편집 대상: `lab/image-galleries/frame-keywords-six-20260929/41-b-single-pressed-flash-v10.png`
- 저장 이미지: `lab/image-galleries/frame-keywords-six-20260929/43-b-button-redesign-v11.png`
- 실제 프롬프트: [b-button-redesign-v11-prompt.json](b-button-redesign-v11-prompt.json)
- 생성 원본·저장 경로: [b-button-redesign-v11-output.json](b-button-redesign-v11-output.json)
- 비교 구성: 버튼부 확대와 전체 프레임의 전후, 원본 확대, PNG 다운로드, 이전 상태 3종 복귀

검증: 1024×1536 PNG에서 기존 구도·키 배치와 눌림 상태, 변경된 모따기·지지부·개구부를 육안 확인했다. 390px·1280px 비교 페이지 표시, 확대·다운로드·이전 상태 복귀를 확인했다. 관련 Vitest 6개, E2E 2개, `pnpm run build:lab`, `git diff --check`가 통과했다.

## 이전: B의 고유색 눌림과 흰 중심 섬광

2026-09-30 후속 요청에 따라 내장 `image_gen`으로 기본·싱글·더블 3개 상태를 만들었다. 같은 둘째 버튼이 내려앉으며 연파랑·금색으로 켜지고, 아래의 넓은 단일 개구부에는 흰 중심과 고유색 번짐이 있는 섬광을 표현한다. 긴 분출 꼬리는 넣지 않는다. 더블은 싱글 결과를 직접 편집해 활성 부위의 색을 바꿨다. 나머지 키는 기본 상태로 두고 양옆 게이지는 파란색을 유지한다.

- 당시 비교: `/lab/images/frame-keywords-six-20260929/b-pressed-flash-v10.html`
- 편집 대상: `lab/image-galleries/frame-keywords-six-20260929/39-b-open-base-v9.png`
- 저장 이미지: `lab/image-galleries/frame-keywords-six-20260929/40-b-idle-v10.png`, `41-b-single-pressed-flash-v10.png`, `42-b-double-pressed-flash-v10.png`
- 전체 프롬프트: [b-pressed-flash-v10-prompts.json](b-pressed-flash-v10-prompts.json)
- 생성 원본·저장 경로: [b-pressed-flash-v10-outputs.json](b-pressed-flash-v10-outputs.json)
- 비교 구성: 버튼·분출구 확대, 전체 프레임, 원본 확대, PNG 다운로드, 이전 B 수정안과 6종 복귀

검증: 3장 모두 1024×1536 PNG다. 눌린 키의 낮아진 상단과 고유색 표면, 넓은 단일 개구부의 흰 중심 섬광, 나머지 키의 기본 상태를 육안 확인했다. 생성된 정지 시안이므로 싱글·더블의 미세한 윤곽 차이는 있으며 실제 애니메이션용 정렬 에셋은 아니다. 390px·1440px 배치와 확대를 확인했고 관련 Vitest 6개, E2E 2개, `pnpm run build:lab`이 통과했다.

## 이전: B 시안의 받침 면을 통으로 연 출력부

사용자는 B를 후속 기준으로 지목하고 버튼 아래 네모난 부분을 통으로 뚫어 빛이 나오게 요청했다. 내장 `image_gen`으로 B의 각 키 아래 받침 앞면을 넓은 단일 개구부로 바꿨다. 키캡·프레임·눈금 없는 게이지는 유지했다. 개구부 안쪽 깊이와 파랑·금색 빛을 표현하며 4개의 개구부를 서로 연결하지 않는다.

- 당시 비교: `/lab/images/frame-keywords-six-20260929/b-open-base-v9.html`
- 원안: `lab/image-galleries/frame-keywords-six-20260929/34-rhythm-key-b-v8.png`
- 수정안: `lab/image-galleries/frame-keywords-six-20260929/39-b-open-base-v9.png`
- 전체 프롬프트: [b-open-base-v9-prompt.json](b-open-base-v9-prompt.json)
- 생성 원본·저장 경로: [b-open-base-v9-output.json](b-open-base-v9-output.json)

검증: 1024×1536 PNG다. 원형 구멍 제거, 각 버튼 아래의 분리된 넓은 개구부와 내부 깊이, 파랑·금색 빛, 키캡·프레임 유지를 육안 확인했다. 모바일·데스크톱 전후 비교와 다운로드를 확인했으며 관련 Vitest 6개, E2E 2개, `pnpm run build:lab`이 통과했다.

## 이전: 사각 리듬게임 키 6종

사용자가 큰 원형 발광부는 리듬게임 버튼처럼 보이지 않는다고 지적하고 에이전트의 구체적인 프롬프트 작성을 요청했다. 내장 `image_gen`으로 직전 A–F 각각의 입력부를 수정했다. 넓고 평평한 불투명 사각 키 4개, 얕은 측벽·눌림 틈, 키 아래 고정 받침의 작은 단일 분출구를 명시했다. 큰 원형 링과 발광 구체를 없애고 색 이펙트를 작은 분출구로 옮기는 것이 핵심이다.

- 이전 비교: `/lab/images/frame-keywords-six-20260929/rhythm-key-variations-v8.html`
- 전체 프롬프트: [rhythm-key-six-v8-prompts.json](rhythm-key-six-v8-prompts.json)
- 생성 원본·저장 경로: [rhythm-key-six-v8-outputs.json](rhythm-key-six-v8-outputs.json)
- 이미지: `lab/image-galleries/frame-keywords-six-20260929/33-rhythm-key-a-v8.png`부터 `38-rhythm-key-f-v8.png`까지 6장
- 비교 구성: 원형 발광부와 사각 키의 수정 전후, 전체 프레임, 원본 확대, PNG 다운로드

검증: 6장 모두 1024×1536 PNG다. 불투명 사각 키 4개, 눌림 틈, 아래의 작은 단일 분출구, 눈금 없는 게이지를 육안 확인했다. E는 작은 사각 분출구, 나머지는 작은 원형 분출구로 생성되었다. 관련 Vitest 6개, 모바일·데스크톱 E2E 2개, `pnpm run build:lab`이 통과했다. 수정 전후 확대와 전체 프레임 배치도 확인했다.

## 이전: 큰 원형 버튼·작은 출력부 6종

직전 자유 변형 A–F 각각을 내장 `image_gen`으로 편집했다. 사용자의 버튼 확대·출력부 축소 요청만 짧게 전달하고 세부 모양은 도구에 맡겼다.

> 첨부 시안에서 하단의 누르는 버튼 면은 크게, 각 버튼 아래 빛이 나오는 출력구는 하나씩 작게 바꿔줘. 나머지는 유지하고, 세부 모양은 자유롭게 디자인해줘.

- 이전 비교: `/lab/images/frame-keywords-six-20260929/large-button-variations-v7.html`
- 실제 프롬프트: [large-button-six-v7-prompts.json](large-button-six-v7-prompts.json)
- 생성 원본·저장 경로: [large-button-six-v7-outputs.json](large-button-six-v7-outputs.json)
- 이미지: `lab/image-galleries/frame-keywords-six-20260929/27-large-button-a-v7.png`부터 `32-large-button-f-v7.png`까지 6장
- 비교 구성: 버튼부 수정 전후, 전체 프레임, 원본 확대, PNG 다운로드

검증: 6장 모두 1024×1536 PNG이며 큰 원형 버튼 면과 그 아래 작은 출력부로 생성되었다. A·C·D·E·F는 작은 가로 창, B는 작은 원형 창으로 표현되었다. 형태는 생성 결과를 관찰한 기록이며 사전 지정하지 않았다. 모바일·데스크톱 수정 전후 배치와 이미지 표시를 육안 확인했다. 관련 Vitest 6개, E2E 2개, `pnpm run build:lab`이 통과했다.

## 이전: 버튼·게이지 자유 변형 6종

사용자 요청에 따라 형태·재질을 사전 지정하지 않았다. 동일한 기준 이미지 `08-buttons-gauges-v3.png`와 아래 요청만 내장 `image_gen`에 6회 전달했다. 추가 보정 없이 생성 결과를 그대로 비교한다.

> 첨부 이미지의 버튼과 양옆 게이지를 자유롭게 변형해줘. 게이지에는 눈금을 없애줘. 구체적인 형태와 재질은 네가 자유롭게 디자인해줘. 전체 프레임 시안 한 장으로 보여줘.

- 이전 비교: `/lab/images/frame-keywords-six-20260929/free-variations-v6.html`
- 실제 프롬프트: [free-six-v6-prompts.json](free-six-v6-prompts.json)
- 생성 원본·저장 경로: [free-six-v6-outputs.json](free-six-v6-outputs.json)
- 이미지: `lab/image-galleries/frame-keywords-six-20260929/21-free-a-v6.png`부터 `26-free-f-v6.png`까지 6장

6장 모두 게이지 눈금 없이 생성되었으며 버튼부와 함께 주변 외장도 달라졌다. 6종 모두 하단 원형 부품으로 수렴했으며 세부 장갑·창·빛 표현에 차이가 있다. 이는 자유 생성의 결과를 관찰한 기록이며 모양을 사전에 배정한 분류가 아니다. 게임 동작이나 추진부 규칙의 변경을 확정하지 않는다.

검증: 관련 Vitest 6개, 모바일·데스크톱 비교 및 이전 지정 변형 복귀 E2E 2개, `pnpm run build:lab`이 통과했다. 390px·1440px 부품 확대와 전체 이미지 배치를 육안 확인했다.

## 이전: 형태를 지정한 버튼·게이지 변형 6종

사용자는 변형 대상이 버튼과 게이지라고 정정했다. 이전에 외장을 바꾼 것은 에이전트의 범위 해석 오류다. 이번에는 내장 `image_gen`으로 같은 버튼·게이지 확대안에서 버튼과 게이지 형태가 다른 6종을 생성했다. 교차 장갑, 금색 연결부, 하단 받침, 중앙 4레인, 정면 분출구는 같은 기준으로 유지한다. B의 게이지 테두리에 남은 작은 눈금 흔적은 두 차례 추가 편집 중 두 번째 결과로 제거했다. 최종 B는 매끈한 무광 캡슐 테두리를 사용한다. 채택하지 않은 중간 결과는 공개 번들에 넣지 않았다.

- 이전 비교: `/lab/images/frame-keywords-six-20260929/button-gauge-variations-v5.html`
- 전체 프롬프트: [button-gauge-six-v5-prompts.json](button-gauge-six-v5-prompts.json)
- 생성 원본·저장 경로: [button-gauge-six-v5-outputs.json](button-gauge-six-v5-outputs.json)
- 비교 구성: 버튼 확대, 게이지 확대, 전체 프레임, 원본 확대, PNG 다운로드

검증: 최종 6장 모두 1024×1536 PNG다. 버튼·게이지 형태 차이, 눈금 없는 게이지, 외장과 정면 분출구 유지를 육안 확인했다. 관련 Vitest 6개, 390px·1280px 부품 확대·원본 확대·다운로드·이전 시안 복귀 E2E 2개, `pnpm run build:lab`, `git diff --check`가 통과했다. 모바일·데스크톱의 부품 확대 배치도 확인했다.

| 표시 | 버튼 | 게이지 | 저장 파일 |
| --- | --- | --- | --- |
| A | 얇은 평판 | 사각 창 | `lab/image-galleries/frame-keywords-six-20260929/15-flat-square-v5.png` |
| B | 볼록한 둥근 면 | 캡슐 창 | `lab/image-galleries/frame-keywords-six-20260929/16-soft-capsule-v5.png` |
| C | 넓은 육각 면 | 쐐기 창 | `lab/image-galleries/frame-keywords-six-20260929/17-hex-taper-v5.png` |
| D | 오목한 면 | 매립 창 | `lab/image-galleries/frame-keywords-six-20260929/18-concave-recess-v5.png` |
| E | 높은 경사면 | 유리관 | `lab/image-galleries/frame-keywords-six-20260929/19-wedge-tube-v5.png` |
| F | 틈 위로 떠 있는 면 | 무테 발광 창 | `lab/image-galleries/frame-keywords-six-20260929/20-floating-borderless-v5.png` |

## 이전: 게이지 눈금 제거 후 외장 탐색

눈금 제거와 변형 6개 요청을 외장 변형으로 해석해 내장 `image_gen`을 6번 호출했다. 사용자가 의도한 버튼·게이지 변형과 범위가 달랐으므로 이전 탐색으로 보존한다. 자체 생성한 버튼·게이지 확대안을 편집 대상으로 사용했다. 게이지 채움은 정지 예시다.

- 이전 비교: `/lab/images/frame-keywords-six-20260929/exterior-variations-v4.html`
- 전체 프롬프트: [unmarked-six-v4-prompts.json](unmarked-six-v4-prompts.json)
- 생성 원본·저장 경로: [unmarked-six-v4-outputs.json](unmarked-six-v4-outputs.json)
- 크기: 6장 모두 1024×1536 PNG

검증: 6장 모두 게이지 눈금 제거와 버튼 4개를 육안 확인했다. 관련 Vitest 6개, 390px·1280px A–F 비교·이전 시안 복귀·확대·다운로드 E2E 2개, `pnpm run build:lab` 통과. 모바일·데스크톱 비교 페이지도 육안 확인했다.

| 표시 | 변형 | 저장 파일 |
| --- | --- | --- |
| A | 날렵한 교차형 | `lab/image-galleries/frame-keywords-six-20260929/09-slim-interlock-v4.png` |
| B | 두꺼운 장갑형 | `lab/image-galleries/frame-keywords-six-20260929/10-deep-armor-v4.png` |
| C | 드러난 연결형 | `lab/image-galleries/frame-keywords-six-20260929/11-open-joints-v4.png` |
| D | 이어진 외피형 | `lab/image-galleries/frame-keywords-six-20260929/12-flowing-shell-v4.png` |
| E | 각진 버튼형 | `lab/image-galleries/frame-keywords-six-20260929/13-angular-deck-v4.png` |
| F | 매립 버튼형 | `lab/image-galleries/frame-keywords-six-20260929/14-recessed-deck-v4.png` |

## 버튼부·양옆 게이지 확대

사용자의 후속 요청에 따라 넓은 누름면이 보이는 버튼 4개를 각 분출구 위에 두고, 양옆 게이지를 길고 넓게 확장했다. 내장 `image_gen`으로 첫 다듬기 이미지만 편집했다. 레퍼런스 원화·작품 이름은 입력하지 않았다. 게이지의 밝은 채움과 어두운 남은 부분은 크기와 가독성을 보여주는 정지 예시다.

- 이미지: `lab/image-galleries/frame-keywords-six-20260929/08-buttons-gauges-v3.png` (1024×1536)
- 이전 안·요청 반영안 비교: `/lab/images/frame-keywords-six-20260929/buttons-gauges-v3.html`
- 전체 편집 프롬프트: [buttons-gauges-v3-prompts.json](buttons-gauges-v3-prompts.json)
- 생성 원본·저장 경로: [buttons-gauges-v3-output.json](buttons-gauges-v3-output.json)

검증: 버튼 4개와 각 버튼 아래의 단일 분출구, 확대된 양옆 게이지를 육안 확인했다. 관련 Vitest 6개, 390px·1280px 비교·이전 시안 복귀·확대·다운로드 E2E 2개, `pnpm run build:lab` 통과. 모바일·데스크톱 배치도 확인했다.

## 첫 다듬기: 6번 교차 장갑형

사용자가 6번을 후속 탐색의 출발점으로 지목해 내장 `image_gen`으로 한 차례 다듬었다. 편집 대상은 자체 생성한 6번 이미지이며, 레퍼런스 원화·작품 이름은 생성 입력에 포함하지 않았다. 중하단 장갑 윤곽, 장갑의 사선 연결부, 하단 받침, 입력면과 분출구 주변 링을 정리했다. 사용자 피드백은 최종 외형 승인으로 취급하지 않는다.

- 이미지: `lab/image-galleries/frame-keywords-six-20260929/07-overlap-refined-v2.png` (1024×1536)
- 원안·후속안 비교: `/lab/images/frame-keywords-six-20260929/refinement-v2.html`
- 전체 편집 프롬프트: [refinement-v2-prompts.json](refinement-v2-prompts.json)
- 생성 원본·저장 경로: [refinement-v2-output.json](refinement-v2-output.json)
- 초기 6종 비교: `/lab/images/frame-keywords-six-20260929/exploration-v1.html`

후속 검증: 관련 Vitest 6개, 390px·1280px 전후 비교와 초기 6종 복귀·확대·다운로드 E2E 2개, `pnpm run build:lab` 통과. 모바일·데스크톱 화면에서 이미지 비율과 배치를 확인했다.

## 초기 6종

2026-09-29 전체 프레임 6종 생성 요청의 결과다. 내장 `image_gen`을 6번 호출해 각 안을 독립 이미지로 만들었다. 생성 입력에는 추출한 키워드 텍스트와 게임의 기능 배치만 사용했으며, 이미지 레퍼런스와 작품·기체 이름은 포함하지 않았다.

- 사용자 비교 경로: `/lab/images/frame-keywords-six-20260929/exploration-v1.html`
- 키워드 근거: [전체 프레임 키워드](../../../../docs/design/classic-frame-keywords-20260929.md)
- 실제 사용한 전체 프롬프트: [prompts.json](prompts.json)
- 생성 원본과 저장 경로: [outputs.json](outputs.json)

| 번호 | 시안 | 저장 파일 |
| --- | --- | --- |
| 01 | 긴 외피형 | `lab/image-galleries/frame-keywords-six-20260929/01-long-shell.png` |
| 02 | 두꺼운 소켓형 | `lab/image-galleries/frame-keywords-six-20260929/02-deep-casing.png` |
| 03 | 노출 골격형 | `lab/image-galleries/frame-keywords-six-20260929/03-open-skeleton.png` |
| 04 | 상부 확장형 | `lab/image-galleries/frame-keywords-six-20260929/04-upper-mass.png` |
| 05 | 하부 집중형 | `lab/image-galleries/frame-keywords-six-20260929/05-lower-foundation.png` |
| 06 | 교차 장갑형 | `lab/image-galleries/frame-keywords-six-20260929/06-overlap-shells.png` |

6장 모두 1024×1536 PNG다. 중앙 4레인과 열린 상단, 같은 한 개 출구에서 파랑·금색을 표현하는 하단 입력부를 육안 확인했다. 1번의 연속된 외피, 2번의 두꺼운 외장, 3번의 노출 골격, 4번의 큰 상부, 5번의 넓은 하단, 6번의 두 장갑 겹침으로 서로 다른 윤곽을 비교한다.

원화 관찰에서 가져온 단어는 디자인 탐색의 재료다. 이 시안은 전체 외형 비교용이며 버튼 세부 도안이나 실제 게임 에셋의 승인을 뜻하지 않는다.

검증: 관련 Vitest 6개, 390px·1280px 비교 페이지 E2E 2개, Lab 카탈로그 E2E 2개 통과. 모바일·데스크톱 화면을 육안 확인했으며 `pnpm run build:lab`의 정적 산출물 검증도 통과했다.
