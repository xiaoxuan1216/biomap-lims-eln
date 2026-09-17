ALTER TABLE `lab_runs` ADD `revision` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `lab_runs` ADD `lastTransitionKey` varchar(160);--> statement-breakpoint
CREATE INDEX `equipment_booking_lab_run_idx` ON `equipment_bookings` (`labRunId`);--> statement-breakpoint
CREATE INDEX `lab_run_resource_request_item_idx` ON `lab_run_resources` (`sampleRequestItemId`);--> statement-breakpoint
CREATE INDEX `lab_run_resource_reservation_idx` ON `lab_run_resources` (`inventoryReservationId`);