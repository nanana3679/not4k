-- =============================================================
-- 관리자 역할 추가 + songs/charts/storage INSERT 정책 강화
-- =============================================================

-- 1. profiles에 is_admin 컬럼 추가
alter table profiles add column is_admin boolean not null default false;

-- 2. 관리자 여부 확인 헬퍼 함수
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

-- 3. songs INSERT 정책: 관리자만 허용
drop policy if exists "songs_insert_auth" on songs;
create policy "songs_insert_admin"
  on songs for insert
  to authenticated
  with check (public.is_admin());

-- 4. charts INSERT 정책: 관리자만 허용
drop policy if exists "charts_insert_auth" on charts;
create policy "charts_insert_admin"
  on charts for insert
  to authenticated
  with check (public.is_admin());

-- 5. Storage 업로드 정책: 관리자만 허용
drop policy if exists "assets_upload_songs" on storage.objects;
create policy "assets_upload_songs_admin"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'assets' and (storage.foldername(name))[1] = 'songs' and public.is_admin());
