import { NextResponse } from "next/server";
import { admin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * POST /api/court — everything a *player* can do to the game on court.
 *
 * Separate from /api/match, which is the host's console. The host is normally
 * playing too, so a normal evening never touches that route: the teams on
 * court start their own game, one side reports the final score, and the other
 * side confirms it.
 *
 * Every rule is enforced by the database functions these call, so none of it
 * can be bypassed by posting straight to this endpoint.
 */
export async function POST(req: Request) {
  let body: {
    playerToken?: string;
    matchId?: string;
    action?: "start" | "report" | "confirm" | "dispute";
    us?: number;
    them?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const token = body.playerToken ?? "";
  if (!token) return NextResponse.json({ error: "Rejoin the game." }, { status: 401 });

  const db = admin();

  // Postgres raises a plain-English message for each rule these break, and
  // every one of them is something the player needs to read, so pass it on.
  const fail = (e: { message: string }) => {
    const msg = e.message.replace(/^.*?ERROR:\s*/i, "").trim();
    const unknown = /unknown player/i.test(msg);
    return NextResponse.json(
      { error: unknown ? "This session is no longer valid — rejoin the game." : msg },
      { status: unknown ? 401 : 409 }
    );
  };

  if (body.action === "start") {
    const { data, error } = await db.rpc("start_by_player", { p_token: token });
    if (error) return fail(error);
    return NextResponse.json({ matchId: data });
  }

  if (body.action === "report") {
    const us = Math.trunc(Number(body.us ?? -1));
    const them = Math.trunc(Number(body.them ?? -1));
    if (!body.matchId || !Number.isFinite(us) || !Number.isFinite(them) || us < 0 || them < 0) {
      return NextResponse.json({ error: "Enter both scores." }, { status: 400 });
    }
    const { error } = await db.rpc("report_result", {
      p_token: token,
      p_match: body.matchId,
      p_us: us,
      p_them: them,
    });
    if (error) return fail(error);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "confirm" || body.action === "dispute") {
    if (!body.matchId) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const fn = body.action === "confirm" ? "confirm_by_player" : "dispute_by_player";
    const { error } = await db.rpc(fn, { p_token: token, p_match: body.matchId });
    if (error) return fail(error);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
