import { NextResponse } from "next/server";

import { getCurrentAccount } from "@/lib/server/account-auth";

const GAME_HALL_ASSET_BUCKET = "game-hall-assets";
const MAX_ASSET_BYTES = 900 * 1024;

function getSupabaseConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function safeFilename(value: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "image.webp";
}

function extensionForType(type: string, fallbackName: string): string {
  if (type === "image/webp") return "webp";
  if (type === "image/png") return "png";
  if (type === "image/jpeg" || type === "image/jpg") return "jpg";
  const match = fallbackName.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || "webp";
}

function formatSupabaseError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error && "cause" in err ? String((err as { cause?: unknown }).cause ?? "") : "";
  const details = `${message} ${cause}`;
  if (/getaddrinfo|EAI_AGAIN|ENOTFOUND/i.test(details)) return "Supabase 域名解析失败，请检查当前 Next 运行环境的网络/DNS。";
  if (/fetch failed/i.test(message)) return "无法连接 Supabase Storage，请检查当前 Next 运行环境是否能访问 Supabase。";
  return message;
}

export async function POST(request: Request) {
  try {
    const config = getSupabaseConfig();
    if (!config) return NextResponse.json({ ok: false, error: "missing_supabase_env" }, { status: 503 });
    const account = await getCurrentAccount(request);
    if (!account) {
      return NextResponse.json({ ok: false, error: "请先登录账号。" }, { status: 401 });
    }
    const formData = await request.formData();
    const file = formData.get("file");
    const kind = cleanText(formData.get("kind"), 24) === "avatar" ? "avatar" : "cover";
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "missing_image_file" }, { status: 400 });
    }
    if (!["image/webp", "image/png", "image/jpeg", "image/jpg"].includes(file.type)) {
      return NextResponse.json({ ok: false, error: "只支持 WebP、PNG、JPG 图片。" }, { status: 400 });
    }
    if (file.size > MAX_ASSET_BYTES) {
      return NextResponse.json({ ok: false, error: "图片过大，请压缩到 900KB 以内。" }, { status: 400 });
    }
    const ext = extensionForType(file.type, file.name);
    const baseName = safeFilename(file.name).replace(/\.[a-z0-9]+$/, "");
    const ownerPath = safeFilename(account.id);
    const path = `${kind}s/${ownerPath}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${baseName}.${ext}`;
    const bytes = await file.arrayBuffer();
    const upload = await fetch(`${config.url}/storage/v1/object/${GAME_HALL_ASSET_BUCKET}/${path}`, {
      method: "POST",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Content-Type": file.type,
        "x-upsert": "true",
      },
      body: bytes,
    });
    const text = await upload.text();
    if (!upload.ok) {
      let message = text || upload.statusText;
      try {
        const parsed = JSON.parse(text) as { message?: string; error?: string };
        message = parsed.message || parsed.error || message;
      } catch {
        // ignore non-json storage errors
      }
      if (/bucket/i.test(message)) {
        message = "游戏图片存储桶尚未创建：请先在 Supabase SQL Editor 执行 docs/game-hall-supabase.sql。";
      }
      return NextResponse.json({ ok: false, error: message }, { status: upload.status });
    }
    const url = `${config.url}/storage/v1/object/public/${GAME_HALL_ASSET_BUCKET}/${path}`;
    return NextResponse.json({ ok: true, path, url });
  } catch (err) {
    return NextResponse.json({ ok: false, error: formatSupabaseError(err) }, { status: getSupabaseConfig() ? 400 : 503 });
  }
}
