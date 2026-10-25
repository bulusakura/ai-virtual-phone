import { NextResponse } from "next/server";

import { getCurrentAccount } from "@/lib/server/account-auth";
import type { GameComment } from "@/lib/game-types";

const COMMENT_COLUMNS = "id,game_id,parent_id,author_id,author_name,author_avatar,content,created_at";

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

function encodeFilter(value: string): string {
  return encodeURIComponent(value);
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatSupabaseError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error && "cause" in err ? String((err as { cause?: unknown }).cause ?? "") : "";
  const details = `${message} ${cause}`;
  if (/getaddrinfo|EAI_AGAIN|ENOTFOUND/i.test(details)) return "Supabase 域名解析失败，请检查当前 Next 运行环境的网络/DNS。";
  if (/fetch failed/i.test(message)) return "无法连接 Supabase，请检查当前 Next 运行环境是否能访问 Supabase。";
  return message;
}

function isMissingTableError(message: string): boolean {
  return /game_hall_comments|game_hall_games/i.test(message)
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
    if (isMissingTableError(message)) {
      return {
        ok: false,
        error: "游戏评论表尚未创建：请先在 Supabase SQL Editor 执行 docs/game-hall-supabase.sql。",
        status: response.status,
      };
    }
    return { ok: false, error: message, status: response.status };
  }
  return { ok: true, data: data as T, status: response.status };
}

function normalizeComment(value: unknown): GameComment | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = cleanText(record.id, 160);
  const gameId = cleanText(record.game_id ?? record.gameId, 160);
  const parentId = cleanText(record.parent_id ?? record.parentId, 160);
  const authorId = cleanText(record.author_id ?? record.authorId, 160);
  const authorName = cleanText(record.author_name ?? record.authorName, 80);
  const content = cleanText(record.content, 600);
  if (!id || !gameId || !authorId || !authorName || !content) return null;
  return {
    id,
    gameId,
    parentId: parentId || undefined,
    authorId,
    authorName,
    authorAvatar: cleanText(record.author_avatar ?? record.authorAvatar, 2000),
    content,
    createdAt: cleanText(record.created_at ?? record.createdAt, 80) || new Date().toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const gameId = cleanText(url.searchParams.get("gameId"), 160);
    if (!gameId) return NextResponse.json({ ok: false, error: "missing_game_id", comments: [] }, { status: 400 });
    const result = await supabaseFetch<unknown[]>(
      `game_hall_comments?game_id=eq.${encodeFilter(gameId)}&deleted_at=is.null&select=${COMMENT_COLUMNS}&order=created_at.asc&limit=80`,
    );
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error, comments: [] }, { status: result.status });
    return NextResponse.json({ ok: true, comments: result.data.map(normalizeComment).filter(Boolean) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: formatSupabaseError(err), comments: [] }, { status: getSupabaseConfig() ? 500 : 503 });
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
    const gameId = cleanText(record.gameId ?? record.game_id, 160);
    const parentId = cleanText(record.parentId ?? record.parent_id, 160);
    const content = cleanText(record.content, 600);
    if (!gameId || !content) {
      return NextResponse.json({ ok: false, error: "missing_required_comment_fields" }, { status: 400 });
    }
    if (parentId) {
      const parentResult = await supabaseFetch<unknown[]>(
        `game_hall_comments?id=eq.${encodeFilter(parentId)}&game_id=eq.${encodeFilter(gameId)}&deleted_at=is.null&select=id&limit=1`,
      );
      if (!parentResult.ok) return NextResponse.json({ ok: false, error: parentResult.error }, { status: parentResult.status });
      if (!parentResult.data[0]) return NextResponse.json({ ok: false, error: "回复的评论不存在或已被删除。" }, { status: 404 });
    }
    const insertResult = await supabaseFetch<unknown[]>(
      `game_hall_comments?select=${COMMENT_COLUMNS}`,
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          id: createId("game_comment"),
          game_id: gameId,
          parent_id: parentId || null,
          author_id: account.id,
          author_name: cleanText(record.authorName ?? record.author_name, 80) || account.displayName,
          author_avatar: cleanText(record.authorAvatar ?? record.author_avatar, 2000),
          content,
        }),
      },
    );
    if (!insertResult.ok) return NextResponse.json({ ok: false, error: insertResult.error }, { status: insertResult.status });
    const comment = normalizeComment(insertResult.data[0]);
    if (!comment) return NextResponse.json({ ok: false, error: "评论写入失败。" }, { status: 500 });

    const gameResult = await supabaseFetch<unknown[]>(
      `game_hall_games?id=eq.${encodeFilter(gameId)}&deleted_at=is.null&select=comment_count`,
    );
    const current = gameResult.ok ? Number((gameResult.data[0] as Record<string, unknown> | undefined)?.comment_count ?? 0) : 0;
    const commentCount = Math.max(0, Math.round(current)) + 1;
    const updateResult = await supabaseFetch<unknown[]>(
      `game_hall_games?id=eq.${encodeFilter(gameId)}&deleted_at=is.null&select=id`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ comment_count: commentCount, updated_at: new Date().toISOString() }),
      },
    );
    if (!updateResult.ok) return NextResponse.json({ ok: false, error: updateResult.error }, { status: updateResult.status });
    return NextResponse.json({ ok: true, comment, commentCount });
  } catch (err) {
    return NextResponse.json({ ok: false, error: formatSupabaseError(err) }, { status: getSupabaseConfig() ? 400 : 503 });
  }
}

