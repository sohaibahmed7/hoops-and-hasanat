import { NextResponse } from "next/server";
import { loadState } from "@/lib/state";

export const dynamic = "force-dynamic";

/** GET /api/game/:code — the full state every screen renders from. */
export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  try {
    const state = await loadState(code);
    if (!state) return NextResponse.json({ error: "No game with that code." }, { status: 404 });
    return NextResponse.json(state, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
