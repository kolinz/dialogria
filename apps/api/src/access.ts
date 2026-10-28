import type { Request, Response, NextFunction } from "express";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { sessionSecret, config } from "./config.js";
import {
  one,
  run,
  all,
  id,
  now,
  audit,
  type UserRow,
  type RoomRow,
  type MessageRow,
} from "./db.js";
import { requireThat } from "./errors.js";
import type {
  User,
  Room,
  Message,
} from "../../../packages/shared/src/index.js";
declare global {
  namespace Express {
    interface Request {
      user: UserRow;
      session: { id: string; csrf: string };
      requestId: string;
    }
  }
}
const sign = (value: string) =>
  createHmac("sha256", sessionSecret).update(value).digest("base64url");
export function sessionUser(cookie: string | undefined) {
  if (!cookie) return;
  const [value, signature] = cookie.split(".");
  if (
    !value ||
    !signature ||
    Buffer.byteLength(signature) !== Buffer.byteLength(sign(value)) ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(sign(value)))
  )
    return;
  return one<UserRow & { session_id: string; csrf: string }>(
    "SELECT users.*,auth_sessions.id AS session_id,csrf FROM auth_sessions JOIN users ON user_id=users.id WHERE auth_sessions.id=? AND expires_at>? AND status=?",
    value,
    Date.now(),
    "ACTIVE",
  );
}
export function auth(req: Request, _res: Response, next: NextFunction) {
  const u = sessionUser(req.cookies?.sid);
  requireThat(u, 401, "UNAUTHENTICATED", "ログインしてください");
  req.user = u;
  req.session = { id: u.session_id, csrf: u.csrf };
  next();
}
export function csrf(req: Request, _res: Response, next: NextFunction) {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.get("origin");
    requireThat(
      !origin ||
        [config.WEB_ORIGIN, `http://${config.HOST}:${config.PORT}`].includes(
          origin,
        ),
      403,
      "ORIGIN_DENIED",
      "送信元を確認できません",
    );
    requireThat(
      req.get("x-csrf-token") === req.session.csrf,
      403,
      "CSRF_REQUIRED",
      "ページを再読み込みして再試行してください",
    );
  }
  next();
}
export function admin(req: Request, _res: Response, next: NextFunction) {
  requireThat(
    req.user.role === "ADMIN",
    403,
    "ADMIN_REQUIRED",
    "管理者権限が必要です",
  );
  next();
}
export function createSession(
  res: Response,
  userId: string,
  remember: boolean,
) {
  const sid = randomBytes(32).toString("base64url"),
    token = randomBytes(32).toString("base64url"),
    ttl = (remember ? 30 : 1) * 86400000;
  run(
    "INSERT INTO auth_sessions VALUES(?,?,?,?)",
    sid,
    userId,
    token,
    Date.now() + ttl,
  );
  res.cookie("sid", `${sid}.${sign(sid)}`, {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ttl,
    path: "/",
  });
  return token;
}
export const userDto = (u: UserRow): User => ({
  id: u.id,
  email: u.email,
  displayName: u.display_name,
  bio: u.bio,
  role: u.role,
  avatar: u.avatar,
  avatarVideoConsent: !!u.avatar_video_consent,
});
export function roomAccess(
  roomId: string,
  userId: string,
  manage = false,
  role = "USER",
) {
  const r = one<RoomRow>(
    "SELECT * FROM rooms WHERE id=? AND deleted_at IS NULL",
    roomId,
  );
  requireThat(r, 404, "ROOM_NOT_FOUND", "ルームを利用できません");
  if (manage)
    requireThat(
      r.owner_id === userId || role === "ADMIN",
      403,
      "FORBIDDEN",
      "操作権限がありません",
    );
  else
    requireThat(
      one(
        "SELECT 1 FROM room_members WHERE room_id=? AND user_id=?",
        roomId,
        userId,
      ),
      403,
      "ROOM_FORBIDDEN",
      "参加権限がありません",
    );
  return r;
}
export const roomDto = (r: RoomRow, userId: string): Room => ({
  id: r.id,
  name: r.name,
  description: r.description,
  type: r.type,
  visibility: r.visibility as Room["visibility"],
  ownerId: r.owner_id,
  background: r.background,
  lecturerId: r.lecturer_id,
  lecturerVersion: r.lecturer_version,
  lecturerSpeechMaxChars:
    r.lecturer_speech_max_chars ?? config.AI_LECTURER_SPEECH_MAX_CHARS,
  externalConsent: !!r.external_consent,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  memberCount: one<{ n: number }>(
    "SELECT count(*) AS n FROM room_members WHERE room_id=?",
    r.id,
  )!.n,
  joined: !!one(
    "SELECT 1 FROM room_members WHERE room_id=? AND user_id=?",
    r.id,
    userId,
  ),
});
export function lecturerVersion(r: RoomRow) {
  if (!r.lecturer_id) return null;
  const v = one<{ data: string }>(
    "SELECT data FROM ai_lecturer_versions WHERE lecturer_id=? AND version=?",
    r.lecturer_id,
    r.lecturer_version,
  );
  return v
    ? (JSON.parse(v.data) as {
        name: string;
        systemPrompt: string;
        tone: string;
        provider: string;
        model: string;
        voice: string;
        avatar: string;
      })
    : null;
}
export function messageDto(m: MessageRow): Message {
  const u = m.author_id
    ? one<UserRow>("SELECT * FROM users WHERE id=?", m.author_id)
    : null;
  const r = one<RoomRow>("SELECT * FROM rooms WHERE id=?", m.room_id)!;
  const l = lecturerVersion(r);
  return {
    id: m.id,
    roomId: m.room_id,
    sequenceNo: m.sequence_no,
    authorId: m.author_id,
    speakerId: m.speaker_id,
    displayName: u?.display_name ?? l?.name ?? "AI講師",
    avatar: u?.avatar ?? l?.avatar ?? null,
    mode: m.mode,
    originalText: m.original_text,
    finalText: m.final_text,
    createdAt: m.created_at,
    replyTo: m.reply_to,
  };
}
export function assertExternal(roomId: string) {
  const r = one<RoomRow>("SELECT * FROM rooms WHERE id=?", roomId);
  requireThat(
    r?.external_consent,
    403,
    "ROOM_EXTERNAL_DISABLED",
    "ルーム設定で外部AI・TTSへの送信を許可してください",
  );
  requireThat(
    r?.external_consent &&
      !one(
        "SELECT 1 FROM room_members WHERE room_id=? AND external_consent=0",
        roomId,
      ),
    403,
    "CONSENT_REQUIRED",
    "参加者全員の外部AI送信同意が必要です",
  );
}
export function listMessages(roomId: string, after = 0) {
  return all<MessageRow>(
    "SELECT * FROM messages WHERE room_id=? AND sequence_no>? ORDER BY sequence_no LIMIT 500",
    roomId,
    after,
  ).map(messageDto);
}
export function insertMessage(
  roomId: string,
  authorId: string | null,
  speaker: string,
  mode: string,
  original: string,
  final: string,
  clientId: string,
  replyTo: string | null = null,
) {
  run(
    "UPDATE room_sequence_counters SET last_sequence=last_sequence+1 WHERE room_id=?",
    roomId,
  );
  const seq = one<{ last_sequence: number }>(
    "SELECT last_sequence FROM room_sequence_counters WHERE room_id=?",
    roomId,
  )!.last_sequence;
  const messageId = id();
  run(
    "INSERT INTO messages VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    messageId,
    roomId,
    seq,
    authorId,
    speaker,
    mode,
    original,
    final,
    clientId,
    replyTo,
    now(),
  );
  run("UPDATE rooms SET updated_at=? WHERE id=?", now(), roomId);
  audit(authorId, "MESSAGE_COMMITTED", messageId);
  return messageDto(
    one<MessageRow>("SELECT * FROM messages WHERE id=?", messageId)!,
  );
}
