# 数据合同速查

规范 schema 位于 `schemas/contracts.schema.json`；本文件解释使用约束，不替代 schema。

## 通用规则

- `schema_version` 固定为 1，未知版本拒绝。
- X 用户／帖子 ID 保存十进制字符串，不转 Number。
- 精确时刻带偏移并规范为 UTC；未知为 null 并记录原因。
- 计数是 0 至 `Number.MAX_SAFE_INTEGER` 的整数；未知不是零。
- 对象禁止未知字段；原始宿主对象只能放 RawReceipt。
- 文本 hash 是最终原始 UTF-8 文本的 SHA-256；数组顺序保持。
- 引用必须指向本次对象或已加载状态中的真实 ID。
- Agent 做语义判断，代码做类型、时间、统计、预算、引用、长度和完成状态。

## 核心对象

ConfigV1 含 account、timezone、output_language、content、news 和 history 的完整字段。
ConfigPatch 只支持 set、append、remove、clear；inherit 仅用于 `/news/core_topics`。
EffectiveConfig 保存完整 config、本次 patch、UTC 窗口、as_of、config_hash 和 assumptions。

AccountInput 包含 account、cutoff、requested_scope、coverage、posts、snapshots、source_refs 和 data_mode。
PostRecord、Snapshot 和 MetricValue 保留来源、范围、精度、可用性及原始值。
AccountResult 必须能把所有统计回指输入记录。

新闻链是 RawReceipt → SourceRecord/SourceVersion → NewsEvent → Claim → TopicCard → DraftRecord。
外部主张使用 source_version_ids，用户事实使用 user_fact_ids。
`unverified`、`needs_recheck`、`invalidated` 主张不能进入确定式 ready 稿。

DraftInput 不接受调用者填写 length_checks、text_hashes、validity 或 status_history。
`draft-check` 为当前最终 texts 计算这些字段；semantic review 必须绑定同一 hashes 和事实引用。
草稿历史保存 `drafts[id].revisions[revision]`，采用和发布固定引用具体 revision。

## 状态与结果

每账号一个 `account-state.json`：revision、config、runs、sources、raw_receipts、user_facts、events、claims、drafts、adoptions、publications、posts、snapshots、reviews、rule_versions。
写操作先锁定、读 revision、核对 expected_revision，再临时写入并原子替换。
初始化不能覆盖既有状态；冲突返回 STATE_CONFLICT。

ResultEnvelope.status 是 ok、partial、blocked 或 error；CLI 退出码：0 成功、2 输入、3 部分、4 能力阻塞、5 I/O／内部错误。
RunResult 的 execution_status 是 complete、partial、blocked；result_kind 是 findings、no_findings、undetermined。
完成状态由必需 StageResult 汇总，调用者不能直接指定 complete。

最低错误集合：INVALID_INPUT、SCHEMA_VERSION、CONFIG_CONFLICT、MAPPING_REQUIRED、IDENTITY_MISMATCH、NUMERIC_RANGE、BUDGET_EXHAUSTED、CAPABILITY_UNAVAILABLE、UNSUPPORTED_RESPONSE、RECEIPT_CONFLICT、MISSING_EVIDENCE、STALE_DRAFT、STATE_CONFLICT、PERSIST_FAILED。
