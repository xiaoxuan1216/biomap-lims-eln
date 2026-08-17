export const PROVIDER_TYPES = [
  "cro",
  "cdmo",
  "testing_lab",
  "sequencing",
  "animal_facility",
  "academic_core",
  "other",
] as const;

export const PROVIDER_TYPE_LABELS: Record<(typeof PROVIDER_TYPES)[number], string> = {
  cro: "CRO",
  cdmo: "CDMO",
  testing_lab: "第三方检测",
  sequencing: "测序服务",
  animal_facility: "动物实验平台",
  academic_core: "高校公共平台",
  other: "其他服务商",
};

export const PROVIDER_QUALIFICATION = {
  pending: { label: "待评估", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  qualified: { label: "合格供应商", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  restricted: { label: "限制使用", cls: "bg-orange-50 text-orange-700 border-orange-200" },
  disqualified: { label: "已停用", cls: "bg-rose-50 text-rose-700 border-rose-200" },
} as const;

export const COMMERCIAL_STATUS = {
  draft: { label: "需求草稿", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  quoting: { label: "询价中", cls: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  pending_approval: { label: "待审批", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  approved: { label: "已批准", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  ordered: { label: "已下单", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  cancelled: { label: "已取消", cls: "bg-rose-50 text-rose-700 border-rose-200" },
} as const;

export const EXECUTION_STATUS = {
  awaiting_samples: { label: "待送样", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  in_transit: { label: "运输中", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  received: { label: "已签收", cls: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  in_progress: { label: "实验中", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  delivered: { label: "已交付", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  on_hold: { label: "已暂停", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  cancelled: { label: "已取消", cls: "bg-rose-50 text-rose-700 border-rose-200" },
} as const;

export const QUALITY_STATUS = {
  not_ready: { label: "尚未交付", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  pending_review: { label: "待验收", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  changes_requested: { label: "要求补充", cls: "bg-orange-50 text-orange-700 border-orange-200" },
  accepted: { label: "验收通过", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected: { label: "验收未通过", cls: "bg-rose-50 text-rose-700 border-rose-200" },
} as const;

export const ORDER_PRIORITY = {
  low: { label: "低", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  normal: { label: "普通", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  high: { label: "高", cls: "bg-orange-50 text-orange-700 border-orange-200" },
  urgent: { label: "紧急", cls: "bg-rose-50 text-rose-700 border-rose-200" },
} as const;

export const ORDER_ITEM_STATUS = {
  pending: { label: "待开始", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  in_progress: { label: "进行中", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  delivered: { label: "已交付", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  accepted: { label: "已验收", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected: { label: "未通过", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  cancelled: { label: "已取消", cls: "bg-slate-100 text-slate-500 border-slate-200" },
} as const;

export const SHIPMENT_STATUS = {
  planned: { label: "计划送样", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  prepared: { label: "已备样", cls: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  shipped: { label: "已寄出", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  received: { label: "已签收", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  returned: { label: "已退回", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  consumed: { label: "已消耗", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  exception: { label: "物流异常", cls: "bg-rose-50 text-rose-700 border-rose-200" },
} as const;

export const DELIVERABLE_TYPES = {
  raw_data: "原始数据",
  report: "分析报告",
  certificate: "证书 / COA",
  protocol: "实验方案",
  other: "其他文件",
} as const;

export const DELIVERABLE_REVIEW = {
  pending: { label: "待审核", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  accepted: { label: "已接受", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  changes_requested: { label: "要求补充", cls: "bg-orange-50 text-orange-700 border-orange-200" },
  rejected: { label: "已拒绝", cls: "bg-rose-50 text-rose-700 border-rose-200" },
} as const;

export const EXTERNAL_RESULT_REVIEW = {
  pending: { label: "待审核", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  accepted: { label: "已接受", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  changes_requested: { label: "要求补充", cls: "bg-orange-50 text-orange-700 border-orange-200" },
  rejected: { label: "已拒绝", cls: "bg-rose-50 text-rose-700 border-rose-200" },
} as const;

export const EXTERNAL_EXPERIMENT_RELATIONS = {
  source: "来源实验",
  result_review: "结果复核实验",
  reference: "参考实验",
} as const;

export const SAMPLE_DIRECTIONS = {
  outbound: "送往 CRO",
  inbound: "CRO 产出 / 退回",
} as const;

export const CUSTODY_EVENT_LABELS = {
  planned: "计划送样",
  prepared: "已备样",
  shipped: "已寄出",
  received: "已签收",
  returned: "已退回",
  consumed: "已消耗",
  exception: "物流异常",
  produced: "CRO 产出",
} as const;

export function externalOrderStage(order: {
  commercialStatus: keyof typeof COMMERCIAL_STATUS;
  executionStatus: keyof typeof EXECUTION_STATUS;
  qualityStatus: keyof typeof QUALITY_STATUS;
}): { label: string; cls: string; progress: number } {
  if (order.commercialStatus === "cancelled" || order.executionStatus === "cancelled") {
    return { label: "已取消", cls: "bg-rose-50 text-rose-700 border-rose-200", progress: 0 };
  }
  if (order.qualityStatus === "accepted") {
    return { label: "已完成", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", progress: 100 };
  }
  if (order.qualityStatus === "pending_review" || order.qualityStatus === "changes_requested") {
    return { label: QUALITY_STATUS[order.qualityStatus].label, cls: QUALITY_STATUS[order.qualityStatus].cls, progress: 90 };
  }
  const executionProgress: Record<keyof typeof EXECUTION_STATUS, number> = {
    awaiting_samples: 35,
    in_transit: 45,
    received: 55,
    in_progress: 70,
    delivered: 85,
    on_hold: 60,
    cancelled: 0,
  };
  if (order.commercialStatus === "ordered") {
    const meta = EXECUTION_STATUS[order.executionStatus];
    return { label: meta.label, cls: meta.cls, progress: executionProgress[order.executionStatus] };
  }
  const commercialProgress: Record<keyof typeof COMMERCIAL_STATUS, number> = {
    draft: 10,
    quoting: 15,
    pending_approval: 20,
    approved: 25,
    ordered: 35,
    cancelled: 0,
  };
  const meta = COMMERCIAL_STATUS[order.commercialStatus];
  return { label: meta.label, cls: meta.cls, progress: commercialProgress[order.commercialStatus] };
}
