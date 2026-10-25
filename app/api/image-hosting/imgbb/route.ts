import { NextResponse } from "next/server";

export const runtime = "nodejs";

const IMGBB_UPLOAD_URL = "https://api.imgbb.com/1/upload";
const MAX_SERVER_UPLOAD_BYTES = 32 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/gif",
]);

function jsonError(message: string, status = 400) {
    return NextResponse.json({ error: message }, { status });
}

function normalizeExpiration(value: FormDataEntryValue | null): number {
    const parsed = typeof value === "string" ? Number.parseInt(value, 10) : 0;
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.max(60, Math.min(15552000, parsed));
}

function sanitizeName(value: FormDataEntryValue | null): string | undefined {
    if (typeof value !== "string") return undefined;
    const safe = value
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^\u4e00-\u9fa5A-Za-z0-9._-]+/g, "")
        .slice(0, 80);
    return safe || undefined;
}

function asNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
}

export async function POST(request: Request) {
    try {
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File)) return jsonError("缺少图片文件。");
        if (!ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase())) return jsonError(`不支持的图片类型：${file.type || "unknown"}`);
        if (file.size <= 0) return jsonError("图片文件为空。");
        if (file.size > MAX_SERVER_UPLOAD_BYTES) return jsonError("图片超过 ImgBB 32MB 限制。", 413);

        const apiKey = process.env.IMGBB_API_KEY || (typeof form.get("apiKey") === "string" ? String(form.get("apiKey")) : "");
        if (!apiKey.trim()) return jsonError("缺少 ImgBB API Key。");

        const upload = new FormData();
        upload.set("image", file, file.name || "asset.png");
        const name = sanitizeName(form.get("name"));
        if (name) upload.set("name", name);
        const expiration = normalizeExpiration(form.get("expiration"));
        if (expiration > 0) upload.set("expiration", String(expiration));

        const response = await fetch(`${IMGBB_UPLOAD_URL}?key=${encodeURIComponent(apiKey.trim())}`, {
            method: "POST",
            body: upload,
        });
        const text = await response.text();
        let parsed: unknown = {};
        try {
            parsed = JSON.parse(text);
        } catch {
            parsed = {};
        }
        const data = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
        if (!response.ok || data.success === false) {
            const error = data.error && typeof data.error === "object" ? data.error as Record<string, unknown> : {};
            const message = typeof error.message === "string" ? error.message : text.slice(0, 400);
            return jsonError(`ImgBB 上传失败：${message || response.status}`, response.status || 502);
        }

        const imageData = data.data && typeof data.data === "object" ? data.data as Record<string, unknown> : {};
        const url = typeof imageData.url === "string" ? imageData.url : "";
        const displayUrl = typeof imageData.display_url === "string" ? imageData.display_url : url;
        if (!url) return jsonError("ImgBB 返回里没有图片 URL。", 502);

        return NextResponse.json({
            url,
            displayUrl,
            deleteUrl: typeof imageData.delete_url === "string" ? imageData.delete_url : undefined,
            thumbUrl: imageData.thumb && typeof imageData.thumb === "object"
                ? (imageData.thumb as Record<string, unknown>).url
                : undefined,
            mediumUrl: imageData.medium && typeof imageData.medium === "object"
                ? (imageData.medium as Record<string, unknown>).url
                : undefined,
            width: asNumber(imageData.width),
            height: asNumber(imageData.height),
            size: asNumber(imageData.size),
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonError(`ImgBB 上传请求失败：${message}`, 500);
    }
}
