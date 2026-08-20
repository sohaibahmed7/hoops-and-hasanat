"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { HoopMark, Wordmark } from "@/components/Brand";
import { Feed } from "@/components/Feed";
import { Leaderboard } from "@/components/Leaderboard";
import { Scoreboard } from "@/components/Scoreboard";
import { standings, useGameState } from "@/lib/useGameState";
import { dhikrById } from "@/lib/dhikr";
import { clock, msRemaining } from "@/lib/types";

/**
 * Optional big-screen view for a spare laptop or TV. The event is designed to
 * run without one — nothing here is required, and no other screen links to it
 * except the host's own console.
 */
export default function BoardPage() {
  const { code } = useParams<{ code: string }>();
  const { state, loading, refresh } = useGameState(code);
  const [qr, setQr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const joinUrl = useMemo(
    () => (typeof window === "undefined" ? "" : `${window.location.origin}/j/${code}`),
    [code]
  );

  useEffect(() => {
    if (joinUrl) {
      QRCode.toDataURL(joinUrl, {
        margin: 1,
        width: 640,
        color: { dark: "#0d1b45", light: "#f4f1ea" },
      }).then(setQr);
    }
  }, [joinUrl]);

  if (loading || !state) return <p className="eyebrow p-10">Loading…</p>;

  const ranked = standings(state);
  const live = state.matches.find((m) => m.status === "live") ?? null;
  const totalDhikr = state.teams.reduce((s, t) => s + Number(t.dhikr_count), 0);
  const round = state.round;
  const azkar = round ? dhikrById(round.dhikr_id) : null;
  const left = msRemaining(round, now);

  return (
    <main className="min-h-dvh px-8 py-7">
      <header className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-3">
            <HoopMark size={34} />
            <Wordmark className="text-2xl" />
          </div>
          <h1 className="mt-3 text-4xl font-light">{state.game.name}</h1>
        </div>
        <div className="text-right">
          <p className="eyebrow">Total dhikr tonight</p>
          <p className="mono tnum text-5xl font-bold" style={{ color: "#E8B04B" }}>
            {totalDhikr.toLocaleString()}
          </p>
        </div>
      </header>

      <div className="mt-7 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div>
          {/*
            The azkar is the one thing the whole hall shares at any moment, so
            it leads the board — big enough to recite from across the gym.
          */}
          {round && azkar && state.game.status === "live" && (
            <div className="panel mb-5 px-6 py-5">
              <div className="flex items-baseline justify-between">
                <span className="eyebrow">Azkar {round.idx + 1} · recite together</span>
                <span
                  className="mono tnum text-sm"
                  style={{ color: left < 60_000 ? "#E8B04B" : "rgba(244,241,234,0.55)" }}
                >
                  changes in {clock(left)}
                </span>
              </div>
              <p className="arabic mt-3 text-center text-5xl leading-[1.7]">{azkar.arabic}</p>
              <p
                className="mono mt-2 text-center text-sm uppercase tracking-[0.16em]"
                style={{ color: "#E8B04B" }}
              >
                {azkar.translit}
              </p>
              <p className="mt-1 text-center text-sm" style={{ color: "rgba(244,241,234,0.6)" }}>
                {azkar.meaning}
              </p>
              <div
                className="mt-4 h-1 w-full overflow-hidden rounded-full"
                style={{ background: "rgba(244,241,234,0.12)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${100 - Math.min(100, (left / (state.game.rotation_min * 60_000)) * 100)}%`,
                    background: "#E8B04B",
                    transition: "width 1s linear",
                  }}
                />
              </div>
            </div>
          )}

          {live && (
            <div className="mb-5">
              <Scoreboard match={live} state={state} big />
            </div>
          )}
          <Leaderboard state={state} ranked={ranked} big />
        </div>

        <aside className="space-y-5">
          <div className="panel p-5 text-center">
            <p className="eyebrow">Join in</p>
            <p className="mono mt-1 text-4xl font-bold tracking-[0.16em]">{code}</p>
            {qr && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={qr} alt="" className="mx-auto mt-3 w-40 rounded-lg" />
            )}
            <p className="mono mt-3 break-all text-[0.62rem]" style={{ color: "rgba(244,241,234,0.5)" }}>
              {joinUrl}
            </p>
          </div>

          <div className="panel p-5">
            <p className="eyebrow mb-3">Live feed</p>
            <div className="scroll-fade max-h-[22rem] overflow-hidden">
              <Feed items={state.feed} limit={14} />
            </div>
          </div>

          <p className="mono text-center text-[0.62rem]" style={{ color: "rgba(244,241,234,0.35)" }}>
            {state.players.length} PLAYING · {state.teams.length} TEAMS · TO{" "}
            {state.game.point_target}
          </p>
        </aside>
      </div>
    </main>
  );
}
