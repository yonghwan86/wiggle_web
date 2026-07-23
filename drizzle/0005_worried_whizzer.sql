ALTER TABLE `student_profiles` ADD `archived_at` text;--> statement-breakpoint
CREATE INDEX `students_classroom_archived_idx` ON `student_profiles` (`classroom_id`,`archived_at`,`nickname`);