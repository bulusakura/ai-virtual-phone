import { NextResponse } from "next/server";

import { getSupabaseServerConfig } from "@/lib/server/supabase-rest";

// 联机运行时配置：浏览器直连 Supabase Realtime 需要项目 URL 和 anon key。
// anon key 是 Supabase 设计上可公开的密钥（数据表已全部启用 RLS 且只走
// service key），这里只是把它从服务端环境变量转交给前端，省去构建期注入。
// 响应只由环境变量决定,同一部署内恒定:CDN 缓存 1 小时,把每个客户端启动时的
// 这次函数调用合并掉(改环境变量后重新部署即生效,最坏晚 1 小时)。
const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, must-revalidate",
  "Netlify-CDN-Cache-Control": "public, durable, s-maxage=3600, stale-while-revalidate=86400",
} as const;

export async function GET() {
  const config = getSupabaseServerConfig();
  const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!config || !anonKey) {
    return NextResponse.json({ ok: true, configured: false }, { headers: CACHE_HEADERS });
  }
  return NextResponse.json({
    ok: true,
    configured: true,
    supabaseUrl: config.url,
    anonKey,
  }, { headers: CACHE_HEADERS });
}
