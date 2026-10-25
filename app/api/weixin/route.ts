// app/api/weixin/route.ts
// 代理转发 WeChat iLink API 请求，解决浏览器 CORS 限制。
// 浏览器调用 POST /api/weixin，本路由将请求转发到 ilinkai.weixin.qq.com。

import { NextResponse } from "next/server";
import { createCipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import http from "node:http";
import https from "node:https";
import tls from "node:tls";

export const runtime = "nodejs";

// Netlify Functions 默认 10s 超时，Pro 26s。设置略低于平台限制以避免被截断。
export const maxDuration = 25;

// ⏸ 服务端止血开关：暂停 getupdates 长轮询（每次挂最长 25s，持续烧 Netlify compute）。
// 直接秒回错误——客户端轮询循环连续 5 次错误后会自我停止，连"没刷新的后台老会话"
// 也能被掐断（客户端开关只对刷新后的新会话生效）。恢复功能：改回 false 重新部署。
const WEIXIN_POLL_PAUSED = true;

const ILINK_BASE = "https://ilinkai.weixin.qq.com";
const CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";
const BASE_INFO = { channel_version: "1.0.2" };

type ProxyRequest = {
    path: string;                        // iLink 路径，如 "/ilink/bot/getupdates"
    method?: "GET" | "POST";
    botToken?: string;                   // Bearer token（登录接口不需要）
    body?: unknown;                      // 转发给 iLink 的请求体
};

type SendImageRequest = {
    action: "send_image";
    botToken: string;
    toUserId: string;
    contextToken: string;
    imageDataUrl: string;
};

type SendVoiceRequest = {
    action: "send_voice";
    botToken: string;
    toUserId: string;
    contextToken: string;
    audioDataUrl: string;
    duration?: number;
    transcript?: string;
};

type SendFileRequest = {
    action: "send_file";
    botToken: string;
    toUserId: string;
    contextToken: string;
    fileDataUrl: string;
    fileName: string;
};

type WeixinRequest = ProxyRequest | SendImageRequest | SendVoiceRequest | SendFileRequest;

type FetchResult = {
    status: number;
    body: string;
    headers: Record<string, string>;
};

function getProxyUrl(): string | undefined {
    return process.env.WEIXIN_PROXY || undefined;
}

function fetchViaProxy(
    url: string,
    opts: { method: string; headers: Record<string, string>; body?: string | Uint8Array },
    timeoutMs: number,
): Promise<FetchResult> {
    const proxyUrl = getProxyUrl();
    const target = new URL(url);

    if (!proxyUrl) {
        const fetchBody: BodyInit | undefined = opts.body instanceof Uint8Array
            ? new Blob([opts.body as unknown as BlobPart])
            : opts.body;
        return fetch(url, {
            method: opts.method,
            headers: opts.headers,
            body: fetchBody,
            signal: AbortSignal.timeout(timeoutMs),
        }).then(async (r) => ({
            status: r.status,
            body: await r.text(),
            headers: Object.fromEntries(r.headers.entries()),
        }));
    }

    const proxy = new URL(proxyUrl);

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            connectReq.destroy();
            reject(new Error(`proxy connect timeout (${timeoutMs}ms)`));
        }, timeoutMs);

        const connectReq = http.request({
            host: proxy.hostname,
            port: Number(proxy.port) || 7897,
            method: "CONNECT",
            path: `${target.hostname}:443`,
        });

        connectReq.on("connect", (connectRes, socket) => {
            if (connectRes.statusCode !== 200) {
                clearTimeout(timer);
                socket.destroy();
                reject(new Error(`proxy connect failed: HTTP ${connectRes.statusCode ?? 0}`));
                return;
            }

            const requestOptions: https.RequestOptions = {
                hostname: target.hostname,
                path: target.pathname + target.search,
                method: opts.method,
                headers: opts.headers,
                agent: false,
                servername: target.hostname,
                createConnection: () => tls.connect({ socket, servername: target.hostname }),
            };

            const req = https.request(
                requestOptions,
                (res) => {
                    const chunks: Buffer[] = [];
                    res.on("data", (c: Buffer) => chunks.push(c));
                    res.on("end", () => {
                        clearTimeout(timer);
                        resolve({
                            status: res.statusCode ?? 502,
                            body: Buffer.concat(chunks).toString("utf8"),
                            headers: Object.fromEntries(
                                Object.entries(res.headers).map(([key, value]) => [
                                    key.toLowerCase(),
                                    Array.isArray(value) ? value.join(", ") : value ?? "",
                                ]),
                            ),
                        });
                    });
                },
            );
            req.on("error", (e) => { clearTimeout(timer); reject(e); });
            if (opts.body) req.write(opts.body);
            req.end();
        });

        connectReq.on("error", (e) => { clearTimeout(timer); reject(e); });
        connectReq.end();
    });
}

