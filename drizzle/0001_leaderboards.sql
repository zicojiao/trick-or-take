CREATE TABLE `leaderboard_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`name` text NOT NULL,
	`mode` text NOT NULL,
	`difficulty` text NOT NULL,
	`score` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "entries_mode" CHECK("leaderboard_entries"."mode" IN ('solo','online')),
	CONSTRAINT "entries_difficulty" CHECK("leaderboard_entries"."difficulty" IN ('easy','medium','hard')),
	CONSTRAINT "entries_score" CHECK("leaderboard_entries"."score" >= 0 AND "leaderboard_entries"."score" <= 720)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leaderboard_source_idx` ON `leaderboard_entries` (`source_id`);--> statement-breakpoint
CREATE INDEX `leaderboard_ranking_idx` ON `leaderboard_entries` (`mode`,`difficulty`,`score`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `leaderboard_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`difficulty` text NOT NULL,
	`seed` integer,
	`token_hash` text NOT NULL,
	`room_code` text NOT NULL,
	`player_id` text NOT NULL,
	`score` integer,
	`issued_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT "runs_mode" CHECK("leaderboard_runs"."mode" IN ('solo','online')),
	CONSTRAINT "runs_difficulty" CHECK("leaderboard_runs"."difficulty" IN ('easy','medium','hard')),
	CONSTRAINT "runs_score" CHECK("leaderboard_runs"."score" >= 0 AND "leaderboard_runs"."score" <= 720)
);
