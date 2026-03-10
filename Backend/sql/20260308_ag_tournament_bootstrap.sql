begin;

create extension if not exists pgcrypto;

create schema if not exists ag_tournament;

create or replace function ag_tournament.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function ag_tournament.next_power_of_two(p_value integer)
returns integer
language plpgsql
immutable
as $$
declare
  v_result integer := 1;
begin
  if p_value is null or p_value <= 0 then
    raise exception 'value must be greater than 0';
  end if;

  while v_result < p_value loop
    v_result := v_result * 2;
  end loop;

  return v_result;
end;
$$;

create or replace function ag_tournament.round_name_for_match_count(p_match_count integer)
returns text
language plpgsql
immutable
as $$
begin
  return case p_match_count
    when 1 then 'Final'
    when 2 then 'Semi Final'
    when 4 then 'Quarter Final'
    when 8 then 'Round of 16'
    when 16 then 'Round of 32'
    when 32 then 'Round of 64'
    else 'Round'
  end;
end;
$$;

create table if not exists ag_tournament.tournaments (
  id uuid primary key default gen_random_uuid(),
  academy_id text,
  tournament_name text not null,
  tournament_code text,
  venue_name text,
  city text,
  state text,
  country text not null default 'India',
  start_date date not null,
  end_date date not null,
  status text not null default 'draft',
  created_by text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournaments_status_check check (
    status in ('draft', 'registration_open', 'draw_ready', 'in_progress', 'completed', 'archived', 'cancelled')
  ),
  constraint tournaments_date_check check (end_date >= start_date)
);

create table if not exists ag_tournament.events (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null,
  event_name text not null,
  event_code text,
  category_name text,
  gender text,
  age_group text,
  format text not null,
  status text not null default 'draft',
  draw_type text not null default 'single_elimination',
  draw_size integer,
  best_of_sets smallint not null default 3,
  points_per_set smallint not null default 21,
  max_points_per_set smallint not null default 30,
  seeding_enabled boolean not null default false,
  third_place_match boolean not null default false,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_format_check check (format in ('singles', 'doubles')),
  constraint events_status_check check (
    status in ('draft', 'registration_open', 'draw_pending', 'draw_generated', 'in_progress', 'completed', 'cancelled')
  ),
  constraint events_draw_type_check check (draw_type in ('single_elimination')),
  constraint events_draw_size_check check (draw_size is null or draw_size > 0),
  constraint events_scoring_check check (
    best_of_sets in (1, 3, 5) and
    points_per_set > 0 and
    max_points_per_set >= points_per_set
  )
);

create table if not exists ag_tournament.courts (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null,
  court_name text not null,
  sort_order integer not null default 0,
  status text not null default 'available',
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courts_status_check check (status in ('available', 'occupied', 'disabled'))
);

create table if not exists ag_tournament.participants (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null,
  event_id uuid not null,
  team_name text,
  team_key text not null,
  draw_position integer,
  seed_number integer,
  player1_id text,
  player2_id text,
  coach_id text,
  status text not null default 'active',
  check_in_status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participants_presence_check check (player1_id is not null or player2_id is not null),
  constraint participants_distinct_players_check check (
    player1_id is null or player2_id is null or player1_id <> player2_id
  ),
  constraint participants_draw_position_check check (draw_position is null or draw_position > 0),
  constraint participants_seed_check check (seed_number is null or seed_number > 0),
  constraint participants_status_check check (
    status in ('active', 'withdrawn', 'disqualified', 'eliminated', 'completed')
  ),
  constraint participants_checkin_status_check check (
    check_in_status in ('pending', 'checked_in', 'no_show')
  )
);

