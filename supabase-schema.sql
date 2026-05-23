create table if not exists public.songs (
  id uuid primary key,
  room_code text not null,
  title text not null,
  artist text,
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

create table if not exists public.profiles (
  id text primary key,
  display_name text not null,
  avatar_url text,
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key,
  room_code text not null,
  sender_id text not null,
  sender_name text not null,
  body text not null,
  read_by text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists songs_room_code_idx on public.songs (room_code, created_at desc);
create index if not exists playlists_room_code_idx on public.playlists (room_code, created_at desc);
create index if not exists messages_room_code_idx on public.messages (room_code, created_at asc);

alter table public.songs add column if not exists artist text;

alter table public.songs enable row level security;
alter table public.playlists enable row level security;
alter table public.profiles enable row level security;
alter table public.messages enable row level security;

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

drop policy if exists "Anyone can read profiles" on public.profiles;
create policy "Anyone can read profiles"
on public.profiles for select
using (true);

drop policy if exists "Anyone can add profiles" on public.profiles;
create policy "Anyone can add profiles"
on public.profiles for insert
with check (true);

drop policy if exists "Anyone can update profiles" on public.profiles;
create policy "Anyone can update profiles"
on public.profiles for update
using (true)
with check (true);

drop policy if exists "Anyone can read messages" on public.messages;
create policy "Anyone can read messages"
on public.messages for select
using (true);

drop policy if exists "Anyone can add messages" on public.messages;
create policy "Anyone can add messages"
on public.messages for insert
with check (true);

drop policy if exists "Anyone can update messages" on public.messages;
create policy "Anyone can update messages"
on public.messages for update
using (true)
with check (true);

insert into public.profiles (id, display_name)
values ('shuishui', '水水'), ('zhi', '知')
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('songs', 'songs', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
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

drop policy if exists "Anyone can upload avatars" on storage.objects;
create policy "Anyone can upload avatars"
on storage.objects for insert
with check (bucket_id = 'avatars');

drop policy if exists "Anyone can update avatars" on storage.objects;
create policy "Anyone can update avatars"
on storage.objects for update
using (bucket_id = 'avatars')
with check (bucket_id = 'avatars');

drop policy if exists "Anyone can read avatars" on storage.objects;
create policy "Anyone can read avatars"
on storage.objects for select
using (bucket_id = 'avatars');
