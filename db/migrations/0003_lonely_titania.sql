CREATE TABLE `external_order_experiments` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`orderId` bigint unsigned NOT NULL,
	`orderItemId` bigint unsigned,
	`experimentId` bigint unsigned NOT NULL,
	`relation` enum('source','result_review','reference') NOT NULL DEFAULT 'source',
	`createdById` bigint unsigned,
	`createdByName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `external_order_experiments_id` PRIMARY KEY(`id`),
	CONSTRAINT `external_order_experiment_unique` UNIQUE(`orderId`,`orderItemId`,`experimentId`)
);
--> statement-breakpoint
CREATE TABLE `external_results` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`orderId` bigint unsigned NOT NULL,
	`orderItemId` bigint unsigned,
	`externalOrderSampleId` bigint unsigned,
	`sampleId` bigint unsigned,
	`sourceDeliverableId` bigint unsigned,
	`metric` varchar(255) NOT NULL,
	`valueText` varchar(500) NOT NULL,
	`numericValue` decimal(20,6),
	`unit` varchar(50),
	`referenceRange` varchar(255),
	`method` varchar(255),
	`replicate` varchar(50),
	`reviewStatus` enum('pending','accepted','changes_requested','rejected') NOT NULL DEFAULT 'pending',
	`notes` text,
	`createdById` bigint unsigned,
	`createdByName` varchar(255),
	`reviewedAt` timestamp,
	`reviewedByName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `external_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `external_sample_custody_events` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`externalOrderSampleId` bigint unsigned NOT NULL,
	`orderId` bigint unsigned NOT NULL,
	`sampleId` bigint unsigned NOT NULL,
	`eventType` enum('planned','prepared','shipped','received','returned','consumed','exception','produced') NOT NULL,
	`amount` decimal(14,3) NOT NULL,
	`unit` varchar(20) NOT NULL,
	`carrier` varchar(100),
	`trackingNo` varchar(100),
	`stockTransactionId` bigint unsigned,
	`idempotencyKey` varchar(128) NOT NULL,
	`note` varchar(500),
	`createdById` bigint unsigned,
	`createdByName` varchar(255),
	`createdAt` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `external_sample_custody_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `external_custody_idempotency_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
ALTER TABLE `stock_transactions` MODIFY COLUMN `reason` enum('restock','consume','adjust','dispose','transfer_out','transfer_in') NOT NULL;--> statement-breakpoint
ALTER TABLE `external_order_samples` ADD `direction` enum('outbound','inbound') DEFAULT 'outbound' NOT NULL;--> statement-breakpoint
ALTER TABLE `external_order_samples` ADD `sourceExternalOrderSampleId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `external_order_samples` ADD `outboundTransactionId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `external_order_samples` ADD `returnTransactionId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `external_order_samples` ADD `returnedAmount` decimal(14,3);--> statement-breakpoint
ALTER TABLE `external_order_samples` ADD `returnedAt` timestamp;--> statement-breakpoint
ALTER TABLE `external_order_samples` ADD `consumedAt` timestamp;--> statement-breakpoint
CREATE INDEX `external_order_experiment_order_idx` ON `external_order_experiments` (`orderId`);--> statement-breakpoint
CREATE INDEX `external_order_experiment_experiment_idx` ON `external_order_experiments` (`experimentId`);--> statement-breakpoint
CREATE INDEX `external_result_order_idx` ON `external_results` (`orderId`);--> statement-breakpoint
CREATE INDEX `external_result_sample_idx` ON `external_results` (`sampleId`);--> statement-breakpoint
CREATE INDEX `external_result_item_idx` ON `external_results` (`orderItemId`);--> statement-breakpoint
CREATE INDEX `external_custody_shipment_idx` ON `external_sample_custody_events` (`externalOrderSampleId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `external_custody_sample_idx` ON `external_sample_custody_events` (`sampleId`,`createdAt`);