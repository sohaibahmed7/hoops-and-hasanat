"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { HoopMark, Wordmark } from "@/components/Brand";
import { Feed } from "@/components/Feed";
import { Leaderboard } from "@/components/Leaderboard";
import { standings, useGameState } from "@/lib/useGameState";
import { dhikrById } from "@/lib/dhikr";
import { clock, colorOf, courtState, msRemaining, tint, type GameState, type Match } from "@/lib/types";

export default function HostConsole() {
  const { code } = useParams<{ code: string }>();
  const { state, loading, refresh } = useGameState(code);

  const [hostToken, setHostToken] = useState<string | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [newTeam, setNewTeam] = useState("");
  const [note, setNote] = useState("");

  const joinUrl = useMemo(
    () => (typeof window === "undefined" ? "" : `${window.location.origin}/j/${code}`),
    [code]
  );

  useEffect(() => {
    setHostToken(localStorage.getItem(`host:${code}`));
  }, [code]);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (joinUrl) {
      QRCode.toDataURL(joinUrl, {
        margin: 1,
        width: 512,
        color: { dark: "#0d1b45", light: "#f4f1ea" },
      }).then(setQr);
    }
  }, [joinUrl]);

  // Verify the stored token actually controls this game.
  useEffect(() => {
    if (!hostToken) {
      setAuthed(false);
      return;
    }
    fetch("/api/admin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, hostToken, action: "verify" }),
    })
      .then((r) => setAuthed(r.ok))
      .catch(() => setAuthed(false));
  }, [code, hostToken]);

  const post = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(path, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code, hostToken, ...body }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) setError(json.error ?? "That didn't work.");
        else await refresh();
        return res.ok;
      } catch {
        setError("Network trouble.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [code, hostToken, refresh]
  );

  const live = state?.matches.find((m) => m.status === "live" || m.status === "pending") ?? null;

  // Keep the tip-off pickers pointed at two real, idle teams.
  useEffect(() => {
    if (!state || live) return;
    const ids = state.teams.map((t) => t.id);
    if (!ids.includes(teamA)) setTeamA(ids[0] ?? "");
    if (!ids.includes(teamB) || teamB === teamA) setTeamB(ids.find((i) => i !== (teamA || ids[0])) ?? "");
  }, [state, live, teamA, teamB]);

  if (loading || !state) return <p className="eyebrow p-8">Loading…</p>;

  if (authed === false) {
    return (
      <main className="mx-auto max-w-md px-6 py-16">
        <h1 className="text-2xl font-light">Host access</h1>
        <p className="mt-3 text-sm" style={{ color: "rgba(244,241,234,0.6)" }}>
          This browser doesn&apos;t hold the host key for <span className="mono">{code}</span>. Paste
          it in if you&apos;re moving to another device — you can copy it from the
          console you created the game on.
        </p>
        <input
          className="field mono mt-6 text-sm"
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value.trim())}
          placeholder="host key"
        />
        <button
          className="btn btn-rim mt-3 w-full"
          onClick={() => {
            localStorage.setItem(`host:${code}`, tokenInput);
            setHostToken(tokenInput);
            setAuthed(null);
          }}
          disabled={!tokenInput}
        >
          Unlock console
        </button>
        <Link href={`/g/${code}/board`} className="mono mt-6 block text-xs uppercase tracking-[0.14em]" style={{ color: "rgba(244,241,234,0.5)" }}>
          Just show me the board →
        </Link>
      </main>
    );
  }

  const ranked = standings(state);

  return (
    <main className="mx-auto max-w-2xl px-5 pb-16 pt-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HoopMark size={22} />
          <Wordmark className="text-sm" />
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/g/${code}/board`} className="eyebrow" target="_blank">
            board ↗
          </Link>
          <span
            className="mono rounded px-2 py-1 text-[0.65rem] uppercase tracking-[0.14em]"
            style={{ background: tint("#D2503A", 0.2), color: "#E5745E" }}
          >
            host
          </span>
        </div>
      </header>

      {/* ---- share ---- */}
      <section className="panel mt-6 p-5">
        <p className="eyebrow">Room code</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-4">
          <span className="mono text-5xl font-bold tracking-[0.14em]">{code}</span>
          {qr && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={qr} alt={`QR code to join game ${code}`} className="h-24 w-24 rounded-lg" />
          )}
          <div className="min-w-[12rem] flex-1">
            <p className="mono break-all text-xs" style={{ color: "rgba(244,241,234,0.6)" }}>
              {joinUrl}
            </p>
            <div className="mt-2 flex gap-2">
              <button className="btn px-3 py-2" onClick={() => navigator.clipboard?.writeText(joinUrl)}>
                Copy link
              </button>
              {typeof navigator !== "undefined" && "share" in navigator && (
                <button
                  className="btn px-3 py-2"
                  onClick={() => navigator.share({ title: state.game.name, url: joinUrl })}
                >
                  Share
                </button>
              )}
            </div>
          </div>
        </div>
        <p className="mono mt-4 text-[0.62rem]" style={{ color: "rgba(244,241,234,0.35)" }}>
          {state.players.length} joined · {state.teams.length} teams · status {state.game.status}
        </p>
      </section>

      {error && (
        <p className="mono mt-4 text-xs" style={{ color: "#E5745E" }}>
          {error}
        </p>
      )}

      {/* ---- the evening: azkar rotation ---- */}
      <section className="panel mt-5 p-5">
        <div className="flex items-baseline justify-between">
          <p className="eyebrow">The evening</p>
          <p className="mono text-[0.62rem]" style={{ color: "rgba(244,241,234,0.4)" }}>
            new azkar every {state.game.rotation_min} min
          </p>
        </div>

        {state.game.status === "lobby" ? (
          <div className="mt-3">
            <button
              className="btn btn-rim w-full"
              disabled={busy || state.players.length === 0}
              onClick={() => post("/api/admin", { action: "status", status: "live" })}
            >
              Start the evening
            </button>
            <p className="mt-2 text-xs leading-relaxed" style={{ color: "rgba(244,241,234,0.5)" }}>
              This puts the first azkar on everyone&apos;s phone and starts the
              rotation. Counting only scores once the evening is running.
            </p>
          </div>
        ) : state.round ? (
          <div className="mt-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">
                Azkar {state.round.idx + 1} · {dhikrById(state.round.dhikr_id).translit}
              </span>
              <span
                className="mono tnum text-xs"
                style={{
                  color:
                    msRemaining(state.round, nowMs) < 60_000
                      ? "#E8B04B"
                      : "rgba(244,241,234,0.55)",
                }}
              >
                {clock(msRemaining(state.round, nowMs))}
              </span>
            </div>
            <p className="arabic mt-1 text-xl" style={{ direction: "rtl" }}>
              {dhikrById(state.round.dhikr_id).arabic}
            </p>
            <div
              className="mt-2 h-1 w-full overflow-hidden rounded-full"
              style={{ background: "rgba(244,241,234,0.12)" }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${
                    100 -
                    Math.min(
                      100,
                      (msRemaining(state.round, nowMs) / (state.game.rotation_min * 60_000)) * 100
                    )
                  }%`,
                  background: "#E8B04B",
                  transition: "width 1s linear",
                }}
              />
            </div>
          </div>
        ) : (
          <p className="mono mt-3 text-xs" style={{ color: "rgba(244,241,234,0.4)" }}>
            {state.game.status === "ended" ? "Finished." : "Starting…"}
          </p>
        )}

        <div className="mt-5 border-t pt-4 hairline" style={{ borderTopWidth: 1 }}>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div>
              <span className="eyebrow mb-1.5 block">Games to</span>
              <div className="flex gap-1.5">
                {[5, 7].map((n) => (
                  <button
                    key={n}
                    className="btn px-3 py-1.5"
                    disabled={busy}
                    style={
                      state.game.point_target === n
                        ? { background: "rgba(244,241,234,0.16)", borderColor: "rgba(244,241,234,0.4)" }
                        : undefined
                    }
                    onClick={() => post("/api/admin", { action: "settings", pointTarget: n })}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="eyebrow mb-1.5 block">Azkar every</span>
              <div className="flex gap-1.5">
                {[10, 20].map((n) => (
                  <button
                    key={n}
                    className="btn px-3 py-1.5"
                    disabled={busy}
                    style={
                      state.game.rotation_min === n
                        ? { background: "rgba(244,241,234,0.16)", borderColor: "rgba(244,241,234,0.4)" }
                        : undefined
                    }
                    onClick={() => post("/api/admin", { action: "settings", rotationMin: n })}
                  >
                    {n}m
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---- court control ---- */}
      <section className="panel mt-5 p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <p className="eyebrow">Court</p>
          <p className="mono text-[0.62rem]" style={{ color: "rgba(244,241,234,0.4)" }}>
            first to {state.game.point_target}
          </p>
        </div>
        <p className="mb-3 text-xs leading-relaxed" style={{ color: "rgba(244,241,234,0.5)" }}>
          The teams on court run this themselves — they start their own game and
          report the score. Everything below is a fallback for when that goes
          wrong, so you can play without watching this screen.
        </p>

        {live && live.status === "pending" ? (
          <PendingResult
            live={live}
            state={state}
            busy={busy}
            onConfirm={(a, b) =>
              post("/api/match", { action: "final", matchId: live.id, scoreA: a, scoreB: b })
            }
            onReopen={() => post("/api/match", { action: "cancel", matchId: live.id })}
          />
        ) : live ? (
          <LiveMatchControls
            live={live}
            state={state}
            busy={busy}
            target={state.game.point_target}
            onScore={(a, b) => post("/api/match", { action: "score", matchId: live.id, scoreA: a, scoreB: b })}
            onFinal={(a, b) => post("/api/match", { action: "final", matchId: live.id, scoreA: a, scoreB: b })}
            onCancel={() => post("/api/match", { action: "cancel", matchId: live.id })}
          />
        ) : (
          <NextUp
            state={state}
            busy={busy}
            teamA={teamA}
            teamB={teamB}
            setTeamA={setTeamA}
            setTeamB={setTeamB}
            onTip={(a, b) =>
              post("/api/match", a && b ? { action: "start", teamA: a, teamB: b } : { action: "start" })
            }
          />
        )}
      </section>

      {/* ---- the queue ---- */}
      <section className="panel mt-5 p-5">
        <p className="eyebrow mb-3">Rotation</p>
        <p className="mb-3 text-xs leading-relaxed" style={{ color: "rgba(244,241,234,0.55)" }}>
          Winner holds the floor. Two wins in a row and both teams come off.
        </p>
        <Queue state={state} />
      </section>

      {/* ---- standings ---- */}
      <section className="mt-5">
        <p className="eyebrow mb-3">Standings</p>
        <Leaderboard state={state} ranked={ranked} />
      </section>

      {/* ---- roster ---- */}
      <section className="panel mt-5 p-5">
        <p className="eyebrow mb-3">Rosters</p>
        <div className="space-y-4">
          {state.teams.map((t) => {
            const hex = colorOf(t.color);
            const members = state.players.filter((p) => p.team_id === t.id);
            return (
              <div key={t.id}>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: hex }} />
                  <span className="text-sm font-medium">{t.name}</span>
                  <span className="mono text-[0.62rem]" style={{ color: "rgba(244,241,234,0.4)" }}>
                    {members.length}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {members.length === 0 && (
                    <span className="mono text-[0.65rem]" style={{ color: "rgba(244,241,234,0.3)" }}>
                      empty
                    </span>
                  )}
                  {members.map((p) => (
                    <span
                      key={p.id}
                      className="rounded-full px-2.5 py-1 text-xs"
                      style={{ background: tint(hex, 0.12), color: "rgba(244,241,234,0.85)" }}
                      title={`${Number(p.dhikr_count).toLocaleString()} dhikr`}
                    >
                      {p.name}
                      <span className="mono ml-1.5 text-[0.6rem]" style={{ color: "rgba(244,241,234,0.5)" }}>
                        {Number(p.dhikr_count).toLocaleString()}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {state.teams.length < 8 && (
          <div className="mt-5 flex gap-2">
            <input
              className="field"
              value={newTeam}
              onChange={(e) => setNewTeam(e.target.value)}
              placeholder="Add a team"
            />
            <button
              className="btn shrink-0"
              disabled={busy || !newTeam.trim()}
              onClick={async () => {
                if (await post("/api/team", { action: "add", name: newTeam })) setNewTeam("");
              }}
            >
              Add
            </button>
          </div>
        )}
      </section>

      {/* ---- announcements + end ---- */}
      <section className="panel mt-5 p-5">
        <p className="eyebrow mb-3">Announce</p>
        <div className="flex gap-2">
          <input
            className="field"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 140))}
            placeholder="Maghrib in 10 — wrap it up"
          />
          <button
            className="btn shrink-0"
            disabled={busy || !note.trim()}
            onClick={async () => {
              if (await post("/api/admin", { action: "note", text: note })) setNote("");
            }}
          >
            Post
          </button>
        </div>

        <div className="mt-5 border-t pt-4 hairline" style={{ borderTopWidth: 1 }}>
          <p className="eyebrow mb-3">Feed</p>
          <Feed items={state.feed} limit={8} />
        </div>
      </section>

      <section className="mt-5 flex flex-wrap gap-2">
        {state.game.status !== "ended" ? (
          <button
            className="btn"
            disabled={busy}
            onClick={() => {
              if (confirm("End the game? Scores freeze and nobody can add dhikr after this.")) {
                post("/api/admin", { action: "status", status: "ended" });
              }
            }}
          >
            End game
          </button>
        ) : (
          <button className="btn" disabled={busy} onClick={() => post("/api/admin", { action: "status", status: "live" })}>
            Reopen game
          </button>
        )}
        <button
          className="btn"
          onClick={() => navigator.clipboard?.writeText(hostToken ?? "")}
          title="Paste this on another device to run the console from there"
        >
          Copy host key
        </button>
      </section>
    </main>
  );
}

/** Score entry while a match runs. Local until the host commits it. */
function LiveMatchControls({
  live,
  state,
  busy,
  target,
  onScore,
  onFinal,
  onCancel,
}: {
  live: Match;
  state: GameState;
  busy: boolean;
  target: number;
  onScore: (a: number, b: number) => void;
  onFinal: (a: number, b: number) => void;
  onCancel: () => void;
}) {
  const [a, setA] = useState(live.score_a);
  const [b, setB] = useState(live.score_b);

  // The live pair also lives in a ref, mutated synchronously: React state
  // doesn't update until the next render, so two quick taps ("+1" then "+1"
  // for two free throws) would both read the pre-tap score and the second
  // would undo the first.
  const scores = useRef({ a: live.score_a, b: live.score_b });
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  // Push to the server once the host stops tapping, rather than once per tap.
  // Firing a request per tap put four near-simultaneous writes in flight and
  // whichever committed last won — so a fast +1 +1 +3 could land as +1. The
  // live score is only a display; the authoritative numbers are the ones sent
  // with "final".
  const scheduleFlush = useCallback(() => {
    dirty.current = true;
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;
      dirty.current = false;
      onScore(scores.current.a, scores.current.b);
    }, 400);
  }, [onScore]);

  useEffect(() => () => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
  }, []);

  // Adopt server values when another device edits the same match — but never
  // while this host is mid-tap, or the poll would yank the score backwards.
  useEffect(() => {
    if (dirty.current) return;
    scores.current = { a: live.score_a, b: live.score_b };
    setA(live.score_a);
    setB(live.score_b);
  }, [live.id, live.score_a, live.score_b]);

  const ta = state.teams.find((t) => t.id === live.team_a);
  const tb = state.teams.find((t) => t.id === live.team_b);
  if (!ta || !tb) return null;

  const bump = (side: "a" | "b", by: number) => {
    const next = { ...scores.current };
    // Clamp at the target: a game to 7 can never read 8.
    next[side] = Math.min(target, Math.max(0, next[side] + by));
    scores.current = next;
    setA(next.a);
    setB(next.b);
    scheduleFlush();
  };

  /**
   * Each team is a self-contained block: name and score on one line, the
   * scoring pad in a four-up grid beneath. Two of these fit side by side on a
   * tablet and stack on a phone — the host is usually holding a phone at the
   * side of the court, and at 375px a single row of eight buttons ran off the
   * screen entirely.
   */
  const reached = a >= target || b >= target;
  const gamePoint = !reached && (a === target - 1 || b === target - 1);

  /**
   * Each team is a self-contained block: name and score on one line, the
   * scoring pad in a four-up grid beneath. Two of these fit side by side on a
   * tablet and stack on a phone — the host is usually holding a phone at the
   * side of the court, and at 375px a single row of eight buttons ran off the
   * screen entirely.
   */
  const col = (team: typeof ta, score: number, side: "a" | "b") => {
    const won = score >= target;
    return (
      <div
        className="panel-quiet flex-1 px-3 py-3"
        style={won ? { borderColor: tint(colorOf(team.color), 0.55) } : undefined}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium" style={{ color: colorOf(team.color) }}>
            {team.name}
          </span>
          <span className="mono tnum shrink-0 text-4xl font-bold leading-none">{score}</span>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              className="btn px-0 py-2"
              disabled={busy || won}
              onClick={() => bump(side, n)}
            >
              +{n}
            </button>
          ))}
          <button
            className="btn px-0 py-2"
            disabled={busy || score === 0}
            onClick={() => bump(side, -1)}
          >
            −
          </button>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-center gap-2">
        <span
          className="live-dot inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: reached ? "#E8B04B" : "#D2503A" }}
        />
        <span className="eyebrow" style={{ color: reached ? "#E8B04B" : "#E5745E" }}>
          {reached ? `game — first to ${target}` : gamePoint ? "game point" : `on court · to ${target}`}
        </span>
      </div>

      <div className="space-y-2 sm:flex sm:items-start sm:gap-2 sm:space-y-0">
        {col(ta, a, "a")}
        <span
          className="mono hidden shrink-0 self-center text-xs sm:block"
          style={{ color: "rgba(244,241,234,0.3)" }}
        >
          VS
        </span>
        {col(tb, b, "b")}
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          className="btn btn-rim flex-1"
          disabled={busy}
          onClick={() => {
            if (flushTimer.current) clearTimeout(flushTimer.current);
            dirty.current = false;
            onFinal(scores.current.a, scores.current.b);
          }}
        >
          {reached ? "Final — apply rating" : "End early — apply rating"}
        </button>
        <button
          className="btn"
          disabled={busy}
          onClick={() => {
            if (confirm("Scrub this match? Nothing will be recorded.")) onCancel();
          }}
        >
          Scrub
        </button>
      </div>
    </div>
  );
}

