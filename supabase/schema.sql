-- =====================================================================
-- Nightcap: Watch Together  |  Supabase / PostgreSQL schema
-- Run this whole file once in Supabase SQL Editor (it is idempotent-ish:
-- run on a fresh project).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

do $$ begin
  create type public.room_role as enum ('owner', 'cohost', 'moderator', 'member');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text check (char_length(display_name) <= 40),
  avatar_url text check (avatar_url is null or avatar_url ~ '^https://'),
  bio text check (char_length(bio) <= 200),
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base text;
  candidate text;
begin
  base := lower(regexp_replace(
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1), 'user'),
    '[^a-zA-Z0-9_]', '', 'g'));
  if char_length(base) < 3 then base := base || 'user'; end if;
  base := left(base, 18);
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    candidate := base || (floor(random() * 90000 + 10000)::int)::text;
  end loop;
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    candidate,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', candidate), 40),
    case when (new.raw_user_meta_data ->> 'avatar_url') like 'https://%'
         then new.raw_user_meta_data ->> 'avatar_url' end
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Rooms
-- ---------------------------------------------------------------------
create table if not exists public.rooms (
  id text primary key,
  name text not null check (char_length(name) between 1 and 60),
  avatar_url text check (avatar_url is null or avatar_url ~ '^https://'),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  is_public boolean not null default false,
  has_password boolean not null default false,
  everyone_can_control boolean not null default false,
  source_type text not null default 'none'
    check (source_type in ('none', 'youtube', 'html5', 'hls', 'iframe', 'netflix')),
  source_url text check (source_url is null or char_length(source_url) <= 2048),
  source_title text check (source_title is null or char_length(source_title) <= 200),
  is_playing boolean not null default false,
  position double precision not null default 0,
  playback_rate double precision not null default 1,
  state_updated_at timestamptz not null default now(),
  state_version bigint not null default 0,
  countdown_at timestamptz,
  created_at timestamptz not null default now(),
  last_activity timestamptz not null default now()
);
create index if not exists rooms_public_activity on public.rooms (is_public, last_activity desc);

-- Password hashes live in their own table with NO client policies.
create table if not exists public.room_secrets (
  room_id text primary key references public.rooms (id) on delete cascade,
  password_hash text not null
);

