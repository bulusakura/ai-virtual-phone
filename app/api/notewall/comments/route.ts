import { NextResponse } from "next/server";

import { getCurrentAccount } from "@/lib/server/account-auth";
import {
  buildNoteWallCommentInsertPayload,
  normalizeNoteWallComment,
} from "@/lib/notewall-utils";

const REST_SELECT_COMMENTS = "select=id,note_id,author_id,author_name,body,is_anonymous,created_by,deleted_by,deleted_at,created_at,updated_at";

function getSupabaseConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

function supabaseHeaders(config: { key: string }, prefer?: string): HeadersInit {
  return {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

function formatSupabaseError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error && "cause" in err ? String((err as { cause?: unknown }).cause ?? "") : "";
  const details = `${message} ${cause}`;
  if (/getaddrinfo|EAI_AGAIN|ENOTFOUND/i.test(details)) {
    return "Supabase 域名解析失败，请检查当前 Next 运行环境的网络/DNS。";
  }
  if (/fetch failed/i.test(message)) {
    return "无法连接 Supabase，请检查当前 Next 运行环境是否能访问 Supabase。";
  }
  return message;
}

function isTransientSupabaseError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error && "cause" in err ? String((err as { cause?: unknown }).cause ?? "") : "";
  return /fetch failed|getaddrinfo|EAI_AGAIN|ENOTFOUND|ECONNRESET|ETIMEDOUT/i.test(`${message} ${cause}`);
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchSupabaseWithRetry(url: string, init?: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (err) {
      lastError = err;
      if (!isTransientSupabaseError(err) || attempt === 2) break;
      await wait(350 * (attempt + 1));
    }
  }
  throw lastError;
}

async function supabaseFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T; status: number } | { ok: false; error: string; status: number }> {
  const config = getSupabaseConfig();
  if (!config) {
    return { ok: false, error: "missing_supabase_env", status: 503 };
  }

  const response = await fetchSupabaseWithRetry(`${config.url}/rest/v1/${path}`, {
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
    return { ok: false, error: message, status: response.status };
  }
  return { ok: true, data: data as T, status: response.status };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const noteId = url.searchParams.get("noteId") ?? "";
    const mine = url.searchParams.get("mine") === "1";
    if (!noteId && !mine) {
      return NextResponse.json({ ok: false, error: "missing_note_id" }, { status: 400 });
    }

    let query = `note_wall_comments?note_id=eq.${encodeURIComponent(noteId)}&deleted_at=is.null&order=created_at.asc&${REST_SELECT_COMMENTS}`;
    if (mine) {
      const account = await getCurrentAccount(request);
      if (!account) {
        return NextResponse.json({ ok: false, error: "请先登录账号。" }, { status: 401 });
      }
      query = `note_wall_comments?created_by=eq.${encodeURIComponent(account.id)}&deleted_at=is.null&order=created_at.desc&${REST_SELECT_COMMENTS}`;
    }

    const result = await supabaseFetch<unknown[]>(query);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }

    const comments = result.data.map(normalizeNoteWallComment).filter(Boolean);
    return NextResponse.json({ ok: true, comments });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: formatSupabaseError(err) },
      { status: getSupabaseConfig() ? 500 : 503 },
    );
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
    const authorType = record.authorType === "character" || record.author_type === "character";
    const payload = buildNoteWallCommentInsertPayload({
      ...record,
      actorId: account.id,
      ...(authorType ? {} : { authorId: account.id, authorName: account.displayName }),
    } as Parameters<typeof buildNoteWallCommentInsertPayload>[0]);
    if (!payload.note_id || !payload.body) {
      return NextResponse.json({ ok: false, error: "missing_comment_body" }, { status: 400 });
    }

    const result = await supabaseFetch<unknown[]>(
      `note_wall_comments?${REST_SELECT_COMMENTS}`,
      {
        method: "POST",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify(payload),
      },
    );
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true, comment: normalizeNoteWallComment(result.data[0]) });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: formatSupabaseError(err) },
      { status: getSupabaseConfig() ? 400 : 503 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const account = await getCurrentAccount(request);
    if (!account) {
      return NextResponse.json({ ok: false, error: "请先登录账号。" }, { status: 401 });
    }
    const url = new URL(request.url);
    let id = url.searchParams.get("id") ?? "";
    if (!id) {
      const body = await request.json().catch(() => null);
      id = typeof body?.id === "string" ? body.id : "";
    }
    if (!id) return NextResponse.json({ ok: false, error: "missing_comment_id" }, { status: 400 });

    const result = await supabaseFetch<unknown[]>(
      `note_wall_comments?id=eq.${encodeURIComponent(id)}&created_by=eq.${encodeURIComponent(account.id)}&${REST_SELECT_COMMENTS}`,
      {
        method: "PATCH",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          deleted_at: new Date().toISOString(),
          deleted_by: account.id,
          updated_at: new Date().toISOString(),
        }),
      },
    );
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }
    const comment = normalizeNoteWallComment(result.data[0]);
    if (!comment) return NextResponse.json({ ok: false, error: "没有找到可删除的评论。" }, { status: 404 });
    return NextResponse.json({ ok: true, comment });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: formatSupabaseError(err) },
      { status: getSupabaseConfig() ? 400 : 503 },
    );
  }
}
