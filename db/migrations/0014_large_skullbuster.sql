CREATE TABLE `lab_run_transitions` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`runId` bigint unsigned NOT NULL,
	`action` enum('start','advance','cancel') NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`requestHash` varchar(64) NOT NULL,
	`resultJson` longtext NOT NULL,
	`statusBefore` enum('draft','preparing','ready','running','completed','failed','cancelled') NOT NULL,
	`statusAfter` enum('draft','preparing','ready','running','completed','failed','cancelled') NOT NULL,
	`revisionBefore` int NOT NULL,
	`revisionAfter` int NOT NULL,
	`createdById` bigint unsigned NOT NULL,
	`createdByName` varchar(255),
	`createdAt` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `lab_run_transitions_id` PRIMARY KEY(`id`),
	CONSTRAINT `lab_run_transition_request_unique` UNIQUE(`runId`,`action`,`idempotencyKey`)
);
--> statement-breakpoint
CREATE INDEX `lab_run_transition_run_created_idx` ON `lab_run_transitions` (`runId`,`createdAt`);