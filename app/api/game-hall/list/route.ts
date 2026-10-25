import { NextResponse } from "next/server";

import type { GameRoleSlot, GameTemplate } from "@/lib/game-types";
import {
  formatSupabaseRestError,
  getSupabaseServerConfig,
  supabaseRestFetch,
} from "@/lib/server/supabase-rest";

const SUMMARY_COLUMNS = "id,title,code_name,subtitle,synopsis,play_note,cover_image,tags,author_id,author_name,author_avatar,source,version,role_slots,allow_external_control,purchase_count,rating,like_count,favorite_count,comment_count,created_at,updated_at";
const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, must-revalidate",
  "Netlify-CDN-Cache-Control": "public, durable, s-maxage=120, stale-while-revalidate=600",
} as const;

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, maxLength);
}
function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return fallback;
  return Math.min(max, Math.max(min, Math.round(amount)));
}
function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(item => cleanText(item, 24)).filter(Boolean).slice(0, 8);
  if (typeof value === "string") {
    try { return normalizeTags(JSON.parse(value)); }
    catch { return value.split(/[,\s，、]+/).map(item => cleanText(item, 24)).filter(Boolean).slice(0, 8); }
  }
  return [];
}
function normalizeSlot(value: unknown): GameRoleSlot | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = cleanText(record.id, 64).replace(/[^\w-]/g, "_");
  const label = cleanText(record.label, 40);
  if (!id || !label) return null;
  const min = clampNumber(record.min, 0, 12, record.required === false ? 0 : 1);
  const max = Math.max(min, clampNumber(record.max, 1, 12, Math.max(1, min)));
  return { id, label, description: cleanText(record.description, 240), required: record.required !== false, min, max };
}
function normalizeSlots(value: unknown): GameRoleSlot[] {
  if (Array.isArray(value)) return value.map(normalizeSlot).filter(Boolean).slice(0, 12) as GameRoleSlot[];
  if (typeof value === "string") { try { return normalizeSlots(JSON.parse(value)); } catch { return []; } }
  return [];
}
function normalizeGame(value: unknown): GameTemplate | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = cleanText(row.id, 160);
  const title = cleanText(row.title, 80);
  if (!id || !title) return null;
  const updatedAt = cleanText(row.updated_at, 80) || new Date().toISOString();
  return {
    id, title, codeName: cleanText(row.code_name, 80) || id.toUpperCase(), subtitle: cleanText(row.subtitle, 160),
    synopsis: cleanText(row.synopsis, 600), playNote: cleanText(row.play_note, 3000), coverImage: cleanText(row.cover_image, 2000),
    tags: normalizeTags(row.tags), authorId: cleanText(row.author_id, 160) || "anonymous", authorName: cleanText(row.author_name, 80) || "匿名作者",
    authorAvatar: cleanText(row.author_avatar, 2000), source: "community", version: clampNumber(row.version, 1, 9999, 1), roleSlots: normalizeSlots(row.role_slots),
    pickerHtml: "", gameHtml: "", allowExternalControl: row.allow_external_control === true || row.allow_external_control === "true",
    purchaseCount: clampNumber(row.purchase_count, 0, Number.MAX_SAFE_INTEGER, 0), rating: Math.min(5, Math.max(0, Number(row.rating) || 0)),
    likeCount: clampNumber(row.like_count, 0, Number.MAX_SAFE_INTEGER, 0), favoriteCount: clampNumber(row.favorite_count, 0, Number.MAX_SAFE_INTEGER, 0),
    commentCount: clampNumber(row.comment_count, 0, Number.MAX_SAFE_INTEGER, 0), likedByMe: false, favoritedByMe: false,
    createdAt: cleanText(row.created_at, 80) || updatedAt, updatedAt,
  };
}
function isMissingTableError(message: string): boolean {
  return /game_hall_games/i.test(message) && /PGRST20[45]|Could not find the table|schema cache|does not exist/i.test(message);
}

export async function GET() {
  try {
    if (!getSupabaseServerConfig()) return NextResponse.json({ ok: true, games: [], setupRequired: true });
    const result = await supabaseRestFetch<unknown[]>(`game_hall_games?deleted_at=is.null&select=${SUMMARY_COLUMNS}&order=updated_at.desc&limit=80`);
    if (!result.ok) {
      if (isMissingTableError(result.error)) return NextResponse.json({ ok: true, games: [], setupRequired: true, error: result.error });
      return NextResponse.json({ ok: false, games: [], error: result.error }, { status: result.status });
    }
    const games = result.data.map(normalizeGame).filter((game): game is GameTemplate => Boolean(game));
    return NextResponse.json({ ok: true, games }, { headers: CACHE_HEADERS });
  } catch (err) {
    return NextResponse.json({ ok: false, games: [], error: formatSupabaseRestError(err) }, { status: 500 });
  }
}
