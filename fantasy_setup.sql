-- GTO Racing League Fantasy League secure backend
-- Run this once in the Supabase SQL Editor as the postgres role.
-- Before running: replace SET_A_PRIVATE_ADMIN_CODE with a private code you will save.

create extension if not exists pgcrypto;

create table if not exists public.fantasy_settings (
  id boolean primary key default true check (id),
  timezone text not null default 'America/New_York',
  open_day smallint not null default 1 check (open_day between 0 and 6),
  open_time time not null default time '08:00',
  lock_day smallint not null default 0 check (lock_day between 0 and 6),
  lock_time time not null default time '20:00',
  standings_weight numeric(5,4) not null default .5000 check (standings_weight between 0 and 1),
  prediction_weight numeric(5,4) not null default .5000 check (prediction_weight between 0 and 1),
  previous_standings_through_round smallint not null default 3 check (previous_standings_through_round >= 0),
  season_drops smallint not null default 3 check (season_drops >= 0),
  consecutive_driver_restriction boolean not null default true,
  finishing_scale jsonb not null default '{"1":25,"2":20,"3":16,"4":13,"5":11,"6":10,"7":9,"8":8,"9":7,"10":6,"11":5,"12":4,"13":3,"14":2,"15":1}'::jsonb,
  fantasy_championship_scale jsonb not null default '{"1":25,"2":20,"3":16,"4":13,"5":11,"6":10,"7":9,"8":8,"9":7,"10":6,"11":5,"12":4,"13":3,"14":2,"15":1}'::jsonb,
  bonuses jsonb not null default '{"win":3,"podium":2,"pole":2,"fastest_lap":2,"led_a_lap":1,"most_laps_led":3,"gain_3_to_5":2,"gain_6_to_9":4,"gain_10_plus":6}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.fantasy_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.fantasy_admin_config (
  id boolean primary key default true check (id),
  admin_code_hash text not null,
  updated_at timestamptz not null default now()
);
insert into public.fantasy_admin_config (id, admin_code_hash)
values (true, encode(digest('SET_A_PRIVATE_ADMIN_CODE', 'sha256'), 'hex'))
on conflict (id) do nothing;

create table if not exists public.fantasy_players (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 2 and 24),
  normalized_name text generated always as (lower(display_name)) stored,
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_reason text
);
create unique index if not exists fantasy_players_unique_name on public.fantasy_players (normalized_name);

create table if not exists public.fantasy_player_devices (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.fantasy_players(id) on delete cascade,
  token_hash text not null unique,
  label text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.fantasy_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.fantasy_players(id) on delete cascade,
  code_hash text not null unique,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  reset_at timestamptz
);

create table if not exists public.fantasy_admin_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create table if not exists public.fantasy_rounds (
  id uuid primary key default gen_random_uuid(),
  season_id text not null,
  race_index integer not null check (race_index >= 0),
  race_name text not null,
  race_label text,
  status text not null default 'not_open' check (status in ('not_open','open','locked','awaiting_results','scored','canceled')),
  opens_at timestamptz,
  locks_at timestamptz,
  standings_source text not null default 'previous_season' check (standings_source in ('previous_season','current_season','custom')),
  tier_snapshot_at timestamptz,
  results_finalized_at timestamptz,
  canceled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, race_index)
);

create table if not exists public.fantasy_driver_tiers (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.fantasy_rounds(id) on delete cascade,
  driver_name text not null,
  tier smallint not null check (tier between 1 and 3),
  championship_position integer,
  standings_strength numeric(6,3) not null,
  prediction_odds text,
  prediction_strength numeric(6,3) not null,
  tier_rating numeric(6,3) not null,
  entered boolean not null default true,
  source jsonb not null default '{}'::jsonb,
  manual_override boolean not null default false,
  created_at timestamptz not null default now(),
  unique (round_id, driver_name)
);

create table if not exists public.fantasy_lineups (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.fantasy_rounds(id) on delete cascade,
  player_id uuid not null references public.fantasy_players(id) on delete cascade,
  original_submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  admin_corrected_at timestamptz,
  admin_correction_reason text,
  unique (round_id, player_id)
);