function makeIlinkHeaders(botToken?: string): Record<string, string> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "iLink-App-ClientVersion": "1",
    };

    if (botToken) {
        const randomUin = randomBytes(4).readUInt32BE(0);
        headers["Authorization"] = `Bearer ${botToken}`;
        headers["AuthorizationType"] = "ilink_bot_token";
        headers["X-WECHAT-UIN"] = Buffer.from(String(randomUin)).toString("base64");
    }

    return headers;
}

async function callIlinkJson<T>(path: string, botToken: string | undefined, body: unknown, timeoutMs = 24000): Promise<T> {
    const upstream = await fetchViaProxy(
        `${ILINK_BASE}${path}`,
        {
            method: "POST",
            headers: makeIlinkHeaders(botToken),
            body: JSON.stringify(body ?? {}),
        },
        timeoutMs,
    );

    if (upstream.status < 200 || upstream.status >= 300) {
        throw new Error(`iLink HTTP ${upstream.status}: ${upstream.body.slice(0, 300)}`);
    }

    return JSON.parse(upstream.body) as T;
}

function md5(data: Buffer): string {
    return createHash("md5").update(data).digest("hex");
}

function encryptAesEcb(plaintext: Buffer, key: Buffer): Buffer {
    const cipher = createCipheriv("aes-128-ecb", key, null);
    return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}

function aesEcbPaddedSize(plaintextSize: number): number {
    return Math.ceil((plaintextSize + 1) / 16) * 16;
}

function encodeMessageAesKey(aeskey: Buffer): string {
    return Buffer.from(aeskey.toString("hex")).toString("base64");
}

function imageDataUrlToBuffer(dataUrl: string): Buffer {
    const match = dataUrl.match(/^data:image\/(?:png|jpe?g|webp);base64,([\s\S]+)$/i);
    if (!match) throw new Error("invalid_image_data_url");
    return Buffer.from(match[1], "base64");
}

function audioDataUrlToBuffer(dataUrl: string): { audio: Buffer; encodeType: number } {
    const match = dataUrl.match(/^data:(?:audio\/(?:mpeg|mp3)|application\/octet-stream);base64,([\s\S]+)$/i);
    if (!match) throw new Error("invalid_audio_data_url");
    return { audio: Buffer.from(match[1], "base64"), encodeType: 7 };
}

