import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { z } from "zod";
import { config, encrypt, decrypt } from "./config.js";
import { getSetting, setSetting, run, id, now, one } from "./db.js";
import { requireThat, AppError } from "./errors.js";
import { realtimeSpeech } from "./realtime-speech.js";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
export const providerSchema = z.object({
    textProvider: z.enum(["GEMINI", "OPENAI", "OLLAMA", "LM_STUDIO"]),
    textModel: z.string().max(150),
    textUrl: z.url(),
    ttsProvider: z.enum(["OPENAI_TTS", "VOICEVOX"]),
    ttsModel: z.string().max(150),
    voice: z.string().max(100),
    speed: z.number().min(0.5).max(1.5).default(1),
    voicevoxUrl: z.url(),
    videoModel: z.string().max(150),
    geminiKey: z.string().max(500).optional(),
    openaiKey: z.string().max(500).optional(),
});
export const textModelDefaults = {
    GEMINI: process.env.GEMINI_TEXT_MODEL || "gemini-3.8-flash",
    OPENAI: process.env.OPENAI_TEXT_MODEL || "",
    OLLAMA: "",
    LM_STUDIO: "",
};
const initialTextProvider = providerSchema.shape.textProvider.parse(process.env.DEFAULT_TEXT_PROVIDER || "GEMINI");
const defaults = {
    textProvider: initialTextProvider,
    textModel: textModelDefaults[initialTextProvider],
    textUrl: "http://127.0.0.1:11434",
    ttsProvider: "OPENAI_TTS",
    ttsModel: process.env.OPENAI_TTS_MODEL || "gpt-realtime-2.1-mini",
    voice: process.env.OPENAI_TTS_VOICE || "marin",
    speed: 1,
    voicevoxUrl: "http://127.0.0.1:50021",
    videoModel: process.env.GEMINI_VIDEO_MODEL || "gemini-omni-1.1-flash",
};
export const providers = () => getSetting("providers", defaults);
export function providerSources() {
    return {
        gemini: getSetting("geminiKey", null) !== null
            ? "管理画面"
            : process.env.GEMINI_API_KEY
                ? "環境変数（.env等）"
                : "未設定",
        openai: getSetting("openaiKey", null) !== null
            ? "管理画面"
            : process.env.OPENAI_API_KEY
                ? "環境変数（.env等）"
                : "未設定",
    };
}
export function connectionFingerprint(purpose) {
    const p = providers();
    const value = purpose === "VIDEO"
        ? [p.videoModel, apiKey("gemini")]
        : purpose === "TTS"
            ? [
                p.ttsProvider,
                p.ttsModel,
                p.voice,
                p.speed,
                p.voicevoxUrl,
                p.ttsProvider === "OPENAI_TTS" ? apiKey("openai") : "",
            ]
            : [
                p.textProvider,
                p.textModel,
                p.textUrl,
                p.textProvider === "GEMINI"
                    ? apiKey("gemini")
                    : p.textProvider === "OPENAI"
                        ? apiKey("openai")
                        : "",
            ];
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function apiKey(which) {
    const saved = getSetting(`${which}Key`, null);
    return saved === null
        ? process.env[which === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"] ||
            ""
        : saved
            ? decrypt(saved)
            : "";
}
export function saveProviders(value) {
    const before = Object.fromEntries(["TEXT", "TTS", "VIDEO"].map((purpose) => [
        purpose,
        connectionFingerprint(purpose),
    ]));
    const { geminiKey, openaiKey, ...publicSettings } = value;
    setSetting("providers", publicSettings);
    if (geminiKey !== undefined)
        setSetting("geminiKey", geminiKey ? encrypt(geminiKey) : "");
    if (openaiKey !== undefined)
        setSetting("openaiKey", openaiKey ? encrypt(openaiKey) : "");
    for (const purpose of ["TEXT", "TTS", "VIDEO"])
        if (before[purpose] !== connectionFingerprint(purpose))
            setSetting(`verified:${purpose}`, null);
}
export function localUrl(value) {
    const u = new URL(value);
    requireThat(config.LOCAL_PROVIDER_ORIGINS.split(",").includes(u.origin) &&
        u.pathname === "/" &&
        !u.username &&
        !u.password &&
        !u.search, 422, "LOCAL_URL_DENIED", "接続先がサーバーの許可リストにありません");
    return u.origin;
}
async function request(url, init = {}) {
    const r = await fetch(url, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(config.PROVIDER_TIMEOUT_MS),
    });
    if (!r.ok)
        throw new AppError(502, "PROVIDER_ERROR", `接続先エラー (${r.status})。設定・利用権限・上限を確認してください`);
    return r;
}
const jsonHeaders = { "Content-Type": "application/json" };
export function gemini() {
    const key = apiKey("gemini");
    requireThat(key, 409, "NOT_CONFIGURED", "Gemini APIキーが未設定です");
    return new GoogleGenAI({
        apiKey: key,
        httpOptions: { timeout: config.PROVIDER_TIMEOUT_MS },
    });
}
export function openai() {
    const key = apiKey("openai");
    requireThat(key, 409, "NOT_CONFIGURED", "OpenAI APIキーが未設定です");
    return new OpenAI({
        apiKey: key,
        timeout: config.PROVIDER_TIMEOUT_MS,
        maxRetries: 1,
    });
}
export const voices = [
    "alloy",
    "ash",
    "ballad",
    "coral",
    "echo",
    "fable",
    "onyx",
    "nova",
    "sage",
    "shimmer",
    "verse",
    "marin",
    "cedar",
];
export async function models(purpose, textProvider) {
    const p = { ...providers(), ...(textProvider ? { textProvider } : {}) };
    if (purpose === "TEXT" && p.textProvider === "OPENAI") {
        const result = [];
        for await (const model of openai().models.list())
            if (/^(gpt-|o[1-9])/.test(model.id) &&
                !/audio|tts|realtime|transcrib|image|search|embedding|moderation/i.test(model.id))
                result.push(model.id);
        return { models: result.sort(), voices: [] };
    }
    if (purpose === "TTS") {
        if (p.ttsProvider === "OPENAI_TTS") {
            const list = await openai().models.list();
            return {
                models: list.data
                    .map((m) => m.id)
                    .filter((v) => /tts|realtime/.test(v)),
                voices: (p.ttsModel.startsWith("gpt-realtime")
                    ? voices.filter((v) => !["fable", "onyx", "nova"].includes(v))
                    : voices).map((v) => ({ id: v, name: v })),
            };
        }
        const r = await request(`${localUrl(p.voicevoxUrl)}/speakers`);
        const speakers = (await r.json());
        return {
            models: ["VOICEVOX"],
            voices: speakers.flatMap((s) => s.styles.map((v) => ({
                id: String(v.id),
                name: `${s.name} / ${v.name}`,
            }))),
        };
    }
    if (purpose === "VIDEO" || p.textProvider === "GEMINI") {
        const list = await gemini().models.list();
        const result = [];
        for await (const m of list) {
            if (m.name)
                result.push(m.name.replace(/^models\//, ""));
        }
        return {
            models: result.filter((v) => purpose === "VIDEO"
                ? /omni/.test(v)
                : !/veo|omni|image|embedding|tts/.test(v)),
            voices: [],
        };
    }
    if (p.textProvider === "OLLAMA") {
        const r = await request(`${localUrl(p.textUrl)}/api/tags`);
        return {
            models: (await r.json()).models.map((m) => m.name),
            voices: [],
        };
    }
    const r = await request(`${localUrl(p.textUrl)}/v1/models`);
    return {
        models: (await r.json()).data.map((m) => m.id),
        voices: [],
    };
}
export async function generateText(system, messages, overrides) {
    const p = providers(), provider = overrides?.provider ?? p.textProvider, model = overrides?.model ?? p.textModel;
    requireThat(model, 409, "MODEL_REQUIRED", "文章生成モデルを設定してください");
    const allowed = await models("TEXT");
    requireThat(provider === p.textProvider && allowed.models.includes(model), 409, "MODEL_UNAVAILABLE", "講師のプロバイダー／モデルが現在の接続先と一致しません");
    let text = "";
    if (provider === "GEMINI") {
        const r = await gemini().models.generateContent({
            model,
            contents: messages.map((m) => ({
                role: m.role === "assistant" ? "model" : "user",
                parts: [{ text: m.content }],
            })),
            config: { systemInstruction: system, maxOutputTokens: 4096 },
        });
        text = r.text ?? "";
    }
    else if (provider === "OPENAI") {
        try {
            const response = await openai().responses.create({
                model,
                instructions: system,
                input: messages,
                max_output_tokens: 4096,
                store: false,
            });
            requireThat(response.status === "completed", 502, "TEXT_INCOMPLETE", "OpenAIの文章生成が完了しませんでした");
            text = response.output_text;
        }
        catch (error) {
            if (error instanceof OpenAI.APIError) {
                setSetting("verified:TEXT", null);
                throw new AppError(502, "PROVIDER_ERROR", `OpenAI文章生成エラー (${error.status ?? "通信失敗"})。モデル・認証・利用上限を確認してください`);
            }
            throw error;
        }
    }
    else if (provider === "OLLAMA") {
        const r = await request(`${localUrl(p.textUrl)}/api/chat`, {
            method: "POST",
            headers: jsonHeaders,
            body: JSON.stringify({
                model,
                stream: false,
                messages: [{ role: "system", content: system }, ...messages],
            }),
        });
        text = (await r.json()).message
            .content;
    }
    else {
        const r = await request(`${localUrl(p.textUrl)}/v1/chat/completions`, {
            method: "POST",
            headers: jsonHeaders,
            body: JSON.stringify({
                model,
                stream: false,
                messages: [{ role: "system", content: system }, ...messages],
            }),
        });
        text =
            (await r.json())
                .choices[0]?.message.content ?? "";
    }
    requireThat(text.trim(), 502, "EMPTY_RESPONSE", "文章を生成できませんでした");
    run("INSERT INTO usage_records VALUES(?,?,?,?,?,?)", id(), null, "TEXT", provider, text.length, now());
    return text.slice(0, 12000);
}
export async function synthesize(text, voice) {
    const p = providers();
    run("INSERT INTO usage_records VALUES(?,?,?,?,?,?)", id(), null, "TTS", p.ttsProvider, text.length, now());
    return synthesizeUntracked(text, voice);
}
async function synthesizeUntracked(text, voice) {
    const p = providers();
    if (p.ttsProvider === "OPENAI_TTS") {
        requireThat(voices.includes(voice), 409, "VOICE_UNAVAILABLE", "利用可能な音声を選択してください");
        if (p.ttsModel.startsWith("gpt-realtime"))
            return realtimeSpeech(openai(), p.ttsModel, voice, text, config.PROVIDER_TIMEOUT_MS);
        const r = await openai().audio.speech.create({
            model: p.ttsModel,
            voice: voice,
            input: text,
            response_format: "wav",
        });
        return Buffer.from(await r.arrayBuffer());
    }
    const available = await models("TTS");
    requireThat(available.voices.some((v) => v.id === voice), 409, "VOICE_UNAVAILABLE", "VOICEVOX話者を再設定してください");
    const base = localUrl(p.voicevoxUrl);
    const q = await request(`${base}/audio_query?text=${encodeURIComponent(text)}&speaker=${encodeURIComponent(voice)}`, { method: "POST" });
    const query = await q.json();
    const r = await request(`${base}/synthesis?speaker=${encodeURIComponent(voice)}`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(query) });
    return Buffer.from(await r.arrayBuffer());
}
// Interactions APIの型はSDKで差があるため、公式REST契約を使用する。
export async function generateScene(prompt, aspectRatio, onId) {
    const p = providers();
    const root = "https://generativelanguage.googleapis.com/v1beta/interactions";
    const headers = { ...jsonHeaders, "x-goog-api-key": apiKey("gemini") };
    requireThat(headers["x-goog-api-key"], 409, "NOT_CONFIGURED", "Gemini APIキーが未設定です");
    requireThat(one("SELECT count(*) n FROM usage_records WHERE purpose=? AND created_at>=?", "VIDEO", new Date(Date.now() - 86400000).toISOString()).n < systemSettings().maxDailyScenes, 429, "DAILY_LIMIT", "動画APIの日次上限です");
    run("INSERT INTO usage_records VALUES(?,?,?,?,?,?)", id(), null, "VIDEO", "GEMINI", 1, now());
    let r = await request(root, {
        method: "POST",
        headers,
        body: JSON.stringify({
            model: p.videoModel,
            input: prompt,
            response_format: { type: "video", aspect_ratio: aspectRatio },
        }),
    });
    let data = (await r.json());
    onId?.(data.id);
    const start = Date.now();
    while (!data.output_video?.data &&
        !data.output_video?.uri &&
        ["in_progress", "pending"].includes(data.status ?? "")) {
        requireThat(Date.now() - start < config.PROVIDER_TIMEOUT_MS, 504, "VIDEO_TIMEOUT", "動画生成がタイムアウトしました");
        await new Promise((resolve) => setTimeout(resolve, 2000));
        r = await request(`${root}/${encodeURIComponent(data.id)}`, { headers });
        data = (await r.json());
    }
    requireThat(data.output_video?.data || data.output_video?.uri, 502, "VIDEO_INCOMPLETE", "動画データが返りませんでした。未完了・モデル権限・安全制限を確認してください");
    let buffer;
    if (data.output_video.data)
        buffer = Buffer.from(data.output_video.data, "base64");
    else {
        const uri = new URL(data.output_video.uri);
        requireThat(uri.protocol === "https:" &&
            uri.hostname === "generativelanguage.googleapis.com", 502, "INVALID_VIDEO_URI", "動画取得先を検証できません");
        const fileId = uri.pathname.match(/\/files\/([a-zA-Z0-9_-]+)/)?.[1];
        requireThat(fileId, 502, "INVALID_VIDEO_URI", "動画ファイルIDを検証できません");
        const client = gemini();
        let file = await client.files.get({ name: `files/${fileId}` });
        while (file.state === "PROCESSING") {
            requireThat(Date.now() - start < config.PROVIDER_TIMEOUT_MS, 504, "VIDEO_TIMEOUT", "動画ファイルの準備がタイムアウトしました");
            await new Promise((resolve) => setTimeout(resolve, 2000));
            file = await client.files.get({ name: `files/${fileId}` });
        }
        requireThat(file.state === "ACTIVE", 502, "VIDEO_INCOMPLETE", "動画ファイルが利用可能になりませんでした");
        requireThat(!file.sizeBytes ||
            Number(file.sizeBytes) <= systemSettings().maxExportMb * 1024 * 1024, 422, "SIZE_LIMIT", "動画素材の容量上限です");
        const dir = await mkdtemp(path.join(config.storage, "scene-download-"));
        try {
            const output = path.join(dir, "source.mp4");
            await client.files.download({
                file: { uri: uri.toString() },
                downloadPath: output,
            });
            requireThat((await stat(output)).size <= systemSettings().maxExportMb * 1024 * 1024, 422, "SIZE_LIMIT", "動画素材の容量上限です");
            buffer = await readFile(output);
        }
        finally {
            await rm(dir, { recursive: true, force: true });
        }
    }
    requireThat(buffer.length <= systemSettings().maxExportMb * 1024 * 1024 &&
        buffer.subarray(0, 64).includes(Buffer.from("ftyp")), 502, "INVALID_VIDEO", "取得したMP4素材を検証できません");
    return { interactionId: data.id, buffer };
}
export async function testConnection(purpose, allowCharge = false) {
    const choices = await models(purpose), p = providers();
    if (purpose === "TEXT") {
        requireThat(choices.models.includes(p.textModel), 409, "MODEL_UNAVAILABLE", "選択モデルが見つかりません");
        await generateText("接続テストです。OKとだけ回答してください。", [
            { role: "user", content: "接続確認" },
        ]);
    }
    else if (purpose === "TTS") {
        requireThat(choices.voices.some((v) => v.id === p.voice), 409, "VOICE_UNAVAILABLE", "選択音声が見つかりません");
        await synthesize("接続テストです。", p.voice);
    }
    else {
        requireThat(allowCharge, 422, "COST_CONFIRMATION_REQUIRED", "実動画生成の課金確認が必要です");
        requireThat(choices.models.includes(p.videoModel), 409, "MODEL_UNAVAILABLE", "動画モデルへの権限を確認できません");
        await generateScene("A calm blue abstract educational background. No people, text or speech.", "16:9");
    }
    setSetting(`verified:${purpose}`, {
        at: Date.now(),
        fingerprint: connectionFingerprint(purpose),
        model: purpose === "TEXT"
            ? p.textModel
            : purpose === "VIDEO"
                ? p.videoModel
                : p.ttsModel,
    });
    return choices;
}
export const systemSchema = z.object({
    exportClozeEnabled: z.boolean().default(true),
    exportVideoEnabled: z.boolean(),
    exportAudioEnabled: z.boolean(),
    exportTextEnabled: z.boolean(),
    registrationEnabled: z.boolean(),
    maxRooms: z.number().int().min(1).max(100),
    maxMembers: z.number().int().min(1).max(100),
    maxMessageLength: z.number().int().min(100).max(2000),
    maxAudioMinutes: z.number().min(1).max(180),
    maxVideoMinutes: z.number().min(1).max(60),
    maxVideoScenes: z.number().int().min(1).max(50),
    maxExportMb: z.number().min(1).max(2000),
    retentionDays: z.number().int().min(1).max(365),
    maxDailyScenes: z.number().int().min(1).max(500),
    maxVideoBudget: z.number().min(0.01).max(100),
    sceneCostCeiling: z.number().min(0.001).max(10),
});
export const systemSettings = () => ({
    exportClozeEnabled: true,
    ...getSetting("system", {
        exportVideoEnabled: false,
        exportAudioEnabled: false,
        exportTextEnabled: true,
        registrationEnabled: true,
        maxRooms: 20,
        maxMembers: 30,
        maxMessageLength: 2000,
        maxAudioMinutes: 60,
        maxVideoMinutes: 10,
        maxVideoScenes: 20,
        maxExportMb: 500,
        retentionDays: 7,
        maxDailyScenes: 50,
        maxVideoBudget: 5,
        sceneCostCeiling: 1,
    }),
});
export function verified(purpose) {
    const v = getSetting(`verified:${purpose}`, null);
    return (!!v &&
        v.fingerprint === connectionFingerprint(purpose) &&
        Date.now() - v.at < 24 * 60 * 60 * 1000);
}
export function capabilities() {
    const s = systemSettings();
    return {
        MARKDOWN: {
            available: s.exportTextEnabled,
            reason: s.exportTextEnabled ? "" : "管理者により無効",
        },
        PDF: {
            available: s.exportTextEnabled,
            reason: s.exportTextEnabled ? "" : "管理者により無効",
        },
        CLOZE_PDF: {
            available: s.exportTextEnabled && s.exportClozeEnabled,
            reason: s.exportTextEnabled && s.exportClozeEnabled ? "" : "管理者により無効",
        },
        MP3: {
            available: s.exportAudioEnabled && verified("TTS"),
            reason: !s.exportAudioEnabled
                ? "管理者により無効"
                : verified("TTS")
                    ? ""
                    : "TTS接続テストが必要です",
        },
        MP4: {
            available: s.exportVideoEnabled &&
                !!apiKey("gemini") &&
                verified("VIDEO") &&
                verified("TTS"),
            reason: !s.exportVideoEnabled
                ? "管理者により無効"
                : !verified("VIDEO")
                    ? "Gemini動画接続テストが必要です"
                    : !verified("TTS")
                        ? "TTS接続テストが必要です"
                        : "",
        },
    };
}
export function checkExport(type) {
    const c = capabilities()[type];
    requireThat(c?.available, 403, "EXPORT_DISABLED", c?.reason || "無効な出力形式です");
}
export async function verifyVideoAccess() {
    checkExport("MP4");
    try {
        await gemini().models.get({ model: providers().videoModel });
    }
    catch {
        setSetting("verified:VIDEO", null);
        throw new AppError(403, "VIDEO_AUTHORIZATION_LOST", "Gemini動画の利用権限を再確認できませんでした。管理者が接続テストを実行してください");
    }
}
