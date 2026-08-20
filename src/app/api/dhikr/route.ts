import { NextResponse } from "next/server";
import { admin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * POST /api/dhikr — bank a batch of taps.
 * The client counts optimistically and flushes about once a second; the
 * database decides how many of those taps actually count, so a scripted
 * tapper gains nothing over a sincere thumb.
 */
export async function POST(req: Request) {
  let body: { playerToken?: string; count?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const playerToken = body.playerToken ?? "";
  const count = Math.floor(Number(body.count ?? 0));
  if (!playerToken || !Number.isFinite(count) || count <= 0) {
    return NextResponse.json({ error: "Nothing to record." }, { status: 400 });
  }

  const db = admin();
  const { data, error } = await db.rpc("record_dhikr", { p_token: playerToken, p_count: count });

  if (error) {
    const unknown = error.message.includes("unknown player");
    return NextResponse.json(
      { error: unknown ? "This session is no longer valid — rejoin the game." : error.message },
      { status: unknown ? 401 : 500 }
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    granted: row?.granted ?? 0,
    playerTotal: Number(row?.player_total ?? 0),
    teamTotal: Number(row?.team_total ?? 0),
    roundTotal: Number(row?.round_total ?? 0),
  });
}
