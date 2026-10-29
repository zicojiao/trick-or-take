ALTER TABLE `leaderboard_runs` ADD `rules_version` integer DEFAULT 3 NOT NULL;--> statement-breakpoint
CREATE INDEX `leaderboard_global_idx` ON `leaderboard_entries` (`score`,`created_at`,`id`);