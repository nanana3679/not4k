-- =============================================================
-- admin 권한 우회 차단
--
-- 1. profiles 자기 승격
--   기존: authenticated가 profiles의 모든 열에 UPDATE 권한을 갖고,
--     profiles_update_own은 자기 행인지만 확인한다. 로그인한 누구나
--     자기 is_admin을 true로 바꿔 admin 정책을 통과할 수 있었다.
--   변경: 클라이언트 UPDATE는 display_name 열로 제한한다.
--     is_admin은 콘솔(service role)에서만 바꾼다.
--
-- 2. 남아 있던 옛 쓰기 정책
--   migration 300000·500000이 지운 것으로 기록된 정책 3개가
--   운영 DB에 남아 있었다(2026-10-31 pg_policies로 확인).
--   정책은 OR로 합쳐지므로 로그인만 하면 곡·차트 행 추가와
--   Storage songs/ 업로드가 가능했다. admin 정책은 그대로 둔다.
--
-- 운영 DB에는 2026-10-31에 같은 SQL을 먼저 적용했다.
-- 모든 문장이 멱등이라 다시 실행해도 결과가 같다.
-- =============================================================

revoke update on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

drop policy if exists "songs_insert_auth" on public.songs;
drop policy if exists "charts_insert_auth" on public.charts;
drop policy if exists "assets_upload_songs" on storage.objects;
