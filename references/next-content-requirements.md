# NEXT-2.1 图文需求映射

本文件保留模块交接时的证明边界；跨模块与真实宿主缺口的最终闭合见[整体验收](next-acceptance.md)。不得将单文件的待集成记录误当最终产品状态。
本表把实施方案 U01–U17 映射到可定位的代码约束、定向断言和仍需完成的宿主验收。状态含义：

- **确定性已覆盖**：本地控制器或合同已有直接断言。
- **部分覆盖**：确定性边界已覆盖，但仍依赖 CLI、持久化或真实宿主证据。
- **待宿主验收**：不能由合成状态或 schema 证明。

定向测试入口为 `test/next-content.test.mjs`。一个测试可以验证多个相互依赖的约束，因此通过的测试数量不能代替逐项结论。

| 编号 | 实际代码约束与断言 | 当前状态与明确缺口 |
| --- | --- | --- |
| U01 | `ContentBriefV3` 严格区分发布结构、编辑类型、图片用途和视觉风格；`prepareContent` 冻结 brief 与 recipe。测试 `U01/U04/U06...` 断言三张信息卡、工具对比和克制风格不会混为一个字段。 | **部分覆盖**。自然语言到 brief 的解析仍由宿主完成，需真实请求核对解析结果。 |
| U02 | `revise` 的本次覆盖只写 run/brief revision，不写 `state.config`。测试 `U02/U14...` 对操作前后长期配置做 hash 比较。 | **部分覆盖**。CLI 必须把“这次”解析为 run override；root 集成需验证。 |
| U03 | recipe 支持 `private` 版本快照和新会话恢复引用，但内容控制器不负责修改长期配置。 | **待 root CLI/配置实现与验收**：保存“以后教程默认”限定范围偏好，重开状态后恢复，并证明不影响其他编辑类型。 |
| U04 | `visual_request.count=0` 且 role=`none` 时只生成 `compose_text` work item。测试确认不会创建图片或数据渲染任务。 | **部分覆盖**。内容控制器不会调用新闻；宿主路由仍需证明“只润色”不启动账号采集或新闻搜索。 |
| U05 | compose 要求精确 draft、全部媒体槽、alt、资产引用；finalize 还要求真实资产 hash、预览及两级审核。测试构造三资产、三 alt、有序槽和预览后才可 ready。 | **待真实宿主验收**。合成 PNG 仅验证合同和 hash，不证明图片可读；Gate C 应使用真实 PNG/JPEG/WebP 文件、实际查看回执和状态重载。 |
| U06 | `inspectMediaBytes` 拒绝 prompt/文本/SVG 冒充图片；无能力时槽保持 blocked，run 为 partial/blocked 并产生精确 `next_actions`。 | **确定性已覆盖**。真实工具失败回执与 CLI 展示仍随 root 集成复核。 |
| U07 | `evaluatePackReadiness` 通过 `verify_artifact(ref, sha)` 复核持久化资产；缺失或 bytes 被替换返回 `asset_unrecoverable:<slot>`。测试让第二张不可恢复并断言 incomplete。 | **部分覆盖**。临时 URL 过期、受管目录回读和实际重做由 root 文件层/真实流程验证。 |
| U08 | 资产审核 subject 绑定 bytes、可见文字、claim、数据规格、alt 和证据版本；审核时核对实际观察文字。测试中图片显示“100”而映射声称“1,000”，批准被拒绝。 | **部分覆盖**。真实错数字识别依赖实际视觉审查，不由 controller 自行 OCR 猜测。 |
| U09 | chart 槽只能创建 `render_data`，缺少 required data 时 blocked，不能降级成 illustration；数据图资产保留 `data_spec_ref` 和 `origin_kind=data_rendered`。 | **部分覆盖**。真实数据渲染及数据规格回读需宿主工具完成。 |
| U10 | approved 资产审核要求 `bytes_viewed/readable/facts_verified/alt_matches` 全为 true；测试用“过密或裁切”的 false readable 回执证明不能批准。 | **待真实宿主验收**。乱码、裁切、密度和 alt 匹配必须由实际查看图片/预览的独立回执证明。 |
| U11 | `ContentRecipeV3` 全字段严格且 `additionalProperties=false`；测试验证有效 private recipe 可快照，`shell`/`eval` 等非法字段被拒绝。recipe 不能改变资产和事实审核代码。 | **确定性已覆盖**；仍需 root 验证私有 recipe 文件的持久化路径和新会话加载。 |
| U12 | `assertSlots` 按 post 计数且每帖最多四项；每槽绑定 `draft_text_index + textHash`。测试覆盖同帖五图拒绝、线程每帖三图合法、缺失帖拒绝、插入首帖后旧锚点拒绝。历史 restore 复用原 draft_ref 和原锚点。 | **确定性已覆盖**。面向用户的“拆成线程”建议文案由宿主生成。 |
| U13 | `scope=asset_slot` 只创建目标槽的 `edit_image`；新 pack 复用正文及其他资产。测试验证只新增第二张资产版本，第一张 bytes ref 与正文版本不变。 | **部分覆盖**。真实第二张图片编辑和独立查看由 Gate C 验证。 |
| U14 | `scope=text` 只创建 `compose_text`，不建图片编辑任务；测试确认资产 bytes 和长期配置不变。evidence-bound brief/pack 还要求相同 personal context hash。 | **部分覆盖**。root 的 draft-check/报告必须展示实际使用的声音依据，并验证新正文审核失效后重审。 |
| U15 | restore 创建新 pack revision，保留 `restored_from_ref`，精确复用历史 draft/media；测试随后执行“只改首句”，并断言修订基于恢复后的 pack。 | **确定性已覆盖**；真实状态重启后的恢复由 root 集成测试证明。 |
| U16 | work item、实际回执、预算 reserved/used 和 active pack 都持久化在 run；`resume` 对 failed 项改回 pending，保留原 reservation，不增加 used。测试覆盖恢复不重置预算及失败重试不重复占用。未冻结 pack 不能获得 pack review。 | **部分覆盖**。compose 前、预览持久化前后分别进程中断的磁盘级恢复仍需 root state/CLI 场景。 |
| U17 | `assetReviewSubjectHash` 绑定 alt、claim 映射、数据规格和证据版本；测试逐项修改并确认旧 subject 失效。改变图序产生新 pack hash；只新增审核回执不改变 pack hash。`evidence_ref_status` 返回 corrected/stale 时 readiness 变为 incomplete。 | **部分覆盖**。root 必须把来源/claim 当前性接入 `evidence_ref_status`；旧 adopted/published 记录的可追溯性属于 record/review 集成验收。 |

## Root 集成必须提供的上下文

- `evaluate_draft(draft_ref, state)`：返回 draft readiness、证据映射 hash、个人上下文 hash 和真实 text hashes。
- `verify_artifact(artifact_ref, expected_sha256)`：从受管路径回读并验证 bytes。
- `evidence_ref_status(ref, state)`：至少返回 `current` 或非 current 状态；来源更正后不能继续返回 `current`。
- `actual_tool_receipt`、`actual_review_receipt`：必须绑定 exact input/subject hash，不能由公开 payload 自填成功状态。
- `capabilities`：只把实际可用且已验证的图片生成、编辑、数据渲染和预览能力标为 `verified`。

## 单模块证据不能替代整体验收

上述“部分覆盖”和“待宿主”描述的是该模块单测边界。长期偏好CLI、真实三图/编辑/独立像素审核、磁盘丢失恢复、当前证据与发布归因已由[整体验收](next-acceptance.md)关联其他证据；不以合成PNG或通过数量代替实际查看。
