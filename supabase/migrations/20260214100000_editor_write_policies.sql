-- =============================================================
-- Editor Write Policies
-- songs/charts INSERT (authenticated) + Storage assets 업로드 허용
-- =============================================================

-- songs INSERT 허용 (인증된 사용자만)
create policy "songs_insert_auth"
  on songs for insert
  to authenticated
  with check (auth.uid() is not null);

-- charts INSERT 허용 (인증된 사용자만)
create policy "charts_insert_auth"
  on charts for insert
  to authenticated
  with check (auth.uid() is not null);

-- Storage assets 버킷 생성 (이미 있으면 무시)
insert into storage.buckets (id, name, public)
  values ('assets', 'assets', true)
  on conflict (id) do nothing;

-- Storage assets 버킷 songs/ 경로 업로드 허용 (인증된 사용자만)
create policy "assets_upload_songs"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'assets' and (storage.foldername(name))[1] = 'songs');
