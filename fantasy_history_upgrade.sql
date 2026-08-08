-- GTO Racing League Fantasy League: history, insights, and statistics upgrade.
-- Run once AFTER fantasy_setup.sql, fantasy_upgrade.sql, and fantasy_settings_update.sql.
-- It preserves every existing Fantasy profile, lineup, tier snapshot, score, and standing.

create table if not exists public.fantasy_round_insights (
  round_id uuid primary key references public.fantasy_rounds(id) on delete cascade,
  overall_perfect_lineup jsonb not null default '[]'::jsonb,
  overall_perfect_score integer not null default 0,
  awards jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now()
);

create table if not exists public.fantasy_player_round_metrics (
  round_id uuid not null references public.fantasy_rounds(id) on delete cascade,
  player_id uuid not null references public.fantasy_players(id) on delete cascade,
  actual_score integer not null default 0,
  eligible_perfect_lineup jsonb not null default '[]'::jsonb,
  eligible_perfect_score integer not null default 0,
  lineup_efficiency numeric(7,3),
  generated_at timestamptz not null default now(),
  primary key (round_id, player_id)
);

create table if not exists public.fantasy_driver_round_metrics (
  round_id uuid not null references public.fantasy_rounds(id) on delete cascade,
  driver_name text not null,
  tier smallint check (tier between 1 and 3),
  projected_fantasy_points numeric(8,2),
  actual_fantasy_points integer not null default 0,
  selection_count integer not null default 0,
  selection_percentage numeric(7,3),
  is_mvp boolean not null default false,
  is_bust boolean not null default false,
  is_sleeper boolean not null default false,
  generated_at timestamptz not null default now(),
  primary key (round_id, driver_name)
);

