-- Run once in Supabase SQL editor.
-- Stores per-tournament TP results by athlete.

create table if not exists public.sportfun_athlete_tournament_tp (
  sport text not null,
  tournament_key text not null,
  competition_id integer null,
  season_id integer null,
  season_type text null,
  week_start integer null,
  week_end integer null,
  athlete_id text not null,
  athlete_name text not null,
  team text null,
  position text null,
  games integer not null default 0,
  tp_total double precision not null,
  tp_total_unrounded double precision null,
  tp_average double precision not null,
  rank integer null,
  source text not null,
  as_of timestamptz not null default now(),
  provider_payload jsonb null,
  updated_at timestamptz not null default now(),
  constraint sportfun_athlete_tournament_tp_pk primary key (sport, tournament_key, athlete_id)
);

create index if not exists sportfun_athlete_tournament_tp_lookup_idx
  on public.sportfun_athlete_tournament_tp (sport, competition_id, season_id, as_of desc);

create index if not exists sportfun_athlete_tournament_tp_athlete_idx
  on public.sportfun_athlete_tournament_tp (athlete_id, as_of desc);

create or replace function public.sportfun_athlete_tournament_tp_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sportfun_athlete_tournament_tp_updated_at on public.sportfun_athlete_tournament_tp;
create trigger trg_sportfun_athlete_tournament_tp_updated_at
before update on public.sportfun_athlete_tournament_tp
for each row execute function public.sportfun_athlete_tournament_tp_set_updated_at();
