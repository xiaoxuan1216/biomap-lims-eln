CREATE TABLE `fulfillment_tasks` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`requestId` bigint unsigned NOT NULL,
	`requestItemId` bigint unsigned NOT NULL,
	`type` enum('issue') NOT NULL DEFAULT 'issue',
	`status` enum('ready','claimed','running','succeeded','failed','cancelled') NOT NULL DEFAULT 'ready',
	`instruction` varchar(500),
	`assignedToId` bigint unsigned,
	`assignedToName` varchar(255),
	`startedAt` timestamp,
	`completedAt` timestamp,
	`failureReason` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fulfillment_tasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `fulfillment_task_request_item_unique` UNIQUE(`requestItemId`)
);
--> statement-breakpoint
CREATE TABLE `inventory_reservations` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`requestId` bigint unsigned NOT NULL,
	`requestItemId` bigint unsigned NOT NULL,
	`sampleId` bigint unsigned NOT NULL,
	`amount` decimal(14,3) NOT NULL,
	`status` enum('active','consumed','released','expired') NOT NULL DEFAULT 'active',
	`idempotencyKey` varchar(128) NOT NULL,
	`expiresAt` timestamp,
	`consumedAt` timestamp,
	`releasedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inventory_reservations_id` PRIMARY KEY(`id`),
	CONSTRAINT `inventory_reservation_request_item_unique` UNIQUE(`requestItemId`),
	CONSTRAINT `inventory_reservation_idempotency_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `sample_request_items` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`requestId` bigint unsigned NOT NULL,
	`sampleId` bigint unsigned NOT NULL,
	`requestedAmount` decimal(14,3) NOT NULL,
	`reservedAmount` decimal(14,3) NOT NULL DEFAULT 0,
	`fulfilledAmount` decimal(14,3) NOT NULL DEFAULT 0,
	`unit` varchar(20) NOT NULL,
	`targetFormat` varchar(255),
	`note` varchar(500),
	`status` enum('pending','reserved','in_progress','fulfilled','cancelled') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sample_request_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sample_requests` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`requestNo` varchar(40) NOT NULL,
	`title` varchar(255) NOT NULL,
	`purpose` text,
	`projectId` bigint unsigned,
	`requesterId` bigint unsigned,
	`requesterName` varchar(255),
	`priority` enum('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
	`status` enum('draft','reserved','in_fulfillment','fulfilled','cancelled') NOT NULL DEFAULT 'draft',
	`neededBy` date,
	`cancellationReason` varchar(500),
	`submittedAt` timestamp,
	`reservedAt` timestamp,
	`completedAt` timestamp,
	`cancelledAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sample_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `sample_requests_requestNo_unique` UNIQUE(`requestNo`)
);
--> statement-breakpoint
CREATE INDEX `fulfillment_task_request_status_idx` ON `fulfillment_tasks` (`requestId`,`status`);--> statement-breakpoint
CREATE INDEX `fulfillment_task_assignee_idx` ON `fulfillment_tasks` (`assignedToId`);--> statement-breakpoint
CREATE INDEX `inventory_reservation_sample_status_idx` ON `inventory_reservations` (`sampleId`,`status`);--> statement-breakpoint
CREATE INDEX `inventory_reservation_request_idx` ON `inventory_reservations` (`requestId`);--> statement-breakpoint
CREATE INDEX `sample_request_item_request_idx` ON `sample_request_items` (`requestId`);--> statement-breakpoint
CREATE INDEX `sample_request_item_sample_idx` ON `sample_request_items` (`sampleId`);--> statement-breakpoint
CREATE INDEX `sample_request_status_created_idx` ON `sample_requests` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `sample_request_project_idx` ON `sample_requests` (`projectId`);--> statement-breakpoint
CREATE INDEX `sample_request_requester_idx` ON `sample_requests` (`requesterId`);