create table if not exists ag_tournament.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null,
  event_id uuid not null,
  round_number integer not null,
  round_name text,
  match_number integer not null,
  bracket_position integer,
  participant1_id uuid,
  participant2_id uuid,
  winner_id uuid,
  loser_id uuid,
  court_id uuid,
  status text not null default 'pending',
  result_type text not null default 'normal',
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  score_status text not null default 'not_started',
  score_summary text,
  next_match_id uuid,
  next_slot smallint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matches_round_check check (round_number > 0),
  constraint matches_number_check check (match_number > 0),
  constraint matches_bracket_position_check check (bracket_position is null or bracket_position > 0),
  constraint matches_distinct_participants_check check (
    participant1_id is null or participant2_id is null or participant1_id <> participant2_id
  ),
  constraint matches_winner_check check (
    winner_id is null or winner_id = participant1_id or winner_id = participant2_id
  ),
  constraint matches_loser_check check (
    loser_id is null or loser_id = participant1_id or loser_id = participant2_id
  ),
  constraint matches_status_check check (
    status in ('pending', 'scheduled', 'in_progress', 'completed', 'cancelled')
  ),
  constraint matches_result_type_check check (
    result_type in ('normal', 'bye', 'walkover', 'retired', 'disqualified', 'cancelled')
  ),
  constraint matches_score_status_check check (
    score_status in ('not_started', 'live', 'final')
  ),
  constraint matches_next_slot_check check (
    next_slot is null or next_slot in (1, 2)
  )
);

create table if not exists ag_tournament.match_sets (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null,
  event_id uuid not null,
  match_id uuid not null,
  set_number smallint not null,
  participant1_score smallint not null default 0,
  participant2_score smallint not null default 0,
  winner_id uuid,
  status text not null default 'pending',
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint match_sets_number_check check (set_number > 0 and set_number <= 5),
  constraint match_sets_score_check check (participant1_score >= 0 and participant2_score >= 0),
  constraint match_sets_status_check check (status in ('pending', 'in_progress', 'completed'))
);

drop trigger if exists trg_tournaments_updated_at on ag_tournament.tournaments;
create trigger trg_tournaments_updated_at
before update on ag_tournament.tournaments
for each row
execute function ag_tournament.set_updated_at();

drop trigger if exists trg_events_updated_at on ag_tournament.events;
create trigger trg_events_updated_at
before update on ag_tournament.events
for each row
execute function ag_tournament.set_updated_at();

drop trigger if exists trg_courts_updated_at on ag_tournament.courts;
create trigger trg_courts_updated_at
before update on ag_tournament.courts
for each row
execute function ag_tournament.set_updated_at();

drop trigger if exists trg_participants_updated_at on ag_tournament.participants;
create trigger trg_participants_updated_at
before update on ag_tournament.participants
for each row
execute function ag_tournament.set_updated_at();

drop trigger if exists trg_matches_updated_at on ag_tournament.matches;
create trigger trg_matches_updated_at
before update on ag_tournament.matches
for each row
execute function ag_tournament.set_updated_at();

drop trigger if exists trg_match_sets_updated_at on ag_tournament.match_sets;
create trigger trg_match_sets_updated_at
before update on ag_tournament.match_sets
for each row
execute function ag_tournament.set_updated_at();

create unique index if not exists uq_tournaments_code
on ag_tournament.tournaments (tournament_code)
where tournament_code is not null;

create index if not exists idx_tournaments_academy_status
on ag_tournament.tournaments (academy_id, status, start_date);

create unique index if not exists uq_events_tournament_name
on ag_tournament.events (tournament_id, lower(event_name));

create unique index if not exists uq_events_tournament_code
on ag_tournament.events (tournament_id, lower(event_code))
where event_code is not null;

create index if not exists idx_events_tournament_status
on ag_tournament.events (tournament_id, status, sort_order, created_at);

create unique index if not exists uq_courts_tournament_name
on ag_tournament.courts (tournament_id, lower(court_name));

create index if not exists idx_courts_tournament_status
on ag_tournament.courts (tournament_id, status, sort_order, court_name);

create unique index if not exists uq_participants_event_team_key
on ag_tournament.participants (event_id, team_key);

create unique index if not exists uq_participants_event_seed
on ag_tournament.participants (event_id, seed_number)
where seed_number is not null;

create index if not exists idx_participants_event_status
on ag_tournament.participants (event_id, status, draw_position, seed_number);

create index if not exists idx_participants_tournament_status
on ag_tournament.participants (tournament_id, status);

create unique index if not exists uq_matches_event_round_match
on ag_tournament.matches (event_id, round_number, match_number);

create index if not exists idx_matches_tournament_status
on ag_tournament.matches (tournament_id, status, scheduled_at);

create index if not exists idx_matches_event_round
on ag_tournament.matches (event_id, round_number, match_number, bracket_position);

