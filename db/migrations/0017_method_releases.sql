CREATE TABLE `method_releases` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`workflowId` bigint unsigned NOT NULL,
	`version` int NOT NULL,
	`status` enum('review','published','retired') NOT NULL DEFAULT 'review',
	`snapshot` longtext NOT NULL,
	`snapshotHash` varchar(64) NOT NULL,
	`submittedById` bigint unsigned NOT NULL,
	`submittedByName` varchar(255) NOT NULL,
	`reviewedById` bigint unsigned,
	`reviewedByName` varchar(255),
	`reviewNote` text,
	`createdAt` timestamp(3) NOT NULL DEFAULT (now()),
	`reviewedAt` timestamp(3),
	CONSTRAINT `method_releases_id` PRIMARY KEY(`id`),
	CONSTRAINT `method_release_version_unique` UNIQUE(`workflowId`,`version`)
);
--> statement-breakpoint
ALTER TABLE `workflows` ADD `methodSpec` longtext;