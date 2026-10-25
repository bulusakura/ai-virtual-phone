import { NextResponse } from "next/server";

import { getCurrentAccount } from "@/lib/server/account-auth";
import { getMixologySupabaseConfig, mixologyRestFetch } from "@/lib/server/mixology-supabase";

// 独家特调 · 评论 API：材料与配方共用，target_type + target_id 定位，支持楼中楼。

const COMMENT_COLUMNS = "id,target_type,target_id,parent_id,author_id,author_name,content,created_at";

type HallType = "material" | "recipe";

const COUNT_TABLES: Record<HallType, string> = {
  material: "mixology_items",
  recipe: "mixology_recipes",
};

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function encodeFilter(value: string): string {
  return encodeURIComponent(value);
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseType(value: unknown): HallType | null {
  return value === "material" || value === "recipe" ? value : null;
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
  return /mixology_comments|mixology_items|mixology_recipes/i.test(message)
    && /schema cache|Could not find the table|Could not find.*column|PGRST204|PGRST205|does not exist/i.test(message);
}

async function supabaseFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T; status: number } | { ok: false; error: string; status: number }> {
  // 特调只走特调库：mixologyRestFetch 里没有主库 fallback
  const result = await mixologyRestFetch<T>(path, init);
  if (!result.ok && isMissingTableError(result.error)) {
    return {
      ok: false,
      error: "独家特调共享表尚未创建：请先在特调 Supabase 项目的 SQL Editor 执行 docs/mixology-supabase.sql。",
      status: result.status,
    };
  }
  return result;
}

type HallComment = {
  id: string;
  targetType: HallType;
  targetId: string;
  parentId?: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
};

function normalizeComment(value: unknown): HallComment | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = cleanText(record.id, 160);
  const targetType = parseType(record.target_type ?? record.targetType);
  const targetId = cleanText(record.target_id ?? record.targetId, 160);
  const authorId = cleanText(record.author_id ?? record.authorId, 160);
  const content = cleanText(record.content, 600);
  if (!id || !targetType || !targetId || !authorId || !content) return null;
  const parentId = cleanText(record.parent_id ?? record.parentId, 160);
  return {
    id,
    targetType,
    targetId,
    parentId: parentId || undefined,
    authorId,
    authorName: cleanText(record.author_name ?? record.authorName, 80) || "匿名酒客",
    content,
    createdAt: cleanText(record.created_at ?? record.createdAt, 80) || new Date().toISOString(),
  };
}

async function syncCommentCount(type: HallType, targetId: string, delta: number): Promise<void> {
  const table = COUNT_TABLES[type];
  const current = await supabaseFetch<unknown[]>(
    `${table}?id=eq.${encodeFilter(targetId)}&deleted_at=is.null&select=comment_count`,
  );
  const count = current.ok
    ? Number((current.data[0] as Record<string, unknown> | undefined)?.comment_count ?? 0)
    : 0;
  const next = Math.max(0, Math.round(Number.isFinite(count) ? count : 0) + delta);
  await supabaseFetch<unknown[]>(
    `${table}?id=eq.${encodeFilter(targetId)}&deleted_at=is.null&select=id`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ comment_count: next }),
    },
  );
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const type = parseType(url.searchParams.get("type"));
    const targetId = cleanText(url.searchParams.get("targetId"), 160);
    if (!type || !targetId) {
      return NextResponse.json({ ok: false, error: "missing_target", comments: [] }, { status: 400 });
    }
    const result = await supabaseFetch<unknown[]>(
      `mixology_comments?target_type=eq.${type}&target_id=eq.${encodeFilter(targetId)}&deleted_at=is.null&select=${COMMENT_COLUMNS}&order=created_at.asc&limit=120`,
    );
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error, comments: [] }, { status: result.status });
    return NextResponse.json({ ok: true, comments: result.data.map(normalizeComment).filter(Boolean) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: formatSupabaseError(err), comments: [] }, { status: getMixologySupabaseConfig() ? 500 : 503 });
  }
}

