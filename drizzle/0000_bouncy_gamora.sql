CREATE TABLE `artwork_mutations` (
	`request_id` text NOT NULL,
	`artwork_id` text NOT NULL,
	`student_id` text NOT NULL,
	`result_revision` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`artwork_id`, `student_id`, `request_id`),
	FOREIGN KEY (`artwork_id`) REFERENCES `artworks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `student_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `artwork_mutations_artwork_idx` ON `artwork_mutations` (`artwork_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `artwork_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`artwork_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`ops_json` text NOT NULL,
	`image_key` text,
	`reason` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`artwork_id`) REFERENCES `artworks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artwork_versions_artwork_sequence_uq` ON `artwork_versions` (`artwork_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `artworks` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`classroom_id` text NOT NULL,
	`title` text NOT NULL,
	`topic` text NOT NULL,
	`learning_mode` text NOT NULL,
	`intent` text DEFAULT '' NOT NULL,
	`ops_json` text DEFAULT '[]' NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`renderer_version` integer DEFAULT 1 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`current_step` integer DEFAULT 0 NOT NULL,
	`version_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'drawing' NOT NULL,
	`thumbnail_key` text,
	`final_image_key` text,
	`last_mutation_id` text,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `student_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`classroom_id`) REFERENCES `classrooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `artworks_student_idx` ON `artworks` (`student_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `artworks_classroom_idx` ON `artworks` (`classroom_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `classrooms` (
	`id` text PRIMARY KEY NOT NULL,
	`teacher_id` text NOT NULL,
	`display_name` text NOT NULL,
	`class_code` text NOT NULL,
	`join_token` text NOT NULL,
	`admission_open` integer DEFAULT true NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`current_activity` text DEFAULT '자유롭게 그리기' NOT NULL,
	`starts_at` text,
	`ends_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `classrooms_code_uq` ON `classrooms` (`class_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `classrooms_join_token_uq` ON `classrooms` (`join_token`);--> statement-breakpoint
CREATE TABLE `coaching_events` (
	`id` text PRIMARY KEY NOT NULL,
	`artwork_id` text NOT NULL,
	`actor` text NOT NULL,
	`question` text NOT NULL,
	`student_answer` text,
	`applied_hint` text,
	`before_version_id` text,
	`after_version_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`artwork_id`) REFERENCES `artworks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `device_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`last_used_at` text NOT NULL,
	`revoked_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `student_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `device_sessions_student_idx` ON `device_sessions` (`student_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `message_receipts` (
	`message_id` text NOT NULL,
	`student_id` text NOT NULL,
	`seen_at` text NOT NULL,
	PRIMARY KEY(`message_id`, `student_id`),
	FOREIGN KEY (`message_id`) REFERENCES `teacher_messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `student_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `message_receipts_student_idx` ON `message_receipts` (`student_id`,`seen_at`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`window_ends_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recovery_credentials` (
	`student_id` text PRIMARY KEY NOT NULL,
	`picture_hash` text NOT NULL,
	`picture_salt` text NOT NULL,
	`personal_qr_hash` text NOT NULL,
	`reset_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `student_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recovery_personal_qr_uq` ON `recovery_credentials` (`personal_qr_hash`);--> statement-breakpoint
CREATE TABLE `reflections` (
	`artwork_id` text PRIMARY KEY NOT NULL,
	`favorite_part` text NOT NULL,
	`favorite_reason` text NOT NULL,
	`spoken_description` text DEFAULT '' NOT NULL,
	`story_text` text DEFAULT '' NOT NULL,
	`next_suggestion` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`artwork_id`) REFERENCES `artworks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `student_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`classroom_id` text NOT NULL,
	`nickname` text NOT NULL,
	`animal` text NOT NULL,
	`last_activity_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`classroom_id`) REFERENCES `classrooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `students_classroom_idx` ON `student_profiles` (`classroom_id`,`last_activity_at`);--> statement-breakpoint
CREATE TABLE `teacher_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`classroom_id` text NOT NULL,
	`student_id` text,
	`teacher_id` text NOT NULL,
	`body` text NOT NULL,
	`reference_url` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`classroom_id`) REFERENCES `classrooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `student_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `messages_classroom_idx` ON `teacher_messages` (`classroom_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `teacher_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`teacher_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`last_used_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `teacher_sessions_teacher_idx` ON `teacher_sessions` (`teacher_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `teacher_views` (
	`teacher_id` text NOT NULL,
	`classroom_id` text NOT NULL,
	`student_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`teacher_id`, `student_id`),
	FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`classroom_id`) REFERENCES `classrooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `student_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `teacher_views_student_idx` ON `teacher_views` (`student_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `teachers` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`credential_hash` text,
	`credential_salt` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teachers_email_uq` ON `teachers` (`email`);