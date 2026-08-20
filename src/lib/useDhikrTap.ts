"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Flush = { granted: number; playerTotal: number; teamTotal: number; roundTotal: number };

/**
 * Counts taps locally at thumb speed and flushes them to the server on a
 * cadence. The server is the authority: if it grants fewer taps than we sent
 * (rate limit), we roll the local number back so nobody is looking at a count
 * the leaderboard doesn't agree with.
 */
export function useDhikrTap(playerToken: string | null, serverTotal: number) {
  const [local, setLocal] = useState(serverTotal);
  const [throttled, setThrottled] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  const pending = useRef(0);
  const sending = useRef(false);
  const localRef = useRef(serverTotal);
  const touched = useRef(false);

  // Adopt the server's number until the first tap, and whenever we're idle —
  // this is how a second device or a page reload converges.
  useEffect(() => {
    if (touched.current || pending.current > 0) return;
    localRef.current = serverTotal;
    setLocal(serverTotal);
  }, [serverTotal]);

  const flush = useCallback(async () => {
    if (sending.current || pending.current === 0 || !playerToken) return;
    const batch = pending.current;
    pending.current = 0;
    sending.current = true;
    try {
      const res = await fetch("/api/dhikr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerToken, count: batch }),
      });
      const json = (await res.json()) as Flush & { error?: string };
      if (res.status === 401) {
        setFatal(json.error ?? "Session expired.");
        return;
      }
      if (!res.ok) {
        // Couldn't bank them — put them back and try on the next tick.
        pending.current += batch;
        return;
      }
      const shortfall = batch - json.granted;
      if (shortfall > 0) {
        setThrottled(true);
        localRef.current = Math.max(0, localRef.current - shortfall);
        setLocal(localRef.current);
        setTimeout(() => setThrottled(false), 1200);
      }
      // Trust the server's total once our queue is empty.
      if (pending.current === 0) {
        localRef.current = json.playerTotal;
        setLocal(json.playerTotal);
      }
    } catch {
      pending.current += batch;
    } finally {
      sending.current = false;
    }
  }, [playerToken]);

  useEffect(() => {
    const id = setInterval(flush, 900);
    return () => clearInterval(id);
  }, [flush]);

  // Don't lose the last few taps when a phone screen locks or the tab closes.
  useEffect(() => {
    const bank = () => {
      if (pending.current > 0 && playerToken && navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/dhikr",
          new Blob([JSON.stringify({ playerToken, count: pending.current })], {
            type: "application/json",
          })
        );
        pending.current = 0;
      }
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") bank();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", bank);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", bank);
    };
  }, [playerToken]);

  const tap = useCallback(() => {
    if (fatal) return;
    touched.current = true;
    pending.current += 1;
    localRef.current += 1;
    setLocal(localRef.current);
  }, [fatal]);

  return { count: local, tap, throttled, fatal, pending };
}
