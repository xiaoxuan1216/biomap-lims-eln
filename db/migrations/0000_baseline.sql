CREATE TABLE `activities` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`userName` varchar(255),
	`action` varchar(50) NOT NULL,
	`entityType` varchar(30) NOT NULL,
	`entityId` bigint unsigned,
	`entityName` varchar(255),
	`detail` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `equipment` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`category` enum('analytical','execution','automation','support') NOT NULL,
	`model` varchar(255),
	`serialNo` varchar(100),
	`status` enum('available','in_use','maintenance','fault') NOT NULL DEFAULT 'available',
	`room` varchar(100),
	`responsibleName` varchar(255),
	`specs` text,
	`nextCalibrationDate` date,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `equipment_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `equipment_bookings` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`equipmentId` bigint unsigned NOT NULL,
	`userName` varchar(255) NOT NULL,
	`purpose` varchar(500),
	`startTime` timestamp NOT NULL,
	`endTime` timestamp NOT NULL,
	`status` enum('active','cancelled','completed') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `equipment_bookings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `equipment_maintenance` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`equipmentId` bigint unsigned NOT NULL,
	`type` enum('calibration','maintenance','repair') NOT NULL,
	`description` varchar(500),
	`performedBy` varchar(255),
	`performedAt` timestamp NOT NULL,
	`nextDueDate` date,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `equipment_maintenance_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `experiment_samples` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`experimentId` bigint unsigned NOT NULL,
	`sampleId` bigint unsigned NOT NULL,
	`amountUsed` decimal(14,3) NOT NULL DEFAULT 0,
	`note` varchar(500),
	`createdByName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `experiment_samples_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `experiments` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`code` varchar(30) NOT NULL,
	`projectId` bigint unsigned NOT NULL,
	`title` varchar(255) NOT NULL,
	`objective` text,
	`status` enum('planning','in_progress','completed','signed') NOT NULL DEFAULT 'planning',
	`content` longtext,
	`workflowId` bigint unsigned,
	`nodeKey` varchar(64),
	`signedById` bigint unsigned,
	`signedByName` varchar(255),
	`signedAt` timestamp,
	`createdById` bigint unsigned,
	`createdByName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `experiments_id` PRIMARY KEY(`id`),
	CONSTRAINT `experiments_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `lineage_edges` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`childKind` enum('sample','sequence') NOT NULL,
	`childId` bigint unsigned NOT NULL,
	`parentKind` enum('sample','sequence') NOT NULL,
	`parentId` bigint unsigned NOT NULL,
	`relation` varchar(40) NOT NULL,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lineage_edges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pipeline_stages` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`pipelineId` bigint unsigned NOT NULL,
	`name` varchar(255) NOT NULL,
	`orderIndex` int NOT NULL,
	`status` enum('pending','in_progress','done','skipped') NOT NULL DEFAULT 'pending',
	`linkedExperimentId` bigint unsigned,
	`notes` text,
	`completedAt` timestamp,
	CONSTRAINT `pipeline_stages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pipelines` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` enum('gibson_assembly','golden_gate','strain_engineering','protein_expression','dbtl_cycle','custom') NOT NULL,
	`status` enum('active','paused','completed') NOT NULL DEFAULT 'active',
	`iteration` int NOT NULL DEFAULT 1,
	`projectId` bigint unsigned,
	`description` text,
	`createdByName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pipelines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`color` varchar(20) NOT NULL DEFAULT 'teal',
	`status` enum('active','on_hold','completed') NOT NULL DEFAULT 'active',
	`createdById` bigint unsigned,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `samples` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`sku` varchar(30) NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` enum('cell_line','plasmid','primer','antibody','reagent','chemical','protein','virus','tissue','buffer','enzyme','competent_cell','other') NOT NULL DEFAULT 'other',
	`quantity` decimal(14,3) NOT NULL DEFAULT 0,
	`unit` varchar(20) NOT NULL DEFAULT '管',
	`alertThreshold` decimal(14,3),
	`locationId` bigint unsigned,
	`boxRow` int,
	`boxCol` int,
	`sequenceId` bigint unsigned,
	`projectId` bigint unsigned,
	`expiryDate` date,
	`notes` text,
	`createdById` bigint unsigned,
	`createdByName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `samples_id` PRIMARY KEY(`id`),
	CONSTRAINT `samples_sku_unique` UNIQUE(`sku`)
);
--> statement-breakpoint
CREATE TABLE `sequence_features` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`sequenceId` bigint unsigned NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` enum('promoter','cds','resistance','origin','terminator','tag','primer_bind','restriction_site','regulatory','other') NOT NULL DEFAULT 'other',
	`start` int NOT NULL,
	`end` int NOT NULL,
	`strand` int NOT NULL DEFAULT 1,
	`color` varchar(20) NOT NULL DEFAULT 'teal',
	`note` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sequence_features_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sequences` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` enum('dna','rna','protein') NOT NULL DEFAULT 'dna',
	`sequence` text NOT NULL,
	`pdbId` varchar(10),
	`description` text,
	`createdByName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sequences_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_transactions` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`sampleId` bigint unsigned NOT NULL,
	`delta` decimal(14,3) NOT NULL,
	`reason` enum('restock','consume','adjust','dispose') NOT NULL,
	`note` varchar(500),
	`userName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stock_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `storage_locations` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` enum('lab','freezer','fridge','shelf','rack','box') NOT NULL,
	`parentId` bigint unsigned,
	`temperature` varchar(20),
	`rows` int,
	`cols` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `storage_locations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`unionId` varchar(255) NOT NULL,
	`name` varchar(255),
	`email` varchar(320),
	`avatar` text,
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	`lastSignInAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_unionId_unique` UNIQUE(`unionId`)
);
--> statement-breakpoint
CREATE TABLE `workflow_edges` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`workflowId` bigint unsigned NOT NULL,
	`edgeKey` varchar(64) NOT NULL,
	`sourceKey` varchar(64) NOT NULL,
	`targetKey` varchar(64) NOT NULL,
	`sourceHandle` varchar(16),
	`label` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workflow_edges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workflow_nodes` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`workflowId` bigint unsigned NOT NULL,
	`nodeKey` varchar(64) NOT NULL,
	`type` enum('manual','equipment','decision','data','timer') NOT NULL,
	`templateKey` varchar(64),
	`label` varchar(255) NOT NULL,
	`owner` varchar(255),
	`equipmentId` bigint unsigned,
	`childWorkflowId` bigint unsigned,
	`config` text,
	`params` text,
	`status` enum('pending','in_progress','done','skipped') NOT NULL DEFAULT 'pending',
	`posX` int NOT NULL DEFAULT 0,
	`posY` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workflow_nodes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workflows` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`scenario` varchar(64) NOT NULL DEFAULT 'synbio',
	`status` enum('draft','active','completed','archived') NOT NULL DEFAULT 'draft',
	`projectId` bigint unsigned,
	`experimentId` bigint unsigned,
	`parentWorkflowId` bigint unsigned,
	`parentNodeId` bigint unsigned,
	`createdByName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workflows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `activity_created_idx` ON `activities` (`createdAt`);--> statement-breakpoint
CREATE INDEX `exp_project_idx` ON `experiments` (`projectId`);--> statement-breakpoint
CREATE INDEX `exp_status_idx` ON `experiments` (`status`);--> statement-breakpoint
CREATE INDEX `lineage_child_idx` ON `lineage_edges` (`childKind`,`childId`);--> statement-breakpoint
CREATE INDEX `lineage_parent_idx` ON `lineage_edges` (`parentKind`,`parentId`);--> statement-breakpoint
CREATE INDEX `sample_type_idx` ON `samples` (`type`);--> statement-breakpoint
CREATE INDEX `sample_location_idx` ON `samples` (`locationId`);--> statement-breakpoint
CREATE INDEX `wfedge_wf_idx` ON `workflow_edges` (`workflowId`);--> statement-breakpoint
CREATE INDEX `wfnode_wf_idx` ON `workflow_nodes` (`workflowId`);