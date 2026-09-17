CREATE TABLE `lab_run_nodes` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`runId` bigint unsigned NOT NULL,
	`sourceNodeId` bigint unsigned NOT NULL,
	`nodeKey` varchar(64) NOT NULL,
	`type` enum('manual','equipment','decision','data','timer','external') NOT NULL,
	`label` varchar(255) NOT NULL,
	`templateKey` varchar(64),
	`equipmentId` bigint unsigned,
	`equipmentSnapshot` longtext,
	`driverKey` varchar(20),
	`driverVersion` varchar(12),
	`driverMode` enum('simulation','edge'),
	`configSnapshot` text,
	`parameterSnapshot` longtext,
	`status` enum('pending','running','completed','skipped','failed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lab_run_nodes_id` PRIMARY KEY(`id`),
	CONSTRAINT `lab_run_node_unique` UNIQUE(`runId`,`nodeKey`)
);
--> statement-breakpoint
CREATE TABLE `lab_run_resources` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`runId` bigint unsigned NOT NULL,
	`sampleId` bigint unsigned NOT NULL,
	`role` enum('sample','material','control') NOT NULL,
	`amount` decimal(14,3) NOT NULL,
	`unit` varchar(20) NOT NULL,
	`nodeKey` varchar(64),
	`sampleSnapshot` longtext NOT NULL,
	`sampleRequestItemId` bigint unsigned,
	`inventoryReservationId` bigint unsigned,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lab_run_resources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lab_runs` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`runNo` varchar(40) NOT NULL,
	`name` varchar(255) NOT NULL,
	`purpose` text,
	`workflowId` bigint unsigned NOT NULL,
	`workflowName` varchar(255) NOT NULL,
	`workflowSnapshot` longtext NOT NULL,
	`snapshotHash` varchar(64) NOT NULL,
	`projectId` bigint unsigned,
	`sampleRequestId` bigint unsigned,
	`executionMode` enum('simulation','edge') NOT NULL DEFAULT 'simulation',
	`status` enum('draft','preparing','ready','running','completed','failed','cancelled') NOT NULL DEFAULT 'draft',
	`scheduledStart` timestamp,
	`scheduledEnd` timestamp,
	`operatorName` varchar(255),
	`idempotencyKey` varchar(128) NOT NULL,
	`createdById` bigint unsigned,
	`createdByName` varchar(255),
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp(3) NOT NULL DEFAULT (now()),
	`updatedAt` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `lab_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `lab_run_no_unique` UNIQUE(`runNo`),
	CONSTRAINT `lab_run_idempotency_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
ALTER TABLE `equipment_bookings` ADD `labRunId` bigint unsigned;--> statement-breakpoint
CREATE INDEX `lab_run_node_status_idx` ON `lab_run_nodes` (`runId`,`status`);--> statement-breakpoint
CREATE INDEX `lab_run_node_equipment_idx` ON `lab_run_nodes` (`equipmentId`);--> statement-breakpoint
CREATE INDEX `lab_run_resource_run_idx` ON `lab_run_resources` (`runId`);--> statement-breakpoint
CREATE INDEX `lab_run_resource_sample_idx` ON `lab_run_resources` (`sampleId`);--> statement-breakpoint
CREATE INDEX `lab_run_workflow_idx` ON `lab_runs` (`workflowId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `lab_run_project_idx` ON `lab_runs` (`projectId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `lab_run_status_idx` ON `lab_runs` (`status`,`createdAt`);