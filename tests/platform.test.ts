import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { Models } from "openai/resources/models";
import { Responses } from "openai/resources/responses/responses";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer, type Server } from "node:http";
import request from "supertest";
import { hash } from "argon2";
import { io as clientSocket } from "socket.io-client";
import { EventEmitter } from "node:events";
import type { OpenAIRealtimeWS } from "openai/realtime/ws";
import OpenAI from "openai";
import sharp from "sharp";
import {
  realtimeSpeech,
  pcmWav,
  speechComparable,
} from "../apps/api/src/realtime-speech.js";
const root = await mkdtemp(path.join(tmpdir(), "dialogria-test-"));
process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = path.join(root, "db.sqlite");
process.env.STORAGE_ROOT = path.join(root, "storage");
process.env.LOCAL_PROVIDER_ORIGINS = "http://127.0.0.1:18768";
process.env.AI_LECTURER_SPEECH_MAX_CHARS = "237";
process.env.PDF_FONT = "IPAexMincho";
const { app } = await import("../apps/api/src/app.js");
const db = await import("../apps/api/src/db.js");
const provider = await import("../apps/api/src/providers.js");
const media = await import("../apps/api/src/media.js");
const pdf = await import("../apps/api/src/pdf.js");
const access = await import("../apps/api/src/access.js");
const spokenTexts: string[] = [];
const { createRealtimeServer } = await import("../apps/api/src/server.js");
const realtime = createRealtimeServer();
const { encrypt, decrypt } = await import("../apps/api/src/config.js");
const { authSchema } = await import("../packages/shared/src/index.js");
const admin = request.agent(app),
  a = request.agent(app),
  b = request.agent(app),
  c = request.agent(app);
let adminCsrf = "",
  aCsrf = "",
  bCsrf = "",
  cCsrf = "",
  aId = "",
  bId = "",
  room = "",
  privateRoom = "",
  inviteRoom = "",
  snapshot = "",
  aCookie = "",
  bCookie = "",
  mockServer: Server;

