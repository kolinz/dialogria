import { config as loadEnv } from "dotenv";
import { z } from "zod";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
} from "node:crypto";
let projectRoot = path.dirname(fileURLToPath(import.meta.url));
while (projectRoot !== path.dirname(projectRoot)) {
  const manifest = path.join(projectRoot, "package.json");
  if (
    existsSync(manifest) &&
    JSON.parse(readFileSync(manifest, "utf8")).name === "dialogria"
  )
    break;
  projectRoot = path.dirname(projectRoot);
}
loadEnv({ path: path.join(projectRoot, ".env"), quiet: true });
const env = z
  .object({
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    HOST: z.string().default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    WEB_ORIGIN: z.url().default("http://127.0.0.1:5173"),
    DATABASE_PATH: z.string().default("./data/dialogria.sqlite"),
    STORAGE_ROOT: z.string().default("./storage"),
    SESSION_SECRET: z.string().default(""),
    SETTINGS_ENCRYPTION_KEY: z.string().default(""),
    JOB_POLL_MS: z.coerce.number().min(100).default(1500),
    PDF_FONT: z.enum(["IPAexGothic", "IPAexMincho"]).default("IPAexGothic"),
    PDF_CODE_FONT: z
      .enum(["IPAexGothic", "IPAexMincho"])
      .default("IPAexGothic"),
    PDF_FONT_SIZE: z.coerce.number().int().min(8).max(18).default(11),
    PDF_PAGE_SIZE: z.enum(["A4", "LETTER"]).default("A4"),
    AI_LECTURER_SPEECH_MAX_CHARS: z.coerce
      .number()
      .int()
      .min(1)
      .max(4000)
      .default(200),
    PROVIDER_TIMEOUT_MS: z.coerce.number().min(1000).default(120000),
    LOCAL_PROVIDER_ORIGINS: z
      .string()
      .default(
        "http://127.0.0.1:11434,http://127.0.0.1:1234,http://127.0.0.1:50021",
      ),
  })
  .parse(process.env);
export const config = {
  ...env,
  projectRoot,
  storage: path.resolve(projectRoot, env.STORAGE_ROOT),
  database: path.resolve(projectRoot, env.DATABASE_PATH),
};
mkdirSync(config.storage, { recursive: true, mode: 0o700 });
mkdirSync(path.dirname(config.database), { recursive: true, mode: 0o700 });
function secret(name: string, value: string) {
  if (value.length >= 32) return value;
  if (config.NODE_ENV === "production")
    throw new Error(`${name} requires 32+ characters`);
  const file = path.join(config.storage, `.${name}`);
  if (existsSync(file)) return readFileSync(file, "utf8");
  const v = randomBytes(48).toString("base64url");
  writeFileSync(file, v, { mode: 0o600 });
  return v;
}
export const sessionSecret = secret("session", env.SESSION_SECRET);
const key = createHash("sha256")
  .update(secret("encryption", env.SETTINGS_ENCRYPTION_KEY))
  .digest();
export function encrypt(value: string) {
  const iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([c.update(value, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString("base64");
}
export function decrypt(value: string) {
  const b = Buffer.from(value, "base64");
  const d = createDecipheriv("aes-256-gcm", key, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
}