create table if not exists public.fantasy_season_metadata (
  season_id text primary key,
  scheduled_rounds integer not null check (scheduled_rounds > 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.fantasy_season_recaps (
  season_id text primary key,
  recap jsonb not null default '{}'::jsonb,
  is_complete boolean not null default false,
  generated_at timestamptz not null default now(),
  completed_at timestamptz
);

create or replace function public.fantasy_public_settings()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'timezone', timezone,
    'open_day', open_day,
    'open_time', open_time,
    'lock_day', lock_day,
    'lock_time', lock_time,
    'standings_weight', standings_weight,
    'prediction_weight', prediction_weight,
    'previous_standings_through_round', previous_standings_through_round,
    'season_drops', season_drops,
    'consecutive_driver_restriction', consecutive_driver_restriction,
    'finishing_scale', finishing_scale,
    'bonuses', bonuses
  ) from public.fantasy_settings where id
$$;

create or replace function public.fantasy_refresh_round_insights(requested_round uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  round_record public.fantasy_rounds%rowtype;
  player_record record;
  prior_drivers text[];
  eligible_lineup jsonb;
  eligible_score integer;
  overall_lineup jsonb;
  overall_score integer;
  award_data jsonb;
  lineup_count integer;
begin
  select * into round_record from public.fantasy_rounds where id = requested_round;
  if round_record.id is null or round_record.status <> 'scored' then return; end if;

  delete from public.fantasy_player_round_metrics where round_id = requested_round;
  delete from public.fantasy_driver_round_metrics where round_id = requested_round;

  select count(*) into lineup_count from public.fantasy_lineups where round_id = requested_round;
  insert into public.fantasy_driver_round_metrics (
    round_id, driver_name, tier, projected_fantasy_points, actual_fantasy_points,
    selection_count, selection_percentage
  )
  select
    requested_round,
    tier.driver_name,
    tier.tier,
    nullif(tier.source->>'projected_fantasy_points', '')::numeric,
    coalesce(score.total_score, 0),
    coalesce(picks.pick_count, 0),
    case when lineup_count > 0 then round(coalesce(picks.pick_count, 0)::numeric * 100 / lineup_count, 3) else null end
  from public.fantasy_driver_tiers tier
  left join public.fantasy_driver_scores score on score.round_id = requested_round and score.driver_name = tier.driver_name
  left join (
    select driver_name, count(*) as pick_count
    from public.fantasy_lineups lineups
    join public.fantasy_lineup_drivers drivers on drivers.lineup_id = lineups.id
    where lineups.round_id = requested_round
    group by driver_name
  ) picks on picks.driver_name = tier.driver_name
  where tier.round_id = requested_round and tier.entered;

  with best as (
    select driver_name from public.fantasy_driver_round_metrics
    where round_id = requested_round
    order by actual_fantasy_points desc, selection_count asc, driver_name
    limit 1
  )
  update public.fantasy_driver_round_metrics metric set is_mvp = true
  from best where metric.round_id = requested_round and metric.driver_name = best.driver_name;

  with worst_expectation as (
    select driver_name from public.fantasy_driver_round_metrics
    where round_id = requested_round and projected_fantasy_points is not null and projected_fantasy_points >= 8
    order by (projected_fantasy_points - actual_fantasy_points) desc, projected_fantasy_points desc, driver_name
    limit 1
  )
  update public.fantasy_driver_round_metrics metric set is_bust = true
  from worst_expectation where metric.round_id = requested_round and metric.driver_name = worst_expectation.driver_name;

  with sleeper as (
    select driver_name from public.fantasy_driver_round_metrics
    where round_id = requested_round and selection_count > 0
    order by (actual_fantasy_points * (1 - coalesce(selection_percentage, 100) / 100.0)) desc,
      actual_fantasy_points desc, selection_percentage asc, driver_name
    limit 1
  )
  update public.fantasy_driver_round_metrics metric set is_sleeper = true
  from sleeper where metric.round_id = requested_round and metric.driver_name = sleeper.driver_name;

  with ranked as (
    select distinct on (tier) tier, driver_name, actual_fantasy_points
    from public.fantasy_driver_round_metrics
    where round_id = requested_round
    order by tier, actual_fantasy_points desc, selection_count asc, driver_name
  )
  select coalesce(jsonb_agg(jsonb_build_object('tier', tier, 'driver_name', driver_name, 'fantasy_points', actual_fantasy_points) order by tier), '[]'::jsonb),
    coalesce(sum(actual_fantasy_points), 0)::int
  into overall_lineup, overall_score from ranked;

  for player_record in
    select score.player_id, score.raw_score
    from public.fantasy_week_scores score
    where score.round_id = requested_round
  loop
    select coalesce(array_agg(previous_driver.driver_name), '{}'::text[])
    into prior_drivers
    from public.fantasy_lineups previous_lineup
    join public.fantasy_lineup_drivers previous_driver on previous_driver.lineup_id = previous_lineup.id
    join public.fantasy_rounds previous_round on previous_round.id = previous_lineup.round_id
    where previous_lineup.player_id = player_record.player_id
      and previous_round.season_id = round_record.season_id
      and previous_round.race_index = round_record.race_index - 1;

    with ranked as (
      select distinct on (metric.tier) metric.tier, metric.driver_name, metric.actual_fantasy_points
      from public.fantasy_driver_round_metrics metric
      where metric.round_id = requested_round
        and not (metric.driver_name = any(coalesce(prior_drivers, '{}'::text[])))
      order by metric.tier, metric.actual_fantasy_points desc, metric.selection_count asc, metric.driver_name
    )
    select coalesce(jsonb_agg(jsonb_build_object('tier', tier, 'driver_name', driver_name, 'fantasy_points', actual_fantasy_points) order by tier), '[]'::jsonb),
      coalesce(sum(actual_fantasy_points), 0)::int
    into eligible_lineup, eligible_score from ranked;

    insert into public.fantasy_player_round_metrics (
      round_id, player_id, actual_score, eligible_perfect_lineup, eligible_perfect_score, lineup_efficiency
    ) values (
      requested_round, player_record.player_id, player_record.raw_score, eligible_lineup, eligible_score,
      case when eligible_score > 0 then least(100, round(player_record.raw_score::numeric * 100 / eligible_score, 3)) else null end
    );
  end loop;

  select jsonb_build_object(
    'weekly_winner', (
      select jsonb_build_object('player_id', player.id, 'player', player.display_name, 'fantasy_points', score.raw_score, 'weekly_rank', score.weekly_rank)
      from public.fantasy_week_scores score join public.fantasy_players player on player.id = score.player_id
      where score.round_id = requested_round order by score.weekly_rank, player.display_name limit 1
    ),
    'closest_to_perfect', (
      select jsonb_build_object('player_id', player.id, 'player', player.display_name, 'fantasy_points', metric.actual_score,
        'eligible_perfect_score', metric.eligible_perfect_score, 'lineup_efficiency', metric.lineup_efficiency)
      from public.fantasy_player_round_metrics metric join public.fantasy_players player on player.id = metric.player_id
      where metric.round_id = requested_round order by metric.lineup_efficiency desc nulls last, metric.actual_score desc, player.display_name limit 1
    ),
    'best_sleeper_pick', (
      select jsonb_build_object('driver_name', driver_name, 'tier', tier, 'fantasy_points', actual_fantasy_points,
        'selection_percentage', selection_percentage, 'selection_count', selection_count)
      from public.fantasy_driver_round_metrics where round_id = requested_round and is_sleeper limit 1
    ),
    'fantasy_mvp', (
      select jsonb_build_object('driver_name', driver_name, 'tier', tier, 'fantasy_points', actual_fantasy_points,
        'projected_fantasy_points', projected_fantasy_points, 'selection_percentage', selection_percentage)
      from public.fantasy_driver_round_metrics where round_id = requested_round and is_mvp limit 1
    ),
    'fantasy_bust', (
      select jsonb_build_object('driver_name', driver_name, 'tier', tier, 'fantasy_points', actual_fantasy_points,
        'projected_fantasy_points', projected_fantasy_points,
        'difference', round(projected_fantasy_points - actual_fantasy_points, 2), 'selection_percentage', selection_percentage)
      from public.fantasy_driver_round_metrics where round_id = requested_round and is_bust limit 1
    )
  ) into award_data;

  insert into public.fantasy_round_insights (round_id, overall_perfect_lineup, overall_perfect_score, awards, generated_at)
  values (requested_round, overall_lineup, overall_score, coalesce(award_data, '{}'::jsonb), now())
  on conflict (round_id) do update set overall_perfect_lineup = excluded.overall_perfect_lineup,
    overall_perfect_score = excluded.overall_perfect_score, awards = excluded.awards, generated_at = excluded.generated_at;

  perform public.fantasy_rebuild_season_recap(round_record.season_id);
end $$;

create or replace function public.fantasy_rebuild_season_recap(requested_season text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare recap_data jsonb; scheduled integer; scored integer; complete boolean;
begin
  select scheduled_rounds into scheduled from public.fantasy_season_metadata where season_id = requested_season;
  select count(*) into scored from public.fantasy_rounds where season_id = requested_season and status in ('scored', 'canceled');
  complete := scheduled is not null and scored >= scheduled;

  select jsonb_build_object(
    'season_id', requested_season,
    'is_complete', complete,
    'fantasy_champion', (
      select jsonb_build_object('player_id', row->>'player_id', 'player', row->>'display_name',
        'counting_points', row->'counting_points', 'weekly_wins', row->'weekly_wins',
        'average_score', row->'average_raw_score')
      from jsonb_array_elements(public.fantasy_public_standings(requested_season)) row limit 1
    ),
    'final_standings', public.fantasy_public_standings(requested_season),
    'most_weekly_wins', (
      select jsonb_build_object('player', player.display_name, 'weekly_wins', count(*))
      from public.fantasy_week_scores score join public.fantasy_rounds round on round.id = score.round_id
      join public.fantasy_players player on player.id = score.player_id
      where round.season_id = requested_season and round.status = 'scored' and score.weekly_rank = 1
      group by player.id, player.display_name order by count(*) desc, player.display_name limit 1
    ),
    'highest_weekly_score', (
      select jsonb_build_object('player', player.display_name, 'fantasy_points', score.raw_score, 'round_id', score.round_id)
      from public.fantasy_week_scores score join public.fantasy_rounds round on round.id = score.round_id
      join public.fantasy_players player on player.id = score.player_id
      where round.season_id = requested_season and round.status = 'scored'
      order by score.raw_score desc, player.display_name limit 1
    ),
    'best_lineup_efficiency', (
      select jsonb_build_object('player', player.display_name, 'lineup_efficiency', metric.lineup_efficiency, 'round_id', metric.round_id)
      from public.fantasy_player_round_metrics metric join public.fantasy_rounds round on round.id = metric.round_id
      join public.fantasy_players player on player.id = metric.player_id
      where round.season_id = requested_season
      order by metric.lineup_efficiency desc nulls last, player.display_name limit 1
    ),
    'most_selected_driver', (
      select jsonb_build_object('driver_name', driver_name, 'selections', sum(selection_count))
      from public.fantasy_driver_round_metrics metric join public.fantasy_rounds round on round.id = metric.round_id
      where round.season_id = requested_season group by driver_name order by sum(selection_count) desc, driver_name limit 1
    ),
    'fantasy_driver_mvp', (
      select jsonb_build_object('driver_name', driver_name, 'fantasy_points', actual_fantasy_points, 'round_id', metric.round_id)
      from public.fantasy_driver_round_metrics metric join public.fantasy_rounds round on round.id = metric.round_id
      where round.season_id = requested_season and is_mvp order by actual_fantasy_points desc, driver_name limit 1
    ),
    'most_fantasy_mvps', (
      select jsonb_build_object('driver_name', driver_name, 'awards', count(*))
      from public.fantasy_driver_round_metrics metric join public.fantasy_rounds round on round.id = metric.round_id
      where round.season_id = requested_season and is_mvp group by driver_name order by count(*) desc, driver_name limit 1
    ),
    'most_fantasy_busts', (
      select jsonb_build_object('driver_name', driver_name, 'awards', count(*))
      from public.fantasy_driver_round_metrics metric join public.fantasy_rounds round on round.id = metric.round_id
      where round.season_id = requested_season and is_bust group by driver_name order by count(*) desc, driver_name limit 1
    ),
    'best_sleeper_pick', (
      select jsonb_build_object('driver_name', driver_name, 'fantasy_points', actual_fantasy_points, 'round_id', metric.round_id, 'selection_percentage', selection_percentage)
      from public.fantasy_driver_round_metrics metric join public.fantasy_rounds round on round.id = metric.round_id
      where round.season_id = requested_season and is_sleeper order by actual_fantasy_points * (1 - coalesce(selection_percentage, 100) / 100.0) desc, driver_name limit 1
    ),
    'closest_to_perfect_lineup', (
      select jsonb_build_object('player', player.display_name, 'lineup_efficiency', metric.lineup_efficiency, 'round_id', metric.round_id)
      from public.fantasy_player_round_metrics metric join public.fantasy_rounds round on round.id = metric.round_id
      join public.fantasy_players player on player.id = metric.player_id
      where round.season_id = requested_season order by metric.lineup_efficiency desc nulls last, player.display_name limit 1
    ),
    'highest_scoring_tier_1_driver', (
      select jsonb_build_object('driver_name', driver_name, 'average_fantasy_points', round(sum(actual_fantasy_points * selection_count)::numeric / nullif(sum(selection_count), 0), 2))
      from public.fantasy_driver_round_metrics metric join public.fantasy_rounds round on round.id = metric.round_id
      where round.season_id = requested_season and tier = 1 group by driver_name order by sum(actual_fantasy_points * selection_count)::numeric / nullif(sum(selection_count), 0) desc nulls last, driver_name limit 1
    ),
    'highest_scoring_tier_2_driver', (
      select jsonb_build_object('driver_name', driver_name, 'average_fantasy_points', round(sum(actual_fantasy_points * selection_count)::numeric / nullif(sum(selection_count), 0), 2))
      from public.fantasy_driver_round_metrics metric join public.fantasy_rounds round on round.id = metric.round_id
      where round.season_id = requested_season and tier = 2 group by driver_name order by sum(actual_fantasy_points * selection_count)::numeric / nullif(sum(selection_count), 0) desc nulls last, driver_name limit 1
    ),
    'highest_scoring_tier_3_driver', (
      select jsonb_build_object('driver_name', driver_name, 'average_fantasy_points', round(sum(actual_fantasy_points * selection_count)::numeric / nullif(sum(selection_count), 0), 2))
      from public.fantasy_driver_round_metrics metric join public.fantasy_rounds round on round.id = metric.round_id
      where round.season_id = requested_season and tier = 3 group by driver_name order by sum(actual_fantasy_points * selection_count)::numeric / nullif(sum(selection_count), 0) desc nulls last, driver_name limit 1
    )
  ) into recap_data;

  insert into public.fantasy_season_recaps (season_id, recap, is_complete, generated_at, completed_at)
  values (requested_season, coalesce(recap_data, '{}'::jsonb), complete, now(), case when complete then now() else null end)
  on conflict (season_id) do update set recap = excluded.recap, is_complete = excluded.is_complete,
    generated_at = excluded.generated_at,
    completed_at = case when excluded.is_complete then coalesce(public.fantasy_season_recaps.completed_at, now()) else null end;
  return recap_data;
end $$;

create or replace function public.fantasy_round_scored_insights_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'scored' then perform public.fantasy_refresh_round_insights(new.id); end if;
  return new;
end $$;

drop trigger if exists fantasy_round_scored_insights on public.fantasy_rounds;
create trigger fantasy_round_scored_insights after update of status on public.fantasy_rounds
for each row when (new.status = 'scored') execute function public.fantasy_round_scored_insights_trigger();

create or replace function public.fantasy_admin_save_season_metadata(session_token text, requested_season text, requested_scheduled_rounds integer)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.fantasy_admin_authorized(session_token) then raise exception 'Administrator access required.'; end if;
  if requested_scheduled_rounds is null or requested_scheduled_rounds < 1 then raise exception 'A season must have at least one scheduled round.'; end if;
  insert into public.fantasy_season_metadata (season_id, scheduled_rounds, updated_at)
  values (requested_season, requested_scheduled_rounds, now())
  on conflict (season_id) do update set scheduled_rounds = excluded.scheduled_rounds, updated_at = excluded.updated_at;
  insert into public.fantasy_audit_log(action, payload) values ('season_metadata_saved', jsonb_build_object('season_id', requested_season, 'scheduled_rounds', requested_scheduled_rounds));
  return jsonb_build_object('season_id', requested_season, 'scheduled_rounds', requested_scheduled_rounds);
end $$;

create or replace function public.fantasy_public_round_detail(requested_round uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare round_record public.fantasy_rounds%rowtype; visibility boolean;
begin
  select * into round_record from public.fantasy_rounds where id = requested_round;
  if round_record.id is null then return null; end if;
  visibility := round_record.status = 'scored' or (round_record.locks_at is not null and now() >= round_record.locks_at);
  return jsonb_build_object(
    'round_id', round_record.id,
    'season_id', round_record.season_id,
    'race_index', round_record.race_index,
    'race_name', round_record.race_name,
    'status', round_record.status,
    'pick_popularity_available', visibility,
    'pick_popularity', case when visibility then coalesce((
      select jsonb_agg(jsonb_build_object('driver_name', metric.driver_name, 'tier', metric.tier,
        'selection_count', metric.selection_count, 'selection_percentage', metric.selection_percentage)
        order by metric.tier, metric.selection_count desc, metric.driver_name)
      from public.fantasy_driver_round_metrics metric where metric.round_id = requested_round
    ), '[]'::jsonb) else '[]'::jsonb end,
    'insights', coalesce((select jsonb_build_object('overall_perfect_lineup', insight.overall_perfect_lineup,
      'overall_perfect_score', insight.overall_perfect_score, 'awards', insight.awards)
      from public.fantasy_round_insights insight where insight.round_id = requested_round), '{}'::jsonb),
    'results', case when round_record.status = 'scored' then public.fantasy_public_week_results(requested_round) else '[]'::jsonb end
  );
end $$;

-- Complete, shared record calculation. Average-based driver records require
-- at least three actual Fantasy selections; no placeholder history is created.
create or replace function public.fantasy_public_records()
returns jsonb language sql stable security definer set search_path = public as $$
  with setting as (select season_drops from public.fantasy_settings where id),
  scored as (
    select score.player_id, round.season_id, round.race_index, score.round_id, score.raw_score,
      score.weekly_rank, score.championship_points, metric.lineup_efficiency,
      row_number() over(partition by score.player_id, round.season_id order by score.championship_points, round.race_index) as drop_order
    from public.fantasy_week_scores score
    join public.fantasy_rounds round on round.id = score.round_id and round.status = 'scored'
    left join public.fantasy_player_round_metrics metric on metric.round_id = score.round_id and metric.player_id = score.player_id
  ),
  season_totals as (
    select player_id, season_id,
      sum(championship_points) filter(where drop_order > (select season_drops from setting)) as counting_points,
      sum(championship_points) as raw_points, sum(raw_score) as raw_fantasy_points,
      avg(lineup_efficiency) as efficiency
    from scored group by player_id, season_id
  ),
  season_ranks as (
    select *, dense_rank() over(partition by season_id order by counting_points desc nulls last, raw_points desc nulls last, player_id) as finish
    from season_totals
  ),
  player_base as (
    select player.id, player.display_name,
      coalesce(sum(scored.championship_points), 0) as career_points,
      coalesce(sum(scored.raw_score), 0) as career_raw_points,
      count(*) filter(where scored.weekly_rank = 1) as weekly_wins,
      max(scored.raw_score) as highest_weekly_score,
      avg(scored.lineup_efficiency) as career_efficiency,
      count(*) filter(where scored.lineup_efficiency >= 99.999) as perfect_lineups
    from public.fantasy_players player
    left join scored on scored.player_id = player.id
    group by player.id, player.display_name
  ),
  player_championships as (
    select player_id, count(*) filter(where finish = 1) as championships from season_ranks group by player_id
  ),
  player_stats as (
    select base.*, coalesce(championships.championships, 0) as championships
    from player_base base left join player_championships championships on championships.player_id = base.id
  ),
  player_sleeper_awards as (
    select lineup.player_id, count(*) as awards
    from public.fantasy_driver_round_metrics driver
    join public.fantasy_lineups lineup on lineup.round_id = driver.round_id
    join public.fantasy_lineup_drivers pick on pick.lineup_id = lineup.id and pick.driver_name = driver.driver_name
    where driver.is_sleeper group by lineup.player_id
  ),
  player_win_streaks as (
    select player_id, max(streak_length) as longest_streak from (
      select player_id, season_id, grp, count(*) as streak_length from (
        select player_id, season_id, race_index,
          race_index - row_number() over(partition by player_id, season_id order by race_index) as grp
        from scored where weekly_rank = 1
      ) wins group by player_id, season_id, grp
    ) streaks group by player_id
  ),
  player_top3 as (
    select player_id, count(*) as top3_finishes from scored where weekly_rank <= 3 group by player_id
  ),
  driver_stats as (
    select driver.driver_name,
      sum(driver.actual_fantasy_points * driver.selection_count) as points_generated,
      sum(driver.selection_count) as selections,
      sum(driver.actual_fantasy_points * driver.selection_count)::numeric / nullif(sum(driver.selection_count), 0) as average_points,
      avg(driver.selection_percentage) as selection_rate,
      count(*) filter(where driver.is_mvp) as mvps,
      count(*) filter(where driver.is_bust) as busts,
      sum(driver.actual_fantasy_points * driver.selection_count) filter(where driver.tier = 1)::numeric / nullif(sum(driver.selection_count) filter(where driver.tier = 1), 0) as tier1_average,
      sum(driver.actual_fantasy_points * driver.selection_count) filter(where driver.tier = 2)::numeric / nullif(sum(driver.selection_count) filter(where driver.tier = 2), 0) as tier2_average,
      sum(driver.actual_fantasy_points * driver.selection_count) filter(where driver.tier = 3)::numeric / nullif(sum(driver.selection_count) filter(where driver.tier = 3), 0) as tier3_average,
      sum(driver.selection_count) filter(where driver.tier = 1) as tier1_selections,
      sum(driver.selection_count) filter(where driver.tier = 2) as tier2_selections,
      sum(driver.selection_count) filter(where driver.tier = 3) as tier3_selections
    from public.fantasy_driver_round_metrics driver group by driver.driver_name
  )
  select jsonb_build_object(
    'minimum_average_sample', 3,
    'fantasy_player_records', jsonb_build_array(
      jsonb_build_object('label', 'Most Fantasy Championships', 'leaders', (select coalesce(jsonb_agg(jsonb_build_object('player_id', id, 'player', display_name, 'value', championships) order by display_name), '[]'::jsonb) from player_stats where championships = (select max(championships) from player_stats))),
      jsonb_build_object('label', 'Most Career Fantasy Points', 'leaders', (select coalesce(jsonb_agg(jsonb_build_object('player_id', id, 'player', display_name, 'value', career_points) order by display_name), '[]'::jsonb) from player_stats where career_points = (select max(career_points) from player_stats))),
      jsonb_build_object('label', 'Most Weekly Wins', 'leaders', (select coalesce(jsonb_agg(jsonb_build_object('player_id', id, 'player', display_name, 'value', weekly_wins) order by display_name), '[]'::jsonb) from player_stats where weekly_wins = (select max(weekly_wins) from player_stats))),
      jsonb_build_object('label', 'Highest Single-Race Fantasy Score', 'leaders', (select coalesce(jsonb_agg(jsonb_build_object('player_id', id, 'player', display_name, 'value', highest_weekly_score) order by display_name), '[]'::jsonb) from player_stats where highest_weekly_score = (select max(highest_weekly_score) from player_stats))),
      jsonb_build_object('label', 'Highest Single-Season Fantasy Score', 'leaders', (select coalesce(jsonb_agg(jsonb_build_object('player_id', player_id, 'player', display_name, 'value', raw_fantasy_points) order by display_name), '[]'::jsonb) from season_totals join public.fantasy_players on id = player_id where raw_fantasy_points = (select max(raw_fantasy_points) from season_totals))),
      jsonb_build_object('label', 'Best Career Lineup Efficiency', 'leaders', (select coalesce(jsonb_agg(jsonb_build_object('player_id', id, 'player', display_name, 'value', round(career_efficiency,2)) order by display_name), '[]'::jsonb) from player_stats where career_efficiency = (select max(career_efficiency) from player_stats))),
      jsonb_build_object('label', 'Best Single-Season Lineup Efficiency', 'leaders', (select coalesce(jsonb_agg(jsonb_build_object('player_id', player_id, 'player', display_name, 'value', round(efficiency,2)) order by display_name), '[]'::jsonb) from season_totals join public.fantasy_players on id = player_id where efficiency = (select max(efficiency) from season_totals))),
      jsonb_build_object('label', 'Most Consecutive Weekly Wins', 'leaders', (select coalesce(jsonb_agg(jsonb_build_object('player_id', player_stats.id, 'player', player_stats.display_name, 'value', player_win_streaks.longest_streak) order by player_stats.display_name), '[]'::jsonb) from player_stats join player_win_streaks on player_win_streaks.player_id = player_stats.id where longest_streak = (select max(longest_streak) from player_win_streaks))),
      jsonb_build_object('label', 'Most Weekly Top-3 Finishes', 'leaders', (select coalesce(jsonb_agg(jsonb_build_object('player_id', player_stats.id, 'player', player_stats.display_name, 'value', player_top3.top3_finishes) order by player_stats.display_name), '[]'::jsonb) from player_stats join player_top3 on player_top3.player_id = player_stats.id where top3_finishes = (select max(top3_finishes) from player_top3))),
      jsonb_build_object('label', 'Most Perfect / 100% Efficient Lineups', 'leaders', (select coalesce(jsonb_agg(jsonb_build_object('player_id', id, 'player', display_name, 'value', perfect_lineups) order by display_name), '[]'::jsonb) from player_stats where perfect_lineups = (select max(perfect_lineups) from player_stats))),
      jsonb_build_object('label', 'Most Best Sleeper Pick Awards', 'leaders', (select coalesce(jsonb_agg(jsonb_build_object('player_id', player_stats.id, 'player', player_stats.display_name, 'value', player_sleeper_awards.awards) order by player_stats.display_name), '[]'::jsonb) from player_stats join player_sleeper_awards on player_sleeper_awards.player_id = player_stats.id where awards = (select max(awards) from player_sleeper_awards)))
    ),
    'driver_fantasy_records', jsonb_build_array(
      jsonb_build_object('label', 'Most Career Fantasy Points Generated', 'leaders', (select coalesce(jsonb_agg(jsonb_build_object('driver_name', driver_name, 'value', points_generated) order by driver_name), '[]'::jsonb) from driver_stats where points_generated = (select max(points_generated) from driver_stats))),
      jsonb_build_object('label', 'Highest Career Average Fantasy Points', 'leaders', (select coalesce(jsonb_agg(jsonb_build_object('driver_name', driver_name, 'value', round(average_points,2)) order by driver_name), '[]'::jsonb) from driver_stats where selections >= 3 and average_points = (select max(average_points) from driver_stats where selections >= 3))),
      jsonb_build_object('label', 'Most Times Selected', 'leaders', (select coalesce(jsonb_agg(jsonb_build_object('driver_name', driver_name, 'value', selections) order by driver_name), '[]'::jsonb) from driver_stats where selections = (select max(selections) from driver_stats))),
      jsonb_build_object('label', 'Highest Career Selection Rate', 'leaders', (select coalesce(jsonb_agg(jsonb_build_object('driver_name', driver_name, 'value', round(selection_rate,2)) order by driver_name), '[]'::jsonb) from driver_stats where selections >= 3 and selection_rate = (select max(selection_rate) from driver_stats where selections >= 3))),
      jsonb_build_object('label', 'Most Fantasy MVP Awards', 'leaders', (select coalesce(jsonb_agg(jsonb_build_object('driver_name', driver_name, 'value', mvps) order by driver_name), '[]'::jsonb) from driver_stats where mvps = (select max(mvps) from driver_stats))),
      jsonb_build_object('label', 'Most Fantasy Bust Awards', 'leaders', (select coalesce(jsonb_agg(jsonb_build_object('driver_name', driver_name, 'value', busts) order by driver_name), '[]'::jsonb) from driver_stats where busts = (select max(busts) from driver_stats))),
      jsonb_build_object('label', 'Best Career Tier 1 Average', 'leaders', (select coalesce(jsonb_agg(jsonb_build_object('driver_name', driver_name, 'value', round(tier1_average,2)) order by driver_name), '[]'::jsonb) from driver_stats where tier1_selections >= 3 and tier1_average = (select max(tier1_average) from driver_stats where tier1_selections >= 3))),
      jsonb_build_object('label', 'Best Career Tier 2 Average', 'leaders', (select coalesce(jsonb_agg(jsonb_build_object('driver_name', driver_name, 'value', round(tier2_average,2)) order by driver_name), '[]'::jsonb) from driver_stats where tier2_selections >= 3 and tier2_average = (select max(tier2_average) from driver_stats where tier2_selections >= 3))),
      jsonb_build_object('label', 'Best Career Tier 3 Average', 'leaders', (select coalesce(jsonb_agg(jsonb_build_object('driver_name', driver_name, 'value', round(tier3_average,2)) order by driver_name), '[]'::jsonb) from driver_stats where tier3_selections >= 3 and tier3_average = (select max(tier3_average) from driver_stats where tier3_selections >= 3)))
    )
  )
$$;

create or replace function public.fantasy_public_player_profile(requested_player uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with setting as (select season_drops from public.fantasy_settings where id),
  scored as (
    select score.player_id, round.season_id, round.race_index, score.round_id, score.raw_score, score.weekly_rank, score.championship_points,
      row_number() over(partition by score.player_id, round.season_id order by score.championship_points, round.race_index) as drop_order
    from public.fantasy_week_scores score join public.fantasy_rounds round on round.id = score.round_id
    where round.status = 'scored'
  ), season_totals as (
    select player_id, season_id, sum(championship_points) filter(where drop_order > (select season_drops from setting)) as counting_points,
      sum(championship_points) as raw_points
    from scored group by player_id, season_id
  ), season_ranks as (
    select *, dense_rank() over(partition by season_id order by counting_points desc nulls last, raw_points desc nulls last, player_id) as championship_finish
    from season_totals
  ), usage as (
    select lineup.player_id, pick.driver_name, count(*) as selections,
      avg(driver.actual_fantasy_points) as avg_points, max(driver.actual_fantasy_points) as best_score, min(driver.actual_fantasy_points) as lowest_score
    from public.fantasy_lineups lineup join public.fantasy_lineup_drivers pick on pick.lineup_id = lineup.id
    join public.fantasy_driver_round_metrics driver on driver.round_id = lineup.round_id and driver.driver_name = pick.driver_name
    join public.fantasy_rounds round on round.id = lineup.round_id
    where round.status = 'scored' group by lineup.player_id, pick.driver_name
  )
  select case when player.id is null then null else jsonb_build_object(
    'profile', jsonb_build_object('player_id', player.id, 'display_name', player.display_name, 'created_at', player.created_at),
    'career', jsonb_build_object(
      'fantasy_championships', coalesce((select count(*) from season_ranks where player_id = player.id and championship_finish = 1), 0),
      'career_fantasy_points', coalesce((select sum(championship_points) from scored where player_id = player.id), 0),
      'weekly_wins', coalesce((select count(*) from scored where player_id = player.id and weekly_rank = 1), 0),
      'best_weekly_score', (select max(raw_score) from scored where player_id = player.id),
      'average_fantasy_points', round((select avg(raw_score) from scored where player_id = player.id), 2),
      'total_fantasy_races_played', coalesce((select count(*) from scored where player_id = player.id), 0),
      'best_championship_finish', (select min(championship_finish) from season_ranks where player_id = player.id),
      'average_championship_finish', round((select avg(championship_finish) from season_ranks where player_id = player.id), 2),
      'career_lineup_efficiency', round((select avg(metric.lineup_efficiency) from public.fantasy_player_round_metrics metric where metric.player_id = player.id), 2)
    ),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'round_id', round.id, 'season_id', round.season_id, 'race_index', round.race_index, 'race_name', round.race_name,
        'tier_1', (select pick.driver_name from public.fantasy_lineup_drivers pick where pick.lineup_id = lineup.id and pick.tier = 1),
        'tier_2', (select pick.driver_name from public.fantasy_lineup_drivers pick where pick.lineup_id = lineup.id and pick.tier = 2),
        'tier_3', (select pick.driver_name from public.fantasy_lineup_drivers pick where pick.lineup_id = lineup.id and pick.tier = 3),
        'total_fantasy_points', score.raw_score, 'weekly_finish', score.weekly_rank,
        'perfect_lineup_score', metric.eligible_perfect_score, 'lineup_efficiency', metric.lineup_efficiency,
        'submitted_at', lineup.original_submitted_at
      ) order by round.season_id desc, round.race_index desc), '[]'::jsonb)
      from public.fantasy_lineups lineup join public.fantasy_rounds round on round.id = lineup.round_id
      left join public.fantasy_week_scores score on score.round_id = lineup.round_id and score.player_id = lineup.player_id
      left join public.fantasy_player_round_metrics metric on metric.round_id = lineup.round_id and metric.player_id = lineup.player_id
      where lineup.player_id = player.id and round.status = 'scored'
    ), '[]'::jsonb),
    'driver_usage', coalesce((select jsonb_agg(jsonb_build_object('driver_name', driver_name, 'selections', selections,
      'average_fantasy_points', round(avg_points, 2), 'highest_score', best_score, 'lowest_score', lowest_score) order by selections desc, driver_name) from usage where player_id = player.id), '[]'::jsonb),
    'tier_tendencies', coalesce((
      select jsonb_agg(jsonb_build_object('tier', pick.tier, 'picks', count(*), 'avg_points', round(avg(driver.actual_fantasy_points), 2),
        'avg_efficiency', round(avg(metric.lineup_efficiency), 2), 'best_score', max(driver.actual_fantasy_points),
        'most_selected_driver', (
          select pick2.driver_name
          from public.fantasy_lineups lineup2
          join public.fantasy_lineup_drivers pick2 on pick2.lineup_id = lineup2.id
          join public.fantasy_rounds round2 on round2.id = lineup2.round_id
          where lineup2.player_id = player.id and pick2.tier = pick.tier and round2.status = 'scored'
          group by pick2.driver_name order by count(*) desc, pick2.driver_name limit 1
        )) order by pick.tier)
      from public.fantasy_lineups lineup join public.fantasy_lineup_drivers pick on pick.lineup_id = lineup.id
      join public.fantasy_driver_round_metrics driver on driver.round_id = lineup.round_id and driver.driver_name = pick.driver_name
      left join public.fantasy_player_round_metrics metric on metric.round_id = lineup.round_id and metric.player_id = lineup.player_id
      join public.fantasy_rounds round on round.id = lineup.round_id
      where lineup.player_id = player.id and round.status = 'scored' group by pick.tier
    ), '[]'::jsonb)
  ) end
  from public.fantasy_players player where player.id = requested_player
