import { NextResponse } from "next/server";
import { admin } from "@/lib/supabaseAdmin";
import { requireHost } from "@/lib/state";
import { TEAM_COLORS } from "@/lib/types";

export const dynamic = "force-dynamic";

/** POST /api/team — host adds a team, renames one, or moves a player. */
export async function POST(req: Request) {
  let body: {
    code?: string;
    hostToken?: string;
    action?: "add" | "rename" | "move" | "remove";
    name?: string;
    teamId?: string;
    playerId?: string;
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

  if (body.action === "add") {
    const name = (body.name ?? "").trim().slice(0, 40);
    if (!name) return NextResponse.json({ error: "Give the team a name." }, { status: 400 });
    const { count } = await db
      .from("teams")
      .select("id", { count: "exact", head: true })
      .eq("game_id", gameId);
    if ((count ?? 0) >= 8) {
      return NextResponse.json({ error: "Eight teams is the maximum." }, { status: 409 });
    }
    // New teams start at the field average, not at 1000, so a team added at
    // half time is neither gifted a lead nor buried before it plays.
    const { data: existing } = await db.from("teams").select("rating").eq("game_id", gameId);
    const avg =
      existing && existing.length
        ? existing.reduce((s, t) => s + Number(t.rating), 0) / existing.length
        : 1000;

    const { error } = await db.from("teams").insert({
      game_id: gameId,
      name,
      color: TEAM_COLORS[(count ?? 0) % TEAM_COLORS.length].id,
      ord: count ?? 0,
      rating: avg,
      // Latecomers join the back of the queue, never the front of the floor.
      queue_pos: (count ?? 0) + 100,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await db.rpc("seed_court", { p_game: gameId });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "rename") {
    const name = (body.name ?? "").trim().slice(0, 40);
    if (!body.teamId || !name) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    await db.from("teams").update({ name }).eq("id", body.teamId).eq("game_id", gameId);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "move") {
    if (!body.playerId || !body.teamId) {
      return NextResponse.json({ error: "Bad request." }, { status: 400 });
    }
    // Dhikr already banked stays with the team that earned it — moving a
    // player carries their future taps, not their history.
    await db.from("players").update({ team_id: body.teamId }).eq("id", body.playerId).eq("game_id", gameId);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "remove") {
    if (!body.teamId) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { count } = await db
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("team_id", body.teamId);
    if ((count ?? 0) > 0) {
      return NextResponse.json({ error: "Move its players off first." }, { status: 409 });
    }
    await db.from("teams").delete().eq("id", body.teamId).eq("game_id", gameId);
    // Removing a team can empty a court slot; top it back up from the queue.
    await db.rpc("seed_court", { p_game: gameId });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
