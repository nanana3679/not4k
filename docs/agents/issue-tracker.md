# Issue tracker: GitHub

이 저장소의 이슈와 PRD는 GitHub Issues에서 관리한다. 모든 작업은 저장소 루트에서 `gh` CLI로 수행한다.

## Conventions

- 이슈 생성: `gh issue create --title "..." --body "..."`
- 이슈 읽기: `gh issue view <number> --comments`
- 이슈 목록 조회: `gh issue list --state open --json number,title,body,labels,comments`
- 이슈 댓글 작성: `gh issue comment <number> --body "..."`
- 라벨 추가/제거: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- 이슈 닫기: `gh issue close <number> --comment "..."`

`gh`는 저장소 안에서 실행하면 `git remote -v`를 기준으로 대상 저장소를 자동 추론한다. 현재 저장소는 `nanana3679/not4k` GitHub remote를 사용한다.

## When a skill says "publish to the issue tracker"

GitHub Issue를 생성한다.

## When a skill says "fetch the relevant ticket"

`gh issue view <number> --comments`를 실행한다.
