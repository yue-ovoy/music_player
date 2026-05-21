create table if not exists public.songs (
  id uuid primary key,
  room_code text not null,
  title text not null,
  uploader_name text not null default '匿名',
  storage_path text not null,
  public_url text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.playlists (
  id uuid primary key,
  room_code text not null,
  name text not null,
  song_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists songs_room_code_idx on public.songs (room_code, created_at desc);
create index if not exists playlists_room_code_idx on public.playlists (room_code, created_at desc);

alter table public.songs enable row level security;
alter table public.playlists enable row level security;

drop policy if exists "Anyone can read songs by room code" on public.songs;
create policy "Anyone can read songs by room code"
on public.songs for select
using (true);

drop policy if exists "Anyone can add songs" on public.songs;
create policy "Anyone can add songs"
on public.songs for insert
with check (true);

drop policy if exists "Anyone can read playlists by room code" on public.playlists;
create policy "Anyone can read playlists by room code"
on public.playlists for select
using (true);

drop policy if exists "Anyone can add playlists" on public.playlists;
create policy "Anyone can add playlists"
on public.playlists for insert
with check (true);

drop policy if exists "Anyone can update playlists" on public.playlists;
create policy "Anyone can update playlists"
on public.playlists for update
using (true)
with check (true);

drop policy if exists "Anyone can delete songs" on public.songs;
create policy "Anyone can delete songs"
on public.songs for delete
using (true);

drop policy if exists "Anyone can delete playlists" on public.playlists;
create policy "Anyone can delete playlists"
on public.playlists for delete
using (true);

insert into storage.buckets (id, name, public)
values ('songs', 'songs', true)
on conflict (id) do update set public = true;

drop policy if exists "Anyone can upload songs" on storage.objects;
create policy "Anyone can upload songs"
on storage.objects for insert
with check (bucket_id = 'songs');

drop policy if exists "Anyone can read uploaded songs" on storage.objects;
create policy "Anyone can read uploaded songs"
on storage.objects for select
using (bucket_id = 'songs');

drop policy if exists "Anyone can delete uploaded songs" on storage.objects;
create policy "Anyone can delete uploaded songs"
on storage.objects for delete
using (bucket_id = 'songs');