/**
 * The floor between games. The rotation has already decided who is on, so the
 * default action is a single button — the host shouldn't have to remember the
 * rule at the side of a noisy court. The manual picker stays available for when
 * reality intervenes (someone's gone to pray, a team is short).
 */
function NextUp({
  state,
  busy,
  teamA,
  teamB,
  setTeamA,
  setTeamB,
  onTip,
}: {
  state: GameState;
  busy: boolean;
  teamA: string;
  teamB: string;
  setTeamA: (v: string) => void;
  setTeamB: (v: string) => void;
  onTip: (a?: string, b?: string) => void;
}) {
  const [manual, setManual] = useState(false);
  const { onCourt, warning } = courtState(state);

  if (onCourt.length < 2) {
    return (
      <p className="mono text-xs" style={{ color: "rgba(244,241,234,0.45)" }}>
        Add at least two teams to start playing.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {manual ? (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <select className="field" value={teamA} onChange={(e) => setTeamA(e.target.value)}>
            {state.teams.map((t) => (
              <option key={t.id} value={t.id} className="bg-cobalt-900">
                {t.name}
              </option>
            ))}
          </select>
          <span className="mono text-xs" style={{ color: "rgba(244,241,234,0.35)" }}>
            VS
          </span>
          <select className="field" value={teamB} onChange={(e) => setTeamB(e.target.value)}>
            {state.teams.map((t) => (
              <option key={t.id} value={t.id} className="bg-cobalt-900">
                {t.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="panel-quiet px-4 py-4 text-center">
          <p className="eyebrow mb-2">Up next</p>
          <div className="flex items-center justify-center gap-3">
            {onCourt.map((t, i) => (
              <span key={t.id} className="flex items-center gap-3">
                {i > 0 && (
                  <span className="mono text-xs" style={{ color: "rgba(244,241,234,0.3)" }}>
                    VS
                  </span>
                )}
                <span className="text-lg font-medium" style={{ color: colorOf(t.color) }}>
                  {t.name}
                </span>
              </span>
            ))}
          </div>
          {warning && (
            <p className="mono mt-2 text-[0.62rem]" style={{ color: "#E8B04B" }}>
              {warning.name.toUpperCase()} HAVE WON ONE — WIN AGAIN AND BOTH TEAMS COME OFF
            </p>
          )}
        </div>
      )}

      <button
        className="btn btn-rim w-full"
        disabled={busy || (manual && (!teamA || !teamB || teamA === teamB))}
        onClick={() => (manual ? onTip(teamA, teamB) : onTip())}
      >
        Tip off
      </button>

      <button
        className="mono w-full text-center text-[0.62rem] uppercase tracking-[0.14em]"
        style={{ color: "rgba(244,241,234,0.45)" }}
        onClick={() => setManual((m) => !m)}
      >
        {manual ? "← use the rotation" : "change the matchup"}
      </button>

      <p className="text-xs leading-relaxed" style={{ color: "rgba(244,241,234,0.5)" }}>
        Games run to {state.game.point_target}. Everyone off the court keeps
        reciting. Rating moves when you call the game final.
      </p>
    </div>
  );
}

/** The waiting line, in order. This is what players are checking their phones for. */
function Queue({ state }: { state: GameState }) {
  const { onCourt, queue } = courtState(state);

  const row = (t: (typeof queue)[number], label: string, dim: boolean) => (
    <div key={t.id} className="flex items-center gap-2.5">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorOf(t.color) }} />
      <span className={`flex-1 truncate text-sm ${dim ? "" : "font-medium"}`} style={dim ? { color: "rgba(244,241,234,0.7)" } : undefined}>
        {t.name}
      </span>
      {t.streak >= 1 && (
        <span className="mono text-[0.6rem]" style={{ color: "#E8B04B" }}>
          {t.streak} IN A ROW
        </span>
      )}
      <span className="mono text-[0.6rem]" style={{ color: "rgba(244,241,234,0.4)" }}>
        {label}
      </span>
    </div>
  );

  return (
    <div className="space-y-2">
      {onCourt.map((t) => row(t, "ON COURT", false))}
      {queue.map((t, i) => row(t, i === 0 ? "NEXT ON" : `${i + 1} AWAY`, true))}
      {queue.length === 0 && (
        <p className="mono text-xs" style={{ color: "rgba(244,241,234,0.35)" }}>
          No teams waiting.
        </p>
      )}
    </div>
  );
}

/**
 * A result the players reported but nobody has confirmed. Normally the losing
 * side confirms on their own phone; this is here for when they've left, their
 * battery died, or the two sides can't agree.
 */
function PendingResult({
  live,
  state,
  busy,
  onConfirm,
  onReopen,
}: {
  live: Match;
  state: GameState;
  busy: boolean;
  onConfirm: (a: number, b: number) => void;
  onReopen: () => void;
}) {
  const ta = state.teams.find((t) => t.id === live.team_a);
  const tb = state.teams.find((t) => t.id === live.team_b);
  const reporter = state.teams.find((t) => t.id === live.reported_by);
  const waitingOn = live.reported_by === live.team_a ? tb : ta;
  if (!ta || !tb) return null;

  return (
    <div>
      <div className="mb-3 flex items-center justify-center gap-2">
        <span className="live-dot inline-block h-1.5 w-1.5 rounded-full" style={{ background: "#E8B04B" }} />
        <span className="eyebrow" style={{ color: "#E8B04B" }}>
          waiting on {waitingOn?.name}
        </span>
      </div>

      <div className="panel-quiet px-4 py-4 text-center">
        <p className="mono tnum text-4xl font-bold">
          {live.score_a} – {live.score_b}
        </p>
        <p className="mt-2 text-sm" style={{ color: "rgba(244,241,234,0.7)" }}>
          <span style={{ color: colorOf(ta.color) }}>{ta.name}</span>
          {" · "}
          <span style={{ color: colorOf(tb.color) }}>{tb.name}</span>
        </p>
        <p className="mono mt-2 text-[0.62rem]" style={{ color: "rgba(244,241,234,0.45)" }}>
          REPORTED BY {(reporter?.name ?? "?").toUpperCase()}
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          className="btn btn-rim flex-1"
          disabled={busy}
          onClick={() => onConfirm(live.score_a, live.score_b)}
        >
          Confirm it myself
        </button>
        <button
          className="btn"
          disabled={busy}
          onClick={() => {
            if (confirm("Scrub this game? Nothing will be recorded and the same two teams stay on.")) {
              onReopen();
            }
          }}
        >
          Scrub
        </button>
      </div>
      <p className="mt-3 text-xs leading-relaxed" style={{ color: "rgba(244,241,234,0.5)" }}>
        {waitingOn?.name} can confirm this on their own phone — that&apos;s the
        normal way. Only step in if they can&apos;t.
      </p>
    </div>
  );
}
