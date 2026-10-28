import { z } from "zod";
export const authSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(12).max(128),
  displayName: z.string().trim().min(1).max(40).optional(),
});
export const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
  bio: z.string().max(500),
  avatarVideoConsent: z.boolean(),
});
export const roomSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().max(1000).default(""),
    type: z.enum(["AI_LECTURER", "PEER"]),
    visibility: z.enum(["PRIVATE", "INVITE_ONLY", "PUBLIC"]),
    background: z.string().max(200).default("classroom"),
    lecturerId: z.string().nullable().default(null),
    invitees: z.array(z.string()).max(30).default([]),
    externalConsent: z.boolean().default(false),
    lecturerSpeechMaxChars: z.number().int().min(1).max(4000).optional(),
  })
  .refine((v) => (v.type === "AI_LECTURER" ? !!v.lecturerId : !v.lecturerId), {
    message: "AI講師ルームでは有効な講師の選択が必要です",
    path: ["lecturerId"],
  });
export const messageSchema = z
  .object({
    mode: z.enum(["ORIGINAL", "AI_EXPANDED"]),
    originalText: z.string().trim().min(1).max(2000),
    finalText: z.string().trim().min(1).max(4000),
    clientId: z.uuid(),
  })
  .refine((v) => v.mode !== "ORIGINAL" || v.originalText === v.finalText, {
    message: "原文投稿の文章が一致しません",
  });
export const lecturerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  subject: z.string().max(100),
  description: z.string().max(1000),
  systemPrompt: z.string().min(1).max(12000),
  tone: z.string().max(100),
  provider: z.enum(["GEMINI", "OPENAI", "OLLAMA", "LM_STUDIO"]),
  model: z.string().min(1).max(150),
  voice: z.string().min(1).max(100),
  avatar: z.string().max(200).default(""),
  status: z.enum(["ACTIVE", "INACTIVE"]),
  version: z.number().int().min(0).default(0),
});
export const videoSchema = z.object({
  mode: z
    .enum(["GENERATED_SCENES", "AVATAR_DIALOGUE"])
    .default("GENERATED_SCENES"),
  aspectRatio: z.enum(["16:9", "9:16"]).default("16:9"),
  subtitles: z.boolean().default(true),
  externalConsent: z.boolean().default(false),
  budget: z.number().positive().max(100).default(1),
});
export type RoomInput = z.infer<typeof roomSchema>;
export type VideoOptions = z.infer<typeof videoSchema>;
export type User = {
  id: string;
  email: string;
  displayName: string;
  bio: string;
  role: string;
  avatar: string | null;
  avatarVideoConsent: boolean;
};
export type Room = {
  id: string;
  name: string;
  description: string;
  type: "AI_LECTURER" | "PEER";
  visibility: "PRIVATE" | "INVITE_ONLY" | "PUBLIC";
  ownerId: string;
  background: string;
  lecturerId: string | null;
  lecturerVersion: number | null;
  lecturerSpeechMaxChars: number;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  joined: boolean;
  externalConsent: boolean;
};
export type Message = {
  id: string;
  roomId: string;
  sequenceNo: number;
  authorId: string | null;
  speakerId: string;
  displayName: string;
  avatar: string | null;
  mode: string;
  originalText: string;
  finalText: string;
  createdAt: string;
  replyTo: string | null;
};
export type Lecturer = {
  id: string;
  name: string;
  subject: string;
  description: string;
  avatar: string;
  status: string;
  version: number;
  provider?: string;
  model?: string;
  voice?: string;
  systemPrompt?: string;
  tone?: string;
};
export type ExportJob = {
  id: string;
  roomId: string;
  snapshotId: string;
  type: string;
  status: string;
  progress: number;
  error: string | null;
  fileName: string | null;
  durationMs: number | null;
  size: number | null;
  createdAt: string;
  options:
    | VideoOptions
    | { font: string; codeFont: string; fontSize: number; pageSize: string }
    | null;
};
