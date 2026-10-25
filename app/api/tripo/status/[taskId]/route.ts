import { NextRequest, NextResponse } from "next/server";
import { tripoFetch } from "../../proxy-fetch";

const API_KEY = process.env.TRIPO_API_KEY || "";
const BASE = "https://api.tripo3d.ai/v2/openapi";

/**
 * 任务状态查询：纯 JSON 转发，成功时附带 Tripo 的模型下载直链。
 *
 * 刻意不做服务端下载/减面：serverless 函数磁盘只读、没有 CLI、响应上限
 * 6MB，旧的「下载落盘 + npx gltf-transform」只在本地 dev 可用，线上必挂。
 * 现在模型由浏览器直连 Tripo 下载，减面/缩贴图在浏览器完成
 * （components/world-builder/model-optimize.ts）——Netlify 只承担轻量转发。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const body = await req.json().catch(() => ({}));
    const userKey = typeof body?.apiKey === "string" && body.apiKey.trim() ? body.apiKey.trim() : API_KEY;
    if (!userKey) {
      return NextResponse.json({ error: "缺少 API Key" }, { status: 400 });
    }

    const res = await tripoFetch(`${BASE}/task/${taskId}`, {
      headers: { Authorization: `Bearer ${userKey}` },
    });
    const data = await res.json();
    const task = data.data;

    if (!task) {
      return NextResponse.json({ error: "任务不存在", detail: data }, { status: 404 });
    }

    const result: { status: string; progress: number; modelUrl?: string; error?: string } = {
      status: task.status,
      progress: task.progress ?? 0,
    };

    if (task.status === "success") {
      const glbUrl = task.output?.model || task.output?.pbr_model;
      if (glbUrl) result.modelUrl = glbUrl;
    }

    if (task.status === "failed" || task.status === "cancelled") {
      result.error = task.status;
    }

    return NextResponse.json(result);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