async function uploadMediaToCdn(
    botToken: string,
    toUserId: string,
    media: Buffer,
    mediaType: number,
    options?: { noNeedThumb?: boolean },
): Promise<{
    filesize: number;
    aeskey: Buffer;
    downloadParam: string;
}> {
    const rawsize = media.length;
    const filesize = aesEcbPaddedSize(rawsize);
    const filekey = randomBytes(16).toString("hex");
    const aeskey = randomBytes(16);

    const uploadData = await callIlinkJson<{ upload_param?: string }>(
        "/ilink/bot/getuploadurl",
        botToken,
        {
            filekey,
            media_type: mediaType,
            to_user_id: toUserId,
            rawsize,
            rawfilemd5: md5(media),
            filesize,
            aeskey: aeskey.toString("hex"),
            ...(options?.noNeedThumb ? { no_need_thumb: true } : {}),
            base_info: BASE_INFO,
        },
    );

    if (!uploadData.upload_param) throw new Error("missing_upload_param");

    const ciphertext = encryptAesEcb(media, aeskey);
    const cdnUrl = `${CDN_BASE_URL}/upload?encrypted_query_param=${encodeURIComponent(uploadData.upload_param)}&filekey=${encodeURIComponent(filekey)}`;
    const cdnResp = await fetchViaProxy(
        cdnUrl,
        {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: new Uint8Array(ciphertext),
        },
        24000,
    );

    if (cdnResp.status < 200 || cdnResp.status >= 300) {
        throw new Error(`CDN HTTP ${cdnResp.status}: ${cdnResp.body.slice(0, 300)}`);
    }

    const downloadParam = cdnResp.headers["x-encrypted-param"];
    if (!downloadParam) throw new Error("missing_cdn_download_param");

    return { filesize, aeskey, downloadParam };
}

async function uploadImageToCdn(botToken: string, toUserId: string, image: Buffer) {
    return uploadMediaToCdn(botToken, toUserId, image, 1, { noNeedThumb: true });
}

async function handleSendImage(payload: SendImageRequest) {
    const image = imageDataUrlToBuffer(payload.imageDataUrl);
    const upload = await uploadImageToCdn(payload.botToken, payload.toUserId, image);

    const data = await callIlinkJson<{ ret?: number; errmsg?: string }>(
        "/ilink/bot/sendmessage",
        payload.botToken,
        {
            msg: {
                from_user_id: "",
                to_user_id: payload.toUserId,
                client_id: randomUUID(),
                message_type: 2,
                message_state: 2,
                context_token: payload.contextToken,
                item_list: [
                    {
                        type: 2,
                        image_item: {
                            media: {
                                encrypt_query_param: upload.downloadParam,
                                aes_key: encodeMessageAesKey(upload.aeskey),
                                encrypt_type: 1,
                            },
                            mid_size: upload.filesize,
                        },
                    },
                ],
            },
            base_info: BASE_INFO,
        },
    );

    if (data.ret !== undefined && data.ret !== 0) {
        throw new Error(data.errmsg || `ret=${data.ret}`);
    }

    return NextResponse.json({ ok: true });
}

async function handleSendVoice(payload: SendVoiceRequest) {
    const { audio } = audioDataUrlToBuffer(payload.audioDataUrl);
    const upload = await uploadMediaToCdn(payload.botToken, payload.toUserId, audio, 3);

    const data = await callIlinkJson<{ ret?: number; errmsg?: string }>(
        "/ilink/bot/sendmessage",
        payload.botToken,
        {
            msg: {
                from_user_id: "",
                to_user_id: payload.toUserId,
                client_id: randomUUID(),
                message_type: 2,
                message_state: 2,
                context_token: payload.contextToken,
                item_list: [
                    {
                        type: 4,
                        file_item: {
                            media: {
                                encrypt_query_param: upload.downloadParam,
                                aes_key: encodeMessageAesKey(upload.aeskey),
                                encrypt_type: 1,
                            },
                            file_name: "voice.mp3",
                            file_size: audio.length,
                            file_ext: "mp3",
                        },
                    },
                ],
            },
            base_info: BASE_INFO,
        },
    );

    if (data.ret !== undefined && data.ret !== 0) {
        throw new Error(data.errmsg || `ret=${data.ret}`);
    }

    return NextResponse.json({ ok: true });
}

function genericDataUrlToBuffer(dataUrl: string): Buffer {
    const match = dataUrl.match(/^data:[^;]+;base64,([\s\S]+)$/i);
    if (!match) throw new Error("invalid_data_url");
    return Buffer.from(match[1], "base64");
}

