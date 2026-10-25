import { NextResponse } from "next/server";

import { getCurrentAccount } from "@/lib/server/account-auth";
import type { GameRoleSlot, GameTemplate } from "@/lib/game-types";

const REST_GAME_SUMMARY_COLUMNS = "id,title,code_name,subtitle,synopsis,play_note,cover_image,tags,author_id,author_name,author_avatar,source,version,role_slots,allow_external_control,purchase_count,rating,like_count,favorite_count,comment_count,created_at,updated_at";
const REST_GAME_COLUMNS = `${REST_GAME_SUMMARY_COLUMNS},picker_html,game_html`;
const REST_SELECT_GAMES = [
  `select=${REST_GAME_SUMMARY_COLUMNS}`,
  "deleted_at=is.null",
  "order=updated_at.desc",
  "limit=80",
].join("&");

function getSupabaseConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

function supabaseHeaders(config: { key: string }): HeadersInit {
  return {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    "Content-Type": "application/json",
  };
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function cleanHtml(value: unknown): string {
  return String(value ?? "").replace(/\u0000/g, "").trim();
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return fallback;
  return Math.min(max, Math.max(min, Math.round(amount)));
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(item => cleanText(item, 24)).filter(Boolean).slice(0, 8);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return normalizeTags(parsed);
    } catch {
      return value.split(/[,\s，、]+/).map(item => cleanText(item, 24)).filter(Boolean).slice(0, 8);
    }
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
  return {
    id,
    label,
    description: cleanText(record.description, 240),
    required: record.required !== false,
    min,
    max,
  };
}

