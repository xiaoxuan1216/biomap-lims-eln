CREATE TABLE `audit_state` (
	`id` int NOT NULL,
	`lastHash` varchar(64),
	`updatedAt` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_state_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `experiment_revisions` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`experimentId` bigint unsigned NOT NULL,
	`revision` int NOT NULL,
	`snapshot` longtext NOT NULL,
	`contentHash` varchar(64) NOT NULL,
	`changeReason` varchar(500) NOT NULL,
	`createdById` bigint unsigned,
	`createdByName` varchar(255),
	`createdAt` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `experiment_revisions_id` PRIMARY KEY(`id`),
	CONSTRAINT `eln_revision_unique` UNIQUE(`experimentId`,`revision`)
);
--> statement-breakpoint
CREATE TABLE `experiment_signatures` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`experimentId` bigint unsigned NOT NULL,
	`revisionId` bigint unsigned NOT NULL,
	`revision` int NOT NULL,
	`contentHash` varchar(64) NOT NULL,
	`meaning` enum('reviewed_and_approved','legacy_import') NOT NULL,
	`statement` varchar(500) NOT NULL,
	`signedById` bigint unsigned,
	`signedByName` varchar(255),
	`signedAt` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `experiment_signatures_id` PRIMARY KEY(`id`),
	CONSTRAINT `eln_signature_experiment_unique` UNIQUE(`experimentId`),
	CONSTRAINT `eln_signature_revision_unique` UNIQUE(`revisionId`)
);
--> statement-breakpoint
CREATE TABLE `system_counters` (
	`key` varchar(64) NOT NULL,
	`value` bigint unsigned NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `system_counters_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
ALTER TABLE `activities` MODIFY COLUMN `createdAt` timestamp(3) NOT NULL DEFAULT (now());--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('viewer','user','reviewer','admin') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `activities` ADD `userId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `activities` ADD `source` varchar(30) DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE `activities` ADD `beforeJson` longtext;--> statement-breakpoint
ALTER TABLE `activities` ADD `afterJson` longtext;--> statement-breakpoint
ALTER TABLE `activities` ADD `reason` varchar(500);--> statement-breakpoint
ALTER TABLE `activities` ADD `previousHash` varchar(64);--> statement-breakpoint
ALTER TABLE `activities` ADD `hash` varchar(64);--> statement-breakpoint
ALTER TABLE `experiments` ADD `revision` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `experiments` ADD `currentRevisionId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `experiments` ADD `contentHash` varchar(64);--> statement-breakpoint
ALTER TABLE `experiments` ADD `amendsExperimentId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `samples` ADD `archivedAt` timestamp;--> statement-breakpoint
ALTER TABLE `stock_transactions` ADD `quantityBefore` decimal(14,3);--> statement-breakpoint
ALTER TABLE `stock_transactions` ADD `quantityAfter` decimal(14,3);--> statement-breakpoint
ALTER TABLE `stock_transactions` ADD `userId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `stock_transactions` ADD `idempotencyKey` varchar(128);--> statement-breakpoint
ALTER TABLE `experiments` ADD CONSTRAINT `exp_amendment_unique` UNIQUE(`amendsExperimentId`);--> statement-breakpoint
ALTER TABLE `samples` ADD CONSTRAINT `sample_box_position_unique` UNIQUE(`locationId`,`boxRow`,`boxCol`);--> statement-breakpoint
ALTER TABLE `stock_transactions` ADD CONSTRAINT `stock_idempotency_unique` UNIQUE(`idempotencyKey`);--> statement-breakpoint
ALTER TABLE `workflow_edges` ADD CONSTRAINT `wfedge_workflow_key_unique` UNIQUE(`workflowId`,`edgeKey`);--> statement-breakpoint
ALTER TABLE `workflow_nodes` ADD CONSTRAINT `wfnode_workflow_key_unique` UNIQUE(`workflowId`,`nodeKey`);--> statement-breakpoint
CREATE INDEX `eln_revision_hash_idx` ON `experiment_revisions` (`contentHash`);--> statement-breakpoint
CREATE INDEX `activity_entity_idx` ON `activities` (`entityType`,`entityId`);--> statement-breakpoint
CREATE INDEX `stock_sample_created_idx` ON `stock_transactions` (`sampleId`,`createdAt`);