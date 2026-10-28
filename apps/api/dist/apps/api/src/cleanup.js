import { all, one, run, sqlite } from "./db.js";
import { rm, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { mediaPath } from "./media.js";
if (one("SELECT 1 FROM export_jobs WHERE status IN ('queued','processing')"))
    throw new Error("Stop processing jobs before cleanup.");
for (const row of all("SELECT id,file_name FROM export_jobs WHERE expires_at<?", Date.now())) {
    if (row.file_name)
        await rm(mediaPath(row.file_name), { force: true });
    run("UPDATE export_jobs SET status='expired',file_name=NULL WHERE id=?", row.id);
}
const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
for (const row of all("SELECT * FROM audio_segments WHERE created_at<?", cutoff)) {
    await rm(mediaPath(row.file_name), { force: true });
    run("DELETE FROM audio_segments WHERE cache_key=?", row.cache_key);
}
for (const entry of await readdir(config.storage, { withFileTypes: true })) {
    if (entry.isDirectory() && /^(audio|export)-/.test(entry.name)) {
        const file = path.join(config.storage, entry.name);
        if ((await stat(file)).mtimeMs < Date.now() - 86400000)
            await rm(file, { recursive: true, force: true });
    }
}
sqlite.close();
console.log("Expired exports, old audio caches and abandoned work directories cleaned.");
