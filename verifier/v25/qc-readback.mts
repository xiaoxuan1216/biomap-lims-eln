import 'dotenv/config';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { writeFileSync } from 'node:fs';
import { mockStageQc, mockSequenceSummary } from '../../contracts/cloningMockQc.ts';
const url = new URL(process.env.DATABASE_URL!); url.pathname = '/biomap_v15_qa'; process.env.DATABASE_URL = url.toString();
const { getDb } = await import('../../api/queries/connection.ts');
const { appRouter } = await import('../../api/router.ts');
const { users } = await import('../../db/schema.ts');
const db = getDb();
const [user] = await db.select().from(users).where(eq(users.id, 54));
const api = appRouter.createCaller({ user, req: new Request('http://127.0.0.1:3115'), resHeaders: new Headers() });
const plans = await api.cloningLayout.list();
const output = [];
for (const meta of plans) {
  const before = await api.cloningLayout.byId({id:meta.id});
  const f = mockStageQc(before.plan, 'F'), n = mockStageQc(before.plan, 'N');
  assert.equal(f.length, before.plan.config.samples);
  assert.equal(n.length, before.plan.config.samples * 2);
  assert.equal(mockSequenceSummary(before.plan).targets,before.plan.config.samples);
  assert.deepEqual(await api.cloningLayout.byId({id:meta.id}),before);
  output.push({workflowId:meta.workflowId,planId:meta.id,version:meta.version,samples:meta.sampleCount,fragmentWells:f.length,sequenceWells:n.length});
}
for (const id of [64,65,66,67]) assert.ok((await api.labRun.byId({id})).integrityValid);
writeFileSync('verifier/v25/qc-readback.json', JSON.stringify({mockOnly:true,plans:output,priorRunIntegrity:'64,65,66,67 passed'},null,2));
console.log(JSON.stringify(output));
console.log('PASS: saved-plan mapping and old run integrity; read-only QC, no business mutations.');
process.exit(0);
