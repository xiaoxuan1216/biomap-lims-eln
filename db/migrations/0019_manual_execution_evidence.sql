CREATE TABLE `lab_run_events` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`runId` bigint unsigned NOT NULL,
	`action` varchar(40) NOT NULL,
	`nodeKey` varchar(64),
	`actorId` bigint unsigned NOT NULL,
	`actorName` varchar(255) NOT NULL,
	`payload` longtext NOT NULL,
	`idempotencyKey` varchar(36) NOT NULL,
	`requestHash` varchar(64) NOT NULL,
	`result` text NOT NULL,
	`createdAt` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `lab_run_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `lab_run_event_request_unique` UNIQUE(`runId`,`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `lab_run_evidence` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`runId` bigint unsigned NOT NULL,
	`nodeKey` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`byteSize` int NOT NULL,
	`sha256` varchar(64) NOT NULL,
	`contentBase64` longtext NOT NULL,
	`uploadedById` bigint unsigned NOT NULL,
	`uploadedByName` varchar(255) NOT NULL,
	`createdAt` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `lab_run_evidence_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lab_run_execution` (
	`runId` bigint unsigned NOT NULL,
	`ownerId` bigint unsigned NOT NULL,
	`ownerName` varchar(255) NOT NULL,
	`paused` boolean NOT NULL DEFAULT false,
	`pauseReason` text,
	`resultState` enum('collecting','review','changes_requested','approved') NOT NULL DEFAULT 'collecting',
	`experimentId` bigint unsigned,
	`updatedAt` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `lab_run_execution_runId` PRIMARY KEY(`runId`)
);
--> statement-breakpoint
CREATE TABLE `lab_run_results` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`runId` bigint unsigned NOT NULL,
	`nodeKey` varchar(64) NOT NULL,
	`sampleId` bigint unsigned NOT NULL,
	`outcome` enum('pass','fail') NOT NULL,
	`value` text NOT NULL,
	`unit` varchar(50) NOT NULL,
	`evidenceId` bigint unsigned NOT NULL,
	`supersedesId` bigint unsigned,
	`recordedById` bigint unsigned NOT NULL,
	`recordedByName` varchar(255) NOT NULL,
	`note` text NOT NULL,
	`createdAt` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `lab_run_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `lab_runs` MODIFY COLUMN `executionMode` enum('simulation','edge','manual') NOT NULL DEFAULT 'simulation';--> statement-breakpoint
CREATE INDEX `lab_run_evidence_run_idx` ON `lab_run_evidence` (`runId`);--> statement-breakpoint
CREATE INDEX `lab_run_result_sample_idx` ON `lab_run_results` (`runId`,`sampleId`);