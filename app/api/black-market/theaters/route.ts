import { NextResponse } from "next/server";

import type { BlackMarketRenderRule, BlackMarketTheaterRarity, BlackMarketTheaterTemplate } from "@/lib/black-market-types";
import { getCurrentAccount } from "@/lib/server/account-auth";

const REST_THEATER_SUMMARY_COLUMNS = "id,title,code_name,file_number,subtitle,synopsis,tags,rarity,glyph,price,author_id,author_name,source,version,duration_turns,allow_external_control,purchase_count,rating,created_at,updated_at";
const REST_THEATER_COLUMNS = `${REST_THEATER_SUMMARY_COLUMNS},story_text,opening_html,ai_instruction,output_contract,render_rules,render_css,memory_summary_prompt`;

const REST_SELECT_THEATERS = [
  `select=${REST_THEATER_SUMMARY_COLUMNS}`,
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

function isMissingBlackMarketTableError(message: string): boolean {
  return /black_market_theaters|allow_external_control|file_number/i.test(message) && /schema cache|Could not find the table|Could not find.*column|PGRST204|PGRST205|does not exist/i.test(message);
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
    if (isMissingBlackMarketTableError(message)) {
      return {
        ok: false,
        error: "黑市共享表尚未创建或字段未更新：请先在 Supabase SQL Editor 执行 docs/black-market-supabase.sql。",
        status: response.status,
      };
    }
    return { ok: false, error: message, status: response.status };
  }
  return { ok: true, data: data as T, status: response.status };
}

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
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return normalizeTags(parsed);
    } catch {
      return value.split(/[,\s，、]+/).map(item => cleanText(item, 24)).filter(Boolean).slice(0, 8);
    }
  }
  return [];
}

function normalizeRarity(value: unknown): BlackMarketTheaterRarity {
  return value === "rare" || value === "legend" || value === "encrypted" ? value : "common";
}

function normalizeBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeRenderRule(value: unknown): BlackMarketRenderRule | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = cleanText(record.id, 80);
  const pattern = cleanText(record.pattern, 1000);
  if (!id || !pattern) return null;
  return {
    id,
    name: cleanText(record.name, 80) || "渲染规则",
    pattern,
    flags: cleanText(record.flags, 12) || "g",
    className: cleanText(record.className, 120) || "bm-render-rule",
    template: cleanText(record.template, 2000) || "<span>$&</span>",
  };
}

