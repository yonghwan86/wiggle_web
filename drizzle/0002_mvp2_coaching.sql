CREATE TABLE `coaching_event_details` (
	`event_id` text PRIMARY KEY NOT NULL,
	`response_kind` text NOT NULL,
	`choices_json` text DEFAULT '[]' NOT NULL,
	`guide_steps_json` text DEFAULT '[]' NOT NULL,
	`new_elements_json` text DEFAULT '[]' NOT NULL,
	`growth_event` text,
	`current_step` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `coaching_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `coaching_details_status_idx` ON `coaching_event_details` (`status`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `teacher_coaching_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`teacher_id` text NOT NULL,
	`classroom_id` text NOT NULL,
	`student_id` text NOT NULL,
	`artwork_id` text NOT NULL,
	`body` text NOT NULL,
	`observation` text NOT NULL,
	`next_action` text NOT NULL,
	`model` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`approved_message_id` text,
	`approved_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`classroom_id`) REFERENCES `classrooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `student_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artwork_id`) REFERENCES `artworks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`approved_message_id`) REFERENCES `teacher_messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `teacher_drafts_owner_idx` ON `teacher_coaching_drafts` (`teacher_id`,`classroom_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `teacher_drafts_student_idx` ON `teacher_coaching_drafts` (`student_id`,`created_at`);
