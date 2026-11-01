# Supabase RLS 정책 정리

> Migration 파일 기준 정리. 실제 DB에 적용할 때는 SQL Editor에서 실행.

## profiles

| 정책 | 동작 | 조건 |
|------|------|------|
| `profiles_select_own` | SELECT | `auth.uid() = id` |
| `profiles_update_own` | UPDATE | `auth.uid() = id`, 익명 아님 |

- `is_admin boolean` 컬럼 있음 (migration 300000)
- 클라이언트(`authenticated`)의 UPDATE 권한은 `display_name` 열만 (migration 20261031000000). `is_admin`은 대시보드·SQL Editor처럼 DB 소유자(`postgres`)나 `service_role` 권한으로만 변경
- INSERT는 트리거(`handle_new_user`)로만 수행

## songs

| 정책 | 동작 | 조건 |
|------|------|------|
| `songs_select_all` | SELECT | 모두 허용 |
| `songs_insert_admin` | INSERT | `authenticated` + `is_admin()` |
| `songs_delete_admin` | DELETE | `authenticated` + 인라인 `is_admin` 서브쿼리 |

- `uploaded_by uuid` 컬럼 있음 (migration 200000, default `auth.uid()`)
- UPDATE 정책이 없다. 클라이언트의 `songs` UPDATE는 오류 없이 0행을 바꾼다
- `songs_delete_admin`은 `authenticated` + 인라인 `is_admin` 서브쿼리로 DELETE를 허용한다(migration `20260227100000`). 차트가 남아 있으면 FK RESTRICT가 삭제를 막는다.
- **마이그레이션에는 songs UPDATE 정책이 없다.** 현재 `useFileOperations.ts`는 직접 UPDATE를 보내지만 운영 DB의 정책은 확인하지 않았다. `save_song`은 관리자 확인 뒤 `security definer`로 RLS를 우회하도록 설계했으며, UPDATE 정책을 추가하지 않는다.
- `timing jsonb`는 곡 공통 타이밍의 정본이며 SQL NULL은 미이행 상태다. `revision bigint NOT NULL DEFAULT 0`은 저장 충돌 검사에 쓴다(migration `20261101000000`).

## charts

| 정책 | 동작 | 조건 |
|------|------|------|
| `charts_select_all` | SELECT | 모두 허용 |
| `charts_insert_admin` | INSERT | `authenticated` + `is_admin()` |
| `charts_update_admin` | UPDATE | `authenticated` + `is_admin()` |
| `charts_delete_admin` | DELETE | `authenticated` + 인라인 `is_admin` 서브쿼리 |

- `uploaded_by uuid` 컬럼 있음 (migration 200000, default `auth.uid()`)
- `chart_path text`·`chart_extra_path text`는 nullable이다. NULL이면 기존 `songChartPath`·`songChartExtraPath`의 `songs/{소문자 song_id}/{소문자 difficulty_label}.json`·`.extra.json`을 쓴다. NULL은 보조 정보 없음 표시가 아니므로, 새 저장에서 보조 정보가 없으면 새 경로에 빈 보조 JSON을 올린다.
- `revision bigint NOT NULL DEFAULT 0`은 저장 충돌 검사에 쓴다. 기존 `offset_ms` 열과 값은 유지하고 새 저장 함수는 이 사본을 쓰지 않는다(migration `20261101000000`).

## 곡·차트 저장 함수 (RFD 0107)

마이그레이션 `20261101000000_song_timing_and_atomic_saves.sql`의 세 함수는 모두 `security definer`, `set search_path = ''`이며, 첫 쓰기 전에 `public.is_admin() is not true`이면 거부한다. 헬퍼는 이 브랜치의 `20260214300000_admin_role.sql`에 정의되어 있고 `auth.uid()`에 해당하는 `public.profiles.is_admin`을 읽으며, 프로필이 없으면 false를 반환한다. 다른 브랜치의 권한 강화 마이그레이션에 의존하지 않는다.

세 함수 모두 `PUBLIC`·`anon`의 EXECUTE를 취소하고 `authenticated`에 부여한다. 로그인 자체는 관리자 권한을 대신하지 않는다. 함수 생성과 권한 설정은 같은 트랜잭션이다. 기존 테이블·Storage RLS 정책은 변경하지 않는다.

```sql
public.save_song(
  p_song_id text, p_expected_revision bigint,
  p_title text, p_artist text, p_jacket_url text, p_audio_url text,
  p_duration numeric, p_preview_url text,
  p_preview_start numeric, p_preview_end numeric,
  p_gameplay_start numeric, p_gameplay_end numeric,
  p_gameplay_fade_in numeric, p_gameplay_fade_out numeric,
  p_timing jsonb
) returns bigint

public.save_chart(
  p_song_id text, p_difficulty_label text, p_expected_revision bigint,
  p_difficulty_level integer, p_chart_path text, p_chart_extra_path text
) returns bigint

public.create_chart(
  p_song_id text, p_difficulty_label text, p_difficulty_level integer,
  p_chart_path text, p_chart_extra_path text
) returns table (chart_id uuid, revision bigint)
```

