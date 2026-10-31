# Supabase RLS 정책 정리

> Migration 파일 기준 정리. 실제 DB에 적용할 때는 SQL Editor에서 실행.

## profiles

| 정책 | 동작 | 조건 |
|------|------|------|
| `profiles_select_own` | SELECT | `auth.uid() = id` |
| `profiles_update_own` | UPDATE | `auth.uid() = id`, 익명 아님 |

- `is_admin boolean` 컬럼 있음 (migration 300000)
- 클라이언트(`authenticated`)의 UPDATE 권한은 `display_name` 열만 (migration 20261031000000). `is_admin`은 콘솔(service role)에서만 변경
- INSERT는 트리거(`handle_new_user`)로만 수행

## songs

| 정책 | 동작 | 조건 |
|------|------|------|
| `songs_select_all` | SELECT | 모두 허용 |
| `songs_insert_admin` | INSERT | `authenticated` + `is_admin()` |

- `uploaded_by uuid` 컬럼 있음 (migration 200000, default `auth.uid()`)

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
- migration 이력(`supabase_migrations.schema_migrations`)과 실제 정책이 어긋날 수 있다. 2026-10-31에 300000·500000이 지운 것으로 기록된 `songs_insert_auth`·`charts_insert_auth`·`assets_upload_songs`가 운영 DB에 남아 있어 migration 20261031000000으로 제거했다. 권한을 바꾼 뒤에는 `pg_policies`와 `has_column_privilege`로 실제 상태를 확인한다

## 헬퍼 함수

```sql
public.is_admin() → boolean
-- security definer, search_path = ''
-- profiles.is_admin 컬럼 조회 (auth.uid() 기준)
```
