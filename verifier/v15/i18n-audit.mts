import { readFileSync } from "node:fs";
import { en } from "../../src/i18n/en.ts";
const files = ["src/components/lab-run/StepRecordReferences.tsx", "src/components/lab-run/PairedSamplePicker.tsx", "src/components/lab-run/SampleIdentity.tsx", "src/components/method/MethodStepListEditor.tsx", "src/components/method/StepRecordRequirements.tsx", "src/components/lab-run/StepRecordForm.tsx", "src/hooks/useRunEvidenceUpload.ts","src/components/lab-run/RunDataFlow.tsx", "src/components/method/ScientificRequirements.tsx", "src/components/lab-run/RunOutputs.tsx", "src/pages/MethodDetail.tsx", "src/pages/MyWork.tsx", "src/pages/ExperimentDetail.tsx", "src/pages/LabRunLaunch.tsx", "src/pages/LabRunDetail.tsx", "src/pages/LabRuns.tsx", "src/pages/Workflows.tsx", "src/pages/WorkflowEditor.tsx", "src/components/layout/AppLayout.tsx", "src/features/bioview/BioViewRuntime.tsx", "src/features/bioview/GenericBioView.tsx", "src/components/lab-run/ManualExecutionWorkspace.tsx", "src/components/lab-run/MaterialPreparation.tsx", "src/components/copilot/Copilot.tsx"];
const missing = new Set<string>();
for (const file of files) {
const source = readFileSync(file, "utf8");
for (const match of source.matchAll(/"([^"\n]*[\u3400-\u9fff][^"\n]*)"/g)) {
  if (/\.startsWith\($/.test(source.slice(Math.max(0, match.index! - 20), match.index))) continue;
  if (!en[match[1]] && !match[1].includes("className=") && !match[1].includes("<")) missing.add(match[1]);
}
}
console.log(JSON.stringify([...missing], null, 2));
if (missing.size) process.exitCode = 1;
