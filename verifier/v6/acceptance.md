# v6 验收记录（版本 7d3f0a9）

## 需求清单与结论

| # | 需求 | 实现 | 验收结果 |
|---|------|------|----------|
| 1 | BioFlow 节点关联 ELN（上下级关系） | 四级执行链：项目 → 业务流 → 节点 → ELN 条目。experiments 表新增 workflowId + nodeKey（nodeKey 稳定，saveGraph 重建节点不失联）；experimentRouter 新增 forNode / createForNode；NodeInspector 内嵌「关联 ELN 记录」；ELN 详情页头部回链「业务流 / 节点」 | ✅ UI 实机创建 EXP-0014（节点「HEK293F 小试瞬转表达」，workflow 134264），面包屑回链验证通过 |
| 2 | 两侧工具栏可唤出/隐藏 | 左节点库、右属性面板均可折叠为 8px 竖条（localStorage 持久化 biomap-flow-left/right），画布空间最大化；选中节点自动唤出右栏 | ✅ Playwright 点击验证：隐藏→竖条→唤出，双语按钮 title 正确 |
| 3 | 用户名改 Xiaoxuan | users 表 id=2000001 name → Xiaoxuan | ✅ DB 确认 |
| 4 | 指令台独立为 Lab Agent 菜单 | 新页面 /lab-agent（全高度 CommandDeck fullHeight 模式）；导航「工作台」组新增 Lab Agent；仪表盘原指令台替换为渐变入口卡 | ✅ /lab-agent 200；仪表盘入口卡存在、旧内嵌输入框已移除 |
| 5 | 序列库增强（SnapGene 级工具） | 新增「工具」tab：密码子优化（E. coli/人源密码子表、CAI/GC 前后对比、翻译一致性校验、复制/保存为新序列）、酶切位点扫描（23 种常用酶、单切酶高亮）、Gibson 组装（片段排序、重叠长度可调、同源臂+退火区引物自动设计、点击复制） | ✅ pET-28a-antiHER2-scFv：CAI 0.642→1.000、GC 52.9%→59.9%、蛋白一致 ✓；酶切 11 种有切点/7 种单切；Gibson 双片段 5,553 bp 引物表正确 |
| 6 | 耗材追踪（探讨→采纳） | samples.type 枚举扩展 buffer/enzyme/competent_cell（DB ALTER 已执行）；新建「工具酶盒」「感受态细胞盒」储位；播种 9 种典型耗材（LB、PBS、Tris、T4 连接酶、Q5、EcoRI、Gibson 预混液、DH5α、BL21）；库存流水/低库存预警/ELN 消耗全链路与样本共用，天然同步 | ✅ 样本页筛选可见 3 新类型；仪表盘库存预警命中 Q5（1<2）与 BL21（8<10）；入库流水已记录 |

## 技术要点
- ELN 关联键为 (workflowId, nodeKey) 而非节点数据库 id——saveGraph 删除重建节点时 nodeKey 保持稳定
- 无项目业务流创建 ELN 时回退至系统项目「BioFlow 执行记录」
- 流程图未保存（dirty）时禁止创建 ELN 并 toast 提示
- i18n：新增 60+ 英文键，清除 3 个重复键警告，构建零告警

## 数据资产
- EXP-0014（id 509273）：v6 节点 ELN 联动证据
- 耗材样本 id 349695–349703；储位 工具酶盒 504058 / 感受态细胞盒 504059
