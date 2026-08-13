-- GTO Sportsbook availability control
-- Run this once in the Supabase SQL Editor as the postgres role.
-- The Sportsbook starts disabled. The shared Fantasy/Sportsbook admin session
-- can enable or disable it afterward from the website.

create table if not exists public.sportsbook_availability (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.sportsbook_availability (id, enabled)
values (true, false)
on conflict (id) do nothing;

create or replace function public.sportsbook_public_availability()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('enabled', enabled, 'updated_at', updated_at)
  from public.sportsbook_availability
  where id
$$;

create or replace function public.sportsbook_admin_set_availability(session_token text, next_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare previous_enabled boolean;
begin
  if not public.fantasy_admin_authorized(session_token) then
    raise exception 'Administrator access required.';
  end if;

  select enabled into previous_enabled
  from public.sportsbook_availability
  where id
  for update;

  insert into public.sportsbook_availability (id, enabled, updated_at)
  values (true, next_enabled, now())
  on conflict (id) do update
    set enabled = excluded.enabled,
        updated_at = excluded.updated_at;

  insert into public.sportsbook_admin_audit (action_type, old_value, new_value, reason)
  values (
    'sportsbook_availability_changed',
    jsonb_build_object('enabled', coalesce(previous_enabled, false)),
    jsonb_build_object('enabled', next_enabled),
    case when next_enabled then 'Sportsbook enabled from shared admin settings.' else 'Sportsbook disabled from shared admin settings.' end
  );

  return jsonb_build_object('enabled', next_enabled);
end
$$;

grant execute on function public.sportsbook_public_availability() to anon, authenticated;
grant execute on function public.sportsbook_admin_set_availability(text, boolean) to anon, authenticated;

select 'GTO Sportsbook availability control is ready.' as result;