$$;

create or replace function public.fantasy_public_driver_fantasy(requested_driver text, requested_round uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with driver_rows as (
    select metric.*, round.season_id, round.race_index, round.race_name
    from public.fantasy_driver_round_metrics metric join public.fantasy_rounds round on round.id = metric.round_id
    where metric.driver_name = requested_driver
  ), selected_scores as (
    select driver.*, lineup.player_id
    from driver_rows driver join public.fantasy_lineups lineup on lineup.round_id = driver.round_id
    join public.fantasy_lineup_drivers pick on pick.lineup_id = lineup.id and pick.driver_name = driver.driver_name
  ), selected_round as (
    select coalesce(requested_round, (select round_id from driver_rows order by season_id desc, race_index desc limit 1)) as round_id
  )
  select jsonb_build_object(
    'driver_name', requested_driver,
    'summary', jsonb_build_object(
      'times_selected', coalesce((select count(*) from selected_scores), 0),
      'career_selection_rate', round((select avg(selection_percentage) from driver_rows where selection_percentage is not null), 2),
      'average_fantasy_points', round((select avg(actual_fantasy_points) from selected_scores), 2),
      'highest_fantasy_score', (select max(actual_fantasy_points) from selected_scores),
      'lowest_fantasy_score', (select min(actual_fantasy_points) from selected_scores),
      'fantasy_mvp_awards', coalesce((select count(*) from driver_rows where is_mvp), 0),
      'fantasy_bust_awards', coalesce((select count(*) from driver_rows where is_bust), 0)
    ),
    'by_tier', coalesce((select jsonb_agg(jsonb_build_object('tier', tier, 'selections', count(*),
      'average_fantasy_points', round(avg(actual_fantasy_points), 2), 'best_fantasy_score', max(actual_fantasy_points)) order by tier)
      from selected_scores group by tier), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('round_id', round_id, 'season_id', season_id, 'race_index', race_index,
      'race_name', race_name, 'tier', tier, 'fantasy_points', actual_fantasy_points,
      'projected_fantasy_points', projected_fantasy_points, 'selection_percentage', selection_percentage,
      'fantasy_mvp', is_mvp, 'fantasy_bust', is_bust) order by season_id desc, race_index desc) from driver_rows), '[]'::jsonb),
    'selected_by_round', (
      select case when round.status = 'scored' or (round.locks_at is not null and now() >= round.locks_at) then jsonb_build_object(
        'round_id', round.id, 'season_id', round.season_id, 'race_index', round.race_index,
        'selected_by', coalesce((select jsonb_agg(jsonb_build_object('player_id', player.id, 'display_name', player.display_name) order by player.display_name)
          from public.fantasy_lineups lineup join public.fantasy_lineup_drivers pick on pick.lineup_id = lineup.id
          join public.fantasy_players player on player.id = lineup.player_id
          where lineup.round_id = round.id and pick.driver_name = requested_driver), '[]'::jsonb),
        'not_selected_by', coalesce((select jsonb_agg(jsonb_build_object('player_id', player.id, 'display_name', player.display_name) order by player.display_name)
          from public.fantasy_players player where player.status = 'active' and not exists (
            select 1 from public.fantasy_lineups lineup join public.fantasy_lineup_drivers pick on pick.lineup_id = lineup.id
            where lineup.round_id = round.id and lineup.player_id = player.id and pick.driver_name = requested_driver
          )), '[]'::jsonb)
      ) else jsonb_build_object('round_id', round.id, 'private', true) end
      from public.fantasy_rounds round join selected_round on selected_round.round_id = round.id
    )
  )
