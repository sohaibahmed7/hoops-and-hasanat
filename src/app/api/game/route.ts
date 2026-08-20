import { NextResponse } from "next/server";
import { admin } from "@/lib/supabaseAdmin";
import { roomCode, token } from "@/lib/ids";
import { TEAM_COLORS } from "@/lib/types";
import { ADHKAR } from "@/lib/dhikr";

export const dynamic = "force-dynamic";

/** POST /api/game — create a game, its host token, and its starting teams. */
export async function POST(req: Request) {
  let body: { name?: string; teams?: string[]; pointTarget?: number; rotationMin?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const name = (body.name ?? "").trim() || "Brothers' Basketball Run";
  const teamNames = (body.teams ?? [])
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);

  if (teamNames.length < 2) {
    return NextResponse.json({ error: "Give the game at least two teams." }, { status: 400 });
  }

  const db = admin();
  const hostToken = token();

  // Codes are short enough to collide eventually; retry a few times.
  let code = "";
  let gameId = "";
  for (let attempt = 0; attempt < 6; attempt++) {
    code = roomCode();
    const { data, error } = await db
      .from("games")
      .insert({
        code,
        name: name.slice(0, 80),
        point_target: body.pointTarget === 5 ? 5 : 7,
        rotation_min: body.rotationMin === 20 ? 20 : 10,
        // The rotation order is fixed at creation so every screen in the hall
        // is reciting the same thing at the same time.
        azkar_seq: ADHKAR.map((d) => d.id),
      })
      .select("id")
      .single();
    if (!error && data) {
      gameId = data.id;
      break;
    }
    if (error && error.code !== "23505") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  if (!gameId) {
    return NextResponse.json({ error: "Could not allocate a room code. Try again." }, { status: 500 });
  }

  await db.from("game_hosts").insert({ game_id: gameId, host_token: hostToken });

  await db.from("teams").insert(
    teamNames.map((n, i) => ({
      game_id: gameId,
      name: n.slice(0, 40),
      color: TEAM_COLORS[i % TEAM_COLORS.length].id,
      ord: i,
    }))
  );

  // Seat the opening two teams and queue the rest, in the order they were typed.
  await db.rpc("seed_court", { p_game: gameId });

  await db.from("feed").insert({ game_id: gameId, kind: "note", text: `${name} opened. Bismillah.` });

  return NextResponse.json({ code, hostToken });
}
