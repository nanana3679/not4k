# 곡·차트 관리 (admin)

곡과 차트의 등록·삭제 수명주기 규칙을 정의한다. 게임의 곡 선택 화면(admin 모드)과
에디터에서 수행하는 관리 작업이 대상이다.

## 데이터 구조

곡 하나는 두 저장소에 걸쳐 존재한다.

| 위치 | 내용 |
|------|------|
| `songs` 테이블 | 곡 메타데이터 (제목, 아티스트, 재생 구간 등) |
| `charts` 테이블 | 차트 메타데이터 (난이도 라벨/레벨, offset)와 현재 파일 쌍을 가리키는 `asset_revision` |
| Storage `songs/{song_id}/` | 음원, 자켓, 프리뷰, 차트 JSON 세대(`{difficulty}.{revision}.json`, `{difficulty}.{revision}.extra.json`) |

## 차트 로드 규칙

- `charts.asset_revision`이 있으면 그 값과 같은 revision의 메인·보조 차트를 로드한다.
- `asset_revision`이 `null`인 기존 차트만 `{difficulty}.json`과 `{difficulty}.extra.json`을 로드한다. revision 조회 실패나 유효하지 않은 값은 로드를 중단한다.
- 메인 차트 파일은 필수이다.
- 기존 차트(`asset_revision=null`)에서만 보조 차트 파일의 404를 파일 부재로 취급하고 메인 차트에 내장된 이전 포맷의 제작 보조 정보를 읽는다. revision이 게시된 차트에서는 보조 파일도 필수이다.
- 보조 차트 파일의 그 밖의 HTTP 오류, 네트워크 오류, 파싱 오류가 발생하면 편집기 진입을 중단한다. 메인 차트만 불완전하게 연 뒤 저장하여 제작 보조 정보를 덮어쓰는 흐름은 허용하지 않는다.

## 차트 저장 규칙

- 저장할 때 고유 revision을 만들고, 같은 revision의 메인·보조 파일을 `upsert` 없이 먼저 업로드한다. 보조 노트가 없어도 빈 보조 파일을 만든다.
- 전환·롤백 호환을 위해 같은 내용의 stable 메인·보조 파일도 함께 갱신한다. canonical 게시점은 DB revision이며 stable 파일은 구버전 reader용 shadow이다.
- 두 파일 업로드가 모두 성공한 뒤 `charts` 행의 revision과 난이도 레벨/offset을 한 번의 DB 쓰기로 교체한다. 따라서 파일 쌍과 메타데이터의 게시 승자는 항상 같다.
- 파일 업로드 단계에서 실패한 revision은 게시 전에 정리한다. DB 게시 요청 뒤에는 응답 유실 시 실제 커밋 여부를 알 수 없으므로 파일을 지우지 않는다.
- 게시된 이전 revision과 실패한 미참조 revision은 동시 저장·삭제의 staging 파일을 잘못 지우지 않도록 즉시 제거하지 않는다. 차트 삭제는 DB 행이 가리키던 활성 revision만 제거하고, 곡 삭제 시 디렉터리 전체를 정리한다.
- 신규 차트도 처음부터 고유 revision의 메인·빈 보조 파일을 게시한다. `asset_revision=null`은 마이그레이션 이전 기존 행의 하위호환에만 사용한다.
- migration 선적용, Vercel build gate, 구버전 writer 차단, 롤백 순서는 [차트 `asset_revision` 배포 runbook](../runbooks/chart-asset-revision-rollout.md)을 따른다.

## 삭제 규칙

**차트를 모두 지운 곡만 삭제할 수 있다.** (2026-07-06 곡 오삭제 사고 후속)

- 차트 삭제는 **에디터에서 한 번에 하나(난이도 하나)씩만** 가능하다. 차트 일괄 삭제 경로는 없다.
- 곡 삭제(곡 선택 화면 admin)는 차트가 0개일 때만 허용된다.
  - 차트가 남아 있으면 삭제 확인 모달에서 Delete 버튼이 비활성화되고 남은 차트 수를 안내한다.
  - 앱을 우회한 삭제(대시보드, SQL)도 DB의 FK 제약(`charts.song_id → songs.id`,
    `on delete restrict`)이 거부한다. 마이그레이션: `20260706000000_restrict_song_delete.sql`
- 곡 삭제 순서는 **DB 행 먼저, Storage 파일 나중**이다. 클라이언트가 아는 차트 수가
  낡았더라도 FK가 행 삭제 단계에서 거부하므로, 거부 시점에 파일은 무손상이다.
  구현: `src/shared/songAssets/chartAssetPersistence.ts`의 `deleteSongAsset`
- 차트 삭제는 DB 행을 먼저 지운 뒤 그 행이 가리키던 활성 revision과 이전 형식 파일만 제거한다. 동시 저장과의 경합 때문에 미참조 revision은 이 단계에서 일괄 삭제하지 않는다.

## 백업 (다중화)

차트·곡 데이터의 유일한 사본이 Supabase에만 존재하지 않도록 백업을 이중으로 유지한다.

- **수동**: `pnpm backup` → `backups/<UTC타임스탬프>/`에 `songs`·`charts` 테이블 덤프와
  Storage `songs/`, `tutorials/` 전체 파일을 저장한다. `--charts-only`를 붙이면
  DB 덤프 + 차트 JSON만 (수백 KB). `backups/`는 gitignore 대상이다.
  구현: `scripts/backup-supabase.mjs`
- **자동** (`.github/workflows/backup.yml`): 매일 03:00 KST에 charts-only,
  매주 일요일 04:00 KST에 풀 백업을 실행해 Actions 아티팩트로 90일 보관한다.
  필요 시크릿: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`
- 사용자 데이터(`play_records` 등)는 RLS 때문에 publishable key로 백업할 수 없다 — 미포함.