$$;

create or replace function public.fantasy_public_driver_fantasy_directory()
returns jsonb language sql stable security definer set search_path = public as $$
  with entries as (
    select metric.driver_name, sum(metric.selection_count) as times_selected,
      sum(metric.actual_fantasy_points * metric.selection_count)::numeric / nullif(sum(metric.selection_count), 0) as average_fantasy_points,
      max(metric.actual_fantasy_points) as highest_fantasy_score,
      min(metric.actual_fantasy_points) as lowest_fantasy_score,
      count(*) filter(where metric.is_mvp) as fantasy_mvps,
      count(*) filter(where metric.is_bust) as fantasy_busts,
      avg(metric.selection_percentage) as selection_rate
    from public.fantasy_driver_round_metrics metric group by metric.driver_name
  )
  select coalesce(jsonb_agg(jsonb_build_object('driver_name', driver_name, 'times_selected', times_selected,
    'average_fantasy_points', round(average_fantasy_points, 2), 'highest_fantasy_score', highest_fantasy_score,
    'lowest_fantasy_score', lowest_fantasy_score, 'fantasy_mvps', fantasy_mvps, 'fantasy_busts', fantasy_busts,
    'career_selection_rate', round(selection_rate, 2)) order by times_selected desc, driver_name), '[]'::jsonb)
  from entries
