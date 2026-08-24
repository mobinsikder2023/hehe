create extension if not exists pgcrypto;
create table if not exists public.posts(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 source_url text not null, source_label text, headline text not null default '', subheadline text not null default '', caption text not null default '', yellow_phrases jsonb not null default '[]'::jsonb, design jsonb not null default '{}'::jsonb,
 image_url text, poster_path text, poster_url text, created_at timestamptz not null default now()
);
create table if not exists public.share_links(id uuid primary key default gen_random_uuid(),post_id uuid unique not null references public.posts(id) on delete cascade,token text unique not null,created_at timestamptz not null default now());
alter table public.posts enable row level security;
create policy "users read own posts" on public.posts for select using(auth.uid()=user_id);
create policy "users insert own posts" on public.posts for insert with check(auth.uid()=user_id);
create policy "users update own posts" on public.posts for update using(auth.uid()=user_id);
alter table public.share_links enable row level security;
create policy "share links public read" on public.share_links for select using(true);
insert into storage.buckets(id,name,public) values('posters','posters',true) on conflict(id) do nothing;
insert into storage.buckets(id,name,public) values('images','images',true) on conflict(id) do nothing;
