CREATE TABLE `lab_run_drafts` (
	`id` varchar(36) NOT NULL,
	`workflowId` bigint unsigned NOT NULL,
	`ownerId` bigint unsigned NOT NULL,
	`ownerName` varchar(255) NOT NULL,
	`payload` longtext NOT NULL,
	`revision` int NOT NULL DEFAULT 1,
	`runId` bigint unsigned,
	`createdAt` timestamp(3) NOT NULL DEFAULT (now()),
	`updatedAt` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `lab_run_drafts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `lab_run_draft_owner_idx` ON `lab_run_drafts` (`ownerId`,`updatedAt`);