$$;

create or replace function public.fantasy_public_records()
returns jsonb language sql stable security definer set search_path = public as $$
  with player_stats as (
    select player.id, player.display_name, coalesce(sum(score.championship_points), 0) as career_points,
      count(*) filter(where score.weekly_rank = 1) as weekly_wins, max(score.raw_score) as best_score,
      avg(metric.lineup_efficiency) as efficiency
    from public.fantasy_players player
    left join public.fantasy_week_scores score on score.player_id = player.id
    left join public.fantasy_player_round_metrics metric on metric.player_id = player.id and metric.round_id = score.round_id
    group by player.id, player.display_name
  ), driver_stats as (
    select driver_name, sum(actual_fantasy_points * selection_count) as points_generated, sum(selection_count) as selections,
      sum(actual_fantasy_points * selection_count)::numeric / nullif(sum(selection_count), 0) as average_points,
      count(*) filter(where is_mvp) as mvps, count(*) filter(where is_bust) as busts
    from public.fantasy_driver_round_metrics group by driver_name
  )
  select jsonb_build_object(
    'minimum_average_sample', 3,
    'fantasy_player_records', jsonb_build_array(
      jsonb_build_object('label', 'Most Career Fantasy Points', 'leaders', (select coalesce(jsonb_agg(jsonb_build_object('player_id', id, 'player', display_name, 'value', career_points) order by display_name), '[]'::jsonb) from player_stats where career_points = (select max(career_points) from player_stats))),
      jsonb_build_object('label', 'Most Weekly Wins', 'leaders', (select coalesce(jsonb_agg(jsonb_build_object('player_id', id, 'player', display_name, 'value', weekly_wins) order by display_name), '[]'::jsonb) from player_stats where weekly_wins = (select max(weekly_wins) from player_stats))),
      jsonb_build_object('label', 'Highest Single-Race Fantasy Score', 'leaders', (select coalesce(jsonb_agg(jsonb_build_object('player_id', id, 'player', display_name, 'value', best_score) order by display_name), '[]'::jsonb) from player_stats where best_score = (select max(best_score) from player_stats))),
      jsonb_build_object('label', 'Best Career Lineup Efficiency', 'leaders', (select coalesce(jsonb_agg(jsonb_build_object('player_id', id, 'player', display_name, 'value', round(efficiency,2)) order by display_name), '[]'::jsonb) from player_stats where efficiency = (select max(efficiency) from player_stats)))
    ),
    'driver_fantasy_records', jsonb_build_array(
      jsonb_build_object('label', 'Most Career Fantasy Points Generated', 'leaders', (select coalesce(jsonb_agg(jsonb_build_object('driver_name', driver_name, 'value', points_generated) order by driver_name), '[]'::jsonb) from driver_stats where points_generated = (select max(points_generated) from driver_stats))),
      jsonb_build_object('label', 'Most Times Selected', 'leaders', (select coalesce(jsonb_agg(jsonb_build_object('driver_name', driver_name, 'value', selections) order by driver_name), '[]'::jsonb) from driver_stats where selections = (select max(selections) from driver_stats))),
      jsonb_build_object('label', 'Highest Career Average Fantasy Points', 'leaders', (select coalesce(jsonb_agg(jsonb_build_object('driver_name', driver_name, 'value', round(average_points,2)) order by driver_name), '[]'::jsonb) from driver_stats where selections >= 3 and average_points = (select max(average_points) from driver_stats where selections >= 3))),
      jsonb_build_object('label', 'Most Fantasy MVP Awards', 'leaders', (select coalesce(jsonb_agg(jsonb_build_object('driver_name', driver_name, 'value', mvps) order by driver_name), '[]'::jsonb) from driver_stats where mvps = (select max(mvps) from driver_stats))),
      jsonb_build_object('label', 'Most Fantasy Bust Awards', 'leaders', (select coalesce(jsonb_agg(jsonb_build_object('driver_name', driver_name, 'value', busts) order by driver_name), '[]'::jsonb) from driver_stats where busts = (select max(busts) from driver_stats)))
    )
  )
