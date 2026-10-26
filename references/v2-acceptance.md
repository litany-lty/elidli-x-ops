# X Ops V2 需求、实现与验收对应表

本表对应 NEXT-2.0 方案的 T00–T12、F01–F16 和 V2-01–48。实现版本以包含本文件的提交为准。表中的“断言覆盖”表示仓库中存在针对该行为的实际断言；最终测试命令、退出码和真实账号验收结果由发布记录另行保存，不能仅凭本表宣称 Gate A 或 Gate C 已通过。

公开仓库只包含合成材料和脱敏结构。真实账号导出、页面回执、账号指标、私有路径和语义评估原始记录不进入 Git。

## 当前门禁状态

| 门禁 | 当前状态 | 公开可核依据 | 仍未验证或受限部分 |
| --- | --- | --- | --- |
| Gate A 工程与数据正确 | 完整套件96项通过；后续口径更正、跨scope重解析和有效分析版本修复的相关检查均通过 | `test/v2-*.test.mjs`、本表 V2-01–48；实际命令与退出码保存在验收记录 | 不将重复运行相加为测试数量；历史回归结果与后续定向结果分别记录 |
| Gate B 专业输出质量 | 12 类合成情景经独立评估和修订后达到要求 | `coaching.mjs` 的语义回执门禁；`references/v2-data-coaching.md` | 初版曾出现事实越界并作为失败证据保留；评估原文为私有验收材料，不入仓库 |
| Gate C 真实账号流程 | 已验证真实材料的受限流程；完整运营效果仍待观察 | 授权浏览器导出、真实导入、样本内容分析、独立建议复核、保存回读与新上下文恢复均通过；后续观测与待定复盘另留真实记录 | 两个内容视图导出字节相同；类型、指标窗口、源时区和历史同帖龄数据尚未核全。用户尚未采用或发布本轮试验，不能宣称运营效果已验证 |

## T00–T12 实施任务

| 任务 | 实现入口 | 实际证据定位 | 当前未验证或限制 |
| --- | --- | --- | --- |
| T00 基线与真实材料盘点 | `README.md`、`package.json`、`assets/host-binding.codex-desktop.json` | 基线提交由实施方案固定；Node 版本和四个依赖由 `doctor` 检查 | 最终提交 SHA 和发布状态由发布步骤填写；私有材料不在仓库 |
| T01 冻结 V2 合同 | `schemas/data-v2.schema.json`、`coaching-v2.schema.json`、`review-v2.schema.json`、`consumer-v2.schema.json`、`runtime-v2.schema.json`、`contracts.mjs`、`metrics.mjs` | `test/v2-data*.test.mjs`、`test/v2-coach-core.test.mjs`、`test/v2-runtime.test.mjs` | 合同只证明结构与确定性边界，不证明真实宿主已取得字段 |
| T02 迁移与身份模型 | `imports.mjs`、`migrations.mjs`、`state.mjs` | V2-01–04、V2-38、V2-43、V2-45 断言 | 真实账号迁移只在明确应用时执行；备份和回执不进入 Git |
| T03 真实导入路径 | `importers/analytics-csv.mjs`、`host-observations.mjs`、`archive-posts.mjs`、`v2-dispatch.mjs` | 已验证总览与内容导出 profile 的脱敏结构测试；V2-13/14、V2-21–24、V2-40/44 | 当前内容导出不提供可靠帖子类型；UI/截图只保存实际可见范围 |
| T04 账号统计与口径 | `analyzeAccountV2`、`metrics.mjs` | V2-06–20、V2-24–25、V2-46 | 真实账号的结论仍取决于 Gate C 的期间、定义和覆盖 |
| T05 修复复盘关联 | `review.mjs` 的 `resolveCardExact`、`buildReviewV2`、`reviewV2RunResult`；`draft.mjs` revision 继承 | `test/v2-review.test.mjs` 的 V2-05、V2-31、V2-32 | 实际发布和成熟观测不能由 fixture 替代 |
| T06 历史内容分析 | `post-content.mjs`、typed content semantic receipt、`references/v2-data-coaching.md` | V2-26–28、V2-42、V2-47 断言 | 未读取的父帖、媒体和线程仍必须保持未见；真实历史覆盖由 Gate C 报告 |
| T07 教练判断闭环 | `coaching.mjs` 的 prepare/validate/finalize、`v2-dispatch.mjs` | `test/v2-coaching-flow.test.mjs`、`test/v2-coach-flow.test.mjs` | 具体建议是否对真实账号有效只能由后续实际执行验证 |
| T08 算法证据统一 | `validateRuleVersionV2`、`assessRuleHistoricalApplicability`、`record rule_version` | V2-36、V2-48 断言 | 公开源码不能证明未知线上生产状态；不提供推荐积分或保证 |
| T09 实验与回访 | `experiments.mjs`、`review.mjs`、state experiments/reviews | V2-33–35、V2-39 断言 | 不强迫用户采用或发布；真实观测未成熟时保持 pending/inconclusive |
| T10 改稿与新闻消费 | `consumer-context.mjs`、`draft.mjs`、`news.mjs`、`review.mjs` | `test/v2-consumer.test.mjs` 断言 proposed/active plan 非效果、状态变化使 hash 失效；V2-31/32；既有 news/draft 回归 | 个人证据缺失时只能输出 editorial hypothesis；旧目标动作有适用限制；V1 核心回归以最终 Gate A 命令为准 |
| T11 宿主真实链路 | `collection.mjs`、HostBinding `account_collection`、`doctor`、`references/host-integration.md` | 私有真实回执；公开仓提供严格 receipt 合同和 fixture 结构 | 按每项能力的实际成功材料验证，不把一次导出升级为完整历史或所有能力 verified |
| T12 完成与发布门禁 | `test/v2-*.test.mjs`、本文、三层门禁 | Gate B 已独立复评；Gate A/Gate C 分开记录 | Gate C 未完成前不能宣称“真实专业运营闭环已跑通” |