async function handleSendFile(payload: SendFileRequest) {
    const fileBuffer = genericDataUrlToBuffer(payload.fileDataUrl);
    const upload = await uploadMediaToCdn(payload.botToken, payload.toUserId, fileBuffer, 3);
    const rawExt = payload.fileName.split(".").pop() || "";
    const ext = /^[a-zA-Z0-9]{2,5}$/.test(rawExt) ? rawExt : "bin";

    const data = await callIlinkJson<{ ret?: number; errmsg?: string }>(
        "/ilink/bot/sendmessage",
        payload.botToken,
        {
            msg: {
                from_user_id: "",
                to_user_id: payload.toUserId,
                client_id: randomUUID(),
                message_type: 2,
                message_state: 2,
                context_token: payload.contextToken,
                item_list: [
                    {
                        type: 4,
                        file_item: {
                            media: {
                                encrypt_query_param: upload.downloadParam,
                                aes_key: encodeMessageAesKey(upload.aeskey),
                                encrypt_type: 1,
                            },
                            file_name: payload.fileName,
                            file_size: fileBuffer.length,
                            file_ext: ext,
                        },
                    },
                ],
            },
            base_info: BASE_INFO,
        },
    );

    if (data.ret !== undefined && data.ret !== 0) {
        throw new Error(data.errmsg || `ret=${data.ret}`);
    }

    return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
    let payload: WeixinRequest;
    try {
        payload = (await request.json()) as WeixinRequest;
    } catch {
        return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    // ⏸ 暂停长轮询：getupdates 秒回 503，不再挂起占用函数时长。
    if (
        WEIXIN_POLL_PAUSED &&
        "path" in payload &&
        typeof payload.path === "string" &&
        payload.path.includes("getupdates")
    ) {
        return NextResponse.json({ error: "weixin_poll_paused" }, { status: 503 });
    }

    if ("action" in payload && payload.action === "send_image") {
        try {
            return await handleSendImage(payload);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[weixin-proxy] send image failed: ${msg}`);
            return NextResponse.json({ error: "send_image_failed", message: msg }, { status: 502 });
        }
    }

    if ("action" in payload && payload.action === "send_voice") {
        try {
            return await handleSendVoice(payload);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[weixin-proxy] send voice failed: ${msg}`);
            return NextResponse.json({ error: "send_voice_failed", message: msg }, { status: 502 });
        }
    }

    if ("action" in payload && payload.action === "send_file") {
        try {
            return await handleSendFile(payload);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[weixin-proxy] send file failed: ${msg}`);
            return NextResponse.json({ error: "send_file_failed", message: msg }, { status: 502 });
        }
    }

    const { path, method = "POST", botToken, body } = payload as ProxyRequest;

    if (!path) {
        return NextResponse.json({ error: "missing_path" }, { status: 400 });
    }

    const headers = makeIlinkHeaders(botToken);

    const url = `${ILINK_BASE}${path}`;
    const fetchMethod = method === "GET" ? "GET" : "POST";
    const hasBody = body !== undefined && body !== null
        && !(typeof body === "object" && Object.keys(body as object).length === 0);
    const bodyStr = fetchMethod === "POST" && hasBody ? JSON.stringify(body) : undefined;

    try {
        const upstream = await fetchViaProxy(
            url,
            { method: fetchMethod, headers, body: bodyStr },
            24000,
        );

        try {
            const data = JSON.parse(upstream.body);
            return NextResponse.json(data, { status: upstream.status });
        } catch {
            return NextResponse.json(
                { error: "upstream_not_json", status: upstream.status, body: upstream.body.slice(0, 300) },
                { status: 502 },
            );
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[weixin-proxy] fetch failed: ${msg}`);
        return NextResponse.json({ error: "upstream_error", message: msg }, { status: 502 });
    }
}
