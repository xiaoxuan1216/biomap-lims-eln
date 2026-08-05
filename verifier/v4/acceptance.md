# v4 验收：样本全生命周期管理（蛋白中心向上追溯）

需求原文：「增加样本管理中所有样本的全生命周期管理功能……按照某个蛋白（抗体&酶都可以）的全生命周期进行管理，核心是需要能够在蛋白表达纯化后，可以向上追溯构成它的质粒和基因片段，让我能够选择到某个蛋白后，可以看到蛋白的结构，序列，同时能够看到转染所用的质粒，载体，以及更靠前的基因序列。」

## 数据模型

| 变更 | 内容 |
| --- | --- |
| `samples.sequenceId` | 样本的分子定义（指向序列库），自动产生 `defined_by` 边 |
| `sequences.pdbId` | 蛋白序列关联 PDB 结构 ID |
| `lineage_edges` 新表 | 通用混合 DAG：childKind/childId ← parentKind/parentId（sample/sequence），relation + note |

种子数据（`db/lineage.json` + `db/_seed_lineage.mts`，可重复执行）：
- 7 条序列：pET-28a(+) 载体骨架 3813 bp、EGFP 基因（U55762）、EGFR-KD 基因（NM_005228.5:2263-3132）、anti-HER2 scFv 合成基因（密码子优化）、Trastuzumab scFv 蛋白 250 aa（PDB 1N8Z）、EGFR-KD 蛋白 290 aa（PDB 1M17）、EGFP 蛋白 239 aa（PDB 1EMA）
- 9 个样本：3 个纯化蛋白（319695-319697）、3 个表达菌液（319698-319700）、3 个表达质粒（319701-319703）
- 12 条边：`purified_from` / `expressed_from` / `backbone_from` / `insert_from` / `defined_by`
- 科学校验：所有蛋白序列由 CODON 翻译字典从对应 DNA 程序化生成并核对 feature 坐标（VH 1-120、(G4S)3 120-134、VL 135-242、His6 244-250；P-loop 52-59、HRD 168-175、DFG 188-190；发色团 TYG 65-67）；pUC19/pET-28a ori 经 NCBI efetch 交叉验证
- PDB 文件本地化：`public/pdb/{1n8z,1m17,1ema}.pdb`（来自 files.rcsb.org）

## 功能实现

1. **后端** `sample.lineage`（tRPC）：从任意样本/序列做 BFS（depth ≤ 8）展开上下游 DAG，节点带完整序列文本 + features + pdbId；样本节点自动附加 `defined_by` → 分子定义序列。
2. **前端** `/samples/:id/lineage`（`src/pages/SampleLineage.tsx`）：
   - 蛋白 Hero 区：3Dmol.js 三级结构（cartoon spectrum + 配体球棍）｜氨基酸序列查看器（10 个一组、60 个一行带标尺）｜feature 图例（VH/VL/linker/His6 等，i18n）；
   - 生命周期谱系链：按 BFS 深度分层，最上游（载体骨架 + 基因片段）在顶，纯化蛋白在底部高亮；阶段徽章（载体骨架/基因片段/重组表达质粒/质粒样本/表达体系/纯化蛋白产物）；层间连接器带中英关系标签（表达自/纯化自/载体骨架/插入片段…）；
   - 序列弹窗：DNA → 环形图谱 / 线性图谱 / 序列文本三 Tab（GC 客户端计算）；蛋白 → feature 图例 + 序列文本；
   - 样本卡片可跳转样本详情；
   - 非蛋白根（如质粒样本）不渲染蛋白 Hero，分子定义序列保留在谱系链中。
3. **入口**：样本详情页操作区新增「生命周期追溯」按钮（GitBranch 图标）。
4. **i18n**：新增约 35 个 en.ts 键（页面文案 + 蛋白 feature 名称）。

## 验收结果（QA 记录见 verifier/runs/v4-acceptance.log）

| 用例 | 结果 |
| --- | --- |
| 抗体（Trastuzumab scFv 319695）：3D 结构 1N8Z 渲染 + 250 aa 序列 + 5 级谱系链 | ✅ zh / en |
| 酶（EGFR-KD 319696）：3D 结构 1M17 + 290 aa 序列（P-loop/HRD/DFG 图例）+ 谱系链 | ✅ zh |
| 质粒样本根（319701）：无 Hero，谱系链含载体骨架/基因片段/重组质粒 | ✅ zh |
| 环形/线性图谱弹窗（pET-28a-antiHER2-scFv 19 features） | ✅ |
| 样本详情按钮点击跳转 | ✅ |
| 端点直测：7 节点 6 边，序列文本/features/pdbId 完整 | ✅ |
| 构建（tsc + vite + esbuild） | ✅ 无警告（3dmol eval 提示为第三方库固有） |

## 自审记录（替代 swarm reviewer，本会话无子代理工具）

- MAJOR-1：EN 模式下蛋白 feature 图例未翻译 → 补 11 个 en.ts 键并复验 ✅
- MAJOR-2：质粒样本根会误渲染「蛋白 Hero」（DNA 序列被标为氨基酸）→ Hero 限定 `type === "protein"` ✅
- MINOR-1：未使用图标 import（CircleDot）→ 移除 ✅
- MINOR-2：dist 一度丢 CSS（构建 fs 写入中断）→ 清 dist 全量重建并 curl 验证 css 200 ✅

版本：**71f9faf**（dynamic）
