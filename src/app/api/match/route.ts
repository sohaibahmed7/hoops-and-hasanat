import { NextResponse } from "next/server";
import { admin } from "@/lib/supabaseAdmin";
import { requireHost } from "@/lib/state";

export const dynamic = "force-dynamic";

/**
 * POST /api/match — host-only court control.
 * action: "start"    tip off team A vs team B
 *         "score"    live score bump while play is running
 *         "final"    close the match, which is what moves the Elo
 *         "cancel"   scrub a match that never happened
 */
export async function POST(req: Request) {
  let body: {
    code?: string;
    hostToken?: string;
    action?: "start" | "score" | "final" | "cancel";
    teamA?: string;
    teamB?: string;
    matchId?: string;
    scoreA?: number;
    scoreB?: number;
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
  const target = auth.pointTarget;
  // A game can never record more than the target it is played to.
  const cap = (n: unknown) => Math.min(Math.max(0, Math.floor(Number(n ?? 0))), target);

  if (body.action === "start") {
    const { count } = await db
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("game_id", gameId)
      .in("status", ["live", "pending"]);
    if ((count ?? 0) > 0) {
      return NextResponse.json({ error: "Finish the game on court first." }, { status: 409 });
    }

    let teamA = body.teamA ?? null;
    let teamB = body.teamB ?? null;

    if (teamA && teamB) {
      // A manual override reseats the floor, so the winner-stays-on rotation
      // always reasons about two teams that were genuinely playing.
      if (teamA === teamB) {
        return NextResponse.json({ error: "Pick two different teams." }, { status: 400 });
      }
      const { data: picked } = await db
        .from("teams")
        .select("id")
        .eq("game_id", gameId)
        .in("id", [teamA, teamB]);
      if ((picked?.length ?? 0) !== 2) {
        return NextResponse.json({ error: "Those teams aren't in this game." }, { status: 400 });
      }
      await db.from("teams").update({ on_court: false }).eq("game_id", gameId).eq("on_court", true);
      await db.from("teams").update({ on_court: true, queue_pos: null }).in("id", [teamA, teamB]);
      // A team bumped off the floor has no queue position; put it at the front.
      await db.rpc("renumber_queue", { p_game: gameId });
    } else {
      // Normal path: play whoever the rotation has put on the floor.
      await db.rpc("seed_court", { p_game: gameId });
      const { data: onCourt } = await db
        .from("teams")
        .select("id")
        .eq("game_id", gameId)
        .eq("on_court", true)
        .order("ord");
      if ((onCourt?.length ?? 0) < 2) {
        return NextResponse.json({ error: "Two teams are needed on court." }, { status: 409 });
      }
      teamA = onCourt![0].id;
      teamB = onCourt![1].id;
    }

    const { data, error } = await db
      .from("matches")
      .insert({ game_id: gameId, team_a: teamA, team_b: teamB, target })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ matchId: data.id });
  }

  if (body.action === "score") {
    if (!body.matchId) return NextResponse.json({ error: "Missing match." }, { status: 400 });
    const a = cap(body.scoreA);
    const b = cap(body.scoreB);
    const { error } = await db
      .from("matches")
      .update({ score_a: a, score_b: b })
      .eq("id", body.matchId)
      .eq("game_id", gameId)
      .in("status", ["live", "pending"]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "final") {
    if (!body.matchId) return NextResponse.json({ error: "Missing match." }, { status: 400 });
    const a = cap(body.scoreA);
    const b = cap(body.scoreB);
    const { data: match } = await db
      .from("matches")
      .select("id")
      .eq("id", body.matchId)
      .eq("game_id", gameId)
      .maybeSingle();
    if (!match) return NextResponse.json({ error: "No such match." }, { status: 404 });

    // The host can settle a game the players left waiting on a confirmation.
    await db.from("matches").update({ status: "live" }).eq("id", body.matchId).eq("status", "pending");
    const { error } = await db.rpc("finalize_match", { p_match: body.matchId, p_a: a, p_b: b });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "cancel") {
    if (!body.matchId) return NextResponse.json({ error: "Missing match." }, { status: 400 });
    const { error } = await db
      .from("matches")
      .delete()
      .eq("id", body.matchId)
      .eq("game_id", gameId)
      .in("status", ["live", "pending"]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
