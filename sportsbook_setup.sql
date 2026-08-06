-- GTO Sportsbook: fictional GTO Credits only.
-- Run once in Supabase SQL Editor AFTER the three Fantasy League scripts.
-- This reuses the existing Fantasy League device hashing and administrator session.

-- The catalog is the server-side source of truth for the driver selector.  It
-- prevents a modified browser request from linking a made-up driver name and
-- bypassing the no-self-betting rule.  The shared Sportsbook Admin session can
-- sync future official drivers from the website without changing any profile.
create table if not exists public.sportsbook_driver_catalog (
  driver_name text primary key,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.sportsbook_driver_catalog(driver_name) values
  ('Austin'), ('Bard Wurton'), ('Braxton Marshall'), ('Colin Mckevitt'),
  ('Cross Alberti'), ('Dante Quarato'), ('David Pinkston'), ('Gavyn Morrison'),
  ('Ike Klockman'), ('Jack Mckevitt'), ('Javin Tucker'), ('Landon Beech'),
  ('Nick Collier'), ('Peter Braxton'), ('Rashad Metze'), ('Reji'),
  ('Trevor Levine'), ('YattMan'), ('Zay Smitty')
on conflict (driver_name) do update set active = true, updated_at = now();

create table if not exists public.sportsbook_profiles (
  id uuid primary key default gen_random_uuid(),
  fantasy_player_id uuid references public.fantasy_players(id) on delete set null,
  display_name text not null check (char_length(display_name) between 2 and 24),
  normalized_name text generated always as (lower(display_name)) stored,
  profile_type text not null check (profile_type in ('driver','spectator')),
  linked_driver_name text,
  starting_balance integer not null default 500 check (starting_balance = 500),
  current_balance integer not null default 500 check (current_balance >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((profile_type = 'driver' and linked_driver_name is not null and length(btrim(linked_driver_name)) > 0) or (profile_type = 'spectator' and linked_driver_name is null))
);
create unique index if not exists sportsbook_profiles_unique_name on public.sportsbook_profiles(normalized_name);

create table if not exists public.sportsbook_profile_devices (
  id uuid primary key default gen_random_uuid(),
  sportsbook_profile_id uuid not null references public.sportsbook_profiles(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.sportsbook_device_claims (
  id uuid primary key default gen_random_uuid(),
  claim_code text not null unique,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  claimed_at timestamptz
);

create table if not exists public.sportsbook_markets (
  id uuid primary key default gen_random_uuid(),
  season_id text not null,
  round_index integer,
  event_key text not null,
  market_type text not null check (market_type in ('race_winner','podium','top_five','head_to_head','pole','champion','most_wins','most_podiums','group_high_finish')),
  market_name text not null,
  status text not null default 'open' check (status in ('open','suspended','closed','settled','voided')),
  opens_at timestamptz,
  closes_at timestamptz,
  prediction_version text,
  settlement_result jsonb not null default '{}'::jsonb,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(season_id, event_key, market_type)
);

create table if not exists public.sportsbook_selections (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.sportsbook_markets(id) on delete cascade,
  selection_key text not null,
  driver_name text,
  opponent_driver_name text,
  display_label text not null,
  probability numeric(10,8) not null check (probability > 0 and probability < 1),
  american_odds integer not null check (american_odds <> 0),
  outcome_group text not null,
  nested_group text,
  active boolean not null default true,
  source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(market_id, selection_key)
);
create index if not exists sportsbook_selections_market on public.sportsbook_selections(market_id);

create table if not exists public.sportsbook_parlay_prices (
  id uuid primary key default gen_random_uuid(),
  selection_signature text not null unique,
  selection_ids jsonb not null,
  combined_probability numeric(12,10) not null check (combined_probability > 0 and combined_probability < 1),
  combined_american_odds integer not null check (combined_american_odds <> 0),
  source text not null default 'simulation',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.sportsbook_wagers (
  id uuid primary key default gen_random_uuid(),
  public_reference text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  sportsbook_profile_id uuid not null references public.sportsbook_profiles(id) on delete restrict,
  wager_type text not null check (wager_type in ('straight','parlay')),
  stake integer not null check (stake > 0),
  locked_combined_probability numeric(12,10) not null,
  locked_american_odds integer not null check (locked_american_odds <> 0),
  potential_profit numeric(12,4) not null,
  potential_return numeric(12,4) not null,
  status text not null default 'pending' check (status in ('pending','won','lost','voided','canceled')),
  client_request_id text not null,
  placed_at timestamptz not null default now(),
  settled_at timestamptz,
  settlement_version integer not null default 0,
  net_profit numeric(12,4),
  settled_return numeric(12,4) not null default 0,
  unique(sportsbook_profile_id, client_request_id)
);
create index if not exists sportsbook_wagers_profile on public.sportsbook_wagers(sportsbook_profile_id, placed_at desc);

create table if not exists public.sportsbook_wager_legs (
  id uuid primary key default gen_random_uuid(),
  wager_id uuid not null references public.sportsbook_wagers(id) on delete cascade,
  market_id uuid not null references public.sportsbook_markets(id) on delete restrict,
  selection_id uuid not null references public.sportsbook_selections(id) on delete restrict,
  locked_probability numeric(10,8) not null,
  locked_american_odds integer not null check (locked_american_odds <> 0),
  leg_status text not null default 'pending' check (leg_status in ('pending','won','lost','voided')),
  unique(wager_id, selection_id)
);

create table if not exists public.sportsbook_balance_transactions (
  id bigint generated always as identity primary key,
  sportsbook_profile_id uuid not null references public.sportsbook_profiles(id) on delete cascade,
  wager_id uuid references public.sportsbook_wagers(id) on delete set null,
  amount numeric(12,4) not null,
  balance_before numeric(12,4) not null,
  balance_after numeric(12,4) not null,
  transaction_type text not null check (transaction_type in ('opening_balance','wager_stake','wager_payout','wager_void','admin_adjustment','resettlement_reversal')),
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.sportsbook_admin_audit (
  id bigint generated always as identity primary key,
  action_type text not null,
  sportsbook_profile_id uuid references public.sportsbook_profiles(id) on delete set null,
  wager_id uuid references public.sportsbook_wagers(id) on delete set null,
  market_id uuid references public.sportsbook_markets(id) on delete set null,
  old_value jsonb not null default '{}'::jsonb,
  new_value jsonb not null default '{}'::jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create or replace function public.sportsbook_profile_for_device(device_token text)
returns uuid language sql stable security definer set search_path = public as $$
  select d.sportsbook_profile_id from public.sportsbook_profile_devices d join public.sportsbook_profiles p on p.id = d.sportsbook_profile_id
  where d.token_hash = public.fantasy_hash(device_token) and d.revoked_at is null and p.active limit 1
$$;

create or replace function public.sportsbook_american_odds(probability numeric)
returns integer language plpgsql immutable as $$
begin
  probability := least(.999::numeric, greatest(.001::numeric, probability));
  if probability = .5 then return 100; end if;
  if probability > .5 then return round(-100 * probability / (1 - probability)); end if;
  return round(100 * (1 - probability) / probability);
end $$;

create or replace function public.sportsbook_profit(stake integer, american_odds integer)
returns numeric language sql immutable as $$
  select case when american_odds > 0 then stake::numeric * american_odds / 100 else stake::numeric * 100 / abs(american_odds) end
$$;

create or replace function public.sportsbook_selection_signature(ids uuid[])
returns text language sql immutable as $$
  select string_agg(value::text, '|' order by value::text) from unnest(ids) value
$$;

create or replace function public.sportsbook_register_profile(device_token text, requested_name text, requested_type text, requested_driver text, acknowledged boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare profile_id uuid; fantasy_id uuid; cleaned text;
begin
  if coalesce(length(device_token), 0) < 24 then raise exception 'Invalid device token.'; end if;
  if not acknowledged then raise exception 'Public activity acknowledgement is required.'; end if;
  if public.sportsbook_profile_for_device(device_token) is not null then raise exception 'This device already has a GTO Sportsbook profile.'; end if;
  cleaned := public.fantasy_validate_name(requested_name);
  if requested_type not in ('driver','spectator') then raise exception 'Choose Driver or Non-Driver / Spectator.'; end if;
  if requested_type = 'driver' and coalesce(length(btrim(requested_driver)),0) = 0 then raise exception 'Drivers must select their official GTO driver.'; end if;
  if requested_type = 'driver' and not exists(select 1 from public.sportsbook_driver_catalog where driver_name = requested_driver and active) then raise exception 'Select an official active GTO driver.'; end if;
  if requested_type = 'spectator' then requested_driver := null; end if;
  fantasy_id := public.fantasy_device_player(device_token);
  insert into public.sportsbook_profiles(fantasy_player_id, display_name, profile_type, linked_driver_name)
    values(fantasy_id, cleaned, requested_type, requested_driver) returning id into profile_id;
  insert into public.sportsbook_profile_devices(sportsbook_profile_id, token_hash) values(profile_id, public.fantasy_hash(device_token));
  insert into public.sportsbook_balance_transactions(sportsbook_profile_id, amount, balance_before, balance_after, transaction_type, description)
    values(profile_id, 500, 0, 500, 'opening_balance', 'Starting GTO Credits — fictional game currency only.');
  insert into public.sportsbook_admin_audit(action_type, sportsbook_profile_id, new_value, reason)
    values('profile_created', profile_id, jsonb_build_object('profile_type', requested_type, 'linked_driver_name', requested_driver), 'Participant registration');
  return public.sportsbook_my_profile(device_token);
exception when unique_violation then raise exception 'That Sportsbook display name is already in use.';
end $$;

create or replace function public.sportsbook_my_profile(device_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  with p as (select p.* from public.sportsbook_profiles p where p.id = public.sportsbook_profile_for_device(device_token)), stats as (
    select w.sportsbook_profile_id, count(*) filter(where w.status='won') as wins, count(*) filter(where w.status='lost') as losses, count(*) as total_bets,
      count(*) filter(where w.status='pending') as pending_bets, coalesce(sum(w.stake),0) as total_wagered, coalesce(sum(w.net_profit),0) as net_profit,
      coalesce(max(w.net_profit) filter(where w.status='won'),0) as biggest_win
    from public.sportsbook_wagers w group by w.sportsbook_profile_id
  ), ranks as (select id, row_number() over(order by current_balance desc, coalesce((select sum(net_profit) from public.sportsbook_wagers w where w.sportsbook_profile_id=s.id),0) desc, display_name) as rank from public.sportsbook_profiles s where active)
  select case when exists(select 1 from p) then jsonb_build_object('id',p.id,'display_name',p.display_name,'profile_type',p.profile_type,'linked_driver_name',p.linked_driver_name,'starting_balance',p.starting_balance,'current_balance',p.current_balance,'created_at',p.created_at,'rank',(select rank from ranks where id=p.id),'winning_bets',coalesce(stats.wins,0),'losing_bets',coalesce(stats.losses,0),'total_bets',coalesce(stats.total_bets,0),'pending_bets',coalesce(stats.pending_bets,0),'total_wagered',coalesce(stats.total_wagered,0),'net_profit',coalesce(stats.net_profit,0),'biggest_win',coalesce(stats.biggest_win,0)) else null end from p left join stats on stats.sportsbook_profile_id=p.id
$$;

create or replace function public.sportsbook_update_my_name(device_token text, requested_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare profile_id uuid; cleaned text;
begin
  profile_id := public.sportsbook_profile_for_device(device_token); if profile_id is null then raise exception 'Sportsbook profile not found.'; end if;
  cleaned := public.fantasy_validate_name(requested_name);
  update public.sportsbook_profiles set display_name=cleaned, updated_at=now() where id=profile_id;
  insert into public.sportsbook_admin_audit(action_type, sportsbook_profile_id, new_value, reason) values('participant_name_changed', profile_id, jsonb_build_object('display_name',cleaned), 'Participant display-name update');
  return public.sportsbook_my_profile(device_token);
exception when unique_violation then raise exception 'That Sportsbook display name is already in use.';
end $$;

create or replace function public.sportsbook_public_markets(requested_season text, requested_round integer default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'season_id',m.season_id,'round_index',m.round_index,'event_key',m.event_key,'market_type',m.market_type,'market_name',m.market_name,'status',m.status,'opens_at',m.opens_at,'closes_at',m.closes_at,'prediction_version',m.prediction_version,'selections',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'selection_key',s.selection_key,'driver_name',s.driver_name,'opponent_driver_name',s.opponent_driver_name,'display_label',s.display_label,'probability',s.probability,'american_odds',s.american_odds,'outcome_group',s.outcome_group,'nested_group',s.nested_group) order by s.probability desc,s.display_label),'[]'::jsonb) from public.sportsbook_selections s where s.market_id=m.id and s.active)) order by m.round_index nulls last,m.market_name),'[]'::jsonb) from public.sportsbook_markets m where m.season_id=requested_season and (requested_round is null or m.round_index=requested_round) and m.status in ('open','suspended','closed','settled')
$$;

create or replace function public.sportsbook_public_leaderboard()
returns jsonb language sql stable security definer set search_path = public as $$
  with stats as (select sportsbook_profile_id,count(*) filter(where status='won') wins,count(*) filter(where status='lost') losses,count(*) total_bets,coalesce(sum(net_profit),0) net_profit,coalesce(max(net_profit) filter(where status='won'),0) biggest_win from public.sportsbook_wagers group by sportsbook_profile_id)
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'display_name',p.display_name,'profile_type',p.profile_type,'linked_driver_name',p.linked_driver_name,'current_balance',p.current_balance,'winning_bets',coalesce(s.wins,0),'losing_bets',coalesce(s.losses,0),'total_bets',coalesce(s.total_bets,0),'net_profit',coalesce(s.net_profit,0),'biggest_win',coalesce(s.biggest_win,0)) order by p.current_balance desc,coalesce(s.net_profit,0) desc,coalesce(s.wins,0) desc,coalesce(s.biggest_win,0) desc,p.display_name),'[]'::jsonb) from public.sportsbook_profiles p left join stats s on s.sportsbook_profile_id=p.id where p.active
$$;

create or replace function public.sportsbook_public_profile(profile_uuid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profile', (select value from jsonb_array_elements(public.sportsbook_public_leaderboard()) value where value->>'id' = profile_uuid::text limit 1),
    'bets', (select coalesce(jsonb_agg(jsonb_build_object('reference',w.public_reference,'wager_type',w.wager_type,'stake',w.stake,'american_odds',w.locked_american_odds,'potential_profit',w.potential_profit,'potential_return',w.potential_return,'status',w.status,'placed_at',w.placed_at,'net_profit',w.net_profit,'legs',(select coalesce(jsonb_agg(jsonb_build_object('market',m.market_name,'selection',s.display_label,'american_odds',l.locked_american_odds,'status',l.leg_status)),'[]'::jsonb) from public.sportsbook_wager_legs l join public.sportsbook_markets m on m.id=l.market_id join public.sportsbook_selections s on s.id=l.selection_id where l.wager_id=w.id)) order by w.placed_at desc),'[]'::jsonb) from public.sportsbook_wagers w where w.sportsbook_profile_id=profile_uuid)
  )
$$;

create or replace function public.sportsbook_public_bets(requested_season text, requested_round integer default null, requested_status text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('reference',w.public_reference,'profile_id',p.id,'bettor',p.display_name,'stake',w.stake,'american_odds',w.locked_american_odds,'potential_profit',w.potential_profit,'potential_return',w.potential_return,'wager_type',w.wager_type,'status',w.status,'placed_at',w.placed_at,'legs',(select coalesce(jsonb_agg(jsonb_build_object('season_id',m.season_id,'round_index',m.round_index,'event_key',m.event_key,'market',m.market_name,'selection',s.display_label,'american_odds',l.locked_american_odds,'status',l.leg_status)),'[]'::jsonb) from public.sportsbook_wager_legs l join public.sportsbook_markets m on m.id=l.market_id join public.sportsbook_selections s on s.id=l.selection_id where l.wager_id=w.id)) order by w.placed_at desc),'[]'::jsonb) from public.sportsbook_wagers w join public.sportsbook_profiles p on p.id=w.sportsbook_profile_id where (requested_status is null or w.status=requested_status) and exists(select 1 from public.sportsbook_wager_legs l join public.sportsbook_markets m on m.id=l.market_id where l.wager_id=w.id and m.season_id=requested_season and (requested_round is null or m.round_index=requested_round))
$$;