const settings = () => ({
  textProvider: "OLLAMA" as const,
  textModel: "test-model",
  textUrl: "http://127.0.0.1:18768",
  ttsProvider: "VOICEVOX" as const,
  ttsModel: "VOICEVOX",
  voice: "1",
  voicevoxUrl: "http://127.0.0.1:18768",
  videoModel: "gemini-omni-1.1-flash",
});
beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    realtime.server.once("error", reject);
    realtime.server.listen(18769, "127.0.0.1", resolve);
  });
  await media.command([
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=0.5",
    "-ar",
    "48000",
    "-ac",
    "1",
    path.join(root, "mock.wav"),
  ]);
  const wav = await readFile(path.join(root, "mock.wav"));
  mockServer = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/tags")
      return res.end(JSON.stringify({ models: [{ name: "test-model" }] }));
    if (req.url === "/api/chat")
      return res.end(
        JSON.stringify({
          message: { content: "これはテスト用のAI応答です。" },
        }),
      );
    if (req.url === "/speakers")
      return res.end(
        JSON.stringify([
          { name: "テスト音声", styles: [{ id: 1, name: "標準" }] },
        ]),
      );
    if (req.url?.startsWith("/audio_query")) {
      spokenTexts.push(
        new URL(req.url, "http://localhost").searchParams.get("text")!,
      );
      return res.end("{}");
    }
    if (req.url?.startsWith("/synthesis")) {
      res.setHeader("Content-Type", "audio/wav");
      return res.end(wav);
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((resolve, reject) => {
    mockServer.once("error", reject);
    (mockServer.listen(18768, "127.0.0.1", resolve), undefined);
  });
  const uid = db.id();
  db.run(
    "INSERT INTO users(id,email,password_hash,display_name,role,created_at) VALUES(?,?,?,?,?,?)",
    uid,
    "admin@test.invalid",
    await hash("admin-pass-123456"),
    "管理者",
    "ADMIN",
    db.now(),
  );
  const login = await admin
    .post("/api/auth/login")
    .send({ email: "admin@test.invalid", password: "admin-pass-123456" });
  expect(login.status).toBe(200);
  adminCsrf = login.body.data.csrf;
  for (const [agent, email, name] of [
    [a, "a@test.invalid", "学生A"],
    [b, "b@test.invalid", "学生B"],
    [c, "c@test.invalid", "学生C"],
  ] as const) {
    const r = await agent
      .post("/api/auth/register")
      .send({ email, password: "student-pass-12345", displayName: name });
    expect(r.status, r.text).toBe(201);
    if (agent === a) {
      aCookie = String(r.headers["set-cookie"][0]).split(";")[0];
      aCsrf = r.body.data.csrf;
      aId = r.body.data.user.id;
    } else if (agent === b) {
      bCookie = String(r.headers["set-cookie"][0]).split(";")[0];
      bCsrf = r.body.data.csrf;
      bId = r.body.data.user.id;
    } else cCsrf = r.body.data.csrf;
  }
});
afterAll(async () => {
  await new Promise<void>((resolve) => realtime.io.close(() => resolve()));
  await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  db.sqlite.close();
  await rm(root, { recursive: true, force: true });
});
describe("認証と認可", () => {
  it("一般ユーザーはユーザー作成・管理者アカウント編集を操作できない", async () => {
    expect(
      (await a.post("/api/admin/users").set("X-CSRF-Token", aCsrf).send({}))
        .status,
    ).toBe(403);
    expect(
      (await a.patch("/api/admin/account").set("X-CSRF-Token", aCsrf).send({}))
        .status,
    ).toBe(403);
  });
  it("画像は実形式を検証してWebP化し、第三者からの取得を拒否する", async () => {
    const bad = await a
      .post("/api/me/avatar")
      .set("X-CSRF-Token", aCsrf)
      .attach(
        "image",
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
        ),
        { filename: "image.png", contentType: "image/png" },
      );
    expect(bad.status).toBe(422);
    const png = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "#8c5af5" },
    })
      .png()
      .toBuffer();
    const result = await a
      .post("/api/me/avatar")
      .set("X-CSRF-Token", aCsrf)
      .attach("image", png, {
        filename: "image.png",
        contentType: "image/png",
      });
    expect(result.status, result.text).toBe(200);
    const file = result.body.data.path;
    const meta = await sharp(media.mediaPath(file)).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect((await c.get(`/api/images/${file}`)).status).toBe(404);
  });
  it(".env相当の値を初期値とし、管理画面の上書き・停止・復帰を優先する", async () => {
    process.env.GEMINI_API_KEY = "environment-test-key";
    expect(provider.apiKey("gemini")).toBe("environment-test-key");
    provider.saveProviders({
      ...settings(),
      speed: 1,
      geminiKey: "admin-test-key",
    });
    expect(provider.apiKey("gemini")).toBe("admin-test-key");
    expect((await admin.get("/api/admin/providers")).text).not.toContain(
      "admin-test-key",
    );
    provider.saveProviders({ ...settings(), speed: 1, geminiKey: "" });
    expect(provider.apiKey("gemini")).toBe("");
    await admin
      .post("/api/admin/providers/reset-env")
      .set("X-CSRF-Token", adminCsrf);
    expect(provider.apiKey("gemini")).toBe("environment-test-key");
    delete process.env.GEMINI_API_KEY;
  });
  it("管理一覧をサーバーでページングし、期間・レベルの絞込を受け付ける", async () => {
    const first = await admin.get("/api/admin/users?limit=1&offset=0"),
      second = await admin.get("/api/admin/users?limit=1&offset=1");
    expect(first.body.data).toHaveLength(1);
    expect(first.body.pageInfo.total).toBe(4);
    expect(second.body.data[0].id).not.toBe(first.body.data[0].id);
    const logs = await admin.get(
      "/api/admin/logs?level=INFO&from=2000-01-01&to=9999-12-31&limit=2",
    );
    expect(logs.status, logs.text).toBe(200);
    expect(
      logs.body.data.every((v: { level: string }) => v.level === "INFO"),
    ).toBe(true);
  });
  it("推奨OpenAI TTSイベントからWAVを作り、文章不一致を拒否（イベントfixture）", async () => {
    const client = new OpenAI({ apiKey: "test-only" });
    const factory =
      (mismatch = false) =>
      () => {
        const events = new EventEmitter();
        const socket = new EventEmitter();
        Object.assign(socket, { close: () => socket.emit("close") });
        Object.assign(events, {
          socket,
          send: (event: {
            response: { input: { content: { text: string }[] }[] };
          }) => {
            const text = event.response.input[0].content[0].text;
            setImmediate(() => {
              events.emit("response.output_audio.delta", {
                delta: Buffer.alloc(2400).toString("base64"),
              });
              events.emit("response.output_audio_transcript.done", {
                transcript: mismatch ? "別の文章" : text,
              });
              events.emit("response.done", {
                response: { status: "completed" },
              });
            });
          },
        });
        setImmediate(() => events.emit("session.created", {}));
        return events as unknown as OpenAIRealtimeWS;
      };
    const wav = await realtimeSpeech(
      client,
      "gpt-realtime-2.1-mini",
      "marin",
      "読み上げテスト。",
      5000,
      factory(),
    );
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.length).toBe(2444);
    await expect(
      realtimeSpeech(
        client,
        "gpt-realtime-2.1-mini",
        "marin",
        "元の文章",
        5000,
        factory(true),
      ),
    ).rejects.toThrow("一致");
    expect(speechComparable("ＡＢＣ。")).toBe(speechComparable("abc"));
  });
  it("認証なしのAPIとCSRFなしの更新を拒否", async () => {
    expect((await request(app).get("/api/rooms")).status).toBe(401);
    expect(
      (await a.patch("/api/me").send({ displayName: "攻撃" })).status,
    ).toBe(403);
  });
  it("秘密を暗号化し、認証DTOにパスワードを含めない", async () => {
    const e = encrypt("test-secret");
    expect(e).not.toContain("test-secret");
    expect(decrypt(e)).toBe("test-secret");
    const r = await a.get("/api/me");
    expect(r.body.data.user).not.toHaveProperty("password_hash");
    expect(
      authSchema.safeParse({ email: "x@test.invalid", password: "short" })
        .success,
    ).toBe(false);
  });
  it("一般ユーザーの管理APIを拒否", async () => {
    expect((await a.get("/api/admin/overview")).status).toBe(403);
    expect(
      (await a.post("/api/admin/lecturers").set("X-CSRF-Token", aCsrf).send({}))
        .status,
    ).toBe(403);
  });
  it("ローカルURL許可リストとリダイレクト先を限定", () => {
    expect(() => provider.localUrl("http://169.254.169.254")).toThrow();
    expect(() => provider.localUrl("http://127.0.0.1:18768/path")).toThrow();
  });
});
describe("OpenAI文章生成と管理者によるユーザー編集", () => {
  it("Responses APIで文章を生成し、入力・システム指示を分離する（SDK Mock）", async () => {
    const before = provider.providers(),
      oldKey = db.getSetting("openaiKey", null),
      verified = Object.fromEntries(
        ["TEXT", "TTS", "VIDEO"].map((p) => [
          p,
          db.getSetting(`verified:${p}`, null),
        ]),
      );
    const list = vi.spyOn(Models.prototype, "list").mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield { id: "gpt-text-test" };
        yield { id: "gpt-realtime-test" };
      },
    } as never);
    const create = vi.spyOn(Responses.prototype, "create").mockResolvedValue({
      status: "completed",
      output_text: "OpenAIのテスト回答です。",
    } as never);
    try {
      provider.saveProviders({
        ...before,
        textProvider: "OPENAI",
        textModel: "gpt-text-test",
        openaiKey: "test-only-not-real",
      });
      expect((await provider.models("TEXT")).models).toEqual(["gpt-text-test"]);
      expect(
        await provider.generateText("講師の上位指示", [
          { role: "user", content: "質問です。" },
        ]),
      ).toBe("OpenAIのテスト回答です。");
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gpt-text-test",
          instructions: "講師の上位指示",
          input: [{ role: "user", content: "質問です。" }],
          store: false,
        }),
      );
      await provider.testConnection("TEXT");
      expect(provider.verified("TEXT")).toBe(true);
      db.setSetting("openaiKey", encrypt("changed-test-key"));
      expect(provider.verified("TEXT")).toBe(false);
      const r = await a.post("/api/rooms").set("X-CSRF-Token", aCsrf).send({
        name: "外部送信不可",
        type: "PEER",
        visibility: "PRIVATE",
        externalConsent: false,
      });
      expect(r.status, r.text).toBe(201);
      expect(r.body.data.lecturerSpeechMaxChars).toBe(237);
      create.mockClear();
      expect(
        (
          await a
            .post("/api/ai/expand")
            .set("X-CSRF-Token", aCsrf)
            .send({ roomId: r.body.data.id, text: "外部には送らない質問" })
        ).status,
      ).toBe(403);
      expect(create).not.toHaveBeenCalled();
      create.mockResolvedValueOnce({
        status: "incomplete",
        output_text: "未完了",
      } as never);
      await expect(
        provider.generateText("指示", [{ role: "user", content: "質問" }]),
      ).rejects.toThrow("完了");
    } finally {
      list.mockRestore();
      create.mockRestore();
      provider.saveProviders(before);
      db.setSetting("openaiKey", oldKey);
      for (const p of ["TEXT", "TTS", "VIDEO"])
        db.setSetting(`verified:${p}`, verified[p]);
    }
  });
  it("管理者がユーザーを作成・編集・パスワード再設定でき、旧セッションを失効する", async () => {
    const body = {
      email: "managed@test.invalid",
      displayName: "作成されたユーザー",
      bio: "自己紹介",
      role: "USER",
      status: "ACTIVE",
      password: "admin-pass-123456",
      newPassword: "Managed-test-pass-2026!",
    };
    expect(
      (
        await admin
          .post("/api/admin/users")
          .set("X-CSRF-Token", adminCsrf)
          .send({ ...body, password: "incorrect" })
      ).status,
    ).toBe(403);
    const created = await admin
      .post("/api/admin/users")
      .set("X-CSRF-Token", adminCsrf)
      .send(body);
    expect(created.status, created.text).toBe(201);
    expect(created.text).not.toContain(body.newPassword);
    expect(created.text).not.toContain("password_hash");
    const uid = created.body.data.id,
      user = request.agent(app);
    expect(
      (
        await user
          .post("/api/auth/login")
          .send({ email: body.email, password: body.newPassword })
      ).status,
    ).toBe(200);
    expect(
      (
        await admin
          .post("/api/admin/users")
          .set("X-CSRF-Token", adminCsrf)
          .send(body)
      ).status,
    ).toBe(409);
    const edit = await admin
      .patch(`/api/admin/users/${uid}`)
      .set("X-CSRF-Token", adminCsrf)
      .send({
        ...body,
        email: "edited@test.invalid",
        displayName: "編集済み",
        bio: "変更した自己紹介",
        newPassword: "Changed-managed-2026!",
      });
    expect(edit.status, edit.text).toBe(200);
    expect((await user.get("/api/me")).status).toBe(401);
    const login = await user.post("/api/auth/login").send({
      email: "edited@test.invalid",
      password: "Changed-managed-2026!",
    });
    expect(login.status).toBe(200);
    expect(login.body.data.user.displayName).toBe("編集済み");
    expect(login.body.data.user.bio).toBe("変更した自己紹介");
  });
});
describe("ルームと確定投稿", () => {
  it("公開・非公開・招待制ルームを作成", async () => {
    for (const visibility of ["PUBLIC", "PRIVATE", "INVITE_ONLY"]) {
      const r = await a
        .post("/api/rooms")
        .set("X-CSRF-Token", aCsrf)
        .send({
          name: `テスト ${visibility}`,
          type: "PEER",
          visibility,
          externalConsent: true,
          invitees: visibility === "INVITE_ONLY" ? [bId] : [],
        });
      expect(r.status, r.text).toBe(201);
      if (visibility === "PUBLIC") room = r.body.data.id;
      else if (visibility === "PRIVATE") privateRoom = r.body.data.id;
      else inviteRoom = r.body.data.id;
    }
  });
  it("非参加者の閲覧と非公開ルーム検索を拒否", async () => {
    expect((await b.get(`/api/rooms/${privateRoom}`)).status).toBe(403);
    const r = await b.get("/api/rooms");
    expect(r.body.data.some((r: { id: string }) => r.id === privateRoom)).toBe(
      false,
    );
    expect(
      (
        await c
          .post(`/api/rooms/${inviteRoom}/join`)
          .set("X-CSRF-Token", cCsrf)
          .send({ externalConsent: true })
      ).status,
    ).toBe(403);
  });
  it("招待を受諾し公開ルームへ参加", async () => {
    expect(
      (
        await b
          .post(`/api/rooms/${inviteRoom}/join`)
          .set("X-CSRF-Token", bCsrf)
          .send({ externalConsent: true })
      ).status,
    ).toBe(200);
    expect(
      (
        await b
          .post(`/api/rooms/${room}/join`)
          .set("X-CSRF-Token", bCsrf)
          .send({ externalConsent: true })
      ).status,
    ).toBe(200);
  });
  it("A/B/Aの順序と冪等キーで二重投稿を防止", async () => {
    const clientId = db.id(),
      body = {
        clientId,
        mode: "ORIGINAL",
        originalText: "Aの最初の質問",
        finalText: "Aの最初の質問",
      };
    const r = await a
      .post(`/api/rooms/${room}/messages`)
      .set("X-CSRF-Token", aCsrf)
      .send(body);
    expect(r.status, r.text).toBe(201);
    const duplicate = await a
      .post(`/api/rooms/${room}/messages`)
      .set("X-CSRF-Token", aCsrf)
      .send(body);
    expect(duplicate.body.data.id).toBe(r.body.data.id);
    await b
      .post(`/api/rooms/${room}/messages`)
      .set("X-CSRF-Token", bCsrf)
      .send({
        clientId: db.id(),
        mode: "AI_EXPANDED",
        originalText: "Bの原文",
        finalText: "Bが確認して採用した文章",
      });
    await a
      .post(`/api/rooms/${room}/messages`)
      .set("X-CSRF-Token", aCsrf)
      .send({
        clientId: db.id(),
        mode: "ORIGINAL",
        originalText: "Aの続き",
        finalText: "Aの続き",
      });
    const messages = await a.get(`/api/rooms/${room}/messages`);
    expect(
      messages.body.data.map((m: { sequenceNo: number }) => m.sequenceNo),
    ).toEqual([1, 2, 3]);
  });
  it("投稿後の種別変更と参加者による編集を拒否", async () => {
    expect(
      (
        await b
          .patch(`/api/rooms/${room}`)
          .set("X-CSRF-Token", bCsrf)
          .send({ name: "変更", type: "PEER", visibility: "PUBLIC" })
      ).status,
    ).toBe(403);
    expect(
      (
        await a.patch(`/api/rooms/${room}`).set("X-CSRF-Token", aCsrf).send({
          name: "変更",
          type: "AI_LECTURER",
          lecturerId: db.id(),
          visibility: "PUBLIC",
        })
      ).status,
    ).toBe(409);
  });
});
describe("出力制御・プロバイダー・固定教材", () => {
  it("Geminiキーなしで動画ONと生成を拒否", async () => {
    const s = provider.systemSettings();
    expect(
      (
        await admin
          .patch("/api/admin/system")
          .set("X-CSRF-Token", adminCsrf)
          .send({ ...s, exportVideoEnabled: true })
      ).status,
    ).toBe(409);
    expect(
      (
        await a
          .post(`/api/rooms/${room}/exports`)
          .set("X-CSRF-Token", aCsrf)
          .send({ type: "MP4", options: {} })
      ).status,
    ).toBe(403);
  });
  it("MockのOllama/VOICEVOX接続検証と音声ON", async () => {
    expect(
      (
        await admin
          .patch("/api/admin/providers")
          .set("X-CSRF-Token", adminCsrf)
          .send(settings())
      ).status,
    ).toBe(200);
    for (const purpose of ["TEXT", "TTS"]) {
      const r = await admin
        .post("/api/admin/providers/test")
        .set("X-CSRF-Token", adminCsrf)
        .send({ purpose });
      expect(r.status, r.text).toBe(200);
    }
    expect(
      (
        await admin
          .patch("/api/admin/system")
          .set("X-CSRF-Token", adminCsrf)
          .send({ ...provider.systemSettings(), exportAudioEnabled: true })
      ).status,
    ).toBe(200);
  });
  it("AI拡張は候補を生成するだけで投稿を増やさない", async () => {
    const r = await a
      .post("/api/ai/expand")
      .set("X-CSRF-Token", aCsrf)
      .send({ roomId: room, text: "質問" });
    expect(r.status, r.text).toBe(200);
    expect((await a.get(`/api/rooms/${room}/messages`)).body.data).toHaveLength(
      3,
    );
  });
  it("3投稿スナップショットは新投稿後も不変", async () => {
    const r = await a
      .post(`/api/rooms/${room}/snapshots`)
      .set("X-CSRF-Token", aCsrf);
    expect(r.status, r.text).toBe(201);
    snapshot = r.body.data.id;
    await a
      .post(`/api/rooms/${room}/messages`)
      .set("X-CSRF-Token", aCsrf)
      .send({
        clientId: db.id(),
        mode: "ORIGINAL",
        originalText: "4番目",
        finalText: "4番目",
      });
    expect(media.snapshotItems(snapshot)).toHaveLength(3);
    expect(() =>
      db.run(
        "UPDATE export_snapshot_items SET data=? WHERE snapshot_id=?",
        "{}",
        snapshot,
      ),
    ).toThrow();
  });
  it("同じ3投稿をMarkdown1ファイルへ出力", async () => {
    const r = await a
      .post(`/api/rooms/${room}/exports`)
      .set("X-CSRF-Token", aCsrf)
      .send({ type: "MARKDOWN", snapshotId: snapshot });
    expect(r.status, r.text).toBe(202);
    await media.tick();
    const job = db.one<import("../apps/api/src/db.js").JobRow>(
      "SELECT * FROM export_jobs WHERE id=?",
      r.body.data.id,
    )!;
    expect(job.status, job.error ?? "").toBe("ready");
    const content = await readFile(media.mediaPath(job.file_name!), "utf8");
    expect(content).toContain("投稿数: 3");
    expect(content).not.toContain("4番目");
    expect(content).toContain("Bの原文");
    expect((await c.get(`/api/exports/${job.id}/download`)).status).toBe(403);
  });
  it("PDF設定は環境変数を初期値にし、管理者のみ保存・プレビュー・リセット可能", async () => {
    expect((await a.get("/api/admin/pdf")).status).toBe(403);
    const defaults = (await admin.get("/api/admin/pdf")).body.data;
    expect(defaults.source).toBe("env");
    expect(defaults.settings.font).toBe("IPAexMincho");
    const settings = {
      ...defaults.settings,
      font: "IPAexGothic",
      fontSize: 12,
    };
    expect((await admin.patch("/api/admin/pdf").send(settings)).status).toBe(
      403,
    );
    for (const invalid of [
      { font: "../../.env" },
      { fontSize: 99 },
      { pageSize: "unknown" },
    ]) {
      expect(
        (
          await admin
            .patch("/api/admin/pdf")
            .set("X-CSRF-Token", adminCsrf)
            .send({ ...settings, ...invalid })
        ).status,
      ).toBe(422);
    }
    const preview = await admin
      .post("/api/admin/pdf/preview")
      .set("X-CSRF-Token", adminCsrf)
      .send(settings);
    expect(preview.status, preview.text).toBe(200);
    expect(preview.headers["content-type"]).toContain("application/pdf");
    expect(pdf.pdfSettings().font).toBe("IPAexMincho");
    expect(
      (
        await admin
          .patch("/api/admin/pdf")
          .set("X-CSRF-Token", adminCsrf)
          .send(settings)
      ).status,
    ).toBe(200);
    expect(pdf.pdfSettings()).toEqual(settings);
    expect((await admin.get("/api/admin/pdf")).body.data.source).toBe(
      "database",
    );
    await admin.delete("/api/admin/pdf").set("X-CSRF-Token", adminCsrf);
    expect(pdf.pdfSettings().font).toBe("IPAexMincho");
  });
  it("PDFは固定済みの全投稿と埋め込みフォントで生成し、設定変更を別ジョブにする", async () => {
    const response = await a
      .post(`/api/rooms/${room}/exports`)
      .set("X-CSRF-Token", aCsrf)
      .send({ type: "PDF", snapshotId: snapshot });
    expect(response.status, response.text).toBe(202);
    const jobId = response.body.data.id;
    expect(response.body.data.options.font).toBe("IPAexMincho");
    db.setSetting("pdf", { ...pdf.pdfDefaults(), font: "IPAexGothic" });
    await media.tick();
    const job = db.one<import("../apps/api/src/db.js").JobRow>(
      "SELECT * FROM export_jobs WHERE id=?",
      jobId,
    )!;
    expect(job.status, job.error ?? "").toBe("ready");
    const buffer = await readFile(media.mediaPath(job.file_name!));
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(buffer.toString("latin1")).toContain("/FontFile2");
    expect(buffer.toString("latin1")).toContain("IPAexMincho");
    expect(media.snapshotItems(job.snapshot_id)).toHaveLength(3);
    expect((await a.get(`/api/exports/${jobId}/download`)).status).toBe(200);
    expect((await c.get(`/api/exports/${jobId}/download`)).status).toBe(403);
    const next = await a
      .post(`/api/rooms/${room}/exports`)
      .set("X-CSRF-Token", aCsrf)
      .send({ type: "PDF", snapshotId: snapshot });
    expect(next.body.data.id).not.toBe(jobId);
    expect(next.body.data.options.font).toBe("IPAexGothic");
    await media.tick();
    db.setSetting("system", {
      ...provider.systemSettings(),
      exportTextEnabled: false,
    });
    expect((await a.get(`/api/exports/${jobId}/download`)).status).toBe(403);
    expect(
      (
        await a
          .post(`/api/rooms/${room}/exports`)
          .set("X-CSRF-Token", aCsrf)
          .send({ type: "PDF" })
      ).status,
    ).toBe(403);
    db.setSetting("system", {
      ...provider.systemSettings(),
      exportTextEnabled: true,
    });
    await admin.delete("/api/admin/pdf").set("X-CSRF-Token", adminCsrf);
  });
  it("未試聴Bも含む全3投稿をMP3へ各1回収録", async () => {
    const r = await a
      .post(`/api/rooms/${room}/exports`)
      .set("X-CSRF-Token", aCsrf)
      .send({ type: "MP3", snapshotId: snapshot });
    expect(r.status, r.text).toBe(202);
    await media.tick();
    const job = db.one<import("../apps/api/src/db.js").JobRow>(
      "SELECT * FROM export_jobs WHERE id=?",
      r.body.data.id,
    )!;
    expect(job.status, job.error ?? "").toBe("ready");
    expect(job.duration_ms).toBeGreaterThan(1400);
    expect(job.duration_ms).toBeLessThan(1700);
    const probe = await media.probe(media.mediaPath(job.file_name!));
    expect(probe.streams[0]?.codec_name).toBe("mp3");
    expect(
      db.one<{ n: number }>("SELECT count(*) n FROM audio_segments")!.n,
    ).toBe(3);
  });
  it("音声OFFは保存済みMP3の取得も拒否", async () => {
    const job = db.one<{ id: string }>(
      "SELECT id FROM export_jobs WHERE type='MP3'",
    )!;
    db.setSetting("system", {
      ...provider.systemSettings(),
      exportAudioEnabled: false,
    });
    expect((await a.get(`/api/exports/${job.id}/download`)).status).toBe(403);
    db.setSetting("system", {
      ...provider.systemSettings(),
      exportAudioEnabled: true,
    });
  });
  it("許諾なしは匿名画像・順序付きタイムライン", () => {
    expect(media.snapshotItems(snapshot).every((m) => !m.avatar)).toBe(true);
    expect(
      media.timeline([
        { durationMs: 100 },
        { durationMs: 200 },
        { durationMs: 300 },
      ]),
    ).toEqual([
      { durationMs: 100, startMs: 0, endMs: 100 },
      { durationMs: 200, startMs: 100, endMs: 300 },
      { durationMs: 300, startMs: 300, endMs: 600 },
    ]);
  });
});
describe("講師と管理の整合性", () => {
  it("2クライアントで確定投稿を同期し、退出後の購読を拒否する", async () => {
    const make = (cookie: string, csrf: string) =>
      clientSocket("http://127.0.0.1:18769", {
        transports: ["websocket"],
        extraHeaders: { Cookie: cookie },
        auth: { csrf },
        reconnection: false,
      });
    const sa = make(aCookie, aCsrf),
      sb = make(bCookie, bCsrf);
    try {
      await Promise.all(
        [sa, sb].map(
          (socket) =>
            new Promise<void>((resolve, reject) => {
              socket.once("connect", resolve);
              socket.once("connect_error", reject);
            }),
        ),
      );
      await Promise.all(
        [sa, sb].map(
          (socket) =>
            new Promise<void>((resolve) =>
              socket.emit("room:join", room, () => resolve()),
            ),
        ),
      );
      const received = Promise.all(
        [sa, sb].map(
          (socket) =>
            new Promise<{ sequenceNo: number; finalText: string }>((resolve) =>
              socket.once("message:committed", resolve),
            ),
        ),
      );
      await a
        .post(`/api/rooms/${room}/messages`)
        .set("X-CSRF-Token", aCsrf)
        .send({
          clientId: db.id(),
          mode: "ORIGINAL",
          originalText: "同期確認",
          finalText: "同期確認",
        });
      const results = await received;
      expect(results[0].sequenceNo).toBe(results[1].sequenceNo);
      expect(results[1].finalText).toBe("同期確認");
      const revoked = new Promise<string>((resolve) =>
        sb.once("room:revoked", resolve),
      );
      await b.post(`/api/rooms/${room}/leave`).set("X-CSRF-Token", bCsrf);
      expect(await revoked).toBe(room);
      const denied = await new Promise<{ error: string }>((resolve) =>
        sb.emit("room:join", room, resolve),
      );
      expect(denied.error).toBe("FORBIDDEN");
      expect((await b.get(`/api/rooms/${room}/messages`)).status).toBe(403);
    } finally {
      sa.disconnect();
      sb.disconnect();
    }
  });
  it("アバター合成MP4の実ファイルを16:9/9:16で検証（Gemini条件はテスト用注入）", async () => {
    const previous = provider.systemSettings();
    db.setSetting("geminiKey", encrypt("test-only-never-sent"));
    db.setSetting("verified:VIDEO", {
      at: Date.now(),
      fingerprint: provider.connectionFingerprint("VIDEO"),
    });
    db.setSetting("system", { ...previous, exportVideoEnabled: true });
    try {
      for (const aspectRatio of ["16:9", "9:16"] as const) {
        const j = media.enqueue(room, aId, "MP4", snapshot, {
          mode: "AVATAR_DIALOGUE",
          aspectRatio,
          subtitles: aspectRatio === "16:9",
          externalConsent: false,
          budget: 1,
        });
        await media.renderJob(j);
        const done = db.one<import("../apps/api/src/db.js").JobRow>(
          "SELECT * FROM export_jobs WHERE id=?",
          j.id,
        )!;
        expect(done.status, done.error ?? "").toBe("ready");
        const info = await media.probe(media.mediaPath(done.file_name!));
        const video = info.streams.find((s) => s.codec_type === "video")!;
        expect(video.codec_name).toBe("h264");
        expect(info.streams.some((s) => s.codec_name === "aac")).toBe(true);
        expect(video.width).toBe(aspectRatio === "16:9" ? 1280 : 720);
        expect(video.height).toBe(aspectRatio === "16:9" ? 720 : 1280);
        expect(Number(info.format.duration)).toBeGreaterThan(1.4);
      }
    } finally {
      db.setSetting("geminiKey", "");
      db.setSetting("verified:VIDEO", null);
      db.setSetting("system", previous);
    }
    const job = db.one<{ id: string }>(
      "SELECT id FROM export_jobs WHERE type='MP4' LIMIT 1",
    )!;
    expect((await a.get(`/api/exports/${job.id}/download`)).status).toBe(403);
  });
  it("発話の文字制限はMarkdownを除去後に適用し、絵文字を壊さない", () => {
    expect(media.lecturerSpeechText("**あ😀いう**", 3)).toBe("あ😀い");
    expect(media.lecturerSpeechText("短文", 200)).toBe("短文");
    expect(media.lecturerSpeechText("   ", 1)).toBe("空");
  });
  it("登録講師の設定版を固定し、ルームごとの発話上限を保存・変更して音声APIに適用", async () => {
    const body = {
      name: "テスト講師",
      subject: "情報",
      description: "テスト用",
      systemPrompt: "説明する",
      tone: "丁寧",
      provider: "OLLAMA",
      model: "test-model",
      voice: "1",
      status: "ACTIVE",
      version: 0,
    };
    const l = await admin
      .post("/api/admin/lecturers")
      .set("X-CSRF-Token", adminCsrf)
      .send(body);
    expect(l.status, l.text).toBe(200);
    const lid = l.body.data.id;
    const r = await a.post("/api/rooms").set("X-CSRF-Token", aCsrf).send({
      name: "講師版テスト",
      type: "AI_LECTURER",
      visibility: "PRIVATE",
      lecturerId: lid,
      lecturerSpeechMaxChars: 7,
    });
    expect(r.status, r.text).toBe(201);
    expect(r.body.data.lecturerVersion).toBe(1);
    expect(r.body.data.lecturerSpeechMaxChars).toBe(7);
    expect(
      (await a.get("/api/rooms/defaults")).body.data.lecturerSpeechMaxChars,
    ).toBe(237);
    const rid = r.body.data.id;
    const answer = "**あ😀いうえおかきくけこさしすせそ**";
    const message = access.insertMessage(
      rid,
      null,
      lid,
      "AI_LECTURER",
      answer,
      answer,
      db.id(),
    );
    const speak = () =>
      a
        .post(`/api/rooms/${rid}/messages/${message.id}/speak`)
        .set("X-CSRF-Token", aCsrf);
    expect((await speak()).status).toBe(200);
    expect(spokenTexts.at(-1)).toBe("あ😀いうえおか");
    const audioResult = await a.get(
      `/api/rooms/${rid}/messages/${message.id}/audio`,
    );
    expect(audioResult.status).toBe(200);
    expect(spokenTexts.at(-1)).toBe("あ😀いうえおか");
    for (const limit of [0, 4001, 1.5]) {
      expect(
        (
          await a
            .patch(`/api/rooms/${rid}`)
            .set("X-CSRF-Token", aCsrf)
            .send({ ...r.body.data, lecturerSpeechMaxChars: limit })
        ).status,
      ).toBe(422);
    }
    const changed = await a
      .patch(`/api/rooms/${rid}`)
      .set("X-CSRF-Token", aCsrf)
      .send({ ...r.body.data, lecturerSpeechMaxChars: 3 });
    expect(changed.status, changed.text).toBe(200);
    expect(
      (await a.get(`/api/rooms/${rid}`)).body.data.lecturerSpeechMaxChars,
    ).toBe(3);
    expect((await speak()).status).toBe(200);
    expect(spokenTexts.at(-1)).toBe("あ😀い");
    expect(
      db.one<{ final_text: string }>(
        "SELECT final_text FROM messages WHERE id=?",
        message.id,
      )?.final_text,
    ).toBe(answer);
    const participant = access.insertMessage(
      rid,
      aId,
      aId,
      "ORIGINAL",
      "参加者は全文読み上げ",
      "参加者は全文読み上げ",
      db.id(),
    );
    expect(
      (
        await a
          .post(`/api/rooms/${rid}/messages/${participant.id}/speak`)
          .set("X-CSRF-Token", aCsrf)
      ).status,
    ).toBe(200);
    expect(spokenTexts.at(-1)).toBe("参加者は全文読み上げ");
    expect(
      (
        await admin
          .patch(`/api/admin/lecturers/${lid}`)
          .set("X-CSRF-Token", adminCsrf)
          .send({ ...body, version: 1, systemPrompt: "変更した指示" })
      ).status,
    ).toBe(200);
    expect(
      db.one<{ lecturer_version: number }>(
        "SELECT lecturer_version FROM rooms WHERE id=?",
        r.body.data.id,
      )?.lecturer_version,
    ).toBe(1);
    expect(() =>
      db.run(
        "UPDATE ai_lecturer_versions SET data=? WHERE lecturer_id=?",
        "{}",
        lid,
      ),
    ).toThrow();
    const publicList = await a.get("/api/lecturers");
    expect(publicList.text).not.toContain("systemPrompt");
    await admin
      .delete(`/api/admin/lecturers/${lid}`)
      .set("X-CSRF-Token", adminCsrf);
    expect(
      (
        await a.post("/api/rooms").set("X-CSRF-Token", aCsrf).send({
          name: "無効講師",
          type: "AI_LECTURER",
          visibility: "PRIVATE",
          lecturerId: lid,
        })
      ).status,
    ).toBe(422);
  });
  it("管理者強制削除は理由必須・削除後の参照を拒否", async () => {
    expect(
      (
        await admin
          .delete(`/api/admin/rooms/${inviteRoom}`)
          .set("X-CSRF-Token", adminCsrf)
          .send({})
      ).status,
    ).toBe(422);
    const roomQuery = `q=${encodeURIComponent(db.one<{ name: string }>("SELECT name FROM rooms WHERE id=?", inviteRoom)!.name)}`;
    const activeBefore = await admin.get(
      `/api/admin/rooms?status=ACTIVE&${roomQuery}`,
    );
    expect(
      activeBefore.body.data.some(
        (room: { id: string }) => room.id === inviteRoom,
      ),
    ).toBe(true);
    expect(
      (
        await admin
          .delete(`/api/admin/rooms/${inviteRoom}`)
          .set("X-CSRF-Token", adminCsrf)
          .send({ reason: "テスト終了" })
      ).status,
    ).toBe(200);
    const activeAfter = await admin.get(
      `/api/admin/rooms?status=ACTIVE&${roomQuery}`,
    );
    expect(
      activeAfter.body.data.some(
        (room: { id: string }) => room.id === inviteRoom,
      ),
    ).toBe(false);
    const deleted = await admin.get(
      `/api/admin/rooms?status=DELETED&${roomQuery}`,
    );
    expect(
      deleted.body.data.find((room: { id: string }) => room.id === inviteRoom)
        ?.deletedAt,
    ).toBeTruthy();
    expect(activeAfter.body.pageInfo.total).toBe(
      activeBefore.body.pageInfo.total - 1,
    );
    expect((await a.get(`/api/rooms/${inviteRoom}`)).status).toBe(404);
    expect(
      db.one<{ detail: string }>(
        "SELECT detail FROM audit_logs WHERE event='ADMIN_ROOM_DELETED' AND target_id=?",
        inviteRoom,
      )?.detail,
    ).toContain("テスト終了");
  });
});
