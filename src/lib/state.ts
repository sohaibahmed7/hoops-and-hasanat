import { admin } from "./supabaseAdmin";
import type { GameState, Round } from "./types";

/**
 * One round trip that assembles everything a screen needs.
 *
 * This also nudges the azkar rotation forward: `ensure_rounds` settles any
 * interval that has fully elapsed. Rotation is therefore driven by whoever
 * happens to be looking at the game, with no scheduler to keep alive.
 */
export async function loadState(code: string): Promise<GameState | null> {
  const db = admin();
  const { data: game } = await db
    .from("games")
    .select(
      "id, code, name, status, started_at, point_target, rotation_min, k_match, k_dhikr, tap_rate, tap_burst, created_at"
    )
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (!game) return null;

  if (game.status === "live") {
    await db.rpc("ensure_rounds", { p_game: game.id });
  }

  const [teamsRes, players, matches, feed, roundRow] = await Promise.all([
    db.from("teams").select("*").eq("game_id", game.id).order("ord").order("created_at"),
    db
      .from("players")
      .select("id, game_id, team_id, name, dhikr_count, created_at")
      .eq("game_id", game.id)
      .order("created_at"),
    db.from("matches").select("*").eq("game_id", game.id).order("created_at", { ascending: false }),
    db.from("feed").select("*").eq("game_id", game.id).order("created_at", { ascending: false }).limit(30),
    db
      .from("rounds")
      .select("id, idx, dhikr_id, started_at")
      .eq("game_id", game.id)
      .order("idx", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // A game created before the court rotation existed — or one whose teams were
  // edited — can end up with nobody seated. Repair it on read, otherwise the
  // console offers no way to tip off and the evening stalls.
  let teams = (teamsRes.data ?? []) as GameState["teams"];
  if (teams.length >= 2 && teams.filter((t) => t.on_court).length < 2) {
    await db.rpc("seed_court", { p_game: game.id });
    const { data } = await db
      .from("teams")
      .select("*")
      .eq("game_id", game.id)
      .order("ord")
      .order("created_at");
    if (data) teams = data as GameState["teams"];
  }

  let round: Round | null = null;
  let roundTally: Record<string, number> = {};

  if (roundRow.data) {
    const started = new Date(roundRow.data.started_at);
    round = {
      id: roundRow.data.id,
      idx: roundRow.data.idx,
      dhikr_id: roundRow.data.dhikr_id,
      started_at: roundRow.data.started_at,
      ends_at: new Date(started.getTime() + game.rotation_min * 60_000).toISOString(),
    };
    const { data: tally } = await db
      .from("round_tally")
      .select("team_id, count")
      .eq("round_id", round.id);
    roundTally = Object.fromEntries((tally ?? []).map((t) => [t.team_id, Number(t.count)]));
  }

  return {
    game: game as GameState["game"],
    teams,
    players: (players.data ?? []) as GameState["players"],
    matches: (matches.data ?? []) as GameState["matches"],
    feed: (feed.data ?? []) as GameState["feed"],
    round,
    roundTally,
  };
}

export async function requireHost(code: string, hostToken: string | null) {
  const db = admin();
  const { data: game } = await db
    .from("games")
    .select("id, point_target")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (!game) return { ok: false as const, error: "No game with that code." };
  if (!hostToken) return { ok: false as const, error: "Host token missing." };
  const { data: host } = await db
    .from("game_hosts")
    .select("host_token")
    .eq("game_id", game.id)
    .maybeSingle();
  if (!host || host.host_token !== hostToken) {
    return { ok: false as const, error: "You are not the host of this game." };
  }
  return { ok: true as const, gameId: game.id as string, pointTarget: game.point_target as number };
}