- 모든 인자는 필수이며 nullable 값도 명시적으로 전달한다. 부분 패치가 아니라 편집 가능한 범위 전체를 교체한다. `save_song`은 곡 ID·생성 시각·업로더를, `save_chart`는 기존 `(song_id, difficulty_label)` 키·ID·생성 시각·업로더를 유지한다. 난이도명은 현재 어댑터처럼 호출자가 소문자로 정규화한다.
- `save_song`·`save_chart`는 UPDATE의 WHERE에 예상 리비전 일치를 포함하고 성공 시 리비전을 1 증가시켜 반환하며 `updated_at`도 갱신한다. NULL 예상 리비전은 기존 행과 일치하지 않으므로 충돌이다. 기존 행·신규 행의 리비전은 0부터 시작하며 기록용 차트 버전과 무관하다.
- `create_chart`는 INSERT만 하며 기존 `(song_id, difficulty_label)` 충돌은 고유 제약 위반으로 실패한다. 생성된 UUID와 리비전 0을 한 행으로 반환한다. 부모 곡이 없으면 기존 FK 제약이 거부한다.
- 함수는 파일을 읽거나 업로드하지 않는다. 호출자는 바뀐 파일을 새 경로로 먼저 업로드한다. 함수 실패 시 DB 행은 이전 상태로 남고 새 파일 정리는 별도 작업이다. 경로 열의 값은 `assets` 버킷 경로이며 공개 URL이 아니다.
- 타이밍 JSON 계약은 `{"bpmChanges":[{"beat":"0","bpm":120}],"timeSignatureChanges":[{"beat":"0","beatPerMeasure":"4"}],"offsetMs":0}`이다. 두 목록은 0박 초기값을 포함한 박 순서이며 `beat`·`beatPerMeasure`는 차트 JSON과 같은 분수 문자열이다. `offsetMs`는 플레이 음원 시작점에서 0박까지의 밀리초다. SQL은 객체 여부만 검사하고 내부 값·TS 타입은 PR2에서 검증한다. SQL NULL은 허용하고 JSON null·배열·스칼라는 거부한다.

클라이언트는 다음 SQLSTATE와 고정 메시지를 함께 매핑할 수 있다. 권한 거부가 행 존재·리비전 검사보다 먼저다.

| 상황 | SQLSTATE | 고정 메시지 또는 제약 |
|------|----------|---------------------|
| 비관리자의 함수 호출 | `42501` | `admin_required` |
| 저장할 곡 없음 | `PT404` | `song_not_found` |
| 곡 리비전 불일치 | `PT409` | `song_revision_conflict` |
| 저장할 차트 없음 | `PT404` | `chart_not_found` |
| 차트 리비전 불일치 | `PT409` | `chart_revision_conflict` |
| Save As의 기존 키 충돌 | `23505` | `charts_song_id_difficulty_label_key` (PostgreSQL 메시지는 고정하지 않음) |
| 객체가 아닌 타이밍 | `23514` | `songs_timing_object` |

`anon`은 함수 본문 진입 전 EXECUTE 권한 검사에서 `42501`로 거부되므로 메시지는 `admin_required`가 아니다. 직접 테이블을 갱신하는 기존 코드·정책은 리비전 증가를 강제하지 않는다. 이 PR은 DB 계약만 추가하며 앱 로더·저장 연결은 후속 PR이다. 연결 전에는 새 경로 저장과 기존 결정적 경로 로더를 함께 사용하지 않는다. 곡 타이밍이 NULL인 행은 후속 로더에서도 차트 JSON으로 폴백한다.

## play_records

| 정책 | 동작 | 조건 |
|------|------|------|
| `play_records_select_own` | SELECT | `auth.uid() = user_id` |
| `play_records_insert_own` | INSERT | `auth.uid() = user_id`, 익명 아님 |

## chart_rankings

| 정책 | 동작 | 조건 |
|------|------|------|
| `chart_rankings_select_all` | SELECT | 모두 허용 |
| `chart_rankings_insert_own` | INSERT | `auth.uid() = user_id`, 익명 아님 |
| `chart_rankings_update_own` | UPDATE | `auth.uid() = user_id`, 익명 아님 |

## user_settings

| 정책 | 동작 | 조건 |
|------|------|------|
| `user_settings_select_own` | SELECT | `auth.uid() = user_id` |
| `user_settings_insert_own` | INSERT | `auth.uid() = user_id`, 익명 아님 |
| `user_settings_update_own` | UPDATE | `auth.uid() = user_id`, 익명 아님 |

## storage.objects (버킷: `assets`)

| 정책 | 동작 | 조건 |
|------|------|------|
| `assets_select_public` | SELECT | `bucket_id = 'assets'` (공개) |
| `assets_insert_songs_admin` | INSERT | `authenticated` + `songs/` 경로 + 인라인 `is_admin` 서브쿼리 |
| `assets_update_songs_admin` | UPDATE | `authenticated` + `songs/` 경로 + 인라인 `is_admin` 서브쿼리 |
| `assets_delete_songs_admin` | DELETE | `authenticated` + `songs/` 경로 + 인라인 `is_admin` 서브쿼리 |

### 주의사항

- Storage 정책에서는 `public.is_admin()` 함수(`security definer`) 대신 **인라인 서브쿼리** 사용
  - `(select is_admin from public.profiles where id = auth.uid())`
  - Storage RLS 컨텍스트에서 `security definer` 함수가 `auth.uid()`를 올바르게 해석하지 못하는 문제 회피
- Storage `upsert: true` 사용 시 INSERT + UPDATE + **SELECT** 정책이 모두 필요
- `is_admin()` 헬퍼 함수는 테이블 RLS에서는 정상 동작
- migration 이력(`supabase_migrations.schema_migrations`)과 실제 정책이 어긋날 수 있다. 300000·500000이 지운 것으로 기록된 `songs_insert_auth`·`charts_insert_auth`·`assets_upload_songs`가 운영 DB에 남아 있는 것을 2026-10-31에 확인해 migration 20261031000000으로 제거했다. 권한을 바꾼 뒤에는 `pg_policies`와 `has_column_privilege`로 실제 상태를 확인한다

## 헬퍼 함수

```sql
public.is_admin() → boolean
-- security definer, search_path = ''
-- profiles.is_admin 컬럼 조회 (auth.uid() 기준)
```
