"use client";

import { useEffect, useState } from "react";
import { colorOf, tint, type GameState, type Match, type Team } from "@/lib/types";

/**
 * The court, from a player's point of view. This is where the host is taken
 * out of the loop: the two sides start their own game, one reports the final
 * score, the other confirms it.
 */
export function CourtPanel({
  state,
  myTeam,
  playerToken,
  onDone,
}: {
  state: GameState;
  myTeam: Team;
  playerToken: string;
  onDone: () => void;
}) {
  const live = state.matches.find((m) => m.status === "live" || m.status === "pending") ?? null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/court", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerToken, ...body }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "That didn't work.");
        return false;
      }
      onDone();
      return true;
    } catch {
      setError("Network trouble — try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const opponent =
    live && state.teams.find((t) => t.id === (live.team_a === myTeam.id ? live.team_b : live.team_a));

  // ---- no game on: this team is up ----
  if (!live) {
    const other = state.teams.find((t) => t.on_court && t.id !== myTeam.id);
    return (
      <div className="panel px-5 py-6 text-center">
        <p className="eyebrow" style={{ color: "#E5745E" }}>
          Your team is up
        </p>
        <p className="mt-3 text-2xl font-light">
          <span style={{ color: colorOf(myTeam.color) }}>{myTeam.name}</span>
          <span className="mono mx-2 text-sm" style={{ color: "rgba(244,241,234,0.35)" }}>
            VS
          </span>
          <span style={{ color: other ? colorOf(other.color) : undefined }}>
            {other?.name ?? "…"}
          </span>
        </p>
        <p className="mt-2 text-sm" style={{ color: "rgba(244,241,234,0.6)" }}>
          Get on the court. First to {state.game.point_target}.
        </p>
        <button
          className="btn btn-rim mt-5 w-full"
          disabled={busy || !other}
          onClick={() => post({ action: "start" })}
        >
          {busy ? "Starting…" : "Start the game"}
        </button>
        {error && (
          <p className="mono mt-3 text-xs" style={{ color: "#E5745E" }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  const iReported = live.reported_by === myTeam.id;
  const myScore = live.team_a === myTeam.id ? live.score_a : live.score_b;
  const theirScore = live.team_a === myTeam.id ? live.score_b : live.score_a;

  // ---- a result is in, waiting on the other side ----
  if (live.status === "pending") {
    if (iReported) {
      return (
        <div className="panel px-5 py-6 text-center">
          <p className="eyebrow">Waiting on {opponent?.name}</p>
          <p className="mono tnum mt-3 text-5xl font-bold">
            {myScore} – {theirScore}
          </p>
          <p className="mt-3 text-sm" style={{ color: "rgba(244,241,234,0.6)" }}>
            They just need to confirm it on their phone. Ask them to check.
          </p>
        </div>
      );
    }
    return (
      <div
        className="panel px-5 py-6 text-center"
        style={{ borderColor: "rgba(232,176,75,0.5)", background: tint("#E8B04B", 0.08) }}
      >
        <p className="eyebrow" style={{ color: "#E8B04B" }}>
          {opponent?.name} reported the result
        </p>
        <p className="mono tnum mt-3 text-5xl font-bold">
          {theirScore} – {myScore}
        </p>
        <p className="mt-1 text-sm" style={{ color: "rgba(244,241,234,0.6)" }}>
          {opponent?.name} {theirScore}, {myTeam.name} {myScore}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            className="btn btn-rim"
            disabled={busy}
            onClick={() => post({ action: "confirm", matchId: live.id })}
          >
            That&apos;s right — confirm
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={() => post({ action: "dispute", matchId: live.id })}
          >
            That&apos;s not right
          </button>
        </div>
        {error && (
          <p className="mono mt-3 text-xs" style={{ color: "#E5745E" }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  // ---- game in progress ----
  return (
    <div className="panel px-5 py-6">
      <div className="text-center">
        <p className="eyebrow" style={{ color: "#E5745E" }}>
          Playing now · first to {state.game.point_target}
        </p>
        <p className="mt-3 text-xl font-light">
          <span style={{ color: colorOf(myTeam.color) }}>{myTeam.name}</span>
          <span className="mono mx-2 text-sm" style={{ color: "rgba(244,241,234,0.35)" }}>
            VS
          </span>
          <span style={{ color: opponent ? colorOf(opponent.color) : undefined }}>
            {opponent?.name}
          </span>
        </p>
      </div>

      {reporting ? (
        <ScoreEntry
          target={live.target}
          myTeam={myTeam}
          opponent={opponent ?? null}
          busy={busy}
          onCancel={() => setReporting(false)}
          onSubmit={(us, them) => post({ action: "report", matchId: live.id, us, them })}
        />
      ) : (
        <>
          <p className="mt-4 text-center text-sm leading-relaxed" style={{ color: "rgba(244,241,234,0.6)" }}>
            Nobody is tracking this basket by basket — just play, then put the
            final score in when you&apos;re done.
          </p>
          <button className="btn btn-rim mt-5 w-full" onClick={() => setReporting(true)}>
            Enter the final score
          </button>
        </>
      )}
      {error && (
        <p className="mono mt-3 text-center text-xs" style={{ color: "#E5745E" }}>
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Score entry. Games run to 5 or 7, so every possible score fits on screen as
 * a row of buttons — quicker and less error-prone than a keypad for someone
 * who has just come off the court.
 */
function ScoreEntry({
  target,
  myTeam,
  opponent,
  busy,
  onCancel,
  onSubmit,
}: {
  target: number;
  myTeam: Team;
  opponent: Team | null;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (us: number, them: number) => void;
}) {
  const [us, setUs] = useState<number | null>(null);
  const [them, setThem] = useState<number | null>(null);

  const row = (
    label: string,
    hex: string,
    value: number | null,
    set: (n: number) => void
  ) => (
    <div className="mt-4">
      <p className="eyebrow mb-2" style={{ color: hex }}>
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: target + 1 }, (_, n) => (
          <button
            key={n}
            onClick={() => set(n)}
            className="mono tnum flex-1 rounded-lg py-2.5 text-sm transition-colors"
            style={
              value === n
                ? { background: hex, color: "#0d1b45", fontWeight: 700 }
                : {
                    background: "rgba(244,241,234,0.06)",
                    color: "rgba(244,241,234,0.7)",
                    border: "1px solid rgba(244,241,234,0.14)",
                  }
            }
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );

  const complete = us !== null && them !== null;
  const noWinner = complete && us < target && them < target;

  return (
    <div>
      {row(myTeam.name, colorOf(myTeam.color), us, setUs)}
      {row(opponent?.name ?? "Them", opponent ? colorOf(opponent.color) : "#F4F1EA", them, setThem)}

      {noWinner && (
        <p className="mono mt-3 text-center text-[0.65rem]" style={{ color: "#E8B04B" }}>
          ONE SIDE HAS TO REACH {target}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-2">
        <button
          className="btn btn-rim"
          disabled={busy || !complete || noWinner}
          onClick={() => onSubmit(us!, them!)}
        >
          {busy ? "Sending…" : "Submit for confirmation"}
        </button>
        <button className="btn" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
      <p className="mt-3 text-center text-xs" style={{ color: "rgba(244,241,234,0.5)" }}>
        {opponent?.name ?? "The other team"} confirms it before it counts.
      </p>
    </div>
  );
}
