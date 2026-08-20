"use client";

import type { FeedItem } from "@/lib/types";

const MARK: Record<FeedItem["kind"], string> = {
  join: "+",
  round: "✦",
  court: "⇄",
  final: "▣",
  note: "—",
};

const TONE: Record<FeedItem["kind"], string> = {
  join: "rgba(244,241,234,0.45)",
  round: "#E8B04B",
  court: "#7FB2F0",
  final: "#D2503A",
  note: "rgba(244,241,234,0.55)",
};

export function Feed({ items, limit = 12 }: { items: FeedItem[]; limit?: number }) {
  if (!items.length) {
    return (
      <p className="mono text-xs" style={{ color: "rgba(244,241,234,0.35)" }}>
        Nothing yet.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {items.slice(0, limit).map((item) => (
        <li key={item.id} className="flex gap-2.5 text-sm leading-snug">
          <span className="mono mt-0.5 shrink-0 text-xs" style={{ color: TONE[item.kind] }}>
            {MARK[item.kind]}
          </span>
          <span style={{ color: "rgba(244,241,234,0.78)" }}>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}
