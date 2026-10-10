# Lab 미리보기 카탈로그

## 목적

개발용 시연을 날짜나 파일 위치로 기억하지 않고 `/lab`에서 이름과 역할로 다시 찾는다. 카탈로그와 각 시연은 로컬 개발 서버와 Lab 전용 GitHub Pages 정적 사이트에서 제공하며, 메인 게임의 프로덕션 번들에는 포함하지 않는다.

## 등록 규칙

`src/lab/labPreviewCatalog.ts`가 미리보기 목록의 단일 인터페이스다. 새 시연은 중복 없는 `id`, 표시 이름, 한 줄 설명, 분류, `/lab/` 경로를 등록한다. 대표 시연 하나에는 `featured`를 설정할 수 있다.

독립 이미지 HTML 페이지는 `src/lab/labImageGalleryCatalog.ts`에 컬렉션 단위로 등록한다. Lab 홈은 이를 별도 `IMAGE GALLERIES` 그룹에 표시하며, 새 탭의 `/lab/images/<id>/` 정적 페이지로 연다. HTML과 상대 이미지 번들은 `lab/image-galleries/<id>/`에 두고 진입 파일을 `index.html`로 통일한다. 개별 이미지가 아니라 새 HTML 페이지를 만들 때만 항목 하나를 추가한다.

이미지 HTML은 데스크톱의 비교 배열을 유지하되 900px 이하에서는 한 열로 배치한다. 첫 이미지는 즉시 표시하고 나머지 원본 PNG는 viewport에 들어올 때 로드해 모바일 초기 전송과 디코딩을 제한한다.

다른 에이전트가 새 에셋·렌더링·인터랙션 미리보기를 만들어 사용자에게 보여줄 때도 `/lab/<고유-id>`를 기준 경로로 사용한다. 등록 순서와 공개 공유 예외는 [Lab preview workflow](../agents/lab-previews.md)를 따른다.

카탈로그는 다음 분류를 사용한다.

- `Flight`: 난이도명과 비행 연출 비교
- `Rendering`: 배경·투영·오브젝트 렌더 실험
- `Interface`: 기어와 조절 UI 실험
- `Gameplay`: 판정과 튜토리얼 동작 실험

React 기반 시연은 `LabRoutes.tsx`에 라우트를 연결한다. 독립 서버가 필요한 대용량 시연은 구현과 자산을 원래 모듈에 유지하고, 로컬에서는 Vite 개발 서버 adapter를, 공개 사이트에서는 정적 export를 사용해 Lab 화면에 삽입한다. 이 seam 덕분에 Lab 카탈로그는 시연별 파일 제공 방식이나 서버 내부 경로를 알 필요가 없다.

## Flight Background Preview

