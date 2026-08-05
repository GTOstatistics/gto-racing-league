-- GTO Racing League Fantasy League -- settings enforcement update
-- Run this once AFTER fantasy_setup.sql and fantasy_upgrade.sql.

create or replace function public.fantasy_public_settings()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'timezone', timezone,
    'standings_weight', standings_weight,
    'prediction_weight', prediction_weight,
    'previous_standings_through_round', previous_standings_through_round,
    'season_drops', season_drops,
    'consecutive_driver_restriction', consecutive_driver_restriction
  ) from public.fantasy_settings where id
$$;

create or replace function public.fantasy_save_lineup(device_token text, round_uuid uuid, selections jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  player_uuid uuid;
  line_uuid uuid;
  selected_count integer;
  tier_count integer;
  duplicate_count integer;
  conflict_count integer;
  round_record public.fantasy_rounds%rowtype;
  cfg public.fantasy_settings%rowtype;
begin
  player_uuid := public.fantasy_device_player(device_token);
  if player_uuid is null then raise exception 'Sign in to your Fantasy League profile first.'; end if;
  select * into cfg from public.fantasy_settings where id;
  select * into round_record from public.fantasy_rounds where id = round_uuid for update;
  if round_record.id is null then raise exception 'Fantasy round not found.'; end if;
  if round_record.status <> 'open' or now() < round_record.opens_at or now() >= round_record.locks_at then raise exception 'This Fantasy League round is not open for submissions.'; end if;
  if jsonb_typeof(selections) <> 'array' then raise exception 'A lineup must contain three driver selections.'; end if;
  select count(*), count(distinct (item->>'tier')::int), count(distinct item->>'driver_name')
    into selected_count, tier_count, duplicate_count from jsonb_array_elements(selections) item;
  if selected_count <> 3 or tier_count <> 3 or duplicate_count <> 3 then raise exception 'Select exactly one unique driver from each tier.'; end if;
  if exists (select 1 from jsonb_array_elements(selections) item where (item->>'tier')::int not in (1,2,3)) then raise exception 'Invalid tier selection.'; end if;
  if exists (
    select 1 from jsonb_array_elements(selections) item
    left join public.fantasy_driver_tiers t on t.round_id = round_uuid and t.driver_name = item->>'driver_name' and t.tier = (item->>'tier')::int
    where t.id is null or not t.entered
  ) then raise exception 'Every selected driver must be entered and assigned to the selected tier.'; end if;
  select count(*) into conflict_count from jsonb_array_elements(selections) item where exists (
    select 1 from public.fantasy_lineups previous_lineup
    join public.fantasy_lineup_drivers previous_driver on previous_driver.lineup_id = previous_lineup.id
    join public.fantasy_rounds previous_round on previous_round.id = previous_lineup.round_id
    where previous_lineup.player_id = player_uuid and previous_round.season_id = round_record.season_id
      and previous_round.race_index = round_record.race_index - 1 and previous_driver.driver_name = item->>'driver_name'
  );
  if cfg.consecutive_driver_restriction and conflict_count > 0 then raise exception 'A driver from your immediately previous submitted lineup is unavailable this round.'; end if;
  insert into public.fantasy_lineups (round_id, player_id) values (round_uuid, player_uuid)
  on conflict (round_id, player_id) do update set updated_at = now() returning id into line_uuid;
  delete from public.fantasy_lineup_drivers where lineup_id = line_uuid;
  insert into public.fantasy_lineup_drivers (lineup_id, tier, driver_name)
    select line_uuid, (item->>'tier')::int, item->>'driver_name' from jsonb_array_elements(selections) item;
  insert into public.fantasy_audit_log (action, actor_player_id, round_id, payload)
    values ('lineup_saved', player_uuid, round_uuid, selections);
  return public.fantasy_my_lineup(device_token, round_uuid);
end $$;

grant execute on function public.fantasy_public_settings() to anon, authenticated;
grant execute on function public.fantasy_save_lineup(text, uuid, jsonb) to anon, authenticated;

select 'Fantasy League settings enforcement update is ready.' as result;
