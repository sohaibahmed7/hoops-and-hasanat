import { NextResponse } from "next/server";
import { admin } from "@/lib/supabaseAdmin";
import { token } from "@/lib/ids";

export const dynamic = "force-dynamic";

/**
 * POST /api/join — add a participant.
 * Team is either chosen or auto-balanced onto the smallest roster, which is
 * what keeps a 60-person walk-in event from ending up 14 v 3.
 */
export async function POST(req: Request) {
  let body: { code?: string; name?: string; teamId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const code = (body.code ?? "").trim().toUpperCase();
  const name = (body.name ?? "").trim().slice(0, 28);
  if (!code || !name) {
    return NextResponse.json({ error: "Name and room code are both needed." }, { status: 400 });
  }

  const db = admin();
  const { data: game } = await db.from("games").select("id, status").eq("code", code).maybeSingle();
  if (!game) return NextResponse.json({ error: "No game with that code." }, { status: 404 });
  if (game.status === "ended") {
    return NextResponse.json({ error: "That game has already finished." }, { status: 409 });
  }

  let teamId = body.teamId ?? null;
  if (teamId) {
    const { data: team } = await db
      .from("teams")
      .select("id")
      .eq("id", teamId)
      .eq("game_id", game.id)
      .maybeSingle();
    if (!team) teamId = null;
  }
  if (!teamId) {
    const { data } = await db.rpc("smallest_team", { p_game: game.id });
    teamId = (data as string | null) ?? null;
  }
  if (!teamId) {
    return NextResponse.json({ error: "This game has no teams yet." }, { status: 409 });
  }

  const playerToken = token();
  const { data: player, error } = await db
    .from("players")
    .insert({ game_id: game.id, team_id: teamId, name })
    .select("id, team_id")
    .single();

  if (error || !player) {
    return NextResponse.json({ error: error?.message ?? "Could not join." }, { status: 500 });
  }

  await db.from("player_secrets").insert({ player_id: player.id, token: playerToken });

  const { data: team } = await db.from("teams").select("name").eq("id", player.team_id!).maybeSingle();
  await db.from("feed").insert({
    game_id: game.id,
    kind: "join",
    text: `${name} joined ${team?.name ?? "the game"}`,
  });

  return NextResponse.json({ playerToken, playerId: player.id, teamId: player.team_id });
}