function collectCommentSubtreeIds(seedId: string, comments: Array<{ id?: unknown; parent_id?: unknown; parentId?: unknown }>): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const record of comments) {
    const id = cleanText(record.id, 160);
    const parentId = cleanText(record.parent_id ?? record.parentId, 160);
    if (!id || !parentId) continue;
    const list = childrenByParent.get(parentId) ?? [];
    list.push(id);
    childrenByParent.set(parentId, list);
  }

  const ids: string[] = [];
  const seen = new Set<string>();
  const stack = [seedId];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    const children = childrenByParent.get(id) ?? [];
    for (const childId of children) stack.push(childId);
  }
  return ids;
}

export async function DELETE(request: Request) {
  try {
    const account = await getCurrentAccount(request);
    if (!account) {
      return NextResponse.json({ ok: false, error: "请先登录账号。" }, { status: 401 });
    }
    const body = await request.json();
    const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const commentId = cleanText(record.commentId ?? record.id, 160);
    if (!commentId) {
      return NextResponse.json({ ok: false, error: "missing_comment_id" }, { status: 400 });
    }

    const targetResult = await supabaseFetch<unknown[]>(
      `game_hall_comments?id=eq.${encodeFilter(commentId)}&deleted_at=is.null&select=id,game_id,author_id&limit=1`,
    );
    if (!targetResult.ok) return NextResponse.json({ ok: false, error: targetResult.error }, { status: targetResult.status });
    const target = targetResult.data[0] as Record<string, unknown> | undefined;
    const gameId = cleanText(target?.game_id, 160);
    const targetAuthorId = cleanText(target?.author_id, 160);
    if (!target || !gameId || !targetAuthorId) {
      return NextResponse.json({ ok: false, error: "评论不存在或已删除。" }, { status: 404 });
    }

    const gameResult = await supabaseFetch<unknown[]>(
      `game_hall_games?id=eq.${encodeFilter(gameId)}&deleted_at=is.null&select=author_id,comment_count&limit=1`,
    );
    if (!gameResult.ok) return NextResponse.json({ ok: false, error: gameResult.error }, { status: gameResult.status });
    const game = gameResult.data[0] as Record<string, unknown> | undefined;
    const gameAuthorId = cleanText(game?.author_id, 160);
    if (!game || !gameAuthorId) {
      return NextResponse.json({ ok: false, error: "游戏不存在或已删除。" }, { status: 404 });
    }
    if (targetAuthorId !== account.id && gameAuthorId !== account.id) {
      return NextResponse.json({ ok: false, error: "没有权限删除这条评论。" }, { status: 403 });
    }

    const allCommentsResult = await supabaseFetch<Array<{ id?: unknown; parent_id?: unknown }>>(
      `game_hall_comments?game_id=eq.${encodeFilter(gameId)}&deleted_at=is.null&select=id,parent_id`,
    );
    if (!allCommentsResult.ok) {
      return NextResponse.json({ ok: false, error: allCommentsResult.error }, { status: allCommentsResult.status });
    }
    const deleteIds = collectCommentSubtreeIds(commentId, allCommentsResult.data);
    if (deleteIds.length === 0) {
      return NextResponse.json({ ok: false, error: "评论不存在或已删除。" }, { status: 404 });
    }

    const deletedAt = new Date().toISOString();
    const deleteResult = await supabaseFetch<Array<{ id?: unknown }>>(
      `game_hall_comments?id=in.(${deleteIds.map(encodeFilter).join(",")})&deleted_at=is.null&select=id`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ deleted_at: deletedAt }),
      },
    );
    if (!deleteResult.ok) return NextResponse.json({ ok: false, error: deleteResult.error }, { status: deleteResult.status });
    const deletedIds = deleteResult.data.map(item => cleanText(item.id, 160)).filter(Boolean);
    const current = Number(game.comment_count ?? 0);
    const commentCount = Math.max(0, Math.round(Number.isFinite(current) ? current : 0) - deletedIds.length);
    const updateResult = await supabaseFetch<unknown[]>(
      `game_hall_games?id=eq.${encodeFilter(gameId)}&deleted_at=is.null&select=id`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ comment_count: commentCount, updated_at: new Date().toISOString() }),
      },
    );
    if (!updateResult.ok) return NextResponse.json({ ok: false, error: updateResult.error }, { status: updateResult.status });
    return NextResponse.json({ ok: true, gameId, deletedIds, commentCount });
  } catch (err) {
    return NextResponse.json({ ok: false, error: formatSupabaseError(err) }, { status: getSupabaseConfig() ? 400 : 503 });
  }
}
