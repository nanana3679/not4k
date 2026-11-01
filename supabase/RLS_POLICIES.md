# Supabase RLS 정책 정리

> Migration 파일 기준 정리. 실제 DB에 적용할 때는 SQL Editor에서 실행.

## profiles

| 정책 | 동작 | 조건 |
|------|------|------|
| `profiles_select_own` | SELECT | `auth.uid() = id` |
| `profiles_update_own` | UPDATE | `auth.uid() = id`, 익명 아님 |

- `is_admin boolean` 컬럼 있음 (migration 300000)
- 클라이언트(`authenticated`)의 UPDATE 권한은 `display_name` 열만 (migration 20261031000000). `is_admin`은 대시보드·SQL Editor처럼 DB 소유자(`postgres`)나 `service_role` 권한으로만 변경
- `display_name`은 `NOT NULL`이며 `profiles_display_name_format` CHECK로 1～16자와 `^[[:alnum:]]+$`를 검사한다(migration 20261031100000). 운영 PostgreSQL 17.6 / ICU `en_US.UTF-8`에서는 한글·CJK·라틴 문자·아라비아 인도 숫자를 허용하고 공백·밑줄·이모지·위 첨자 숫자·로마 숫자는 거부한다(2026-10-31 읽기 전용 확인). 한글 채움 문자 U+115F·U+1160·U+3164·U+FFA0는 `[[:alnum:]]`을 통과하지만 빈칸으로 보이므로 같은 CHECK가 따로 거부한다. 사용자가 직접 정한 닉네임은 중복을 허용한다
- `first_linked_at timestamptz`가 `null`이면 첫 연동 전이다. 본인 행 SELECT로 읽을 수 있지만 클라이언트가 직접 UPDATE할 수 없다
- `first_link_guest_nickname text`는 첫 연동에서 받은 기기의 `^Guest[0-9]{6}$` 형식 닉네임을 저장한다. 다른 프로필과 충돌해 계정에 다른 닉네임을 배정해도 받은 값을 보관한다. 첫 연동 전, 형식에 맞지 않는 값으로 첫 연동한 경우, 첫 연동 전에 직접 닉네임을 바꾼 경우에는 `null`이다. 본인 행 SELECT로 읽을 수 있지만 클라이언트가 직접 UPDATE할 수 없다
- INSERT는 트리거(`handle_new_user`)로만 수행한다. Google 실명 대신 기존 닉네임과 겹치지 않는 `Guest` + 6자리 숫자를 생성하고 `first_linked_at`과 `first_link_guest_nickname`은 모두 `null`로 시작한다. migration 20261031100000은 기존 계정도 같은 첫 연동 전 상태로 초기화한다
- `link_guest_nickname(guest_nickname text)` RPC는 클라이언트 역할 중 `authenticated`만 실행할 수 있다(`PUBLIC`·`anon`의 EXECUTE 회수). `service_role`도 Supabase 기본 권한으로 EXECUTE를 가지지만 JWT에 `sub`가 없어 `42501`로 실패한다. `auth.uid()`가 없거나 JWT의 `is_anonymous`가 `true`이면 `42501`로 거부한다. 본인 프로필이 없으면 `P0002`로 실패한다
  - 반환값은 한 행의 `(nickname text, first_link boolean, first_link_guest_nickname text)`이다. 첫 연동에서만 `^Guest[0-9]{6}$` 형식이고 다른 프로필과 겹치지 않는 기기의 이름을 인계한다. 형식이 맞지 않거나 겹치면 서버가 새 Guest 닉네임을 생성한다. 닉네임과 `first_linked_at = now()`, 형식에 맞는 입력값(아니면 `null`)인 `first_link_guest_nickname`을 함께 저장하고 `(저장한 닉네임, true, 저장한 기기 닉네임 또는 null)`을 반환한다
  - 첫 연동 전 계정만 `generate_guest_nickname()`과 같은 advisory lock을 잡은 뒤 본인 행을 `FOR NO KEY UPDATE`로 잠그고 다시 읽는다. 이 행 잠금은 `play_records`·`chart_rankings`·`user_settings` INSERT의 외래 키 검사가 거는 `FOR KEY SHARE`와 충돌하지 않는다. 잠금을 기다리는 동안 다른 세션이 첫 연동을 마쳤으면 아래의 이미 연동한 계정과 같이 응답한다
  - 이미 첫 연동을 마쳤거나 직접 닉네임을 바꾼 계정은 advisory lock과 행 잠금 없이 본인 행을 읽고, 아무것도 갱신하지 않고 `(현재 닉네임, false, 저장된 first_link_guest_nickname)`을 반환한다. 클라이언트는 `first_linked_at`을 `null`로 되돌릴 수 없으므로 잠금 없이 읽어도 이 판정은 바뀌지 않는다. 재호출의 입력값이나 이후 수동 닉네임 변경은 저장된 `first_link_guest_nickname`을 바꾸지 않는다. 클라이언트는 첫 연동 커밋 후 응답이 유실되어도 재호출로 원래 받은 기기 닉네임을 확인할 수 있으며, 현재 닉네임과의 일치 여부에 의존하지 않는다
