import { NextResponse } from "next/server";

import { getCurrentAccount } from "@/lib/server/account-auth";
import { encodeSupabaseFilter, formatSupabaseRestError, getSupabaseServerConfig, supabaseRestFetch } from "@/lib/server/supabase-rest";
import type { CustomAppMarketItem, CustomAppPackageKind, CustomAppReviewStatus } from "@/lib/custom-app-market-types";
import type { CustomAppManifest, CustomAppPermission } from "@/lib/custom-app-types";

const FALLBACK_COLUMNS = "id,app_id,name,version,changelog,description,icon_data_url,permissions,manifest,package_kind,package_size,author_id,author_name,author_avatar,review_status,install_count,like_count,created_at,updated_at";
const PUBLIC_CACHE_HEADERS = { "Cache-Control": "public, max-age=0, must-revalidate", "Netlify-CDN-Cache-Control": "public, durable, s-maxage=120, stale-while-revalidate=600", "Netlify-Vary": "query" } as const;
type MarketListRow = { id?: unknown; app_id?: unknown; name?: unknown; version?: unknown; changelog?: unknown; description?: unknown; icon_data_url?: unknown; has_icon?: unknown; permissions?: unknown; manifest?: unknown; package_kind?: unknown; package_size?: unknown; author_id?: unknown; author_name?: unknown; author_avatar?: unknown; review_status?: unknown; install_count?: unknown; like_count?: unknown; created_at?: unknown; updated_at?: unknown };
function cleanText(value: unknown, maxLength: number): string { return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, maxLength); }
function cleanId(value: unknown): string { return cleanText(value, 120).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, ""); }
function clampCount(value: unknown): number { const count = Number(value); return Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0; }
function normalizePermissions(value: unknown): CustomAppPermission[] { if (!Array.isArray(value)) return []; return value.map(item => cleanText(item, 80)).filter(Boolean).slice(0, 80) as CustomAppPermission[]; }
function normalizePackageKind(value: unknown): CustomAppPackageKind { if (value === "html" || value === "floatapp") return value; return "zip"; }
function normalizeReviewStatus(value: unknown): CustomAppReviewStatus { if (value === "approved" || value === "rejected") return value; return "pending"; }
function normalizeManifest(value: unknown, fallback: { appId: string; name: string; version: string; permissions: CustomAppPermission[] }): CustomAppManifest {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return { ...record, id: cleanId(record.id) || fallback.appId, name: cleanText(record.name, 60) || fallback.name, version: cleanText(record.version, 30) || fallback.version, permissions: Array.isArray(record.permissions) ? normalizePermissions(record.permissions) : fallback.permissions } as CustomAppManifest;
}
function isMissingRpcError(message: string): boolean { return /app_market_list|PGRST202|Could not find the function|schema cache|does not exist/i.test(message); }
function isMissingTableError(message: string): boolean { return /custom_app_market_apps/i.test(message) && /PGRST20[45]|Could not find the table|schema cache|does not exist/i.test(message); }
function normalizeMarketItem(row: MarketListRow, optimized: boolean): CustomAppMarketItem | null {
  const id = cleanId(row.id); const appId = cleanId(row.app_id); const name = cleanText(row.name, 60); const version = cleanText(row.version, 30) || "1.0.0";
  if (!id || !appId || !name) return null;
  const permissions = normalizePermissions(row.permissions); const manifest = normalizeManifest(row.manifest, { appId, name, version, permissions });
  const authorName = cleanText((manifest as { author?: unknown }).author, 60) || "匿名作者"; const updatedAt = cleanText(row.updated_at, 80) || new Date().toISOString();
  const hasIcon = row.has_icon === true || row.has_icon === "true"; const fallbackIcon = cleanText(row.icon_data_url, 300000);
  const iconDataUrl = optimized ? (hasIcon ? `/api/app-market/icon?id=${encodeURIComponent(id)}&v=${encodeURIComponent(updatedAt)}` : undefined) : (fallbackIcon.startsWith("data:image/") ? fallbackIcon : undefined);
  return { id, appId, name, version, changelog: cleanText(row.changelog, 4000) || undefined, description: cleanText(row.description, 800) || undefined, iconDataUrl, permissions, manifest, packageUrl: "", packagePath: "", packageKind: normalizePackageKind(row.package_kind), packageSize: clampCount(row.package_size), authorId: cleanText(row.author_id, 160) || "anonymous", authorName, authorAvatar: cleanText(row.author_avatar, 2000) || undefined, reviewStatus: normalizeReviewStatus(row.review_status), installCount: clampCount(row.install_count), likeCount: clampCount(row.like_count), createdAt: cleanText(row.created_at, 80) || updatedAt, updatedAt };
}
async function loadRows(authorId: string | null): Promise<{ ok: true; data: MarketListRow[]; optimized: boolean } | { ok: false; error: string; status: number }> {
  const rpc = await supabaseRestFetch<MarketListRow[]>("rpc/app_market_list", { method: "POST", body: JSON.stringify({ p_author_id: authorId }) });
  if (rpc.ok) return { ok: true, data: rpc.data, optimized: true };
  if (!isMissingRpcError(rpc.error)) return { ok: false, error: rpc.error, status: rpc.status };
  const filter = authorId ? `author_id=eq.${encodeSupabaseFilter(authorId)}&deleted_at=is.null` : "review_status=eq.approved&deleted_at=is.null";
  const fallback = await supabaseRestFetch<MarketListRow[]>(`custom_app_market_apps?${filter}&select=${FALLBACK_COLUMNS}&order=updated_at.desc&limit=${authorId ? 100 : 80}`);
  if (!fallback.ok) return { ok: false, error: fallback.error, status: fallback.status };
  return { ok: true, data: fallback.data, optimized: false };
}
export async function GET(request: Request) {
  try {
    if (!getSupabaseServerConfig()) return NextResponse.json({ ok: true, apps: [] });
    const url = new URL(request.url); const mine = url.searchParams.get("mine") === "1"; const account = mine ? await getCurrentAccount(request) : null;
    if (mine && !account) return NextResponse.json({ ok: true, apps: [] });
    const result = await loadRows(mine ? account!.id : null);
    if (!result.ok) { if (isMissingTableError(result.error)) return NextResponse.json({ ok: true, apps: [], setupRequired: true, error: result.error }); return NextResponse.json({ ok: false, apps: [], error: result.error }, { status: result.status }); }
    const apps = result.data.map(row => normalizeMarketItem(row, result.optimized)).filter((item): item is CustomAppMarketItem => Boolean(item));
    return NextResponse.json({ ok: true, apps }, mine ? undefined : { headers: PUBLIC_CACHE_HEADERS });
  } catch (err) { return NextResponse.json({ ok: false, apps: [], error: formatSupabaseRestError(err) }, { status: 500 }); }
}
