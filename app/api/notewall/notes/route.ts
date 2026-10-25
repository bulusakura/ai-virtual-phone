import { NextResponse } from "next/server";

import { getCurrentAccount } from "@/lib/server/account-auth";
import {
  DEFAULT_NOTE_WALL_BOARD,
  NOTE_WALL_BOARD_ID,
  type NoteWallBoard,
} from "@/lib/notewall-types";
import {
  buildNoteWallInsertPayload,
  buildNoteWallPatchPayload,
  getBoardSizeForNotes,
  normalizeNoteWallBoard,
  normalizeNoteWallNote,
} from "@/lib/notewall-utils";

const REST_SELECT_NOTES = "select=id,board_id,author_type,author_id,author_name,is_anonymous,summary,body,x,y,width,height,size,paper,tape,font,decoration,raw_css,safe_style,created_by,updated_by,deleted_by,deleted_at,created_at,updated_at";
const REST_SELECT_BOARD = "select=id,title,width,height,created_at,updated_at";
const REST_SELECT_COMMENT_NOTE_IDS = "select=note_id";

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

async function ensureBoard(): Promise<NoteWallBoard> {
  const config = getSupabaseConfig();
  if (!config) throw new Error("missing_supabase_env");

  await fetchSupabaseWithRetry(`${config.url}/rest/v1/note_wall_boards?on_conflict=id`, {
    method: "POST",
    headers: supabaseHeaders(config, "resolution=merge-duplicates,return=minimal"),
    body: JSON.stringify(DEFAULT_NOTE_WALL_BOARD),
    cache: "no-store",
  });

  const result = await supabaseFetch<unknown[]>(`note_wall_boards?id=eq.${encodeURIComponent(NOTE_WALL_BOARD_ID)}&${REST_SELECT_BOARD}`);
  if (!result.ok) throw new Error(result.error);
  return normalizeNoteWallBoard(result.data[0] ?? DEFAULT_NOTE_WALL_BOARD);
}

async function updateBoardSize(board: NoteWallBoard, notes: ReturnType<typeof normalizeNoteWallNote>[]): Promise<NoteWallBoard> {
  const normalizedNotes = notes.filter(Boolean) as NonNullable<ReturnType<typeof normalizeNoteWallNote>>[];
  const nextBoard = getBoardSizeForNotes(board, normalizedNotes);
  if (nextBoard.width === board.width && nextBoard.height === board.height) return board;

  const result = await supabaseFetch<unknown[]>(
    `note_wall_boards?id=eq.${encodeURIComponent(board.id)}&${REST_SELECT_BOARD}`,
    {
      method: "PATCH",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        width: nextBoard.width,
        height: nextBoard.height,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!result.ok) return nextBoard;
  return normalizeNoteWallBoard(result.data[0] ?? nextBoard);
}

async function loadNotesAndBoard(): Promise<{ board: NoteWallBoard; notes: NonNullable<ReturnType<typeof normalizeNoteWallNote>>[] }> {
  const board = await ensureBoard();
  const result = await supabaseFetch<unknown[]>(
    `note_wall_notes?board_id=eq.${encodeURIComponent(board.id)}&deleted_at=is.null&order=created_at.asc&${REST_SELECT_NOTES}`,
  );
  if (!result.ok) throw new Error(result.error);
  const notes = result.data.map(normalizeNoteWallNote).filter(Boolean) as NonNullable<ReturnType<typeof normalizeNoteWallNote>>[];
  if (notes.length === 0) return { board: getBoardSizeForNotes(board, notes), notes };

  const commentResult = await supabaseFetch<Array<{ note_id?: unknown }>>(
    `note_wall_comments?note_id=in.(${notes.map(note => note.id).join(",")})&deleted_at=is.null&${REST_SELECT_COMMENT_NOTE_IDS}`,
  );
  if (!commentResult.ok) {
    return { board: getBoardSizeForNotes(board, notes), notes };
  }

  const commentCounts = new Map<string, number>();
  for (const comment of commentResult.data) {
    const noteId = typeof comment.note_id === "string" ? comment.note_id : "";
    if (!noteId) continue;
    commentCounts.set(noteId, (commentCounts.get(noteId) ?? 0) + 1);
  }
  const notesWithCounts = notes.map(note => ({
    ...note,
    commentCount: commentCounts.get(note.id) ?? 0,
  }));
  return { board: getBoardSizeForNotes(board, notesWithCounts), notes: notesWithCounts };
}

export async function GET() {
  try {
    const { board, notes } = await loadNotesAndBoard();
    return NextResponse.json({ ok: true, board, notes });
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
    const board = await ensureBoard();
    const body = await request.json();
    const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const authorType = record.authorType === "character" || record.author_type === "character";
    const payload = buildNoteWallInsertPayload({
      ...record,
      boardId: board.id,
      actorId: account.id,
      ...(authorType ? {} : { authorId: account.id, authorName: account.displayName }),
    } as Parameters<typeof buildNoteWallInsertPayload>[0]);
    const result = await supabaseFetch<unknown[]>(
      `note_wall_notes?${REST_SELECT_NOTES}`,
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

    const note = normalizeNoteWallNote(result.data[0]);
    const nextBoard = note ? await updateBoardSize(board, [note]) : board;
    return NextResponse.json({ ok: true, board: nextBoard, note });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: formatSupabaseError(err) },
      { status: getSupabaseConfig() ? 400 : 503 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const account = await getCurrentAccount(request);
    if (!account) {
      return NextResponse.json({ ok: false, error: "请先登录账号。" }, { status: 401 });
    }
    const body = await request.json();
    const id = typeof body?.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ ok: false, error: "missing_note_id" }, { status: 400 });

    const payload = buildNoteWallPatchPayload({ ...body, actorId: account.id });
    const result = await supabaseFetch<unknown[]>(
      `note_wall_notes?id=eq.${encodeURIComponent(id)}&created_by=eq.${encodeURIComponent(account.id)}&deleted_at=is.null&${REST_SELECT_NOTES}`,
      {
        method: "PATCH",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify(payload),
      },
    );
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }

    const note = normalizeNoteWallNote(result.data[0]);
    if (!note) return NextResponse.json({ ok: false, error: "没有找到可修改的便签。" }, { status: 404 });
    const { board } = await loadNotesAndBoard();
    const nextBoard = note ? await updateBoardSize(board, [note]) : board;
    return NextResponse.json({ ok: true, board: nextBoard, note });
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
    if (!id) return NextResponse.json({ ok: false, error: "missing_note_id" }, { status: 400 });

    const result = await supabaseFetch<unknown[]>(
      `note_wall_notes?id=eq.${encodeURIComponent(id)}&created_by=eq.${encodeURIComponent(account.id)}&${REST_SELECT_NOTES}`,
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
    const note = normalizeNoteWallNote(result.data[0]);
    if (!note) return NextResponse.json({ ok: false, error: "没有找到可删除的便签。" }, { status: 404 });
    return NextResponse.json({ ok: true, note });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: formatSupabaseError(err) },
      { status: getSupabaseConfig() ? 400 : 503 },
    );
  }
}
