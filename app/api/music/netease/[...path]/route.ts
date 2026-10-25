import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 1;

function corsHeaders(): Record<string, string> {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": "no-store",
    };
}

function proxyDisabled() {
    return NextResponse.json(
        {
            code: 410,
            error: "netease_proxy_disabled",
            message: "网易云音乐代理已关闭，请刷新页面使用浏览器直连。",
        },
        { status: 410, headers: corsHeaders() },
    );
}

export async function GET() {
    return proxyDisabled();
}

export async function POST() {
    return proxyDisabled();
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
