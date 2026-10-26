# 图文制作、局部修改与恢复

本流程用于“做三张信息卡”“图片保留，文字更像我”“只改第二张”“恢复上一版”等请求。宿主负责理解自然语言、调用真实图像能力和展示实际图片；CLI 负责冻结需求、校验文件、保存版本、计算 readiness 和恢复状态。

## 从用户指令到 brief

ContentBrief 分开保存四个维度：

- `publishing_format`：short_post、thread 或 reply。
- `editorial_type`：opinion、tutorial、comparison、news_explainer、case_review、checklist 或 custom。
- `visual_request.role`：information_card、chart、process、annotated_screenshot、illustration、custom 或 none。
- `visual_request.style`：本次语气、配色、密度、字体和参考风格。

必须保留的立场、事实、措辞和结论逐项写入 `must_preserve`，明确允许编辑范围。需要三张图就保存三个稳定 slot；不能在后续阶段静默变成一张或纯文字。常规纯编辑使用 `personalization_mode=none`；确实使用账号历史时使用 `evidence_bound`，只绑定本次实际相关的证据子集。

“这次不用品牌色”只进入当前 brief。“以后教程默认这个版式”才更新限定于教程的确认偏好。宿主可以先使用可解释的默认值，但不能推断用户经历、数字或立场。

## recipe

内置 recipe 位于 `assets/content-recipes/`：opinion、tutorial、comparison、news_explainer、case_review、checklist。它们定义编辑结构、材料要求、允许的视觉用途和检查项，不限制用户只能选择这些组合。

私有 recipe 使用同一 `ContentRecipeV3` JSON schema，保存在账号私有目录。禁止 shell、eval、模块、任意工具调用、自动发布和关闭事实审核。已有 pack 冻结 recipe 版本和内容 hash；模板更新不会静默改变历史稿件。

## content-step

仍使用统一 CLI：

```bash
node scripts/x-ops.mjs content-step \
  --input request.json \
  --output result.json \
  --state-dir account-state-directory
```

操作顺序：

1. `prepare`：保存 brief、recipe snapshot、ContentRun 和有 ID 的 work items。此时尚无 pack，不代表图片已经生成。
2. 宿主执行实际文字、图像、数据渲染或预览任务。每次调用必须保留与 work item `input_hash` 对应的成功回执。
3. `ingest`：图片或预览只接受实际文件路径。CLI 读取 bytes、自算 SHA-256、识别 PNG/JPEG/WebP 和尺寸，并在持久保存、回读后登记引用。
4. `compose`：绑定精确 DraftRevision、有效文字审核、有序 media slots、每图 alt、事实映射和精确资产，保存不可变 pack revision。缺 slot 时允许保存 incomplete 快照。
5. 宿主实际查看每张图与手机尺度预览。`review` 必须绑定实际查看回执；图片 bytes、alt、事实映射、数据规格或证据版本变化都会使旧资产审核失效。
6. `finalize`：代码计算 `ready | needs_review | incomplete`，并返回本次 `complete | partial | blocked` 与具体 `next_actions`。

`resume` 从保存的 work items、预算和文件继续，不重复已成功任务。图像能力不可用或生成失败时，文字与已完成图片继续保留；结果指出具体 slot 和恢复动作。

## 媒体和预览

每个 AssetRecord 指向可恢复文件，并保存实际 bytes hash、格式、尺寸、来源类型、工具回执与持久化回执。提示词、任务 ID、空文件、未保存临时 URL 都不构成资产。

每条帖最多四个媒体 slot；线程逐条计算。alt 一图一份，按 Unicode code point 计数不得超过 1,000，并记录 UTF-16 长度用于边界诊断。图片中的数字、功能、日期和因果结论必须映射到实际 claim 或用户事实；数据图必须绑定确定性数据规格，缺数据时不得用生成插画冒充精确图。

PreviewArtifact 绑定精确 pack content hash、实际预览 bytes、制作回执和持久化回执。预览展示最终文字、图序、图片、alt 和来源摘要。它是交付检查，不证明已经在 X 发布，也不保证所有客户端裁切完全一致。

## 局部修改

- “只改开头”：创建文字任务，保留后续文字、图片和用户立场。
- “第二张换成流程图”：定位当前预览顺序的第二个 slot，只新增该资产、审核和 pack revision。
- “图片保留，文字更像我”：只修改文字及相关审核；原图片 bytes 和图序保持。
- “这次不要品牌色”：建立当前 brief revision，只重做受影响图片，不改长期偏好。
- “恢复上一版”：引用真实历史 pack，追加带 `restored_from_ref` 的 revision；不凭记忆重写或重画。

修改完成后重新 compose。未变化组件按 hash 复用；整包审核仍绑定新的 pack ref。正文恢复后继续改首句时，DraftRevision 保持单调 revision，并单独记录实际 edit base。

## readiness 与运营状态

`ready` 要求：brief 交付项完整、文字审核有效、每个 slot 有可恢复资产、图片事实/可读性/alt 通过、实际预览可恢复、整包审核绑定当前 manifest，且 evidence-bound 个性化有相关子集。缺文件为 incomplete；材料齐全但审核不足为 needs_review。

ready 只说明当前稿件符合本次交付要求。用户采用、真实发布、平台呈现和运营效果继续使用独立记录，不能由 ready 自动推断。

## 常见 next_actions

- 缺比较数字：`provide_material`，列出同地区、同计费周期的来源。
- 缺图片能力：`collect`，保留文字与 slot 规格，等待实际能力。
- 图片审核失败：`revise`，只重做受影响 slot。
- 文件丢失或 hash 变化：`retry` 或 `resume`，不清空整个稿件。
- 状态版本较旧：`migrate`，先预览并备份，再写 state 3。

所有 next action 只引用登记过的操作；自然语言不能变成任意 shell。自动发布、付费服务和新权限不在本流程内。

## 宿主文件桥接

宿主将实际工具返回保存到私有文件，以 record contract 3 的 host_media_receipt 登记操作、成功状态、工作输入 hash、真实调用引用和返回文件 SHA。CLI 会归档返回内容；image/preview ingest 重新读取实际 bytes 并保存受管副本。review_asset/review_pack 的实际结果 JSON 必须包含精确 subject_hash 和 decision。文字准备与实际复核采用[两阶段改稿检查](content-optimization.md)。

数据图的 data_spec_ref 指向实际 JSON，至少有 data、method、unit、axes、source_refs；来源必须存在。CLI 归档数据规格，chart slot 精确绑定该规格与实际 render_data 回执；来源更正或规格 bytes 损坏时不能 ready。生成插画不能作为精确数据图。

可用 `node scripts/render-preview.mjs STATE_DIR PACK_REF OUTPUT.html` 从已保存 pack 和真实资产生成无脚本、自含图片的窄版 HTML。若宿主策略不允许打开本地 HTML，直接展示精确文字、有序真实图片及 alt 的原生预览；不得绕过浏览器安全策略。预览采用 [shadcn Card](https://ui.shadcn.com/docs/components/base/card) 的正文、图片、说明分层及窄列布局。

媒体边界依据 [X 发帖说明](https://help.x.com/en/using-x/how-to-post) 与 [图片描述说明](https://help.x.com/en/using-x/write-image-descriptions)：每条最多四项媒体，alt 上限1000字符。代码按 code point 校验；复杂emoji临界长度未做真实X客户端验证时须说明限制。
