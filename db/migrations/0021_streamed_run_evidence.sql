ALTER TABLE `lab_run_evidence` MODIFY COLUMN `contentBase64` longtext;--> statement-breakpoint
ALTER TABLE `lab_run_evidence` ADD `storageKey` varchar(128);