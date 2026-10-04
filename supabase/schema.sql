-- Схема для облачной синхронизации «Наизусть».
-- Выполните целиком в Supabase: SQL Editor -> New query -> Run.
-- Скрипт можно запускать повторно.

create table if not exists public.texts (
  user_id            uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  uid                uuid   not null,
  title              text   not null,
  content            text   not null,
  created_at         bigint not null,
  level              int    not null,
  level_points       int    not null,
  level_changed_at   bigint not null,
  last_level_up_at   bigint,
  next_review_at     bigint not null,
  updated_at         bigint not null,
  deleted_at         bigint,
  server_updated_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, uid)
);

create table if not exists public.attempts (
  user_id            uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  uid                uuid   not null,
  text_uid           uuid   not null,
  exercise           text   not null,
  difficulty         int    not null,
  score              int    not null,
  points             int    not null,
  created_at         bigint not null,
  server_updated_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, uid)
);

create index if not exists texts_sync_idx    on public.texts    (user_id, server_updated_at);
create index if not exists attempts_sync_idx on public.attempts (user_id, server_updated_at);
create index if not exists attempts_text_idx on public.attempts (user_id, text_uid);

-- Время изменения по часам сервера (по нему клиенты забирают новые записи).
-- Для текстов дополнительно: более старая версия не затирает более новую.
create or replace function public.texts_before_write() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return old;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end $$;

create or replace function public.touch_server_time() returns trigger
language plpgsql as $$
begin
  new.server_updated_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists texts_before_write on public.texts;
create trigger texts_before_write before insert or update on public.texts
  for each row execute function public.texts_before_write();

drop trigger if exists attempts_touch on public.attempts;
create trigger attempts_touch before insert or update on public.attempts
  for each row execute function public.touch_server_time();

-- Безопасность: каждый пользователь видит и меняет только свои строки.
alter table public.texts    enable row level security;
alter table public.attempts enable row level security;

drop policy if exists "texts: own rows"    on public.texts;
drop policy if exists "attempts: own rows" on public.attempts;

create policy "texts: own rows" on public.texts
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "attempts: own rows" on public.attempts
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
