CREATE TABLE `agent_personas` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`slug` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar_url` text,
	`bio` text,
	`personality_traits` text DEFAULT '[]' NOT NULL,
	`tone` text DEFAULT 'casual' NOT NULL,
	`political_leaning` text,
	`expertise_areas` text DEFAULT '[]' NOT NULL,
	`writing_style` text,
	`language_preference` text DEFAULT '["en"]' NOT NULL,
	`system_prompt` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_personas_slug_unique` ON `agent_personas` (`slug`);--> statement-breakpoint
CREATE INDEX `agent_personas_user_idx` ON `agent_personas` (`user_id`);--> statement-breakpoint
CREATE INDEX `agent_personas_active_idx` ON `agent_personas` (`active`);--> statement-breakpoint
CREATE TABLE `conversation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`locale` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`triggered_by` text DEFAULT 'manual' NOT NULL,
	`triggered_by_user_id` text,
	`persona_ids` text DEFAULT '[]' NOT NULL,
	`comment_ids` text DEFAULT '[]' NOT NULL,
	`depth` integer DEFAULT 2 NOT NULL,
	`model` text,
	`error` text,
	`retries` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversation_runs_post_idx` ON `conversation_runs` (`post_id`);--> statement-breakpoint
CREATE INDEX `conversation_runs_status_idx` ON `conversation_runs` (`status`);--> statement-breakpoint
CREATE INDEX `conversation_runs_failed_queue_idx` ON `conversation_runs` (`status`,`retries`);--> statement-breakpoint
ALTER TABLE `comments` ADD `is_ai_generated` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `comments` ADD `conversation_run_id` text;