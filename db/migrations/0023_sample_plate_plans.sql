CREATE TABLE `sample_plate_plans` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`workflowId` bigint unsigned NOT NULL,
	`nodeKey` varchar(64),
	`name` varchar(255) NOT NULL,
	`version` int NOT NULL,
	`stage` varchar(32) NOT NULL,
	`snapshot` longtext NOT NULL,
	`snapshotHash` varchar(64) NOT NULL,
	`requestHash` varchar(64) NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`createdById` bigint unsigned NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sample_plate_plans_id` PRIMARY KEY(`id`),
	CONSTRAINT `sample_plate_workflow_version` UNIQUE(`workflowId`,`version`),
	CONSTRAINT `sample_plate_idempotency` UNIQUE(`idempotencyKey`)
);
