-- =============================================================
-- songs DELETE 정책 추가 (관리자만)
-- charts_delete_admin, assets_delete_songs_admin은
-- 20260214500000_fix_storage_policies.sql에서 이미 생성됨
-- =============================================================

create policy "songs_delete_admin"
  on songs for delete
  to authenticated
  using ((select is_admin from public.profiles where id = auth.uid()));
