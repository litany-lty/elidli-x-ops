# NEXT-2.1 运行时验收映射

本文件保留模块交接时的证明边界；跨模块与真实宿主缺口的最终闭合见[整体验收](next-acceptance.md)。不得将单文件的待集成记录误当最终产品状态。
本页只记录 `test/next-runtime-flows.test.mjs` 新增的跨进程/CLI 证据及尚未覆盖的故障边界。测试使用临时状态目录和合成材料，不读写真实账号状态。

| 要求 | 本次实际运行路径与断言 | 状态/缺口 |
| --- | --- | --- |
| E27 | `draft-check@3` 首次返回 subject 但 `needs_review`；保存实际 `review_draft` JSON 与 host receipt 后再次检查、`record draft_review`。来源更正后，同一正文、同一 revision 改用新 claim 和新个人依据，追加 superseding review；重新加载后新审核可采用，原 draft hash 与旧 receipt hash 不变。 | 已覆盖核心路径。 |
| E28 | 个性化模式不提供 context selection，即使有真实语义审核也保持 `needs_review` 并返回 `personal_context_selection`；同样正文以纯编辑模式完成实际审核后可 `ready`。 | 已覆盖。 |
| E29 | 将旧 claim 更正为 invalidated 后，旧 review readiness 失效；新 claim 与新 voice evidence selection 经过新实际审核后可 ready。无关 ref 没有被用来解除失效。 | 部分覆盖：不同目标的 action/experiment 子集仍由既有 consumer-context 定向测试承担，本文件未重复。 |
| E30 | CLI 对 state 2 生成冻结 preview、apply 到 state 3、重复 apply 幂等；状态变化后的旧 preview 被拒绝且文件 bytes 不变。 | 部分覆盖：state 1→2 已有 `v2-runtime.test.mjs`；旧 running 24h/未知期间计划的迁移解释由既有 review/migration 用例承担。 |
| E31 | 迁移前 config、sources、user facts、claims、drafts、adoptions、publications 分别做对象 hash；迁移后逐项相同。旧 `validity=ready` 草稿没有 state 3 review，迁移后 readiness 为 `needs_review`。 | 已覆盖。 |
| E32 | 用 `git archive` 从固定提交 `e89decb7f67d14b322fd8f5745a807ad114d7ef1` 导出旧运行时到临时目录；旧 `loadState` 读取 state 3 明确抛 `SCHEMA_VERSION`，状态文件 bytes 不变。未创建分支。 | 已覆盖读取/拒写前置门。 |
| E33 | 本文件证明两个 writer 使用同一旧 revision 时，首个写入成功、第二个收到 `STATE_CONFLICT` 且已提交 bytes 不变。`next-state` 的可控 transaction 断言另行覆盖 stage 后 rename 前中断保持旧 bytes，以及 post-commit verify 失败后 resume 不重复迁移、不回滚后来 revision。 | 已由两组互补运行时证据覆盖。 |
| E34 | 采用写入后重新加载，publications 仍为空；只确认已发但未读取正文时保存 `published/unverified`，draft/pack ref 均为空，不伪造精确归因。 | 已覆盖。 |
| E35 | 隔离 fixture 账号以与 adopted draft 完全相同的 `actual_texts` 保存 `published/exact`，新进程回读保留精确 draft/pack 归因；该 basis 明示不代表真实 X 发布。已采用稿实际增加一句时只能保存 `published/modified` 且保留差异；冒充 exact 被拒绝。未核对正文保存 `published/unverified` 且 draft ref 为空。live exact 缺 `publication_read` 回执也被拒绝。 | fixture 正负路径已覆盖；真实 live exact 的成功路径仍需真实发布回读验收。 |
| U03 | CLI persistent patch 保存教程视觉偏好；新进程重新加载仍存在。run scope resolve 返回临时配色，但持久 config hash 不变。 | 已覆盖。 |
| U07 | 真实 CLI ingest 把实际 PNG bytes 保存到受管路径；删除受管资产后，新进程 finalize 返回 `incomplete` 和精确 `asset_unrecoverable:slot-1`。 | 已覆盖丢失检测；临时 URL 过期仍需对应适配器证据。 |
| U15 | 保存 pack rev1，再生成 alt 不同的新 revision；新进程 CLI restore 精确恢复 rev1 的 draft/media slots，并保留 `restored_from_ref`。 | 已覆盖恢复本身；恢复后真实文字重审由 E27 链路和内容定向用例共同约束。 |
| U16 | blocked 图片任务在真实 host receipt 出现后由新进程 CLI resume；预算从 reserved 0/used 0 变为 reserved 1/used 0，ingest 后 used 1，不重复生成。 | 部分覆盖。失败任务重新 resume 不重复 reservation 已由 `next-content.test.mjs` 断言；compose/preview 各断点的进程级故障注入未重复。 |
| U17 | 同一 asset 改 alt 生成不同 pack content hash；历史 revision 保留并可 restore。claim 更正使旧草稿审核失效，修改发布不能归因 exact。 | 部分覆盖。claim/data-spec/图序的精确 subject 失效已有 `next-content.test.mjs`；本文件补跨进程持久化与发布归因。 |

## 实际文件与进程边界

- 每次 CLI 调用均启动新的 Node 进程，并从临时 `account-state.json` 重新加载。
- draft 审核不是自报：实际 JSON 必含 exact subject、`decision=approve` 和完整 `DraftSemanticReview`；host receipt 保存后才能 ready。
- 旧运行时从固定 commit 导出到临时目录，并复用当前已安装依赖；没有 checkout、分支或工作树切换。
- 内容资产使用临时文件和受管持久路径；本用例验证 bytes/hash/丢失恢复信号，不替代真实图片视觉 Gate。

## 未伪造为已通过的边界

1. live exact publication 的成功链需要真实 X 发布读取回执；本用例证明 fixture exact 成功和 live 无回执拒绝，不把 fixture 证据包装成真实发布。
2. 真实图片可读性、数字正确性和局部第二图编辑属于独立视觉验收，不由本运行时文件替代。