## F01–F16 问题闭环

| ID | 实现入口 | 实际证据定位 | 当前未验证或限制 |
| --- | --- | --- | --- |
| F01 批次与观测身份 | `inspectImport`、`normalizeImport`、`mergeImport` | V2-01/02、V2-43 | 无观测时刻的材料仍保持 unknown |
| F02 帖子实体、版本和多来源 | `PostEntityV2`、`PostVersionV2`、`version_conflict_refs` | V2-03/04、正文冲突断言 | 无编辑依据的差异保持冲突，不自动指定真实最新版 |
| F03 跨来源复盘 | `buildReview`、`buildReviewV2` 按实体选观测 | V2-05 | 指标定义不兼容时仍不会强行合并 |
| F04 稳定数据系列 | `SourceSeriesV2`、compatibility key | V2-06、V2-46 | 新来源口径是否兼容必须有定义依据 |
| F05 账号期间与有单位指标 | `METRIC_DEFINITIONS`、AccountPeriodSummary | V2-09–14、V2-18 | 未取得的 Analytics 标签页不推测 |
| F06 唯一帖龄窗口 | `analyzeAccountV2` age window ID 与选择 | V2-15、V2-19/20 | 没有历史快照时保持 unavailable |
| F07 冲突与顺序无关 | `buildObservationIndex`、UTC 规范化、supersedes | V2-16–18 | 未知时刻的矛盾值保持 unresolved |
| F08 逐比较样本状态 | comparison/sample 结构 | V2-19/20、V2-46 | 可比不等于因果或统计显著 |
| F09 按请求判定完成 | `deliverable_status`、V2 `run_result`、退出码 | V2-19、`test/v2-runtime.test.mjs` | 其他已得指标不能替代所请求指标 |
| F10 统一身份验证 | import、analysis、`validateV2State` | V2-04、V2-40、V2-45 | handle 变更只在稳定 author ID 或明确别名映射下合并 |
| F11 精确新闻卡归因 | `resolveCardExact`、revision card 继承 | V2-31/32 | 缺卡和冲突只报告，不选择第一张卡 |
| F12 非空专业建议 | `validateCoachingProposal` | V2-29/30 | 证据不足时允许具体补证动作，不允许空建议 |
| F13 证据索引与计算限制 | EvidenceBundle、typed refs、limitations hash | V2-28/29、V2-37 | 宿主只能追加 analyst limitations，不能删除计算限制 |
| F14 内容分析与失效 | `post-content.mjs`、content semantic receipt | V2-26–28、V2-47 | 目标变化复用内容事实，不复用旧目标评价 |
| F15 实验状态与结果 | `experiments.mjs`、ReviewResultV2 | V2-33–35、V2-39 | 没采用、没发布、未成熟均不算有效结果 |
| F16 规则原文绑定 | RuleVersionV2 source hash、历史适用性 | V2-36/48 | 生产生效时间未知时不得反推历史降权 |

