"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { HoopMark, Wordmark } from "@/components/Brand";
import { Feed } from "@/components/Feed";
import { Leaderboard } from "@/components/Leaderboard";
import { Scoreboard } from "@/components/Scoreboard";
import { CourtPanel } from "@/components/CourtPanel";
import { dhikrById } from "@/lib/dhikr";
import { standings, useGameState } from "@/lib/useGameState";
import { useDhikrTap } from "@/lib/useDhikrTap";
import { clock, colorOf, courtPosition, courtState, msRemaining, roundStanding, tint } from "@/lib/types";

type Puff = { id: number; x: number };

export default function PlayerPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { state, loading, refresh } = useGameState(code);

  const [playerToken, setPlayerToken] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [tab, setTab] = useState<"court" | "dhikr" | "table">("dhikr");
  const [puffs, setPuffs] = useState<Puff[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const puffSeq = useRef(0);

  useEffect(() => {
    const t = localStorage.getItem(`player:${code}`);
    if (!t) {
      router.replace(`/j/${code}`);
      return;
    }
    setPlayerToken(t);
    setPlayerId(localStorage.getItem(`playerId:${code}`));
  }, [code, router]);

  // Ticks the countdown. One second is plenty and keeps the phone cool.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const me = useMemo(() => state?.players.find((p) => p.id === playerId) ?? null, [state, playerId]);
  const myTeam = useMemo(() => state?.teams.find((t) => t.id === me?.team_id) ?? null, [state, me]);

  const { count, tap, throttled, fatal } = useDhikrTap(playerToken, Number(me?.dhikr_count ?? 0));

  const round = state?.round ?? null;
  const dhikr = dhikrById(round?.dhikr_id ?? "subhanallah");
  const left = msRemaining(round, now);

  // The moment the azkar changes, pull fresh state so the new one appears
  // without waiting for the next poll.
  const lastIdx = useRef<number | null>(null);
  useEffect(() => {
    if (round && lastIdx.current !== null && round.idx !== lastIdx.current) refresh();
    if (round) lastIdx.current = round.idx;
  }, [round, refresh]);
  useEffect(() => {
    if (round && left === 0) {
      const t = setTimeout(refresh, 1200);
      return () => clearTimeout(t);
    }
  }, [round, left, refresh]);

  const liveMatch =
    state?.matches.find((m) => m.status === "live" || m.status === "pending") ?? null;
  const started = state?.game.status === "live";
  const iAmOnCourt = !!myTeam?.on_court;

  // Phones live in pockets during a game, and there is no big screen to glance
  // at. Coming on court pulls the player straight to the court tab and buzzes
  // the handset, so "are we up?" never has to be asked across the hall.
  const wasOnCourt = useRef(false);
  useEffect(() => {
    if (iAmOnCourt && !wasOnCourt.current) {
      setTab("court");
      if (navigator.vibrate) navigator.vibrate([90, 60, 90]);
    }
    if (!iAmOnCourt && wasOnCourt.current) setTab("dhikr");
    wasOnCourt.current = iAmOnCourt;
  }, [iAmOnCourt]);

  // A result waiting on this team needs answering, not discovering later.
  const awaitingMe =
    !!liveMatch && liveMatch.status === "pending" && !!myTeam && liveMatch.reported_by !== myTeam.id
    && (liveMatch.team_a === myTeam.id || liveMatch.team_b === myTeam.id);
  const seenPending = useRef<string | null>(null);
  useEffect(() => {
    if (awaitingMe && liveMatch && seenPending.current !== liveMatch.id) {
      seenPending.current = liveMatch.id;
      setTab("court");
      if (navigator.vibrate) navigator.vibrate([50, 40, 50, 40, 50]);
    }
    if (!awaitingMe) seenPending.current = null;
  }, [awaitingMe, liveMatch]);

  const onTap = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!started) return;
    tap();
    if (navigator.vibrate) navigator.vibrate(8);
    const rect = e.currentTarget.getBoundingClientRect();
    const id = ++puffSeq.current;
    setPuffs((p) => [...p.slice(-6), { id, x: ((e.clientX - rect.left) / rect.width) * 100 }]);
    setTimeout(() => setPuffs((p) => p.filter((x) => x.id !== id)), 820);
  };

  if (loading || !state) return <p className="eyebrow p-8">Loading…</p>;

  const ranked = standings(state);
  const myRank = myTeam ? ranked.findIndex((t) => t.id === myTeam.id) + 1 : 0;
  const hex = myTeam ? colorOf(myTeam.color) : "#F4F1EA";
  const mine = myTeam ? roundStanding(myTeam, state) : null;
  const ended = state.game.status === "ended";
  const pos = courtPosition(myTeam?.id ?? null, state);
  const { onCourt, queue } = courtState(state);
  const showCourtTab = started && !!myTeam && myTeam.on_court;
  const tabs: Array<"court" | "dhikr" | "table"> = showCourtTab
    ? ["court", "dhikr", "table"]
    : ["dhikr", "table"];

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-8 pt-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HoopMark size={22} />
          <Wordmark className="text-sm" />
        </div>
        {myTeam && (
          <div className="flex items-center gap-2 text-right">
            <div>
              <div className="truncate text-sm font-medium" style={{ color: hex }}>
                {myTeam.name}
              </div>
              <div className="eyebrow" style={{ fontSize: "0.58rem" }}>
                #{myRank} · {Math.round(myTeam.rating)}
              </div>
            </div>
            <span className="h-7 w-1 rounded-full" style={{ background: hex }} />
          </div>
        )}
      </header>

      {/*
        With no projector in the hall, this card is the only thing telling a
        player when their team is up. It stays visible above the tabs.
      */}
      {started && myTeam && tab !== "court" && (
        <div className="mt-4">
          {pos.kind === "playing" || pos.kind === "on" ? (
            <div
              className="rounded-xl px-4 py-3 text-center"
              style={{ background: tint("#D2503A", 0.16), border: "1px solid rgba(210,80,58,0.4)" }}
            >
              <p className="eyebrow" style={{ color: "#E5745E" }}>
                {pos.label}
              </p>
              <p className="mt-1 text-sm" style={{ color: "rgba(244,241,234,0.85)" }}>
                {pos.detail}
              </p>
            </div>
          ) : (
            <div className="panel px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className="eyebrow"
                  style={{ color: pos.kind === "next" ? "#E8B04B" : undefined }}
                >
                  {pos.label}
                </span>
                {liveMatch && (
                  <span className="mono tnum text-[0.68rem]" style={{ color: "rgba(244,241,234,0.55)" }}>
                    {onCourt.map((t) => t.name).join(" v ")} · {liveMatch.score_a}–{liveMatch.score_b}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs" style={{ color: "rgba(244,241,234,0.6)" }}>
                {pos.detail}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Non-players (and the lobby) still get the live score. */}
      {started && !myTeam && liveMatch && (
        <div className="mt-4">
          <Scoreboard match={liveMatch} state={state} />
        </div>
      )}

      <div
        className={`mt-5 grid gap-1 rounded-xl p-1 ${showCourtTab ? "grid-cols-3" : "grid-cols-2"}`}
        style={{ background: "rgba(9,20,54,0.5)" }}
      >
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="mono relative rounded-lg py-2 text-[0.68rem] uppercase tracking-[0.14em] transition-colors"
            style={
              tab === t
                ? { background: "rgba(244,241,234,0.12)", color: "#FAF8F4" }
                : { color: "rgba(244,241,234,0.45)" }
            }
          >
            {t === "court" ? "Court" : t === "dhikr" ? "Azkar" : "Standings"}
            {t === "court" && awaitingMe && (
              <span
                className="live-dot absolute right-2 top-2 h-1.5 w-1.5 rounded-full"
                style={{ background: "#E8B04B" }}
              />
            )}
          </button>
        ))}
      </div>

      {tab === "court" && showCourtTab && myTeam && playerToken ? (
        <section className="flex-1 pt-5">
          <CourtPanel
            state={state}
            myTeam={myTeam}
            playerToken={playerToken}
            onDone={refresh}
          />
          <p className="mt-4 text-center text-xs leading-relaxed" style={{ color: "rgba(244,241,234,0.45)" }}>
            Your dhikr still counts while you play — the counter is on the Azkar
            tab whenever you want it.
          </p>
        </section>
      ) : tab === "dhikr" ? (
        <section className="flex flex-1 flex-col items-center pt-6">
          {!started ? (
            <div className="panel mt-10 w-full px-5 py-8 text-center">
              <p className="eyebrow">{ended ? "The evening is over" : "Not started yet"}</p>
              <p className="mt-2 text-sm" style={{ color: "rgba(244,241,234,0.65)" }}>
                {ended
                  ? "Jazakum Allahu khayran. Final standings are on the other tab."
                  : "The first azkar begins when the host starts the evening."}
              </p>
            </div>
          ) : (
            <>
              {/* which azkar, and how long it stands */}
              <div className="flex w-full items-center justify-between">
                <span className="eyebrow">Azkar {(round?.idx ?? 0) + 1}</span>
                <span
                  className="mono tnum text-[0.7rem]"
                  style={{ color: left < 60_000 ? "#E8B04B" : "rgba(244,241,234,0.5)" }}
                >
                  changes in {clock(left)}
                </span>
              </div>
              <div
                className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full"
                style={{ background: "rgba(244,241,234,0.12)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${100 - Math.min(100, (left / (state.game.rotation_min * 60_000)) * 100)}%`,
                    background: tint(hex, 0.8),
                    transition: "width 1s linear",
                  }}
                />
              </div>

              <p className="arabic mt-6 text-center text-3xl leading-relaxed">{dhikr.arabic}</p>
              <p className="mono mt-1 text-center text-xs uppercase tracking-[0.12em]" style={{ color: tint(hex, 0.9) }}>
                {dhikr.translit}
              </p>
              <p className="mt-1 text-center text-xs" style={{ color: "rgba(244,241,234,0.5)" }}>
                {dhikr.meaning}
              </p>

              <button
                className="tap-target mt-6"
                onPointerDown={onTap}
                disabled={!!fatal}
                aria-label={`Count ${dhikr.translit}`}
              >
                {puffs.map((p) => (
                  <span key={p.id} className="float-plus text-lg" style={{ left: `${p.x}%`, color: hex }}>
                    +1
                  </span>
                ))}
                {puffs.length > 0 && <span key={puffs[puffs.length - 1].id} className="ripple" />}

                <span className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="mono tnum text-6xl font-bold">{count.toLocaleString()}</span>
                  <span className="eyebrow mt-1">your total</span>
                </span>
              </button>

              <p className="eyebrow mt-4 h-4">
                {fatal ? (
                  <span style={{ color: "#E5745E" }}>{fatal}</span>
                ) : throttled ? (
                  <span style={{ color: "#E8B04B" }}>slow down — count with meaning</span>
                ) : (
                  "as many as you like"
                )}
              </p>

              {myTeam && mine && (
                <div className="panel mt-6 w-full px-4 py-3.5">
                  <div className="flex items-baseline justify-between">
                    <span className="eyebrow">{myTeam.name} this azkar</span>
                    <span className="mono tnum text-xs" style={{ color: "rgba(244,241,234,0.6)" }}>
                      {mine.count.toLocaleString()} from {mine.size}
                    </span>
                  </div>
                  <div
                    className="relative mt-2 h-2 w-full overflow-hidden rounded-full"
                    style={{ background: "rgba(244,241,234,0.1)" }}
                  >
                    <div
                      className="h-full rounded-full transition-[width] duration-700"
                      style={{ width: `${Math.min(100, mine.share * 100)}%`, background: hex }}
                    />
                    <div
                      className="absolute inset-y-0 w-px"
                      style={{ left: `${mine.even * 100}%`, background: "rgba(244,241,234,0.6)" }}
                    />
                  </div>
                  <p className="mt-2 text-xs leading-relaxed" style={{ color: "rgba(244,241,234,0.55)" }}>
                    {!mine.active
                      ? "Nobody has started this one yet."
                      : mine.count === 0
                        ? "The hall has started without you."
                        : mine.rank === 1
                          ? "Leading the hall this azkar."
                          : `${mine.rank} of ${mine.of} this azkar — the line is an even share.`}
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      ) : (
        <section className="flex-1 pt-5">
          <Leaderboard state={state} ranked={ranked} highlightTeamId={myTeam?.id ?? null} />

          <div className="panel mt-5 px-4 py-4">
            <p className="eyebrow mb-1">Rotation</p>
            <p className="mb-3 text-xs" style={{ color: "rgba(244,241,234,0.5)" }}>
              Winner stays on. Two in a row and both come off.
            </p>
            <div className="space-y-2">
              {[...onCourt, ...queue].map((t, i) => {
                const waiting = i >= onCourt.length;
                const at = i - onCourt.length;
                return (
                  <div key={t.id} className="flex items-center gap-2.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: colorOf(t.color) }}
                    />
                    <span
                      className="flex-1 truncate text-sm"
                      style={{
                        color: t.id === myTeam?.id ? "#FAF8F4" : "rgba(244,241,234,0.72)",
                        fontWeight: t.id === myTeam?.id ? 500 : 400,
                      }}
                    >
                      {t.name}
                    </span>
                    {t.streak >= 1 && (
                      <span className="mono text-[0.6rem]" style={{ color: "#E8B04B" }}>
                        {t.streak} IN A ROW
                      </span>
                    )}
                    <span className="mono text-[0.6rem]" style={{ color: "rgba(244,241,234,0.4)" }}>
                      {!waiting ? "ON COURT" : at === 0 ? "NEXT ON" : `${at + 1} AWAY`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="panel mt-5 px-4 py-4">
            <p className="eyebrow mb-3">Live feed</p>
            <Feed items={state.feed} limit={10} />
          </div>
        </section>
      )}
    </main>
  );
}