`/lab/flight-background-preview`는 `/__lab/flight-background-preview/`에 마운트한 독립 공개 미리보기를 iframe으로 연다. Lab 복귀 링크만 바깥에 두며, iframe 안의 `LIFTOFF`, `INFILTRATION`, `BREAKTHROUGH` 탭과 고도 슬라이더는 공개 미리보기와 같은 소스를 사용한다. 이 미리보기는 보관 시연(`output/prototypes/flight-background-preview-20260913/`)을 그대로 띄우므로, Lab의 다른 페이지와 달리 운영체제 모션 감소 설정(`prefers-reduced-motion: reduce`)이 켜져 있으면 멈춘 채 시작한다([RFD 0030](../rfd/0030-ignore-os-reduced-motion.md)의 남은 예외, [#253](https://github.com/nanana3679/not4k/issues/253)에서 정리, 우선순위 낮음).

정식 공개 진입점은 `https://nanana3679.github.io/not4k/lab/flight-background-preview/`다. Cloudflare Quick Tunnel은 브랜치가 `main`에 반영되기 전 임시 확인용으로만 사용한다.

## Facility Passage Preview

`/lab/facility-passage`는 시설 통과 시연을 고도 0%·정지 상태로 연다. 접근·입구·시설 내부·출구에서 멈추거나 고도를 바꾸고, 같은 화면에서 A~H 건축 비교로 전환할 수 있다. 기존 시연 모듈을 iframe으로 사용하고 Lab 복귀 링크를 제공한다. 고도·진행·모델 선택을 바깥 Lab URL에 동기화하므로 전체 페이지를 새로고침해도 복원한다. 조절 중에는 iframe을 다시 만들지 않는다. 공개 배경 비교의 간소화 스타일을 적용하지 않은 `study.html`을 같은 정적 파일 제공 경로로 내보내므로, 개발 서버와 Pages 모두 전체 조절 화면을 표시한다.

## 노트 에셋 시연실

`Rendering` 분류의 `/lab/note-assets`에서 Classic·Simple 노트, 롱노트, 터미널과 키봄을 실제 튜토리얼 재생기로 비교한다. 기본 시안은 Classic이며 시안 선택과 에셋 랙은 기존 시연실을 그대로 사용한다. 시연실의 `← Lab 목록` 링크는 공통 카탈로그로 돌아온다. 자세한 동작은 [노트 에셋 Lab](note-asset-lab.md)을 따른다.

## Gear

<a id="classic-frame-fit"></a>
<a id="classic-gear"></a>

`Interface` 분류의 `/lab/gear`는 새 [기어](../context/glossary.md#기어-gear)가 들어간 실제 게임 화면을 보여 준다. 처음에는 승인된 기어 그림(1024×1536)을 게임 비율에 맞추는 방식을 비교하는 화면이었고, 여기서 정한 배치([RFD 0029](../rfd/0029-frame-aspect-fit-narrow-lanes.md))를 게임에 적용한 뒤에는 게임 렌더러를 그대로 띄우는 미리보기로 바꿨다. `gearMotion`(기어 위 장식 애니메이션: 광원 띠·게이지 액체 흐름과 기포·발광선·하단 바 빛)도 이제 게임 렌더러가 내장하므로([RFD 0029의 `gearMotion` 게임 적용](../rfd/0029-frame-aspect-fit-narrow-lanes.md#프레임-움직임-게임-적용-2026-10-05)), 조절 패널은 렌더러의 공개 조절 `GameRenderer.gearMotion`으로 내장 `gearMotion`을 켜고 끄며, 아래에서 같은 `gearMotion` 모듈을 승인 SVG와 나란히 비교한다. 옛 주소 `/lab/classic-frame-fit`(#231 전)과 `/lab/classic-gear`(기어가 스킨 공용이라 Classic 접두사를 뺀 이름 전)는 Lab 라우트가 쿼리·해시를 유지한 채 `/lab/gear`로 넘긴다(기록을 바꾸는 이동이며 정적 폴더는 만들지 않는다).

- 무대: 게임과 같은 `GameRenderer`(기본 옵션, 내장 기어와 `gearMotion`)와 인게임 비행 배경, 흐르는 데모 노트(120 BPM 약 3분)를 쓴다. 논리 높이 600·16:9 논리 폭 1067에서 레인 영역 250(x 408.5~658.5), 판정선 y 416(리프트 0%), 덱 위끝 y 429.7, 키 윗면 y 446.5이며, 레인은 키 윗면(레인 끝)에서 끝난다. 오른쪽 아래에는 게임 프리셋(TKL·넘버패드) 바인딩의 키보드 표시를 게임과 같은 규칙으로 그린다. 데모 노트는 입력 없이 정해 둔 판정으로 표시한다. 포인트 노트는 5개마다 1개, 롱노트는 4마디마다 레인 4 롱노트를 놓친다. 맞힌 노트는 판정선에서 키봄·PERFECT와 함께 사라지고(롱노트는 끝에서, 그동안 키빔 유지), 놓친 노트는 머리 120ms 뒤 MISS와 함께 콤보를 끊고 판정선 아래 틈과 열린 덱을 지나 키 밑으로 사라진다. 놓친 롱노트는 게임 렌더러가 머리를 판정선에 붙잡아 두므로 틈으로 내려가지 않는다(후속 [#214](https://github.com/nanana3679/not4k/issues/214)). 차트가 끝나 처음으로 되감을 때 `setChart`가 노트 표시 상태를 비운다.
- `리프트(판정선 높이)` 슬라이더: 게임 리프트 설정과 같은 정수 %(1% = 6 단위)를 0~10%만 다룬다(기본 0%, 표시 예: `4% (+24)`). 렌더러를 다시 만들지 않고 `setLift`로 판정선·콤보와 정확도 글자·판정 글자·노트 판정 위치만 옮기며 기어와 레인 끝은 그대로다. 설명에는 판정선 위치, 덱과의 틈(0%에서 13.7, 노트 두께 약 1.1개), 키 윗면까지 보이는 거리(30.5, 약 2.4개)가 나온다.
- `고도(유리관 게이지·비행 배경)`: 기본은 `곡 진행 따라가기`(켬)로, 게임 렌더러의 임시 고도 모델을 그대로 쓴다(데모 차트 약 3분 동안 1 → 0, 데모는 판정을 고도에 넣지 않는다). `고도 직접 정하기` 슬라이더(정수 0~100%, 시작 100%)를 움직이면 그 고도로 고정해 비행 배경과 양옆 유리관 [고도 게이지](../context/glossary.md#기어-gear)가 함께 바뀌고, 따라가기를 다시 켜면 풀린다. 따라가기 체크만 끄면 그 순간 보이던 게이지 채움 그대로 고정해(슬라이더는 그 %를 가리킨다) 게이지가 시작값 100%로 뛰지 않고 멈춰 있다. 렌더러를 다시 만들지 않고 렌더러의 미리보기 전용 공개 API `setAltitudeOverride`(0~1, null이면 고도 모델)로 걸며, 게이지는 게임과 같이 약 300ms에 걸쳐 따라간다. 무대 설명 `유리관 게이지`에 지금 보이는 채움과 덮은 빈 유리 행(예: `30% · 빈 유리 575/821행`, 가득이면 `100% · 그림 그대로`)을 보여 준다. 무대는 `data-altitude-mode`(`follow`·`manual`)·`data-altitude-percent`와, 렌더러 `gearGaugeLevel`에서 읽은 지금 보이는 채움 `data-gear-gauge-level`(소수 셋째 자리, 천분율이 바뀔 때만 고친다)을 알린다.
- `키보드 표시`: TKL(기본)·넘버패드를 고르면 살아 있는 렌더러의 키보드 표시만 다시 만든다. 설명에 원래 크기·줄인 배율·숨김(필요 배율과 최소 0.6)을 보여 준다.
- `gearMotion` 레이어: 승인된 애니메이션 SVG(`54-ambient-motion-v19.svg`, [`gearMotion` 시안](../design/classic-frame-keywords-20260929.md#프레임-움직임))의 네 요소를 SVG 없이 Pixi 레이어로 다시 구성한 게임 렌더러 내장 `gearMotion`이다. 렌더러가 기어와 같은 레이어(판정선 위, 키봄·UI 아래)에 기어와 같은 변환의 `holder`를 만들어 추가한다. 게임과 같이 `gearMotion` 에셋은 렌더러 준비에 필요한 에셋이라, 렌더러는 에셋을 받아 `gearMotion`을 추가한 뒤에 준비된다(에셋을 받지 못하면 무대가 오류를 보인다). 레이어는 기어 그림 좌표(1024×1536)의 게임 모듈 `src/game/renderer/gearMotion.ts`가 만들고, 시간 곡선은 SVG CSS 키프레임을 그대로 옮긴 순수 함수(`gearMotionTiming.ts`)가 정한다. `gearMotion` 텍스처는 게임과 같은 공유 로더(`gearMotionAssets.ts`)가 기어 텍스처와 같은 밉맵·삼선형 설정으로 읽는다. 페이지도 같은 로더에서 한 벌을 빌려 두어, 렌더러를 다시 만들어도 다시 읽지 않고 아래 비교 화면도 같은 텍스처를 쓴다.
  - `A 큰 광원`: 장갑 영역에서 띠(바깥 1380, 가운데 840, −14°)가 중심 y −841에서 2377까지 60초에 한 번 내려간다. 띠 밖은 #04060a 7%로 어둡게(대비 복사본 조각을 #04060a로 물들여 같은 장갑 알파로 그린다. 단색 #04060a와 1/255 안쪽 차이), 절반 띠는 대비 복사본 128/255, 가운데 띠는 대비 복사본과 흰빛 3%다(흰빛은 가운데 띠 텍스처에 미리 합성해 스프라이트 하나로 그린다). 띠 셋은 Graphics 스텐실 마스크(띠 밖은 `inverse`)이고 매 프레임 위치만 옮긴다. 마스크 사각형은 기어 그림 안에서 띠가 닿는 만큼(띠 방향 ±702)만 그린다.
  - 알려진 차이(띠 경계 계단): 스텐실 마스크는 픽셀마다 켜고 끄기만 하고 게임 렌더러는 안티앨리어싱(MSAA) 없이 그리므로, 띠 네 경계가 −14° 기울기의 픽셀 계단으로 보이고 띠가 움직일 때 계단이 기어간다. 승인 SVG는 경계를 안티앨리어싱한다. 원본 크기 비교에서 경계 1.5px 안 픽셀의 최대 차이는 12.0/255(15초)·12.7/255(30초)이고 평균은 0.31·0.34다. 비교 Pixi 앱에 MSAA 4×를 켜면 최대 4.7·6.3으로, 띠를 1px 부드러운 알파 마스크로 자르면(`bandEdges: 'soft'`) 2.7~3.0으로 준다. 알파 마스크는 띠마다 마스크 필터 패스가 하나씩 들지만 swiftshader 원본 크기에서는 스텐실보다 빨랐고(264.5 → 212.8ms, MSAA는 323.9ms), 무대는 아직 게임과 같은 스텐실을 쓴다.
  - `B 게이지 액체`: 유리 안쪽 윤곽(스텐실 마스크) 안에서 액체 타일이 10초에 640px 위로 흐르고(불투명도 45%, 좌우 가장자리 흐림은 타일 알파에 구움), 기포 5개와 그 반전이 SVG와 같은 반지름·주기·지연으로 오른다. 액체와 기포는 유리 윤곽 마스크 아래 채움 컨테이너(`gaugeFill`) 하나에 담겨 있다. 고도 게이지는 이것을 자르지 않고 렌더러가 `gearMotion` 위에 빈 유리 덮개를 겹치므로, 액체·기포는 채운 부분에서만 보인다.
  - `C 발광선 호흡`: 파란 발광선과 번짐이 4.4초 주기 ease-in-out으로 0~0.85를 오간다. SVG는 그룹 안에서 발광선을 번짐 위에 겹친 뒤 screen하므로, 번짐 위 발광선(T1)을 불투명도 o로, 발광선 알파 아래 번짐(T2)을 o(1 − o)로 차례로 screen해 같은 결과를 낸다.
  - `D 하단 바 흐름`: 바 마스크 안에서 빛 두 개가 3.2초마다 가운데에서 ±170px 흐른다. 경계가 부드러운 바 마스크만 스프라이트 알파 마스크를 쓰며, 마스크 안에 바 바탕 복사본을 두고 빛을 screen해 SVG의 screen 결과와 같게 한다. 빛이 투명한 동안(주기의 45%)은 그리지 않는다.
  - Pixi는 스프라이트 불투명도를 8비트로 버리므로(17.85 → 17) 0.5/255를 더해 넘겨 브라우저처럼 반올림되게 한다.
  - 장갑·발광선 텍스처는 기둥 사이가 비어 있어 왼쪽 기둥·오른쪽 기둥·아래 띠 두 쪽 조각으로만 그린다(원래 상자의 약 47%). 그려지는 픽셀 수가 줄어 swiftshader에서 `gearMotion`이 더하는 프레임 시간이 약 3분의 1로 줄었다. `gearMotion` 텍스처 GPU 메모리는 밉맵 포함 약 16.8MB다.
  - `update`는 매 프레임 새 배열·객체·클로저를 만들지 않는다(옮길 스프라이트 배열과 결과 객체를 만들 때 한 번 준비).
  - 조절: `움직임` 토글(`gearMotion` 켜기·끄기), `A 큰 광원`·`B 게이지 액체`·`C 발광선 호흡`·`D 하단 바 흐름` 체크(모두 기본 켬, 승인 SVG 시연과 같은 이름), `처음부터 재생` 버튼과 `움직임 시계` 표시(애니메이션 경과 시간 `timeMs`). 렌더러의 공개 조절 `gearMotion`의 `setEnabled`·`setLayerVisible`·`restart`로 조절하고 `status`·`running`·`timeMs`를 읽는다(렌더러 내부 필드는 꺼내지 않는다). 애니메이션 경과 시간은 게임과 같이 곡 시간과 무관하게 렌더러가 그린 렌더 프레임 간격으로만 나아가고, 데모 차트를 되감아도 이어 가며, 렌더러를 다시 만들면(렌더 높이·장면·전체화면) 0초부터 다시 시작한다. `움직임`을 끄면 `gearMotion`을 숨기고 애니메이션 경과 시간을 멈춘다(게임 설정 `Gear Motion` 끔과 달리 객체는 남는다). 설정을 바꿔도 렌더러를 다시 만들지 않는다.
  - 운영체제·브라우저의 모션 감소 설정(`prefers-reduced-motion`, macOS·iOS '동작 줄이기', Android '애니메이션 삭제', Windows 11 '애니메이션 효과')은 읽지 않는다. 이 설정이 켜져 있어도 무대는 게임과 같이 `gearMotion`을 보여 주고 애니메이션 경과 시간도 흐르며, `gearMotion`을 끄는 방법은 `움직임` 토글뿐이다([RFD 0030](../rfd/0030-ignore-os-reduced-motion.md)).
  - 무대 data 속성: `data-motion`(`on`·`off`), `data-motion-ready`(이 렌더러의 내장 `gearMotion`이 준비되어 추가됐는지), `data-motion-armor`·`data-motion-gauge`·`data-motion-accent`·`data-motion-bar`(`on`·`off`), `data-motion-time-ms`(`gearMotion`이 재생된 마지막 프레임의 애니메이션 경과 시간, 재생되지 않으면 없음).
  - 프레임 간격: 무대 설명에 requestAnimationFrame 간격의 평균과 p95를 `gearMotion` 켬·끔 상태별 최근 120프레임으로 따로 보여 주고(1초 넘는 간격은 제외, 렌더러가 바뀌면 다시 모음) `data-frame-time-on`·`data-frame-time-off`(`평균/p95` ms)로 알린다. 표시는 0.5초마다 이 작은 부분만 다시 그리고 data 속성은 직접 써서, 페이지 전체를 다시 렌더링하지 않는다.
- Pixi ↔ 승인 SVG 비교: 무대 아래 구역에서 기어만 그린 작은 Pixi 앱(GameRenderer 아님)과 승인 SVG를 같은 CSS 크기·viewBox로 나란히 보여 준다. 두 화면 모두 SVG 안의 같은 바탕 그림(`#fm-base`)을 쓰고, `gearMotion`은 게임과 같은 모듈이며 텍스처는 공유 로더가 준, 무대와 같은 에셋(밉맵·삼선형)이다. 승인 SVG 경로와 보기는 Lab 모듈 `gearMotionView.ts`에 있다. 보기 `전체`(0 0 1024 1536, 기본)·`왼쪽 장갑`(0 420 320 480)·`하단`(300 1240 424 212)은 승인 SVG 시연과 같다. `비교 시각` 슬라이더(0~60초, 0.1초 단위)로 Pixi `gearMotion`의 애니메이션 경과 시간을 정하고 SVG의 모든 CSS 애니메이션을 멈춘 채 `currentTime`을 같은 값으로 맞춘다. `재생`은 같은 경과 시간으로 양쪽을 함께 재생하고 60초에서 0초로 돌아간다. 이때 주기가 60초를 나누지 않는 발광선(4.4초)·하단 바(3.2초)·일부 기포는 양쪽에서 똑같이 한 번 건너뛰며, 화면 안내에도 적어 둔다. 위의 `gearMotion` 요소 체크는 양쪽에 함께 적용된다. 승인 SVG는 보관 파일이라 자체 `@media (prefers-reduced-motion: reduce)` 규칙(레이어를 숨기고 애니메이션을 끔)을 그대로 가지며, 비교 화면이 문서에 넣기 전에 SVG의 `<style>`에서 그 규칙만 걷어 낸다(`gearMotionView.ts`의 `stripSvgReducedMotionRules`). 그래서 운영체제 설정이 켜져 있어도 SVG 레이어가 숨지 않고 Pixi 쪽과 같은 모습을 비교한다([RFD 0030](../rfd/0030-ignore-os-reduced-motion.md) 결정 5). 좁은 화면(720px 이하)에서는 조절과 두 패널이 세로로 쌓인다. 비교 구역은 화면 가까이(600px) 와야 승인 SVG(약 3.8MB)를 읽고 Pixi 앱을 만든다.
  - 띠 가장자리(Pixi 쪽): `가장자리 부드럽게(안티앨리어싱)`를 켜면 비교 Pixi 앱을 MSAA(`antialias: true`)로 다시 만들고, `띠를 알파 마스크로(실험)`를 켜면 광원 띠를 스텐실 대신 1px 부드러운 알파 마스크로 자르는 앱으로 다시 만든다. 둘 다 기본 꺼짐(게임 렌더러와 같음)이고 설명에 실제로 얻은 MSAA 샘플 수를 보여 준다. Pixi 앱은 만들 때마다 새 캔버스를 붙이므로(WebGL 컨텍스트 속성은 캔버스마다 한 번 정해짐) 두 앱이 한 컨텍스트를 함께 쓰는 일이 없다.
  - 구역 data 속성: `data-compare-ready`·`data-compare-view`·`data-compare-time-ms`·`data-compare-playing`·`data-compare-antialias`(`on`·`off`)·`data-compare-band-edges`(`stencil`·`soft`)·`data-compare-generation`(Pixi 앱을 새로 만든 횟수)·`data-compare-samples`(실제 MSAA 샘플 수).
- 전체화면: 무대 오른쪽 위 `전체화면` 버튼이 무대(캔버스와 비행 배경)를 `requestFullscreen()`으로 띄우고, 없거나 거절되면(iPhone Safari) 화면을 덮는 CSS 전체화면으로 대신한다(`data-fullscreen` = `off`·`api`·`css`). 논리 폭은 게임 PlayScreen과 같은 `resolvePlayLogicalWidth`(높이 600 × 화면 비율, 최소 466)라(16:9 1067, 4:3 800, 21:9 1400, 폰 가로 844×390 1298) 캔버스가 화면을 꽉 채우고 기어는 가운데를 따라간다. 세로 화면처럼 최소 폭 466에 묶이면 위아래를 비우고 가로로 돌리라고 알린다. 들어갈 때·나올 때·창 크기나 회전이 바뀔 때(0.2초 모아서) 렌더러를 다시 만들며 렌더 높이·장면·리프트·키보드 선택은 그대로다(`data-stage-width`). 전체화면에는 무대와 `움직임` 토글·`✕` 닫기만 보이고, Esc(또는 CSS 전체화면의 Esc 키)·`✕`로 일반 화면에 돌아온다.
- 렌더 높이 720·1080(기본)·1440, 비행 장면 LIFTOFF·INFILTRATION(기본)·BREAKTHROUGH는 렌더러 생성 옵션이라 렌더러를 새로 만든다.
- 보기: `화면 맞춤`(기본)은 무대를 화면 폭에 맞춘다. `1:1 픽셀`은 캔버스 1px을 기기 화면 1px로 보여 주며(CSS 크기 = 캔버스 픽셀 ÷ `devicePixelRatio`) 무대 안에서만 스크롤한다. 좁은 화면에서는 조절 패널이 무대 아래로 내려간다.
- 무대 아래 설명은 기어를 몇 배로 줄여 어디에 맞추는지, 위로 몇 행이 잘리는지, 덱 위끝·키 윗면 위치, 판정선·키보드 표시와 `원본 1px → 화면 N px`(N = 250 ÷ 552 × 렌더 높이 ÷ 600, 1080이면 0.82)을 보여 준다.
- 무대의 `data-render-height`·`data-scenario`·`data-view`·`data-renderer-key`·`data-renderer-ready`·`data-lift-percent`·`data-keyboard`·`data-keyboard-visible`·`data-keyboard-scale`·`data-judgment-line-y`(렌더러에서 읽은 판정선 y)·`data-deck-top-y`·`data-key-rim-y`·`data-gear-top`·`data-gear-x`·`data-gear-scale`·`data-lane-window`(렌더러가 놓은 기어 배치)·`data-missed-count`(이 렌더러가 재생을 시작한 뒤 놓친 노트 누적 수)·`data-song-ms`·`data-stage-width`는 E2E와 사람이 현재 상태를 확인하는 데 쓴다.
- 자료: 기어 그림과 측정값은 게임이 쓰는 한 벌(`public/gear/gear.png`, `src/game/renderer/gearGeometry.json`)을 그대로 읽는다. 둘은 `assets-lab/classic/revisions/frame-keywords-six-20260929/prepare-frame-fit-v20.mjs`가 원본 `press-idle-deck-v17-input.png`에서 만든다. 레인 창과 기어 바깥 바탕을 투명하게 하고, 바탕은 이미지 가장자리에서 비슷한 색만 채워 지우며, 실루엣 2px 안은 색 거리로 알파를 낮추고 바탕색을 빼 회색 테두리가 남지 않게 한다. 기둥·키 덱·하단 바는 불투명하게 남긴다. 덱 위끝부터 키 테두리 바로 위(1090~1126행)까지 꺾인 모서리 사이에 그려진 레인 바닥과 레인 선도 지운다(모서리 경계는 행마다 잰 점에 맞춘 직선, 왼쪽 236.7→266.1·오른쪽 786.5→758.3, 경계 픽셀은 모서리가 덮는 몫만 남기고 바닥색을 빼며 모서리 윤곽·베벨은 불투명). 측정값은 레인 창 열, 덱 위끝·열린 덱 바닥 행과 사다리꼴(`laneOpening`), 실루엣 위끝·좌우 열·아래끝, 게이지 유리관 빛의 첫 행 등이다. 같은 생성기가 고도 게이지 빈 유리 아틀라스 `public/gear/gear-gauge-empty.png`(v18 빈 유리 생성 이미지에서 두 유리관 안쪽만 유리 안쪽 윤곽으로 자름, 192×832)와 그 자리(`gauge`: 유리 윤곽, 채움 구간 196~1016행, 유리관 상자·아틀라스 자리)도 만든다. `--debug <폴더>`를 주면 알파, 마젠타·비행 배경색 합성, 레인 창·열린 덱 가장자리 확대 PNG를 함께 만든다. 다시 실행하면 같은 바이트가 나온다.
  - `gearMotion` 에셋: `prepare-frame-motion-v21.mjs`가 승인 SVG를 만드는 `assemble-ambient-v19.mjs`와 같은 측정 모듈(`frame-motion-shared.mjs`)로 마스크를 재고, SVG의 필터·블러·그라데이션은 Chromium으로 그려 기어 그림 옆 `public/gear/gear-motion/`(게임과 Lab 공용, 프로덕션 빌드 포함)에 텍스처 9개(`armor-lit`·`armor-core`·`accent-glow`·`accent-overlap`·`liquid-tile`·`bar-mask`·`bar-base`·`glint`·`bubbles` PNG)와 `gear-motion.json`(텍스처마다 atlas frame과 기어 그림 좌표, 유리 윤곽 다각형 두 개, 기포 표, 광원·대비·발광선·하단 바 값)을 만든다. 장갑·발광선 텍스처는 왼쪽 기둥·오른쪽 기둥을 한 줄에, 아래 띠 왼쪽·오른쪽 반을 그 아래 각각 한 줄에 담은 아틀라스(장갑 512×1680)이고, atlas frame마다 실제 이웃 픽셀 16px 테두리를 남겨 경계에서도 하나의 이미지처럼 필터링된다. atlas frame의 원본 영역은 16px 배수라 밉맵이 기어 텍스처와 맞물린다. 장갑 알파는 기어 그림(`public/gear/gear.png`) 알파를 곱해, 그림에서 지운 바탕(장갑 픽셀 331,589개 중 4,365개)에 빛 받은 복사본이 그려지지 않게 한다. 다시 실행하면 같은 바이트가 나오고, v19 SVG도 측정 모듈로 바꾼 뒤 같은 바이트다.


## 이전 배경 제거

새 비행 배경 적용 후 `Geometric Background`와 `Perspective Surface Grid` 시연, 카탈로그 항목, 라우트를 제거했다. 이전 인게임 프리셋과 이를 다시 생성하던 개발 서버 저장 API도 제공하지 않는다. 현재 배경은 `Flight Background Preview`에서 확인한다.

## 옛 기어 미리보기 제거

새 기어를 게임에 적용하면서([RFD 0029](../rfd/0029-frame-aspect-fit-narrow-lanes.md)) 옛 기어 그림을 다루던 `Gear Light`(`/lab/gear-light`)와 `Gear Measure Pulse`(`/lab/gear-measure-pulse`) 시연, 카탈로그 항목, 라우트, 도우미·테스트·E2E와 자산(`public/lab/gear-light/`·`public/lab/gear-samples/`, `scripts/split-gear-light-layer.ts`)을 지웠다. 새 기어는 `Gear`에서 확인한다.

## GitHub Pages 정적 배포

- `vite.lab.config.ts`가 `/not4k/` base를 사용하는 별도 산출물 `dist-lab`을 만든다.
- 각 카탈로그 항목에 `index.html`을 생성해 `/lab/<id>/` 직링크를 지원한다.
- 이미지 갤러리 등록부에 있는 폴더만 `/lab/images/<id>/`로 복사한다. 미등록 폴더와 생성 원본의 프롬프트·중간 산출물은 배포하지 않는다.
- Flight Background Preview는 서버 allowlist와 스타일 주입 결과를 정적 파일로 export한다.
- `.github/workflows/deploy-lab-pages.yml`이 `main`의 Lab 관련 변경에만 반응해 Pages를 갱신한다.

## 검증

- `labPreviewCatalog.test.ts`: 6개 인터랙티브 항목의 고유 `id`·경로, 대표 비행 미리보기와 시설 통과·노트 에셋 시연실·Gear 등록을 확인한다.
- `labImageGalleryCatalog.test.ts`: 이미지 HTML 컬렉션 2개의 고유 `id`와 `/lab/images/` 경로를 확인한다.
- `labImageGalleryDevRequest.test.ts`: 등록된 로컬 alias만 재작성하고 literal·URL 인코딩 traversal을 거부하는지 확인한다.
- `exportLabImageGalleries.test.ts`: 등록한 HTML·중첩 자산만 복사하고 미등록 컬렉션은 제외하는지 확인한다.
- `LabIndexPage.test.ts`: 인터랙티브 카탈로그 6개(옛 기어 미리보기 없음)와 `IMAGE GALLERIES` 링크를 확인한다.
- `FlightBackgroundPreviewLabPage.test.ts`·`FacilityPassagePreviewLabPage.test.ts`: 각 iframe 경로·시설 초기값과 Lab 복귀 링크를 확인한다.
- `e2e/lab/catalog.spec.ts`: `/lab`에서 비행 미리보기를 열어 세 장면 탭이 나타나는지, 이미지 HTML 페이지에 9장이 로드되는지, 390px·912px에서 목록이 넘치지 않는지 확인한다. 시설 통과는 390px·1280px에서 진입·내부 정지·고도 조절·목록 복귀를 검증한다.
- `e2e/lab/note-assets.spec.ts`: 공통 카탈로그에서 노트 에셋 시연실을 열면 Classic 재생기가 준비되고 목록으로 돌아올 수 있는지 390px·1280px에서 확인한다.
- `gearPreview.test.ts`·`gearPreviewChart.test.ts`·`gearMotionView.test.ts`·`GearPage.test.ts`: 게임과 같은 논리 폭 규칙(16:9 1067·가로 폰 1298·세로 466), 리프트 % 범위와 표시, 고도 조절(따라가기 기본·0~100% 슬라이더·렌더러 고정값·게이지 채움 표시와 렌더러 공개 API `setAltitudeOverride`·`gearGaugeLevel`만 쓰는지), 판정선·덱·키 윗면 사이 거리(0% 13.7·30.5, 4% 37.7·54.5), 기어 설명 숫자, 키보드 프리셋, 데모 차트와 판정 일정(놓칠 노트·맞힘 시점·롱노트 끝 처리·되감기), 비교 viewBox·승인 SVG 경로, 승인 SVG의 `<style>`에서 모션 감소 `@media` 블록만 지우고 나머지 텍스트는 그대로 두는지(보관 파일 자체는 그 규칙을 그대로 가짐), 비교 화면이 문서에 넣기 전에 그 규칙을 걷어 내는지, `gearMotion`을 따로 만들지 않고 렌더러의 공개 `gearMotion`으로만 조절하며 `gearMotion` 에셋 lease를 게임과 같은 공유 로더로 acquire하는지, `data-motion`이 `on`·`off`뿐이고 페이지가 모션 감소 설정을 읽지 않는지, 기본 선택 상태와 맞춤 방식·레인 폭 슬라이더가 없는지를 확인한다. `ignoreOsReducedMotion.test.ts`는 `src/lab` 소스(테스트 제외)에서 `prefers-reduced-motion`을 적은 파일이 그 규칙을 걷어 내는 `gearMotionView.ts` 하나뿐인지 확인해, `matchMedia` 검사나 `@media` 규칙이 다시 생기지 않게 한다. 게임 쪽 배치와 `gearMotion`·고도 게이지는 `src/game/renderer/{gearLayout,GameRenderer.gear,GameRenderer.gearMotion,GameRenderer.gearGauge,gearGauge,GearMotionController,gearMotionAssets,KeyboardDisplay}.test.ts`가 확인한다.
- `e2e/lab/gear.spec.ts`: 390px·1280px에서 카탈로그로 열어 렌더러·비행 배경 준비와 목록 복귀, 옛 주소 `/lab/classic-frame-fit`·`/lab/classic-gear`가 쿼리·해시를 유지한 채 `/lab/gear`로 넘어가는지, 렌더러가 위치 지정한 레인 창(408.5~658.5)·판정선 y 416·덱 위끝 429.7·키 윗면 446.5와 놓친 노트 수 증가, 리프트 4%를 렌더러 재생성 없이 판정선에만 반영하는지, 기어 그림의 투명·불투명 영역과 열린 덱에 비치는 게임 레인·고도 100%의 게이지 빛, 고도 직접 30%에서 두 유리관의 채움 경계(771행) 위는 빈 유리·아래는 청록 액체이고 `gearMotion`을 켜도 경계 위에 액체·기포가 보이지 않는지, 고도 100%가 기어 그림과 같은 색(채널 차 24 이내)·0%가 모두 빈 유리이고 따라가기를 다시 켜면 풀리는지, 렌더 높이·장면 변경 시 렌더러 재생성, 1:1 픽셀 보기, 렌더러 내장 `gearMotion` 켬·애니메이션 경과 시간 흐름·처음부터 재생·토글·레이어 체크·프레임 간격 표시, 전체화면(1400·CSS 1298)과 4:3·5:4의 키보드 배율·숨김, `gearMotion` 에셋(`/gear/gear-motion/gear-motion.json`) 응답을 보류하면 렌더러 준비도 기다렸다가 응답을 보내면 `gearMotion`을 추가한 채 준비되는지, 모션 감소 설정(`prefers-reduced-motion: reduce`)을 켜도 `data-motion`이 `on`이고 애니메이션 경과 시간이 흐르며 비교 SVG의 레이어·애니메이션이 숨지 않는지를 확인한다.
- 공개 미리보기 자체는 해당 시연 폴더의 Vitest와 Playwright 검사를 계속 사용한다.
- `src/game/renderer/{gearMotionTiming,gearMotionData,gearMotion}.test.ts`·`frameTimeStats.test.ts`: 광원 띠 중심(0초 −841·30초 768·60초 −841), 액체(5초 −320), 기포·발광선(2.2초 0.85)·하단 바 빛(0.88초 85px, 1.76초 170px·투명)의 시간 곡선과 ease-in-out, `gear-motion.json` 읽기·오류(atlas frame이 텍스처 밖이면 오류)와 게임 경로(`/gear/gear-motion/`), 장갑 atlas frame 4개(675,328px), 레이어 구성(atlas frame 위치 지정·띠 밖 어둡게의 armor-lit `tint`·마스크·혼합·불투명도 8비트 보정·띠 반폭 702·부드러운 띠 프로파일)과 갱신(같은 시각을 다시 갱신하면 같은 상태, 결과 객체 재사용)·레이어 끄기·정리(구성 도중 실패해도 서브 텍스처 정리), 게이지 채움 컨테이너(`gaugeFill`), 게임 모듈이 Lab·React를 import하지 않는지, 프레임 간격 평균·p95를 확인한다.
- `e2e/lab/gear-motion-compare.spec.ts`: 게임과 같은 공유 로더로 acquire한 `gearMotion` 에셋으로 만든 비교 Pixi 화면(원본 크기 1024×1536)과 같은 시각으로 멈춘 승인 SVG를 캔버스에 그려 기어 실루엣(기어 그림 알파 > 0, 레인 창 제외)에서 픽셀을 비교한다. 0·15·30·45초 네 레이어 모두는 평균 ≤ 1.5/255·99번째 백분위 ≤ 6/255이고 `gearMotion` 없는 바탕보다 4배 넘게 가까워야 한다(측정 평균 0.18~0.39, 99번째 백분위 1~2). 레이어 하나씩(A 실루엣, B 유리관 상자, C 실루엣, D 바 상자)은 평균 ≤ 1/255다. 광원 띠 경계 1.5px 안에서는 스텐실의 최대 차이(약 12/255)가 MSAA로 0.6배 아래, 알파 마스크로 4/255 이하가 되는지 본다. 구성 도중 실패하면 비교 앱이 오류를 알리고 WebGL 컨텍스트를 해제하는지, 안티앨리어싱·알파 마스크 체크가 새 캔버스로 앱을 다시 만들고(generation 증가, MSAA 샘플 > 0) 끄면 돌아오는지, 비교 시각 30초에 SVG 애니메이션이 모두 멈추고 currentTime 30000·광원 표시점 y 768인지, 왼쪽 장갑 보기의 같은 CSS 크기(480×720, devicePixelRatio 1) 두 패널 평균 차이가 1.5/255 아래이고 `gearMotion`을 끈 Pixi의 절반 아래인지(전체 보기는 1024px를 480px로 줄이는 필터 차이가 약 2.2/255라 쓰지 않는다), 보기 viewBox·패널 비율, 재생·일시정지, 레이어 체크가 SVG에도 걸리는지, 비교 구역을 늦게 읽는지, 390px 세로 배치를 확인한다. 픽셀 비교 묶음은 한 워커에서 차례로 돈다.
- `pnpm run build:lab`: Pages base, 6개 인터랙티브 직링크와 기어 그림(`gear/gear.png`)·고도 게이지 빈 유리(`gear/gear-gauge-empty.png`)·`gearMotion` 에셋(`gear/gear-motion/`의 `gear-motion.json`과 텍스처 9개)·비교 기준 SVG, 이미지 HTML 컬렉션 2개, 세 비행 장면, 서버 코드 제외를 정적 산출물에서 확인하고, 지운 옛 기어 미리보기·자산(`lab/gear-light`·`lab/gear-measure-pulse`·`lab/gear-samples`·`gear/gear-frame.png`·보관본 기어 공개본)과 #231에서 이름을 바꾼 옛 경로(`lab/classic-frame-fit` — 옛 Lab 컷아웃·`gearMotion` 에셋 복사본 포함, `gear/classic-frame.png`·`gear/classic-frame-motion`)가 없는지 확인한다.
