-- GTO Sportsbook: decimal-credit wager and payout upgrade.
-- Run once in Supabase SQL Editor as postgres after the prior Sportsbook scripts.
-- Existing profiles, balances, bets, markets, and Fantasy League data are preserved.

alter table public.sportsbook_profiles
  alter column current_balance type numeric(12,4) using current_balance::numeric;

alter table public.sportsbook_wagers
  alter column stake type numeric(12,4) using stake::numeric;

create or replace function public.sportsbook_profit(stake numeric, american_odds integer)
returns numeric
language sql
immutable
as $$
  select round(case when american_odds > 0 then stake * american_odds / 100 else stake * 100 / abs(american_odds) end, 2)
$$;

drop function if exists public.sportsbook_place_wager(text, jsonb, integer, text);

create function public.sportsbook_place_wager(
  device_token text,
  selection_ids jsonb,
  requested_stake numeric,
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
  if requested_stake is null or requested_stake <= 0 or requested_stake <> round(requested_stake, 2) then
    raise exception 'Stake must be a positive GTO Credit amount with no more than two decimal places.';
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
    select 1 from public.sportsbook_wagers as wager
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
    select 1 from public.sportsbook_selections as selection
    where selection.id = any(ids)
      and (selection.driver_name = profile.linked_driver_name or selection.opponent_driver_name = profile.linked_driver_name)
  ) then
    raise exception 'Drivers cannot wager on their own results or against themselves.';
  end if;
  if exists (
    select 1 from public.sportsbook_selections as selection
    where selection.id = any(ids)
    group by selection.outcome_group
    having count(*) > 1
  ) then
    raise exception 'Both sides of the same matchup or duplicate market cannot be combined.';
  end if;
  if exists (
    select 1 from public.sportsbook_selections as selection
    where selection.id = any(ids) and selection.nested_group is not null
    group by selection.nested_group
    having count(*) > 1
  ) then
    raise exception 'One selected outcome already includes another selected outcome.';
  end if;
  if exists (
    select 1
    from public.sportsbook_markets as market
    join public.sportsbook_selections as selection on selection.market_id = market.id
    where selection.id = any(ids) and market.market_type = 'race_winner'
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
      select market.event_key,
        case when count(*) = 1 then max(selection.probability)
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
  total_return := round(requested_stake + profit, 2);
  before_balance := profile.current_balance;

  insert into public.sportsbook_wagers (
    sportsbook_profile_id, wager_type, stake, locked_combined_probability,
    locked_american_odds, potential_profit, potential_return, client_request_id
  ) values (
    profile_id, case when selection_count = 1 then 'straight' else 'parlay' end,
    requested_stake, probability, odds, profit, total_return, client_request_id
  ) returning id into wager_id;

  insert into public.sportsbook_wager_legs (
    wager_id, market_id, selection_id, locked_probability, locked_american_odds
  )
  select wager_id, selection.market_id, selection.id, selection.probability, selection.american_odds
  from public.sportsbook_selections as selection
  where selection.id = any(ids);

  update public.sportsbook_profiles
  set current_balance = current_balance - requested_stake, updated_at = now()
  where id = profile_id;

  insert into public.sportsbook_balance_transactions (
    sportsbook_profile_id, wager_id, amount, balance_before, balance_after,
    transaction_type, description
  ) values (
    profile_id, wager_id, -requested_stake, before_balance,
    before_balance - requested_stake, 'wager_stake',
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

drop function if exists public.sportsbook_admin_adjust_credits(text, uuid, integer, text);

create function public.sportsbook_admin_adjust_credits(session_token text, profile_uuid uuid, adjustment numeric, reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare before_balance numeric;
begin
  if not public.sportsbook_admin_authorized(session_token) then raise exception 'Administrator access required.'; end if;
  if coalesce(length(btrim(reason)),0)<4 then raise exception 'A written reason is required for a credit correction.'; end if;
  if adjustment is null or adjustment <> round(adjustment, 2) then raise exception 'Credit adjustments may use no more than two decimal places.'; end if;
  select current_balance into before_balance from public.sportsbook_profiles where id=profile_uuid for update; if before_balance is null then raise exception 'Sportsbook profile not found.'; end if;
  if before_balance + adjustment < 0 then raise exception 'This correction would make the balance negative.'; end if;
  update public.sportsbook_profiles set current_balance=current_balance+adjustment,updated_at=now() where id=profile_uuid;
  insert into public.sportsbook_balance_transactions(sportsbook_profile_id,amount,balance_before,balance_after,transaction_type,description) values(profile_uuid,adjustment,before_balance,before_balance+adjustment,'admin_adjustment',reason);
  insert into public.sportsbook_admin_audit(action_type,sportsbook_profile_id,old_value,new_value,reason) values('credit_adjusted',profile_uuid,jsonb_build_object('balance',before_balance),jsonb_build_object('balance',before_balance+adjustment,'adjustment',adjustment),reason);
  return jsonb_build_object('profile_id',profile_uuid,'balance',before_balance+adjustment);
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
      payout:=round(wager.stake + public.sportsbook_profit(wager.stake,public.sportsbook_american_odds(payout)),2); profit:=payout-wager.stake;
    end if;
    payout:=round(payout,2); profit:=round(profit,2);
    select current_balance into before_balance from public.sportsbook_profiles where id=wager.sportsbook_profile_id for update;
    update public.sportsbook_wagers set status=new_status,settled_at=now(),settlement_version=settlement_version+1,net_profit=profit,settled_return=payout where id=wager.id;
    if payout>0 then
      update public.sportsbook_profiles set current_balance=current_balance+payout,updated_at=now() where id=wager.sportsbook_profile_id;
      insert into public.sportsbook_balance_transactions(sportsbook_profile_id,wager_id,amount,balance_before,balance_after,transaction_type,description) values(wager.sportsbook_profile_id,wager.id,payout,before_balance,before_balance+payout,'wager_payout',case when new_status='voided' then 'Voided wager returned' else 'Settled wager payout' end);
    end if;
  end loop;
  update public.sportsbook_markets set status=case when market.status='voided' then 'voided' else 'settled' end,settlement_result=outcome,settled_at=now(),updated_at=now() where id=market_uuid;
  insert into public.sportsbook_admin_audit(action_type,market_id,new_value,reason) values('market_settled',market_uuid,outcome,reason);
  return jsonb_build_object('market_id',market_uuid,'status',case when market.status='voided' then 'voided' else 'settled' end);
end $$;

create or replace function public.sportsbook_admin_resettle_market(session_token text, market_uuid uuid, reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare wager public.sportsbook_wagers%rowtype; before_balance numeric;
begin
  if not public.sportsbook_admin_authorized(session_token) then raise exception 'Administrator access required.'; end if;
  if coalesce(length(btrim(reason)),0)<4 then raise exception 'A written reason is required to resettle a market.'; end if;
  for wager in select distinct w.* from public.sportsbook_wagers w join public.sportsbook_wager_legs leg on leg.wager_id=w.id where leg.market_id=market_uuid and w.status in ('won','voided') for update loop
    select current_balance into before_balance from public.sportsbook_profiles where id=wager.sportsbook_profile_id for update;
    if before_balance < wager.settled_return then raise exception 'Cannot resettle while a related profile has spent its previous return. Add an administrator correction first.'; end if;
    update public.sportsbook_profiles set current_balance=current_balance-wager.settled_return,updated_at=now() where id=wager.sportsbook_profile_id;
    insert into public.sportsbook_balance_transactions(sportsbook_profile_id,wager_id,amount,balance_before,balance_after,transaction_type,description) values(wager.sportsbook_profile_id,wager.id,-wager.settled_return,before_balance,before_balance-wager.settled_return,'resettlement_reversal','Prior settlement reversed: '||reason);
    update public.sportsbook_wagers set status='pending',settled_at=null,net_profit=null,settled_return=0 where id=wager.id;
  end loop;
  update public.sportsbook_wager_legs set leg_status='pending' where market_id=market_uuid;
  update public.sportsbook_markets set status='closed',settlement_result='{}'::jsonb,settled_at=null,updated_at=now() where id=market_uuid;
  insert into public.sportsbook_admin_audit(action_type,market_id,reason) values('market_resettlement_started',market_uuid,reason);
  return jsonb_build_object('market_id',market_uuid,'status','closed');
end $$;

grant execute on function public.sportsbook_place_wager(text, jsonb, numeric, text) to anon, authenticated;
grant execute on function public.sportsbook_admin_adjust_credits(text, uuid, numeric, text) to anon, authenticated;

select 'GTO Sportsbook decimal credits are ready.' as result;
