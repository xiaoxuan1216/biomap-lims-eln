import { authRouter } from "./auth-router";
import { createRouter, publicQuery } from "./middleware";
import { projectRouter } from "./projectRouter";
import { experimentRouter } from "./experimentRouter";
import { sampleRouter } from "./sampleRouter";
import { storageRouter } from "./storageRouter";
import { sequenceRouter } from "./sequenceRouter";
import { dashboardRouter } from "./dashboardRouter";
import { pipelineRouter } from "./pipelineRouter";
import { equipmentRouter } from "./equipmentRouter";
import { aiRouter } from "./aiRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  project: projectRouter,
  experiment: experimentRouter,
  sample: sampleRouter,
  storage: storageRouter,
  sequence: sequenceRouter,
  dashboard: dashboardRouter,
  pipeline: pipelineRouter,
  equipment: equipmentRouter,
  ai: aiRouter,
});

export type AppRouter = typeof appRouter;
