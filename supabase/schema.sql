-- ============================================================================
-- Hoops & Hasanat — schema + game logic
-- Run this whole file once in the Supabase SQL editor.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists games (
  id           uuid primary key default gen_random_uuid(),
  code         text unique not null,
  name         text not null,
  status       text not null default 'lobby',      -- lobby | live | ended
  started_at   timestamptz,                        -- when the azkar rotation began

  -- tuning knobs, editable by the host at any time
  point_target int  not null default 7,            -- games run to 5 or 7
  rotation_min int  not null default 10,           -- minutes per azkar
  azkar_seq    text[] not null default '{}',       -- the rotation, in order
  k_match      real not null default 24,           -- Elo K for a court result
  k_dhikr      real not null default 12,           -- Elo K for one azkar round
  tap_rate     real not null default 8,            -- max sustained taps/sec/player
  tap_burst    real not null default 30,           -- burst allowance
  created_at   timestamptz not null default now()
);

-- The host secret lives apart from `games`: realtime broadcasts whole rows, so a
-- token on a subscribable table would be handed to every browser in the room.
create table if not exists game_hosts (
  game_id    uuid primary key references games(id) on delete cascade,
  host_token text not null
);

create table if not exists teams (
  id             uuid primary key default gen_random_uuid(),
  game_id        uuid not null references games(id) on delete cascade,
  name           text not null,
  color          text not null default 'net',
  ord            int  not null default 0,          -- the order the host typed them in
  rating         real not null default 1000,       -- the shared Elo, moved by court AND dhikr
  court_points   int  not null default 0,          -- cumulative points scored
  points_against int  not null default 0,
  wins           int  not null default 0,
  losses         int  not null default 0,
  draws          int  not null default 0,
  dhikr_count    bigint not null default 0,        -- lifetime, never reset

  -- King-of-the-court state. The winner holds the floor; a team that wins
  -- twice running gives it up along with the team it just beat.
  on_court       boolean not null default false,
  queue_pos      int,                              -- null while on court
  streak         int  not null default 0,          -- wins in the current run
  created_at     timestamptz not null default now()
);

