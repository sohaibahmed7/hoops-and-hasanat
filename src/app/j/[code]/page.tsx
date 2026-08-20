"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { HoopMark, Wordmark } from "@/components/Brand";
import { colorOf, tint, type GameState } from "@/lib/types";

export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [state, setState] = useState<GameState | null>(null);
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already joined on this device? Go straight in.
  useEffect(() => {
    if (localStorage.getItem(`player:${code}`)) router.replace(`/g/${code}`);
  }, [code, router]);

  useEffect(() => {
    fetch(`/api/game/${code}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j.error ? setError(j.error) : setState(j)))
      .catch(() => setError("Could not reach the game."));
  }, [code]);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, name, teamId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not join.");
        return;
      }
      localStorage.setItem(`player:${code}`, json.playerToken);
      localStorage.setItem(`playerId:${code}`, json.playerId);
      router.push(`/g/${code}`);
    } catch {
      setError("Network trouble. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const counts = (id: string) => state?.players.filter((p) => p.team_id === id).length ?? 0;

  return (
    <main className="mx-auto max-w-md px-6 py-10">
      <header className="flex items-center gap-3">
        <HoopMark size={26} />
        <Wordmark className="text-lg" />
      </header>

      {error && !state ? (
        <div className="mt-16 text-center">
          <p className="text-lg">{error}</p>
          <button className="btn mt-5" onClick={() => router.push("/")}>
            Back
          </button>
        </div>
      ) : !state ? (
        <p className="eyebrow mt-16">Loading…</p>
      ) : (
        <>
          <p className="eyebrow mt-10">{code}</p>
          <h1 className="mt-2 text-3xl font-light">{state.game.name}</h1>
          <p className="mt-2 text-sm" style={{ color: "rgba(244,241,234,0.6)" }}>
            {state.players.length} {state.players.length === 1 ? "brother" : "brothers"} in ·{" "}
            {state.teams.length} teams
          </p>

          <div className="mt-8 space-y-6">
            <div>
              <label className="eyebrow mb-2 block" htmlFor="nm">Your name</label>
              <input
                id="nm"
                className="field"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 28))}
                placeholder="e.g. Yusuf"
                autoComplete="given-name"
              />
            </div>

            <div>
              <span className="eyebrow mb-2 block">Team</span>
              <button
                className="panel-quiet mb-2 flex w-full items-center justify-between px-4 py-3 text-left"
                onClick={() => setTeamId(null)}
                style={teamId === null ? { borderColor: "rgba(244,241,234,0.45)" } : undefined}
              >
                <span className="text-sm">Put me where I&apos;m needed</span>
                <span className="mono text-[0.65rem]" style={{ color: "rgba(244,241,234,0.45)" }}>
                  {teamId === null ? "SELECTED" : "AUTO"}
                </span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                {state.teams.map((t) => {
                  const hex = colorOf(t.color);
                  const on = teamId === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTeamId(t.id)}
                      className="panel-quiet px-3 py-3 text-left transition-colors"
                      style={on ? { borderColor: tint(hex, 0.6), background: tint(hex, 0.1) } : undefined}
                    >
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: hex }} />
                        <span className="truncate text-sm font-medium">{t.name}</span>
                      </span>
                      <span className="mono mt-1 block text-[0.62rem]" style={{ color: "rgba(244,241,234,0.45)" }}>
                        {counts(t.id)} on roster
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <p className="mono text-xs" style={{ color: "#E5745E" }}>
                {error}
              </p>
            )}

            <button className="btn btn-rim w-full" onClick={join} disabled={busy || !name.trim()}>
              {busy ? "Joining…" : "I'm in"}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
