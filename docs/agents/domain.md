# Domain Docs

engineering skill들이 코드베이스를 탐색할 때 이 저장소의 도메인 문서를 찾는 방식이다.

## 관련 컨텍스트 찾기

도메인 동작·용어·데이터 모델을 다루는 작업에서는 다음 순서로 필요한 문서만 읽는다.

1. 루트 `CONTEXT-MAP.md`에서 작업 영역을 찾는다.
2. 루트 `CONTEXT.md`의 Core domain과 관련 모듈의 `CONTEXT.md`를 읽는다.
3. 특정 용어는 `docs/context/glossary.md`의 해당 항목을 검색한다.
4. 작업이 기존 제품 결정에 영향을 주거나 `CONTEXT.md`가 결정 근거로 연결한 경우에만 관련 `docs/rfd/` 또는 `src/<context>/docs/rfd/`를 읽는다.

모든 컨텍스트·glossary·RFD를 미리 읽지 않는다. 문구·시각 스타일·격리된 빌드 설정처럼 도메인과 무관한 변경에는 이 절차를 선행 조건으로 요구하지 않는다.

이 저장소는 현재 multi-context로 취급한다. `CONTEXT.md`와 `docs/rfd/`는 점진적으로 완성될 수 있다. 파일이 없거나 아직 충분히 작성되어 있지 않으면 조용히 진행하고, 그 부재 자체를 선행 작업으로 요구하지 않는다.

## File structure

Single-context repo:

```text
/
├── CONTEXT.md
├── docs/rfd/
│   ├── 0001-example-decision.md
│   └── 0002-example-decision.md
└── src/
```

Multi-context repo:

```text
/
├── CONTEXT-MAP.md
├── CONTEXT.md                         ← Core domain
├── docs/rfd/
└── src/
    ├── editor/
    │   ├── CONTEXT.md
    │   └── docs/rfd/
    └── game/
        ├── CONTEXT.md
        └── docs/rfd/
```

## Use the glossary's vocabulary

이슈 제목, 리팩터링 제안, 가설, 테스트명에서 도메인 개념을 부를 때는 관련 `CONTEXT.md`와 `docs/context/glossary.md`의 해당 항목을 검색해 그 용어를 우선한다.

필요한 개념이 아직 문서화되어 있지 않다면 임의로 단정하지 않는다. 새로운 공식 도메인 개념이나 사용자에게 노출되는 용어를 도입하는 작업이면 `AGENTS.md`의 용어 규칙에 따라 glossary와 관련 `CONTEXT.md`를 갱신한다.

## Flag RFD conflicts

출력이 기존 RFD와 충돌한다면 조용히 덮어쓰지 말고 명시적으로 표시한다.