## V2-01–48 确定性案例

下表逐项列出直接或组合断言。一个分组测试只有在该测试内存在对应行为断言时才列入；不会按测试名称包含多个编号就自动视为全部通过。

| 案例 | 断言证据 | 覆盖状态与限制 |
| --- | --- | --- |
| V2-01 | `test/v2-data.test.mjs` “import batch is idempotent”；`test/v2-runtime.test.mjs` CLI import | 直接断言：重复导入不增量、幂等回执 |
| V2-02 | 同上 | 直接断言：变化导出新增观测且旧值保留 |
| V2-03 | `test/v2-data.test.mjs` “same post merges source evidence” | 直接断言：实体数不增加、证据增加 |
| V2-04 | 同一测试的 wrong author 拒绝；`validateV2State` 身份门 | 导入路径有直接断言；状态保存由统一校验实现 |
| V2-05 | `test/v2-review.test.mjs` “review joins archive text to Analytics metrics” | 直接断言：无 snapshot ID 手填也跨来源关联 |
| V2-06 | `test/v2-data-acceptance.test.mjs` “different dated periods compare” | 直接断言：不同材料周段可比较并保留 refs |
| V2-07 | 同文件 “different distribution is unresolved” | 直接断言：不同分发不混算 |
| V2-08 | 同文件 “overlapping screenshot evidence selects one” | 直接断言：两份等价证据只选一次 |
| V2-09 | `test/v2-data.test.mjs` “keeps reported rounded rate” | 使用不同于真实账号的合成数值断言 raw display、ratio、precision |
| V2-10 | 同一测试 | 直接断言：reported rate 与派生比率同时保留且不相等 |
| V2-11 | `test/v2-data-acceptance.test.mjs` “zero, missing and not-authorized” | 直接断言三种状态和值 |
| V2-12 | 同文件 “authored replies and received replies” | 直接断言定义分离和错误实体层级拒绝 |
| V2-13 | `test/v2-data.test.mjs` overview/daily 两测 | 直接断言日序列、期间汇总、不重叠可加且不补 UTC 日界 |
| V2-14 | 同文件 “unknown timezone” | 直接断言当前日 partial、源日期保留、时区为 null |
| V2-15 | `test/v2-data.test.mjs` “duplicate age IDs reject” | 直接断言重复窗口拒绝 |
| V2-16 | 同一测试 “conflicts are order independent” | 直接断言矛盾观测冲突且数组顺序无关 |
| V2-17 | 同一测试 | 直接断言 UTC 与 `+08:00` 等价时刻进入同一冲突判断 |
| V2-18 | `test/v2-data-acceptance.test.mjs` “same-period exports select latest” | 直接断言 150 非 250，下降历史仍保留 |
| V2-19 | `test/v2-data.test.mjs` missing/pending；`test/v2-runtime.test.mjs` partial/3 | 直接断言 requested output 不由其他数字冒充，状态与退出码一致 |
| V2-20 | `test/v2-data.test.mjs` missing/pending sample | 直接断言 valid/missing/pending 数量与 partial |
| V2-21 | `test/v2-data-acceptance.test.mjs` API data+errors | 直接断言成功观测和失败覆盖同时保留 |
| V2-22 | 同文件 pagination token 测试 | 直接断言 20 条且有 token 继续 |
| V2-23 | 同一测试 | 直接断言来源上限和中途失败 stop reason |
| V2-24 | 同文件 age-limited 测试 | 直接断言 value=null、valid=0、unavailable |
| V2-25 | 同文件 shared media 测试 | 直接断言同 media 实体等价观测只选一次 |
| V2-26 | `test/v2-coach-core.test.mjs` “content work is bounded” | 直接断言预算、未读范围和上下文限制 |
| V2-27 | 同一测试；data acceptance 正文冲突测试 | 直接断言 hash 变化不复用旧分析，正文冲突显式保留 |
| V2-28 | `test/v2-coach-core.test.mjs` “fabricated text spans” | 直接断言假片段、静默未读上下文和未绑定回执被拒绝 |
| V2-29 | `test/v2-coaching-flow.test.mjs` limitations 测试 | 直接断言 computed limitations hash 不可删除 |
| V2-30 | 同一测试 | 直接断言必须有具体 finding 和 1–3 个动作 |
| V2-31 | `test/v2-review.test.mjs` 两项 card3/revision 测试 | 直接断言 rev2 继承 card3、跨普通改稿和发布后仍精确归因 |
| V2-32 | 同文件 exact card resolution 测试 | 直接断言 missing/conflicting，且不回退第一张卡 |
| V2-33 | `test/v2-coach-core.test.mjs` experiment 状态测试 | 直接断言没有采用或发布不能进入效果状态 |
| V2-34 | 同一测试 | 直接断言成熟度、覆盖、错误指标/帖子拒绝及 inconclusive 路径 |
| V2-35 | `test/v2-coaching-flow.test.mjs` declined action 测试 | 直接断言无新证据不得原样重复 |
| V2-36 | `test/v2-coach-core.test.mjs` rule evidence 测试 | 直接断言只改 checked_at 不能刷新规则 |
| V2-37 | `test/v2-coaching-flow.test.mjs` controller；`test/v2-runtime.test.mjs` | 直接断言材料变化使旧提案失效、revision/恢复不静默覆盖 |
| V2-38 | `test/v2-runtime.test.mjs` migration 测试 | 直接断言入口、失败不改旧字节、备份及重复 apply 幂等 |
| V2-39 | `test/v2-runtime.test.mjs` fresh process resume | 直接断言仅状态目录恢复 run、范围和下一步 |
| V2-40 | `test/v2-data-acceptance.test.mjs` auth/wrong-account receipts | 直接断言登录要求降级、错号拒绝、原始 span 绑定 |
| V2-41 | 既有 `test/news*.test.mjs`、`test/draft.test.mjs`、采用/发布相关回归 | 组合覆盖；最终 Gate A 必须报告 V1 回归命令，不能仅凭本行宣称通过 |
| V2-42 | `test/v2-coaching-flow.test.mjs` limited scope；两项 CLI flow 测试 | 直接断言 evidence_scope 保留未读和限制，partial 可恢复 |
| V2-43 | `test/v2-data.test.mjs` reinterpretation 测试 | 直接断言 supersedes、选择一次、不刷新真实观测 |
| V2-44 | `test/v2-data-acceptance.test.mjs` four contexts 测试 | 直接断言 7D/24h/point/day 分开、未知时区保持 null |
| V2-45 | 同文件 stable author/edit aliases 测试 | 直接断言 handle alias、canonical edit、eligible_n=1 |
| V2-46 | 同文件两项 period/age comparison 测试 | 直接断言不同日期周段及不同帖子队列可比，各期 missing 单列 |
| V2-47 | `test/v2-coaching-flow.test.mjs` goal-change 测试 | 直接断言内容事实复用、证据包和目标动作重算 |
| V2-48 | `test/v2-coach-core.test.mjs` historical rule applicability | 直接断言公开前帖子适用性 unknown，不作确定历史归因 |

## 真实材料的公开边界

- 已在授权环境取得账号总览和内容导出，并据真实表头建立版本化 adapter profile；公开测试只使用相同结构的合成值。
- 当前两个内容视图导出的原始字节一致，因此 adapter 将帖子类型保持 `unknown`；不会根据 UI 标签或文件名猜测原创/回复。
- 内容 CSV 格式已验证，但表头不能证明指标是 lifetime 或所选期间；`x-account-content-reported@2` 保持 `aggregation_basis=unknown`。更正旧解释必须保留原观测时间并显式 supersede，不得当作新观测重复累计。
- 源文件只有日历日期且没有源时区时，只保存 `source_created_date` 或 source date range；不会构造 UTC instant，也不会暗改为 Asia/Shanghai 日界。
- Gate C 的身份回执、私有原始材料、实际指标、建议和恢复证据保存在受限验收位置，不写入本仓库。
