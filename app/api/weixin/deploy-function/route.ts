// app/api/weixin/deploy-function/route.ts
// 代理转发 Supabase 管理接口的云函数部署请求，解决浏览器 CORS 限制
// （api.supabase.com 不对第三方站点来源返回 CORS 放行头，浏览器直连会被拦截；
// 与 /api/weixin 代理 iLink 是同一类问题）。
// 用户的 Access Token 仅在本次请求中透传给 Supabase，不存储、不写日志。

import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Netlify Functions 默认 10s 超时，Pro 26s；部署上传通常几秒内完成。
export const maxDuration = 25;

const FUNCTION_SLUG = "weixin-assistant";

type DeployRequest = {
    ref?: string;
    token?: string;
    code?: string;
};

export async function POST(req: Request) {
    let payload: DeployRequest;
    try {
        payload = await req.json() as DeployRequest;
    } catch {
        return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const ref = typeof payload.ref === "string" ? payload.ref.trim() : "";
    const token = typeof payload.token === "string" ? payload.token.trim() : "";
    const code = typeof payload.code === "string" ? payload.code : "";
    if (!/^[a-z0-9]{15,40}$/.test(ref)) {
        return NextResponse.json({ error: "invalid_ref" }, { status: 400 });
    }
    if (!token) {
        return NextResponse.json({ error: "missing_token" }, { status: 400 });
    }
    // 只接受本产品的云函数代码（含入口标记），防止被当成任意部署接口滥用
    if (!code || code.length > 512_000 || !code.includes("Deno.serve") || !code.includes("ai-phone-weixin")) {
        return NextResponse.json({ error: "invalid_code" }, { status: 400 });
    }

    const form = new FormData();
    form.append("metadata", JSON.stringify({
        name: FUNCTION_SLUG,
        entrypoint_path: "index.ts",
        verify_jwt: false,
    }));
    form.append("file", new Blob([code], { type: "application/typescript" }), "index.ts");

    let upstream: Response;
    try {
        upstream = await fetch(
            `https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=${FUNCTION_SLUG}`,
            { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form },
        );
    } catch {
        return NextResponse.json({ error: "upstream_unreachable" }, { status: 502 });
    }

    const text = await upstream.text();
    return new NextResponse(text, {
        status: upstream.status,
        headers: { "Content-Type": upstream.headers.get("content-type") || "application/json" },
    });
}
