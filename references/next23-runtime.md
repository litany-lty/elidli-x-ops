# NEXT-2.3 运行合同

产品 2.3.0-rc.3，Node 24，transport envelope 1，唯一写入容器 state 5。安装路径由宿主决定；私有状态、材料和原图不放进公开仓库。旧 state1/2/3/4 先使用 contract5 `state-migrate preview/apply`；backup_directory 必须位于私有账号目录内。提交后只读回读失败使用 `resume_verify`。不得直接改版本号，不自动替换全局技能或迁移原账号。

## 入口与合同

统一 `node scripts/x-ops.mjs <command> --input <request.json> --output <result.json> --state-dir <private-dir>`。外壳固定包含 schema_version=1、run_id、expected_revision、payload。所有写入使用最新 revision。检查退出码、envelope.status、content_readiness、guidance_readiness 和 task_readiness；步骤成功不能当作业务完整。

| 入口 | 当前工作 | 兼容边界 |
| --- | --- | --- |
| data-import / account-analyze | 原合同1/2，真实材料、口径、覆盖 | 原对象与ID保留 |
| collection-step / doctor | contract4 Chrome真实材料与范围 | 可在state5使用；不假造导出 |
| coach-step | contract5 prepare/propose/materialize/finalize | 旧建议可重新做当前审核，旧批准不自动有效 |
| record | 完整行动、策略、实际审核、采用、发布 | 接受动作和试验均检查当前完整指导 |
| review | contract4 compute/transition | 自然发布关联、冻结窗口、保存回读；未成熟不关闭 |
| personal-step | contract5 inspect/propose-pattern/activate-pattern/record-feedback/forget | 个人模型为派生视图，不另存重复事实 |
| inspiration-step | contract5 prepare/plan/assess/finalize/resume/reserve-news | 复用已有news source/event/claim/card |
| content-step | contract5 媒体操作；原contract3组装、审核、修改和恢复 | 复用MediaAsset/ContentPack V3，当前交付门仍适用 |
| draft-check | contract5 编辑处方与形式理由 | 原稿良好可保持；仅建议不代写；Article/平台长帖无独立能力验证时unsupported |
| knowledge-step | contract5 check/propose-update/activate-update | 旧实际规则解释保留；更新不能仅替换SHA |
| config | 当前ConfigV5与ConfigPatchV5，持久更新和反馈同commit | 用户本次覆盖不污染长期配置 |

Chrome 宿主从 assets/host-binding.codex-desktop-v4.json 读取当前模板，填入实际观察到的 browser/session/tool 映射；模板没有宣称任何能力已验证。搜索/读取默认请求紧凑返回；宿主必须先持久化实际完整工具返回，再向上下文输出摘要。若捕获失败，不造回执，不退款或重置票据预算。旧 assets/host-binding.codex-desktop.json 保留供历史新闻接口兼容，不替代当前 Chrome 绑定。知识远端检查需要本机 Git 与实际官方 checkout；doctor 报告可用性，缺 Git 不影响普通改稿。