- `generate_guest_nickname()`은 `security definer` 내부 함수이며 `PUBLIC`·`anon`·`authenticated`의 EXECUTE를 모두 회수하므로 클라이언트는 호출할 수 없다. 생성과 첫 연동은 같은 트랜잭션 advisory lock을 사용하며, 생성은 최대 100번 시도한 뒤 실패한다. 사용자 지정 닉네임 전체의 고유성을 강제하지는 않는다
- BEFORE UPDATE 트리거 `on_profile_updated`는 `security invoker` 함수 `handle_profile_update()`로 항상 `updated_at = now()`를 설정한다. `display_name`이 실제로 바뀌고 변경 전과 변경 후의 `first_linked_at`이 모두 `null`이면 함께 `now()`로 설정하고 `first_link_guest_nickname`은 `null`로 남겨 이후 첫 연동 RPC가 선택한 이름을 덮어쓰지 않게 한다
  - DB 소유자(`postgres`)나 `service_role`이 첫 연동을 마친 계정의 `display_name`을 바꾸면서 `first_linked_at = null`로 되돌리면 트리거가 시각을 다시 설정하지 않아 계정은 첫 연동 전 상태로 남고, 다음 `link_guest_nickname` 호출을 다시 첫 연동으로 처리한다. 이때 `first_link_guest_nickname`도 직접 `null`로 되돌려야 한다. 아직 첫 연동 전인 계정의 이름을 바꾸면 트리거가 수동 변경으로 보고 시각을 찍으므로, 여러 계정을 한꺼번에 초기화할 때는 이름을 바꾸는 UPDATE와 `first_linked_at`·`first_link_guest_nickname`을 `null`로 되돌리는 UPDATE를 나눠 실행한다
