import { NextResponse } from "next/server";
import { proxyFetch } from "@/lib/proxy-fetch";

export const runtime = "nodejs";
export const maxDuration = 15;

const DEFAULT_MINIMAX_BASE_URL = "https://api.minimaxi.com/v1";

function normalizeBaseUrl(value: unknown): string {
    const raw = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_MINIMAX_BASE_URL;
    return raw.replace(/\/$/, "");
}

function getRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
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

function voiceName(item: Record<string, unknown>, voiceId: string): string {
    const description = typeof item.description === "string" ? item.description.trim() : "";
    return description || `克隆音色 (${voiceId})`;
}

function extractVoiceCloning(payload: unknown): { id: string; name: string; createdAt?: number }[] {
    const root = getRecord(payload);
    const data = getRecord(root.data);
    let source: unknown[] = [];
    if (Array.isArray(root.voice_cloning)) {
        source = root.voice_cloning;
    } else if (Array.isArray(data.voice_cloning)) {
        source = data.voice_cloning;
    }

    return source.flatMap(item => {
        const record = getRecord(item);
        const rawVoiceId = record.voice_id ?? record.voiceId ?? record.id;
        if (typeof rawVoiceId !== "string" || !rawVoiceId.trim()) return [];
        const createdTime = record.created_time;
        return [{
            id: rawVoiceId.trim(),
            name: voiceName(record, rawVoiceId.trim()),
            createdAt: typeof createdTime === "number" ? createdTime : undefined,
        }];
    });
}

export async function POST(request: Request) {
    try {
        return await handleGetVoices(request);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: "get_voice_failed", message: message.slice(0, 500) }, { status: 502 });
    }
}

async function handleGetVoices(request: Request) {
    const body = await request.json().catch(() => ({}));
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const baseUrl = normalizeBaseUrl(body.baseUrl);

    if (!apiKey) return NextResponse.json({ error: "missing_api_key" }, { status: 400 });

    const response = await proxyFetch(`${baseUrl}/get_voice`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ voice_type: "voice_cloning" }),
    });

    const text = await response.text();
    let data: unknown = null;
    try {
        data = JSON.parse(text);
    } catch {
        return NextResponse.json({ error: "upstream_not_json", message: text.slice(0, 500) }, { status: 502 });
    }

    const error = baseRespError(data);
    if (!response.ok || error) {
        return NextResponse.json(
            { error: "get_voice_failed", message: error || String(getRecord(data).message || text || `HTTP ${response.status}`).slice(0, 500) },
            { status: 502 },
        );
    }

    return NextResponse.json({ ok: true, voices: extractVoiceCloning(data) });
}
