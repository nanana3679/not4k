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

## 차트 로드 규칙

에디터는 차트를 열 때 Storage에서 차트 파일(`{difficulty}.json`)과 보조 파일(`{difficulty}.extra.json`)을 함께 읽고, 둘 다 읽은 뒤에만 연다.

- 차트 파일은 필수이다.
- 보조 파일은 Storage가 객체 없음으로 답할 때만 없는 것으로 본다. HTTP 404와, Supabase Storage가 없는 객체에 주는 HTTP 400 응답(본문 `statusCode: "404"`이면서 `code: "NoSuchKey"`, `code`가 없는 이전 형식이면 `error: "not_found"`)이 여기에 해당한다. 본문 `statusCode`가 "404"여도 버킷 없음(`NoSuchBucket`)은 객체 없음이 아니다. 이때는 차트 파일에 내장된 이전 포맷의 제작 보조 정보를 읽고, 그것도 없으면 보조 노트 없이 연다.
- 보조 파일의 그 밖의 HTTP 오류(5xx, 객체 없음이 아닌 400 등), 네트워크 오류, 파싱·형식 오류가 나면 에디터를 열지 않고 차트 파일을 읽지 못했을 때와 같은 Error 화면(오류 메시지와 Back to Songs 버튼)을 표시한다. 형식 오류는 본문이 JSON 객체가 아닐 때, `extraNotes`·`extraLaneCount` 키가 없을 때, 노트 종류를 알 수 없거나 `beat`·`endBeat` 문자열이 없거나 잘못됐을 때, `extraLane`이 1~10, `extraLaneCount`가 0~10 범위의 정수가 아닐 때다. 노트 형식 오류의 메시지에는 처음 어긋난 노트의 위치(`extraNotes[i]`)가 들어간다.
- 보조 파일을 읽지 못한 채 에디터를 열면 이어진 저장이 Storage의 보조 파일을 빈 내용으로 덮어쓰거나 지워 제작 보조 정보를 잃는다. 이 규칙은 그 흐름을 막는다.
- 보조 파일이 계속 형식 오류로 실패하면 에디터에 들어갈 수 없어 에디터 안의 차트 삭제도 쓸 수 없다. 이때는 Supabase 대시보드에서 `{difficulty}.extra.json`을 고치거나 지운 뒤 다시 연다.

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
  구현: `scripts/backup-supabase.ts`
- **자동** (`.github/workflows/backup.yml`): 매일 03:00 KST에 charts-only,
  매주 일요일 04:00 KST에 풀 백업을 실행해 Actions 아티팩트로 90일 보관한다.
  필요 시크릿: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`
- 사용자 데이터(`play_records` 등)는 RLS 때문에 publishable key로 백업할 수 없다 — 미포함.