create index if not exists idx_matches_next_match
on ag_tournament.matches (next_match_id, next_slot);

create index if not exists idx_matches_scheduler_pending
on ag_tournament.matches (event_id, round_number, match_number, id)
where status = 'pending' and winner_id is null and court_id is null;

create index if not exists idx_matches_scheduler_active
on ag_tournament.matches (event_id, status, participant1_id, participant2_id)
where status in ('scheduled', 'in_progress');

create unique index if not exists uq_match_sets_match_set
on ag_tournament.match_sets (match_id, set_number);

create index if not exists idx_match_sets_match_status
on ag_tournament.match_sets (match_id, status, set_number);

create or replace view ag_tournament.ready_matches as
select
  m.id,
  m.tournament_id,
  m.event_id,
  e.event_name,
  m.round_number,
  m.round_name,
  m.match_number,
  m.participant1_id,
  p1.team_name as participant1_name,
  m.participant2_id,
  p2.team_name as participant2_name,
  m.status,
  m.result_type,
  m.next_match_id,
  m.next_slot
from ag_tournament.matches m
left join ag_tournament.events e on e.id = m.event_id
left join ag_tournament.participants p1 on p1.id = m.participant1_id
left join ag_tournament.participants p2 on p2.id = m.participant2_id
where m.status = 'pending'
  and m.winner_id is null
  and m.court_id is null
  and m.participant1_id is not null
  and m.participant2_id is not null;

create or replace function ag_tournament._push_participant_to_next_match(
  p_next_match_id uuid,
  p_next_slot smallint,
  p_participant_id uuid
)
returns void
language plpgsql
set search_path = ag_tournament, public
as $$
declare
  v_next_match ag_tournament.matches%rowtype;
begin
  if p_next_match_id is null or p_participant_id is null then
    return;
  end if;

  select *
    into v_next_match
  from ag_tournament.matches
  where id = p_next_match_id
  for update;

  if v_next_match.id is null then
    raise exception 'Next match not found';
  end if;

  if p_next_slot = 1 then
    if v_next_match.participant1_id is not null and v_next_match.participant1_id <> p_participant_id then
      raise exception 'Next match slot 1 already occupied by another participant';
    end if;

    update ag_tournament.matches
       set participant1_id = p_participant_id
     where id = p_next_match_id;

  elsif p_next_slot = 2 then
    if v_next_match.participant2_id is not null and v_next_match.participant2_id <> p_participant_id then
      raise exception 'Next match slot 2 already occupied by another participant';
    end if;

    update ag_tournament.matches
       set participant2_id = p_participant_id
     where id = p_next_match_id;

  else
    raise exception 'Invalid next_slot value';
  end if;

  select *
    into v_next_match
  from ag_tournament.matches
  where id = p_next_match_id
  for update;

  if v_next_match.status = 'completed'
     and v_next_match.result_type = 'bye'
     and v_next_match.participant1_id is not null
     and v_next_match.participant2_id is not null then
    update ag_tournament.matches
       set winner_id = null,
           loser_id = null,
           status = 'pending',
           result_type = 'normal',
           scheduled_at = null,
           started_at = null,
           completed_at = null,
           score_status = 'not_started',
           score_summary = null
     where id = p_next_match_id;
  end if;
end;
$$;

create or replace function ag_tournament.complete_match_and_propagate(
  p_match_id uuid,
  p_winner_id uuid,
  p_result_type text default 'normal',
  p_score_summary text default null
)
returns jsonb
language plpgsql
set search_path = ag_tournament, public
as $$
declare
  v_match ag_tournament.matches%rowtype;
  v_loser_id uuid;
