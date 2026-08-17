export const CRO_CATALOG_KEYS = [
  "genscript",
  "genewiz",
  "wuxi_apptec",
  "wuxi_biologics",
  "biointron",
] as const;

export type CroCatalogKey = (typeof CRO_CATALOG_KEYS)[number];
export type CroRequirementValue = string | number | boolean | string[];
export type CroRequirementData = Record<string, CroRequirementValue>;

export type CroRequirementField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "multiselect" | "boolean";
  required?: boolean;
  unit?: string;
  placeholder?: string;
  help?: string;
  options?: Array<{ value: string; label: string }>;
  defaultValue?: CroRequirementValue;
};

export type CroServiceTemplate = {
  key: string;
  version: 1;
  name: string;
  category: string;
  description: string;
  unit: string;
  acceptanceCriteria: string;
  fields: CroRequirementField[];
};

export type CroCatalog = {
  key: CroCatalogKey;
  providerName: string;
  sourceUrl: string;
  sourceLabel: string;
  services: CroServiceTemplate[];
};

const option = (value: string, label: string) => ({ value, label });

export const CRO_CATALOGS: Record<CroCatalogKey, CroCatalog> = {
  genscript: {
    key: "genscript",
    providerName: "金斯瑞（GenScript）",
    sourceUrl: "https://www.genscript.com/research-development-solutions.html",
    sourceLabel: "金斯瑞公开服务目录",
    services: [
      {
        key: "gene_synthesis_cloning",
        version: 1,
        name: "基因合成与克隆",
        category: "基因服务",
        description:
          "基于目标序列、表达宿主和载体要求完成基因合成、克隆及质粒交付。",
        unit: "构建",
        acceptanceCriteria:
          "交付序列应与确认版本一致，并提供测序验证文件、质粒图谱及约定的质量检测结果。",
        fields: [
          {
            key: "sequence",
            label: "目标序列 / 序列文件编号",
            type: "textarea",
            required: true,
            placeholder: "粘贴序列，或填写 BioMap 序列编号",
          },
          {
            key: "codonHost",
            label: "密码子优化宿主",
            type: "select",
            required: true,
            options: [
              option("ecoli", "大肠杆菌"),
              option("cho", "CHO"),
              option("hek293", "HEK293"),
              option("yeast", "酵母"),
              option("insect", "昆虫细胞"),
              option("none", "不优化"),
            ],
          },
          {
            key: "vector",
            label: "目标载体",
            type: "text",
            required: true,
            placeholder: "如 pcDNA3.1(+)",
          },
          {
            key: "cloningSites",
            label: "克隆位点 / 组装方式",
            type: "text",
            required: true,
          },
          {
            key: "plasmidScale",
            label: "质粒制备规模",
            type: "select",
            required: true,
            options: [
              option("mini", "2–5 µg"),
              option("100ug", "100 µg"),
              option("1mg", "1 mg"),
              option("10mg", "10 mg"),
            ],
          },
          {
            key: "endotoxin",
            label: "内毒素要求",
            type: "select",
            required: true,
            options: [
              option("standard", "常规级"),
              option("low", "低内毒素"),
              option("free", "无内毒素级"),
            ],
          },
        ],
      },
      {
        key: "recombinant_protein_expression",
        version: 1,
        name: "重组蛋白表达与纯化",
        category: "蛋白服务",
        description:
          "从表达构建设计到小试表达、放大纯化和质量分析的重组蛋白服务。",
        unit: "蛋白",
        acceptanceCriteria:
          "按约定交付蛋白、浓度与纯度结果；原始检测数据、缓冲液配方和批次信息应完整可追溯。",
        fields: [
          {
            key: "sequenceRef",
            label: "蛋白序列 / 构建编号",
            type: "textarea",
            required: true,
          },
          {
            key: "expressionSystem",
            label: "表达系统",
            type: "select",
            required: true,
            options: [
              option("ecoli", "大肠杆菌"),
              option("cho", "CHO"),
              option("hek293", "HEK293"),
              option("insect", "昆虫细胞"),
              option("yeast", "酵母"),
            ],
          },
          {
            key: "scale",
            label: "目标交付量",
            type: "text",
            required: true,
            placeholder: "如 20 mg",
          },
          {
            key: "tag",
            label: "融合标签",
            type: "text",
            required: true,
            placeholder: "如 His6 / Fc / 无标签",
          },
          {
            key: "purityTarget",
            label: "目标纯度",
            type: "select",
            required: true,
            options: [
              option("90", "≥90%"),
              option("95", "≥95%"),
              option("98", "≥98%"),
            ],
          },
          {
            key: "qc",
            label: "质量检测项目",
            type: "multiselect",
            required: true,
            options: [
              option("sds_page", "SDS-PAGE"),
              option("sec_hplc", "SEC-HPLC"),
              option("lc_ms", "LC-MS"),
              option("endotoxin", "内毒素"),
              option("activity", "活性检测"),
            ],
          },
          { key: "buffer", label: "交付缓冲液", type: "text", required: true },
        ],
      },
      {
        key: "custom_antibody",
        version: 1,
        name: "定制抗体开发",
        category: "抗体服务",
        description:
          "围绕抗原、宿主、抗体类型和应用场景完成抗体制备、筛选及交付。",
        unit: "项目",
        acceptanceCriteria:
          "交付抗体及筛选报告，包含抗原信息、免疫/筛选过程、效价或亲和力及约定应用验证数据。",
        fields: [
          {
            key: "antigen",
            label: "抗原信息",
            type: "textarea",
            required: true,
          },
          {
            key: "antibodyType",
            label: "抗体类型",
            type: "select",
            required: true,
            options: [
              option("monoclonal", "单克隆抗体"),
              option("polyclonal", "多克隆抗体"),
              option("recombinant", "重组抗体"),
            ],
          },
          {
            key: "hostSpecies",
            label: "免疫宿主",
            type: "select",
            required: true,
            options: [
              option("mouse", "小鼠"),
              option("rabbit", "兔"),
              option("alpaca", "羊驼"),
              option("other", "其他"),
            ],
          },
          {
            key: "applications",
            label: "目标应用",
            type: "multiselect",
            required: true,
            options: [
              option("elisa", "ELISA"),
              option("wb", "WB"),
              option("ihc", "IHC"),
              option("fc", "流式"),
              option("functional", "功能实验"),
            ],
          },
          {
            key: "cloneCount",
            label: "期望交付克隆数",
            type: "number",
            required: true,
            unit: "个",
          },
          {
            key: "affinityTarget",
            label: "亲和力目标",
            type: "text",
            placeholder: "如 KD ≤ 10 nM",
          },
        ],
      },
      {
        key: "peptide_synthesis",
        version: 1,
        name: "多肽合成",
        category: "多肽服务",
        description: "按序列、纯度、修饰和交付规模定制合成多肽。",
        unit: "条",
        acceptanceCriteria:
          "交付多肽序列、质量和纯度应符合确认规格，并提供 HPLC 与 MS 质量文件。",
        fields: [
          {
            key: "peptideSequence",
            label: "多肽序列",
            type: "textarea",
            required: true,
          },
          {
            key: "purity",
            label: "目标纯度",
            type: "select",
            required: true,
            options: [
              option("crude", "粗品"),
              option("70", "≥70%"),
              option("85", "≥85%"),
              option("90", "≥90%"),
              option("95", "≥95%"),
              option("98", "≥98%"),
            ],
          },
          {
            key: "scale",
            label: "交付规模",
            type: "text",
            required: true,
            placeholder: "如 10 mg",
          },
          {
            key: "modification",
            label: "末端 / 侧链修饰",
            type: "text",
            placeholder: "如 N 端乙酰化、C 端酰胺化",
          },
          {
            key: "conjugation",
            label: "偶联要求",
            type: "text",
            placeholder: "如 KLH / BSA / Biotin",
          },
        ],
      },
    ],
  },
  genewiz: {
    key: "genewiz",
    providerName: "金唯智（GENEWIZ）",
    sourceUrl: "https://www.genewiz.com/",
    sourceLabel: "金唯智公开服务目录",
    services: [
      {
        key: "sanger_sequencing",
        version: 1,
        name: "Sanger 测序",
        category: "测序服务",
        description: "针对质粒、PCR 产物等样本进行单向或双向 Sanger 测序。",
        unit: "反应",
        acceptanceCriteria:
          "交付原始峰图、碱基判读文件和质量信息；有效读长及样本匹配规则按订单约定执行。",
        fields: [
          {
            key: "sampleType",
            label: "样本类型",
            type: "select",
            required: true,
            options: [
              option("plasmid", "质粒"),
              option("pcr", "PCR 产物"),
              option("colony", "菌落"),
              option("purified_dna", "纯化 DNA"),
            ],
          },
          {
            key: "sampleCount",
            label: "样本数量",
            type: "number",
            required: true,
            unit: "个",
          },
          {
            key: "primerStrategy",
            label: "引物提供方式",
            type: "select",
            required: true,
            options: [
              option("customer", "客户提供"),
              option("universal", "通用引物"),
              option("design", "委托设计"),
            ],
          },
          {
            key: "direction",
            label: "测序方向",
            type: "select",
            required: true,
            options: [
              option("forward", "正向"),
              option("reverse", "反向"),
              option("bidirectional", "双向"),
            ],
          },
          {
            key: "specialTemplate",
            label: "特殊模板说明",
            type: "text",
            placeholder: "如 GC-rich、重复序列或发卡结构",
          },
          {
            key: "dataFormat",
            label: "交付格式",
            type: "multiselect",
            required: true,
            options: [
              option("ab1", "AB1 峰图"),
              option("seq", "SEQ"),
              option("pdf", "PDF 报告"),
            ],
          },
        ],
      },
      {
        key: "next_generation_sequencing",
        version: 1,
        name: "二代测序与基础分析",
        category: "测序服务",
        description:
          "覆盖 DNA、RNA、扩增子及单细胞等常见建库、测序与数据分析需求。",
        unit: "项目",
        acceptanceCriteria:
          "交付原始 FASTQ、建库与测序 QC、样本对应关系和约定分析结果；数据量及 Q30 达到确认规格。",
        fields: [
          {
            key: "assayType",
            label: "测序类型",
            type: "select",
            required: true,
            options: [
              option("wgs", "全基因组测序"),
              option("wes", "外显子组测序"),
              option("rna_seq", "RNA-seq"),
              option("amplicon", "扩增子测序"),
              option("single_cell", "单细胞测序"),
            ],
          },
          { key: "species", label: "物种", type: "text", required: true },
          {
            key: "sampleCount",
            label: "样本数量",
            type: "number",
            required: true,
            unit: "个",
          },
          {
            key: "inputMaterial",
            label: "起始材料与浓度",
            type: "textarea",
            required: true,
          },
          {
            key: "readMode",
            label: "读长模式",
            type: "select",
            required: true,
            options: [
              option("pe150", "PE150"),
              option("pe100", "PE100"),
              option("se50", "SE50"),
              option("custom", "其他"),
            ],
          },
          {
            key: "targetData",
            label: "目标数据量",
            type: "text",
            required: true,
            placeholder: "如 6 Gb / 样本",
          },
          {
            key: "analysisLevel",
            label: "分析深度",
            type: "select",
            required: true,
            options: [
              option("raw", "仅原始数据"),
              option("basic", "基础分析"),
              option("advanced", "高级分析"),
            ],
          },
          { key: "referenceGenome", label: "参考基因组版本", type: "text" },
        ],
      },
      {
        key: "gene_synthesis",
        version: 1,
        name: "基因合成",
        category: "基因服务",
        description: "按序列特征、载体、服务等级和质粒制备要求完成基因合成。",
        unit: "构建",
        acceptanceCriteria:
          "交付构建应通过序列验证，并提供质粒图谱、序列文件和约定的质粒质量结果。",
        fields: [
          {
            key: "sequence",
            label: "目标序列 / 序列文件编号",
            type: "textarea",
            required: true,
          },
          {
            key: "serviceTier",
            label: "服务等级",
            type: "select",
            required: true,
            options: [
              option("sprint", "SPRINT"),
              option("flex", "FLEX"),
              option("flex_plus", "FLEX+"),
            ],
          },
          {
            key: "codonHost",
            label: "密码子优化宿主",
            type: "select",
            required: true,
            options: [
              option("ecoli", "大肠杆菌"),
              option("cho", "CHO"),
              option("hek293", "HEK293"),
              option("yeast", "酵母"),
              option("none", "不优化"),
            ],
          },
          { key: "vector", label: "目标载体", type: "text", required: true },
          {
            key: "cloningSites",
            label: "克隆位点 / 组装方式",
            type: "text",
            required: true,
          },
          {
            key: "plasmidScale",
            label: "质粒制备规模",
            type: "select",
            required: true,
            options: [
              option("mini", "2–5 µg"),
              option("100ug", "100 µg"),
              option("1mg", "1 mg"),
            ],
          },
        ],
      },
      {
        key: "plasmid_prep",
        version: 1,
        name: "质粒制备",
        category: "基因服务",
        description: "对已确认构建进行不同规模和内毒素等级的质粒扩增与制备。",
        unit: "质粒",
        acceptanceCriteria:
          "质粒身份、浓度、总量、纯度和内毒素水平应满足确认规格，并提供 COA 或检测记录。",
        fields: [
          {
            key: "constructRef",
            label: "质粒名称 / 构建编号",
            type: "textarea",
            required: true,
          },
          {
            key: "constructCount",
            label: "构建数量",
            type: "number",
            required: true,
            unit: "个",
          },
          {
            key: "plasmidScale",
            label: "质粒制备规模",
            type: "select",
            required: true,
            options: [
              option("100ug", "100 µg"),
              option("1mg", "1 mg"),
              option("10mg", "10 mg"),
              option("custom", "定制"),
            ],
          },
          {
            key: "endotoxin",
            label: "内毒素要求",
            type: "select",
            required: true,
            options: [
              option("standard", "常规级"),
              option("low", "低内毒素"),
              option("free", "无内毒素级"),
            ],
          },
          {
            key: "concentration",
            label: "目标浓度",
            type: "text",
            placeholder: "如 ≥1 mg/mL",
          },
        ],
      },
    ],
  },
  wuxi_apptec: {
    key: "wuxi_apptec",
    providerName: "药明康德（WuXi AppTec）",
    sourceUrl: "https://labtesting.wuxiapptec.com/dmpk-services/",
    sourceLabel: "药明康德公开测试服务目录",
    services: [
      {
        key: "in_vitro_adme",
        version: 1,
        name: "体外 ADME 研究",
        category: "DMPK",
        description:
          "以标准化体外实验评估化合物的溶解性、通透性、代谢和相互作用风险。",
        unit: "项目",
        acceptanceCriteria:
          "交付样本清单、实验方案、原始数据、计算过程、QC 结果和签发报告，异常与偏差应有说明。",
        fields: [
          {
            key: "modality",
            label: "分子类型",
            type: "select",
            required: true,
            options: [
              option("small_molecule", "小分子"),
              option("peptide", "多肽"),
              option("oligo", "寡核苷酸"),
              option("protein", "蛋白 / 抗体"),
              option("other", "其他"),
            ],
          },
          {
            key: "compoundCount",
            label: "受试物数量",
            type: "number",
            required: true,
            unit: "个",
          },
          {
            key: "assays",
            label: "研究项目",
            type: "multiselect",
            required: true,
            options: [
              option("solubility", "溶解度"),
              option("permeability", "通透性"),
              option("ppb", "血浆蛋白结合"),
              option("metabolic_stability", "代谢稳定性"),
              option("cyp", "CYP 抑制 / 诱导"),
              option("transporter", "转运体"),
            ],
          },
          {
            key: "species",
            label: "研究种属",
            type: "multiselect",
            required: true,
            options: [
              option("human", "人"),
              option("mouse", "小鼠"),
              option("rat", "大鼠"),
              option("dog", "犬"),
              option("monkey", "猴"),
            ],
          },
          {
            key: "concentrationDesign",
            label: "浓度 / 重复设计",
            type: "textarea",
            required: true,
          },
          {
            key: "regulatory",
            label: "合规等级",
            type: "select",
            required: true,
            options: [
              option("discovery", "发现阶段"),
              option("non_glp", "Non-GLP"),
              option("glp", "GLP"),
            ],
          },
        ],
      },
      {
        key: "in_vivo_pk",
        version: 1,
        name: "体内药代动力学研究",
        category: "DMPK",
        description: "设计并执行不同种属、给药途径和采样方案的体内 PK 研究。",
        unit: "研究",
        acceptanceCriteria:
          "动物、给药、采样和生物分析记录应完整，交付个体与汇总浓度数据、PK 参数、偏差及签发报告。",
        fields: [
          {
            key: "species",
            label: "研究种属",
            type: "select",
            required: true,
            options: [
              option("mouse", "小鼠"),
              option("rat", "大鼠"),
              option("dog", "犬"),
              option("monkey", "猴"),
              option("other", "其他"),
            ],
          },
          {
            key: "animalDesign",
            label: "动物数量与性别",
            type: "text",
            required: true,
            placeholder: "如 3 只雄性 / 组",
          },
          {
            key: "route",
            label: "给药途径",
            type: "multiselect",
            required: true,
            options: [
              option("iv", "静脉"),
              option("po", "口服"),
              option("sc", "皮下"),
              option("ip", "腹腔"),
              option("other", "其他"),
            ],
          },
          {
            key: "dose",
            label: "剂量与制剂",
            type: "textarea",
            required: true,
          },
          {
            key: "timepoints",
            label: "采样时间点",
            type: "textarea",
            required: true,
          },
          {
            key: "bioanalysis",
            label: "生物分析平台",
            type: "select",
            required: true,
            options: [
              option("lc_ms", "LC-MS/MS"),
              option("ligand_binding", "配体结合分析"),
              option("qpcr", "qPCR / ddPCR"),
              option("other", "其他"),
            ],
          },
          {
            key: "regulatory",
            label: "合规等级",
            type: "select",
            required: true,
            options: [
              option("discovery", "发现阶段"),
              option("non_glp", "Non-GLP"),
              option("glp", "GLP"),
            ],
          },
        ],
      },
      {
        key: "bioanalysis",
        version: 1,
        name: "生物分析方法与样本检测",
        category: "生物分析",
        description:
          "为临床前或临床样本开发、验证或转移定量生物分析方法并完成检测。",
        unit: "项目",
        acceptanceCriteria:
          "方法学及批次接受标准应预先确认，交付方法报告、批次数据、标准曲线、QC、ISR（如适用）和偏差记录。",
        fields: [
          {
            key: "analyte",
            label: "分析物 / 生物标志物",
            type: "textarea",
            required: true,
          },
          {
            key: "matrix",
            label: "生物基质",
            type: "text",
            required: true,
            placeholder: "如 K2EDTA 血浆",
          },
          {
            key: "sampleCount",
            label: "样本数量",
            type: "number",
            required: true,
            unit: "份",
          },
          {
            key: "platform",
            label: "检测平台",
            type: "select",
            required: true,
            options: [
              option("lc_ms", "LC-MS/MS"),
              option("elisa", "ELISA"),
              option("msd", "MSD"),
              option("qpcr", "qPCR / ddPCR"),
              option("flow", "流式"),
            ],
          },
          {
            key: "methodScope",
            label: "方法工作范围",
            type: "select",
            required: true,
            options: [
              option("development", "方法开发"),
              option("validation", "方法验证"),
              option("transfer", "方法转移"),
              option("sample_analysis", "样本检测"),
            ],
          },
          {
            key: "sensitivity",
            label: "灵敏度 / 定量范围目标",
            type: "text",
            required: true,
          },
          {
            key: "regulatory",
            label: "合规等级",
            type: "select",
            required: true,
            options: [
              option("discovery", "发现阶段"),
              option("non_glp", "Non-GLP"),
              option("glp", "GLP"),
            ],
          },
        ],
      },
      {
        key: "toxicology",
        version: 1,
        name: "非临床毒理研究",
        category: "安全性评价",
        description: "按研究阶段设计单次或重复给药等非临床安全性评价研究。",
        unit: "研究",
        acceptanceCriteria:
          "研究方案、原始记录、病理与临床观察、统计分析、偏差及签发报告应完整并符合约定合规等级。",
        fields: [
          {
            key: "studyType",
            label: "研究类型",
            type: "select",
            required: true,
            options: [
              option("single_dose", "单次给药毒性"),
              option("repeat_dose", "重复给药毒性"),
              option("safety_pharm", "安全药理"),
              option("local_tolerance", "局部耐受"),
              option("other", "其他"),
            ],
          },
          {
            key: "species",
            label: "研究种属",
            type: "select",
            required: true,
            options: [
              option("mouse", "小鼠"),
              option("rat", "大鼠"),
              option("dog", "犬"),
              option("monkey", "猴"),
              option("other", "其他"),
            ],
          },
          { key: "duration", label: "研究周期", type: "text", required: true },
          {
            key: "doseGroups",
            label: "剂量组与动物数",
            type: "textarea",
            required: true,
          },
          { key: "route", label: "给药途径", type: "text", required: true },
          {
            key: "regulatory",
            label: "合规等级",
            type: "select",
            required: true,
            options: [option("non_glp", "Non-GLP"), option("glp", "GLP")],
          },
          {
            key: "endpoints",
            label: "关键观察终点",
            type: "textarea",
            required: true,
          },
        ],
      },
    ],
  },
  wuxi_biologics: {
    key: "wuxi_biologics",
    providerName: "药明生物（WuXi Biologics）",
    sourceUrl: "https://www.wuxibiologics.com/company/",
    sourceLabel: "药明生物公开能力介绍",
    services: [
      {
        key: "antibody_discovery",
        version: 1,
        name: "抗体发现与候选筛选",
        category: "生物药发现",
        description:
          "围绕靶点、发现平台、筛选方法和功能要求开展抗体发现与候选确认。",
        unit: "项目",
        acceptanceCriteria:
          "交付候选序列、筛选漏斗、结合与功能数据、原始数据索引和候选推荐依据。",
        fields: [
          {
            key: "target",
            label: "靶点与抗原信息",
            type: "textarea",
            required: true,
          },
          {
            key: "platform",
            label: "发现平台",
            type: "select",
            required: true,
            options: [
              option("hybridoma", "杂交瘤"),
              option("phage", "噬菌体展示"),
              option("single_b", "单 B 细胞"),
              option("in_silico", "计算设计"),
              option("combined", "组合方案"),
            ],
          },
          {
            key: "screening",
            label: "筛选方法",
            type: "multiselect",
            required: true,
            options: [
              option("binding", "结合筛选"),
              option("blocking", "阻断筛选"),
              option("cell_binding", "细胞结合"),
              option("functional", "功能筛选"),
              option("developability", "可开发性初筛"),
            ],
          },
          {
            key: "hitCount",
            label: "期望候选数量",
            type: "number",
            required: true,
            unit: "个",
          },
          { key: "affinityTarget", label: "亲和力目标", type: "text" },
          {
            key: "functionalAssay",
            label: "关键功能实验",
            type: "textarea",
            required: true,
          },
        ],
      },
      {
        key: "cell_line_development",
        version: 1,
        name: "稳定细胞株开发",
        category: "生物工艺开发",
        description:
          "针对目标生物分子进行宿主选择、转染、克隆筛选、稳定性和生产力评估。",
        unit: "细胞株",
        acceptanceCriteria:
          "交付候选克隆、构建与培养信息、产量和稳定性数据，并按约定提供细胞库及质量文件。",
        fields: [
          {
            key: "molecule",
            label: "目标分子 / 构建信息",
            type: "textarea",
            required: true,
          },
          {
            key: "host",
            label: "宿主细胞",
            type: "select",
            required: true,
            options: [
              option("cho", "CHO"),
              option("hek293", "HEK293"),
              option("other", "其他"),
            ],
          },
          {
            key: "cloneCount",
            label: "期望交付克隆数",
            type: "number",
            required: true,
            unit: "个",
          },
          {
            key: "titerTarget",
            label: "目标表达量",
            type: "text",
            required: true,
          },
          {
            key: "stability",
            label: "稳定性考察周期",
            type: "text",
            required: true,
          },
          {
            key: "stage",
            label: "项目阶段",
            type: "select",
            required: true,
            options: [
              option("research", "研究级"),
              option("preclinical", "临床前"),
              option("clinical", "临床开发"),
            ],
          },
        ],
      },
      {
        key: "process_development",
        version: 1,
        name: "上下游工艺开发",
        category: "生物工艺开发",
        description: "开展培养、收获、纯化及放大策略的开发、优化和表征。",
        unit: "项目",
        acceptanceCriteria:
          "交付工艺流程、关键参数与物料属性、批次数据、收率与质量结果，以及风险和放大建议。",
        fields: [
          {
            key: "modality",
            label: "生物药类型",
            type: "select",
            required: true,
            options: [
              option("mab", "单克隆抗体"),
              option("bispecific", "双抗 / 多抗"),
              option("fusion", "融合蛋白"),
              option("vaccine", "疫苗"),
              option("other", "其他"),
            ],
          },
          {
            key: "scope",
            label: "工艺范围",
            type: "multiselect",
            required: true,
            options: [
              option("upstream", "上游工艺"),
              option("harvest", "收获澄清"),
              option("downstream", "下游纯化"),
              option("formulation", "制剂开发"),
              option("scale_up", "工艺放大"),
            ],
          },
          {
            key: "startingMaterial",
            label: "起始材料与现有工艺",
            type: "textarea",
            required: true,
          },
          {
            key: "targetScale",
            label: "目标规模",
            type: "text",
            required: true,
          },
          {
            key: "qualityTargets",
            label: "收率与关键质量目标",
            type: "textarea",
            required: true,
          },
          {
            key: "stage",
            label: "项目阶段",
            type: "select",
            required: true,
            options: [
              option("research", "研究级"),
              option("preclinical", "临床前"),
              option("clinical", "临床开发"),
              option("commercial", "商业化"),
            ],
          },
        ],
      },
      {
        key: "analytical_development",
        version: 1,
        name: "分析方法开发与表征",
        category: "生物药分析",
        description:
          "围绕生物药关键质量属性开展分析方法开发、鉴定、验证和可比性研究。",
        unit: "项目",
        acceptanceCriteria:
          "方法、系统适用性和接受标准应预先确认，交付原始数据、方法文件、验证/确认报告和偏差记录。",
        fields: [
          {
            key: "sample",
            label: "样品与批次信息",
            type: "textarea",
            required: true,
          },
          {
            key: "cqas",
            label: "关键质量属性",
            type: "multiselect",
            required: true,
            options: [
              option("identity", "鉴别"),
              option("purity", "纯度 / 聚集体"),
              option("charge", "电荷异质性"),
              option("glycan", "糖型"),
              option("potency", "效价 / 活性"),
              option("safety", "安全性杂质"),
            ],
          },
          {
            key: "methodScope",
            label: "方法工作范围",
            type: "select",
            required: true,
            options: [
              option("development", "方法开发"),
              option("qualification", "方法确认"),
              option("validation", "方法验证"),
              option("transfer", "方法转移"),
              option("comparability", "可比性研究"),
            ],
          },
          {
            key: "sampleCount",
            label: "样本数量",
            type: "number",
            required: true,
            unit: "份",
          },
          {
            key: "stage",
            label: "项目阶段",
            type: "select",
            required: true,
            options: [
              option("research", "研究级"),
              option("preclinical", "临床前"),
              option("clinical", "临床开发"),
              option("commercial", "商业化"),
            ],
          },
        ],
      },
    ],
  },
  biointron: {
    key: "biointron",
    providerName: "百英生物（Biointron）",
    sourceUrl: "https://www.biointron.com.cn/about-us/",
    sourceLabel: "百英生物公开服务目录",
    services: [
      {
        key: "recombinant_antibody_expression",
        version: 1,
        name: "重组抗体表达与纯化",
        category: "抗体表达",
        description:
          "从抗体序列和构建出发，在哺乳动物细胞中完成表达、纯化和基础质控。",
        unit: "抗体",
        acceptanceCriteria:
          "交付抗体、浓度、纯度及约定质量结果，并提供构建、批次、缓冲液和检测原始文件。",
        fields: [
          {
            key: "sequence",
            label: "抗体序列 / 构建编号",
            type: "textarea",
            required: true,
          },
          {
            key: "format",
            label: "抗体形式",
            type: "select",
            required: true,
            options: [
              option("igg", "全长 IgG"),
              option("fab", "Fab"),
              option("fc_fusion", "Fc 融合蛋白"),
              option("vhh", "VHH"),
              option("other", "其他"),
            ],
          },
          {
            key: "host",
            label: "表达宿主",
            type: "select",
            required: true,
            options: [option("hek293", "HEK293"), option("cho", "CHO")],
          },
          {
            key: "scale",
            label: "目标交付量",
            type: "text",
            required: true,
            placeholder: "如 10 mg / 构建",
          },
          {
            key: "purityTarget",
            label: "目标纯度",
            type: "select",
            required: true,
            options: [
              option("90", "≥90%"),
              option("95", "≥95%"),
              option("98", "≥98%"),
            ],
          },
          {
            key: "qc",
            label: "质量检测项目",
            type: "multiselect",
            required: true,
            options: [
              option("sds_page", "SDS-PAGE"),
              option("sec_hplc", "SEC-HPLC"),
              option("lc_ms", "LC-MS"),
              option("endotoxin", "内毒素"),
              option("binding", "结合活性"),
            ],
          },
          { key: "buffer", label: "交付缓冲液", type: "text", required: true },
        ],
      },
      {
        key: "bispecific_expression",
        version: 1,
        name: "双特异性抗体表达",
        category: "抗体表达",
        description:
          "针对双抗格式、链配对设计和质量目标完成构建、表达、纯化及表征。",
        unit: "构建",
        acceptanceCriteria:
          "交付产量、纯度、单体比例和身份检测结果，链配对及异常峰应有明确说明。",
        fields: [
          {
            key: "format",
            label: "双抗格式",
            type: "text",
            required: true,
            placeholder: "如 KiH IgG、2+1、BiTE",
          },
          {
            key: "sequence",
            label: "抗体序列 / 构建编号",
            type: "textarea",
            required: true,
          },
          {
            key: "pairingDesign",
            label: "链配对 / 工程化设计",
            type: "textarea",
            required: true,
          },
          {
            key: "host",
            label: "表达宿主",
            type: "select",
            required: true,
            options: [option("hek293", "HEK293"), option("cho", "CHO")],
          },
          { key: "scale", label: "目标交付量", type: "text", required: true },
          {
            key: "purityTarget",
            label: "目标纯度",
            type: "text",
            required: true,
            placeholder: "如 SEC 单体 ≥95%",
          },
        ],
      },
      {
        key: "antibody_humanization",
        version: 1,
        name: "抗体人源化与可开发性优化",
        category: "抗体优化",
        description:
          "基于亲本抗体序列设计人源化变体，并结合结合活性、功能和可开发性数据筛选。",
        unit: "项目",
        acceptanceCriteria:
          "交付设计依据、候选序列、表达质控、结合/功能比较及可开发性风险结论。",
        fields: [
          {
            key: "parentSequence",
            label: "亲本抗体序列",
            type: "textarea",
            required: true,
          },
          {
            key: "species",
            label: "亲本来源物种",
            type: "text",
            required: true,
          },
          {
            key: "variantCount",
            label: "期望设计变体数",
            type: "number",
            required: true,
            unit: "个",
          },
          {
            key: "bindingAssay",
            label: "结合评价方法",
            type: "multiselect",
            required: true,
            options: [
              option("elisa", "ELISA"),
              option("spr", "SPR"),
              option("bli", "BLI"),
              option("cell_binding", "细胞结合"),
            ],
          },
          {
            key: "functionalAssay",
            label: "关键功能实验",
            type: "textarea",
            required: true,
          },
          {
            key: "developability",
            label: "可开发性评价",
            type: "multiselect",
            required: true,
            options: [
              option("aggregation", "聚集倾向"),
              option("stability", "热稳定性"),
              option("self_interaction", "自相互作用"),
              option("nonspecific", "非特异性结合"),
              option("immunogenicity", "免疫原性风险"),
            ],
          },
        ],
      },
      {
        key: "affinity_maturation",
        version: 1,
        name: "抗体亲和力成熟",
        category: "抗体优化",
        description:
          "围绕亲本抗体、目标亲和力和筛选策略构建变体库并完成候选验证。",
        unit: "项目",
        acceptanceCriteria:
          "交付突变库设计、筛选流程、候选序列、亲和力原始数据及与亲本的功能比较。",
        fields: [
          {
            key: "parentSequence",
            label: "亲本抗体序列",
            type: "textarea",
            required: true,
          },
          {
            key: "startingAffinity",
            label: "亲本亲和力",
            type: "text",
            required: true,
          },
          {
            key: "targetAffinity",
            label: "目标亲和力",
            type: "text",
            required: true,
          },
          {
            key: "libraryStrategy",
            label: "突变 / 文库策略",
            type: "select",
            required: true,
            options: [
              option("cdr", "CDR 定向突变"),
              option("error_prone", "随机突变"),
              option("computational", "计算设计"),
              option("combined", "组合方案"),
            ],
          },
          {
            key: "screeningPlatform",
            label: "筛选平台",
            type: "select",
            required: true,
            options: [
              option("phage", "噬菌体展示"),
              option("yeast", "酵母展示"),
              option("mammalian", "哺乳动物细胞展示"),
              option("other", "其他"),
            ],
          },
          {
            key: "outputCount",
            label: "期望候选数量",
            type: "number",
            required: true,
            unit: "个",
          },
          {
            key: "functionalAssay",
            label: "关键功能实验",
            type: "textarea",
            required: true,
          },
        ],
      },
    ],
  },
};