function normalizeRenderRules(value: unknown): BlackMarketRenderRule[] {
  if (Array.isArray(value)) return value.map(normalizeRenderRule).filter(Boolean) as BlackMarketRenderRule[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return normalizeRenderRules(parsed);
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeTheater(raw: unknown, options: { requireScenePackage?: boolean } = {}): BlackMarketTheaterTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = cleanText(record.id, 160);
  const title = cleanText(record.title, 80);
  const openingHtml = cleanText(record.opening_html ?? record.openingHtml, 60000);
  const aiInstruction = cleanText(record.ai_instruction ?? record.aiInstruction, 30000);
  if (!id || !title || (options.requireScenePackage && (!openingHtml || !aiInstruction))) return null;
  return {
    id,
    title,
    codeName: cleanText(record.code_name ?? record.codeName, 80) || id.toUpperCase(),
    fileNumber: cleanText(record.file_number ?? record.fileNumber, 80),
    subtitle: cleanText(record.subtitle, 160),
    synopsis: cleanText(record.synopsis, 600),
    storyText: cleanText(record.story_text ?? record.storyText, 2000),
    tags: normalizeTags(record.tags),
    rarity: normalizeRarity(record.rarity),
    glyph: cleanText(record.glyph, 8) || "◆",
    price: clampNumber(record.price, 0, 500, 0),
    authorId: cleanText(record.author_id ?? record.authorId, 160) || "anonymous",
    authorName: cleanText(record.author_name ?? record.authorName, 80) || "匿名卖家",
    source: "community",
    version: clampNumber(record.version, 1, 9999, 1),
    durationTurns: clampNumber(record.duration_turns ?? record.durationTurns, 1, 30, 8),
    allowExternalControl: normalizeBoolean(record.allow_external_control ?? record.allowExternalControl),
    openingHtml,
    aiInstruction,
    outputContract: cleanText(record.output_contract ?? record.outputContract, 12000),
    renderRules: normalizeRenderRules(record.render_rules ?? record.renderRules).slice(0, 20),
    renderCss: cleanText(record.render_css ?? record.renderCss, 20000),
    memorySummaryPrompt: cleanText(record.memory_summary_prompt ?? record.memorySummaryPrompt, 12000),
    purchaseCount: clampNumber(record.purchase_count ?? record.purchaseCount, 0, Number.MAX_SAFE_INTEGER, 0),
    rating: Math.min(5, Math.max(0, Number(record.rating) || 0)),
    createdAt: cleanText(record.created_at ?? record.createdAt, 80) || new Date().toISOString(),
    updatedAt: cleanText(record.updated_at ?? record.updatedAt, 80) || new Date().toISOString(),
  };
}

function buildInsertPayload(input: Record<string, unknown>): Record<string, unknown> {
  const now = new Date().toISOString();
  const id = cleanText(input.id, 160) || `bm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const title = cleanText(input.title, 80);
  const openingHtml = cleanText(input.openingHtml ?? input.opening_html, 60000);
  const fileNumber = cleanText(input.fileNumber ?? input.file_number, 80);
  const aiInstruction = cleanText(input.aiInstruction ?? input.ai_instruction, 30000);
  if (!title || !openingHtml || !aiInstruction) {
    throw new Error("missing_required_theater_fields");
  }
  return {
    id,
    title,
    code_name: cleanText(input.codeName ?? input.code_name, 80) || id.toUpperCase(),
    subtitle: cleanText(input.subtitle, 160),
    synopsis: cleanText(input.synopsis, 600),
    story_text: cleanText(input.storyText ?? input.story_text, 2000),
    tags: normalizeTags(input.tags),
    rarity: normalizeRarity(input.rarity),
    glyph: cleanText(input.glyph, 8) || "◆",
    price: clampNumber(input.price, 0, 500, 0),
    author_id: cleanText(input.authorId ?? input.author_id, 160) || "local_user",
    author_name: cleanText(input.authorName ?? input.author_name, 80) || "匿名卖家",
    source: "community",
    version: clampNumber(input.version, 1, 9999, 1),
    duration_turns: clampNumber(input.durationTurns ?? input.duration_turns, 1, 30, 8),
    allow_external_control: normalizeBoolean(input.allowExternalControl ?? input.allow_external_control),
    file_number: fileNumber,
    opening_html: openingHtml,
    ai_instruction: aiInstruction,
    output_contract: cleanText(input.outputContract ?? input.output_contract, 12000),
    render_rules: normalizeRenderRules(input.renderRules ?? input.render_rules),
    render_css: cleanText(input.renderCss ?? input.render_css, 20000),
    memory_summary_prompt: cleanText(input.memorySummaryPrompt ?? input.memory_summary_prompt, 12000),
    purchase_count: 0,
    rating: 0,
    created_at: now,
    updated_at: now,
  };
}

function buildUpdatePayload(input: Record<string, unknown>): { id: string; authorId: string; payload: Record<string, unknown> } {
  const id = cleanText(input.id, 160);
  const authorId = cleanText(input.authorId ?? input.author_id, 160);
  const title = cleanText(input.title, 80);
  const openingHtml = cleanText(input.openingHtml ?? input.opening_html, 60000);
  const fileNumber = cleanText(input.fileNumber ?? input.file_number, 80);
  const aiInstruction = cleanText(input.aiInstruction ?? input.ai_instruction, 30000);
  if (!id || !authorId || !title || !openingHtml || !aiInstruction) {
    throw new Error("missing_required_theater_fields");
  }
  return {
    id,
    authorId,
    payload: {
      title,
      code_name: cleanText(input.codeName ?? input.code_name, 80) || id.toUpperCase(),
      subtitle: cleanText(input.subtitle, 160),
      synopsis: cleanText(input.synopsis, 600),
      story_text: cleanText(input.storyText ?? input.story_text, 2000),
      tags: normalizeTags(input.tags),
      rarity: normalizeRarity(input.rarity),
      glyph: cleanText(input.glyph, 8) || "◆",
      price: clampNumber(input.price, 0, 500, 0),
      author_name: cleanText(input.authorName ?? input.author_name, 80) || "匿名卖家",
      source: "community",
      version: clampNumber(input.version, 1, 9999, 1),
      duration_turns: clampNumber(input.durationTurns ?? input.duration_turns, 1, 30, 8),
      allow_external_control: normalizeBoolean(input.allowExternalControl ?? input.allow_external_control),
      file_number: fileNumber,
      opening_html: openingHtml,
      ai_instruction: aiInstruction,
      output_contract: cleanText(input.outputContract ?? input.output_contract, 12000),
      render_rules: normalizeRenderRules(input.renderRules ?? input.render_rules),
      render_css: cleanText(input.renderCss ?? input.render_css, 20000),
      memory_summary_prompt: cleanText(input.memorySummaryPrompt ?? input.memory_summary_prompt, 12000),
      updated_at: new Date().toISOString(),
    },
  };
}

function encodeFilter(value: string): string {
  return encodeURIComponent(value);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requestedId = cleanText(url.searchParams.get("id"), 160);
    if (requestedId) {
      const result = await supabaseFetch<unknown[]>(
        `black_market_theaters?id=eq.${encodeFilter(requestedId)}&deleted_at=is.null&select=${REST_THEATER_COLUMNS}&limit=1`,
      );
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
      }
      const theater = normalizeTheater(result.data[0], { requireScenePackage: true });
      if (!theater) {
        return NextResponse.json({ ok: false, error: "没有找到夜间档案。" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, theater });
    }
    const result = await supabaseFetch<unknown[]>(`black_market_theaters?${REST_SELECT_THEATERS}`);
    if (!result.ok) {
      if (/black-market-supabase\.sql/.test(result.error)) {
        return NextResponse.json({ ok: true, theaters: [], setupRequired: true, error: result.error });
      }
      return NextResponse.json({ ok: false, error: result.error, theaters: [] }, { status: result.status });
    }
    const theaters = result.data.map(item => normalizeTheater(item)).filter(Boolean) as BlackMarketTheaterTemplate[];
    return NextResponse.json({ ok: true, theaters });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: formatSupabaseError(err), theaters: [] },
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
    const payload = buildInsertPayload({
      ...record,
      authorId: account.id,
      authorName: cleanText(record.authorName ?? record.author_name, 80) || account.displayName,
    });
    const result = await supabaseFetch<unknown[]>(
      `black_market_theaters?select=${REST_THEATER_COLUMNS}`,
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
    return NextResponse.json({ ok: true, theater: normalizeTheater(result.data[0]) });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: formatSupabaseError(err) },
      { status: getSupabaseConfig() ? 400 : 503 },
    );
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
    const { id, authorId, payload } = buildUpdatePayload({
      ...record,
      authorId: account.id,
      authorName: cleanText(record.authorName ?? record.author_name, 80) || account.displayName,
    });
    const result = await supabaseFetch<unknown[]>(
      `black_market_theaters?id=eq.${encodeFilter(id)}&author_id=eq.${encodeFilter(authorId)}&deleted_at=is.null&select=${REST_THEATER_COLUMNS}`,
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
    const theater = normalizeTheater(result.data[0]);
    if (!theater) {
      return NextResponse.json({ ok: false, error: "没有找到可修改的已发布档案。" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, theater });
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
    const body = await request.json().catch(() => ({}));
    const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const id = cleanText(record.id, 160);
    const authorId = account.id;
    if (!id || !authorId) {
      return NextResponse.json({ ok: false, error: "missing_required_theater_fields" }, { status: 400 });
    }
    const now = new Date().toISOString();
    const result = await supabaseFetch<unknown[]>(
      `black_market_theaters?id=eq.${encodeFilter(id)}&author_id=eq.${encodeFilter(authorId)}&deleted_at=is.null&select=id`,
      {
        method: "PATCH",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify({ deleted_at: now, updated_at: now }),
      },
    );
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }
    if (!Array.isArray(result.data) || result.data.length === 0) {
      return NextResponse.json({ ok: false, error: "没有找到可删除的已发布档案。" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: formatSupabaseError(err) },
      { status: getSupabaseConfig() ? 400 : 503 },
    );
  }
}
