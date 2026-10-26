# NEXT-2.2 运行合同

产品 2.2.0-rc.1；Node 24；transport envelope 1；状态容器 4。正文、图文与原有资料仍保留各自 V2/V3 合同和原 ID。

## 入口与状态

`state-migrate` 使用 contract 4：`preview` 返回冻结 preview；`apply` 提交同一 preview 和私有 `backup_directory`；提交后回读失败仅用 `resume_verify`。state1/2/3 可读，业务写入和迁移落盘均只写 state4。不得迁移原账号或替换全局 skill 来充当验收；先使用私有副本。

初始化自动校验并种入随包知识。`knowledge-step` contract4 包含 `seed/select/explain/propose-update/activate`。当前目录由有效激活事件派生。`select` 只能使用当前激活目录，不能借 `package_dir` 激活候选。更新必须先取得真实 HEAD 和候选材料，完成影响分析、独立审核及三类规则案例后激活。距上次实际检查超过24小时且联网可用时，宿主在本次调用检查上游；用户可覆盖该产品默认频率。检查失败保留原检查时间与限制，不声称后台更新。源码生产生效时间未知时保持 null。

## 本机 Chrome 采集

先读取宿主正式浏览器工具文档，连接用户已有 Chrome，分别核对目标主页、登录者和 Analytics 内容归属。使用 HostBindingV4 和 `doctor` 的 contract4 分派；声明可用与实际验证分开。不得创建新云配置冒充已登录本机 Chrome。

`collection-step` contract4 唯一流程：

1. `prepare` 冻结目标、请求期间、预算与绑定，不提前固定默认截止时间。
2. `ingest/material` 保存实际结果文件、SHA、身份有界定位和不可变 scope；普通 UI 导出才标为导出，下载必须有实际非空文件并核对执行端相同字节。
3. `data-import` contract2 执行明确映射的 preview/commit；保留 CLI 实际 ImportReceipt sidecar。
4. `ingest/seal` 按材料、批次和 `import_receipt_path` 显式连接；默认 cutoff 取实际捕获完成时间最大值，显式历史截止时间不前移。
5. 实际回读当前 state 文件，按已有 contract1 `record/persistence_receipt` 保存真实回读证明，`run_id:null`。
6. `finalize/resume` 只读检查当前 revision/hash 的保存证明；重复调用不更改 cutoff、预算和 state revision。

先请求28个完整来源日，来源范围受限时如实标 partial；来源时区未核实保持 unknown，不用主机时区替代。账号总览、逐帖累计、同帖龄分开。不同 view/filter/sort/账号/会话/日期建立新 scope。近期历史最多100条或28日；深读12条时按实际有材料的内容类型和表现分层，缺父帖、长文截断、未读图逐项保留。后续只增量读取新帖、72小时内相关帖、近7日账号数据及到期试验，不重导已成功材料。

## 指导、审核和交付

五类实际使用入口为 coach、news、运营改稿、复盘和图文交付。CLI 统一输出 content_readiness、guidance_required、guidance_readiness 和 task_readiness；内容审核通过不能替代完整运营指导审核。旧 payload 或 personalization_mode=none 不取消运营指导门。

先选择实际 RuleContext，再保存 `record` contract4 的 `rule_application` 和 `guidance_output`。正文必须包含下一步动作、为什么适合当前账号、怎样观察效果、还缺什么，并引用精确交付物。规则未知与编辑判断可以分别表达，不把缺失信号变成适用。

独立审核必须实际读取完整输出，以新操作 `guidance_review_result` 保存真实结构化文件的 SHA；结果中的 subject、decision、checks、issues 和 reviewer 身份必须与保存记录一致。再保存 `guidance_receipt`。批准必须检查项非空且全通过、问题为空。内容、事实、个人依据、目标、用途或相关规则变化后重新审核，保留旧记录；无关历史变化不使全部失效。

`delivery_intent:plain_edit` 表示用户明确只做文字编辑，`pixel_edit` 表示仅像素修改；它们不强迫采集 Chrome 或提供运营指导。实际运营任务使用 operational_optimize/coach/news/review，不能靠 none 模式降级。文字审核和图文 compose 可以先完成；正式采用运营建议前必须取得当前指导批准。记录已实际发生的发布事实仍可独立保存。

图文 `resume` 重新读取真实字节、当前审核和个人依据。只指出缺失或过期的具体 slot，不丢弃其他图片或预算。asset/pack 的实际审核否决可以保存，不能被另一个 approved payload 覆盖。个人依据变化但正文不变时，只追加审核，不制造假文本版本。

## 私有材料与公共发布

账号原始 CSV、可见页面、图片、真实审核、状态和回读证明留在账号私有目录。公开仓库仅包含脱敏 fixture、源码和范围声明。没有实际发帖、用户采用和成熟观测，不能宣称真实运营效果。