function normalizeSlots(value: unknown): GameRoleSlot[] {
  if (Array.isArray(value)) return value.map(normalizeSlot).filter(Boolean).slice(0, 12) as GameRoleSlot[];
  if (typeof value === "string") {
    try {
      return normalizeSlots(JSON.parse(value) as unknown);
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeGame(raw: unknown, options: { requireHtml?: boolean } = {}): GameTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = cleanText(record.id, 160);
  const title = cleanText(record.title, 80);
  const pickerHtml = cleanHtml(record.picker_html ?? record.pickerHtml);
  const gameHtml = cleanHtml(record.game_html ?? record.gameHtml);
  if (!id || !title || (options.requireHtml && (!pickerHtml || !gameHtml))) return null;
  return {
    id,
    title,
    codeName: cleanText(record.code_name ?? record.codeName, 80) || id.toUpperCase(),
    subtitle: cleanText(record.subtitle, 160),
    synopsis: cleanText(record.synopsis, 600),
    playNote: cleanText(record.play_note ?? record.playNote, 3000),
    coverImage: cleanText(record.cover_image ?? record.coverImage, 2000),
    tags: normalizeTags(record.tags),
    authorId: cleanText(record.author_id ?? record.authorId, 160) || "anonymous",
    authorName: cleanText(record.author_name ?? record.authorName, 80) || "匿名作者",
    authorAvatar: cleanText(record.author_avatar ?? record.authorAvatar, 2000),
    source: "community",
    version: clampNumber(record.version, 1, 9999, 1),
    roleSlots: normalizeSlots(record.role_slots ?? record.roleSlots),
    pickerHtml,
    gameHtml,
    allowExternalControl: normalizeBoolean(record.allow_external_control ?? record.allowExternalControl),
    purchaseCount: clampNumber(record.purchase_count ?? record.purchaseCount, 0, Number.MAX_SAFE_INTEGER, 0),
    rating: Math.min(5, Math.max(0, Number(record.rating) || 0)),
    likeCount: clampNumber(record.like_count ?? record.likeCount, 0, Number.MAX_SAFE_INTEGER, 0),
    favoriteCount: clampNumber(record.favorite_count ?? record.favoriteCount, 0, Number.MAX_SAFE_INTEGER, 0),
    commentCount: clampNumber(record.comment_count ?? record.commentCount, 0, Number.MAX_SAFE_INTEGER, 0),
    likedByMe: normalizeBoolean(record.liked_by_me ?? record.likedByMe),
    createdAt: cleanText(record.created_at ?? record.createdAt, 80) || new Date().toISOString(),
    updatedAt: cleanText(record.updated_at ?? record.updatedAt, 80) || new Date().toISOString(),
  };
}

function buildPayload(input: Record<string, unknown>, existing?: GameTemplate | null): Record<string, unknown> {
  const now = new Date().toISOString();
  const id = cleanText(input.id, 160) || `game_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const title = cleanText(input.title, 80);
  const pickerHtml = cleanHtml(input.pickerHtml ?? input.picker_html);
  const gameHtml = cleanHtml(input.gameHtml ?? input.game_html);
  if (!title || !pickerHtml || !gameHtml) throw new Error("missing_required_game_fields");
  return {
    id,
    title,
    code_name: cleanText(input.codeName ?? input.code_name, 80) || id.toUpperCase(),
    subtitle: cleanText(input.subtitle, 160),
    synopsis: cleanText(input.synopsis, 600),
    play_note: cleanText(input.playNote ?? input.play_note, 3000),
    cover_image: cleanText(input.coverImage ?? input.cover_image, 2000),
    tags: normalizeTags(input.tags),
    author_id: cleanText(input.authorId ?? input.author_id, 160) || "local_user",
    author_name: cleanText(input.authorName ?? input.author_name, 80) || "匿名作者",
    author_avatar: cleanText(input.authorAvatar ?? input.author_avatar, 2000),
    source: "community",
    version: existing ? existing.version + 1 : clampNumber(input.version, 1, 9999, 1),
    role_slots: normalizeSlots(input.roleSlots ?? input.role_slots),
    picker_html: pickerHtml,
    game_html: gameHtml,
    allow_external_control: normalizeBoolean(input.allowExternalControl ?? input.allow_external_control),
    purchase_count: existing?.purchaseCount ?? 0,
    rating: existing?.rating ?? 0,
    like_count: existing?.likeCount ?? clampNumber(input.likeCount ?? input.like_count, 0, Number.MAX_SAFE_INTEGER, 0),
    favorite_count: existing?.favoriteCount ?? clampNumber(input.favoriteCount ?? input.favorite_count, 0, Number.MAX_SAFE_INTEGER, 0),
    comment_count: existing?.commentCount ?? clampNumber(input.commentCount ?? input.comment_count, 0, Number.MAX_SAFE_INTEGER, 0),
    created_at: existing?.createdAt ?? now,
    updated_at: now,
  };
}

function formatSupabaseError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error && "cause" in err ? String((err as { cause?: unknown }).cause ?? "") : "";
  const details = `${message} ${cause}`;
  if (/getaddrinfo|EAI_AGAIN|ENOTFOUND/i.test(details)) return "Supabase 域名解析失败，请检查当前 Next 运行环境的网络/DNS。";
  if (/fetch failed/i.test(message)) return "无法连接 Supabase，请检查当前 Next 运行环境是否能访问 Supabase。";
  return message;
}

function isMissingGameTableError(message: string): boolean {
  return /game_hall_games|game_hall_likes|game_hall_favorites|role_slots|picker_html|game_html|play_note|cover_image|author_avatar|like_count|favorite_count|comment_count/i.test(message)
    && /schema cache|Could not find the table|Could not find.*column|PGRST204|PGRST205|does not exist/i.test(message);
}

async function supabaseFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T; status: number } | { ok: false; error: string; status: number }> {
  const config = getSupabaseConfig();
  if (!config) return { ok: false, error: "missing_supabase_env", status: 503 };
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...supabaseHeaders(config),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    const message = typeof data === "object" && data && "message" in data
      ? String((data as { message?: unknown }).message)
      : text || response.statusText;
    if (isMissingGameTableError(message)) {
      return {
        ok: false,
        error: "游戏共享表尚未创建：请先在 Supabase SQL Editor 执行 docs/game-hall-supabase.sql。",
        status: response.status,
      };
    }
    return { ok: false, error: message, status: response.status };
  }
  return { ok: true, data: data as T, status: response.status };
}

function encodeFilter(value: string): string {
  return encodeURIComponent(value);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const account = await getCurrentAccount(request);
    const userId = account?.id || "";
    const requestedId = cleanText(url.searchParams.get("id"), 160);
    if (requestedId) {
      const result = await supabaseFetch<unknown[]>(
        `game_hall_games?id=eq.${encodeFilter(requestedId)}&deleted_at=is.null&select=${REST_GAME_COLUMNS}&limit=1`,
      );
      if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
      const game = normalizeGame(result.data[0], { requireHtml: true });
      if (!game) return NextResponse.json({ ok: false, error: "没有找到游戏。" }, { status: 404 });
      return NextResponse.json({ ok: true, game });
    }
    if (url.searchParams.get("installed") === "1") {
      if (!userId) return NextResponse.json({ ok: true, games: [] });
      const favorites = await supabaseFetch<Array<{ game_id?: string }>>(
        `game_hall_favorites?user_id=eq.${encodeFilter(userId)}&select=game_id&order=created_at.desc&limit=200`,
      );
      if (!favorites.ok) return NextResponse.json({ ok: false, error: favorites.error, games: [] }, { status: favorites.status });
      const favoriteIds = favorites.data.map(item => cleanText(item.game_id, 160)).filter(Boolean);
      if (favoriteIds.length === 0) return NextResponse.json({ ok: true, games: [] });
      const gamesResult = await supabaseFetch<unknown[]>(
        `game_hall_games?id=in.(${favoriteIds.map(encodeFilter).join(",")})&deleted_at=is.null&select=${REST_GAME_COLUMNS}`,
      );
      if (!gamesResult.ok) return NextResponse.json({ ok: false, error: gamesResult.error, games: [] }, { status: gamesResult.status });
      const byId = new Map(
        (gamesResult.data.map(item => normalizeGame(item, { requireHtml: true })).filter(Boolean) as GameTemplate[])
          .map(game => [game.id, game]),
      );
      const games = favoriteIds
        .map(id => byId.get(id))
        .filter((game): game is GameTemplate => Boolean(game))
        .map(game => ({ ...game, favoritedByMe: true }));
      return NextResponse.json({ ok: true, games });
    }

    const result = await supabaseFetch<unknown[]>(`game_hall_games?${REST_SELECT_GAMES}`);
    if (!result.ok) {
      if (/game-hall-supabase\.sql/.test(result.error)) {
        return NextResponse.json({ ok: true, games: [], setupRequired: true, error: result.error });
      }
      return NextResponse.json({ ok: false, error: result.error, games: [] }, { status: result.status });
    }
    const likedIds = new Set<string>();
    const favoriteIds = new Set<string>();
    if (userId) {
      const likes = await supabaseFetch<Array<{ game_id?: string }>>(`game_hall_likes?user_id=eq.${encodeFilter(userId)}&select=game_id`);
      if (likes.ok) {
        likes.data.forEach(item => {
          if (item.game_id) likedIds.add(item.game_id);
        });
      }
      const favorites = await supabaseFetch<Array<{ game_id?: string }>>(`game_hall_favorites?user_id=eq.${encodeFilter(userId)}&select=game_id`);
      if (favorites.ok) {
        favorites.data.forEach(item => {
          if (item.game_id) favoriteIds.add(item.game_id);
        });
      }
    }
    const games = result.data.map(item => normalizeGame(item)).filter(Boolean) as GameTemplate[];
    return NextResponse.json({
      ok: true,
      games: games.map(game => ({
        ...game,
        likedByMe: likedIds.has(game.id),
        favoritedByMe: favoriteIds.has(game.id),
      })),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: formatSupabaseError(err), games: [] }, { status: getSupabaseConfig() ? 500 : 503 });
  }
}

export async function POST(request: Request) {
  try {
    const account = await getCurrentAccount(request);
    if (!account) {
      return NextResponse.json({ ok: false, error: "请先登录账号。" }, { status: 401 });
    }
    const body = await request.json();
    const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const payload = buildPayload({
      ...record,
      authorId: account.id,
      authorName: cleanText(record.authorName ?? record.author_name, 80) || account.displayName,
    });
    const result = await supabaseFetch<unknown[]>(
      `game_hall_games?select=${REST_GAME_COLUMNS}`,
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(payload),
      },
    );
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, game: normalizeGame(result.data[0]) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: formatSupabaseError(err) }, { status: getSupabaseConfig() ? 400 : 503 });
  }
}

export async function PUT(request: Request) {
  try {
    const account = await getCurrentAccount(request);
    if (!account) {
      return NextResponse.json({ ok: false, error: "请先登录账号。" }, { status: 401 });
    }
    const body = await request.json();
    const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const id = cleanText(record.id, 160);
    if (!id) throw new Error("missing_required_game_fields");
    const existing = normalizeGame(record);
    const payload = buildPayload({
      ...record,
      authorId: account.id,
      authorName: cleanText(record.authorName ?? record.author_name, 80) || account.displayName,
    }, existing);
    const result = await supabaseFetch<unknown[]>(
      `game_hall_games?id=eq.${encodeFilter(id)}&author_id=eq.${encodeFilter(account.id)}&deleted_at=is.null&select=${REST_GAME_COLUMNS}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(payload),
      },
    );
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    const game = normalizeGame(result.data[0]);
    if (!game) return NextResponse.json({ ok: false, error: "没有找到可修改的已发布游戏。" }, { status: 404 });
    return NextResponse.json({ ok: true, game });
  } catch (err) {
    return NextResponse.json({ ok: false, error: formatSupabaseError(err) }, { status: getSupabaseConfig() ? 400 : 503 });
  }
}

