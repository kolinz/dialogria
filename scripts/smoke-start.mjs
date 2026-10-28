import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const dir = await mkdtemp(path.join(tmpdir(), "dialogria-start-"));
const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.on("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    server.close(() => resolve(address.port));
  });
});
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["apps/api/dist/apps/api/src/index.js"], {
  env: {
    ...process.env,
    NODE_ENV: "test",
    INITIAL_ADMIN_EMAIL: "",
    INITIAL_ADMIN_PASSWORD: "",
    INITIAL_ADMIN_DISPLAY_NAME: "",
    PORT: String(port),
    HOST: "127.0.0.1",
    WEB_ORIGIN: origin,
    DATABASE_PATH: path.join(dir, "db.sqlite"),
    STORAGE_ROOT: path.join(dir, "storage"),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let exitCode = null,
  log = "";
child.on("exit", (code) => {
  exitCode = code;
});
child.stderr.on("data", (chunk) => {
  log += chunk.toString();
});
try {
  let ready = false;
  for (let i = 0; i < 40; i++) {
    if (exitCode !== null)
      throw new Error(`Startup failed (${exitCode}): ${log.slice(-1000)}`);
    try {
      const health = await fetch(`${origin}/api/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (health.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(ready, "API did not become ready");
  const web = await fetch(origin);
  assert.equal(web.status, 200);
  assert((await web.text()).includes("Dialogria"));
  assert.equal((await fetch(`${origin}/api/me`)).status, 401);
  assert.equal(web.headers.get("x-frame-options"), "SAMEORIGIN");
  console.log(
    "Built server: health, static Web, authentication and security headers passed.",
  );
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once("exit", resolve);
    setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5000).unref();
  });
  await rm(dir, { recursive: true, force: true });
}
