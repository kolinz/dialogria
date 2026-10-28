import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { config } from "./config.js";
import { randomUUID } from "node:crypto";
import * as schema from "./schema.js";
export { schema };
export const sqlite = new Database(config.database);
export const orm = drizzle(sqlite, { schema });
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");
export function one(sql, ...params) {
    return sqlite.prepare(sql).get(...params);
}
export function all(sql, ...params) {
    return sqlite.prepare(sql).all(...params);
}
export function run(sql, ...params) {
    return sqlite.prepare(sql).run(...params);
}
export function migrate() {
    sqlite.exec(`
CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,display_name TEXT NOT NULL,bio TEXT NOT NULL DEFAULT '',role TEXT NOT NULL CHECK(role IN ('USER','ADMIN')),status TEXT NOT NULL DEFAULT 'ACTIVE',avatar TEXT,avatar_video_consent INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,last_login TEXT);
CREATE TABLE IF NOT EXISTS auth_sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ai_lecturers(id TEXT PRIMARY KEY,data TEXT NOT NULL,version INTEGER NOT NULL,status TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ai_lecturer_versions(lecturer_id TEXT NOT NULL REFERENCES ai_lecturers(id),version INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(lecturer_id,version));
CREATE TABLE IF NOT EXISTS rooms(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),name TEXT NOT NULL,description TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN ('AI_LECTURER','PEER')),visibility TEXT NOT NULL CHECK(visibility IN ('PRIVATE','INVITE_ONLY','PUBLIC')),background TEXT NOT NULL,lecturer_id TEXT,lecturer_version INTEGER,external_consent INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT,FOREIGN KEY(lecturer_id,lecturer_version) REFERENCES ai_lecturer_versions(lecturer_id,version),CHECK((type='PEER' AND lecturer_id IS NULL AND lecturer_version IS NULL) OR (type='AI_LECTURER' AND lecturer_id IS NOT NULL AND lecturer_version IS NOT NULL)));
CREATE TABLE IF NOT EXISTS room_members(room_id TEXT NOT NULL REFERENCES rooms(id),user_id TEXT NOT NULL REFERENCES users(id),external_consent INTEGER NOT NULL DEFAULT 0,joined_at TEXT NOT NULL,PRIMARY KEY(room_id,user_id));
CREATE TABLE IF NOT EXISTS room_invites(id TEXT PRIMARY KEY,room_id TEXT NOT NULL REFERENCES rooms(id),user_id TEXT NOT NULL REFERENCES users(id),status TEXT NOT NULL DEFAULT 'PENDING',UNIQUE(room_id,user_id));
CREATE TABLE IF NOT EXISTS room_sequence_counters(room_id TEXT PRIMARY KEY REFERENCES rooms(id),last_sequence INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,room_id TEXT NOT NULL REFERENCES rooms(id),sequence_no INTEGER NOT NULL,author_id TEXT REFERENCES users(id),speaker_id TEXT NOT NULL,mode TEXT NOT NULL,original_text TEXT NOT NULL,final_text TEXT NOT NULL,client_id TEXT NOT NULL,reply_to TEXT UNIQUE REFERENCES messages(id),created_at TEXT NOT NULL,UNIQUE(room_id,sequence_no),UNIQUE(room_id,author_id,client_id));
CREATE TABLE IF NOT EXISTS export_snapshots(id TEXT PRIMARY KEY,room_id TEXT NOT NULL REFERENCES rooms(id),created_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,room_data TEXT NOT NULL,last_sequence INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS export_snapshot_items(snapshot_id TEXT NOT NULL REFERENCES export_snapshots(id),sequence_no INTEGER NOT NULL,message_id TEXT NOT NULL REFERENCES messages(id),data TEXT NOT NULL,PRIMARY KEY(snapshot_id,sequence_no),UNIQUE(snapshot_id,message_id));
CREATE TABLE IF NOT EXISTS export_jobs(id TEXT PRIMARY KEY,room_id TEXT NOT NULL REFERENCES rooms(id),snapshot_id TEXT NOT NULL REFERENCES export_snapshots(id),created_by TEXT NOT NULL REFERENCES users(id),type TEXT NOT NULL,status TEXT NOT NULL,progress INTEGER NOT NULL DEFAULT 0,options TEXT,error TEXT,file_name TEXT,duration_ms REAL,size INTEGER,attempts INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audio_segments(cache_key TEXT PRIMARY KEY,file_name TEXT NOT NULL,duration_ms REAL NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS video_scenes(id TEXT PRIMARY KEY,job_id TEXT NOT NULL REFERENCES export_jobs(id),message_id TEXT NOT NULL,interaction_id TEXT,model TEXT NOT NULL,file_name TEXT,status TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_logs(id TEXT PRIMARY KEY,actor_id TEXT,event TEXT NOT NULL,target_id TEXT,detail TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS system_events(id TEXT PRIMARY KEY,level TEXT NOT NULL,event TEXT NOT NULL,request_id TEXT,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS usage_records(id TEXT PRIMARY KEY,user_id TEXT,purpose TEXT NOT NULL,provider TEXT NOT NULL,units INTEGER NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS messages_room ON messages(room_id,sequence_no);
CREATE INDEX IF NOT EXISTS jobs_status ON export_jobs(status,created_at);
CREATE TRIGGER IF NOT EXISTS immutable_lecturer_version BEFORE UPDATE ON ai_lecturer_versions BEGIN SELECT RAISE(ABORT,'immutable version'); END;
CREATE TRIGGER IF NOT EXISTS immutable_snapshot_items BEFORE UPDATE ON export_snapshot_items BEGIN SELECT RAISE(ABORT,'immutable snapshot'); END;
INSERT OR IGNORE INTO schema_migrations VALUES(1,datetime('now'));
`);
    sqlite.transaction(() => {
        if (!all("PRAGMA table_info(rooms)").some((column) => column.name === "lecturer_speech_max_chars")) {
            sqlite.exec("ALTER TABLE rooms ADD COLUMN lecturer_speech_max_chars INTEGER CHECK(lecturer_speech_max_chars BETWEEN 1 AND 4000)");
            run("UPDATE rooms SET lecturer_speech_max_chars=?", config.AI_LECTURER_SPEECH_MAX_CHARS);
        }
        run("INSERT OR IGNORE INTO schema_migrations VALUES(2,?)", new Date().toISOString());
    })();
}
migrate();
export function getSetting(key, fallback) {
    const r = one("SELECT value FROM settings WHERE key=?", key);
    return r ? JSON.parse(r.value) : fallback;
}
export function setSetting(key, value) {
    run("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", key, JSON.stringify(value));
}
export const now = () => new Date().toISOString();
export const id = () => randomUUID();
export function audit(actor, event, target = null, detail = {}) {
    run("INSERT INTO audit_logs VALUES(?,?,?,?,?,?)", id(), actor, event, target, JSON.stringify(detail), now());
}