create table if not exists public.fantasy_lineup_drivers (
  lineup_id uuid not null references public.fantasy_lineups(id) on delete cascade,
  tier smallint not null check (tier between 1 and 3),
  driver_name text not null,
  primary key (lineup_id, tier),
  unique (lineup_id, driver_name)
);

create table if not exists public.fantasy_driver_scores (
  round_id uuid not null references public.fantasy_rounds(id) on delete cascade,
  driver_name text not null,
  finishing_position integer,
  official_race_points integer not null default 0,
  qualifying_position integer,
  laps_led integer not null default 0,
  finish_points integer not null default 0,
  win_bonus integer not null default 0,
  podium_bonus integer not null default 0,
  pole_bonus integer not null default 0,
  fastest_lap_bonus integer not null default 0,
  led_a_lap_bonus integer not null default 0,
  most_laps_led_bonus integer not null default 0,
  movement_bonus integer not null default 0,
  total_score integer not null default 0,
  source jsonb not null default '{}'::jsonb,
  primary key (round_id, driver_name)
);

create table if not exists public.fantasy_week_scores (
  round_id uuid not null references public.fantasy_rounds(id) on delete cascade,
  player_id uuid not null references public.fantasy_players(id) on delete cascade,
  raw_score integer not null,
  weekly_rank integer,
  championship_points integer,
  tiebreak jsonb not null default '{}'::jsonb,
  scored_at timestamptz not null default now(),
  primary key (round_id, player_id)
);

