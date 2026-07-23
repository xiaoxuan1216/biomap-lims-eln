// Copilot 上下文桥：页面在挂载时注册当前实体，Copilot 发送消息时读取
import type { ElnBlock } from "./labels";

export interface CopilotContext {
  entityType?: string;
  entityId?: number;
  entityName?: string;
}

let current: CopilotContext = {};
let insertHandler: ((blocks: ElnBlock[]) => void) | null = null;

export function setCopilotContext(ctx: CopilotContext) {
  current = ctx;
}

export function getCopilotContext(): CopilotContext {
  return current;
}

export function registerInsertHandler(fn: ((blocks: ElnBlock[]) => void) | null) {
  insertHandler = fn;
}

export function insertBlocksToExperiment(blocks: ElnBlock[]): boolean {
  if (!insertHandler) return false;
  insertHandler(blocks);
  return true;
}