begin
  if p_match_id is null then
    raise exception 'match_id is required';
  end if;

  if p_winner_id is null then
    raise exception 'winner_id is required';
  end if;

  if p_result_type not in ('normal', 'bye', 'walkover', 'retired', 'disqualified') then
    raise exception 'Invalid result_type';
  end if;

  select *
    into v_match
  from ag_tournament.matches
  where id = p_match_id
  for update;

  if v_match.id is null then
    raise exception 'Match not found';
  end if;

  if v_match.status = 'completed' and v_match.winner_id = p_winner_id and v_match.result_type = p_result_type then
    return jsonb_build_object(
      'match_id', v_match.id,
      'winner_id', v_match.winner_id,
      'next_match_id', v_match.next_match_id,
      'next_slot', v_match.next_slot,
      'status', v_match.status,
      'result_type', v_match.result_type
    );
  end if;

  if v_match.status = 'completed' then
    raise exception 'Match already completed';
  end if;

  if v_match.participant1_id is null and v_match.participant2_id is null then
    raise exception 'Match has no participants';
  end if;

  if p_winner_id <> v_match.participant1_id and p_winner_id <> v_match.participant2_id then
    raise exception 'Winner must belong to this match';
  end if;

  if p_result_type = 'normal' and (v_match.participant1_id is null or v_match.participant2_id is null) then
    raise exception 'Normal result requires two participants';
  end if;

  if v_match.next_match_id is not null and v_match.next_slot is null then
    raise exception 'next_slot is required when next_match_id is present';
  end if;

  v_loser_id := case
    when p_winner_id = v_match.participant1_id then v_match.participant2_id
    else v_match.participant1_id
  end;

  update ag_tournament.matches
     set winner_id = p_winner_id,
         loser_id = v_loser_id,
         status = 'completed',
         result_type = p_result_type,
         score_status = 'final',
         score_summary = coalesce(p_score_summary, score_summary),
         completed_at = coalesce(completed_at, now())
   where id = p_match_id
   returning *
    into v_match;

  if v_match.court_id is not null then
    update ag_tournament.courts
       set status = 'available'
     where id = v_match.court_id
       and status = 'occupied';
  end if;

  if v_match.next_match_id is not null then
    perform ag_tournament._push_participant_to_next_match(
      v_match.next_match_id,
      v_match.next_slot,
      p_winner_id
    );
  end if;

  return jsonb_build_object(
    'match_id', v_match.id,
    'winner_id', v_match.winner_id,
    'loser_id', v_match.loser_id,
    'next_match_id', v_match.next_match_id,
    'next_slot', v_match.next_slot,
    'status', v_match.status,
    'result_type', v_match.result_type
  );
end;
$$;

create or replace function ag_tournament.process_bye_matches(
  p_tournament_id uuid default null,
  p_event_id uuid default null,
  p_limit integer default null
)
returns jsonb
language plpgsql
set search_path = ag_tournament, public
as $$
declare
  v_match record;
  v_processed_count integer := 0;
  v_processed_matches jsonb := '[]'::jsonb;
begin
  if p_tournament_id is null and p_event_id is null then
    raise exception 'tournament_id or event_id is required';
  end if;

  if p_limit is not null and p_limit <= 0 then
    raise exception 'limit must be a positive integer';
  end if;

  for v_match in
    select
      m.id,
      coalesce(m.participant1_id, m.participant2_id) as winner_id
    from ag_tournament.matches m
    where (p_tournament_id is null or m.tournament_id = p_tournament_id)
      and (p_event_id is null or m.event_id = p_event_id)
      and m.status = 'pending'
      and m.winner_id is null
      and (
        (m.participant1_id is not null and m.participant2_id is null) or
        (m.participant1_id is null and m.participant2_id is not null)
      )
    order by m.round_number, m.match_number, m.id
    limit coalesce(p_limit, 2147483647)
  loop
    perform ag_tournament.complete_match_and_propagate(
      v_match.id,
      v_match.winner_id,
      'bye',
      null
    );

    v_processed_count := v_processed_count + 1;
    v_processed_matches := v_processed_matches || jsonb_build_array(
      jsonb_build_object(
        'match_id', v_match.id,
        'winner_id', v_match.winner_id
      )
    );
  end loop;

  return jsonb_build_object(
    'processed_count', v_processed_count,
    'processed_matches', v_processed_matches
  );
end;
$$;

create or replace function ag_tournament.generate_single_elimination_draw(
  p_event_id uuid,
  p_clear_existing boolean default false
)
returns jsonb
language plpgsql
set search_path = ag_tournament, public
as $$
declare
  v_event ag_tournament.events%rowtype;
  v_existing_match_count integer := 0;
  v_non_pending_match_count integer := 0;
  v_participant_count integer := 0;
  v_draw_size integer := 0;
  v_total_rounds integer := 0;
  v_round_number integer := 0;
  v_matches_in_round integer := 0;
  v_match_number integer := 0;
  v_seed_index integer := 0;
  v_round_match_count integer := 0;
  v_position integer := 0;
  v_next_match_id uuid;
  v_next_slot smallint;
  v_bye_result jsonb := '{}'::jsonb;
  v_participant_ids uuid[];