create table if not exists public.fantasy_audit_log (
  id bigint generated always as identity primary key,
  action text not null,
  actor_player_id uuid references public.fantasy_players(id) on delete set null,
  round_id uuid references public.fantasy_rounds(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.fantasy_hash(value text)
returns text language sql immutable as $$ select encode(digest(value, 'sha256'), 'hex') $$;

create or replace function public.fantasy_device_player(device_token text)
returns uuid language sql stable security definer set search_path = public as $$
  select d.player_id from public.fantasy_player_devices d
  join public.fantasy_players p on p.id = d.player_id
  where d.token_hash = public.fantasy_hash(device_token)
    and d.revoked_at is null and p.status = 'active'
  limit 1
$$;

create or replace function public.fantasy_validate_name(display_name text)
returns text language plpgsql immutable as $$
declare cleaned text := btrim(display_name); lowered text;
begin
  if cleaned !~ '^[A-Za-z0-9 _-]{2,24}$' then raise exception 'Display names must use 2–24 letters, numbers, spaces, hyphens, or underscores.'; end if;
  lowered := lower(cleaned);
  if lowered ~ '(admin|moderator|supabase|gto staff|offensive|slur)' then raise exception 'That display name is not available.'; end if;
  return cleaned;
end $$;

create or replace function public.fantasy_register_player(display_name text, device_token text, recovery_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare player_id uuid; cleaned text;
begin
  if coalesce(length(device_token), 0) < 24 then raise exception 'Invalid device token.'; end if;
  if coalesce(length(recovery_code), 0) < 12 then raise exception 'Invalid recovery code.'; end if;
  cleaned := public.fantasy_validate_name(display_name);
  insert into public.fantasy_players (display_name) values (cleaned) returning id into player_id;
  insert into public.fantasy_player_devices (player_id, token_hash) values (player_id, public.fantasy_hash(device_token));
  insert into public.fantasy_recovery_codes (player_id, code_hash) values (player_id, public.fantasy_hash(recovery_code));
  insert into public.fantasy_audit_log (action, actor_player_id, payload) values ('player_registered', player_id, jsonb_build_object('display_name', cleaned));
  return jsonb_build_object('player_id', player_id, 'display_name', cleaned);
exception when unique_violation then raise exception 'That display name is already in use.';
end $$;

create or replace function public.fantasy_get_account(device_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare player public.fantasy_players%rowtype;
begin
  select p.* into player from public.fantasy_players p where p.id = public.fantasy_device_player(device_token);
  if player.id is null then return null; end if;
  update public.fantasy_player_devices set last_seen_at = now() where player_id = player.id and token_hash = public.fantasy_hash(device_token);
  return jsonb_build_object('id', player.id, 'display_name', player.display_name, 'created_at', player.created_at);
end $$;

create or replace function public.fantasy_recover_account(recovery_code text, device_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare player public.fantasy_players%rowtype;
begin
  if coalesce(length(device_token), 0) < 24 then raise exception 'Invalid device token.'; end if;
  select p.* into player from public.fantasy_players p join public.fantasy_recovery_codes r on r.player_id = p.id
  where r.code_hash = public.fantasy_hash(recovery_code) and r.reset_at is null and p.status = 'active' limit 1;
  if player.id is null then raise exception 'Recovery code was not recognized.'; end if;
  insert into public.fantasy_player_devices (player_id, token_hash) values (player.id, public.fantasy_hash(device_token));
  insert into public.fantasy_audit_log (action, actor_player_id) values ('account_recovered', player.id);
  return jsonb_build_object('player_id', player.id, 'display_name', player.display_name);
exception when unique_violation then raise exception 'This device is already connected to a Fantasy League account.';
end $$;

create or replace function public.fantasy_public_rounds()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'season_id', r.season_id, 'race_index', r.race_index, 'race_name', r.race_name, 'race_label', r.race_label, 'status', r.status, 'opens_at', r.opens_at, 'locks_at', r.locks_at, 'standings_source', r.standings_source, 'tier_snapshot_at', r.tier_snapshot_at) order by r.season_id, r.race_index), '[]'::jsonb) from public.fantasy_rounds r
$$;

create or replace function public.fantasy_public_tiers(round_uuid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('driver_name', t.driver_name, 'tier', t.tier, 'championship_position', t.championship_position, 'standings_strength', t.standings_strength, 'prediction_odds', t.prediction_odds, 'prediction_strength', t.prediction_strength, 'tier_rating', t.tier_rating, 'entered', t.entered, 'source', t.source) order by t.tier, t.tier_rating desc, t.driver_name), '[]'::jsonb) from public.fantasy_driver_tiers t where t.round_id = round_uuid and t.entered
$$;

create or replace function public.fantasy_my_lineup(device_token text, round_uuid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_build_object('id', l.id, 'original_submitted_at', l.original_submitted_at, 'updated_at', l.updated_at, 'drivers', (select jsonb_agg(jsonb_build_object('tier', d.tier, 'driver_name', d.driver_name) order by d.tier) from public.fantasy_lineup_drivers d where d.lineup_id = l.id)), null)
  from public.fantasy_lineups l where l.round_id = round_uuid and l.player_id = public.fantasy_device_player(device_token)
$$;

create or replace function public.fantasy_save_lineup(device_token text, round_uuid uuid, selections jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare player_uuid uuid; line_uuid uuid; selected_count integer; tier_count integer; duplicate_count integer; conflict_count integer; round_record public.fantasy_rounds%rowtype;
begin
  player_uuid := public.fantasy_device_player(device_token);
  if player_uuid is null then raise exception 'Sign in to your Fantasy League profile first.'; end if;
  select * into round_record from public.fantasy_rounds where id = round_uuid for update;
  if round_record.id is null then raise exception 'Fantasy round not found.'; end if;
  if round_record.status <> 'open' or now() < round_record.opens_at or now() >= round_record.locks_at then raise exception 'This Fantasy League round is not open for submissions.'; end if;
  if jsonb_typeof(selections) <> 'array' then raise exception 'A lineup must contain three driver selections.'; end if;
  select count(*), count(distinct (item->>'tier')::int), count(distinct item->>'driver_name') into selected_count, tier_count, duplicate_count from jsonb_array_elements(selections) item;
  if selected_count <> 3 or tier_count <> 3 or duplicate_count <> 3 then raise exception 'Select exactly one unique driver from each tier.'; end if;
  if exists (select 1 from jsonb_array_elements(selections) item where (item->>'tier')::int not in (1,2,3)) then raise exception 'Invalid tier selection.'; end if;
  if exists (select 1 from jsonb_array_elements(selections) item left join public.fantasy_driver_tiers t on t.round_id = round_uuid and t.driver_name = item->>'driver_name' and t.tier = (item->>'tier')::int where t.id is null or not t.entered) then raise exception 'Every selected driver must be entered and assigned to the selected tier.'; end if;
  select count(*) into conflict_count from jsonb_array_elements(selections) item where exists (
    select 1 from public.fantasy_lineups previous_lineup join public.fantasy_lineup_drivers previous_driver on previous_driver.lineup_id = previous_lineup.id join public.fantasy_rounds previous_round on previous_round.id = previous_lineup.round_id
    where previous_lineup.player_id = player_uuid and previous_round.season_id = round_record.season_id and previous_round.race_index = round_record.race_index - 1 and previous_driver.driver_name = item->>'driver_name'
  );
  if conflict_count > 0 then raise exception 'A driver from your immediately previous submitted lineup is unavailable this round.'; end if;
  insert into public.fantasy_lineups (round_id, player_id) values (round_uuid, player_uuid) on conflict (round_id, player_id) do update set updated_at = now() returning id into line_uuid;
  delete from public.fantasy_lineup_drivers where lineup_id = line_uuid;
  insert into public.fantasy_lineup_drivers (lineup_id, tier, driver_name) select line_uuid, (item->>'tier')::int, item->>'driver_name' from jsonb_array_elements(selections) item;
  insert into public.fantasy_audit_log (action, actor_player_id, round_id, payload) values ('lineup_saved', player_uuid, round_uuid, selections);
  return public.fantasy_my_lineup(device_token, round_uuid);
end $$;

create or replace function public.fantasy_public_standings(season text)
returns jsonb language sql stable security definer set search_path = public as $$
  with scores as (
    select w.player_id, sum(w.championship_points) as raw_points, count(*) as rounds_entered, avg(w.raw_score) as average_raw_score, max(w.raw_score) as best_weekly_score, count(*) filter (where w.weekly_rank = 1) as weekly_wins,
      array_agg(w.championship_points order by w.championship_points asc, w.round_id) filter (where w.championship_points is not null) as point_values
    from public.fantasy_week_scores w join public.fantasy_rounds r on r.id = w.round_id where r.season_id = season and r.status = 'scored' group by w.player_id
  ), ranked as (
    select s.*, coalesce((select sum(value) from unnest(s.point_values[1:greatest(cardinality(s.point_values) - (select season_drops from public.fantasy_settings where id))]) value), 0) as counting_points from scores s
  )
  select coalesce(jsonb_agg(jsonb_build_object('player_id', p.id, 'display_name', p.display_name, 'counting_points', r.counting_points, 'raw_points', r.raw_points, 'weekly_wins', r.weekly_wins, 'rounds_entered', r.rounds_entered, 'average_raw_score', round(r.average_raw_score, 2), 'best_weekly_score', r.best_weekly_score) order by r.counting_points desc, r.raw_points desc, p.display_name), '[]'::jsonb)
  from ranked r join public.fantasy_players p on p.id = r.player_id where p.status = 'active'
$$;

create or replace function public.fantasy_admin_login(admin_code text, session_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if (select admin_code_hash from public.fantasy_admin_config where id) <> public.fantasy_hash(admin_code) then raise exception 'Admin access denied.'; end if;
  if coalesce(length(session_token), 0) < 24 then raise exception 'Invalid administrator session.'; end if;
  insert into public.fantasy_admin_sessions (token_hash, expires_at) values (public.fantasy_hash(session_token), now() + interval '8 hours') on conflict (token_hash) do update set expires_at = now() + interval '8 hours', revoked_at = null;
  return jsonb_build_object('expires_at', now() + interval '8 hours');
end $$;

create or replace function public.fantasy_admin_authorized(session_token text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.fantasy_admin_sessions where token_hash = public.fantasy_hash(session_token) and revoked_at is null and expires_at > now())
$$;

create or replace function public.fantasy_admin_save_round(session_token text, payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare saved public.fantasy_rounds%rowtype;
begin
  if not public.fantasy_admin_authorized(session_token) then raise exception 'Administrator access required.'; end if;
  insert into public.fantasy_rounds (season_id, race_index, race_name, race_label, status, opens_at, locks_at, standings_source)
  values (payload->>'season_id', (payload->>'race_index')::int, payload->>'race_name', payload->>'race_label', coalesce(payload->>'status','not_open'), nullif(payload->>'opens_at','')::timestamptz, nullif(payload->>'locks_at','')::timestamptz, coalesce(payload->>'standings_source','previous_season'))
  on conflict (season_id, race_index) do update set race_name = excluded.race_name, race_label = excluded.race_label, status = excluded.status, opens_at = excluded.opens_at, locks_at = excluded.locks_at, standings_source = excluded.standings_source, updated_at = now()
  returning * into saved;
  insert into public.fantasy_audit_log (action, round_id, payload) values ('round_saved', saved.id, payload);
  return to_jsonb(saved);
end $$;

create or replace function public.fantasy_admin_save_tiers(session_token text, round_uuid uuid, tiers jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare round_record public.fantasy_rounds%rowtype;
begin
  if not public.fantasy_admin_authorized(session_token) then raise exception 'Administrator access required.'; end if;
  select * into round_record from public.fantasy_rounds where id = round_uuid for update;
  if round_record.id is null then raise exception 'Fantasy round not found.'; end if;
  if round_record.status <> 'not_open' then raise exception 'Tiers are locked after submissions open. Reopen the round with an audit reason to make changes.'; end if;
  delete from public.fantasy_driver_tiers where round_id = round_uuid;
  insert into public.fantasy_driver_tiers (round_id, driver_name, tier, championship_position, standings_strength, prediction_odds, prediction_strength, tier_rating, entered, source, manual_override)
  select round_uuid, item->>'driver_name', (item->>'tier')::int, nullif(item->>'championship_position','')::int, (item->>'standings_strength')::numeric, item->>'prediction_odds', (item->>'prediction_strength')::numeric, (item->>'tier_rating')::numeric, coalesce((item->>'entered')::boolean, true), coalesce(item->'source','{}'::jsonb), coalesce((item->>'manual_override')::boolean, false)
  from jsonb_array_elements(tiers) item;
  update public.fantasy_rounds set tier_snapshot_at = now(), updated_at = now() where id = round_uuid;
  insert into public.fantasy_audit_log (action, round_id, payload) values ('tiers_saved', round_uuid, jsonb_build_object('count', jsonb_array_length(tiers)));
  return public.fantasy_public_tiers(round_uuid);
end $$;

alter table public.fantasy_settings enable row level security;
alter table public.fantasy_admin_config enable row level security;
alter table public.fantasy_players enable row level security;
alter table public.fantasy_player_devices enable row level security;
alter table public.fantasy_recovery_codes enable row level security;
alter table public.fantasy_admin_sessions enable row level security;
alter table public.fantasy_rounds enable row level security;
alter table public.fantasy_driver_tiers enable row level security;
alter table public.fantasy_lineups enable row level security;
alter table public.fantasy_lineup_drivers enable row level security;
alter table public.fantasy_driver_scores enable row level security;
alter table public.fantasy_week_scores enable row level security;
alter table public.fantasy_audit_log enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant execute on function public.fantasy_register_player(text, text, text) to anon, authenticated;
grant execute on function public.fantasy_get_account(text) to anon, authenticated;
grant execute on function public.fantasy_recover_account(text, text) to anon, authenticated;
grant execute on function public.fantasy_public_rounds() to anon, authenticated;
grant execute on function public.fantasy_public_tiers(uuid) to anon, authenticated;
grant execute on function public.fantasy_my_lineup(text, uuid) to anon, authenticated;
grant execute on function public.fantasy_save_lineup(text, uuid, jsonb) to anon, authenticated;
grant execute on function public.fantasy_public_standings(text) to anon, authenticated;
grant execute on function public.fantasy_admin_login(text, text) to anon, authenticated;
grant execute on function public.fantasy_admin_save_round(text, jsonb) to anon, authenticated;
grant execute on function public.fantasy_admin_save_tiers(text, uuid, jsonb) to anon, authenticated;

-- Confirm setup after running:
select 'Fantasy League secure backend is ready.' as result;
