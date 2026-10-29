CREATE TABLE `shared_results` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`score` integer NOT NULL,
	`mode` text NOT NULL,
	`difficulty` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "shared_score" CHECK("shared_results"."score" >= 0 AND "shared_results"."score" <= 720),
	CONSTRAINT "shared_mode" CHECK("shared_results"."mode" IN ('solo','online')),
	CONSTRAINT "shared_difficulty" CHECK("shared_results"."difficulty" IN ('easy','medium','hard'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shared_results_source_idx` ON `shared_results` (`source_id`);