begin
  if p_event_id is null then
    raise exception 'event_id is required';
  end if;

  select *
    into v_event
  from ag_tournament.events
  where id = p_event_id
  for update;

  if v_event.id is null then
    raise exception 'Event not found';
  end if;

  if v_event.draw_type <> 'single_elimination' then
    raise exception 'Only single_elimination draw type is supported';
  end if;

  select count(*)
    into v_existing_match_count
  from ag_tournament.matches
  where event_id = p_event_id;

  if v_existing_match_count > 0 then
    if not p_clear_existing then
      raise exception 'Draw already exists for this event';
    end if;

    select count(*)
      into v_non_pending_match_count
    from ag_tournament.matches
    where event_id = p_event_id
      and status <> 'pending';

    if v_non_pending_match_count > 0 then
      raise exception 'Cannot clear draw after matches have progressed';
    end if;

    delete from ag_tournament.match_sets
    where event_id = p_event_id;

    delete from ag_tournament.matches
    where event_id = p_event_id;
  end if;

  select
    coalesce(array_agg(p.id order by coalesce(p.seed_number, 2147483647), p.created_at, p.id), '{}'::uuid[]),
    count(*)
    into v_participant_ids, v_participant_count
  from ag_tournament.participants p
  where p.event_id = p_event_id
    and p.status = 'active';

  if v_participant_count < 2 then
    raise exception 'At least 2 active participants are required';
  end if;

  v_draw_size := ag_tournament.next_power_of_two(v_participant_count);
  v_round_match_count := v_draw_size / 2;

  while v_round_match_count > 0 loop
    v_total_rounds := v_total_rounds + 1;
    v_round_match_count := v_round_match_count / 2;
  end loop;

  for v_round_number in 1..v_total_rounds loop
    v_matches_in_round := v_draw_size / cast(power(2, v_round_number) as integer);

    for v_match_number in 1..v_matches_in_round loop
      insert into ag_tournament.matches (
        id,
        tournament_id,
        event_id,
        round_number,
        round_name,
        match_number,
        bracket_position,
        status,
        result_type,
        score_status
      ) values (
        gen_random_uuid(),
        v_event.tournament_id,
        p_event_id,
        v_round_number,
        ag_tournament.round_name_for_match_count(v_matches_in_round),
        v_match_number,
        v_match_number,
        'pending',
        'normal',
        'not_started'
      );
    end loop;
  end loop;

  for v_round_number in 1..(v_total_rounds - 1) loop
    for v_match_number in 1..(v_draw_size / cast(power(2, v_round_number) as integer)) loop
      select id
        into v_next_match_id
      from ag_tournament.matches
      where event_id = p_event_id
        and round_number = v_round_number + 1
        and match_number = ((v_match_number + 1) / 2)
      limit 1;

      v_next_slot := case when mod(v_match_number, 2) = 1 then 1 else 2 end;

      update ag_tournament.matches
         set next_match_id = v_next_match_id,
             next_slot = v_next_slot
       where event_id = p_event_id
         and round_number = v_round_number
         and match_number = v_match_number;
    end loop;
  end loop;

  v_matches_in_round := v_draw_size / 2;

  for v_match_number in 1..v_matches_in_round loop
    v_seed_index := v_match_number;

    update ag_tournament.matches
       set participant1_id = case
         when v_seed_index <= v_participant_count then v_participant_ids[v_seed_index]
         else null
       end
     where event_id = p_event_id
       and round_number = 1
       and match_number = v_match_number;

    if v_seed_index <= v_participant_count then
      update ag_tournament.participants
         set draw_position = v_match_number
       where id = v_participant_ids[v_seed_index];
    end if;
  end loop;

  v_seed_index := v_matches_in_round + 1;

  for v_match_number in reverse v_matches_in_round..1 loop
    exit when v_seed_index > v_participant_count;

    update ag_tournament.matches
       set participant2_id = v_participant_ids[v_seed_index]
     where event_id = p_event_id
       and round_number = 1
       and match_number = v_match_number;

    v_position := v_draw_size - v_match_number + 1;

    update ag_tournament.participants
       set draw_position = v_position
     where id = v_participant_ids[v_seed_index];

    v_seed_index := v_seed_index + 1;
  end loop;

  update ag_tournament.events
     set draw_size = v_draw_size,
         status = 'draw_generated'
   where id = p_event_id;

  select ag_tournament.process_bye_matches(
    p_tournament_id => v_event.tournament_id,
    p_event_id => p_event_id,
    p_limit => null
  )
    into v_bye_result;

  return jsonb_build_object(
    'event_id', p_event_id,
    'tournament_id', v_event.tournament_id,
    'participant_count', v_participant_count,
    'draw_size', v_draw_size,
    'total_rounds', v_total_rounds,
    'matches_created', (
      select count(*)
      from ag_tournament.matches
      where event_id = p_event_id
    ),
    'byes_processed', coalesce((v_bye_result ->> 'processed_count')::integer, 0)
  );
