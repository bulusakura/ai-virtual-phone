import { NextRequest, NextResponse } from "next/server";
import { tripoFetch } from "../proxy-fetch";

const BASE = "https://api.tripo3d.ai/v2/openapi";

export async function POST(req: NextRequest) {
  try {
    const { apiKey } = await req.json();
    if (!apiKey) return NextResponse.json({ ok: false, error: "缺少 API Key" });

    const res = await tripoFetch(`${BASE}/user/balance`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await res.json();

    if (data.code === 0) {
      return NextResponse.json({ ok: true, balance: data.data?.balance });
    }
    return NextResponse.json({ ok: false, error: data.message || "验证失败" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message });
  }
}
