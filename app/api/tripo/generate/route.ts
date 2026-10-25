import { NextRequest, NextResponse } from "next/server";
import { tripoFetch } from "../proxy-fetch";

const BASE = "https://api.tripo3d.ai/v2/openapi";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    // 图生3D：multipart/form-data（支持单图和多图）
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const files = formData.getAll("files") as File[];
      const apiKey = formData.get("apiKey") as string || "";
      const faceLimit = parseInt(formData.get("faceLimit") as string || "0");

      if (!files.length) return NextResponse.json({ error: "缺少图片文件" }, { status: 400 });
      if (!apiKey) return NextResponse.json({ error: "缺少 API Key" }, { status: 400 });

      // 上传所有图片获取 tokens
      const imageTokens: string[] = [];
      for (const [index, file] of files.entries()) {
        const uploadForm = new FormData();
        // 中文等非 Latin-1 文件名会让 undici 写 multipart 头时抛
        // ByteString 错误——重包成 ASCII 安全名（扩展名保留）
        const ext = (file.name.match(/\.([a-zA-Z0-9]+)$/)?.[1] || "png").toLowerCase();
        uploadForm.append("file", new File([file], `image_${index}.${ext}`, { type: file.type || "image/png" }));
        const uploadRes = await tripoFetch(`${BASE}/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: uploadForm,
        });
        const uploadData = await uploadRes.json();
        if (!uploadData.data?.image_token) {
          return NextResponse.json({ error: uploadData.message ? `图片上传失败：${uploadData.message}` : "图片上传失败", detail: uploadData }, { status: 502 });
        }
        imageTokens.push(uploadData.data.image_token);
      }

      // 单图 → image_to_model，多图 → multiview_to_model
      let taskBody: any;
      if (imageTokens.length === 1) {
        taskBody = {
          type: "image_to_model",
          file: { type: "jpg", file_token: imageTokens[0] },
        };
      } else {
        taskBody = {
          type: "multiview_to_model",
          files: imageTokens.map((token) => ({ type: "jpg", file_token: token })),
        };
      }
      if (faceLimit > 0) taskBody.face_limit = faceLimit;

      const taskRes = await tripoFetch(`${BASE}/task`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(taskBody),
      });
      const taskData = await taskRes.json();
      if (!taskData.data?.task_id) {
        return NextResponse.json({ error: taskData.message ? `创建任务失败：${taskData.message}` : "创建任务失败", detail: taskData }, { status: 502 });
      }
      return NextResponse.json({ taskId: taskData.data.task_id });
    }

    // 文生3D：JSON body
    const body = await req.json();
    const { prompt, apiKey, faceLimit } = body;
    if (!prompt) return NextResponse.json({ error: "缺少 prompt" }, { status: 400 });
    if (!apiKey) return NextResponse.json({ error: "缺少 API Key" }, { status: 400 });

    const taskBody: any = { type: "text_to_model", prompt };
    if (faceLimit > 0) taskBody.face_limit = faceLimit;

    const taskRes = await tripoFetch(`${BASE}/task`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(taskBody),
    });
    const taskData = await taskRes.json();
    if (!taskData.data?.task_id) {
      return NextResponse.json({ error: taskData.message ? `创建任务失败：${taskData.message}` : "创建任务失败", detail: taskData }, { status: 502 });
    }
    return NextResponse.json({ taskId: taskData.data.task_id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
