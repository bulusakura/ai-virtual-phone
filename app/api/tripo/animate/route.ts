import { NextRequest, NextResponse } from "next/server";
import { tripoFetch } from "../proxy-fetch";

const BASE = "https://api.tripo3d.ai/v2/openapi";

/**
 * 角色化身动画链：rig（自动绑骨）→ retarget（套预置动画）。
 * 两步各自是一个 Tripo 任务，客户端分别轮询 status 路由。
 * body: { mode: "rig" | "retarget", taskId, apiKey, animation? }
 *  - rig:      taskId = 基础模型的生成任务 id
 *  - retarget: taskId = rig 任务 id，animation 如 "preset:walk"
 */
export async function POST(req: NextRequest) {
  try {
    const { mode, taskId, apiKey, animation } = await req.json();
    if (!taskId) return NextResponse.json({ error: "缺少 taskId" }, { status: 400 });
    if (!apiKey) return NextResponse.json({ error: "缺少 API Key" }, { status: 400 });

    let taskBody: Record<string, unknown>;
    if (mode === "rig") {
      taskBody = { type: "animate_rig", original_model_task_id: taskId, out_format: "glb" };
    } else if (mode === "retarget") {
      taskBody = {
        type: "animate_retarget",
        original_model_task_id: taskId,
        animation: animation || "preset:walk",
        out_format: "glb",
      };
    } else {
      return NextResponse.json({ error: "未知 mode" }, { status: 400 });
    }

    const res = await tripoFetch(`${BASE}/task`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(taskBody),
    });
    const data = await res.json();
    if (!data.data?.task_id) {
      return NextResponse.json(
        { error: data.message ? `动画任务创建失败：${data.message}` : "动画任务创建失败", detail: data },
        { status: 502 },
      );
    }
    return NextResponse.json({ taskId: data.data.task_id });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
