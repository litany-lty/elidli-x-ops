# V2 数据运营指导流程

本流程用于“结合账号数据和历史推文，告诉我接下来最该做什么”以及后续复盘。运输外壳继续使用 `schema_version: 1`；规范数据与统计仍使用 `contract_version: 2`；NEXT-2.1 的新教练/内容审核使用 contract 3，账号写入要求 `state.schema_version: 3`。旧 V2 对象作为历史保留。

## 1. 先确认真实能力与材料

按本次请求登记目标、范围和限制。依次选择用户提供的 Analytics 导出、宿主正常可见的 Analytics 页面、规范 JSON、截图、历史归档或已授权官方 API。公开搜索只能补公开正文与语境，不能替代个人 Analytics。

`doctor` 的 `account_collection` 必须区分声明与实测：只有实际调用成功且保存了当前回执的能力才能标记为 `verified`。登录墙、错号或字段未返回分别记录 `auth_required`、`account_mismatch` 或对应缺失状态，不能改写成零。

真实材料保存在账号私有目录或正式持久化通道。仓库只允许脱敏结构与合成数值；不提交真实导出、截图、cookie、token、API 原始回执或账号状态。

## 2. 导入材料

先运行 `data-import preview`，核对材料 hash、账号依据、表头、时间范围、源时区、指标定义、粒度和未知字段。预览不会写状态。

确认映射后运行 `data-import commit`。同一材料与同一解释上下文重复提交必须幂等；新的导出或新的真实观测可以追加。adapter 或 mapping 修正使用 `reinterprets_batch_id`，它不会凭空产生新的观测时刻，也不会让新旧解释重复计数。

帖子身份、正文版本、来源证据和指标观测分开保存：

- 同一帖子从归档获得正文、从 Analytics 获得指标时，合并到同一 `PostEntity`，保留两个来源。
- 正文变化只有在编辑链或更完整文本有依据时生成 `PostVersion`；无依据的差异保持冲突。
- 每个 `SnapshotV2` 保留实际期间、观测时刻、指标定义、分发范围、精度和原始显示。
- 同期间的总览、日序列和重复导出只用于核对或选择，不能相加。

## 3. 分开计算三类结果

`account-analyze` 的 V2 分支分别返回：

1. `AccountPeriodSummary`：期间内账号发生的曝光、互动、主页访问和关注等活动；
2. `PublicationCohortSummary`：期间内发布的帖子截至分析时点的累计表现；
3. `AgeMatchedSummary`：同类帖子在相同帖龄附近的表现。

三类结果不能互相补造。没有历史 24 小时快照时，帖龄结果是 unavailable；账号日序列不能由当天发布帖的累计曝光相加得到。

每个比较独立报告目标样本、有效、缺失、未成熟和冲突数量，以及口径兼容状态。相对变化只有在基期有效且定义允许时计算；基期为零时不生成无限增长。

## 4. 阅读历史内容

`coach-step prepare` 冻结现有统计、帖子版本、目标、历史动作和规则版本，并列出 `ContentWorkItems`。宿主只分析实际读取的正文与上下文：父帖、引用、线程、媒体或链接未读时写入覆盖缺口。

内容分析中的开头、承诺、读者、问题与证据都要引用实际文本位置或材料定位。正文或上下文 hash 改变后，旧分析保留为历史，但不能直接作为当前版本结论。材料很多时保存已读与未读清单；抽样阅读不能写成完整历史分析。

`coach-step ingest / content_analysis` 的 `data` 不是一份孤立分析，而是严格的二元对象：

```text
data {
  analysis: PostContentAnalysisV3
  semantic_receipt: ContentSemanticReceiptV3
}
```

`semantic_receipt` 必须精确绑定 `post_version_ref + content_hash + context_hash + analysis_version`，并记录 `review_id`、实际 reviewer、reviewed_at 和 decision。只有 `approved` 且所有绑定与当前 work item 相同的分析才会保存；分析的 `semantic_review_receipt_ref` 也必须等于该 receipt ID。正文或上下文变化后，旧 receipt 不能复用。

## 5. 形成运营建议

准备流程冻结 `EvidenceBundle`。宿主提交的诊断必须区分观察、描述性关联和假设；每项发现绑定实际证据，并写出其他解释和什么证据会改变判断。

默认最多三项动作、一个主要试验。每项动作要写明对象、具体改法、原因、成本、主指标、保护指标、观察窗口及停止或修订条件。“提高质量”“多互动”“多追热点”不能作为完成的动作。

使用算法依据时，建议链必须包含实际读取的源码或官方事实、适用条件、本账号观察、可控动作和验证办法。公开权重不能换算成推荐积分、爆款概率或保证曝光。

`coach-step ingest` 按以下顺序工作：

