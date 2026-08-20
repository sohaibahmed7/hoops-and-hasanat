"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { browserSupabase } from "./supabaseClient";
import type { GameState } from "./types";

/**
 * Live game state. Supabase realtime tells us *that* something changed and we
 * refetch the whole picture — simpler and less error-prone than patching rows
 * locally, and at 60 people the payload is a few kilobytes. A slow poll runs
 * underneath in case the websocket drops on gym wifi.
 */
export function useGameState(code: string) {
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const inflight = useRef(false);

  const refresh = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const res = await fetch(`/api/game/${code}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not load the game.");
      } else {
        setState(json as GameState);
        setError(null);
      }
    } catch {
      setError("Lost connection. Retrying…");
    } finally {
      inflight.current = false;
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const gameId = state?.game.id;
    const sb = browserSupabase();
    if (!sb || !gameId) return;

    const channel = sb.channel(`game:${gameId}`);
    for (const table of ["teams", "players", "matches", "feed", "games"]) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => refresh()
      );
    }
    channel.subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [state?.game.id, refresh]);

  // Fallback poll. Deliberately slow: realtime carries the load normally.
  useEffect(() => {
    const id = setInterval(refresh, 6000);
    return () => clearInterval(id);
  }, [refresh]);

  return { state, error, loading, refresh };
}

/** Ranked view of teams — the leaderboard order used on every screen. */
export function standings(state: GameState) {
  return [...state.teams].sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return Number(b.dhikr_count) - Number(a.dhikr_count);
  });
}
