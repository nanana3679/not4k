-- =============================================================
-- 에디터 UPDATE 정책 — 차트 저장 (덮어쓰기) 허용
-- =============================================================

-- charts UPDATE 허용 (관리자만)
create policy "charts_update_admin"
  on charts for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Storage assets 파일 덮어쓰기 허용 (관리자만, songs/ 경로)
create policy "assets_update_songs_admin"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'assets' and (storage.foldername(name))[1] = 'songs' and public.is_admin());