export function getCroCatalog(
  catalogKey: string | null | undefined
): CroCatalog | undefined {
  return catalogKey && CRO_CATALOG_KEYS.includes(catalogKey as CroCatalogKey)
    ? CRO_CATALOGS[catalogKey as CroCatalogKey]
    : undefined;
}

export function getCroServiceTemplate(
  catalogKey: string | null | undefined,
  templateKey: string | null | undefined
): CroServiceTemplate | undefined {
  if (!templateKey) return undefined;
  return getCroCatalog(catalogKey)?.services.find(
    service => service.key === templateKey
  );
}

export function initialCroRequirementData(
  template: CroServiceTemplate
): CroRequirementData {
  return Object.fromEntries(
    template.fields
      .filter(field => field.defaultValue !== undefined)
      .map(field => [field.key, field.defaultValue as CroRequirementValue])
  );
}

export function validateCroRequirementData(
  template: CroServiceTemplate,
  data: CroRequirementData
): string[] {
  const errors: string[] = [];
  const knownKeys = new Set(template.fields.map(field => field.key));
  for (const key of Object.keys(data)) {
    if (!knownKeys.has(key)) errors.push(`包含未知字段：${key}`);
  }
  for (const field of template.fields) {
    const value = data[field.key];
    const empty =
      value === undefined ||
      value === "" ||
      (Array.isArray(value) && value.length === 0);
    if (field.required && empty) {
      errors.push(`${field.label}为必填项`);
      continue;
    }
    if (empty) continue;
    if (
      field.type === "number" &&
      (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    ) {
      errors.push(`${field.label}必须是有效数字`);
    }
    if (field.type === "boolean" && typeof value !== "boolean") {
      errors.push(`${field.label}必须为是或否`);
    }
    if (field.type === "multiselect" && !Array.isArray(value)) {
      errors.push(`${field.label}必须是选项列表`);
    }
    if (
      ["text", "textarea", "select"].includes(field.type) &&
      typeof value !== "string"
    ) {
      errors.push(`${field.label}必须是文本`);
    }
    if (typeof value === "string" && value.length > 10_000) {
      errors.push(`${field.label}不能超过 10000 个字符`);
    }
    if (field.options) {
      const allowed = new Set(field.options.map(entry => entry.value));
      const values = Array.isArray(value) ? value : [value];
      if (
        values.some(entry => typeof entry !== "string" || !allowed.has(entry))
      ) {
        errors.push(`${field.label}包含无效选项`);
      }
    }
  }
  return errors;
}

export function parseCroRequirementData(
  value: string | null | undefined
): CroRequirementData {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as CroRequirementData)
      : {};
  } catch {
    return {};
  }
}
