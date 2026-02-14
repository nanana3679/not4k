-- =============================================================
-- Storage RLS 정책 수정
-- is_admin() security definer 함수가 Storage 컨텍스트에서
-- auth.uid()를 올바르게 해석하지 못하는 문제 해결
-- → 인라인 서브쿼리로 교체
-- SELECT 정책 추가 (Storage 내부 조회에 필요)
-- DELETE 정책 추가 (차트 삭제에 필요)
-- =============================================================

-- 1. 기존 Storage 정책 전부 삭제
drop policy if exists "assets_upload_songs" on storage.objects;
drop policy if exists "assets_upload_songs_admin" on storage.objects;
drop policy if exists "assets_update_songs_admin" on storage.objects;

-- 2. SELECT (공개 — public 버킷)
create policy "assets_select_public"
  on storage.objects for select
  using (bucket_id = 'assets');

-- 3. INSERT (관리자만)
create policy "assets_insert_songs_admin"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'assets'
    and (storage.foldername(name))[1] = 'songs'
    and (select is_admin from public.profiles where id = auth.uid())
  );

-- 4. UPDATE (관리자만 — upsert에 필요)
create policy "assets_update_songs_admin"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'assets'
    and (storage.foldername(name))[1] = 'songs'
    and (select is_admin from public.profiles where id = auth.uid())
  )
  with check (
    bucket_id = 'assets'
    and (storage.foldername(name))[1] = 'songs'
    and (select is_admin from public.profiles where id = auth.uid())
  );

-- 5. DELETE (관리자만 — 차트 삭제에 필요)
create policy "assets_delete_songs_admin"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'assets'
    and (storage.foldername(name))[1] = 'songs'
    and (select is_admin from public.profiles where id = auth.uid())
  );

-- 6. charts DELETE (관리자만)
create policy "charts_delete_admin"
  on charts for delete
  to authenticated
  using ((select is_admin from public.profiles where id = auth.uid()));
