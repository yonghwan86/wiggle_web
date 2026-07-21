import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const createdAt = () => text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`);
const updatedAt = () => text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`);

export const teachers = sqliteTable("teachers", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  credentialHash: text("credential_hash"),
  credentialSalt: text("credential_salt"),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("teachers_email_uq").on(table.email)]);

export const teacherSessions = sqliteTable("teacher_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  teacherId: text("teacher_id").notNull().references(() => teachers.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  lastUsedAt: text("last_used_at").notNull(),
  createdAt: createdAt(),
}, (table) => [index("teacher_sessions_teacher_idx").on(table.teacherId, table.expiresAt)]);

export const classrooms = sqliteTable("classrooms", {
  id: text("id").primaryKey(),
  teacherId: text("teacher_id").notNull().references(() => teachers.id),
  displayName: text("display_name").notNull(),
  classCode: text("class_code").notNull(),
  joinToken: text("join_token").notNull(),
  admissionOpen: integer("admission_open", { mode: "boolean" }).notNull().default(true),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  currentActivity: text("current_activity").notNull().default("자유롭게 그리기"),
  startsAt: text("starts_at"),
  endsAt: text("ends_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("classrooms_code_uq").on(table.classCode),
  uniqueIndex("classrooms_join_token_uq").on(table.joinToken),
]);

export const studentProfiles = sqliteTable("student_profiles", {
  id: text("id").primaryKey(),
  classroomId: text("classroom_id").notNull().references(() => classrooms.id),
  nickname: text("nickname").notNull(),
  animal: text("animal").notNull(),
  lastActivityAt: text("last_activity_at").notNull(),
  createdAt: createdAt(),
}, (table) => [index("students_classroom_idx").on(table.classroomId, table.lastActivityAt)]);

export const recoveryCredentials = sqliteTable("recovery_credentials", {
  studentId: text("student_id").primaryKey().references(() => studentProfiles.id, { onDelete: "cascade" }),
  pictureHash: text("picture_hash").notNull(),
  pictureSalt: text("picture_salt").notNull(),
  personalQrHash: text("personal_qr_hash").notNull(),
  resetAt: text("reset_at"),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("recovery_personal_qr_uq").on(table.personalQrHash)]);

export const deviceSessions = sqliteTable("device_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  studentId: text("student_id").notNull().references(() => studentProfiles.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  lastUsedAt: text("last_used_at").notNull(),
  revokedAt: text("revoked_at"),
  createdAt: createdAt(),
}, (table) => [index("device_sessions_student_idx").on(table.studentId, table.expiresAt)]);

export const artworks = sqliteTable("artworks", {
  id: text("id").primaryKey(),
  studentId: text("student_id").notNull().references(() => studentProfiles.id),
  classroomId: text("classroom_id").notNull().references(() => classrooms.id),
  title: text("title").notNull(),
  topic: text("topic").notNull(),
  learningMode: text("learning_mode", { enum: ["practice", "guided", "free"] }).notNull(),
  intent: text("intent").notNull().default(""),
  opsJson: text("ops_json").notNull().default("[]"),
  schemaVersion: integer("schema_version").notNull().default(1),
  rendererVersion: integer("renderer_version").notNull().default(1),
  revision: integer("revision").notNull().default(0),
  currentStep: integer("current_step").notNull().default(0),
  versionCount: integer("version_count").notNull().default(0),
  status: text("status", { enum: ["drawing", "reflecting", "complete"] }).notNull().default("drawing"),
  thumbnailKey: text("thumbnail_key"),
  finalImageKey: text("final_image_key"),
  lastMutationId: text("last_mutation_id"),
  completedAt: text("completed_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("artworks_student_idx").on(table.studentId, table.updatedAt),
  index("artworks_classroom_idx").on(table.classroomId, table.updatedAt),
]);

export const artworkVersions = sqliteTable("artwork_versions", {
  id: text("id").primaryKey(),
  artworkId: text("artwork_id").notNull().references(() => artworks.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  opsJson: text("ops_json").notNull(),
  imageKey: text("image_key"),
  reason: text("reason").notNull(),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("artwork_versions_artwork_sequence_uq").on(table.artworkId, table.sequence)]);

export const coachingEvents = sqliteTable("coaching_events", {
  id: text("id").primaryKey(),
  artworkId: text("artwork_id").notNull().references(() => artworks.id, { onDelete: "cascade" }),
  actor: text("actor", { enum: ["teacher", "ai"] }).notNull(),
  question: text("question").notNull(),
  studentAnswer: text("student_answer"),
  appliedHint: text("applied_hint"),
  beforeVersionId: text("before_version_id"),
  afterVersionId: text("after_version_id"),
  createdAt: createdAt(),
});

export const artworkMutations = sqliteTable("artwork_mutations", {
  requestId: text("request_id").notNull(),
  artworkId: text("artwork_id").notNull().references(() => artworks.id, { onDelete: "cascade" }),
  studentId: text("student_id").notNull().references(() => studentProfiles.id, { onDelete: "cascade" }),
  resultRevision: integer("result_revision").notNull(),
  createdAt: createdAt(),
}, (table) => [
  primaryKey({ columns: [table.artworkId, table.studentId, table.requestId] }),
  index("artwork_mutations_artwork_idx").on(table.artworkId, table.createdAt),
]);

export const reflections = sqliteTable("reflections", {
  artworkId: text("artwork_id").primaryKey().references(() => artworks.id, { onDelete: "cascade" }),
  favoritePart: text("favorite_part").notNull(),
  favoriteReason: text("favorite_reason").notNull(),
  spokenDescription: text("spoken_description").notNull().default(""),
  storyText: text("story_text").notNull().default(""),
  nextSuggestion: text("next_suggestion").notNull().default(""),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const teacherMessages = sqliteTable("teacher_messages", {
  id: text("id").primaryKey(),
  classroomId: text("classroom_id").notNull().references(() => classrooms.id),
  studentId: text("student_id").references(() => studentProfiles.id),
  teacherId: text("teacher_id").notNull().references(() => teachers.id),
  body: text("body").notNull(),
  referenceUrl: text("reference_url"),
  createdAt: createdAt(),
}, (table) => [index("messages_classroom_idx").on(table.classroomId, table.createdAt)]);

export const messageReceipts = sqliteTable("message_receipts", {
  messageId: text("message_id").notNull().references(() => teacherMessages.id, { onDelete: "cascade" }),
  studentId: text("student_id").notNull().references(() => studentProfiles.id, { onDelete: "cascade" }),
  seenAt: text("seen_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.messageId, table.studentId] }),
  index("message_receipts_student_idx").on(table.studentId, table.seenAt),
]);

export const teacherViews = sqliteTable("teacher_views", {
  teacherId: text("teacher_id").notNull().references(() => teachers.id, { onDelete: "cascade" }),
  classroomId: text("classroom_id").notNull().references(() => classrooms.id, { onDelete: "cascade" }),
  studentId: text("student_id").notNull().references(() => studentProfiles.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  updatedAt: updatedAt(),
}, (table) => [
  primaryKey({ columns: [table.teacherId, table.studentId] }),
  index("teacher_views_student_idx").on(table.studentId, table.expiresAt),
]);

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowEndsAt: text("window_ends_at").notNull(),
});