- `profiles_update_own`만으로는 자기 `is_admin` 변경을 막지 못한다. PR [#396](https://github.com/nanana3679/not4k/pull/396)의 `20261031000000_block_admin_privilege_bypass.sql`이 `anon`·`authenticated`의 테이블 UPDATE를 회수하고 `authenticated`에는 `display_name` 열 UPDATE만 허용한다. 운영에는 2026-10-31 적용되었고 main에는 2026-11-01 머지되었다(85652549).

## songs

| 정책 | 동작 | 조건 |
|------|------|------|
| `songs_select_all` | SELECT | 모두 허용 |
| `songs_insert_admin` | INSERT | `authenticated` + `is_admin()` |
| `songs_delete_admin` | DELETE | `authenticated` + 인라인 `is_admin` 서브쿼리 |

- `uploaded_by uuid` 컬럼 있음 (migration 200000, default `auth.uid()`)
- UPDATE 정책이 없다. 클라이언트의 `songs` UPDATE는 오류 없이 0행을 바꾼다
- `songs_delete_admin`은 `authenticated` + 인라인 `is_admin` 서브쿼리로 DELETE를 허용한다(migration `20260227100000`). `20260706000000_restrict_song_delete.sql`의 FK RESTRICT는 차트가 남아 있을 때만 삭제를 막는다. 차트를 모두 지우면 곡을 삭제하고 같은 text ID로 다시 INSERT할 수 있다.
- 에디터 Save·Save As(RFD 0107 PR4a)는 변경된 곡을 `save_song`으로 먼저 저장하며, 기존 차트 저장의 직접 UPDATE는 제거했다. `save_song`은 관리자 확인 뒤 `security definer`로 RLS를 우회하며, UPDATE 정책을 추가하지 않는다.
- `timing jsonb`는 곡 공통 타이밍의 정본이며 SQL NULL은 미이행 상태다. `revision bigint NOT NULL DEFAULT nextval('public.song_revision_seq'::regclass)`는 저장 충돌 검사에 쓴다(migration `20261101000000`). 기존 행·신규 행·`save_song` 모두 같은 비순환 시퀀스를 사용해 삭제·재등록 시 과거 리비전을 재사용하지 않는다. 시퀀스는 이 열에 소속되며 `authenticated`·`service_role`에는 USAGE만 부여해 INSERT 기본값은 허용하고 `setval`은 막는다.

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

마이그레이션 `20261101000000_song_timing_and_atomic_saves.sql`의 세 함수는 모두 `security definer`, `set search_path = ''`이며, 첫 쓰기 전에 `public.is_admin() is not true`이면 거부한다. 헬퍼는 이 브랜치의 `20260214300000_admin_role.sql`에 정의되어 있고 `auth.uid()`에 해당하는 `public.profiles.is_admin`을 읽으며, 프로필이 없으면 false를 반환한다.

**필수 선행 조건: PR [#396](https://github.com/nanana3679/not4k/pull/396)의 `20261031000000_block_admin_privilege_bypass.sql`을 먼저 적용해야 한다.** 초기 스키마의 자기 행 UPDATE 정책과 Supabase 기본 테이블 권한만으로는 일반 사용자가 자기 `is_admin`을 true로 바꾼 뒤 세 함수를 실행할 수 있다. #396은 운영에 2026-10-31 적용되었지만, 새 환경에는 시간순으로 별도 적용해야 하며 보호가 없는 환경에 이 저장 마이그레이션을 적용해서는 안 된다. 이 브랜치의 마이그레이션만 실행하는 검증은 이 보안 의존성을 검증하지 않는다.

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
  p_chart_id uuid, p_expected_revision bigint,
  p_difficulty_level integer, p_chart_path text, p_chart_extra_path text
) returns bigint

public.create_chart(
  p_song_id text, p_difficulty_label text, p_difficulty_level integer,
  p_chart_path text, p_chart_extra_path text
) returns table (chart_id uuid, revision bigint)
```

- 모든 인자는 필수이며 nullable 값도 명시적으로 전달한다. 부분 패치가 아니라 편집 가능한 범위 전체를 교체한다. `save_song`은 곡 ID·생성 시각·업로더를, `save_chart`는 UUID로 찾은 행의 `(song_id, difficulty_label)`·ID·생성 시각·업로더를 유지한다. `save_chart`는 곡·난이도명을 인자로 받지 않으며 Save As는 `create_chart`를 사용한다. 생성 시 난이도명은 현재 어댑터처럼 호출자가 소문자로 정규화한다.
- `save_song`·`save_chart`는 UPDATE의 WHERE에 예상 리비전 일치를 포함하고 성공 시 새 리비전을 반환하며 `updated_at`도 갱신한다. NULL 예상 리비전은 기존 행과 일치하지 않으므로 충돌이다. 곡 리비전은 1부터 발급하는 공유 시퀀스 값이며 다른 곡의 저장·실패한 트랜잭션 때문에 결번이 생길 수 있다. 호출자는 다음 값을 계산하지 말고 반환값을 보관한다. 차트 리비전은 기존 행·신규 행 모두 0부터 시작하고 저장마다 1 증가한다. 두 리비전 모두 기록용 차트 버전과 무관하다.
- 차트를 삭제하고 같은 `(song_id, difficulty_label)`로 다시 생성해도 UUID가 달라 옛 UUID의 저장은 `PT404/chart_not_found`다. 곡은 같은 text ID로 재생성하더라도 시퀀스가 과거 리비전을 재사용하지 않으므로 옛 리비전의 저장은 `PT409/song_revision_conflict`다. 별도 곡 UUID나 추가 RPC 인자 없이 기존 곡 API를 유지한다.
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

`anon`은 함수 본문 진입 전 EXECUTE 권한 검사에서 `42501`로 거부되므로 메시지는 `admin_required`가 아니다. 직접 테이블을 갱신하는 기존 코드·정책은 리비전 증가를 강제하지 않는다. 곡 INSERT는 리비전 기본값을 사용해야 하며, 관리자 SQL로 과거 리비전·차트 UUID를 명시적으로 재사용하거나 시퀀스를 초기화하는 작업은 이 충돌 보호의 계약 밖이다. 이 PR은 DB 계약만 추가하며 앱 로더·저장 연결은 후속 PR이다. 연결 전에는 새 경로 저장과 기존 결정적 경로 로더를 함께 사용하지 않는다. 곡 타이밍이 NULL인 행은 후속 로더에서도 차트 JSON으로 폴백한다.

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