export async function PATCH(request: Request) {
  try {
    const account = await getCurrentAccount(request);
    if (!account) {
      return NextResponse.json({ ok: false, error: "请先登录账号。" }, { status: 401 });
    }
    const body = await request.json();
    const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const id = cleanText(record.id ?? record.gameId, 160);
    const userId = account.id;
    const action = cleanText(record.action, 40);
    if (!id) return NextResponse.json({ ok: false, error: "missing_required_game_fields" }, { status: 400 });

    const currentResult = await supabaseFetch<unknown[]>(
      `game_hall_games?id=eq.${encodeFilter(id)}&deleted_at=is.null&select=id,like_count,favorite_count,comment_count`,
    );
    if (!currentResult.ok) return NextResponse.json({ ok: false, error: currentResult.error }, { status: currentResult.status });
    const current = currentResult.data[0] as Record<string, unknown> | undefined;
    if (!current) return NextResponse.json({ ok: false, error: "没有找到游戏。" }, { status: 404 });

    let liked = false;
    let favorited = false;
    let likeCount = clampNumber(current.like_count, 0, Number.MAX_SAFE_INTEGER, 0);
    let favoriteCount = clampNumber(current.favorite_count, 0, Number.MAX_SAFE_INTEGER, 0);
    const commentCount = clampNumber(current.comment_count, 0, Number.MAX_SAFE_INTEGER, 0);

    if (action === "toggle_like") {
      const existingLike = await supabaseFetch<unknown[]>(
        `game_hall_likes?game_id=eq.${encodeFilter(id)}&user_id=eq.${encodeFilter(userId)}&select=game_id`,
      );
      if (!existingLike.ok) return NextResponse.json({ ok: false, error: existingLike.error }, { status: existingLike.status });
      if (existingLike.data.length > 0) {
        const removed = await supabaseFetch<unknown[]>(
          `game_hall_likes?game_id=eq.${encodeFilter(id)}&user_id=eq.${encodeFilter(userId)}`,
          { method: "DELETE" },
        );
        if (!removed.ok) return NextResponse.json({ ok: false, error: removed.error }, { status: removed.status });
        likeCount = Math.max(0, likeCount - 1);
        liked = false;
      } else {
        const added = await supabaseFetch<unknown[]>(
          "game_hall_likes",
          {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ game_id: id, user_id: userId }),
          },
        );
        if (!added.ok) return NextResponse.json({ ok: false, error: added.error }, { status: added.status });
        likeCount += 1;
        liked = true;
      }
    } else if (action === "favorite" || action === "unfavorite") {
      const shouldFavorite = action === "favorite";
      const existingFavorite = await supabaseFetch<unknown[]>(
        `game_hall_favorites?game_id=eq.${encodeFilter(id)}&user_id=eq.${encodeFilter(userId)}&select=game_id`,
      );
      if (!existingFavorite.ok) return NextResponse.json({ ok: false, error: existingFavorite.error }, { status: existingFavorite.status });
      const alreadyFavorited = existingFavorite.data.length > 0;
      if (shouldFavorite && !alreadyFavorited) {
        const added = await supabaseFetch<unknown[]>(
          "game_hall_favorites",
          {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ game_id: id, user_id: userId }),
          },
        );
        if (!added.ok) return NextResponse.json({ ok: false, error: added.error }, { status: added.status });
        favorited = true;
      } else if (!shouldFavorite && alreadyFavorited) {
        const removed = await supabaseFetch<unknown[]>(
          `game_hall_favorites?game_id=eq.${encodeFilter(id)}&user_id=eq.${encodeFilter(userId)}`,
          { method: "DELETE" },
        );
        if (!removed.ok) return NextResponse.json({ ok: false, error: removed.error }, { status: removed.status });
        favorited = false;
      } else {
        favorited = alreadyFavorited;
      }
      const favorites = await supabaseFetch<unknown[]>(
        `game_hall_favorites?game_id=eq.${encodeFilter(id)}&select=game_id`,
      );
      if (!favorites.ok) return NextResponse.json({ ok: false, error: favorites.error }, { status: favorites.status });
      favoriteCount = favorites.data.length;
    } else {
      return NextResponse.json({ ok: false, error: "unknown_game_reaction" }, { status: 400 });
    }

    const updateResult = await supabaseFetch<unknown[]>(
      `game_hall_games?id=eq.${encodeFilter(id)}&deleted_at=is.null&select=${REST_GAME_COLUMNS}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          like_count: likeCount,
          favorite_count: favoriteCount,
          comment_count: commentCount,
          updated_at: new Date().toISOString(),
        }),
      },
    );
    if (!updateResult.ok) return NextResponse.json({ ok: false, error: updateResult.error }, { status: updateResult.status });
    const game = normalizeGame(updateResult.data[0]);
    return NextResponse.json({ ok: true, game: game ? { ...game, likedByMe: liked } : undefined, liked, favorited, likeCount, favoriteCount });
  } catch (err) {
    return NextResponse.json({ ok: false, error: formatSupabaseError(err) }, { status: getSupabaseConfig() ? 400 : 503 });
  }
}

export async function DELETE(request: Request) {
  try {
    const account = await getCurrentAccount(request);
    if (!account) {
      return NextResponse.json({ ok: false, error: "请先登录账号。" }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const id = cleanText(record.id, 160);
    if (!id) return NextResponse.json({ ok: false, error: "missing_required_game_fields" }, { status: 400 });
    const result = await supabaseFetch<unknown[]>(
      `game_hall_games?id=eq.${encodeFilter(id)}&author_id=eq.${encodeFilter(account.id)}&deleted_at=is.null&select=id`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
      },
    );
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    if (!Array.isArray(result.data) || result.data.length === 0) {
      return NextResponse.json({ ok: false, error: "没有找到可删除的已发布游戏。" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return NextResponse.json({ ok: false, error: formatSupabaseError(err) }, { status: getSupabaseConfig() ? 400 : 503 });
  }
}
