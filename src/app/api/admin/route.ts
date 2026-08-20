import { NextResponse } from "next/server";
import { admin } from "@/lib/supabaseAdmin";
import { requireHost } from "@/lib/state";

export const dynamic = "force-dynamic";

/** POST /api/admin — host-only game controls and host-token verification. */
export async function POST(req: Request) {
  let body: {
    code?: string;
    hostToken?: string;
    action?: "verify" | "status" | "note" | "settings";
    status?: "lobby" | "live" | "ended";
    text?: string;
    pointTarget?: number;
    rotationMin?: number;
    tapRate?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const auth = await requireHost(body.code ?? "", body.hostToken ?? null);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

  const db = admin();
  const gameId = auth.gameId;

  if (body.action === "verify") return NextResponse.json({ ok: true });

  if (body.action === "status") {
    const status = body.status;
    if (!status || !["lobby", "live", "ended"].includes(status)) {
      return NextResponse.json({ error: "Unknown status." }, { status: 400 });
    }

    const patch: Record<string, unknown> = { status };
    if (status === "live") {
      // Going live is what starts the azkar clock. Only stamp it the first
      // time, so reopening a game that was called early doesn't restart the
      // rotation from azkar one.
      const { data: g } = await db.from("games").select("started_at").eq("id", gameId).maybeSingle();
      if (!g?.started_at) {
        patch.started_at = new Date().toISOString();
        await db.from("feed").insert({
          game_id: gameId,
          kind: "note",
          text: "The evening has begun. First azkar is up.",
        });
      }
    }
    await db.from("games").update(patch).eq("id", gameId);
    if (status === "live") await db.rpc("ensure_rounds", { p_game: gameId });
    if (status === "ended") {
      await db.from("feed").insert({
        game_id: gameId,
        kind: "note",
        text: "Final whistle. Jazakum Allahu khayran, all of you.",
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "note") {
    const text = (body.text ?? "").trim().slice(0, 140);
    if (!text) return NextResponse.json({ error: "Nothing to say." }, { status: 400 });
    await db.from("feed").insert({ game_id: gameId, kind: "note", text });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "settings") {
    const patch: Record<string, number> = {};
    // Games run to 5 or 7 — the host can switch between them at any point, and
    // matches already played keep whatever target they were played to.
    if (body.pointTarget !== undefined) {
      patch.point_target = body.pointTarget === 5 ? 5 : 7;
    }
    if (body.rotationMin !== undefined) {
      patch.rotation_min = body.rotationMin === 20 ? 20 : 10;
    }
    if (body.tapRate !== undefined) {
      patch.tap_rate = Math.min(Math.max(Number(body.tapRate), 1), 20);
    }
    if (Object.keys(patch).length) await db.from("games").update(patch).eq("id", gameId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
