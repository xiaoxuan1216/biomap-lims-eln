ALTER TABLE `external_order_items` ADD `serviceTemplateKey` varchar(100);--> statement-breakpoint
ALTER TABLE `external_order_items` ADD `serviceTemplateVersion` int;--> statement-breakpoint
ALTER TABLE `external_order_items` ADD `requirementData` text;--> statement-breakpoint
ALTER TABLE `service_providers` ADD `catalogKey` varchar(64);--> statement-breakpoint
ALTER TABLE `service_providers` ADD CONSTRAINT `service_provider_catalog_key_unique` UNIQUE(`catalogKey`);--> statement-breakpoint
INSERT INTO `service_providers` (`name`, `catalogKey`, `type`, `qualificationStatus`, `specialties`, `notes`) VALUES
  ('金斯瑞（GenScript）', 'genscript', 'cro', 'pending', '基因合成、质粒制备、重组蛋白、定制抗体与多肽服务', '内置目录依据服务商公开产品分类整理；下单前需完成内部供应商准入并确认最终规格与报价。'),
  ('金唯智（GENEWIZ）', 'genewiz', 'sequencing', 'pending', 'Sanger 测序、二代测序、基因合成与质粒制备', '内置目录依据服务商公开产品分类整理；下单前需完成内部供应商准入并确认最终规格与报价。'),
  ('药明康德（WuXi AppTec）', 'wuxi_apptec', 'cro', 'pending', 'DMPK、生物分析、药理与非临床安全性评价', '内置目录依据服务商公开产品分类整理；下单前需完成内部供应商准入并确认最终规格与报价。'),
  ('药明生物（WuXi Biologics）', 'wuxi_biologics', 'cdmo', 'pending', '生物药发现、稳定细胞株、上下游工艺和分析方法开发', '内置目录依据服务商公开能力介绍整理；下单前需完成内部供应商准入并确认最终规格与报价。'),
  ('百英生物（Biointron）', 'biointron', 'cro', 'pending', '抗体表达、双抗表达、抗体人源化与亲和力成熟', '内置目录依据服务商公开产品分类整理；下单前需完成内部供应商准入并确认最终规格与报价。')
ON DUPLICATE KEY UPDATE
  `catalogKey` = VALUES(`catalogKey`),
  `type` = VALUES(`type`),
  `specialties` = VALUES(`specialties`),
  `notes` = VALUES(`notes`);
