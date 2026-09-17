CREATE TABLE `cloning_layout_plans` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`workflowId` bigint unsigned NOT NULL,
	`nodeKey` varchar(64),
	`projectId` bigint unsigned,
	`workflowName` varchar(255) NOT NULL,
	`nodeLabel` varchar(255),
	`name` varchar(255) NOT NULL,
	`version` int NOT NULL,
	`engineVersion` varchar(32) NOT NULL,
	`mode` enum('compact','recommended') NOT NULL,
	`sampleCount` int NOT NULL,
	`plateCount` int NOT NULL,
	`snapshot` longtext NOT NULL,
	`snapshotHash` varchar(64) NOT NULL,
	`requestHash` varchar(64) NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`createdById` bigint unsigned NOT NULL,
	`createdByName` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cloning_layout_plans_id` PRIMARY KEY(`id`),
	CONSTRAINT `cloning_workflow_version_unique` UNIQUE(`workflowId`,`version`),
	CONSTRAINT `cloning_idempotency_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE INDEX `cloning_project_idx` ON `cloning_layout_plans` (`projectId`);