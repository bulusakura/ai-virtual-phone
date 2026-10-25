import { NextResponse } from "next/server";

import { getCurrentAccount } from "@/lib/server/account-auth";
import { loadBlackMarketCloudWallet, mapBlackMarketCloudError } from "@/lib/server/black-market-cloud";
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
    const wallet = await loadBlackMarketCloudWallet(account);
    return NextResponse.json({ ok: true, wallet });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: mapBlackMarketCloudError(formatSupabaseRestError(message)) },
      { status: getSupabaseServerConfig() ? 400 : 503 },
    );
  }
}
