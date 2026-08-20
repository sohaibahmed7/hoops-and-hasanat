# Hoops & Hasanat

A Kahoot-style web game for a basketball event: teams play short games on the
court, and everyone off the court recites azkar. Both feed **one shared team
rating**, so the bench is never dead time.

Everything runs on phones — no projector or shared screen needed. The host runs
the evening from one phone; everyone else sees the current azkar, the live
score, the standings and their place in the court queue on their own.

Themed after the Pillars *Brothers' Basketball Run* poster — cobalt watercolour
ground, rim red, cream net, Outfit over Space Mono.

---

## How it works

The hall runs on one clock. Every **10 or 20 minutes** (the host picks) the
azkar changes, and every phone in the room shows the same one at the same time.
There is **no target count** — you recite as much or as little as you like, and
your team is measured against what the rest of the hall managed in the same
window.

Games on court run to **5 or 7 points** — also the host's choice, switchable at
any time during the event.

### The court rotation

King of the court:

- The **winner holds the floor**, the loser goes to the back of the queue.
- **Two wins in a row and both teams come off** — nobody camps on the court all
  evening. The two departing sides are queued loser-first, so the team that has
  just played two straight rests the longest.
- A level game (only reachable if the host ends one early) puts both off:
  nobody earned the floor.

Every player's phone shows where they stand in the queue: *you're on court*,
*you're next on*, or *2 teams ahead of you*. Coming on court opens the Court
tab automatically and buzzes the handset, so nobody has to be shouted for.

### Who keeps score

**The players do — the host never has to touch anything.** The host is usually
playing too, and a host who is on court can't tip off games or record results
for everyone else.

So the two teams on court run it between themselves:

1. Either side taps **Start the game**.
2. They play. *Nothing is tracked basket by basket* — there is no live
   scoreboard to keep updated while you're trying to play.
3. When it's over, either side enters the **final score** from their own point
   of view ("us 7, them 4"), as two rows of buttons — every possible score fits
   on screen for a game to 5 or 7.
4. The **other team confirms** with one tap, or says *that's not right*, which
   clears the score so it can be entered again.

Only the side that did *not* report can confirm — that's the whole check
against a team writing itself a win — and any player on that side will do, so
one flat battery can't hold up the court.

The host console keeps a full override: it can confirm a result the players
left hanging, scrub a game, change the matchup, or record a score itself. None
of that is needed on a normal night.

### The three numbers

| Number | Moves when |
|---|---|
| **Court points** | Points scored across games, plus a W–L–D record |
| **Dhikr** | Everything the roster has recited, all evening |
| **Rating** | The shared Elo. Moved by *both*. Standings sort on this. |

### Court results

Standard Elo, `K = 24`, with a margin-of-victory multiplier (the
FiveThirtyEight form). Since games run to 5 or 7, margins are small by
construction — a 7–0 sweep is worth about three times a 7–6 finish, not thirty
times. Rating only moves when the host calls a game **final**.

| Result | Rating |
|---|---|
| 7–6 | ≈ ±8 |
| 7–3 | ≈ ±19 |
| 7–0 | ≈ ±24 |

### Azkar rounds

Each azkar interval is scored as a **round-robin Elo**: every team is treated as
having played a micro-match against every other team, where its result against
each opponent is its share of the two teams' combined effort. Because those
shares and the Elo expectations both sum to one across each pair, a round is
exactly **zero-sum** — measured to six decimal places in the tests.

Three properties fall out of that, all verified:

- **Effort is per member.** A four-man team reciting 400 and an eight-man team
  reciting 800 finish a round with *identical* rating. Stacking a roster buys
  nothing.
- **The underdog gains more.** On a four-team field, two teams reciting
  identically came out +7.07 for the one in last place and −2.27 for the one
  300 points clear. A leader has to keep working to stay there.
- **Silence costs nothing extra.** If nobody recites during a round, no rating
  moves at all — the round closes quietly rather than shuffling points around
  on the basis of who was already ahead.

`K = 12` per round, scaled by the rotation length, so choosing 20-minute azkar
instead of 10-minute ones doesn't change how much dhikr is worth over an
evening — there are simply half as many rounds, each worth double.

### Balance

Over a typical evening the two channels come out comparable: a team that wins
most of its games gains roughly what a team that leads most of its azkar rounds
does. Between two teams with similar records, the reciting decides it.

One deliberate consequence worth knowing: because it is **one** rating, a team
riding high from the court is expected to lead the azkar too, and gains less
per round for the same effort. That is Elo working as designed and it keeps the
table tight all night — but it does mean a strong team can lead a round and
still shed a point or two.

### Anti-cheat

