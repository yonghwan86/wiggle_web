DROP TABLE IF EXISTS `artwork_mutations__composite_pk`;
--> statement-breakpoint
CREATE TABLE `artwork_mutations__composite_pk` (
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
INSERT OR IGNORE INTO `artwork_mutations__composite_pk` (`request_id`, `artwork_id`, `student_id`, `result_revision`, `created_at`)
SELECT `request_id`, `artwork_id`, `student_id`, `result_revision`, `created_at` FROM `artwork_mutations`;
--> statement-breakpoint
DROP INDEX IF EXISTS `artwork_mutations_artwork_idx`;
--> statement-breakpoint
DROP TABLE `artwork_mutations`;
--> statement-breakpoint
ALTER TABLE `artwork_mutations__composite_pk` RENAME TO `artwork_mutations`;
--> statement-breakpoint
CREATE INDEX `artwork_mutations_artwork_idx` ON `artwork_mutations` (`artwork_id`, `created_at`);
