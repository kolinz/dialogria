import { sqliteTable, text, integer, uniqueIndex, } from "drizzle-orm/sqlite-core";
// DDLの正本はdb.tsの版付きマイグレーション。Drizzleは型付き読み取りに使用する。
export const users = sqliteTable("users", {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    displayName: text("display_name").notNull(),
    role: text("role").notNull(),
    status: text("status").notNull(),
    avatar: text("avatar"),
});
export const lecturers = sqliteTable("ai_lecturers", {
    id: text("id").primaryKey(),
    data: text("data").notNull(),
    version: integer("version").notNull(),
    status: text("status").notNull(),
});
export const messages = sqliteTable("messages", {
    id: text("id").primaryKey(),
    roomId: text("room_id").notNull(),
    sequenceNo: integer("sequence_no").notNull(),
    authorId: text("author_id"),
    speakerId: text("speaker_id").notNull(),
    mode: text("mode").notNull(),
    originalText: text("original_text").notNull(),
    finalText: text("final_text").notNull(),
    createdAt: text("created_at").notNull(),
}, (t) => [uniqueIndex("message_sequence_contract").on(t.roomId, t.sequenceNo)]);
