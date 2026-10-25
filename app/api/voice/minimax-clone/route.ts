import { NextResponse } from "next/server";
import { proxyFetch } from "@/lib/proxy-fetch";

export const runtime = "nodejs";
export const maxDuration = 25;

const DEFAULT_MINIMAX_BASE_URL = "https://api.minimaxi.com/v1";
const MAX_AUDIO_SIZE = 20 * 1024 * 1024;

function normalizeBaseUrl(value: unknown): string {
    const raw = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_MINIMAX_BASE_URL;
    return raw.replace(/\/$/, "");
}

function fieldText(form: FormData, key: string): string {
    const value = form.get(key);
    return typeof value === "string" ? value.trim() : "";
}

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function getRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function extractFileId(payload: unknown): string | number | null {
    const root = getRecord(payload);
    const file = getRecord(root.file);
    const fileId = file.file_id ?? root.file_id ?? root.id;
    if (typeof fileId === "string" && fileId.trim()) return fileId.trim();
    if (typeof fileId === "number" && Number.isFinite(fileId)) return fileId;
    return null;
}

function baseRespError(payload: unknown): string | null {
    const root = getRecord(payload);
    const baseResp = getRecord(root.base_resp);
    const code = baseResp.status_code ?? root.status_code;
    const message = String(baseResp.status_msg || root.status_msg || "");
    if (typeof code === "number" && code !== 0) return message || `status_code=${code}`;
    if (typeof code === "string" && code && code !== "0") return message || `status_code=${code}`;
    return null;
}

async function readErrorMessage(response: Response): Promise<string> {
    const text = await response.text().catch(() => "");
    const data = parseJson(text);
    const root = getRecord(data);
    const baseResp = getRecord(root.base_resp);
    return String(baseResp.status_msg || root.message || root.error || text || `HTTP ${response.status}`).slice(0, 500);
}

export async function POST(request: Request) {
    try {
        return await handleClone(request);
    } catch (err) {
        // 不再裸抛 500:出网失败(本地 dev 需代理)/表单解析失败等都带上原因返回
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: "clone_failed", message: message.slice(0, 500) }, { status: 502 });
    }
}

async function handleClone(request: Request) {
    const form = await request.formData();
    const apiKey = fieldText(form, "apiKey");
    const baseUrl = normalizeBaseUrl(fieldText(form, "baseUrl"));
    const voiceId = fieldText(form, "voiceId");
    const audio = form.get("audio");

    if (!apiKey) return NextResponse.json({ error: "missing_api_key" }, { status: 400 });
    if (!voiceId || !/^[A-Za-z0-9_-]{4,64}$/.test(voiceId)) {
        return NextResponse.json({ error: "invalid_voice_id" }, { status: 400 });
    }
    if (!(audio instanceof File)) {
        return NextResponse.json({ error: "missing_audio" }, { status: 400 });
    }
    if (audio.size <= 0 || audio.size > MAX_AUDIO_SIZE) {
        return NextResponse.json({ error: "invalid_audio_size" }, { status: 400 });
    }

    const uploadForm = new FormData();
    uploadForm.set("purpose", "voice_clone");
    uploadForm.set("file", audio, audio.name || "voice-sample.mp3");

    const uploadResponse = await proxyFetch(`${baseUrl}/files/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: uploadForm,
    });

    if (!uploadResponse.ok) {
        return NextResponse.json(
            { error: "upload_failed", message: await readErrorMessage(uploadResponse) },
            { status: 502 },
        );
    }

    const uploadText = await uploadResponse.text();
    const uploadData = parseJson(uploadText);
    const uploadError = baseRespError(uploadData);
    if (uploadError) {
        return NextResponse.json({ error: "upload_failed", message: uploadError }, { status: 502 });
    }
    const fileId = extractFileId(uploadData);
    if (!fileId) {
        return NextResponse.json({ error: "missing_file_id", message: uploadText.slice(0, 500) }, { status: 502 });
    }

    const cloneResponse = await proxyFetch(`${baseUrl}/voice_clone`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            file_id: fileId,
            voice_id: voiceId,
        }),
    });

    const cloneText = await cloneResponse.text();
    const cloneData = parseJson(cloneText);
    const cloneError = baseRespError(cloneData);
    if (!cloneResponse.ok || cloneError) {
        return NextResponse.json(
            { error: "clone_failed", message: cloneError || String(getRecord(cloneData).message || cloneText || `HTTP ${cloneResponse.status}`).slice(0, 500) },
            { status: 502 },
        );
    }

    return NextResponse.json({ ok: true, voiceId, fileId });
}