create table if not exists public.room_members (
  room_id text not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.room_role not null default 'member',
  joined_at timestamptz not null default now(),
  last_active timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists room_members_user on public.room_members (user_id, last_active desc);

create table if not exists public.room_bans (
  room_id text not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  banned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.join_attempts (
  id bigint generated always as identity primary key,
  room_id text not null,
  user_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists join_attempts_lookup on public.join_attempts (user_id, room_id, created_at);

-- ---------------------------------------------------------------------
-- Chat
-- ---------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null default '' check (char_length(content) <= 1000),
  gif_url text check (gif_url is null or gif_url ~ '^https://(media[0-9]*|i)\.giphy\.com/'),
  reply_to uuid references public.messages (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid,
  created_at timestamptz not null default now(),
  check (char_length(content) > 0 or gif_url is not null or deleted_at is not null)
);
create index if not exists messages_room_time on public.messages (room_id, created_at desc);

create table if not exists public.message_reactions (
  room_id text not null references public.rooms (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

-- ---------------------------------------------------------------------
-- Social
-- ---------------------------------------------------------------------
create table if not exists public.friendships (
  requester uuid not null references public.profiles (id) on delete cascade,
  addressee uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);

create table if not exists public.blocks (
  blocker uuid not null references public.profiles (id) on delete cascade,
  blocked uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null references public.profiles (id) on delete cascade,
  reported_user uuid references public.profiles (id) on delete set null,
  room_id text references public.rooms (id) on delete set null,
  message_id uuid references public.messages (id) on delete set null,
  reason text not null check (char_length(reason) between 3 and 500),
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender uuid not null references public.profiles (id) on delete cascade,
  recipient uuid not null references public.profiles (id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists dm_pair on public.direct_messages (sender, recipient, created_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}',
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user on public.notifications (user_id, created_at desc);

create table if not exists public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  room_id text not null references public.rooms (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, room_id)
);

create table if not exists public.watch_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  room_id text references public.rooms (id) on delete set null,
  source_type text not null,
  source_url text not null,
  title text,
  watched_at timestamptz not null default now()
);
create index if not exists watch_history_user on public.watch_history (user_id, watched_at desc);

-- ---------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------
create or replace function public.is_room_member(p_room text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from room_members where room_id = p_room and user_id = auth.uid());
$$;

create or replace function public.room_role_of(p_room text, p_user uuid)
returns public.room_role language sql stable security definer set search_path = public as $$
  select role from room_members where room_id = p_room and user_id = p_user;
$$;

create or replace function public.role_rank(r public.room_role)
returns int language sql immutable as $$
  select case r when 'owner' then 4 when 'cohost' then 3 when 'moderator' then 2 else 1 end;
$$;

create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a));
$$;

create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from friendships
    where status = 'accepted'
      and ((requester = a and addressee = b) or (requester = b and addressee = a))
  );
$$;

create or replace function public.server_time()
returns timestamptz language sql stable as $$ select now(); $$;

-- ---------------------------------------------------------------------
-- Room RPCs (all writes to rooms/room_members go through these)
-- ---------------------------------------------------------------------
create or replace function public.create_room(
  p_name text, p_is_public boolean, p_password text default null, p_avatar_url text default null
) returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := auth.uid();
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea;
  new_id text;
  i int;
begin
  if uid is null then raise exception 'Sign in to create a room'; end if;
  if char_length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Give your room a name'; end if;
  if (select count(*) from rooms where owner_id = uid and created_at > now() - interval '1 hour') >= 15 then
    raise exception 'You created a lot of rooms recently. Try again in an hour.';
  end if;
  if p_password is not null and char_length(p_password) > 0 and char_length(p_password) < 4 then
    raise exception 'Room passwords need at least 4 characters';
  end if;

  loop
    bytes := gen_random_bytes(8);
    new_id := '';
    for i in 0..7 loop
      new_id := new_id || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1);
    end loop;
    exit when not exists (select 1 from rooms where id = new_id);
  end loop;

  insert into rooms (id, name, owner_id, is_public, avatar_url, has_password)
  values (new_id, left(trim(p_name), 60), uid, coalesce(p_is_public, false),
          nullif(p_avatar_url, ''), coalesce(char_length(p_password), 0) > 0);

  if coalesce(char_length(p_password), 0) > 0 then
    insert into room_secrets (room_id, password_hash) values (new_id, crypt(p_password, gen_salt('bf')));
  end if;

  insert into room_members (room_id, user_id, role) values (new_id, uid, 'owner');
  return new_id;
end $$;

create or replace function public.room_preview(p_room text)
returns table (id text, name text, avatar_url text, is_public boolean, has_password boolean,
               member_count bigint, owner_username text, source_title text, is_member boolean)
language sql stable security definer set search_path = public as $$
  select r.id, r.name, r.avatar_url, r.is_public, r.has_password,
         (select count(*) from room_members m where m.room_id = r.id),
         p.username, r.source_title,
         exists (select 1 from room_members m where m.room_id = r.id and m.user_id = auth.uid())
  from rooms r join profiles p on p.id = r.owner_id
  where r.id = upper(p_room);
$$;

create or replace function public.join_room(p_room text, p_password text default null)
returns public.room_role language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := auth.uid();
  r rooms;
  existing public.room_role;
  secret text;
begin
  if uid is null then raise exception 'Sign in to join a room'; end if;
  select * into r from rooms where id = upper(p_room);
  if not found then raise exception 'No room with that ID. Check the code and try again.'; end if;

  if exists (select 1 from room_bans where room_id = r.id and user_id = uid) then
    raise exception 'You were removed from this room by a moderator';
  end if;

  existing := room_role_of(r.id, uid);
  if existing is not null then return existing; end if;

  if r.has_password then
    if (select count(*) from join_attempts
        where user_id = uid and room_id = r.id and created_at > now() - interval '10 minutes') >= 5 then
      raise exception 'Too many wrong passwords. Wait 10 minutes and try again.';
    end if;
    select password_hash into secret from room_secrets where room_id = r.id;
    if p_password is null or secret is null or crypt(p_password, secret) <> secret then
      insert into join_attempts (room_id, user_id) values (r.id, uid);
      raise exception 'Wrong room password';
    end if;
  end if;

  insert into room_members (room_id, user_id, role) values (r.id, uid, 'member');
  update rooms set last_activity = now() where id = r.id;
  return 'member';
end $$;

create or replace function public.leave_room(p_room text)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  my_role public.room_role := room_role_of(p_room, uid);
  heir uuid;
begin
  if my_role is null then return; end if;
  if my_role = 'owner' then
    select user_id into heir from room_members
    where room_id = p_room and user_id <> uid
    order by role_rank(role) desc, joined_at asc limit 1;
    if heir is null then
      delete from rooms where id = p_room;  -- last person out closes the room
      return;
    end if;
    update room_members set role = 'owner' where room_id = p_room and user_id = heir;
    update rooms set owner_id = heir where id = p_room;
  end if;
  delete from room_members where room_id = p_room and user_id = uid;
end $$;

create or replace function public.update_playback(
  p_room text,
  p_is_playing boolean,
  p_position double precision,
  p_rate double precision default 1,
  p_sent_at timestamptz default null,
  p_source_type text default null,
  p_source_url text default null,
  p_source_title text default null
) returns public.rooms language plpgsql security definer set search_path = public as $$
declare
  r rooms;
  my_role public.room_role := room_role_of(p_room, auth.uid());
  pos double precision := greatest(0, coalesce(p_position, 0));
  lag double precision;
begin
  select * into r from rooms where id = p_room for update;
  if not found then raise exception 'Room not found'; end if;
  if my_role is null then raise exception 'Join the room first'; end if;
  if not (my_role in ('owner', 'cohost') or r.everyone_can_control) then
    raise exception 'Only the host and co-hosts can control playback';
  end if;
  if pos > 172800 then raise exception 'Invalid position'; end if;
  if p_rate is null or p_rate < 0.25 or p_rate > 2 then raise exception 'Invalid playback rate'; end if;
  if p_source_type is not null and p_source_type not in ('none', 'youtube', 'html5', 'hls', 'iframe', 'netflix') then
    raise exception 'Unsupported source';
  end if;
  if p_source_url is not null and p_source_url !~ '^https://' then
    raise exception 'Only https links are supported';
  end if;

  -- Compensate for the one-way network delay of the request (bounded to 3s).
  if p_is_playing and p_sent_at is not null then
    lag := extract(epoch from (now() - p_sent_at));
    if lag > 0 and lag < 3 then pos := pos + lag * p_rate; end if;
  end if;

  update rooms set
    is_playing = coalesce(p_is_playing, false),
    position = pos,
    playback_rate = p_rate,
    source_type = coalesce(p_source_type, source_type),
    source_url = case when p_source_type is not null then p_source_url else source_url end,
    source_title = case when p_source_type is not null then left(p_source_title, 200) else source_title end,
    state_updated_at = now(),
    state_version = state_version + 1,
    countdown_at = null,
    last_activity = now()
  where id = p_room
  returning * into r;
  return r;
end $$;

-- Countdown: playback is scheduled to start at a future server time, so every
-- client starts at the same instant without another round trip.
create or replace function public.start_countdown(p_room text, p_seconds int default 5)
returns public.rooms language plpgsql security definer set search_path = public as $$
declare
  r rooms;
  my_role public.room_role := room_role_of(p_room, auth.uid());
  secs int := least(greatest(coalesce(p_seconds, 5), 3), 10);
begin
  select * into r from rooms where id = p_room for update;
  if my_role is null or not (my_role in ('owner', 'cohost') or r.everyone_can_control) then
    raise exception 'Only the host and co-hosts can start a countdown';
  end if;
  if r.source_type = 'none' then raise exception 'Pick something to watch first'; end if;
  update rooms set
    is_playing = true,
    position = case when r.is_playing
      then r.position + extract(epoch from (now() - r.state_updated_at)) * r.playback_rate
      else r.position end,
    state_updated_at = now() + make_interval(secs => secs),
    countdown_at = now() + make_interval(secs => secs),
    state_version = state_version + 1,
    last_activity = now()
  where id = p_room returning * into r;
  return r;
end $$;

create or replace function public.update_room_settings(
  p_room text, p_name text, p_is_public boolean, p_everyone_can_control boolean,
  p_avatar_url text default null, p_password text default null, p_clear_password boolean default false
) returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if coalesce(room_role_of(p_room, auth.uid())::text, '') not in ('owner', 'cohost') then
    raise exception 'Only the host and co-hosts can change room settings';
  end if;
  update rooms set
    name = left(trim(p_name), 60),
    is_public = p_is_public,
    everyone_can_control = p_everyone_can_control,
    avatar_url = coalesce(nullif(p_avatar_url, ''), avatar_url)
  where id = p_room;
  if p_clear_password then
    delete from room_secrets where room_id = p_room;
    update rooms set has_password = false where id = p_room;
  elsif p_password is not null and char_length(p_password) >= 4 then
    insert into room_secrets (room_id, password_hash) values (p_room, crypt(p_password, gen_salt('bf')))
    on conflict (room_id) do update set password_hash = excluded.password_hash;
    update rooms set has_password = true where id = p_room;
  end if;
end $$;

create or replace function public.set_member_role(p_room text, p_user uuid, p_role public.room_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if room_role_of(p_room, auth.uid()) is distinct from 'owner' then
    raise exception 'Only the room owner can change roles';
  end if;
  if p_role = 'owner' then raise exception 'Use host transfer to hand over the room'; end if;
  if p_user = auth.uid() then raise exception 'You cannot change your own role'; end if;
  update room_members set role = p_role where room_id = p_room and user_id = p_user;
  if not found then raise exception 'That person is not in the room'; end if;
  insert into notifications (user_id, type, payload)
  values (p_user, 'role_changed', jsonb_build_object('room_id', p_room, 'role', p_role));
end $$;

create or replace function public.transfer_host(p_room text, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if room_role_of(p_room, auth.uid()) is distinct from 'owner' then
    raise exception 'Only the room owner can transfer host';
  end if;
  if room_role_of(p_room, p_user) is null then raise exception 'That person is not in the room'; end if;
  update room_members set role = 'cohost' where room_id = p_room and user_id = auth.uid();
  update room_members set role = 'owner' where room_id = p_room and user_id = p_user;
  update rooms set owner_id = p_user where id = p_room;
  insert into notifications (user_id, type, payload)
  values (p_user, 'host_transferred', jsonb_build_object('room_id', p_room));
end $$;

create or replace function public.kick_member(p_room text, p_user uuid, p_ban boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  me public.room_role := room_role_of(p_room, auth.uid());
  them public.room_role := room_role_of(p_room, p_user);
begin
  if me is null or me = 'member' then raise exception 'Only moderators can remove people'; end if;
  if them is null then raise exception 'That person is not in the room'; end if;
  if role_rank(them) >= role_rank(me) then raise exception 'You cannot remove someone with an equal or higher role'; end if;
  delete from room_members where room_id = p_room and user_id = p_user;
  if p_ban then
    insert into room_bans (room_id, user_id, banned_by) values (p_room, p_user, auth.uid())
    on conflict do nothing;
  end if;
end $$;

create or replace function public.delete_message(p_message uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m messages;
  me public.room_role;
begin
  select * into m from messages where id = p_message;
  if not found then raise exception 'Message not found'; end if;
  me := room_role_of(m.room_id, auth.uid());
  if me is null then raise exception 'Not in this room'; end if;
  if m.user_id <> auth.uid() and role_rank(me) < 2 then
    raise exception 'Only moderators can remove other people''s messages';
  end if;
  update messages set content = '', gif_url = null, deleted_at = now(), deleted_by = auth.uid()
  where id = p_message;
end $$;

create or replace function public.invite_friend(p_room text, p_friend uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  if not is_room_member(p_room) then raise exception 'Join the room first'; end if;
  if not are_friends(auth.uid(), p_friend) then raise exception 'You can only invite friends'; end if;
  select * into r from rooms where id = p_room;
  insert into notifications (user_id, type, payload)
  values (p_friend, 'room_invite', jsonb_build_object(
    'room_id', p_room, 'room_name', r.name, 'from', auth.uid(),
    'from_username', (select username from profiles where id = auth.uid())));
end $$;

create or replace function public.touch_presence(p_room text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update profiles set last_seen = now() where id = auth.uid();
  if p_room is not null then
    update room_members set last_active = now() where room_id = p_room and user_id = auth.uid();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Triggers: spam protection, DM integrity, notifications
-- ---------------------------------------------------------------------
create or replace function public.messages_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from messages
      where user_id = new.user_id and room_id = new.room_id and created_at > now() - interval '10 seconds') >= 8 then
    raise exception 'You are sending messages too fast. Wait a few seconds.';
  end if;
  if new.reply_to is not null and not exists (
    select 1 from messages where id = new.reply_to and room_id = new.room_id) then
    raise exception 'Reply target is not in this room';
  end if;
  new.deleted_at := null;
  new.deleted_by := null;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists messages_guard on public.messages;
create trigger messages_guard before insert on public.messages for each row execute function public.messages_guard();

create or replace function public.dm_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.content <> old.content or new.sender <> old.sender or new.recipient <> old.recipient then
      raise exception 'Messages cannot be edited';
    end if;
    return new;
  end if;
  if (select count(*) from direct_messages
      where sender = new.sender and created_at > now() - interval '10 seconds') >= 10 then
    raise exception 'You are sending messages too fast.';
  end if;
  insert into notifications (user_id, type, payload)
  values (new.recipient, 'dm', jsonb_build_object(
    'from', new.sender, 'from_username', (select username from profiles where id = new.sender),
    'preview', left(new.content, 80)));
  return new;
end $$;
drop trigger if exists dm_guard on public.direct_messages;
create trigger dm_guard before insert or update on public.direct_messages for each row execute function public.dm_guard();

create or replace function public.friendship_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into notifications (user_id, type, payload)
    values (new.addressee, 'friend_request', jsonb_build_object(
      'from', new.requester, 'from_username', (select username from profiles where id = new.requester)));
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status <> 'accepted' then
    insert into notifications (user_id, type, payload)
    values (new.requester, 'friend_accepted', jsonb_build_object(
      'from', new.addressee, 'from_username', (select username from profiles where id = new.addressee)));
  end if;
  return new;
end $$;
drop trigger if exists friendship_notify on public.friendships;
create trigger friendship_notify after insert or update on public.friendships
  for each row execute function public.friendship_notify();

create or replace function public.friendship_update_guard()
returns trigger language plpgsql as $$
begin
  if new.requester <> old.requester or new.addressee <> old.addressee then
    raise exception 'Cannot change friendship participants';
  end if;
  return new;
end $$;
drop trigger if exists friendship_update_guard on public.friendships;
create trigger friendship_update_guard before update on public.friendships
  for each row execute function public.friendship_update_guard();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_secrets enable row level security;
alter table public.room_members enable row level security;
alter table public.room_bans enable row level security;
alter table public.join_attempts enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.friendships enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.direct_messages enable row level security;
alter table public.notifications enable row level security;
alter table public.favorites enable row level security;
alter table public.watch_history enable row level security;

create policy "profiles readable by signed-in users" on public.profiles
  for select to authenticated using (true);
create policy "users update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "public rooms or member rooms are visible" on public.rooms
  for select to authenticated using (is_public or public.is_room_member(id));
create policy "anon sees public rooms" on public.rooms
  for select to anon using (is_public);
create policy "owner deletes room" on public.rooms
  for delete to authenticated using (owner_id = auth.uid());

create policy "members see members" on public.room_members
  for select to authenticated using (public.is_room_member(room_id) or user_id = auth.uid());

create policy "moderators see bans" on public.room_bans
  for select to authenticated using (public.role_rank(public.room_role_of(room_id, auth.uid())) >= 2);

create policy "members read messages" on public.messages
  for select to authenticated using (public.is_room_member(room_id));
create policy "members send messages" on public.messages
  for insert to authenticated with check (user_id = auth.uid() and public.is_room_member(room_id));

create policy "members read reactions" on public.message_reactions
  for select to authenticated using (public.is_room_member(room_id));
create policy "members add own reactions" on public.message_reactions
  for insert to authenticated with check (
    user_id = auth.uid() and public.is_room_member(room_id)
    and exists (select 1 from public.messages m
                where m.id = message_reactions.message_id and m.room_id = message_reactions.room_id));
create policy "members remove own reactions" on public.message_reactions
  for delete to authenticated using (user_id = auth.uid());

create policy "see own friendships" on public.friendships
  for select to authenticated using (auth.uid() in (requester, addressee));
create policy "send friend requests" on public.friendships
  for insert to authenticated with check (
    requester = auth.uid() and status = 'pending' and not public.is_blocked_between(requester, addressee));
create policy "addressee accepts" on public.friendships
  for update to authenticated using (addressee = auth.uid()) with check (addressee = auth.uid());
create policy "either side removes" on public.friendships
  for delete to authenticated using (auth.uid() in (requester, addressee));

create policy "own blocks" on public.blocks
  for all to authenticated using (blocker = auth.uid()) with check (blocker = auth.uid());

create policy "file reports" on public.reports
  for insert to authenticated with check (reporter = auth.uid());
create policy "see own reports" on public.reports
  for select to authenticated using (reporter = auth.uid());

create policy "dm participants read" on public.direct_messages
  for select to authenticated using (auth.uid() in (sender, recipient));
create policy "friends send dms" on public.direct_messages
  for insert to authenticated with check (
    sender = auth.uid() and public.are_friends(sender, recipient)
    and not public.is_blocked_between(sender, recipient));
create policy "recipient marks read" on public.direct_messages
  for update to authenticated using (recipient = auth.uid()) with check (recipient = auth.uid());

create policy "own notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "update own notifications" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own notifications" on public.notifications
  for delete to authenticated using (user_id = auth.uid());

create policy "own favorites" on public.favorites
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own history read" on public.watch_history
  for select to authenticated using (user_id = auth.uid());
create policy "own history write" on public.watch_history
  for insert to authenticated with check (user_id = auth.uid());
create policy "own history delete" on public.watch_history
  for delete to authenticated using (user_id = auth.uid());

-- Function execute grants
revoke execute on all functions in schema public from anon;
grant execute on function public.room_preview(text) to anon, authenticated;
grant execute on function public.server_time() to anon, authenticated;

-- ---------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table
  public.rooms, public.room_members, public.messages, public.message_reactions,
  public.direct_messages, public.notifications, public.friendships;

-- Private broadcast/presence channels "room:<ID>" are restricted to members.
create policy "room members receive room channel" on realtime.messages
  for select to authenticated
  using (realtime.topic() like 'room:%' and public.is_room_member(split_part(realtime.topic(), ':', 2)));
create policy "room members send on room channel" on realtime.messages
  for insert to authenticated
  with check (realtime.topic() like 'room:%' and public.is_room_member(split_part(realtime.topic(), ':', 2)));

-- ---------------------------------------------------------------------
-- Storage: public avatars bucket, users write only inside their own folder
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "avatar images are public" on storage.objects
  for select using (bucket_id = 'avatars');
create policy "users upload own avatars" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users update own avatars" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users delete own avatars" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