end;
$$;

create or replace function ag_tournament.run_tournament_scheduler(
  p_tournament_id uuid,
  p_event_id uuid default null,
  p_max_assignments integer default null,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
set search_path = ag_tournament, public
as $$
declare
  v_event_ids uuid[];
  v_free_courts jsonb := '[]'::jsonb;
  v_available_courts jsonb := '[]'::jsonb;
  v_free_court_count integer := 0;
  v_assignment_limit integer := 0;
  v_candidate_match_count integer := 0;
  v_blocked_player_ids text[] := '{}'::text[];
  v_scheduled_matches jsonb := '[]'::jsonb;
  v_skipped_matches jsonb := '[]'::jsonb;
  v_match record;
  v_participant1 ag_tournament.participants%rowtype;
  v_participant2 ag_tournament.participants%rowtype;
  v_side_one_player_ids text[];
  v_side_two_player_ids text[];
  v_all_player_ids text[];
  v_next_court jsonb;
  v_reserved_court ag_tournament.courts%rowtype;
  v_updated_match ag_tournament.matches%rowtype;
begin
  if p_tournament_id is null then
    raise exception 'tournament_id is required';
  end if;

  if p_max_assignments is not null and p_max_assignments <= 0 then
    raise exception 'max_assignments must be a positive integer';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('ag_tournament_scheduler:' || p_tournament_id::text, 0)
  );

  select coalesce(array_agg(e.id order by e.sort_order, e.created_at, e.id), '{}'::uuid[])
    into v_event_ids
  from ag_tournament.events e
  where e.tournament_id = p_tournament_id
    and (p_event_id is null or e.id = p_event_id);

  if p_event_id is not null and array_length(v_event_ids, 1) is null then
    raise exception 'Event not found for this tournament';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'court_name', c.court_name
      )
      order by c.sort_order, c.court_name, c.id
    ),
    '[]'::jsonb
  )
    into v_free_courts
  from ag_tournament.courts c
  where c.tournament_id = p_tournament_id
    and c.status = 'available';

  v_free_court_count := jsonb_array_length(v_free_courts);

  if array_length(v_event_ids, 1) is null then
    return jsonb_build_object(
      'tournament_id', p_tournament_id,
      'event_id', p_event_id,
      'dry_run', p_dry_run,
      'free_court_count', v_free_court_count,
      'candidate_match_count', 0,
      'scheduled_count', 0,
      'scheduled_matches', '[]'::jsonb,
      'skipped_matches', '[]'::jsonb,
      'message', 'No events found for scheduling'
    );
  end if;

  if p_max_assignments is null then
    v_assignment_limit := v_free_court_count;
  else
    v_assignment_limit := least(p_max_assignments, v_free_court_count);
  end if;

  if v_assignment_limit = 0 then
    return jsonb_build_object(
      'tournament_id', p_tournament_id,
      'event_id', p_event_id,
      'dry_run', p_dry_run,
      'free_court_count', 0,
      'candidate_match_count', 0,
      'scheduled_count', 0,
      'scheduled_matches', '[]'::jsonb,
      'skipped_matches', '[]'::jsonb,
      'message', 'No free courts available'
    );
  end if;

  select coalesce(jsonb_agg(court.value order by court.ordinality), '[]'::jsonb)
    into v_available_courts
  from jsonb_array_elements(v_free_courts) with ordinality as court(value, ordinality)
  where court.ordinality <= v_assignment_limit;

  select coalesce(array_agg(distinct blocked.player_id), '{}'::text[])
    into v_blocked_player_ids
  from (
    select p1.player1_id as player_id
    from ag_tournament.matches m
    left join ag_tournament.participants p1 on p1.id = m.participant1_id
    where m.event_id = any(v_event_ids)
      and m.status in ('scheduled', 'in_progress')
      and p1.player1_id is not null

    union

    select p1.player2_id as player_id
    from ag_tournament.matches m
    left join ag_tournament.participants p1 on p1.id = m.participant1_id
    where m.event_id = any(v_event_ids)
      and m.status in ('scheduled', 'in_progress')
      and p1.player2_id is not null

    union

    select p2.player1_id as player_id
    from ag_tournament.matches m
    left join ag_tournament.participants p2 on p2.id = m.participant2_id
    where m.event_id = any(v_event_ids)
      and m.status in ('scheduled', 'in_progress')
      and p2.player1_id is not null

    union

    select p2.player2_id as player_id
    from ag_tournament.matches m
    left join ag_tournament.participants p2 on p2.id = m.participant2_id
    where m.event_id = any(v_event_ids)
      and m.status in ('scheduled', 'in_progress')
      and p2.player2_id is not null
  ) blocked;

  select count(*)
    into v_candidate_match_count
  from ag_tournament.matches m
  where m.event_id = any(v_event_ids)
    and m.status = 'pending'
    and m.winner_id is null
    and m.court_id is null;

  for v_match in
    select
      m.id,
      m.event_id,
      m.round_number,
      m.match_number,
      m.participant1_id,
      m.participant2_id
    from ag_tournament.matches m
    where m.event_id = any(v_event_ids)
      and m.status = 'pending'
      and m.winner_id is null
      and m.court_id is null
    order by m.round_number, m.match_number, m.id
  loop
    if jsonb_array_length(v_available_courts) = 0 then
      exit;
    end if;

    if v_match.participant1_id is null or v_match.participant2_id is null then
      v_skipped_matches := v_skipped_matches || jsonb_build_array(
        jsonb_build_object(
          'match_id', v_match.id,
          'reason', 'incomplete_participant_slots'
        )
      );
      continue;
    end if;

    select *
      into v_participant1
    from ag_tournament.participants
    where id = v_match.participant1_id
    limit 1;

    select *
      into v_participant2
    from ag_tournament.participants
    where id = v_match.participant2_id
    limit 1;

    if v_participant1.id is null or v_participant2.id is null then
      v_skipped_matches := v_skipped_matches || jsonb_build_array(
        jsonb_build_object(
          'match_id', v_match.id,
          'reason', 'participant_not_found'
        )
      );
      continue;
    end if;

    if v_participant1.event_id <> v_match.event_id or v_participant2.event_id <> v_match.event_id then
      v_skipped_matches := v_skipped_matches || jsonb_build_array(
        jsonb_build_object(
          'match_id', v_match.id,
          'reason', 'participant_event_mismatch'
        )
      );
      continue;
    end if;

    v_side_one_player_ids := array_remove(array[v_participant1.player1_id, v_participant1.player2_id], null);
    v_side_two_player_ids := array_remove(array[v_participant2.player1_id, v_participant2.player2_id], null);
    v_all_player_ids := v_side_one_player_ids || v_side_two_player_ids;

    if coalesce(array_length(v_all_player_ids, 1), 0) = 0 then
      v_skipped_matches := v_skipped_matches || jsonb_build_array(
        jsonb_build_object(
          'match_id', v_match.id,
          'reason', 'participant_has_no_players'
        )
      );
      continue;
    end if;

    if v_side_one_player_ids && v_side_two_player_ids then
      v_skipped_matches := v_skipped_matches || jsonb_build_array(
        jsonb_build_object(
          'match_id', v_match.id,
          'reason', 'duplicate_player_across_opponents'
        )
      );
      continue;
    end if;

    if v_all_player_ids && v_blocked_player_ids then
      v_skipped_matches := v_skipped_matches || jsonb_build_array(
        jsonb_build_object(
          'match_id', v_match.id,
          'reason', 'player_conflict'
        )
      );
      continue;
    end if;

    v_next_court := v_available_courts -> 0;

    if jsonb_array_length(v_available_courts) = 1 then
      v_available_courts := '[]'::jsonb;
    else
      select coalesce(jsonb_agg(court.value order by court.ordinality), '[]'::jsonb)
        into v_available_courts
      from jsonb_array_elements(v_available_courts) with ordinality as court(value, ordinality)
      where court.ordinality > 1;
    end if;

    if p_dry_run then
      select coalesce(array_agg(distinct player_id), '{}'::text[])
        into v_blocked_player_ids
      from unnest(v_blocked_player_ids || v_all_player_ids) as player_id;

      v_scheduled_matches := v_scheduled_matches || jsonb_build_array(
        jsonb_build_object(
          'action', 'would_schedule',
          'match_id', v_match.id,
          'event_id', v_match.event_id,
          'round_number', v_match.round_number,
          'match_number', v_match.match_number,
          'court_id', v_next_court -> 'id',
          'court_name', v_next_court ->> 'court_name',
          'participant1_id', v_match.participant1_id,
          'participant2_id', v_match.participant2_id,
          'status', 'pending'
        )
      );

      continue;
    end if;

    update ag_tournament.courts
       set status = 'occupied'
     where id = (v_next_court ->> 'id')::uuid
       and status = 'available'
     returning *
      into v_reserved_court;

    if v_reserved_court.id is null then
      v_skipped_matches := v_skipped_matches || jsonb_build_array(
        jsonb_build_object(
          'match_id', v_match.id,
          'reason', 'court_no_longer_available'
        )
      );
      continue;
    end if;

    update ag_tournament.matches
       set court_id = v_reserved_court.id,
           status = 'scheduled'
     where id = v_match.id
       and status = 'pending'
       and court_id is null
     returning *
      into v_updated_match;

    if v_updated_match.id is null then
      update ag_tournament.courts
         set status = 'available'
       where id = v_reserved_court.id
         and status = 'occupied';

      v_skipped_matches := v_skipped_matches || jsonb_build_array(
        jsonb_build_object(
          'match_id', v_match.id,
          'reason', 'match_no_longer_schedulable'
        )
      );
      continue;
    end if;

    select coalesce(array_agg(distinct player_id), '{}'::text[])
      into v_blocked_player_ids
    from unnest(v_blocked_player_ids || v_all_player_ids) as player_id;

    v_scheduled_matches := v_scheduled_matches || jsonb_build_array(
      jsonb_build_object(
        'action', 'scheduled',
        'match_id', v_updated_match.id,
        'event_id', v_updated_match.event_id,
        'round_number', v_updated_match.round_number,
        'match_number', v_updated_match.match_number,
        'court_id', v_reserved_court.id,
        'court_name', v_reserved_court.court_name,
        'participant1_id', v_match.participant1_id,
        'participant2_id', v_match.participant2_id,
        'status', v_updated_match.status
      )
    );
  end loop;

  return jsonb_build_object(
    'tournament_id', p_tournament_id,
    'event_id', p_event_id,
    'dry_run', p_dry_run,
    'free_court_count', v_free_court_count,
    'candidate_match_count', v_candidate_match_count,
    'scheduled_count', jsonb_array_length(v_scheduled_matches),
    'scheduled_matches', v_scheduled_matches,
    'skipped_matches', v_skipped_matches
  );
end;
$$;

grant usage on schema ag_tournament to authenticated, service_role;
grant select, insert, update, delete on all tables in schema ag_tournament to authenticated, service_role;
grant execute on all functions in schema ag_tournament to authenticated, service_role;
grant execute on all routines in schema ag_tournament to authenticated, service_role;

alter default privileges in schema ag_tournament
grant select, insert, update, delete on tables to authenticated, service_role;

alter default privileges in schema ag_tournament
grant execute on functions to authenticated, service_role;

alter default privileges in schema ag_tournament
grant execute on routines to authenticated, service_role;

commit;