$$;

create or replace function public.fantasy_public_season_recap(requested_season text)
returns jsonb language sql stable security definer set search_path = public as $$
  select recap from public.fantasy_season_recaps where season_id = requested_season
$$;

-- Replaces the original public result reader with the derived, player-specific
-- efficiency data. It remains empty until official Fantasy scoring is finalized.
create or replace function public.fantasy_public_week_results(round_uuid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when exists(select 1 from public.fantasy_rounds where id = round_uuid and status = 'scored') then
    coalesce(jsonb_agg(jsonb_build_object(
      'player_id', p.id, 'player', p.display_name,
      'raw_score', w.raw_score, 'weekly_rank', w.weekly_rank,
      'championship_points', w.championship_points,
      'eligible_perfect_score', metric.eligible_perfect_score,
      'lineup_efficiency', metric.lineup_efficiency,
      'drivers', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'tier', ld.tier, 'driver_name', ld.driver_name,
          'finishing_position', ds.finishing_position, 'finish_points', ds.finish_points,
          'win_bonus', ds.win_bonus, 'podium_bonus', ds.podium_bonus, 'pole_bonus', ds.pole_bonus,
          'fastest_lap_bonus', ds.fastest_lap_bonus, 'led_a_lap_bonus', ds.led_a_lap_bonus,
          'most_laps_led_bonus', ds.most_laps_led_bonus, 'movement_bonus', ds.movement_bonus,
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
  left join public.fantasy_player_round_metrics metric on metric.round_id = w.round_id and metric.player_id = w.player_id
  where w.round_id = round_uuid
$$;

-- The same public function is deliberately defined again so locked-but-unscored
-- rounds can reveal pick popularity without exposing the actual lineups.
create or replace function public.fantasy_public_round_detail(requested_round uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare round_record public.fantasy_rounds%rowtype; visibility boolean;
begin
  select * into round_record from public.fantasy_rounds where id = requested_round;
  if round_record.id is null then return null; end if;
  visibility := round_record.status = 'scored' or (round_record.locks_at is not null and now() >= round_record.locks_at);
  return jsonb_build_object(
    'round_id', round_record.id, 'season_id', round_record.season_id,
    'race_index', round_record.race_index, 'race_name', round_record.race_name,
    'status', round_record.status, 'pick_popularity_available', visibility,
    'pick_popularity', case when visibility then coalesce((
      select jsonb_agg(jsonb_build_object(
        'driver_name', popularity.driver_name, 'tier', popularity.tier,
        'selection_count', popularity.selection_count, 'selection_percentage', popularity.selection_percentage
      ) order by popularity.tier, popularity.selection_count desc, popularity.driver_name)
      from (
        select tier.driver_name, tier.tier, count(pick.driver_name)::integer as selection_count,
          case when count(distinct lineup.id) > 0 then round(count(pick.driver_name)::numeric * 100 / count(distinct lineup.id), 3) else null end as selection_percentage
        from public.fantasy_driver_tiers tier
        left join public.fantasy_lineups lineup on lineup.round_id = tier.round_id
        left join public.fantasy_lineup_drivers pick on pick.lineup_id = lineup.id and pick.driver_name = tier.driver_name
        where tier.round_id = requested_round and tier.entered
        group by tier.driver_name, tier.tier
      ) popularity
    ), '[]'::jsonb) else '[]'::jsonb end,
    'insights', coalesce((select jsonb_build_object('overall_perfect_lineup', insight.overall_perfect_lineup,
      'overall_perfect_score', insight.overall_perfect_score, 'awards', insight.awards)
      from public.fantasy_round_insights insight where insight.round_id = requested_round), '{}'::jsonb),
    'results', case when round_record.status = 'scored' then public.fantasy_public_week_results(requested_round) else '[]'::jsonb end
  );
end $$;

alter table public.fantasy_round_insights enable row level security;
alter table public.fantasy_player_round_metrics enable row level security;
alter table public.fantasy_driver_round_metrics enable row level security;
alter table public.fantasy_season_metadata enable row level security;
alter table public.fantasy_season_recaps enable row level security;
revoke all on public.fantasy_round_insights, public.fantasy_player_round_metrics, public.fantasy_driver_round_metrics, public.fantasy_season_metadata, public.fantasy_season_recaps from anon, authenticated;

grant execute on function public.fantasy_refresh_round_insights(uuid) to anon, authenticated;
grant execute on function public.fantasy_admin_save_season_metadata(text, text, integer) to anon, authenticated;
grant execute on function public.fantasy_public_round_detail(uuid) to anon, authenticated;
grant execute on function public.fantasy_public_player_profile(uuid) to anon, authenticated;
grant execute on function public.fantasy_public_driver_fantasy(text, uuid) to anon, authenticated;
grant execute on function public.fantasy_public_driver_fantasy_directory() to anon, authenticated;
grant execute on function public.fantasy_public_records() to anon, authenticated;
grant execute on function public.fantasy_public_season_recap(text) to anon, authenticated;
grant execute on function public.fantasy_public_settings() to anon, authenticated;

do $$
declare scored_round record;
begin
  for scored_round in select id from public.fantasy_rounds where status = 'scored' loop
    perform public.fantasy_refresh_round_insights(scored_round.id);
  end loop;
end $$;

select 'Fantasy League history and statistics upgrade is ready.' as result;
