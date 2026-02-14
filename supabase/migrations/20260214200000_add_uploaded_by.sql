-- =============================================================
-- songs/charts에 uploaded_by 컬럼 추가 + INSERT 정책 강화
-- =============================================================

-- 1. uploaded_by 컬럼 추가 (기본값 auth.uid())
alter table songs add column uploaded_by uuid references auth.users(id) default auth.uid();
alter table charts add column uploaded_by uuid references auth.users(id) default auth.uid();

-- 2. 기존 INSERT 정책 교체 (uploaded_by = auth.uid() 검증)
drop policy if exists "songs_insert_auth" on songs;
create policy "songs_insert_auth"
  on songs for insert
  to authenticated
  with check (uploaded_by = auth.uid());

drop policy if exists "charts_insert_auth" on charts;
create policy "charts_insert_auth"
  on charts for insert
  to authenticated
  with check (uploaded_by = auth.uid());
