CREATE TABLE `family_share_artworks` (
	`link_id` text NOT NULL,
	`artwork_id` text NOT NULL,
	`position` integer NOT NULL,
	`approved_at` text NOT NULL,
	PRIMARY KEY(`link_id`, `artwork_id`),
	FOREIGN KEY (`link_id`) REFERENCES `family_share_links`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artwork_id`) REFERENCES `artworks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `family_share_position_uq` ON `family_share_artworks` (`link_id`,`position`);--> statement-breakpoint
CREATE INDEX `family_share_artwork_idx` ON `family_share_artworks` (`artwork_id`);--> statement-breakpoint
CREATE TABLE `family_share_invites` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`link_id` text NOT NULL,
	`kind` text NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`consumed_session_hash` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`link_id`) REFERENCES `family_share_links`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `family_invite_session_uq` ON `family_share_invites` (`consumed_session_hash`);--> statement-breakpoint
CREATE INDEX `family_invite_link_idx` ON `family_share_invites` (`link_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `family_share_links` (
	`id` text PRIMARY KEY NOT NULL,
	`teacher_id` text NOT NULL,
	`student_id` text NOT NULL,
	`scope` text NOT NULL,
	`approval_kind` text NOT NULL,
	`guardian_consent_at` text NOT NULL,
	`consent_method` text NOT NULL,
	`attested_by_teacher_id` text NOT NULL,
	`report_start_at` text NOT NULL,
	`report_end_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`view_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `student_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attested_by_teacher_id`) REFERENCES `teachers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `family_share_teacher_idx` ON `family_share_links` (`teacher_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `family_share_student_idx` ON `family_share_links` (`student_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `family_share_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`link_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`last_used_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`link_id`) REFERENCES `family_share_links`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `family_session_link_idx` ON `family_share_sessions` (`link_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `subscription_entitlements` (
	`teacher_id` text PRIMARY KEY NOT NULL,
	`plan_code` text DEFAULT 'free' NOT NULL,
	`status` text DEFAULT 'disabled' NOT NULL,
	`provider` text,
	`external_customer_ref` text,
	`external_subscription_ref` text,
	`current_period_end` text,
	`provider_event_at` text,
	`provider_event_id` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `subscription_webhook_events` (
	`provider` text NOT NULL,
	`event_id` text NOT NULL,
	`payload_hash` text NOT NULL,
	`occurred_at` text NOT NULL,
	`signature_verified` integer NOT NULL,
	`stale` integer DEFAULT false NOT NULL,
	`processed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`provider`, `event_id`)
);
