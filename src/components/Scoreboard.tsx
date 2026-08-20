"use client";

import { colorOf, type GameState, type Match } from "@/lib/types";

/** The live match strip. Reads at a glance from across a gym. */
export function Scoreboard({
  match,
  state,
  big = false,
}: {
  match: Match;
  state: GameState;
  big?: boolean;
}) {
  const a = state.teams.find((t) => t.id === match.team_a);
  const b = state.teams.find((t) => t.id === match.team_b);
  if (!a || !b) return null;

  const side = (team: typeof a, score: number, align: "left" | "right") => (
    <div className={`flex-1 ${align === "right" ? "text-right" : ""}`}>
      <div
        className={`truncate font-medium ${big ? "text-2xl" : "text-sm"}`}
        style={{ color: colorOf(team.color) }}
      >
        {team.name}
      </div>
      <div className={`mono tnum font-bold ${big ? "text-7xl" : "text-4xl"}`}>{score}</div>
    </div>
  );

  return (
    <div className="panel px-5 py-4">
      <div className="mb-2 flex items-center justify-center gap-2">
        <span
          className="live-dot inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: match.status === "live" ? "#D2503A" : "rgba(244,241,234,0.4)" }}
        />
        <span className="eyebrow">
          {match.status === "live" ? `on court · first to ${match.target}` : "final"}
        </span>
      </div>
      <div className="flex items-center gap-4">
        {side(a, match.score_a, "left")}
        <span className="mono shrink-0 text-xs" style={{ color: "rgba(244,241,234,0.3)" }}>
          VS
        </span>
        {side(b, match.score_b, "right")}
      </div>
    </div>
  );
}
