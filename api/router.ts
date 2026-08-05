import { authRouter } from "./auth-router";
import { createRouter, publicQuery } from "./middleware";
import { projectRouter } from "./projectRouter";
import { experimentRouter } from "./experimentRouter";
import { sampleRouter } from "./sampleRouter";
import { storageRouter } from "./storageRouter";
import { sequenceRouter } from "./sequenceRouter";
import { dashboardRouter } from "./dashboardRouter";
import { equipmentRouter } from "./equipmentRouter";
import { aiRouter } from "./aiRouter";
import { workflowRouter } from "./workflowRouter";
import { commandRouter } from "./commandRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  project: projectRouter,
  experiment: experimentRouter,
  sample: sampleRouter,
  storage: storageRouter,
  sequence: sequenceRouter,
  dashboard: dashboardRouter,
  equipment: equipmentRouter,
  ai: aiRouter,
  workflow: workflowRouter,
  command: commandRouter,
});

export type AppRouter = typeof appRouter;
