-- GTO Racing League Fantasy League — scoring and administration upgrade
-- Run this AFTER fantasy_setup.sql in the Supabase SQL Editor as the postgres role.
-- It adds official scoring, lineup history, public results, player profiles,
-- settings, audit history, and administrator management functions.

create or replace function public.fantasy_public_standings(season text)
returns jsonb language sql stable security definer set search_path = public as $$
  with setting as (
    select season_drops from public.fantasy_settings where id
  ), scored as (
    select w.player_id, w.round_id, w.raw_score, w.weekly_rank, w.championship_points,
      r.race_index, r.race_name,
      row_number() over (partition by w.player_id order by w.championship_points asc, r.race_index asc) as drop_order,
      count(*) over (partition by w.player_id) as scored_rounds
    from public.fantasy_week_scores w
    join public.fantasy_rounds r on r.id = w.round_id
    where r.season_id = season and r.status = 'scored'
  ), totals as (
    select s.player_id,
      sum(s.championship_points) as raw_points,
      sum(s.championship_points) filter (where s.drop_order > (select season_drops from setting)) as counting_points,
      count(*) as rounds_entered,
      avg(s.raw_score) as average_raw_score,
      max(s.raw_score) as best_weekly_score,
      min(s.championship_points) filter (where s.drop_order > (select season_drops from setting)) as lowest_counting_score,
      count(*) filter (where s.weekly_rank = 1) as weekly_wins,
      least(max(s.scored_rounds), (select season_drops from setting)) as drops_used,
      coalesce(jsonb_agg(jsonb_build_object('round_id', s.round_id, 'race_index', s.race_index, 'race_name', s.race_name, 'points', s.championship_points) order by s.race_index) filter (where s.drop_order <= (select season_drops from setting)), '[]'::jsonb) as dropped_rounds
    from scored s
    group by s.player_id
  ), selections as (
    select l.player_id, d.driver_name, count(*) as picks,
      row_number() over (partition by l.player_id order by count(*) desc, d.driver_name) as pick_rank
    from public.fantasy_lineups l
    join public.fantasy_rounds r on r.id = l.round_id
    join public.fantasy_lineup_drivers d on d.lineup_id = l.id
    where r.season_id = season and r.status = 'scored'
    group by l.player_id, d.driver_name
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'player_id', p.id,
    'display_name', p.display_name,
    'counting_points', coalesce(t.counting_points, 0),
    'raw_points', coalesce(t.raw_points, 0),
    'weekly_wins', coalesce(t.weekly_wins, 0),
    'rounds_entered', coalesce(t.rounds_entered, 0),
    'average_raw_score', round(t.average_raw_score, 2),
    'best_weekly_score', t.best_weekly_score,
    'lowest_counting_score', t.lowest_counting_score,
    'drops_used', coalesce(t.drops_used, 0),
    'dropped_rounds', coalesce(t.dropped_rounds, '[]'::jsonb),
    'most_selected_driver', s.driver_name
  ) order by coalesce(t.counting_points, 0) desc, coalesce(t.raw_points, 0) desc, p.display_name), '[]'::jsonb)
  from public.fantasy_players p
  left join totals t on t.player_id = p.id
  left join selections s on s.player_id = p.id and s.pick_rank = 1
  where p.status = 'active'
$$;

create or replace function public.fantasy_my_lineup_history(device_token text, requested_season text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'round_id', r.id,
    'season_id', r.season_id,
    'race_index', r.race_index,
    'race_name', r.race_name,
    'status', r.status,
    'original_submitted_at', l.original_submitted_at,
    'updated_at', l.updated_at,
    'drivers', (select coalesce(jsonb_agg(jsonb_build_object('tier', d.tier, 'driver_name', d.driver_name) order by d.tier), '[]'::jsonb) from public.fantasy_lineup_drivers d where d.lineup_id = l.id),
    'raw_score', w.raw_score,
    'weekly_rank', w.weekly_rank,
    'championship_points', w.championship_points,
    'dropped', coalesce(drop_state.dropped, false)
  ) order by r.race_index), '[]'::jsonb)
  from public.fantasy_lineups l
  join public.fantasy_rounds r on r.id = l.round_id
  left join public.fantasy_week_scores w on w.round_id = l.round_id and w.player_id = l.player_id
  left join lateral (
    select exists(
      select 1
      from public.fantasy_week_scores ww
      join public.fantasy_rounds rr on rr.id = ww.round_id
      where ww.player_id = l.player_id and rr.season_id = r.season_id and rr.status = 'scored'
        and (ww.championship_points, rr.race_index) in (
          select w2.championship_points, r2.race_index
          from public.fantasy_week_scores w2 join public.fantasy_rounds r2 on r2.id = w2.round_id
          where w2.player_id = l.player_id and r2.season_id = r.season_id and r2.status = 'scored'
          order by w2.championship_points asc, r2.race_index asc
          limit (select season_drops from public.fantasy_settings where id)
        ) and ww.round_id = l.round_id
    ) as dropped
  ) drop_state on true
  where l.player_id = public.fantasy_device_player(device_token) and r.season_id = requested_season
