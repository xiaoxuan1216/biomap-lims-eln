CREATE TABLE `driver_releases` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`driverKey` varchar(20) NOT NULL,
	`version` varchar(12) NOT NULL,
	`name` varchar(255) NOT NULL,
	`vendor` varchar(120) NOT NULL,
	`status` enum('draft','published','retired') NOT NULL DEFAULT 'draft',
	`manifest` longtext NOT NULL,
	`checksum` varchar(64) NOT NULL,
	`sourceKind` enum('custom','imported') NOT NULL DEFAULT 'custom',
	`createdByName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`publishedAt` timestamp,
	CONSTRAINT `driver_releases_id` PRIMARY KEY(`id`),
	CONSTRAINT `driver_release_key_version_unique` UNIQUE(`driverKey`,`version`)
);
--> statement-breakpoint
CREATE TABLE `equipment_driver_bindings` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`equipmentId` bigint unsigned NOT NULL,
	`driverKey` varchar(20) NOT NULL,
	`driverVersion` varchar(12) NOT NULL,
	`mode` enum('simulation','edge') NOT NULL DEFAULT 'simulation',
	`connectionConfig` longtext NOT NULL,
	`secretRef` varchar(255),
	`status` enum('unconfigured','ready','offline','fault') NOT NULL DEFAULT 'unconfigured',
	`lastTestAt` timestamp,
	`lastMessage` varchar(500),
	`createdByName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	`enabled` boolean NOT NULL DEFAULT true,
	CONSTRAINT `equipment_driver_bindings_id` PRIMARY KEY(`id`),
	CONSTRAINT `equipment_driver_binding_equipment_unique` UNIQUE(`equipmentId`)
);
--> statement-breakpoint
CREATE INDEX `driver_release_status_idx` ON `driver_releases` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `equipment_driver_binding_driver_idx` ON `equipment_driver_bindings` (`driverKey`,`driverVersion`);