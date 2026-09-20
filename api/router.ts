import { samplePlateRouter } from "./samplePlateRouter";
import { authRouter } from "./auth-router";
import { createRouter, publicQuery } from "./middleware";
import { projectRouter } from "./projectRouter";
import { experimentRouter } from "./experimentRouter";
import { sampleRouter } from "./sampleRouter";
import { sampleIdentityRouter } from "./sampleIdentityRouter";
import { storageRouter } from "./storageRouter";
import { sequenceRouter } from "./sequenceRouter";
import { dashboardRouter } from "./dashboardRouter";
import { equipmentRouter } from "./equipmentRouter";
import { aiRouter } from "./aiRouter";
import { workflowRouter } from "./workflowRouter";
import { commandRouter } from "./commandRouter";
import { adminRouter } from "./adminRouter";
import { externalOrderRouter } from "./externalOrderRouter";
import { sampleRequestRouter } from "./sampleRequestRouter";
import { driverRouter } from "./driverRouter";
import { cloningLayoutRouter } from "./cloningLayoutRouter";
import { labRunRouter } from "./labRunRouter";
import { runDraftRouter } from "./runDraftRouter";
import { runExecutionRouter } from "./runExecutionRouter";

export const appRouter = createRouter({
  workspace: publicQuery.query(() => ({
    kind: process.env.BIOMAP_WORKSPACE_KIND === "lab" ? "lab" as const : "preview" as const,
    name: process.env.BIOMAP_WORKSPACE_NAME || "",
    optionalNavigation: (process.env.BIOMAP_OPTIONAL_NAVIGATION ?? "projects,experiments,sample-requests").split(",").filter(value => ["projects", "experiments", "sample-requests", "external-orders", "sequences", "storage"].includes(value)),
  })),
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  project: projectRouter,
  experiment: experimentRouter,
  sample: sampleRouter,
  sampleIdentity: sampleIdentityRouter,
  storage: storageRouter,
  sequence: sequenceRouter,
  dashboard: dashboardRouter,
  equipment: equipmentRouter,
  ai: aiRouter,
  workflow: workflowRouter,
  command: commandRouter,
  admin: adminRouter,
  externalOrder: externalOrderRouter,
  sampleRequest: sampleRequestRouter,
  driver: driverRouter,
  cloningLayout: cloningLayoutRouter,
  samplePlate: samplePlateRouter,
  labRun: labRunRouter,
  runDraft: runDraftRouter,
  runExecution: runExecutionRouter,
});

export type AppRouter = typeof appRouter;
