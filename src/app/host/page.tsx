"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { HoopMark, Wordmark } from "@/components/Brand";

const DEFAULT_TEAMS = ["Sabr", "Shukr", "Ihsan", "Tawakkul"];

export default function HostSetup() {
  const router = useRouter();
  const [name, setName] = useState("Brothers' Basketball Run");
  const [teams, setTeams] = useState<string[]>(DEFAULT_TEAMS);
  const [target, setTarget] = useState(7);
  const [rotation, setRotation] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setTeam = (i: number, v: string) =>
    setTeams((t) => t.map((x, j) => (j === i ? v : x)));

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/game", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          teams: teams.filter((t) => t.trim()),
          pointTarget: target,
          rotationMin: rotation,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not create the game.");
        return;
      }
      localStorage.setItem(`host:${json.code}`, json.hostToken);
      router.push(`/g/${json.code}/host`);
    } catch {
      setError("Network trouble. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-md px-6 py-10">
      <header className="flex items-center gap-3">
        <HoopMark size={26} />
        <Wordmark className="text-lg" />
      </header>

      <h1 className="mt-10 text-3xl font-light">Set up the game</h1>
      <p className="mt-2 text-sm" style={{ color: "rgba(244,241,234,0.6)" }}>
        You&apos;ll get a code and a link to share. Everything else runs from your
        host console.
      </p>

      <div className="mt-8 space-y-6">
        <div>
          <label className="eyebrow mb-2 block" htmlFor="ev">Event name</label>
          <input id="ev" className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="eyebrow">Teams</span>
            <span className="mono text-[0.65rem]" style={{ color: "rgba(244,241,234,0.4)" }}>
              {teams.length}/8
            </span>
          </div>
          <div className="space-y-2">
            {teams.map((t, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className="field"
                  value={t}
                  onChange={(e) => setTeam(i, e.target.value)}
                  placeholder={`Team ${i + 1}`}
                />
                {teams.length > 2 && (
                  <button
                    className="btn shrink-0 px-3"
                    onClick={() => setTeams((x) => x.filter((_, j) => j !== i))}
                    aria-label={`Remove team ${i + 1}`}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          {teams.length < 8 && (
            <button className="btn mt-2 w-full" onClick={() => setTeams((t) => [...t, ""])}>
              + Add team
            </button>
          )}
        </div>

        <div>
          <span className="eyebrow mb-2 block">Games run to</span>
          <div className="grid grid-cols-2 gap-2">
            {[5, 7].map((n) => (
              <button
                key={n}
                onClick={() => setTarget(n)}
                className="panel-quiet px-4 py-3 text-left transition-colors"
                style={target === n ? { borderColor: "rgba(244,241,234,0.5)", background: "rgba(244,241,234,0.08)" } : undefined}
              >
                <span className="mono text-2xl font-bold">{n}</span>
                <span className="mono ml-1.5 text-[0.62rem]" style={{ color: "rgba(244,241,234,0.45)" }}>
                  POINTS
                </span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "rgba(244,241,234,0.5)" }}>
            You can switch this at any time from the console — games already
            played keep the target they were played to.
          </p>
        </div>

        <div>
          <span className="eyebrow mb-2 block">New azkar every</span>
          <div className="grid grid-cols-2 gap-2">
            {[10, 20].map((n) => (
              <button
                key={n}
                onClick={() => setRotation(n)}
                className="panel-quiet px-4 py-3 text-left transition-colors"
                style={rotation === n ? { borderColor: "rgba(244,241,234,0.5)", background: "rgba(244,241,234,0.08)" } : undefined}
              >
                <span className="mono text-2xl font-bold">{n}</span>
                <span className="mono ml-1.5 text-[0.62rem]" style={{ color: "rgba(244,241,234,0.45)" }}>
                  MIN
                </span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "rgba(244,241,234,0.5)" }}>
            Everyone in the hall recites the same azkar at the same time, and it
            changes on this clock. There is no count to reach — each interval is
            judged against what the rest of the hall managed in the same window.
          </p>
        </div>

        {error && (
          <p className="mono text-xs" style={{ color: "#E5745E" }}>
            {error}
          </p>
        )}

        <button
          className="btn btn-rim w-full"
          onClick={create}
          disabled={busy || teams.filter((t) => t.trim()).length < 2}
        >
          {busy ? "Creating…" : "Create game"}
        </button>
      </div>
    </main>
  );
}
