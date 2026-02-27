-- =============================================================
-- 관리자 DELETE 정책 추가 (songs, charts, storage)
-- =============================================================

-- 1. songs DELETE 정책: 관리자만 허용
create policy "songs_delete_admin"
  on songs for delete
  to authenticated
  using (public.is_admin());

-- 2. charts DELETE 정책: 관리자만 허용
create policy "charts_delete_admin"
  on charts for delete
  to authenticated
  using (public.is_admin());

-- 3. Storage 삭제 정책: 관리자만 허용
create policy "assets_delete_songs_admin"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'assets' and (storage.foldername(name))[1] = 'songs' and public.is_admin());
