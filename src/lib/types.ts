export type Team = {
  id: string;
  game_id: string;
  name: string;
  color: string;
  ord: number;
  rating: number;
  court_points: number;
  points_against: number;
  wins: number;
  losses: number;
  draws: number;
  dhikr_count: number;
  on_court: boolean;
  queue_pos: number | null;
  streak: number;
  created_at: string;
};

export type Player = {
  id: string;
  game_id: string;
  team_id: string | null;
  name: string;
  dhikr_count: number;
  created_at: string;
};

export type Match = {
  id: string;
  game_id: string;
  team_a: string;
  team_b: string;
  score_a: number;
  score_b: number;
  target: number;
  status: "live" | "pending" | "final";
  reported_by: string | null;
  delta_a: number | null;
  delta_b: number | null;
  created_at: string;
  ended_at: string | null;
};

export type FeedItem = {
  id: string;
  game_id: string;
  kind: "join" | "round" | "court" | "final" | "note";
  text: string;
  created_at: string;
};

export type Game = {
  id: string;
  code: string;
  name: string;
  status: "lobby" | "live" | "ended";
  started_at: string | null;
  point_target: number;
  rotation_min: number;
  k_match: number;
  k_dhikr: number;
  tap_rate: number;
  tap_burst: number;
  created_at: string;
};

/** The azkar interval currently running, with the clock the client counts down. */
export type Round = {
  id: string;
  idx: number;
  dhikr_id: string;
  started_at: string;
  ends_at: string;
};

export type GameState = {
  game: Game;
  teams: Team[];
  players: Player[];
  matches: Match[];
  feed: FeedItem[];
  round: Round | null;
  /** This round's tally, keyed by team id. Resets every rotation. */
  roundTally: Record<string, number>;
};

/**
 * A team's standing in the round that's running. There is no target to reach —
 * a team is measured against the rest of the hall, so `share` is its portion of
 * the per-member effort and 1/n is a level field.
 */
export function roundStanding(team: Team, state: GameState) {
  const members = state.players.filter((p) => p.team_id === team.id);
  const size = members.length;
  const count = state.roundTally[team.id] ?? 0;
  const perMember = size > 0 ? count / size : 0;

  const rates = state.teams.map((t) => {
    const n = state.players.filter((p) => p.team_id === t.id).length;
    return n > 0 ? (state.roundTally[t.id] ?? 0) / n : 0;
  });
  const total = rates.reduce((a, b) => a + b, 0);
  const contenders = state.teams.filter(
    (t) => state.players.some((p) => p.team_id === t.id)
  ).length;

  const ranked = [...state.teams]
    .filter((t) => state.players.some((p) => p.team_id === t.id))
    .sort((a, b) => {
      const na = state.players.filter((p) => p.team_id === a.id).length || 1;
      const nb = state.players.filter((p) => p.team_id === b.id).length || 1;
      return (state.roundTally[b.id] ?? 0) / nb - (state.roundTally[a.id] ?? 0) / na;
    });

  return {
    members,
    size,
    count,
    perMember,
    share: total > 0 ? perMember / total : 0,
    even: contenders > 0 ? 1 / contenders : 0,
    rank: ranked.findIndex((t) => t.id === team.id) + 1,
    of: contenders,
    // Until someone recites, every team ties on zero and the sort puts one of
    // them "first" — which would tell a silent hall that it is winning.
    active: total > 0,
  };
}

/**
 * Who holds the floor and who is waiting.
 *
 * The rotation is king-of-the-court: the winner stays on, the loser goes to
 * the back — but a team that wins twice running comes off too, so nobody camps
 * on the court. `warning` is the team one win away from being moved on.
 */
export function courtState(state: GameState) {
  const onCourt = state.teams.filter((t) => t.on_court).sort((a, b) => a.ord - b.ord);
  const queue = state.teams
    .filter((t) => !t.on_court)
    .sort((a, b) => (a.queue_pos ?? 0) - (b.queue_pos ?? 0) || a.ord - b.ord);
  const warning = onCourt.find((t) => t.streak >= 1) ?? null;
  return { onCourt, queue, warning };
}

/** Where a team sits in the rotation, phrased for the person holding the phone. */
export function courtPosition(teamId: string | null, state: GameState) {
  if (!teamId) return { label: "", detail: "", kind: "none" as const };
  const { onCourt, queue } = courtState(state);
  const live = state.matches.find((m) => m.status === "live" || m.status === "pending");

  if (onCourt.some((t) => t.id === teamId)) {
    const me = onCourt.find((t) => t.id === teamId)!;
    return {
      kind: live ? ("playing" as const) : ("on" as const),
      label: live
        ? live.status === "pending"
          ? "Result waiting to be settled"
          : "You're on court"
        : "Your team is up",
      detail: !live
        ? "Get on the court and start the game from the Court tab."
        : live.status === "pending"
          ? "Check the score on the Court tab."
          : me.streak >= 1
            ? "Win this one and your team comes off too."
            : "Report the score on the Court tab when you're done.",
    };
  }

  const at = queue.findIndex((t) => t.id === teamId);
  if (at === 0) {
    return {
      kind: "next" as const,
      label: "You're next on",
      detail: "You're on as soon as this game is confirmed.",
    };
  }
  if (at > 0) {
    return {
      kind: "waiting" as const,
      label: `${at} team${at === 1 ? "" : "s"} ahead of you`,
      detail: "Keep reciting — it counts the whole time you're waiting.",
    };
  }
  return { kind: "none" as const, label: "", detail: "" };
}

/** Milliseconds until the current azkar gives way to the next one. */
export function msRemaining(round: Round | null, now: number) {
  if (!round) return 0;
  return Math.max(0, new Date(round.ends_at).getTime() - now);
}

export function clock(ms: number) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Team colours are drawn from the poster: cream net, rim red, and a set of
 * chalk tones that stay legible on cobalt. Kept as hex rather than Tailwind
 * class names so a colour can be picked at runtime without safelisting.
 */
export const TEAM_COLORS = [
  { id: "net",    label: "Net",    hex: "#F4F1EA" },
  { id: "rim",    label: "Rim",    hex: "#D2503A" },
  { id: "gold",   label: "Gold",   hex: "#E8B04B" },
  { id: "mint",   label: "Mint",   hex: "#6FD3B0" },
  { id: "sky",    label: "Sky",    hex: "#7FB2F0" },
  { id: "lilac",  label: "Lilac",  hex: "#B39CE8" },
  { id: "coral",  label: "Coral",  hex: "#F08C7A" },
  { id: "leaf",   label: "Leaf",   hex: "#8FC96B" },
] as const;

export function colorOf(id: string): string {
  return TEAM_COLORS.find((c) => c.id === id)?.hex ?? TEAM_COLORS[0].hex;
}

/** Cobalt is dark, so tint fills stay low-alpha and text stays near-full. */
export function tint(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