严格对象见 schemas/*-v5.schema.json；相同命令按payload.contract_version分流。新长期集合仅 strategy_definitions、feedback_events、inspiration_sessions。

## 完整行动与学习

先准备真实内容、指标和有范围的target/baseline证据；Semantic SignalSet只接受实际读过的内容和精确独立审核，未知保持null。RuleContext同时使用发布类型、surface和内容信号。公开源码事实、编辑推论和个人经验分别标明；公开权重不是实际点赞的推荐积分。双 unknown 规则不能支持算法修改；用户明确要求的修改可以使用 user_preference，但须有肯定的偏好检查、实际信号、精确交付及本次选中的真实偏好事件。后续撤销或替代该请求会使当前指导退出 ready。

提案保存后先materialize完整行动：对象、具体改法、成本、主要指标、观察窗口、停止条件、限制、稳定策略版本。完整GuidanceOutput和实际回执必须绑定当前proposal的全部canonical计划hash、当前主体及实际交付，不能以account或无关计划替代。state5旧V2动作接受也检查当前指导；无可追溯来源的旧proposed动作须经当前proposal重审或明确替代，历史采用和实际发布记录保留。仅改变accepted状态不会使计划审核失效；改变窗口或停止条件需要重审。

动作被接受后创建试验；实际发布是单独事实。发布后使用约定窗口的实际观测。默认24h±2h到26h成熟，7d±12h到180h成熟；明确旧窗口保持。缺指标、未成熟、未发布、偏离计划分别记录。自然发布只作描述性或关联判断，不宣称随机A/B因果。

复盘→候选PersonalPattern→审核模式自身→追加active→下一次选择。一次continue不等于supported。候选经验的策略必须来自该实验 originating action 的实际 strategy_version_ref，不能把实验 A 的结果写入无关策略 B。按独立发布/试验去重，同帖不同publication记录、重复模式/review或不同年龄观测不增加独立样本；按真实post identity和cadence执行单位去重。个人模型按策略、范围、指标、窗口和相关算法依赖分组，返回分母、独立发布、覆盖、方向/离散及正反证据；mixed/inconclusive单列不确定证据。发帖节奏组视为一个执行单位；profile修改、补采仍可记录但不伪造publication进入本版效果模型。新反证或stale版本会抑制旧批准，不用同义改写绕过失败策略。

下次coach/draft/news/content/inspiration均构建OperationalContext：当前明确目标与限制、实际正文/指标、长期偏好、本次覆盖、相容经验与反证、策略和待观察事项、选中信号和相关知识依赖。哈希包含相关候选、模型选择和相关未解决失败，新增无关历史不强制全部重审。冻结model_selection在恢复时原样重放；个人依据变化会追加新的RuleContext身份，不覆盖旧上下文或陷入无法重审。已有state5旧上下文保持可读，新交付按当前合同重审。

## 偏好与灵感

明确长期偏好写入config，同时记录原话、来源、时间与操作；撤销通过personal-step forget的target_ref及来源元数据提交，不传任意patch；字段head与commit顺序决定当前生效指令，不用时间戳/ID排序猜顺序。撤销父对象按 JSON Pointer 叶字段处理：保留更晚的子字段指令，其余旧兄弟字段恢复默认；数组和 null 作为原子值。撤销旧指令保留更晚指令；旧历史链路不足时保留当前值并返回preserved_paths，不复活更早值。用户选择、成本反馈只是弱线索，不能覆盖明确要求；没采用不能当效果失败。质量问题、运行故障与运营结果分开保存。质量/运行失败的同时间戳事件使用提交 revision 与显式解决关系选择当前状态，不按反馈 ID 排序；重复解决保持幂等。

灵感从真实历史主题、实体、未解问题、已发布后续形成seed，且必须影响query。类型为fresh_event、event_update、reader_question、history_followup、evergreen_reframe。用户明确今日新闻时，旧素材不能凑数。每张卡解释接哪条历史、今天新增什么、作者能贡献什么、形式/媒体/成本/缺口，最多交付3张。

保存不可变引用 `inspiration:<session>:<revision>:<candidate>`；后续版本不改旧引用。历史读取与当前交付分别校验：运营稿、图文和当前指导仅消费 finalized、selected 且绑定实际 novelty 批准的精确候选；旧 assessed 引用不能靠后续编辑或指导审核绕过。定稿保存 assessment revision/hash、实际审核引用及冻结的上下文主体；当前交付前按保存的 selector 重建个人上下文，相关个人依据、会话、来源或媒体变化后须重评，无关历史不会使其失效。旧快照缺少冻结主体时可读历史，须 resume/reassess 后再当前交付。NoveltyDelta保存新旧材料与具体差异。plan先绑定已保存子news search任务的精确query和seed；候选媒体引用需在本次assessment中存在并指向实际asset_id:version。新闻主张必须属于所引事件，具备有效支持状态及实际原文locator；assess与finalize均复核。assess保存后返回assessment_subject_ref/hash和review_payload；宿主实际独立审核并通过record host_review_receipt保存review_novelty，finalize提供actual_review_receipt_ref并校验精确reviewed_payload与当前上下文。旧活动会话缺少冻结窗口时先resume追加新revision，再重评；已完成历史ref继续可读。父会话和子news共用票据账本，reserve/关系同commit，失败、未知和已预留都占预算；resume不重新创建空子会话刷额度。

## 真实媒体与局部编辑

区分reuse_asset、inspect_asset、annotate_source、render_data、generate_illustration。官方原图保存来源、取得/查看时间、使用条件和署名；用户原图可以在无生成能力时使用。缩略图、提示词、任务ID、临时URL不是交付原件。

媒体导入读取实际文件并保存内容寻址副本；预览和审核实际查看精确字节。只改第二张保持正文和其他图片；恢复历史必须恢复实际版本。来源更正、alt或事实映射变化只使相关审核失效。最终交付、resume和采用都检查当前文件和当前文字/个人依据。

## 真实审核与知识更新

`record host_review_receipt`保存实际JSON的SHA，逐项对照purpose、subject、content hash、decision、checks、issues、reviewer与generator。实际revise不能登记approved。语义assessment还绑定实际reviewed_payload，不接受三个true替代。工具调用成功不等于内容通过。

知识检查保存官方HEAD、实际时刻与文件hash，状态unchanged/changed/check_failed；失败不刷新最近成功时间。check逐项记录实际commit/blob/SHA并拒绝工作区源码与提交字节不一致；候选依赖、调用者、新事实原文及截取范围须与该check实际文件对应，证据不能只填commit字符串。派生评审文档应保存candidate_commit和files（实际path/status/sha256，删除项sha256=null），与检查范围逐项对应；直接源码材料必须是原文片段。候选先保存，再从当前/候选依赖重算新增、修改、删除、移动和受影响规则；即使候选依赖元数据未变，实际 check 的文件字节变化仍进入 modified 和受影响规则，旧源码 pin 会形成阻止激活的 gap。未检查路径与历史 pin 不足分别记录 impact_limitations，并进入 potentially_modified/gaps 阻止激活；实际已检查且字节不变的依赖不受影响，不能把未知写成已确认无影响。旧未绑定source的候选重新check/propose，已激活历史保留。激活要求精确独立审核和完整三态replay；不相关交付保持有效。源码读过、模块公开、生产开关和当次请求可见分别表述。没有真实宿主调度时，只在调用时检查到期事项。

## 交付

先给一个首要动作，最多补两项，说明保留什么、具体改哪里、理由、成本、观察时间与停止条件。用户默认看到推荐稿和最多三条理由；内部ID留在状态和追溯材料。仅在明确授权后发布、付费或建立后台任务。