Tap counting is a token bucket **evaluated inside Postgres**, not in the app
server — so it holds regardless of which serverless instance takes the request,
and it can't be beaten by opening five tabs. Default: 8 taps/second sustained,
30 burst. Verified: a human tapping five per second is never throttled; a
script asking for 400 at once is granted 30.

Counting only scores while the evening is running — taps before the host starts
and after they call it are granted zero.

---

## Setup

### 1. Supabase

Create a project at [supabase.com](https://supabase.com) (the free tier is
plenty for a 60-person event). Open **SQL Editor** and run the whole of
[`supabase/schema.sql`](supabase/schema.sql) once. That creates the tables, the
RLS policies, the realtime publication, and the functions holding the game
logic.

### 2. Environment

```bash
cp .env.example .env.local
```

Fill in from **Project Settings → API**:

| Variable | Where |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key — **server only, never commit** |

### 3. Run

```bash
npm install && npm run dev
```

### 4. Deploy (Netlify)

1. **Add new site → Import an existing project**, pick this repo. Netlify
   detects Next.js and installs its Next runtime; [`netlify.toml`](netlify.toml)
   pins the build command, publish directory and Node version.
2. Before the first deploy finishes, add the same three variables under **Site
   configuration → Environment variables**. Both `NEXT_PUBLIC_*` values are
   needed at **build** time, so if you add them afterwards you must trigger a
   redeploy for them to take effect.
3. Set `SUPABASE_SERVICE_ROLE_KEY` scoped to **Functions** (and Builds) only —
   never to the browser. It is the key that can write scores.

The URL Netlify gives back is the one you share. A custom domain, if you add
one, changes nothing else — join links are built from whatever origin the page
is served on.

---

## Running the event

1. **You** open `/host`, name the event, name the teams, choose **5 or 7
   points** and **10 or 20 minute** azkar, and create. You land on the host
   console; your browser quietly stores the host key.
2. **Share the link.** *Copy link* or *Share* sends it straight into WhatsApp;
   the QR on your screen works for anyone standing next to you.
3. **Everyone else** opens it, types a name, and either picks a team or takes
   *"put me where I'm needed"* (which fills the smallest roster — this is what
   stops 14 v 3).
4. Press **Start the evening**. The first azkar goes up on every phone and the
   rotation begins.
5. **Then put your phone away and play.** The teams on court start their own
   games and report their own scores; the rotation and the ratings follow from
   that. Your console is there if something goes wrong, not to be watched.
6. Teams waiting their turn are reciting the whole time, and can see on their
   own phones when they're next.

There is no step that needs a projector. `/g/<CODE>/board` still exists if you
happen to have a spare laptop or TV — it shows the azkar, live score, standings
and QR at wall size — but nothing depends on it.

### Notes for the host

- **Nothing runs between requests.** Both rotations are lazy, so the free
  Netlify tier is enough — there is no cron, worker or always-on process.
- **The azkar rotation needs no babysitting.** Rounds are derived from the
  clock and settled by whoever next loads the page, so nothing has to stay
  running.
- **The court rotation is automatic too.** A confirmed result decides who holds
  the floor and who comes on; the feed spells it out for everyone.
- **You can play.** Nothing in the normal run of the evening needs the console,
  so being on court doesn't stall anything.
- **Moving devices.** *Copy host key* on the console, paste it into the same
  page on the other device. The key never leaves your browser otherwise — it
  lives in a table the public API key cannot read.
- **Latecomers.** A team added mid-event starts at the field average, not at
  1000, so it's neither gifted a lead nor buried before it plays.
- **Changing the target mid-event** is fine — games already played keep the
  target they were played to.
- **End game** freezes everything. It's reversible if you call it early, and
  reopening does not restart the azkar rotation from the beginning.

## Routes

| Route | Who |
|---|---|
| `/` | Landing — enter a room code |
| `/host` | Create a game |
| `/j/<CODE>` | Join screen (this is the share link) |
| `/g/<CODE>` | Player: court, azkar counter, standings |
| `/g/<CODE>/host` | Host console |
| `/g/<CODE>/board` | Optional big-screen board (not needed) |

## Tuning

On the `games` row — the first two are in the host console, the rest are for
the SQL editor:

| Column | Default | Effect |
|---|---|---|
| `point_target` | 7 | Games run to this (5 or 7) |
| `rotation_min` | 10 | Minutes per azkar (10 or 20) |
| `azkar_seq` | the seven in `src/lib/dhikr.ts` | Rotation order |
| `k_match` | 24 | How hard a win moves the rating |
| `k_dhikr` | 12 | How hard one azkar round moves it |
| `tap_rate` | 8 | Sustained taps/second allowed |
| `tap_burst` | 30 | Burst allowance |
