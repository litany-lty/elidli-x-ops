# NEXT-2.1 交付与验收

产品版本 `2.1.0-rc.1`，Node 24、ESM、原四个锁定依赖；状态容器3。保留既有数据、新闻与教练功能，新增可靠性合同及图文稿件流程。

## 需求对应

所有编号都对应实际断言或宿主证据；模块交接表里的“部分覆盖”表示该文件的证明边界，以下为整合后的覆盖。工程通过以交付精确提交的 CI 为准，不能把分工测试数相加。

| 需求 | 代码与实际证明 |
| --- | --- |
| E01–E06 | `imports/post-identity`；next-data-reliability、next-import-cli：真实文件preview/commit/reload、原字节hash、补充metadata、冲突、多级alias、编辑前后ID、同bytes不同真实观测、定义变化与幂等 |
| E07–E13 | `observation-selection/account/metrics`；next-data-reliability：总览与日数据去重、inclusive日期与DST、真实scope兼容、六天/分页/错误/未结束期间、显式三帖范围 |
| E14–E19 | `post-content/coaching/consumer-context`；next-coach-reliability：目标与父帖池分离、稳定上下文hash、精确语义提案、证据角色与时间边界、当前正文默认消费；真实外部父帖另作SourceVersion |
| E20–E26 | `review/experiments`；next-coach-reliability：24h/72h/pending/missing、账号期间成熟、严格窗口、可信计算、数字污染与更正、状态推进/语义计划变化、准确反驳与目标限定 |
| E27–E29 | `draft/v3-dispatch`；next-draft、next-runtime-flows：同文换claim/个人依据追加审、实际review JSON绑定、历史不改、普通纯编辑、相关子集及过期审核；真实回复同文补个人依据已跑通 |
| E30–E33 | `state/migrations`；next-state、next-runtime-flows：state1/2→3、备份与清单、旧ID/hash、幂等/过期preview、固定旧运行时拒state3、并发、rename前中断及提交后回读中断只续验证 |
| E34–E35 | `record/review`；next-runtime-flows：采用不冒充发布；fixture exact正路径；modified/unverified保留归因；live exact要求真实回读；没有为验收公开发帖 |
| U01–U04 | `content/config`；next-content与next-runtime-flows：四维brief、临时/长期偏好分离、新进程配置恢复、单句编辑不创建采集/图片任务；自然语言由宿主解析 |
| U05–U08 | `media/content/v3-dispatch`；next-content、next-runtime-flows及真实宿主：三张实际PNG、alt、顺序、受管保存、提示词不算资产、缺文件精确incomplete、错数字不能批准 |
| U09–U12 | `media/content`；next-content：chart必须来自真实data_render、规格与来源绑定、缺数据阻止、不可读/裁切/alt不符不放行、声明式JSON配方、每帖四媒体与线程锚点；已实际渲染并查看已知2/3/5的确定性图 |
| U13–U15 | `content/draft`；next-content、next-runtime-flows及真实宿主：仅第二张编辑，其他字节/正文版本复用；只改文字保留图片；恢复真实历史pack并继续改首句；edit_base_ref保留来源 |
| U16–U17 | `content/state/v3-dispatch`；next-content、next-runtime-flows、next-state：新进程从阶段/预算继续、失败不重置预算、字节/alt/claim/数据规格/来源/图序精确失效；当前预览及显式拒绝不能被旧批准覆盖 |

## 三道门

- **Gate A**：最终精确提交执行 `node --version`、`npm ci`、`npm test`。最小 GitHub Actions 对 main push/PR 触发，固定官方 action commit、Node24、真实lockfile安装；固定历史writer测试需要保留该Git对象。精确SHA、退出码、计数与fixture版本由CI日志及私有交付清单记录。
- **Gate B**：12组、24份实际专业输出，生成者与评审者分离。六份初版需修订，原输出、分数和修订仍保留；所有适用维度最终达到2，不平均掩盖失败。见[专业评估摘要](next-professional-evaluation.md)。
- **Gate C**：Codex desktop真实宿主完成授权材料导入/保存/回读、一条真实回复及直接外部父帖分析、同文补依据后重审、三张真实图片、仅替换第二张、新上下文恢复、受控单图丢失与原字节恢复。另一位未参与生成的验收者核对实际SHA和390px像素预览，返回ready且无缺项。六项媒体能力有实际成功回执；账号状态最终完成真实持久化回读。

真实账号原始材料、工具回执、图片和完整专业评审留在私有账号验收目录，公开仓只有代码、合成测试和脱敏摘要。真实材料覆盖是380条导入记录；本轮直接阅读并独立审核的是其中一条回复及父帖，未声称全量历史都已阅读。

## 边界

- ready只表示稿件就绪；本轮没有X采用/发帖、调度、付费X API或真实增长效果验证。发布与成熟效果的闭环在隔离合成账号中验证。
- 新媒体绑定的search/read探测状态与旧V2联网证据分开记录；新闻发现继续复用已有宿主工具及回归证据，本轮没有重做全量新闻发现。
- 本机原账号目录与全局旧版skill未切换；使用本仓库SKILL入口。状态迁移必须显式preview/apply，旧运行时拒写state3。
- 浏览器安全策略拒绝file://页面。本轮使用无联网的原生图文预览与390px渲染核验；导出HTML未冒称通过浏览器或X客户端呈现验收。
- 未验证真实X上传/裁切、复杂emoji接近alt边界或某条建议的实际运营效果。未知热度、缺数据和未读内容仍明确降级。
- 旧开发PlanView可只读保留，缺新语义指纹时必须重建视图才能compute/close；不修改旧对象或放宽新写合同。

流程入口：[数据指导](v2-data-coaching.md)、[文字优化](content-optimization.md)、[图文制作与恢复](content-workflow.md)。模块断言详见[数据](next-requirements.md)、[教练](next-coach-requirements.md)、[图文](next-content-requirements.md)、[运行时](next-runtime-requirements.md)。
