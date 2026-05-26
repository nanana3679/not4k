# Domain Docs

engineering skill들이 코드베이스를 탐색할 때 이 저장소의 도메인 문서를 읽는 방식이다.

## Before exploring, read these

- 루트의 `CONTEXT-MAP.md`
- `CONTEXT-MAP.md`가 가리키는 관련 컨텍스트의 `CONTEXT.md`
- 모든 도메인 작업에서 루트 `CONTEXT.md`의 Core domain
- 작업 영역과 관련된 `docs/adr/`
- multi-context 구조가 생긴 경우, 관련 `src/<context>/docs/adr/`

이 저장소는 현재 multi-context로 취급한다. `CONTEXT.md`와 `docs/adr/`는 점진적으로 완성될 수 있다. 파일이 없거나 아직 충분히 작성되어 있지 않으면 조용히 진행하고, 그 부재 자체를 선행 작업으로 요구하지 않는다.

## File structure

Single-context repo:

```text
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-example-decision.md
│   └── 0002-example-decision.md
└── src/
```

Multi-context repo:

```text
/
├── CONTEXT-MAP.md
├── CONTEXT.md                         ← Core domain
├── docs/adr/
└── src/
    ├── editor/
    │   ├── CONTEXT.md
    │   └── docs/adr/
    └── game/
        ├── CONTEXT.md
        └── docs/adr/
```

## Use the glossary's vocabulary

이슈 제목, 리팩터링 제안, 가설, 테스트명에서 도메인 개념을 부를 때는 `CONTEXT-MAP.md`로 관련 컨텍스트를 찾고, 해당 `CONTEXT.md`와 `docs/context/glossary.md`의 용어를 우선한다.

필요한 개념이 아직 문서화되어 있지 않다면 임의로 단정하지 않는다. 작업에 꼭 필요한 경우 현재 맥락에서 가장 좁게 정의하고, `docs/context/glossary.md` 또는 이후 `CONTEXT.md` 보강 대상으로 남긴다.

## Flag ADR conflicts

출력이 기존 ADR과 충돌한다면 조용히 덮어쓰지 말고 명시적으로 표시한다.
