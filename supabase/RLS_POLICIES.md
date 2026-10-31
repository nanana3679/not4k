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

## songs

| 정책 | 동작 | 조건 |
|------|------|------|
| `songs_select_all` | SELECT | 모두 허용 |
| `songs_insert_admin` | INSERT | `authenticated` + `is_admin()` |
| `songs_delete_admin` | DELETE | `authenticated` + 인라인 `is_admin` 서브쿼리 |

- `uploaded_by uuid` 컬럼 있음 (migration 200000, default `auth.uid()`)
- UPDATE 정책이 없다. 클라이언트의 `songs` UPDATE는 오류 없이 0행을 바꾼다

## charts

| 정책 | 동작 | 조건 |
|------|------|------|
| `charts_select_all` | SELECT | 모두 허용 |
| `charts_insert_admin` | INSERT | `authenticated` + `is_admin()` |
| `charts_update_admin` | UPDATE | `authenticated` + `is_admin()` |
| `charts_delete_admin` | DELETE | `authenticated` + 인라인 `is_admin` 서브쿼리 |

- `uploaded_by uuid` 컬럼 있음 (migration 200000, default `auth.uid()`)

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
