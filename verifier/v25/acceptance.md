# V25 A–P cloning well QC (Mock)

2026-09-20. Added `/workflows/:id/cloning-qc?planId=:id&stage=F` within the existing configuration workspace. The saved A–P planner provides a `逐孔 QC（Mock）` link. Unsaved layouts request a saved version first; plan/workflow mismatches are rejected in the page.

The page contains occupied-well heatmaps, stage/plate/version selection, status filtering, sample search, per-well details and upstream source links. E/F/K have synthetic Qsep-style fragment size, concentration, main-peak percentage and electropherograms. M has mock microvolume spectrophotometry. N has forward/reverse consensus composition, coverage, Q20, synonymous and AA mutation examples with nucleotide/codon/amino-acid changes. Other steps explicitly show no simulated assay. D reagent racks and I dishes are not treated as plates.

All values and pass/review/fail thresholds are demonstration-only. Per-well sequence fractions use 100 synthetic alignments and sum to 100%; AA categories take precedence over synonymous-only categories. Batch rates use unique targets (not F/R aliquots), and targets with synonymous and AA variants can overlap. No real variant caller or quantitative Sanger assay is claimed. Results are deterministic by fictional sample identity and do not alter QC, ELN, inventory, release decisions, saved layouts or RunPlan data.

Validation:
- `npm run verify`: 32 test files / 288 tests, lint, TypeScript and production build passed. Known 3Dmol eval and chunk-size warnings remain.
- Production dependency audit: zero vulnerabilities.
- `qc-readback.mts`: all five existing saved QA layouts mapped correctly without modifications; Run 64/65/66/67 integrity passed.
- Chinese/English browser checks on workflow 1, layout 4 (96 targets): F has 96 occupied wells and 64/21/11 mock pass/review/fail. N has 192 wells across two plates but batch denominator 96. Selected PUR-002 and SEQ-002-F; confirmed Qsep trace and sequence 81% reference / 0% synonymous / 18% AA / 1% unresolved, codon GCT to GTT, p.Ala151Val. Source link opens PLS-002 in M.
- Workflow 2 with no saved layout shows an explicit empty state. No new QA experiment or assay result was created.
- New translation dictionary has no missing QC keys or duplicate keys.

Logs: `verifier/runs/v25-verify.log`, `v25-audit.log`; readback: `verifier/v25/qc-readback.json`.
- Restarted both local app containers after the final build. Both ping endpoints respond; QA migration startup reports current schema. Verified planner → QC link and status-filter reduction from 96 to 11 failed fragment wells. Restored Chinese for handoff.

## Display-label follow-up

At the user's request, removed visible Mock prefixes, banner, chart watermark and demo-generation explanatory copy from the QC page and its planner entry. Standard assay names, status names and calculation definitions are displayed in both languages. The deterministic mock generator, `mock: true` metadata and read-only behavior remain unchanged; no business result or release record was written.

Verified current well PUR-PLAN-001:C03 in Chinese and English: rendered DOM has no case-insensitive `mock` occurrence. Translation check has no missing/duplicate keys. Full verify and dependency audit passed again (`v25-labels-verify.log`, `v25-labels-audit.log`).

## Sequencing distribution follow-up

The original five equally weighted sequencing scenarios overrepresented exceptions (45/96 targets with AA variants in layout 4). Adjusted only the synthetic sequencing scenario distribution: per 100 targets, 90 reference/pass, 5 synonymous/review, 2 low-coverage/review, 3 AA/fail. A stable target permutation distributes exceptions across the plate; F/R remain one consensus. These are presentation proportions, not empirical laboratory success rates. Fragment QC and release logic are unchanged.

The existing 96-target plan now displays 87 pass, 7 review, 2 fail (90.6%, 7.3%, 2.1%); 192 directional wells display 174/14/4. Chinese and English browser checks confirmed these counts. Added a regression guard for predominantly passing distributions while retaining both review cases and failures at 96/200/1536 targets. Full verify passed with 289 tests; production audit has zero vulnerabilities (`v25-sequencing-rates-verify.log`, `v25-sequencing-rates-audit.log`).
