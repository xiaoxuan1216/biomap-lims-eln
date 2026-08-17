import { CRO_CATALOGS } from "@contracts/croCatalog";

const SERVICE_NAMES: Record<string, string> = {
  gene_synthesis_cloning: "Gene Synthesis & Cloning",
  recombinant_protein_expression:
    "Recombinant Protein Expression & Purification",
  custom_antibody: "Custom Antibody Development",
  peptide_synthesis: "Peptide Synthesis",
  sanger_sequencing: "Sanger Sequencing",
  next_generation_sequencing: "Next-Generation Sequencing & Basic Analysis",
  gene_synthesis: "Gene Synthesis",
  plasmid_prep: "Plasmid Preparation",
  in_vitro_adme: "In Vitro ADME",
  in_vivo_pk: "In Vivo Pharmacokinetics",
  bioanalysis: "Bioanalytical Method & Sample Analysis",
  toxicology: "Nonclinical Toxicology",
  antibody_discovery: "Antibody Discovery & Candidate Screening",
  cell_line_development: "Stable Cell Line Development",
  process_development: "Upstream & Downstream Process Development",
  analytical_development: "Analytical Method Development & Characterization",
  recombinant_antibody_expression:
    "Recombinant Antibody Expression & Purification",
  bispecific_expression: "Bispecific Antibody Expression",
  antibody_humanization: "Antibody Humanization & Developability Optimization",
  affinity_maturation: "Antibody Affinity Maturation",
};

const CATEGORY_NAMES: Record<string, string> = {
  基因服务: "Gene Services",
  蛋白服务: "Protein Services",
  抗体服务: "Antibody Services",
  多肽服务: "Peptide Services",
  测序服务: "Sequencing Services",
  DMPK: "DMPK",
  生物分析: "Bioanalysis",
  安全性评价: "Safety Assessment",
  生物药发现: "Biologics Discovery",
  生物工艺开发: "Bioprocess Development",
  生物药分析: "Biologics Analysis",
  抗体表达: "Antibody Expression",
  抗体优化: "Antibody Optimization",
};

const PROVIDER_NAMES: Record<string, string> = {
  genscript: "GenScript",
  genewiz: "GENEWIZ",
  wuxi_apptec: "WuXi AppTec",
  wuxi_biologics: "WuXi Biologics",
  biointron: "Biointron",
};

const SPECIAL_TERMS: Record<string, string> = {
  ab1: "AB1 trace",
  adme: "ADME",
  bli: "BLI",
  cyp: "CYP inhibition / induction",
  ddpcr: "ddPCR",
  ecoli: "E. coli",
  elisa: "ELISA",
  glp: "GLP",
  hek293: "HEK293",
  ihc: "IHC",
  lc_ms: "LC-MS/MS",
  mab: "Monoclonal antibody",
  msd: "MSD",
  non_glp: "Non-GLP",
  pcr: "PCR product",
  pe100: "PE100",
  pe150: "PE150",
  qpcr: "qPCR / ddPCR",
  rna_seq: "RNA-seq",
  sds_page: "SDS-PAGE",
  se50: "SE50",
  sec_hplc: "SEC-HPLC",
  spr: "SPR",
  vhh: "VHH",
  wb: "WB",
  wes: "Whole-exome sequencing",
  wgs: "Whole-genome sequencing",
};

function titleFromKey(key: string): string {
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLowerCase();
  return normalized
    .split(" ")
    .map(
      (part, index) =>
        SPECIAL_TERMS[part] ??
        (index === 0 ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part)
    )
    .join(" ");
}

const UNIT_NAMES: Record<string, string> = {
  个: "count",
  份: "samples",
  条: "peptides",
  构建: "constructs",
  蛋白: "proteins",
  项目: "projects",
  反应: "reactions",
  质粒: "plasmids",
  研究: "studies",
  细胞株: "cell lines",
  抗体: "antibodies",
};

export const croCatalogEn: Record<string, string> = {
  "CRO 标准服务目录": "CRO Standard Service Catalog",
  "选择常用服务后填写结构化参数；正式下单前仍需与服务商确认最终规格。":
    "Select a common service and complete its structured parameters. Confirm final specifications with the provider before ordering.",
  委托内容模板: "Service Request Template",
  请选择: "Select an option",
  "自定义委托（自由输入）": "Custom Request (Free Text)",
  "结构化模板 v{version}": "Structured Template v{version}",
  结构化委托参数: "Structured Request Parameters",
  "模板 v{version}": "Template v{version}",
  请完成所有必填的结构化需求参数:
    "Complete all required structured request parameters",
  "补充说明（选填）": "Additional Notes (Optional)",
  填写超出标准模板的特殊要求:
    "Add any requirements not covered by the standard template",
};

for (const catalog of Object.values(CRO_CATALOGS)) {
  const providerName = PROVIDER_NAMES[catalog.key] ?? catalog.key;
  croCatalogEn[catalog.sourceLabel] =
    `Official ${providerName} Service Catalog`;
  for (const service of catalog.services) {
    const serviceName = SERVICE_NAMES[service.key] ?? titleFromKey(service.key);
    croCatalogEn[service.name] = serviceName;
    croCatalogEn[service.category] =
      CATEGORY_NAMES[service.category] ?? titleFromKey(service.category);
    croCatalogEn[service.description] =
      `${serviceName} structured requirement template based on the provider's public service categories.`;
    for (const field of service.fields) {
      const fieldName = titleFromKey(field.key);
      croCatalogEn[field.label] = fieldName;
      if (field.unit)
        croCatalogEn[field.unit] = UNIT_NAMES[field.unit] ?? field.unit;
      if (field.placeholder)
        croCatalogEn[field.placeholder] = `Enter ${fieldName.toLowerCase()}`;
      if (field.help) croCatalogEn[field.help] = field.help;
      for (const entry of field.options ?? []) {
        croCatalogEn[entry.label] =
          SPECIAL_TERMS[entry.value] ?? titleFromKey(entry.value);
      }
    }
  }
}
