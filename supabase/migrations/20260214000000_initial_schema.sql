-- =============================================================
-- Initial Schema Migration
-- 테이블: profiles, songs, charts, play_records, chart_rankings, user_settings
-- + RLS 정책 + 트리거
-- =============================================================

-- ---------------------
-- 1. profiles
-- ---------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "profiles_select_own"
  on profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on profiles for update
  using (auth.uid() = id and (auth.jwt()->>'is_anonymous')::boolean is distinct from true)
  with check (auth.uid() = id);

-- INSERT는 트리거로만 수행 (직접 INSERT 불가)
-- DELETE 불가 (정책 없음)

-- ---------------------
-- 2. songs
-- ---------------------
create table songs (
  id text primary key,
  title text not null,
  artist text not null,
  audio_url text not null,        -- Storage 경로: songs/{id}/audio.ogg
  preview_url text,               -- Storage 경로: songs/{id}/preview.ogg
  jacket_url text,                -- Storage 경로: songs/{id}/jacket.jpg
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table songs enable row level security;

create policy "songs_select_all"
  on songs for select
  using (true);

-- INSERT/UPDATE/DELETE는 service_role 키로만 가능 (관리자)

-- ---------------------
-- 3. charts
-- ---------------------
create table charts (
  id uuid primary key default gen_random_uuid(),
  song_id text not null references songs(id) on delete cascade,
  difficulty_label text not null,
  difficulty_level integer not null,
  offset_ms integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(song_id, difficulty_label)
);

alter table charts enable row level security;

create policy "charts_select_all"
  on charts for select
  using (true);

-- INSERT/UPDATE/DELETE는 service_role 키로만 가능 (관리자)

-- ---------------------
-- 4. play_records
-- ---------------------
create table play_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  chart_id uuid not null references charts(id) on delete cascade,
  achievement_rate numeric(5,2) not null,
  rank text not null,
  is_full_combo boolean not null default false,
  perfect_count integer not null default 0,
  great_count integer not null default 0,
  good_count integer not null default 0,
  good_trill_count integer not null default 0,
  bad_count integer not null default 0,
  miss_count integer not null default 0,
  max_combo integer not null default 0,
  played_at timestamptz default now(),
  created_at timestamptz default now()
);

create index idx_play_records_user_chart
  on play_records(user_id, chart_id, achievement_rate desc);

alter table play_records enable row level security;

create policy "play_records_select_own"
  on play_records for select
  using (auth.uid() = user_id);

create policy "play_records_insert_own"
  on play_records for insert
  with check (
    auth.uid() = user_id
    and (auth.jwt()->>'is_anonymous')::boolean is distinct from true
  );

-- UPDATE/DELETE 불가 (정책 없음)

-- ---------------------
-- 5. chart_rankings
-- ---------------------
create table chart_rankings (
  chart_id uuid not null references charts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  best_achievement_rate numeric(5,2) not null,
  best_rank text not null,
  best_record_id uuid references play_records(id),
  updated_at timestamptz default now(),
  primary key (chart_id, user_id)
);

create index idx_chart_rankings_rate
  on chart_rankings(chart_id, best_achievement_rate desc);

alter table chart_rankings enable row level security;

create policy "chart_rankings_select_all"
  on chart_rankings for select
  using (true);

create policy "chart_rankings_insert_own"
  on chart_rankings for insert
  with check (
    auth.uid() = user_id
    and (auth.jwt()->>'is_anonymous')::boolean is distinct from true
  );

create policy "chart_rankings_update_own"
  on chart_rankings for update
  using (
    auth.uid() = user_id
    and (auth.jwt()->>'is_anonymous')::boolean is distinct from true
  )
  with check (auth.uid() = user_id);

-- DELETE 불가 (정책 없음)

-- ---------------------
-- 6. user_settings
-- ---------------------
create table user_settings (
  user_id uuid primary key references profiles(id) on delete cascade,
  settings jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table user_settings enable row level security;

create policy "user_settings_select_own"
  on user_settings for select
  using (auth.uid() = user_id);

create policy "user_settings_insert_own"
  on user_settings for insert
  with check (
    auth.uid() = user_id
    and (auth.jwt()->>'is_anonymous')::boolean is distinct from true
  );

create policy "user_settings_update_own"
  on user_settings for update
  using (
    auth.uid() = user_id
    and (auth.jwt()->>'is_anonymous')::boolean is distinct from true
  )
  with check (auth.uid() = user_id);

-- DELETE 불가 (정책 없음)

-- =============================================================
-- 트리거
-- =============================================================

-- ---------------------
-- 트리거 1: Auth 유저 생성 시 profiles 자동 삽입
-- ---------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function handle_new_user();

-- ---------------------
-- 트리거 2: play_records INSERT 시 chart_rankings UPSERT
-- ---------------------
create or replace function handle_new_play_record()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.chart_rankings (chart_id, user_id, best_achievement_rate, best_rank, best_record_id, updated_at)
  values (new.chart_id, new.user_id, new.achievement_rate, new.rank, new.id, now())
  on conflict (chart_id, user_id) do update set
    best_achievement_rate = excluded.best_achievement_rate,
    best_rank = excluded.best_rank,
    best_record_id = excluded.best_record_id,
    updated_at = now()
  where excluded.best_achievement_rate > public.chart_rankings.best_achievement_rate;
  return new;
end;
$$;

create trigger on_play_record_inserted
  after insert on public.play_records
  for each row
  execute function handle_new_play_record();
