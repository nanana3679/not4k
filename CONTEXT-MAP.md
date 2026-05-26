# Context Map

not4k는 multi-context 저장소이다. 모든 도메인 작업은 먼저 Core domain을 읽고, 작업 영역에 맞는 세부 컨텍스트를 추가로 읽는다.

## Contexts

- [Core domain](./CONTEXT.md) — not4k 전체에서 공유하는 리듬게임 언어, 노트 타입, 피스, 난이도 체계.
- [Gameplay](./src/game/CONTEXT.md) — 플레이 세션, 입력-노트 매칭, 판정, 스코어링, 게임 설정, 결과 경험.
- [Chart editor](./src/editor/CONTEXT.md) — 차트 제작, 타임라인, 편집 모드, 스냅, 미니맵, 배치 제약.
- [Shared chart model](./src/shared/CONTEXT.md) — 게임과 에디터가 공유하는 차트 구조, 박 기반 시간, 마커, 구간 이벤트, 차트 에셋.
- [Online services](./src/supabase/CONTEXT.md) — 온라인 전용 흐름, 곡/차트 에셋 로딩과 저장, 프로필, admin 권한, 랭킹.

## Relationships

- **Core domain**은 모든 컨텍스트가 공유하는 기본 언어이다.
- **Chart editor**는 **Shared chart model**의 차트를 만들고 수정한다.
- **Gameplay**는 **Shared chart model**의 차트를 소비해 플레이 세션을 진행한다.
- **Online services**는 **Shared chart model**의 차트와 곡 에셋을 불러오고 저장한다.
- **Chart editor**는 **Online services**를 통해 차트 에셋을 게시한다.
- **Gameplay**는 **Online services**를 통해 곡 에셋, 프로필, 랭킹, 플레이 기록과 연결된다.

## Reading guide

- 노트 타입, 피스, 난이도 용어가 나오면 먼저 **Core domain**을 읽는다.
- 플레이 중 동작, 판정, 결과, 설정을 다루면 **Gameplay**를 읽는다.
- 차트 제작 UX나 에디터 조작을 다루면 **Chart editor**를 읽는다.
- 차트 파일 구조, 직렬화, 마커, 공용 타입을 다루면 **Shared chart model**을 읽는다.
- 서버 저장, 곡/차트 에셋, 로그인, admin, 랭킹을 다루면 **Online services**를 읽는다.