$$;

create or replace function public.fantasy_public_week_results(round_uuid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when exists(select 1 from public.fantasy_rounds where id = round_uuid and status = 'scored') then
    coalesce(jsonb_agg(jsonb_build_object(
      'player', p.display_name,
      'raw_score', w.raw_score,
      'weekly_rank', w.weekly_rank,
      'championship_points', w.championship_points,
      'drivers', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'tier', ld.tier,
          'driver_name', ld.driver_name,
          'finishing_position', ds.finishing_position,
          'finish_points', ds.finish_points,
          'win_bonus', ds.win_bonus,
          'podium_bonus', ds.podium_bonus,
          'pole_bonus', ds.pole_bonus,
          'fastest_lap_bonus', ds.fastest_lap_bonus,
          'led_a_lap_bonus', ds.led_a_lap_bonus,
          'most_laps_led_bonus', ds.most_laps_led_bonus,
          'movement_bonus', ds.movement_bonus,
          'total_score', ds.total_score
        ) order by ld.tier), '[]'::jsonb)
        from public.fantasy_lineups l
        join public.fantasy_lineup_drivers ld on ld.lineup_id = l.id
        left join public.fantasy_driver_scores ds on ds.round_id = l.round_id and ds.driver_name = ld.driver_name
        where l.round_id = round_uuid and l.player_id = w.player_id
      )
    ) order by w.weekly_rank, p.display_name), '[]'::jsonb)
  else '[]'::jsonb end
  from public.fantasy_week_scores w
  join public.fantasy_players p on p.id = w.player_id
  where w.round_id = round_uuid
$$;

create or replace function public.fantasy_public_player_profiles(requested_season text)
returns jsonb language sql stable security definer set search_path = public as $$
  with standings as (
    select value as row from jsonb_array_elements(public.fantasy_public_standings(requested_season))
  ), selections as (
    select l.player_id, d.tier, d.driver_name, count(*) as selections,
      row_number() over (partition by l.player_id, d.tier order by count(*) desc, d.driver_name) as tier_rank
    from public.fantasy_lineups l join public.fantasy_rounds r on r.id = l.round_id join public.fantasy_lineup_drivers d on d.lineup_id = l.id
    where r.season_id = requested_season and r.status = 'scored'
    group by l.player_id, d.tier, d.driver_name
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'player_id', s.row->>'player_id',
    'display_name', s.row->>'display_name',
    'counting_points', s.row->'counting_points',
    'raw_points', s.row->'raw_points',
    'rounds_entered', s.row->'rounds_entered',
    'weekly_wins', s.row->'weekly_wins',
    'best_weekly_score', s.row->'best_weekly_score',
    'average_raw_score', s.row->'average_raw_score',
    'dropped_rounds', s.row->'dropped_rounds',
    'most_selected_by_tier', coalesce((select jsonb_agg(jsonb_build_object('tier', q.tier, 'driver_name', q.driver_name, 'selections', q.selections) order by q.tier) from selections q where q.player_id::text = s.row->>'player_id' and q.tier_rank = 1), '[]'::jsonb),
    'different_drivers_used', (select count(distinct q.driver_name) from selections q where q.player_id::text = s.row->>'player_id')
  ) order by (s.row->>'counting_points')::int desc, s.row->>'display_name'), '[]'::jsonb)
  from standings s
$$;

create or replace function public.fantasy_admin_list_players(session_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.fantasy_admin_authorized(session_token) then
    coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'display_name', p.display_name, 'status', p.status, 'created_at', p.created_at, 'disabled_reason', p.disabled_reason, 'lineups', coalesce(l.lineups, 0)) order by p.display_name), '[]'::jsonb)
  else '[]'::jsonb end
  from public.fantasy_players p
  left join lateral (select count(*) as lineups from public.fantasy_lineups where player_id = p.id) l on true
