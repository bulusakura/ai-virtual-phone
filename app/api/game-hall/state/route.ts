import { NextResponse } from "next/server";

import { getCurrentAccount } from "@/lib/server/account-auth";
import {
  encodeSupabaseFilter,
  formatSupabaseRestError,
  getSupabaseServerConfig,
  supabaseRestFetch,
} from "@/lib/server/supabase-rest";

type StateRow = { liked_ids?: unknown; favorite_ids?: unknown };
type IdRow = { game_id?: unknown };
function cleanText(value: unknown, maxLength: number): string { return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, maxLength); }
function normalizeIds(value: unknown): string[] { if (!Array.isArray(value)) return []; return [...new Set(value.map(item => cleanText(item, 160)).filter(Boolean))]; }
function isMissingRpcError(message: string): boolean { return /game_hall_user_state|PGRST202|Could not find the function|schema cache|does not exist/i.test(message); }

export async function GET(request: Request) {
  try {
    if (!getSupabaseServerConfig()) return NextResponse.json({ ok: true, likedIds: [], favoriteIds: [] });
    const account = await getCurrentAccount(request);
    if (!account) return NextResponse.json({ ok: true, likedIds: [], favoriteIds: [] });
    const rpc = await supabaseRestFetch<StateRow[]>("rpc/game_hall_user_state", { method: "POST", body: JSON.stringify({ p_user_id: account.id }) });
    if (rpc.ok) {
      const row = rpc.data[0] ?? {};
      return NextResponse.json({ ok: true, likedIds: normalizeIds(row.liked_ids), favoriteIds: normalizeIds(row.favorite_ids) });
    }
    if (!isMissingRpcError(rpc.error)) return NextResponse.json({ ok: false, error: rpc.error }, { status: rpc.status });
    const [likes, favorites] = await Promise.all([
      supabaseRestFetch<IdRow[]>(`game_hall_likes?user_id=eq.${encodeSupabaseFilter(account.id)}&select=game_id`),
      supabaseRestFetch<IdRow[]>(`game_hall_favorites?user_id=eq.${encodeSupabaseFilter(account.id)}&select=game_id`),
    ]);
    if (!likes.ok) return NextResponse.json({ ok: false, error: likes.error }, { status: likes.status });
    if (!favorites.ok) return NextResponse.json({ ok: false, error: favorites.error }, { status: favorites.status });
    return NextResponse.json({ ok: true, likedIds: normalizeIds(likes.data.map(item => item.game_id)), favoriteIds: normalizeIds(favorites.data.map(item => item.game_id)) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: formatSupabaseRestError(err) }, { status: 500 });
  }
}
