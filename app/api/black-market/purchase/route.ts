import { NextResponse } from "next/server";

import { getCurrentAccount, cleanAccountText } from "@/lib/server/account-auth";
import { loadPurchasedBlackMarketTheatersCloud, mapBlackMarketCloudError, purchaseBlackMarketTheaterCloud } from "@/lib/server/black-market-cloud";
import { formatSupabaseRestError, getSupabaseServerConfig } from "@/lib/server/supabase-rest";

export async function GET(request: Request) {
  try {
    if (!getSupabaseServerConfig()) {
      return NextResponse.json({ ok: false, error: "Supabase 环境变量未配置。" }, { status: 503 });
    }
    const account = await getCurrentAccount(request);
    if (!account) {
      return NextResponse.json({ ok: false, error: "请先登录账号。" }, { status: 401 });
    }
    const theaters = await loadPurchasedBlackMarketTheatersCloud(account);
    return NextResponse.json({ ok: true, theaters });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: mapBlackMarketCloudError(formatSupabaseRestError(message)), theaters: [] },
      { status: getSupabaseServerConfig() ? 400 : 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    if (!getSupabaseServerConfig()) {
      return NextResponse.json({ ok: false, error: "Supabase 环境变量未配置。" }, { status: 503 });
    }
    const account = await getCurrentAccount(request);
    if (!account) {
      return NextResponse.json({ ok: false, error: "请先登录账号。" }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const theaterId = cleanAccountText(record.theaterId ?? record.id, 160);
    if (!theaterId) {
      return NextResponse.json({ ok: false, error: "missing_theater_id" }, { status: 400 });
    }
    const result = await purchaseBlackMarketTheaterCloud(account, theaterId);
    return NextResponse.json({ ok: true, wallet: result.wallet, theater: result.theater });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: mapBlackMarketCloudError(formatSupabaseRestError(message)) },
      { status: getSupabaseServerConfig() ? 400 : 503 },
    );
  }
}
