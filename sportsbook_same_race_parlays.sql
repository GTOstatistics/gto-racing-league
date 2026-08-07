-- GTO Sportsbook: same-race multi-market parlay upgrade.
-- Run once in Supabase SQL Editor as postgres. It preserves profiles, markets,
-- wagers, balances, and Fantasy League data.

-- Also fixes the earlier ambiguous market_id reference in the market publisher.
create or replace function public.sportsbook_admin_save_market(
  session_token text,
  payload jsonb,
  selections jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_market_id uuid;
  existing_bets integer;
begin
  if not public.sportsbook_admin_authorized(session_token) then
    raise exception 'Administrator access required.';
  end if;

  insert into public.sportsbook_markets (
    season_id, round_index, event_key, market_type, market_name,
    status, opens_at, closes_at, prediction_version
  )
  values (
    payload->>'season_id',
    nullif(payload->>'round_index', '')::int,
    payload->>'event_key',
    payload->>'market_type',
    payload->>'market_name',
    coalesce(payload->>'status', 'open'),
    nullif(payload->>'opens_at', '')::timestamptz,
    nullif(payload->>'closes_at', '')::timestamptz,
    payload->>'prediction_version'
  )
  on conflict (season_id, event_key, market_type)
  do update set
    market_name = excluded.market_name,
    status = excluded.status,
    opens_at = excluded.opens_at,
    closes_at = excluded.closes_at,
    prediction_version = excluded.prediction_version,
    updated_at = now()
  returning id into saved_market_id;

  select count(*) into existing_bets
  from public.sportsbook_wager_legs as wager_leg
  where wager_leg.market_id = saved_market_id;

  if existing_bets > 0 then
    raise exception 'Market selections are locked after wagers are accepted. Suspend or settle the existing market instead.';
  end if;

  delete from public.sportsbook_selections as sportsbook_selection
  where sportsbook_selection.market_id = saved_market_id;

  insert into public.sportsbook_selections (
    market_id, selection_key, driver_name, opponent_driver_name, display_label,
    probability, american_odds, outcome_group, nested_group, source
  )
  select
    saved_market_id,
    item->>'selection_key',
    nullif(item->>'driver_name', ''),
    nullif(item->>'opponent_driver_name', ''),
    item->>'display_label',
    (item->>'probability')::numeric,
    (item->>'american_odds')::int,
    item->>'outcome_group',
    nullif(item->>'nested_group', ''),
    coalesce(item->'source', '{}'::jsonb)
  from jsonb_array_elements(selections) item;

  insert into public.sportsbook_admin_audit (action_type, market_id, new_value, reason)
  values ('market_saved', saved_market_id,
    jsonb_build_object('selection_count', jsonb_array_length(selections), 'market_type', payload->>'market_type'),
    'Prediction market snapshot');

  return jsonb_build_object('market_id', saved_market_id);
end $$;

grant execute on function public.sportsbook_admin_save_market(text, jsonb, jsonb)
to anon, authenticated;

create table if not exists public.sportsbook_race_simulation_outcomes (
  event_key text not null,
  simulation_number integer not null,
  finishing_order jsonb not null,
  pole_driver text,
  created_at timestamptz not null default now(),
  primary key (event_key, simulation_number)
);

create or replace function public.sportsbook_finish_position(order_data jsonb, driver text)
returns integer
language sql
immutable
as $$
  select min(item.ordinality)::integer
  from jsonb_array_elements_text(order_data) with ordinality as item(driver_name, ordinality)
  where item.driver_name = driver
$$;

create or replace function public.sportsbook_joint_event_probability(
  requested_event_key text,
  requested_selection_ids uuid[]
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  outcome_total integer;
  winning_outcomes integer;
begin
  select count(*)
  into outcome_total
  from public.sportsbook_race_simulation_outcomes as outcome
  where outcome.event_key = requested_event_key;

  if outcome_total = 0 then
    return null;
  end if;

  select count(*)
  into winning_outcomes
  from public.sportsbook_race_simulation_outcomes as outcome
  where outcome.event_key = requested_event_key
    and not exists (
      select 1
      from public.sportsbook_selections as selection
      join public.sportsbook_markets as market on market.id = selection.market_id
      where selection.id = any(requested_selection_ids)
        and market.event_key = requested_event_key
        and not coalesce(
          case market.market_type
            when 'race_winner' then outcome.finishing_order ->> 0 = selection.driver_name
            when 'podium' then public.sportsbook_finish_position(outcome.finishing_order, selection.driver_name) between 1 and 3
            when 'top_five' then public.sportsbook_finish_position(outcome.finishing_order, selection.driver_name) between 1 and 5
            when 'pole' then outcome.pole_driver = selection.driver_name
            when 'head_to_head' then public.sportsbook_finish_position(outcome.finishing_order, selection.driver_name) < public.sportsbook_finish_position(outcome.finishing_order, selection.opponent_driver_name)
            else false
          end,
          false
        )
    );

  if winning_outcomes = 0 then
    return null;
  end if;

  return winning_outcomes::numeric / outcome_total::numeric;
end $$;

create or replace function public.sportsbook_admin_save_simulation_outcomes(
  session_token text,
  requested_event_key text,
  outcomes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_count integer;
begin
  if not public.sportsbook_admin_authorized(session_token) then
    raise exception 'Administrator access required.';
  end if;
  if jsonb_typeof(outcomes) <> 'array' or jsonb_array_length(outcomes) = 0 then
    raise exception 'A race simulation snapshot is required.';
  end if;
  if not exists (select 1 from public.sportsbook_markets as market where market.event_key = requested_event_key and market.round_index is not null) then
    raise exception 'Race markets must be saved before their simulation snapshot.';
  end if;
  if exists (
    select 1
    from public.sportsbook_wager_legs as wager_leg
    join public.sportsbook_markets as market on market.id = wager_leg.market_id
    where market.event_key = requested_event_key
  ) then
    raise exception 'The simulation snapshot is locked after wagers are accepted for this race.';
  end if;

  delete from public.sportsbook_race_simulation_outcomes as outcome
  where outcome.event_key = requested_event_key;

  insert into public.sportsbook_race_simulation_outcomes (
    event_key,
    simulation_number,
    finishing_order,
    pole_driver
  )
  select
    requested_event_key,
    input.simulation_number::integer,
    input.value -> 'finishing_order',
    nullif(input.value ->> 'pole_driver', '')
  from jsonb_array_elements(outcomes) with ordinality as input(value, simulation_number)
  where jsonb_typeof(input.value -> 'finishing_order') = 'array'
    and jsonb_array_length(input.value -> 'finishing_order') > 0;

  get diagnostics saved_count = row_count;
  if saved_count <> jsonb_array_length(outcomes) then
    raise exception 'The race simulation snapshot contained an invalid outcome.';
  end if;

  insert into public.sportsbook_admin_audit (action_type, new_value, reason)
  values (
    'race_simulation_snapshot_saved',
    jsonb_build_object('event_key', requested_event_key, 'outcomes_saved', saved_count),
    'Official prediction simulation snapshot for same-race parlay pricing'
  );

  return jsonb_build_object('event_key', requested_event_key, 'outcomes_saved', saved_count);
end $$;

create or replace function public.sportsbook_place_wager(
  device_token text,
  selection_ids jsonb,
  requested_stake integer,
  client_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_id uuid;
  profile public.sportsbook_profiles%rowtype;
  ids uuid[];
  selection_count integer;
  valid_count integer;
  probability numeric;
  odds integer;
  profit numeric;
  total_return numeric;
  wager_id uuid;
  before_balance numeric;
begin
  profile_id := public.sportsbook_profile_for_device(device_token);
  if profile_id is null then
    raise exception 'Create a Sportsbook profile before placing a wager.';
  end if;

  select * into profile
  from public.sportsbook_profiles as sportsbook_profile
  where sportsbook_profile.id = profile_id
  for update;

  if not profile.active then
    raise exception 'This Sportsbook profile is inactive.';
  end if;
  if requested_stake is null or requested_stake < 1 then
    raise exception 'Stake must be a positive whole number of GTO Credits.';
  end if;
  if requested_stake > profile.current_balance then
    raise exception 'Insufficient GTO Credits for this wager.';
  end if;
  if coalesce(length(client_request_id), 0) < 12 then
    raise exception 'Invalid wager request.';
  end if;
  if jsonb_typeof(selection_ids) <> 'array' then
    raise exception 'Select at least one market outcome.';
  end if;

  select array_agg(value::uuid), count(*), count(distinct value::uuid)
  into ids, selection_count, valid_count
  from jsonb_array_elements_text(selection_ids) as value;

  if selection_count is null or selection_count < 1 then
    raise exception 'Select at least one market outcome.';
  end if;
  if selection_count <> valid_count then
    raise exception 'Duplicate selections cannot be combined.';
  end if;
  if exists (
    select 1
    from public.sportsbook_wagers as wager
    where wager.sportsbook_profile_id = profile_id
      and wager.client_request_id = sportsbook_place_wager.client_request_id
  ) then
    raise exception 'This wager was already accepted.';
  end if;
  if (
    select count(*)
    from public.sportsbook_selections as selection
    join public.sportsbook_markets as market on market.id = selection.market_id
    where selection.id = any(ids)
      and selection.active
      and market.status = 'open'
      and (market.opens_at is null or market.opens_at <= now())
      and (market.closes_at is null or market.closes_at > now())
  ) <> selection_count then
    raise exception 'One or more selections are closed, suspended, or changed. Review the current market.';
  end if;
  if profile.linked_driver_name is not null and exists (
    select 1
    from public.sportsbook_selections as selection
    where selection.id = any(ids)
      and (selection.driver_name = profile.linked_driver_name or selection.opponent_driver_name = profile.linked_driver_name)
  ) then
    raise exception 'Drivers cannot wager on their own results or against themselves.';
  end if;
  if exists (
    select 1
    from public.sportsbook_selections as selection
    where selection.id = any(ids)
    group by selection.outcome_group
    having count(*) > 1
  ) then
    raise exception 'Both sides of the same matchup or duplicate market cannot be combined.';
  end if;
  if exists (
    select 1
    from public.sportsbook_selections as selection
    where selection.id = any(ids)
      and selection.nested_group is not null
    group by selection.nested_group
    having count(*) > 1
  ) then
    raise exception 'One selected outcome already includes another selected outcome.';
  end if;
  if exists (
    select 1
    from public.sportsbook_markets as market
    join public.sportsbook_selections as selection on selection.market_id = market.id
    where selection.id = any(ids)
      and market.market_type = 'race_winner'
    group by market.event_key
    having count(*) > 1
  ) then
    raise exception 'Two different race winners cannot be combined.';
  end if;

  if selection_count = 1 then
    select selection.probability, selection.american_odds
    into probability, odds
    from public.sportsbook_selections as selection
    where selection.id = ids[1];
  else
    select exp(sum(ln(event_price.probability)))
    into probability
    from (
      select
        market.event_key,
        case
          when count(*) = 1 then max(selection.probability)
          else public.sportsbook_joint_event_probability(market.event_key, array_agg(selection.id))
        end as probability
      from public.sportsbook_selections as selection
      join public.sportsbook_markets as market on market.id = selection.market_id
      where selection.id = any(ids)
      group by market.event_key
    ) as event_price;

    if probability is null then
      raise exception 'These same-race selections cannot be priced from the official simulation. Ask the administrator to republish the race markets before betting.';
    end if;
    odds := public.sportsbook_american_odds(probability);
  end if;

  profit := public.sportsbook_profit(requested_stake, odds);
  total_return := requested_stake + profit;
  before_balance := profile.current_balance;

  insert into public.sportsbook_wagers (
    sportsbook_profile_id,
    wager_type,
    stake,
    locked_combined_probability,
    locked_american_odds,
    potential_profit,
    potential_return,
    client_request_id
  )
  values (
    profile_id,
    case when selection_count = 1 then 'straight' else 'parlay' end,
    requested_stake,
    probability,
    odds,
    profit,
    total_return,
    client_request_id
  )
  returning id into wager_id;

  insert into public.sportsbook_wager_legs (
    wager_id,
    market_id,
    selection_id,
    locked_probability,
    locked_american_odds
  )
  select wager_id, selection.market_id, selection.id, selection.probability, selection.american_odds
  from public.sportsbook_selections as selection
  where selection.id = any(ids);

  update public.sportsbook_profiles
  set current_balance = current_balance - requested_stake,
      updated_at = now()
  where id = profile_id;

  insert into public.sportsbook_balance_transactions (
    sportsbook_profile_id,
    wager_id,
    amount,
    balance_before,
    balance_after,
    transaction_type,
    description
  )
  values (
    profile_id,
    wager_id,
    -requested_stake,
    before_balance,
    before_balance - requested_stake,
    'wager_stake',
    'Accepted fictional-credit wager ' || (select public_reference from public.sportsbook_wagers where id = wager_id)
  );

  return jsonb_build_object(
    'wager_id', wager_id,
    'reference', (select public_reference from public.sportsbook_wagers where id = wager_id),
    'stake', requested_stake,
    'american_odds', odds,
    'potential_profit', profit,
    'potential_return', total_return,
    'balance_after', before_balance - requested_stake
  );
end $$;

alter table public.sportsbook_race_simulation_outcomes enable row level security;
revoke all on public.sportsbook_race_simulation_outcomes from anon, authenticated;
grant execute on function public.sportsbook_admin_save_simulation_outcomes(text, text, jsonb) to anon, authenticated;
grant execute on function public.sportsbook_place_wager(text, jsonb, integer, text) to anon, authenticated;

select 'Same-race multi-market parlays are ready.' as result;
