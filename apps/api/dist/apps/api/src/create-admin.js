import { hash } from "argon2";
import { id, now, one, run, sqlite, audit } from "./db.js";
import { authSchema } from "../../../packages/shared/src/index.js";
import { createInterface } from "node:readline/promises";
const rl = createInterface({ input: process.stdin, output: process.stdout });
const email = await rl.question("Admin email: ");
const displayName = await rl.question("Display name: ");
// パスワードをコマンド引数・ログへ出さない。
process.stdout.write("Password (12+ characters, input hidden): ");
const password = await new Promise((resolve) => {
    if (!process.stdin.isTTY) {
        rl.question("").then(resolve);
        return;
    }
    rl.close();
    process.stdin.setRawMode(true);
    let v = "";
    process.stdin.on("data", function onData(chunk) {
        for (const c of chunk.toString()) {
            if (c === "\r" || c === "\n") {
                process.stdin.off("data", onData);
                process.stdin.setRawMode(false);
                process.stdin.pause();
                process.stdout.write("\n");
                resolve(v);
                return;
            }
            if (c === "\u0003")
                process.exit(1);
            if (c === "\u007f")
                v = v.slice(0, -1);
            else
                v += c;
        }
    });
});
const data = authSchema.parse({ email, password, displayName });
if (one("SELECT id FROM users WHERE email=?", data.email))
    throw new Error("Account already exists; use the admin UI for role changes.");
const userId = id();
run("INSERT INTO users(id,email,password_hash,display_name,role,created_at) VALUES(?,?,?,?,?,?)", userId, data.email, await hash(data.password), data.displayName ?? "管理者", "ADMIN", now());
audit(userId, "ADMIN_BOOTSTRAP", userId);
rl.close();
sqlite.close();
console.log("Admin created.");
