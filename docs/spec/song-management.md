# 곡·차트 관리 (admin)

곡과 차트의 등록·삭제 수명주기 규칙을 정의한다. 게임의 곡 선택 화면(admin 모드)과
에디터에서 수행하는 관리 작업이 대상이다.

## 데이터 구조

곡 하나는 두 저장소에 걸쳐 존재한다.

| 위치 | 내용 |
|------|------|
| `songs` 테이블 | 곡 메타데이터 (제목, 아티스트, 재생 구간 등) |
| `charts` 테이블 | 차트 메타데이터 (난이도 라벨/레벨, offset) |
| Storage `songs/{song_id}/` | 음원, 자켓, 프리뷰, 차트 JSON(`{difficulty}.json`, `{difficulty}.extra.json`) |

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
