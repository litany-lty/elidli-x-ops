# 推文优化与事实保留

## 材料拆分

先识别核心观点、目标读者、希望发生的行动，并把材料分成：

- 用户明确提供的事实／经历：登记 UserFactRecord。
- 已读来源支持的外部事实：登记 Claim 和来源版本。
- 作者观点与推断：明确其性质。
- 缺乏依据的数字、效果或身份：不写入确定式草稿。

没有账号档案时保留原文声音，说明临时受众假设后继续。
不得添加客户反馈、收益、规模、性能、个人实测或团队成果。

NEXT-2.1 写入使用 state 3。普通纯编辑明确设置 `personalization_mode=none`，无需全账号数据或新闻搜索。使用个人历史时选择 `evidence_bound`，通过 `resolvePersonalContextSelection` 冻结实际相关条目、用途与 hash；不能用全局历史 hash 代替相关依据，也不能把 proposed/active 计划当效果。

只使用当前有效正文与已审内容分析。缺父帖或图片时明确 not_seen；已读取的外部父帖用 SourceVersion 绑定，不能混成本账号帖子。只有本次选中的证据更正会使相关审核失效，无关历史新增不应迫使普通编辑重做。

## 编辑顺序

1. 确定读者能获得什么。
2. 让开头准确给出首个有用信息。
3. 核对关键主张、条件和限制。
4. 删除重复，选择普通帖或线程。
5. 保留原立场和语气，不自动营销化。
6. 只有必要时加入自然的后续行动。
7. 把链接、编号、mention 全部放进最终 `texts`。

默认给一条推荐稿；第二稿必须是案例过程、结论方法等实质不同角度，并说明适用读者。
用户只要建议时使用 suggestions_only，不生成 DraftRecord 冒充出稿。

## 两阶段检查与保存

1. 运行 `draft-check`，payload 的 `contract_version=3`，提供最终 DraftInput、明确的 personalization_mode/selection、supersedes_receipt_ref 和 as_of。首次可不提供实际复核回执；结果为 needs_review，并返回生成的 draft_id、文本 hash、加权长度和审核 subject_hash。
2. 宿主实际核对原文、全文、事实映射与个人依据。保留严格 DraftSemanticReview；实际结果 JSON 为 `{subject_hash, decision: "approve", review: DraftSemanticReview}`。
3. 用 `record` 的 `contract_version=3, operation=host_media_receipt` 登记 `operation=review_draft` 的成功实际回执和文件 SHA。CLI 读取并归档实际结果文件，不接受任意文件冒充该审核。
4. 使用首次生成的同一 draft_id，再运行 draft-check 并提供 actual_review_receipt_ref。审核须绑定该 draft_ref、原始材料、全文、有效事实映射和个人依据。正文、事实与长度均合格才 ready。
5. 用 `record` 的 `contract_version=3, operation=draft_review` 保存 `{draft, review_receipt}`。CLI 重新计算后保存不可变文字版本与追加的审核侧车。不能直接改 account-state.json。

正文不变、依据更新时沿用同一 draft revision，通过 supersedes_receipt_ref 追加审核，不为了刷新审核改字。当前事实映射以有效 DraftReviewReceiptV3 为准，旧 DraftRecord.fact_mapping 只是创建历史。

文字、URL、编号或 mention 改变时追加新 revision，parent_revision 必须紧邻最新文字头。恢复历史后继续改稿时，edit_base_ref 记录实际历史文字来源，不重写旧对象。每个新审核都重新核对相关证据。

面向用户交付最多 3 个主要问题、推荐稿、必要的可选稿、修改理由、待核实项和长度状态。ready 不等于用户采用、发布或效果已验证；采用须引用当前审核，精确的真实发布归因还需要实际回读正文。