$$;

create or replace function public.fantasy_admin_update_player(session_token text, player_uuid uuid, action_name text, value text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare saved public.fantasy_players%rowtype;
begin
  if not public.fantasy_admin_authorized(session_token) then raise exception 'Administrator access required.'; end if;
  if action_name = 'rename' then
    update public.fantasy_players set display_name = public.fantasy_validate_name(value), updated_at = now() where id = player_uuid returning * into saved;
  elsif action_name = 'disable' then
    update public.fantasy_players set status = 'disabled', disabled_reason = coalesce(nullif(btrim(value), ''), 'Disabled by administrator.'), updated_at = now() where id = player_uuid returning * into saved;
  elsif action_name = 'enable' then
    update public.fantasy_players set status = 'active', disabled_reason = null, updated_at = now() where id = player_uuid returning * into saved;
  else raise exception 'Unsupported player action.';
  end if;
  if saved.id is null then raise exception 'Fantasy player not found.'; end if;
  insert into public.fantasy_audit_log (action, actor_player_id, payload) values ('admin_player_' || action_name, saved.id, jsonb_build_object('value', value));
  return jsonb_build_object('id', saved.id, 'display_name', saved.display_name, 'status', saved.status);
end $$;

create or replace function public.fantasy_admin_reset_recovery_code(session_token text, player_uuid uuid, recovery_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.fantasy_admin_authorized(session_token) then raise exception 'Administrator access required.'; end if;
  if coalesce(length(recovery_code), 0) < 12 then raise exception 'Invalid replacement recovery code.'; end if;
  update public.fantasy_recovery_codes set reset_at = now() where player_id = player_uuid and reset_at is null;
  insert into public.fantasy_recovery_codes (player_id, code_hash) values (player_uuid, public.fantasy_hash(recovery_code));
  insert into public.fantasy_audit_log (action, actor_player_id) values ('admin_recovery_code_reset', player_uuid);
  return jsonb_build_object('player_id', player_uuid, 'reset', true);
end $$;

create or replace function public.fantasy_admin_settings(session_token text, payload jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare saved public.fantasy_settings%rowtype;
begin
  if not public.fantasy_admin_authorized(session_token) then raise exception 'Administrator access required.'; end if;
  if payload is not null then
    update public.fantasy_settings set
      standings_weight = coalesce((payload->>'standings_weight')::numeric, standings_weight),
      prediction_weight = coalesce((payload->>'prediction_weight')::numeric, prediction_weight),
      previous_standings_through_round = coalesce((payload->>'previous_standings_through_round')::smallint, previous_standings_through_round),
      season_drops = coalesce((payload->>'season_drops')::smallint, season_drops),
      consecutive_driver_restriction = coalesce((payload->>'consecutive_driver_restriction')::boolean, consecutive_driver_restriction),
      updated_at = now()
    where id returning * into saved;
    if saved.standings_weight + saved.prediction_weight <> 1 then raise exception 'Standings and prediction weights must total 1.0000.'; end if;
    insert into public.fantasy_audit_log (action, payload) values ('settings_saved', payload);
  else select * into saved from public.fantasy_settings where id;
  end if;
  return jsonb_build_object('timezone', saved.timezone, 'open_day', saved.open_day, 'open_time', saved.open_time, 'lock_day', saved.lock_day, 'lock_time', saved.lock_time, 'standings_weight', saved.standings_weight, 'prediction_weight', saved.prediction_weight, 'previous_standings_through_round', saved.previous_standings_through_round, 'season_drops', saved.season_drops, 'consecutive_driver_restriction', saved.consecutive_driver_restriction);
end $$;

create or replace function public.fantasy_admin_score_round(session_token text, round_uuid uuid, official_results jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare round_record public.fantasy_rounds%rowtype;
declare cfg public.fantasy_settings%rowtype;
declare max_led integer := 0;
begin
  if not public.fantasy_admin_authorized(session_token) then raise exception 'Administrator access required.'; end if;
  select * into round_record from public.fantasy_rounds where id = round_uuid for update;
  if round_record.id is null then raise exception 'Fantasy round not found.'; end if;
  if round_record.status in ('canceled', 'scored') then raise exception 'This round cannot be scored in its current state.'; end if;
  if jsonb_typeof(official_results) <> 'array' or jsonb_array_length(official_results) = 0 then raise exception 'Official results are required before Fantasy League scoring can be finalized.'; end if;
  select * into cfg from public.fantasy_settings where id;
  select coalesce(max(greatest(0, coalesce((item->>'laps_led')::int, 0))), 0) into max_led from jsonb_array_elements(official_results) item;

  delete from public.fantasy_driver_scores where round_id = round_uuid;
  insert into public.fantasy_driver_scores (
    round_id, driver_name, finishing_position, official_race_points, qualifying_position, laps_led,
    finish_points, win_bonus, podium_bonus, pole_bonus, fastest_lap_bonus, led_a_lap_bonus, most_laps_led_bonus, movement_bonus, total_score, source
  )
  select round_uuid,
    item->>'driver_name',
    nullif(item->>'finishing_position','')::int,
    coalesce(nullif(item->>'official_race_points','')::int, 0),
    nullif(item->>'qualifying_position','')::int,
    coalesce(nullif(item->>'laps_led','')::int, 0),
    case when nullif(item->>'finishing_position','') is null then 0 else coalesce((cfg.finishing_scale ->> least(15, greatest(1, (item->>'finishing_position')::int))::text)::int, 1) end,
    case when nullif(item->>'finishing_position','')::int = 1 then (cfg.bonuses->>'win')::int else 0 end,
    case when nullif(item->>'finishing_position','')::int between 1 and 3 then (cfg.bonuses->>'podium')::int else 0 end,
    case when coalesce((item->>'pole')::boolean, false) then (cfg.bonuses->>'pole')::int else 0 end,
    case when coalesce((item->>'fastest_lap')::boolean, false) then (cfg.bonuses->>'fastest_lap')::int else 0 end,
    case when coalesce((item->>'laps_led')::int, 0) > 0 then (cfg.bonuses->>'led_a_lap')::int else 0 end,
    case when max_led > 0 and coalesce((item->>'laps_led')::int, 0) = max_led then (cfg.bonuses->>'most_laps_led')::int else 0 end,
    case
      when coalesce(nullif(item->>'qualifying_position','')::int - nullif(item->>'finishing_position','')::int, 0) >= 10 then (cfg.bonuses->>'gain_10_plus')::int
      when coalesce(nullif(item->>'qualifying_position','')::int - nullif(item->>'finishing_position','')::int, 0) between 6 and 9 then (cfg.bonuses->>'gain_6_to_9')::int
      when coalesce(nullif(item->>'qualifying_position','')::int - nullif(item->>'finishing_position','')::int, 0) between 3 and 5 then (cfg.bonuses->>'gain_3_to_5')::int
      else 0
    end,
    0,
    item
  from jsonb_array_elements(official_results) item;
  update public.fantasy_driver_scores set total_score = finish_points + win_bonus + podium_bonus + pole_bonus + fastest_lap_bonus + led_a_lap_bonus + most_laps_led_bonus + movement_bonus where round_id = round_uuid;

  delete from public.fantasy_week_scores where round_id = round_uuid;
  with lineup_totals as (
    select l.player_id, sum(ds.total_score)::int as raw_score,
      min(ds.finishing_position) as best_finish,
      sum(ds.official_race_points)::int as official_points,
      sum(coalesce(ds.qualifying_position, 0) - coalesce(ds.finishing_position, 0))::int as movement,
      sum(ds.laps_led)::int as laps_led,
      sum(coalesce(ds.qualifying_position, 99))::int as qualifying_total,
      min(l.original_submitted_at) as submitted_at
    from public.fantasy_lineups l
    join public.fantasy_lineup_drivers d on d.lineup_id = l.id
    left join public.fantasy_driver_scores ds on ds.round_id = l.round_id and ds.driver_name = d.driver_name
    where l.round_id = round_uuid
    group by l.player_id
  ), ranked as (
    select *, row_number() over (order by raw_score desc, best_finish asc nulls last, official_points desc, movement desc, laps_led desc, qualifying_total asc, submitted_at asc) as weekly_rank
    from lineup_totals
  )
  insert into public.fantasy_week_scores (round_id, player_id, raw_score, weekly_rank, championship_points, tiebreak)
  select round_uuid, player_id, raw_score, weekly_rank,
    coalesce((cfg.fantasy_championship_scale ->> least(15, weekly_rank)::text)::int, 1),
    jsonb_build_object('best_finish', best_finish, 'official_points', official_points, 'positions_gained', movement, 'laps_led', laps_led, 'qualifying_total', qualifying_total, 'submitted_at', submitted_at)
  from ranked;
  update public.fantasy_rounds set status = 'scored', results_finalized_at = now(), updated_at = now() where id = round_uuid;
  insert into public.fantasy_audit_log (action, round_id, payload) values ('round_scored', round_uuid, jsonb_build_object('result_count', jsonb_array_length(official_results)));
  return public.fantasy_public_week_results(round_uuid);
end $$;

create or replace function public.fantasy_admin_reopen_round(session_token text, round_uuid uuid, reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.fantasy_admin_authorized(session_token) then raise exception 'Administrator access required.'; end if;
  if coalesce(length(btrim(reason)), 0) < 4 then raise exception 'A clear audit reason is required to reopen a round.'; end if;
  update public.fantasy_rounds set status = 'not_open', updated_at = now() where id = round_uuid;
  if not found then raise exception 'Fantasy round not found.'; end if;
  insert into public.fantasy_audit_log (action, round_id, payload) values ('round_reopened', round_uuid, jsonb_build_object('reason', reason));
  return jsonb_build_object('round_id', round_uuid, 'status', 'not_open');
end $$;

create or replace function public.fantasy_admin_audit(session_token text, max_rows integer default 100)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.fantasy_admin_authorized(session_token) then
    coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'action', a.action, 'actor_player_id', a.actor_player_id, 'round_id', a.round_id, 'payload', a.payload, 'created_at', a.created_at) order by a.id desc), '[]'::jsonb)
  else '[]'::jsonb end
  from (select * from public.fantasy_audit_log order by id desc limit least(greatest(max_rows, 1), 250)) a
$$;

create or replace function public.fantasy_admin_save_round(session_token text, payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare saved public.fantasy_rounds%rowtype;
declare prior_status text;
begin
  if not public.fantasy_admin_authorized(session_token) then raise exception 'Administrator access required.'; end if;
  if coalesce(payload->>'status','not_open') = 'open' then
    select status into prior_status from public.fantasy_rounds where season_id = payload->>'season_id' and race_index = (payload->>'race_index')::int - 1;
    if prior_status is not null and prior_status not in ('scored', 'canceled') then raise exception 'Score or cancel the previous Fantasy League round before opening the next one.'; end if;
  end if;
  insert into public.fantasy_rounds (season_id, race_index, race_name, race_label, status, opens_at, locks_at, standings_source)
  values (payload->>'season_id', (payload->>'race_index')::int, payload->>'race_name', payload->>'race_label', coalesce(payload->>'status','not_open'), nullif(payload->>'opens_at','')::timestamptz, nullif(payload->>'locks_at','')::timestamptz, coalesce(payload->>'standings_source','previous_season'))
  on conflict (season_id, race_index) do update set race_name = excluded.race_name, race_label = excluded.race_label, status = excluded.status, opens_at = excluded.opens_at, locks_at = excluded.locks_at, standings_source = excluded.standings_source, updated_at = now()
  returning * into saved;
  insert into public.fantasy_audit_log (action, round_id, payload) values ('round_saved', saved.id, payload);
  return to_jsonb(saved);
end $$;

grant execute on function public.fantasy_my_lineup_history(text, text) to anon, authenticated;
grant execute on function public.fantasy_public_week_results(uuid) to anon, authenticated;
grant execute on function public.fantasy_public_player_profiles(text) to anon, authenticated;
grant execute on function public.fantasy_admin_list_players(text) to anon, authenticated;
grant execute on function public.fantasy_admin_update_player(text, uuid, text, text) to anon, authenticated;
grant execute on function public.fantasy_admin_reset_recovery_code(text, uuid, text) to anon, authenticated;
grant execute on function public.fantasy_admin_settings(text, jsonb) to anon, authenticated;
grant execute on function public.fantasy_admin_score_round(text, uuid, jsonb) to anon, authenticated;
grant execute on function public.fantasy_admin_reopen_round(text, uuid, text) to anon, authenticated;
grant execute on function public.fantasy_admin_audit(text, integer) to anon, authenticated;

select 'Fantasy League scoring and administration upgrade is ready.' as result;
