# V16 抗体研发真实业务流程验收

用户追加目标：在现有 BioMapOS 中跑通分子克隆、转染表达、纯化、表征。已有 qPCR QA 不能证明此目标完成。

## 必须闭合的链路

分子定义/克隆输入 → 测序确认的表达质粒 → 配对转染表达 → 表达上清 → 纯化抗体批次 → 表征原始数据与逐指标结果 → 独立复核及可追溯记录。

以现有模板和设备为起点。表达体系优先级已向用户询问，尚未得到答复。参考指南用于确定业务对象与记录项，不自动成为客户批准 SOP。旧模板中的表达量、KD、Tm 固定阈值不能直接视为客户标准。

## 实现与验收清单

- [x] V16-1 方法定义包括阶段、SOP 引用、输入类型、产物要求、结果指标及单位；实际阈值由方法负责人批准。
- [x] V16-2 克隆产物保留构建体、链别和来源；表达能将多个质粒关联到一个表达批次；不把各阶段输入始终当作同一种样本。
- [x] V16-3 操作者在任务中登记实际产物、数量、单位、储位和证据，生成新 Sample ID 及谱系。
- [x] V16-4 未复核产物不得作为可用库存流入下一阶段；批准后入库、流水、审计原子提交且可重试。
- [x] V16-5 同一样本可保存多个指标，逐指标更正有历史；结果与当前输入或产物正确对应。
- [x] V16-6 从已批准阶段的产物准备下一阶段，保留来源任务、抗体身份及样本关联。
- [x] V16-7 在方法库/任务页提供四类阶段方法的准备和执行入口，默认按阶段和当前操作呈现。
- [ ] V16-8 对克隆失败、表达未达标、纯化回收不足、表征缺失等情况给出阻断/处理路径。统一的缺项阻断、异常结果退回、更正历史、选样重做已实现；客户各阶段失败标准及处置 SOP 尚未验证。
- [x] V16-9 使用独立库完整走查四阶段业务闭环，验证库存、谱系、证据、方法版本和 ELN；测试数据清晰标记。
- [x] V16-10 在现有产品上展示可检查的链路及产物，留双语 UI 证据、测试日志、迁移和部署记录。
- [ ] V16-11 客户真实 SOP、实际样本/设备和原始结果接入后验证真实实验，不把构造数据或人工推进称为真实实验完成。

## 已确认的断点

`ab_recombinant` 模板包含主要阶段，但只是定义；现有人工结果限于输入样本，缺少运行产物登记和阶段放行。样本谱系已有查询与种子数据，不能据此宣称日常操作能建立谱系。

## 参考来源

- [Addgene 质粒序列验证](https://www.addgene.org/protocols/sequence-analysis/)：关注表达构建体的关键序列确认。
- [Thermo Fisher Expi293 用户指南](https://documents.thermofisher.com/TFS-Assets/LSG/manuals/MAN0007814_Expi293_ExpressionSystem_UG.pdf)：用于哺乳动物表达阶段记录结构的参考，具体体系待用户确认。
- [Cytiva 抗体纯化](https://www.cytivalifesciences.com.cn/zh/cn/solutions/protein-research/knowledge-center/protein-purification-methods/How-to-combine-chromatography-techniques/antibody-purification-protocols)：区分捕获、精纯及缓冲液置换，不能把所有抗体固定为同一纯化方案。
- [Sartorius Octet BLI](https://www.sartorius.com/en/products/biolayer-interferometry)：区分定量与结合动力学记录。
