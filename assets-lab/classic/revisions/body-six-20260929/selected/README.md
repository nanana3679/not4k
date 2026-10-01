# 선택한 롱노트 에셋

2026-09-29 사용자 선택: **바디 아주 밝게 + 기존 고채도 포인트**.
싱글은 파랑, 더블은 금색을 유지한다.

| 파일 (`single` / `double`) | 용도 | 규격 |
| --- | --- | --- |
| `body-{single,double}.png` | 바디 1단계 · 아주 밝게 | 1000×200 |
| `body-{single,double}-200x40.png` | 바디 소형 | 200×40 |
| `terminal-{single,double}.png` | 시작·끝 공용 터미널 | 1000×200 |
| `terminal-{single,double}-200x40.png` | 시작·끝 공용 터미널 소형 | 200×40 |
| `point-{single,double}.png` | 기존 고채도 포인트 | 212×40 |
| `point-{single,double}.svg` | 고채도 포인트 벡터 원본 | 1060×200 |

바디는 `spectrum-{single,double}-01` 원본 그대로이며 100:20 비율과 상하 반복을 유지한다. 각 터미널은 같은 유형·규격의 바디와 바이트 단위로 동일하다.

포인트는 `references/note-{single,double}-saturated` 원본 그대로다. 가운데 분할이 제거된 기존 고채도 버전이며, 새 포인트 밝기 스펙트럼과는 별도로 보존한 원본이다. 212px 포인트의 중앙 200px 구간에 200px 바디를 정렬한다(양쪽 여백 6px).

원본 경로·규격·SHA-256은 `selection.json`에 기록했다.
미리보기: `/lab/images/long-note-body-six-20260929/#selected-combination`.
2026-09-29 `classic` 런타임에 반영했다. 대기는 선택 타일 그대로, 홀드·부분충족·실패는 같은 재질에 기존 상태 표시를 적용하며 `pnpm build:classic`으로 재생성한다.
