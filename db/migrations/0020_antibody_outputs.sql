CREATE TABLE `lab_run_outputs` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`runId` bigint unsigned NOT NULL,
	`nodeKey` varchar(64) NOT NULL,
	`sampleId` bigint unsigned NOT NULL,
	`antibodyId` varchar(100) NOT NULL,
	`chain` varchar(20) NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	`unit` varchar(20) NOT NULL,
	`parentSampleIds` text NOT NULL,
	`metadata` longtext NOT NULL,
	`sampleSnapshot` longtext NOT NULL,
	`evidenceId` bigint unsigned NOT NULL,
	`status` enum('pending_review','released','voided') NOT NULL DEFAULT 'pending_review',
	`createdById` bigint unsigned NOT NULL,
	`createdByName` varchar(255) NOT NULL,
	`createdAt` timestamp(3) NOT NULL DEFAULT (now()),
	`releasedAt` timestamp(3),
	CONSTRAINT `lab_run_outputs_id` PRIMARY KEY(`id`),
	CONSTRAINT `lab_run_output_sample_unique` UNIQUE(`sampleId`)
);
--> statement-breakpoint
ALTER TABLE `lab_run_results` ADD `metricKey` varchar(50) DEFAULT 'result' NOT NULL;--> statement-breakpoint
CREATE INDEX `lab_run_output_run_idx` ON `lab_run_outputs` (`runId`);