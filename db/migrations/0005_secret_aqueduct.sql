ALTER TABLE `external_results` ADD `idempotencyKey` varchar(128);--> statement-breakpoint
ALTER TABLE `external_results` ADD CONSTRAINT `external_result_idempotency_unique` UNIQUE(`idempotencyKey`);