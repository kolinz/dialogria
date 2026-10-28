import { hash, argon2id } from "argon2";
import { authSchema } from "../../../packages/shared/src/index.js";
import {
  sqlite,
  one,
  run,
  id,
  now,
  audit,
  getSetting,
  setSetting,
} from "./db.js";
type InitialAdmin = { email?: string; password?: string; displayName?: string };
/** 初期値は一度だけ採用する。既存アカウントの昇格やパスワード再設定には使わない。 */
export async function bootstrapAdmin(
  input: InitialAdmin = {
    email: process.env.INITIAL_ADMIN_EMAIL,
    password: process.env.INITIAL_ADMIN_PASSWORD,
    displayName: process.env.INITIAL_ADMIN_DISPLAY_NAME,
  },
) {
  if (getSetting("initialAdminBootstrapped", null)) return false;
  if (!input.email && !input.password) return false;
  const parsed = authSchema.safeParse({
    email: input.email?.trim(),
    password: input.password,
    displayName: input.displayName?.trim() || "管理者",
  });
  if (!parsed.success)
    throw new Error(
      "INITIAL_ADMIN_EMAIL/PASSWORD/DISPLAY_NAME の設定が不正です。メール形式、12〜128文字のパスワード、1〜40文字の表示名を確認してください。",
    );
  const data = parsed.data,
    passwordHash = await hash(data.password, { type: argon2id });
  return sqlite.transaction(() => {
    if (getSetting("initialAdminBootstrapped", null)) return false;
    if (one("SELECT 1 FROM users WHERE email=?", data.email))
      throw new Error(
        "初期管理者のメールアドレスは既存アカウントと重複しています。既存の権限・パスワードは変更しません。管理画面から変更してください。",
      );
    const uid = id();
    run(
      "INSERT INTO users(id,email,password_hash,display_name,role,created_at) VALUES(?,?,?,?,?,?)",
      uid,
      data.email,
      passwordHash,
      data.displayName,
      "ADMIN",
      now(),
    );
    setSetting("initialAdminBootstrapped", { userId: uid, createdAt: now() });
    audit(uid, "ADMIN_BOOTSTRAP_ENV", uid);
    return true;
  })();
}