- `content_analysis`：保存绑定当前正文和上下文 hash 的分析，并生成新版证据包；
- `evidence_scope`：冻结预算内实际读取范围和未读项，允许有限建议；
- `coaching_proposal`：验证诊断、动作、试验、数字和引用；
- `semantic_review`：将一次真实的独立语义复核绑定当前 bundle hash 与 proposal hash。

任何实质修改都会改变 proposal hash，必须重新复核。`coach-step finalize` 只渲染已复核提案；它不能删除计算限制。

改稿和新闻消费者通过冻结的 `ConsumerContextV2` 读取个人依据。`items` 包含当前正文版本适用的内容分析、有来源且用户确认的声音样本、当前建议及其状态、活跃试验计划和已关闭的试验复盘；每项带类型、ID、实际内容投影与 content hash。`refs` 是这些条目的统一索引，供草稿和新闻卡绑定。`proposed/accepted/running/ready_for_review` 只表示建议或计划状态，`is_effect_result=false`，不能冒充实际效果；只有独立的已关闭 review item 才是结果记录。

动作 item 保留原目标 hash 和是否匹配当前目标。目标已经变化、或旧动作缺少原目标绑定时，item 必须带适用限制，不能直接沿用。内容事实可以在正文 hash 不变时复用；目标相关判断、动作和实验需要按当前目标重新选择。没有相应个人 item 时，改稿或选题角度只能标为编辑假设。

草稿可在首次检查后把 `personal_context_hash` 绑定到 revision；上下文变化时旧 hash 被拒绝。新闻运行在 init 冻结上下文，TopicCard 的 `personalization` 必须包含同一 context hash、实际 evidence refs 和解释；验证通过才记录 `account_evidence`，否则使用 `editorial_hypothesis`。

## 6. 采用、发布与复盘

建议生成、用户采用、真实发布和效果观测是四个不同事实。试验只有在明确采用后进入 `accepted`，有可靠发布记录后进入 `running`，达到预先条件且观测成熟后才进入 `ready_for_review`。

复盘始终沿精确链路读取：

```text
action → experiment → adoption → draft_id + revision → publication → post entity → observations
```

新闻稿改成普通修订时，后续 revision 继续保留原 `card_id`。复盘使用全局精确卡片解析；缺失或同 ID 冲突必须明确报告，禁止退回 run 的第一张卡。

正文来源和指标来源可以不同。复盘按帖子实体关联观测，再检查账号、定义、期间和分发范围；不要求 Analytics 与正文共享 source ID。

观测未成熟时结果保持 pending。到达停止条件但数据仍不足时，可以关闭为 `inconclusive` 并保留缺口；不能写成功。下一轮 prepare 读取已拒绝、已执行及无效果的历史动作，除非有新证据或条件变化，否则不原样重复推荐。

## 7. 状态、迁移和退出码

旧状态先运行 `state-migrate preview`。应用迁移前在账号私有目录保存原始字节备份与 hash；转换后一次原子提交。中途失败不改变旧状态；相同迁移重复 apply 返回原结果，不再次提高 revision。

普通业务写入遇到 state 1/2 返回 `MIGRATION_REQUIRED`；用 contract 3 state-migrate preview/apply 原子升级到 state 3。旧报告继续按 V1 合同保留，不在迁移时编造期间、系列或定义。

新增命令继续返回统一 `ResultEnvelope` 与规范 `run_result`：完整为 `ok/0`，有可用产物但仍缺阶段为 `partial/3`，核心阻塞且无可用产物为 `blocked/4`。宿主应按 `next_steps` 继续 prepare、ingest 或 finalize，不能把预期的 partial 当作进程故障。

## 8. 对用户的默认交付

先给当前主要问题或待验证假设，再给支持它的关键数字与代表帖。随后按 P1–P3 给具体动作，并给一个主要试验、观察指标、复查条件和停止条件。最后简短列出数据覆盖、未读材料、无法验证的能力和什么新证据会改变建议。

“专业运营指导流程已具备并跑通”只有在工程验收、语义质量验收及真实授权账号材料链路均通过后才能声明。真实材料尚未提供时，工程和合成验收可以完成，但真实账号门禁必须保持未验证。

## NEXT-2.1 继续执行

coach-step 使用 contract 3，实际分析和审核绑定 context_selection_hash 与 analysis_proposal_hash；历史 V2 审核不能批准修改后的 V3 主张。外部父帖从成功读取的 SourceVersion 解析，不伪造本账号实体。

旧进行中计划迁移为 ExperimentPlanViewV3；明确24h可继续，未知期间通过 record experiment_plan_view 补齐。review contract 3 compute 保存 ReviewComputationV3；record experiment_v3 的 check_maturity/close 复用同一计算，并复算相关观测。关闭解释不能自由填写统计结果，独立语义回执连同计算一起保留；旧closed或计划本身不构成可信效果。

文字审核与发布精确归因见[改稿流程](content-optimization.md)，图文制作见[图文流程](content-workflow.md)。