create or replace function public.sportsbook_place_wager(device_token text, selection_ids jsonb, requested_stake integer, client_request_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare profile_id uuid; profile public.sportsbook_profiles%rowtype; ids uuid[]; selection_count integer; valid_count integer; same_race_count integer; probability numeric; odds integer; profit numeric; total_return numeric; wager_id uuid; signature text; before_balance numeric;
begin
  profile_id := public.sportsbook_profile_for_device(device_token); if profile_id is null then raise exception 'Create a Sportsbook profile before placing a wager.'; end if;
  select * into profile from public.sportsbook_profiles where id=profile_id for update;
  if not profile.active then raise exception 'This Sportsbook profile is inactive.'; end if;
  if requested_stake is null or requested_stake < 1 then raise exception 'Stake must be a positive whole number of GTO Credits.'; end if;
  if requested_stake > profile.current_balance then raise exception 'Insufficient GTO Credits for this wager.'; end if;
  if coalesce(length(client_request_id),0) < 12 then raise exception 'Invalid wager request.'; end if;
  if jsonb_typeof(selection_ids) <> 'array' then raise exception 'Select at least one market outcome.'; end if;
  select array_agg(value::uuid),count(*),count(distinct value::uuid) into ids,selection_count,valid_count from jsonb_array_elements_text(selection_ids) value;
  if selection_count is null or selection_count < 1 then raise exception 'Select at least one market outcome.'; end if;
  if selection_count <> valid_count then raise exception 'Duplicate selections cannot be combined.'; end if;
  if exists(select 1 from public.sportsbook_wagers where sportsbook_profile_id=profile_id and client_request_id=sportsbook_place_wager.client_request_id) then raise exception 'This wager was already accepted.'; end if;
  if (select count(*) from public.sportsbook_selections s join public.sportsbook_markets m on m.id=s.market_id where s.id=any(ids) and s.active and m.status='open' and (m.opens_at is null or m.opens_at<=now()) and (m.closes_at is null or m.closes_at>now())) <> selection_count then raise exception 'One or more selections are closed, suspended, or changed. Review the current market.'; end if;
  if profile.linked_driver_name is not null and exists(select 1 from public.sportsbook_selections s where s.id=any(ids) and (s.driver_name=profile.linked_driver_name or s.opponent_driver_name=profile.linked_driver_name)) then raise exception 'Drivers cannot wager on their own results or against themselves.'; end if;
  if exists(select 1 from public.sportsbook_selections s where s.id=any(ids) group by s.outcome_group having count(*)>1) then raise exception 'Both sides of the same matchup or duplicate market cannot be combined.'; end if;
  if exists(select 1 from public.sportsbook_selections s where s.id=any(ids) and s.nested_group is not null group by s.nested_group having count(*)>1) then raise exception 'One selected outcome already includes another selected outcome.'; end if;
  if exists(select 1 from public.sportsbook_markets m join public.sportsbook_selections s on s.market_id=m.id where s.id=any(ids) and m.market_type='race_winner' group by m.event_key having count(*)>1) then raise exception 'Two different race winners cannot be combined.'; end if;
  select count(*) into same_race_count from (select m.event_key from public.sportsbook_markets m join public.sportsbook_selections s on s.market_id=m.id where s.id=any(ids) group by m.event_key having count(*)>1) x;
  if selection_count=1 then select s.probability,s.american_odds into probability,odds from public.sportsbook_selections s where s.id=ids[1];
  elsif same_race_count > 0 then
    signature := public.sportsbook_selection_signature(ids);
    select combined_probability,combined_american_odds into probability,odds from public.sportsbook_parlay_prices where selection_signature=signature and active;
    if probability is null then raise exception 'These same-race selections cannot be priced reliably together.'; end if;
  else
    select exp(sum(ln(s.probability::numeric))) into probability from public.sportsbook_selections s where s.id=any(ids);
    odds := public.sportsbook_american_odds(probability);
  end if;
  profit := public.sportsbook_profit(requested_stake, odds); total_return := requested_stake + profit; before_balance := profile.current_balance;
  insert into public.sportsbook_wagers(sportsbook_profile_id,wager_type,stake,locked_combined_probability,locked_american_odds,potential_profit,potential_return,client_request_id) values(profile_id,case when selection_count=1 then 'straight' else 'parlay' end,requested_stake,probability,odds,profit,total_return,client_request_id) returning id into wager_id;
  insert into public.sportsbook_wager_legs(wager_id,market_id,selection_id,locked_probability,locked_american_odds) select wager_id,s.market_id,s.id,s.probability,s.american_odds from public.sportsbook_selections s where s.id=any(ids);
  update public.sportsbook_profiles set current_balance=current_balance-requested_stake,updated_at=now() where id=profile_id;
  insert into public.sportsbook_balance_transactions(sportsbook_profile_id,wager_id,amount,balance_before,balance_after,transaction_type,description) values(profile_id,wager_id,-requested_stake,before_balance,before_balance-requested_stake,'wager_stake','Accepted fictional-credit wager ' || (select public_reference from public.sportsbook_wagers where id=wager_id));
  return jsonb_build_object('wager_id',wager_id,'reference',(select public_reference from public.sportsbook_wagers where id=wager_id),'stake',requested_stake,'american_odds',odds,'potential_profit',profit,'potential_return',total_return,'balance_after',before_balance-requested_stake);
end $$;

create or replace function public.sportsbook_request_device_claim(device_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare code text;
begin
  if public.sportsbook_profile_for_device(device_token) is not null then raise exception 'This device is already linked to a Sportsbook profile.'; end if;
  code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  delete from public.sportsbook_device_claims where expires_at < now() or token_hash=public.fantasy_hash(device_token);
  insert into public.sportsbook_device_claims(claim_code,token_hash) values(code,public.fantasy_hash(device_token));
  return jsonb_build_object('claim_code',code,'expires_at',now()+interval '30 minutes');
end $$;

create or replace function public.sportsbook_admin_authorized(session_token text)
returns boolean language sql stable security definer set search_path=public as $$ select public.fantasy_admin_authorized(session_token) $$;

create or replace function public.sportsbook_admin_save_market(session_token text, payload jsonb, selections jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare market_id uuid; existing_bets integer;
begin
  if not public.sportsbook_admin_authorized(session_token) then raise exception 'Administrator access required.'; end if;
  insert into public.sportsbook_markets(season_id,round_index,event_key,market_type,market_name,status,opens_at,closes_at,prediction_version)
  values(payload->>'season_id',nullif(payload->>'round_index','')::int,payload->>'event_key',payload->>'market_type',payload->>'market_name',coalesce(payload->>'status','open'),nullif(payload->>'opens_at','')::timestamptz,nullif(payload->>'closes_at','')::timestamptz,payload->>'prediction_version')
  on conflict(season_id,event_key,market_type) do update set market_name=excluded.market_name,status=excluded.status,opens_at=excluded.opens_at,closes_at=excluded.closes_at,prediction_version=excluded.prediction_version,updated_at=now() returning id into market_id;
  select count(*) into existing_bets from public.sportsbook_wager_legs where market_id=market_id;
  if existing_bets>0 then raise exception 'Market selections are locked after wagers are accepted. Suspend or settle the existing market instead.'; end if;
  delete from public.sportsbook_selections where market_id=market_id;
  insert into public.sportsbook_selections(market_id,selection_key,driver_name,opponent_driver_name,display_label,probability,american_odds,outcome_group,nested_group,source)
  select market_id,item->>'selection_key',nullif(item->>'driver_name',''),nullif(item->>'opponent_driver_name',''),item->>'display_label',(item->>'probability')::numeric,(item->>'american_odds')::int,item->>'outcome_group',nullif(item->>'nested_group',''),coalesce(item->'source','{}'::jsonb) from jsonb_array_elements(selections) item;
  insert into public.sportsbook_admin_audit(action_type,market_id,new_value,reason) values('market_saved',market_id,jsonb_build_object('selection_count',jsonb_array_length(selections), 'market_type',payload->>'market_type'),'Prediction market snapshot');
  return jsonb_build_object('market_id',market_id);
end $$;

create or replace function public.sportsbook_admin_set_market_status(session_token text, market_uuid uuid, next_status text, reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare old_status text;
begin
  if not public.sportsbook_admin_authorized(session_token) then raise exception 'Administrator access required.'; end if;
  if next_status not in ('open','suspended','closed','voided') then raise exception 'Unsupported market status.'; end if;
  select status into old_status from public.sportsbook_markets where id=market_uuid for update; if old_status is null then raise exception 'Market not found.'; end if;
  update public.sportsbook_markets set status=next_status,updated_at=now() where id=market_uuid;
  insert into public.sportsbook_admin_audit(action_type,market_id,old_value,new_value,reason) values('market_status_changed',market_uuid,jsonb_build_object('status',old_status),jsonb_build_object('status',next_status),reason);
  return jsonb_build_object('market_id',market_uuid,'status',next_status);
end $$;

create or replace function public.sportsbook_admin_save_joint_prices(session_token text, prices jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare item jsonb; ids uuid[]; signature text; inserted_count integer := 0;
begin
  if not public.sportsbook_admin_authorized(session_token) then raise exception 'Administrator access required.'; end if;
  if jsonb_typeof(prices) <> 'array' then raise exception 'Joint prices must be an array.'; end if;
  for item in select value from jsonb_array_elements(prices) loop
    select array_agg(value::uuid) into ids from jsonb_array_elements_text(item->'selection_ids') value;
    if cardinality(ids) < 2 then continue; end if;
    signature:=public.sportsbook_selection_signature(ids);
    insert into public.sportsbook_parlay_prices(selection_signature,selection_ids,combined_probability,combined_american_odds,source)
      values(signature,item->'selection_ids',(item->>'combined_probability')::numeric,(item->>'combined_american_odds')::int,'race_simulation')
      on conflict(selection_signature) do update set selection_ids=excluded.selection_ids,combined_probability=excluded.combined_probability,combined_american_odds=excluded.combined_american_odds,source=excluded.source,active=true;
    inserted_count:=inserted_count+1;
  end loop;
  return jsonb_build_object('saved',inserted_count);
end $$;

create or replace function public.sportsbook_admin_adjust_credits(session_token text, profile_uuid uuid, adjustment integer, reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare before_balance integer;
begin
  if not public.sportsbook_admin_authorized(session_token) then raise exception 'Administrator access required.'; end if;
  if coalesce(length(btrim(reason)),0)<4 then raise exception 'A written reason is required for a credit correction.'; end if;
  select current_balance into before_balance from public.sportsbook_profiles where id=profile_uuid for update; if before_balance is null then raise exception 'Sportsbook profile not found.'; end if;
  if before_balance + adjustment < 0 then raise exception 'This correction would make the balance negative.'; end if;
  update public.sportsbook_profiles set current_balance=current_balance+adjustment,updated_at=now() where id=profile_uuid;
  insert into public.sportsbook_balance_transactions(sportsbook_profile_id,amount,balance_before,balance_after,transaction_type,description) values(profile_uuid,adjustment,before_balance,before_balance+adjustment,'admin_adjustment',reason);
  insert into public.sportsbook_admin_audit(action_type,sportsbook_profile_id,old_value,new_value,reason) values('credit_adjusted',profile_uuid,jsonb_build_object('balance',before_balance),jsonb_build_object('balance',before_balance+adjustment,'adjustment',adjustment),reason);
  return jsonb_build_object('profile_id',profile_uuid,'balance',before_balance+adjustment);
end $$;

create or replace function public.sportsbook_admin_update_profile(session_token text, profile_uuid uuid, requested_type text, requested_driver text, requested_name text, enabled boolean, reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare old_row public.sportsbook_profiles%rowtype; cleaned text;
begin
  if not public.sportsbook_admin_authorized(session_token) then raise exception 'Administrator access required.'; end if;
  if coalesce(length(btrim(reason)),0)<4 then raise exception 'A written reason is required for a profile correction.'; end if;
  select * into old_row from public.sportsbook_profiles where id=profile_uuid for update; if old_row.id is null then raise exception 'Sportsbook profile not found.'; end if;
  if requested_type not in ('driver','spectator') then raise exception 'Invalid profile type.'; end if;
  if requested_type='driver' and coalesce(length(btrim(requested_driver)),0)=0 then raise exception 'A driver profile must have a linked driver.'; end if;
  if requested_type='driver' and not exists(select 1 from public.sportsbook_driver_catalog where driver_name=requested_driver and active) then raise exception 'Select an official active GTO driver.'; end if;
  if requested_type='spectator' then requested_driver:=null; end if;
  cleaned:=public.fantasy_validate_name(requested_name);
  update public.sportsbook_profiles set display_name=cleaned,profile_type=requested_type,linked_driver_name=requested_driver,active=enabled,updated_at=now() where id=profile_uuid;
  insert into public.sportsbook_admin_audit(action_type,sportsbook_profile_id,old_value,new_value,reason) values('profile_corrected',profile_uuid,jsonb_build_object('display_name',old_row.display_name,'profile_type',old_row.profile_type,'linked_driver_name',old_row.linked_driver_name,'active',old_row.active),jsonb_build_object('display_name',cleaned,'profile_type',requested_type,'linked_driver_name',requested_driver,'active',enabled),reason);
  return jsonb_build_object('profile_id',profile_uuid,'updated',true);
end $$;

create or replace function public.sportsbook_admin_sync_driver_catalog(session_token text, drivers jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare count_saved integer;
begin
  if not public.sportsbook_admin_authorized(session_token) then raise exception 'Administrator access required.'; end if;
  if jsonb_typeof(drivers) <> 'array' or jsonb_array_length(drivers) = 0 then raise exception 'Provide the official driver list.'; end if;
  insert into public.sportsbook_driver_catalog(driver_name,active,updated_at)
  select distinct btrim(value), true, now()
  from jsonb_array_elements_text(drivers) value
  where length(btrim(value)) between 1 and 80
  on conflict(driver_name) do update set active=true,updated_at=now();
  get diagnostics count_saved = row_count;
  insert into public.sportsbook_admin_audit(action_type,new_value,reason) values('driver_catalog_synced',jsonb_build_object('drivers_saved',count_saved),'Official website driver list synchronized');
  return jsonb_build_object('drivers_saved',count_saved);
end $$;

create or replace function public.sportsbook_admin_settle_market(session_token text, market_uuid uuid, outcome jsonb, reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare market public.sportsbook_markets%rowtype; wager public.sportsbook_wagers%rowtype; pending_count integer; lost_count integer; won_count integer; void_count integer; new_status text; payout numeric; profit numeric; before_balance numeric;
begin
  if not public.sportsbook_admin_authorized(session_token) then raise exception 'Administrator access required.'; end if;
  if coalesce(length(btrim(reason)),0)<4 then raise exception 'A written reason is required to settle a market.'; end if;
  select * into market from public.sportsbook_markets where id=market_uuid for update; if market.id is null then raise exception 'Market not found.'; end if;
  if market.status in ('settled','voided') then raise exception 'Use controlled resettlement before settling this market again.'; end if;
  update public.sportsbook_wager_legs leg set leg_status = case
    when market.status='voided' then 'voided'
    when market.market_type='race_winner' then case when leg_selection.driver_name=outcome->>'winner' then 'won' else 'lost' end
    when market.market_type='podium' then case when nullif(outcome->'positions'->>leg_selection.driver_name,'')::int between 1 and 3 then 'won' else 'lost' end
    when market.market_type='top_five' then case when nullif(outcome->'positions'->>leg_selection.driver_name,'')::int between 1 and 5 then 'won' else 'lost' end
    when market.market_type='pole' then case when leg_selection.driver_name=outcome->>'pole' then 'won' else 'lost' end
    when market.market_type='head_to_head' then case when nullif(outcome->'positions'->>leg_selection.driver_name,'')::int < nullif(outcome->'positions'->>leg_selection.opponent_driver_name,'')::int then 'won' else 'lost' end
    when market.market_type='champion' then case when leg_selection.driver_name=outcome->>'champion' then 'won' else 'lost' end
    else 'voided' end
  from public.sportsbook_selections leg_selection where leg.market_id=market_uuid and leg.selection_id=leg_selection.id and leg.leg_status='pending';
  for wager in select distinct w.* from public.sportsbook_wagers w join public.sportsbook_wager_legs leg on leg.wager_id=w.id where leg.market_id=market_uuid and w.status='pending' for update loop
    select count(*) filter(where leg_status='pending'),count(*) filter(where leg_status='lost'),count(*) filter(where leg_status='won'),count(*) filter(where leg_status='voided') into pending_count,lost_count,won_count,void_count from public.sportsbook_wager_legs where wager_id=wager.id;
    if pending_count>0 then continue; end if;
    if lost_count>0 then new_status:='lost'; payout:=0; profit:=-wager.stake;
    elsif won_count=0 then new_status:='voided'; payout:=wager.stake; profit:=0;
    elsif void_count=0 then new_status:='won'; payout:=wager.potential_return; profit:=wager.potential_profit;
    else
      new_status:='won'; select exp(sum(ln(locked_probability::numeric))) into payout from public.sportsbook_wager_legs where wager_id=wager.id and leg_status='won';
      payout:=wager.stake + public.sportsbook_profit(wager.stake,public.sportsbook_american_odds(payout)); profit:=payout-wager.stake;
    end if;
    select current_balance into before_balance from public.sportsbook_profiles where id=wager.sportsbook_profile_id for update;
    update public.sportsbook_wagers set status=new_status,settled_at=now(),settlement_version=settlement_version+1,net_profit=profit,settled_return=payout where id=wager.id;
    if payout>0 then update public.sportsbook_profiles set current_balance=current_balance+ceil(payout)::int,updated_at=now() where id=wager.sportsbook_profile_id;
      insert into public.sportsbook_balance_transactions(sportsbook_profile_id,wager_id,amount,balance_before,balance_after,transaction_type,description) values(wager.sportsbook_profile_id,wager.id,payout,before_balance,before_balance+ceil(payout),'wager_payout',case when new_status='voided' then 'Voided wager returned' else 'Settled wager payout' end);
    end if;
  end loop;
  update public.sportsbook_markets set status=case when market.status='voided' then 'voided' else 'settled' end,settlement_result=outcome,settled_at=now(),updated_at=now() where id=market_uuid;
  insert into public.sportsbook_admin_audit(action_type,market_id,new_value,reason) values('market_settled',market_uuid,outcome,reason);
  return jsonb_build_object('market_id',market_uuid,'status',case when market.status='voided' then 'voided' else 'settled' end);
end $$;

create or replace function public.sportsbook_admin_resettle_market(session_token text, market_uuid uuid, reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare wager public.sportsbook_wagers%rowtype; before_balance integer;
begin
  if not public.sportsbook_admin_authorized(session_token) then raise exception 'Administrator access required.'; end if;
  if coalesce(length(btrim(reason)),0)<4 then raise exception 'A written reason is required to resettle a market.'; end if;
  for wager in select distinct w.* from public.sportsbook_wagers w join public.sportsbook_wager_legs leg on leg.wager_id=w.id where leg.market_id=market_uuid and w.status in ('won','voided') for update loop
    select current_balance into before_balance from public.sportsbook_profiles where id=wager.sportsbook_profile_id for update;
    if before_balance < ceil(wager.settled_return) then raise exception 'Cannot resettle while a related profile has spent its previous return. Add an administrator correction first.'; end if;
    update public.sportsbook_profiles set current_balance=current_balance-ceil(wager.settled_return),updated_at=now() where id=wager.sportsbook_profile_id;
    insert into public.sportsbook_balance_transactions(sportsbook_profile_id,wager_id,amount,balance_before,balance_after,transaction_type,description) values(wager.sportsbook_profile_id,wager.id,-wager.settled_return,before_balance,before_balance-ceil(wager.settled_return),'resettlement_reversal','Prior settlement reversed: '||reason);
    update public.sportsbook_wagers set status='pending',settled_at=null,net_profit=null,settled_return=0 where id=wager.id;
  end loop;
  update public.sportsbook_wager_legs set leg_status='pending' where market_id=market_uuid;
  update public.sportsbook_markets set status='closed',settlement_result='{}'::jsonb,settled_at=null,updated_at=now() where id=market_uuid;
  insert into public.sportsbook_admin_audit(action_type,market_id,reason) values('market_resettlement_started',market_uuid,reason);
  return jsonb_build_object('market_id',market_uuid,'status','closed');
end $$;

create or replace function public.sportsbook_admin_reassign_device(session_token text, profile_uuid uuid, claim text, reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare claim_row public.sportsbook_device_claims%rowtype;
begin
  if not public.sportsbook_admin_authorized(session_token) then raise exception 'Administrator access required.'; end if;
  if coalesce(length(btrim(reason)),0)<4 then raise exception 'A written reason is required for device reassignment.'; end if;
  select * into claim_row from public.sportsbook_device_claims where claim_code=upper(claim) and claimed_at is null and expires_at>now() for update; if claim_row.id is null then raise exception 'Device claim code is invalid or expired.'; end if;
  update public.sportsbook_profile_devices set revoked_at=now() where sportsbook_profile_id=profile_uuid and revoked_at is null;
  insert into public.sportsbook_profile_devices(sportsbook_profile_id,token_hash) values(profile_uuid,claim_row.token_hash);
  update public.sportsbook_device_claims set claimed_at=now() where id=claim_row.id;
  insert into public.sportsbook_admin_audit(action_type,sportsbook_profile_id,new_value,reason) values('device_reassigned',profile_uuid,jsonb_build_object('claim_code',upper(claim)),reason);
  return jsonb_build_object('profile_id',profile_uuid,'reassigned',true);
end $$;

create or replace function public.sportsbook_admin_list_profiles(session_token text)
returns jsonb language sql stable security definer set search_path=public as $$
  select case when public.sportsbook_admin_authorized(session_token) then public.sportsbook_public_leaderboard() else '[]'::jsonb end
$$;

create or replace function public.sportsbook_admin_audit(session_token text, max_rows integer default 100)
returns jsonb language sql stable security definer set search_path=public as $$
  select case when public.sportsbook_admin_authorized(session_token) then coalesce(jsonb_agg(jsonb_build_object('id',id,'action_type',action_type,'profile_id',sportsbook_profile_id,'wager_id',wager_id,'market_id',market_id,'old_value',old_value,'new_value',new_value,'reason',reason,'created_at',created_at) order by id desc),'[]'::jsonb) else '[]'::jsonb end from (select * from public.sportsbook_admin_audit order by id desc limit least(greatest(max_rows,1),250)) log
$$;

alter table public.sportsbook_profiles enable row level security;
alter table public.sportsbook_driver_catalog enable row level security;
alter table public.sportsbook_profile_devices enable row level security;
alter table public.sportsbook_device_claims enable row level security;
alter table public.sportsbook_markets enable row level security;
alter table public.sportsbook_selections enable row level security;
alter table public.sportsbook_parlay_prices enable row level security;
alter table public.sportsbook_wagers enable row level security;
alter table public.sportsbook_wager_legs enable row level security;
alter table public.sportsbook_balance_transactions enable row level security;
alter table public.sportsbook_admin_audit enable row level security;
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant execute on function public.sportsbook_register_profile(text,text,text,text,boolean) to anon,authenticated;
grant execute on function public.sportsbook_my_profile(text) to anon,authenticated;
grant execute on function public.sportsbook_update_my_name(text,text) to anon,authenticated;
grant execute on function public.sportsbook_public_markets(text,integer) to anon,authenticated;
grant execute on function public.sportsbook_public_leaderboard() to anon,authenticated;
grant execute on function public.sportsbook_public_profile(uuid) to anon,authenticated;
grant execute on function public.sportsbook_public_bets(text,integer,text) to anon,authenticated;
grant execute on function public.sportsbook_place_wager(text,jsonb,integer,text) to anon,authenticated;
grant execute on function public.sportsbook_request_device_claim(text) to anon,authenticated;
grant execute on function public.sportsbook_admin_save_market(text,jsonb,jsonb) to anon,authenticated;
grant execute on function public.sportsbook_admin_set_market_status(text,uuid,text,text) to anon,authenticated;
grant execute on function public.sportsbook_admin_save_joint_prices(text,jsonb) to anon,authenticated;
grant execute on function public.sportsbook_admin_adjust_credits(text,uuid,integer,text) to anon,authenticated;
grant execute on function public.sportsbook_admin_update_profile(text,uuid,text,text,text,boolean,text) to anon,authenticated;
grant execute on function public.sportsbook_admin_sync_driver_catalog(text,jsonb) to anon,authenticated;
grant execute on function public.sportsbook_admin_settle_market(text,uuid,jsonb,text) to anon,authenticated;
grant execute on function public.sportsbook_admin_resettle_market(text,uuid,text) to anon,authenticated;
grant execute on function public.sportsbook_admin_reassign_device(text,uuid,text,text) to anon,authenticated;
grant execute on function public.sportsbook_admin_list_profiles(text) to anon,authenticated;
grant execute on function public.sportsbook_admin_audit(text,integer) to anon,authenticated;

select 'GTO Sportsbook fictional-credit backend is ready.' as result;