export async function POST(request: Request) {
  try {
    const account = await getCurrentAccount(request);
    if (!account) return NextResponse.json({ ok: false, error: "请先登录账号。" }, { status: 401 });
    const body = await request.json();
    const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const type = parseType(record.type ?? record.targetType);
    const targetId = cleanText(record.targetId ?? record.target_id, 160);
    const parentId = cleanText(record.parentId ?? record.parent_id, 160);
    const content = cleanText(record.content, 600);
    if (!type || !targetId || !content) {
      return NextResponse.json({ ok: false, error: "missing_required_comment_fields" }, { status: 400 });
    }
    const targetResult = await supabaseFetch<unknown[]>(
      `${COUNT_TABLES[type]}?id=eq.${encodeFilter(targetId)}&deleted_at=is.null&select=id&limit=1`,
    );
    if (!targetResult.ok) return NextResponse.json({ ok: false, error: targetResult.error }, { status: targetResult.status });
    if (!targetResult.data[0]) return NextResponse.json({ ok: false, error: "评论对象不存在或已下架。" }, { status: 404 });
    if (parentId) {
      const parentResult = await supabaseFetch<unknown[]>(
        `mixology_comments?id=eq.${encodeFilter(parentId)}&target_id=eq.${encodeFilter(targetId)}&deleted_at=is.null&select=id&limit=1`,
      );
      if (!parentResult.ok) return NextResponse.json({ ok: false, error: parentResult.error }, { status: parentResult.status });
      if (!parentResult.data[0]) return NextResponse.json({ ok: false, error: "回复的评论不存在或已被删除。" }, { status: 404 });
    }
    const insertResult = await supabaseFetch<unknown[]>(
      `mixology_comments?select=${COMMENT_COLUMNS}`,
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          id: createId("mxc"),
          target_type: type,
          target_id: targetId,
          parent_id: parentId || null,
          author_id: account.id,
          author_name: cleanText(record.authorName ?? record.author_name, 80) || account.displayName,
          content,
        }),
      },
    );
    if (!insertResult.ok) return NextResponse.json({ ok: false, error: insertResult.error }, { status: insertResult.status });
    const comment = normalizeComment(insertResult.data[0]);
    if (!comment) return NextResponse.json({ ok: false, error: "评论写入失败。" }, { status: 500 });
    await syncCommentCount(type, targetId, 1);
    return NextResponse.json({ ok: true, comment });
  } catch (err) {
    return NextResponse.json({ ok: false, error: formatSupabaseError(err) }, { status: getMixologySupabaseConfig() ? 400 : 503 });
  }
}

function collectCommentSubtreeIds(seedId: string, comments: Array<{ id?: unknown; parent_id?: unknown }>): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const record of comments) {
    const id = cleanText(record.id, 160);
    const parentId = cleanText(record.parent_id, 160);
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
    for (const childId of childrenByParent.get(id) ?? []) stack.push(childId);
  }
  return ids;
}

export async function DELETE(request: Request) {
  try {
    const account = await getCurrentAccount(request);
    if (!account) return NextResponse.json({ ok: false, error: "请先登录账号。" }, { status: 401 });
    const body = await request.json();
    const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const commentId = cleanText(record.commentId ?? record.id, 160);
    if (!commentId) return NextResponse.json({ ok: false, error: "missing_comment_id" }, { status: 400 });

    const targetResult = await supabaseFetch<unknown[]>(
      `mixology_comments?id=eq.${encodeFilter(commentId)}&deleted_at=is.null&select=id,target_type,target_id,author_id&limit=1`,
    );
    if (!targetResult.ok) return NextResponse.json({ ok: false, error: targetResult.error }, { status: targetResult.status });
    const target = targetResult.data[0] as Record<string, unknown> | undefined;
    const type = parseType(target?.target_type);
    const targetId = cleanText(target?.target_id, 160);
    const commentAuthorId = cleanText(target?.author_id, 160);
    if (!target || !type || !targetId || !commentAuthorId) {
      return NextResponse.json({ ok: false, error: "评论不存在或已删除。" }, { status: 404 });
    }

    const ownerResult = await supabaseFetch<unknown[]>(
      `${COUNT_TABLES[type]}?id=eq.${encodeFilter(targetId)}&deleted_at=is.null&select=author_id&limit=1`,
    );
    if (!ownerResult.ok) return NextResponse.json({ ok: false, error: ownerResult.error }, { status: ownerResult.status });
    const ownerAuthorId = cleanText((ownerResult.data[0] as Record<string, unknown> | undefined)?.author_id, 160);
    if (commentAuthorId !== account.id && ownerAuthorId !== account.id) {
      return NextResponse.json({ ok: false, error: "没有权限删除这条评论。" }, { status: 403 });
    }

    const allCommentsResult = await supabaseFetch<Array<{ id?: unknown; parent_id?: unknown }>>(
      `mixology_comments?target_id=eq.${encodeFilter(targetId)}&deleted_at=is.null&select=id,parent_id`,
    );
    if (!allCommentsResult.ok) {
      return NextResponse.json({ ok: false, error: allCommentsResult.error }, { status: allCommentsResult.status });
    }
    const deleteIds = collectCommentSubtreeIds(commentId, allCommentsResult.data);
    if (deleteIds.length === 0) return NextResponse.json({ ok: false, error: "评论不存在或已删除。" }, { status: 404 });

    const deleteResult = await supabaseFetch<Array<{ id?: unknown }>>(
      `mixology_comments?id=in.(${deleteIds.map(encodeFilter).join(",")})&deleted_at=is.null&select=id`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ deleted_at: new Date().toISOString() }),
      },
    );
    if (!deleteResult.ok) return NextResponse.json({ ok: false, error: deleteResult.error }, { status: deleteResult.status });
    const deletedIds = deleteResult.data.map(item => cleanText(item.id, 160)).filter(Boolean);
    await syncCommentCount(type, targetId, -deletedIds.length);
    return NextResponse.json({ ok: true, targetId, deletedIds });
  } catch (err) {
    return NextResponse.json({ ok: false, error: formatSupabaseError(err) }, { status: getMixologySupabaseConfig() ? 400 : 503 });
  }
}
