"use client";

import { colorOf, roundStanding, tint, type GameState, type Team } from "@/lib/types";

export function Leaderboard({
  state,
  ranked,
  big = false,
  highlightTeamId,
}: {
  state: GameState;
  ranked: Team[];
  big?: boolean;
  highlightTeamId?: string | null;
}) {
  const leader = ranked[0];
  const live = state.game.status === "live" && !!state.round;

  return (
    <div className={big ? "space-y-3" : "space-y-2"}>
      {ranked.map((team, i) => {
        const hex = colorOf(team.color);
        const now = roundStanding(team, state);
        const isMine = highlightTeamId === team.id;
        const behind = leader ? leader.rating - team.rating : 0;

        return (
          <div
            key={team.id}
            className="panel relative overflow-hidden px-4 py-3 transition-colors"
            style={isMine ? { borderColor: tint(hex, 0.55), background: tint(hex, 0.07) } : undefined}
          >
            <div className="absolute inset-y-0 left-0 w-1" style={{ background: hex }} />

            <div className="flex items-center gap-3 pl-2">
              <div
                className={`mono tnum shrink-0 text-center ${big ? "w-10 text-2xl" : "w-6 text-sm"}`}
                style={{ color: i === 0 ? "#E8B04B" : "rgba(244,241,234,0.45)" }}
              >
                {i + 1}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className={`truncate font-medium ${big ? "text-2xl" : "text-base"}`}>
                    {team.name}
                  </span>
                  {isMine && <span className="eyebrow shrink-0">your team</span>}
                </div>

                <div
                  className={`mono mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 ${
                    big ? "text-xs" : "text-[0.68rem]"
                  }`}
                  style={{ color: "rgba(244,241,234,0.5)" }}
                >
                  <span className="tnum">
                    {team.wins}–{team.losses}
                    {team.draws > 0 ? `–${team.draws}` : ""}
                  </span>
                  <span className="tnum">{team.court_points} PTS</span>
                  <span className="tnum" style={{ color: tint(hex, 0.95) }}>
                    {Number(team.dhikr_count).toLocaleString()} DHIKR
                  </span>
                  <span className="tnum">{now.size} ON ROSTER</span>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div className={`mono tnum font-bold ${big ? "text-3xl" : "text-xl"}`}>
                  {Math.round(team.rating)}
                </div>
                <div className="eyebrow" style={{ fontSize: big ? "0.65rem" : "0.58rem" }}>
                  {i === 0 ? "leading" : `−${Math.round(behind)}`}
                </div>
              </div>
            </div>

            {/*
              This round's share of the hall's effort. There is no target bar to
              fill — the marker is where an even split would sit, so a team can
              see at a glance whether it is pulling its weight right now.
            */}
            {live && (
              <div className="mt-2.5 pl-2">
                <div
                  className="relative h-1.5 w-full overflow-hidden rounded-full"
                  style={{ background: tint("#F4F1EA", 0.1) }}
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-700"
                    style={{ width: `${Math.min(100, now.share * 100)}%`, background: hex }}
                  />
                  <div
                    className="absolute inset-y-0 w-px"
                    style={{ left: `${now.even * 100}%`, background: "rgba(244,241,234,0.55)" }}
                  />
                </div>
                <div
                  className="mono mt-1 flex justify-between text-[0.6rem]"
                  style={{ color: "rgba(244,241,234,0.4)" }}
                >
                  <span>this azkar · {now.count.toLocaleString()}</span>
                  <span className="tnum">
                    {now.active ? `${now.rank} of ${now.of}` : "—"}
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
