CREATE TABLE `external_deliverables` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`orderId` bigint unsigned NOT NULL,
	`orderItemId` bigint unsigned,
	`name` varchar(255) NOT NULL,
	`type` enum('raw_data','report','certificate','protocol','other') NOT NULL DEFAULT 'report',
	`fileUrl` text,
	`version` varchar(30) NOT NULL DEFAULT 'v1',
	`checksum` varchar(128),
	`reviewStatus` enum('pending','accepted','changes_requested','rejected') NOT NULL DEFAULT 'pending',
	`notes` text,
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	`reviewedAt` timestamp,
	`reviewedByName` varchar(255),
	CONSTRAINT `external_deliverables_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `external_order_items` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`orderId` bigint unsigned NOT NULL,
	`name` varchar(255) NOT NULL,
	`category` varchar(100),
	`description` text,
	`quantity` int NOT NULL DEFAULT 1,
	`unit` varchar(30) NOT NULL DEFAULT '项',
	`protocolRef` varchar(255),
	`acceptanceCriteria` text,
	`expectedDeliveryDate` date,
	`status` enum('pending','in_progress','delivered','accepted','rejected','cancelled') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `external_order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `external_order_samples` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`orderId` bigint unsigned NOT NULL,
	`orderItemId` bigint unsigned,
	`sampleId` bigint unsigned NOT NULL,
	`amount` decimal(14,3) NOT NULL,
	`unit` varchar(20) NOT NULL,
	`purpose` varchar(500),
	`shipmentStatus` enum('planned','prepared','shipped','received','returned','consumed','exception') NOT NULL DEFAULT 'planned',
	`carrier` varchar(100),
	`trackingNo` varchar(100),
	`shippedAt` timestamp,
	`receivedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `external_order_samples_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `external_orders` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`orderNo` varchar(40) NOT NULL,
	`projectId` bigint unsigned NOT NULL,
	`providerId` bigint unsigned NOT NULL,
	`title` varchar(255) NOT NULL,
	`objective` text,
	`ownerName` varchar(255),
	`priority` enum('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
	`commercialStatus` enum('draft','quoting','pending_approval','approved','ordered','cancelled') NOT NULL DEFAULT 'draft',
	`executionStatus` enum('awaiting_samples','in_transit','received','in_progress','delivered','on_hold','cancelled') NOT NULL DEFAULT 'awaiting_samples',
	`qualityStatus` enum('not_ready','pending_review','changes_requested','accepted','rejected') NOT NULL DEFAULT 'not_ready',
	`currency` varchar(10) NOT NULL DEFAULT 'CNY',
	`quotedAmount` decimal(14,2),
	`poNumber` varchar(100),
	`contractRef` varchar(255),
	`requestedAt` timestamp,
	`expectedDeliveryDate` date,
	`actualDeliveryDate` date,
	`createdById` bigint unsigned,
	`createdByName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `external_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `external_order_no_unique` UNIQUE(`orderNo`)
);
--> statement-breakpoint
CREATE TABLE `service_providers` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` enum('cro','cdmo','testing_lab','sequencing','animal_facility','academic_core','other') NOT NULL DEFAULT 'cro',
	`qualificationStatus` enum('pending','qualified','restricted','disqualified') NOT NULL DEFAULT 'pending',
	`contactName` varchar(255),
	`contactEmail` varchar(320),
	`contactPhone` varchar(50),
	`certifications` text,
	`specialties` text,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `service_providers_id` PRIMARY KEY(`id`),
	CONSTRAINT `service_provider_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
ALTER TABLE `workflow_nodes` MODIFY COLUMN `type` enum('manual','equipment','decision','data','timer','external') NOT NULL;--> statement-breakpoint
ALTER TABLE `workflow_nodes` ADD `externalOrderItemId` bigint unsigned;--> statement-breakpoint
CREATE INDEX `external_deliverable_order_idx` ON `external_deliverables` (`orderId`);--> statement-breakpoint
CREATE INDEX `external_order_item_order_idx` ON `external_order_items` (`orderId`);--> statement-breakpoint
CREATE INDEX `external_order_sample_order_idx` ON `external_order_samples` (`orderId`);--> statement-breakpoint
CREATE INDEX `external_order_sample_sample_idx` ON `external_order_samples` (`sampleId`);--> statement-breakpoint
CREATE INDEX `external_order_project_idx` ON `external_orders` (`projectId`);--> statement-breakpoint
CREATE INDEX `external_order_provider_idx` ON `external_orders` (`providerId`);--> statement-breakpoint
CREATE INDEX `external_order_delivery_idx` ON `external_orders` (`expectedDeliveryDate`);--> statement-breakpoint
CREATE INDEX `service_provider_qualification_idx` ON `service_providers` (`qualificationStatus`);