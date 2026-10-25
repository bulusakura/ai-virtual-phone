import { NextResponse } from "next/server";

import { encodeSupabaseFilter, formatSupabaseRestError, getSupabaseServerConfig, supabaseRestFetch } from "@/lib/server/supabase-rest";
import { isValidQueryCode, type VerificationRequestRow } from "@/lib/server/verification";

export async function GET(request: Request) {
  try {
    if (!getSupabaseServerConfig()) {
      return NextResponse.json({ ok: false, error: "服务端 Supabase 未配置。" }, { status: 503 });
    }
    const url = new URL(request.url);
    const code = (url.searchParams.get("code") || "").trim().toUpperCase();
    if (!isValidQueryCode(code)) {
      return NextResponse.json({ ok: false, error: "查询码格式不对（形如 VR-XXXXXXXX）。" }, { status: 400 });
    }

    const result = await supabaseRestFetch<VerificationRequestRow[]>(
      `verification_requests?query_code=eq.${encodeSupabaseFilter(code)}&select=status,activation_code,note,created_at,reviewed_at&limit=1`,
    );
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: formatSupabaseRestError(result.error) }, { status: 502 });
    }
    const row = result.data[0];
    if (!row) {
      return NextResponse.json({ ok: false, error: "没有找到这个查询码对应的申请。" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      status: row.status,
      activationCode: row.status === "approved" ? row.activation_code : null,
      note: row.status === "rejected" ? row.note : null,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: formatSupabaseRestError(err) }, { status: 500 });
  }
}
