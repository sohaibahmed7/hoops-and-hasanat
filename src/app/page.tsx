"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { HoopMark, Wordmark } from "@/components/Brand";

export default function Landing() {
  const router = useRouter();
  const [code, setCode] = useState("");

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c.length >= 4) router.push(`/j/${c}`);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-10">
      <header className="flex items-center gap-3">
        <HoopMark size={30} />
        <Wordmark className="text-xl" />
      </header>

      <div className="flex flex-1 flex-col justify-center py-14">
        <p className="eyebrow">A night of basketball and brotherhood</p>
        <h1 className="mt-3 text-[2.6rem] leading-[1.05] font-light">
          Play on the court.
          <br />
          <span style={{ color: "#E8B04B" }}>Make dhikr off it.</span>
        </h1>
        <p className="mt-4 text-[0.95rem] leading-relaxed" style={{ color: "rgba(244,241,234,0.65)" }}>
          Your team scores while it plays and while it waits. Both feed one
          rating, so the bench is never idle time.
        </p>

        <form onSubmit={go} className="mt-9 space-y-3">
          <label className="eyebrow block" htmlFor="code">
            Room code
          </label>
          <input
            id="code"
            className="field mono text-center text-2xl tracking-[0.35em] uppercase"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="ABCDE"
            autoComplete="off"
            autoCapitalize="characters"
            inputMode="text"
          />
          <button type="submit" className="btn btn-rim w-full" disabled={code.trim().length < 4}>
            Join the game
          </button>
        </form>
      </div>

      <footer className="border-t pt-5 hairline" style={{ borderTopWidth: 1 }}>
        <Link href="/host" className="mono text-xs uppercase tracking-[0.14em]" style={{ color: "rgba(244,241,234,0.55)" }}>
          Running the event? Set up a game →
        </Link>
      </footer>
    </main>
  );
}
