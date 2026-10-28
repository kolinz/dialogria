import { beforeEach, afterAll, describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { hash, verify } from "argon2";
const dir = await mkdtemp(path.join(tmpdir(), "dialogria-bootstrap-"));
process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = path.join(dir, "db.sqlite");
process.env.STORAGE_ROOT = path.join(dir, "storage");
const db = await import("../apps/api/src/db.js");
const { bootstrapAdmin } = await import("../apps/api/src/bootstrap-admin.js");
const { app } = await import("../apps/api/src/app.js");
const initial = {
  email: "initial-admin@test.invalid",
  password: "Initial-test-pass-2026!",
  displayName: "初期管理者",
};
beforeEach(() =>
  db.sqlite.exec(
    "DELETE FROM auth_sessions; DELETE FROM audit_logs; DELETE FROM settings; DELETE FROM users;",
  ),
);
afterAll(async () => {
  db.sqlite.close();
  await rm(dir, { recursive: true, force: true });
});
describe(".env初期管理者", () => {
  it("同時に初期化しても管理者を二重作成しない", async () => {
    const results = await Promise.all([
      bootstrapAdmin(initial),
      bootstrapAdmin({ ...initial, email: "other-initial@test.invalid" }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(db.one<{ n: number }>("SELECT count(*) n FROM users")!.n).toBe(1);
  });
  it("未設定なら作らず、設定不足を拒否し、秘密値をエラーに含めない", async () => {
    expect(await bootstrapAdmin({})).toBe(false);
    await expect(
      bootstrapAdmin({ password: "sensitive-short" }),
    ).rejects.toThrow("設定が不正");
    expect(db.one<{ n: number }>("SELECT count(*) n FROM users")!.n).toBe(0);
  });
  it("初回だけ作成し、DBにはハッシュだけを保存する", async () => {
    expect(await bootstrapAdmin(initial)).toBe(true);
    const u = db.one<import("../apps/api/src/db.js").UserRow>(
      "SELECT * FROM users",
    )!;
    expect(u.role).toBe("ADMIN");
    expect(u.display_name).toBe(initial.displayName);
    expect(u.password_hash).not.toContain(initial.password);
    expect(await verify(u.password_hash, initial.password)).toBe(true);
    expect(
      await bootstrapAdmin({ ...initial, password: "Other-test-pass-2026!" }),
    ).toBe(false);
    expect(
      await verify(
        db.one<{ password_hash: string }>("SELECT password_hash FROM users")!
          .password_hash,
        initial.password,
      ),
    ).toBe(true);
  });
  it("既存の一般ユーザーを.envの指定で昇格・上書きしない", async () => {
    db.run(
      "INSERT INTO users(id,email,password_hash,display_name,role,created_at) VALUES(?,?,?,?,?,?)",
      db.id(),
      initial.email,
      await hash("User-password-2026!"),
      "既存ユーザー",
      "USER",
      db.now(),
    );
    await expect(bootstrapAdmin(initial)).rejects.toThrow("既存アカウント");
    const u = db.one<import("../apps/api/src/db.js").UserRow>(
      "SELECT * FROM users",
    )!;
    expect(u.role).toBe("USER");
    expect(await verify(u.password_hash, "User-password-2026!")).toBe(true);
  });
  it("管理画面APIでログイン情報を変更でき、旧セッションを失効し、再起動で復元しない", async () => {
    await bootstrapAdmin(initial);
    const agent = request.agent(app);
    const login = await agent
      .post("/api/auth/login")
      .send({ email: initial.email, password: initial.password });
    expect(login.status).toBe(200);
    const token = login.body.data.csrf;
    const body = {
      email: "changed-admin@test.invalid",
      displayName: "変更後の管理者",
      currentPassword: initial.password,
      newPassword: "Changed-test-pass-2026!",
    };
    expect(
      (
        await agent
          .patch("/api/admin/account")
          .set("X-CSRF-Token", token)
          .send({ ...body, currentPassword: "incorrect" })
      ).status,
    ).toBe(403);
    const update = await agent
      .patch("/api/admin/account")
      .set("X-CSRF-Token", token)
      .send(body);
    expect(update.status, update.text).toBe(200);
    expect(update.body.data.requiresLogin).toBe(true);
    expect((await agent.get("/api/me")).status).toBe(401);
    expect(await bootstrapAdmin(initial)).toBe(false);
    expect(db.one<{ n: number }>("SELECT count(*) n FROM users")!.n).toBe(1);
    const next = await agent
      .post("/api/auth/login")
      .send({ email: body.email, password: body.newPassword });
    expect(next.status).toBe(200);
    expect(next.body.data.user.displayName).toBe(body.displayName);
    expect((await agent.get("/api/admin/account")).text).not.toContain(
      "password",
    );
  });
  it("名前だけの変更は再ログインを要求せず、既存メールとの重複は拒否する", async () => {
    await bootstrapAdmin(initial);
    db.run(
      "INSERT INTO users(id,email,password_hash,display_name,role,created_at) VALUES(?,?,?,?,?,?)",
      db.id(),
      "existing@test.invalid",
      await hash("Other-test-pass-2026!"),
      "既存",
      "USER",
      db.now(),
    );
    const agent = request.agent(app),
      login = await agent.post("/api/auth/login").send(initial),
      token = login.body.data.csrf;
    const update = await agent
      .patch("/api/admin/account")
      .set("X-CSRF-Token", token)
      .send({
        email: initial.email,
        displayName: "新しい表示名",
        currentPassword: initial.password,
      });
    expect(update.body.data.requiresLogin).toBe(false);
    expect((await agent.get("/api/me")).body.data.user.displayName).toBe(
      "新しい表示名",
    );
    expect(
      (
        await agent
          .patch("/api/admin/account")
          .set("X-CSRF-Token", token)
          .send({
            email: "existing@test.invalid",
            displayName: "同名",
            currentPassword: initial.password,
          })
      ).status,
    ).toBe(409);
  });
});