create table if not exists players (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references games(id) on delete cascade,
  team_id       uuid references teams(id) on delete set null,
  name          text not null,
  dhikr_count   bigint not null default 0,
  -- token-bucket state for tap rate limiting
  tap_allowance real not null default 30,
  tap_checked   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- Same reasoning as game_hosts: a player's identity token must not ride along
-- in the realtime payload every other phone in the room receives.
create table if not exists player_secrets (
  player_id uuid primary key references players(id) on delete cascade,
  token     text unique not null
);

-- One row per azkar interval. Rounds are derived from the clock rather than
-- scheduled: nothing has to be running between requests for the rotation to
-- advance, which matters on serverless hosting with no cron.
create table if not exists rounds (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references games(id) on delete cascade,
  idx        int  not null,                        -- 0-based position in the evening
  dhikr_id   text not null,
  started_at timestamptz not null,
  settled    boolean not null default false,
  unique (game_id, idx)
);

-- What each team recited during one round. Lifetime totals live on teams.
create table if not exists round_tally (
  round_id uuid not null references rounds(id) on delete cascade,
  team_id  uuid not null references teams(id) on delete cascade,
  count    bigint not null default 0,
  primary key (round_id, team_id)
);

create table if not exists matches (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references games(id) on delete cascade,
  team_a     uuid not null references teams(id) on delete cascade,
  team_b     uuid not null references teams(id) on delete cascade,
  score_a    int not null default 0,
  score_b    int not null default 0,
  target     int not null default 7,               -- the target this game was played to
  status     text not null default 'live',         -- live | final
  delta_a    real,
  delta_b    real,
  created_at timestamptz not null default now(),
  ended_at   timestamptz
);

create table if not exists feed (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references games(id) on delete cascade,
  kind       text not null,                        -- join | round | final | court | note
  text       text not null,
  created_at timestamptz not null default now()
);

create index if not exists teams_game_idx   on teams(game_id);
create index if not exists players_game_idx on players(game_id);
create index if not exists matches_game_idx on matches(game_id);
create index if not exists rounds_game_idx  on rounds(game_id, idx);
create index if not exists feed_game_idx    on feed(game_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Upgrades
--
-- `create table if not exists` above is a no-op on a database that already has
-- the table — including when this file has since grown new columns. Without
-- the block below, re-running the schema on an existing project silently
-- leaves it on the old shape, and the app fails at runtime on the missing
-- column rather than at install time.
--
-- Everything here is `if not exists`, so this is safe on a fresh database too.
-- ---------------------------------------------------------------------------

alter table games add column if not exists started_at   timestamptz;
alter table games add column if not exists point_target int  not null default 7;
alter table games add column if not exists rotation_min int  not null default 10;
alter table games add column if not exists azkar_seq    text[] not null default '{}';
alter table games add column if not exists k_match      real not null default 24;
alter table games add column if not exists k_dhikr      real not null default 12;
alter table games add column if not exists tap_rate     real not null default 8;
alter table games add column if not exists tap_burst    real not null default 30;

alter table teams add column if not exists ord         int  not null default 0;
alter table teams add column if not exists dhikr_count bigint not null default 0;
alter table teams add column if not exists on_court    boolean not null default false;
alter table teams add column if not exists queue_pos   int;
alter table teams add column if not exists streak      int  not null default 0;

alter table players add column if not exists tap_allowance real not null default 30;
alter table players add column if not exists tap_checked   timestamptz not null default now();

alter table matches add column if not exists target int not null default 7;

-- Columns from earlier versions of this file that no longer carry meaning.
-- Dropped rather than left behind so the shape matches what the app expects.
alter table games drop column if exists dhikr_block;
alter table games drop column if exists host_token;
alter table teams drop column if exists dhikr_blocks;

-- ---------------------------------------------------------------------------
-- RLS: the browser may read a game it knows the code of, but never write.
-- Every write goes through a Next.js route handler using the service role key.
-- ---------------------------------------------------------------------------

alter table games         enable row level security;
alter table game_hosts    enable row level security;
alter table teams         enable row level security;
alter table players       enable row level security;
alter table player_secrets enable row level security;
alter table rounds        enable row level security;
alter table round_tally   enable row level security;
alter table matches       enable row level security;
alter table feed          enable row level security;

drop policy if exists games_read   on games;
drop policy if exists teams_read   on teams;
drop policy if exists players_read on players;
drop policy if exists rounds_read  on rounds;
drop policy if exists tally_read   on round_tally;
drop policy if exists matches_read on matches;
drop policy if exists feed_read    on feed;

create policy games_read   on games       for select using (true);
create policy teams_read   on teams       for select using (true);
create policy players_read on players     for select using (true);
create policy rounds_read  on rounds      for select using (true);
create policy tally_read   on round_tally for select using (true);
create policy matches_read on matches     for select using (true);
create policy feed_read    on feed        for select using (true);

-- game_hosts and player_secrets deliberately have NO policy: with RLS on and no
-- policy, anon reads return zero rows. Only the service-role key (server side)
-- can see these tokens.

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

do $$ begin alter publication supabase_realtime add table teams;
exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table players;
exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table matches;
exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table rounds;
exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table feed;
exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table games;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- settle_round(round)
--
-- Scores one azkar interval. There is no target count to reach — a round is
-- judged purely against what the rest of the field managed in the same window,
-- so reciting is open-ended and nobody is chasing a number.
--
-- The maths is a round-robin Elo: every team is treated as having played a
-- micro-match against every other team, where team i's result against j is
-- m_i / (m_i + m_j) — its share of the two teams' combined effort. Because
-- S_ij + S_ji = 1 and E_ij + E_ji = 1, the whole round is exactly zero-sum,
-- and an underdog still gains more for the same effort than the leader does.
--
-- m is dhikr *per member*, so a big roster has to work proportionally harder
-- and stacking a team buys nothing.
-- ---------------------------------------------------------------------------

create or replace function settle_round(p_round uuid)
returns void language plpgsql security definer as $$
declare
  v_game  uuid;
  v_idx   int;
  v_k     real;
  v_rot   int;
  v_n     int;
  v_total bigint;
  v_keff  real;
  v_best  text;
begin
  select r.game_id, r.idx into v_game, v_idx
    from rounds r where r.id = p_round and not r.settled
    for update;
  if v_game is null then return; end if;

  select g.k_dhikr, g.rotation_min into v_k, v_rot from games g where g.id = v_game;

  -- Only teams with someone on them take part in a round.
  select count(*) into v_n
    from teams t
   where t.game_id = v_game
     and exists (select 1 from players p where p.team_id = t.id);

  select coalesce(sum(rt.count), 0) into v_total
    from round_tally rt where rt.round_id = p_round;

  -- Nobody recited, or there is no field to compare against: close it quietly.
  -- Without this guard a silent round would still shuffle rating around purely
  -- on the basis of who was already ahead.
  if v_n < 2 or v_total = 0 then
    update rounds set settled = true where id = p_round;
    return;
  end if;

  -- A 20-minute rotation means half as many rounds in an evening as a
  -- 10-minute one, so scale K with the interval and the choice of rotation
  -- length stops affecting how much dhikr is worth overall.
  v_keff := v_k * (v_rot::real / 10.0);

  with roster as (
    select t.id,
           t.rating,
           (select count(*) from players p where p.team_id = t.id) as members,
           coalesce((select rt.count from round_tally rt
                      where rt.round_id = p_round and rt.team_id = t.id), 0) as cnt
      from teams t
     where t.game_id = v_game
  ),
  rate as (
    select id, rating, cnt::real / members::real as m
      from roster where members > 0
  ),
  pairs as (
    select a.id,
           sum(
             case when (a.m + b.m) = 0 then 0.5 else a.m / (a.m + b.m) end
             - 1.0 / (1.0 + power(10.0, (b.rating - a.rating) / 400.0))
           ) as s
      from rate a join rate b on a.id <> b.id
     group by a.id
  )
  update teams t
     set rating = t.rating + (v_keff / (v_n - 1)) * pairs.s
    from pairs
   where t.id = pairs.id;

  update rounds set settled = true where id = p_round;

  select t.name into v_best
    from round_tally rt join teams t on t.id = rt.team_id
   where rt.round_id = p_round
   order by rt.count::real /
            greatest((select count(*) from players p where p.team_id = t.id), 1)::real desc
   limit 1;

  insert into feed (game_id, kind, text)
  values (v_game, 'round',
          'Azkar ' || (v_idx + 1) || ' closed — ' || coalesce(v_best, 'nobody') ||
          ' led it (' || v_total || ' recited across the hall)');
end $$;

-- ---------------------------------------------------------------------------
-- ensure_rounds(game) — advance the rotation from the clock.
--
-- Called on every read and every tap. Creates whichever rounds should exist by
-- now and settles the ones that have fully elapsed. Nothing needs to be
-- running in the background between requests.
-- ---------------------------------------------------------------------------

create or replace function ensure_rounds(p_game uuid)
returns void language plpgsql security definer as $$
declare
  v_started timestamptz;
  v_rot     int;
  v_status  text;
  v_seq     text[];
  v_len     int;
  v_due     int;
  v_round   uuid;
  i         int;
begin
  select started_at, rotation_min, status, azkar_seq
    into v_started, v_rot, v_status, v_seq
    from games where id = p_game;

  if v_status <> 'live' or v_started is null then return; end if;
  v_len := coalesce(array_length(v_seq, 1), 0);
  if v_len = 0 or v_rot <= 0 then return; end if;

  v_due := floor(extract(epoch from (now() - v_started)) / (v_rot * 60));
  -- A game left running overnight shouldn't try to backfill hundreds of rounds.
  if v_due > 400 then v_due := 400; end if;

  for i in 0..v_due loop
    insert into rounds (game_id, idx, dhikr_id, started_at)
    values (p_game, i, v_seq[(i % v_len) + 1],
            v_started + make_interval(mins => i * v_rot))
    on conflict (game_id, idx) do nothing;
  end loop;

  for v_round in
    select id from rounds
     where game_id = p_game and idx < v_due and not settled
     order by idx
  loop
    perform settle_round(v_round);
  end loop;
end $$;

/** The round that is running right now, creating it if the clock has moved on. */
create or replace function current_round(p_game uuid)
returns uuid language plpgsql security definer as $$
declare v_id uuid;
begin
  perform ensure_rounds(p_game);
  select id into v_id from rounds where game_id = p_game order by idx desc limit 1;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- record_dhikr(player_token, count)
--
-- Token-bucket rate limit, evaluated in the database so it holds no matter
-- which serverless instance handles the request. Returns how many taps were
-- actually granted, so the client can reconcile its optimistic counter.
-- ---------------------------------------------------------------------------

create or replace function record_dhikr(p_token text, p_count int)
returns table (granted int, player_total bigint, team_total bigint, round_total bigint)
language plpgsql security definer as $$
declare
  v_player   uuid;
  v_team     uuid;
  v_game     uuid;
  v_allow    real;
  v_checked  timestamptz;
  v_rate     real;
  v_burst    real;
  v_status   text;
  v_elapsed  real;
  v_granted  int;
  v_ptotal   bigint;
  v_ttotal   bigint;
  v_rtotal   bigint;
  v_round    uuid;
begin
  if p_count is null or p_count <= 0 then
    return query select 0, 0::bigint, 0::bigint, 0::bigint;
    return;
  end if;
  p_count := least(p_count, 200);

  select p.id, p.team_id, p.game_id, p.tap_allowance, p.tap_checked
    into v_player, v_team, v_game, v_allow, v_checked
    from players p
    join player_secrets s on s.player_id = p.id
   where s.token = p_token
   for update of p;

  if v_player is null then
    raise exception 'unknown player';
  end if;

  select g.tap_rate, g.tap_burst, g.status
    into v_rate, v_burst, v_status
    from games g where g.id = v_game;

  -- Nothing counts before the evening starts or after it is called.
  if v_status <> 'live' then
    return query select 0, (select dhikr_count from players where id = v_player),
                        coalesce((select dhikr_count from teams where id = v_team), 0::bigint),
                        0::bigint;
    return;
  end if;

  v_elapsed := extract(epoch from (now() - v_checked));
  v_allow   := least(v_burst, v_allow + v_elapsed * v_rate);
  v_granted := least(p_count, floor(v_allow))::int;
  v_allow   := v_allow - v_granted;

  update players
     set tap_allowance = v_allow,
         tap_checked   = now(),
         dhikr_count   = dhikr_count + v_granted
   where id = v_player
   returning dhikr_count into v_ptotal;

  if v_granted > 0 and v_team is not null then
    update teams
       set dhikr_count = dhikr_count + v_granted
     where id = v_team
     returning dhikr_count into v_ttotal;

    v_round := current_round(v_game);
    if v_round is not null then
      insert into round_tally (round_id, team_id, count)
      values (v_round, v_team, v_granted)
      on conflict (round_id, team_id)
        do update set count = round_tally.count + excluded.count
      returning count into v_rtotal;
    end if;
  end if;

  return query select v_granted, v_ptotal,
                      coalesce(v_ttotal, 0::bigint), coalesce(v_rtotal, 0::bigint);
end $$;

-- ---------------------------------------------------------------------------
-- finalize_match(match, score_a, score_b)
--
-- Standard Elo with a margin-of-victory multiplier (the FiveThirtyEight form).
-- Games run to 5 or 7, so margins are small by construction: a 7–0 sweep is
-- worth roughly three times a 7–6 finish, not thirty times.
-- ---------------------------------------------------------------------------

create or replace function finalize_match(p_match uuid, p_a int, p_b int)
returns void language plpgsql security definer as $$
declare
  v_game    uuid;
  v_ta      uuid;  v_tb   uuid;
  v_ra      real;  v_rb   real;
  v_na      text;  v_nb   text;
  v_k       real;
  v_target  int;
  v_exp_a   real;
  v_score_a real;
  v_mov     real;
  v_delta   real;
  v_status  text;
begin
  select m.game_id, m.team_a, m.team_b, m.status, m.target
    into v_game, v_ta, v_tb, v_status, v_target
    from matches m where m.id = p_match for update;
  if v_game is null then raise exception 'unknown match'; end if;
  if v_status = 'final' then raise exception 'match already final'; end if;

  -- A game cannot be worth more than the target it was played to.
  p_a := least(greatest(p_a, 0), v_target);
  p_b := least(greatest(p_b, 0), v_target);

  select rating, name into v_ra, v_na from teams where id = v_ta;
  select rating, name into v_rb, v_nb from teams where id = v_tb;
  select k_match into v_k from games where id = v_game;

  v_score_a := case when p_a > p_b then 1.0 when p_a < p_b then 0.0 else 0.5 end;
  v_exp_a   := 1.0 / (1.0 + power(10.0, (v_rb - v_ra) / 400.0));

  v_mov := least(2.0, ln(abs(p_a - p_b) + 1) *
           (2.2 / (((case when v_score_a = 1 then v_ra - v_rb else v_rb - v_ra end) * 0.001) + 2.2)));
  if p_a = p_b then v_mov := 1.0; end if;

  v_delta := v_k * v_mov * (v_score_a - v_exp_a);

  update teams set
    rating         = rating + v_delta,
    court_points   = court_points + p_a,
    points_against = points_against + p_b,
    wins   = wins   + case when p_a > p_b then 1 else 0 end,
    losses = losses + case when p_a < p_b then 1 else 0 end,
    draws  = draws  + case when p_a = p_b then 1 else 0 end
  where id = v_ta;

  update teams set
    rating         = rating - v_delta,
    court_points   = court_points + p_b,
    points_against = points_against + p_a,
    wins   = wins   + case when p_b > p_a then 1 else 0 end,
    losses = losses + case when p_b < p_a then 1 else 0 end,
    draws  = draws  + case when p_a = p_b then 1 else 0 end
  where id = v_tb;

  update matches
     set score_a = p_a, score_b = p_b, status = 'final',
         delta_a = v_delta, delta_b = -v_delta, ended_at = now()
   where id = p_match;

  insert into feed (game_id, kind, text)
  values (v_game, 'final',
          v_na || ' ' || p_a || ' – ' || p_b || ' ' || v_nb ||
          '  (' || case when v_delta >= 0 then '+' else '' end ||
          round(v_delta::numeric, 1) || ' / ' ||
          case when -v_delta >= 0 then '+' else '' end ||
          round((-v_delta)::numeric, 1) || ')');

  -- Who holds the floor, who comes off, who is up next.
  if p_a = p_b then
    perform advance_court(v_game, v_ta, v_tb, true);
  elsif p_a > p_b then
    perform advance_court(v_game, v_ta, v_tb, false);
  else
    perform advance_court(v_game, v_tb, v_ta, false);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- smallest_team(game) — where an unassigned player should go.
-- ---------------------------------------------------------------------------

create or replace function smallest_team(p_game uuid)
returns uuid language sql stable as $$
  select t.id
    from teams t
    left join players p on p.team_id = t.id
   where t.game_id = p_game
   group by t.id, t.ord
   -- Teams inserted in one statement share a created_at, so fall back to the
   -- host's own ordering: assignment stays balanced *and* deterministic.
   order by count(p.id) asc, t.ord asc, t.id asc
   limit 1;
$$;

-- ---------------------------------------------------------------------------
-- advance_court(game, winner, loser, draw)
--
-- The rotation rule: the winner holds the floor and the loser goes to the back
-- of the queue — except that a team winning twice in a row gives the floor up
-- too, so nobody camps on the court all evening.
--
-- Both departing teams are appended loser-first, so the side that has just
-- played two or more games straight rests the longest. A draw (only reachable
-- if the host ends a game early) puts both off: nobody earned the floor.
-- ---------------------------------------------------------------------------

create or replace function advance_court(
  p_game uuid, p_winner uuid, p_loser uuid, p_draw boolean
) returns void language plpgsql security definer as $$
declare
  v_next   int;
  v_streak int;
  v_both   boolean := false;
  v_id     uuid;
  v_wname  text;
  v_lname  text;
  v_coming text;
begin
  select name into v_wname from teams where id = p_winner;
  select name into v_lname from teams where id = p_loser;

  if p_draw then
    v_both := true;
    update teams set streak = 0 where id in (p_winner, p_loser);
  else
    update teams set streak = streak + 1 where id = p_winner returning streak into v_streak;
    update teams set streak = 0 where id = p_loser;
    if v_streak >= 2 then
      v_both := true;
      update teams set streak = 0 where id = p_winner;
    end if;
  end if;

  select coalesce(max(queue_pos), 0) into v_next from teams where game_id = p_game;

  v_next := v_next + 1;
  update teams set on_court = false, queue_pos = v_next where id = p_loser;

  if v_both then
    v_next := v_next + 1;
    update teams set on_court = false, queue_pos = v_next where id = p_winner;
  end if;

  -- Refill the floor from the front of the queue. The limit is evaluated
  -- before any of these updates land, so it is exactly the number of empty
  -- slots: one if the winner held on, two if both came off.
  for v_id in
    select id from teams
     where game_id = p_game and not on_court
     order by queue_pos nulls last, ord
     limit greatest(0, 2 - (select count(*) from teams
                             where game_id = p_game and on_court))
  loop
    update teams set on_court = true, queue_pos = null where id = v_id;
  end loop;

  select string_agg(name, ' vs ' order by ord) into v_coming
    from teams where game_id = p_game and on_court;

  insert into feed (game_id, kind, text)
  values (p_game, 'court',
    case
      when p_draw then
        'Level game — both teams off. Up next: ' || coalesce(v_coming, 'nobody')
      when v_both then
        v_wname || ' won two in a row, so both teams come off. Up next: ' ||
        coalesce(v_coming, 'nobody')
      else
        v_wname || ' hold the floor. ' || v_lname || ' off — up next: ' ||
        coalesce(v_coming, 'nobody')
    end);
end $$;

-- ---------------------------------------------------------------------------
-- seed_court(game) — seat the opening two teams, queue the rest.
-- Also repairs the court if teams were added or removed mid-event.
-- ---------------------------------------------------------------------------

create or replace function seed_court(p_game uuid)
returns void language plpgsql security definer as $$
declare
  v_id uuid;
  v_on int;
  i    int := 0;
begin
  select count(*) into v_on from teams where game_id = p_game and on_court;

  -- Untouched game: seat the first two in the host's own order.
  if v_on = 0 then
    for v_id in select id from teams where game_id = p_game order by ord, created_at loop
      if i < 2 then
        update teams set on_court = true, queue_pos = null where id = v_id;
      else
        update teams set on_court = false, queue_pos = i - 1 where id = v_id;
      end if;
      i := i + 1;
    end loop;
    return;
  end if;

  -- Otherwise just top the floor back up to two from the front of the queue.
  for v_id in
    select id from teams
     where game_id = p_game and not on_court
     order by queue_pos nulls last, ord
     limit greatest(0, 2 - v_on)
  loop
    update teams set on_court = true, queue_pos = null where id = v_id;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- renumber_queue(game) — give every waiting team a clean position.
--
-- A team bumped off the floor by a manual matchup change has no queue position
-- yet. It was about to play, so it belongs at the *front* of the line, not the
-- back — hence `nulls first`.
-- ---------------------------------------------------------------------------

create or replace function renumber_queue(p_game uuid)
returns void language plpgsql security definer as $$
declare v_id uuid; i int := 1;
begin
  for v_id in
    select id from teams
     where game_id = p_game and not on_court
     order by queue_pos nulls first, ord
  loop
    update teams set queue_pos = i where id = v_id;
    i := i + 1;
  end loop;
end $$;
