# NEXT-2.3 验收与范围

本轮沿用 NEXT-2.2 的有效基础，当前产品为 2.3.0-rc.4，唯一写入容器 state 5，transport 1。实际运行方式见 [运行合同](next23-runtime.md)。合成工程验收、现场专业生成、真实账号与媒体使用分别记录。

## 衔接修订：2.3.0-rc.4

本次以 `9bf6328` 为基线，修复追加审查确认的两项 P1、两项 P2。保留 state 5、transport 1、旧对象及 ID，不切换原账号或全局旧 skill。

| 审查项 | 实现与验证路径 |
| --- | --- |
| P1 删除依赖后仍可激活坏知识包 | loader、propose、activate、consumer 共用引用图校验；悬空引用在事务内拒绝且 revision/active 不变，合法删除可激活后在新进程选择规则。knowledge-cli/knowledge-updates |
| P1 V5 预览工作项无法保存 | 统一实际追加路径的 V5 工作项结构；正式 prepare→compose→预览/审核→finalize，保存后回读继续执行。rc4-content-cli |
| P2 同文重审与默认消费者不一致 | V5 审核增加可选 supersedes_receipt_refs，精确替代当前头并绑定实际审核 hash；重放幂等，旧审核保留但不能恢复 ready。inspiration-delivery-cli 覆盖第二次实际审核、保存、新进程默认回读、后续 content compose；旧多头历史支持明确重审合并 |
| P2 内容恢复未重验灵感 | 当前内容就绪检查覆盖关联灵感，相关变化退出 ready，其他素材及预算保留；整体 task readiness 仍同时要求当前 Guidance，不把内容子状态当完整交付。rc4-content-cli |

独立交叉复核补齐了 V5 preview 消费字段、恢复输入引用、编辑费用/指令持久化和重审事实映射四处同源遗漏。当前定向入口已证明：合法图文经保存、审核及新进程回读达到 content/guidance/task 均 ready；相关素材变化后，content/task 退出 ready，保留预算。旧 writer 实际留下的双审核 fixture 也经当前正式 CLI 追加合并回执后恢复默认 ready，历史两份审核仍保留。

本地完整套件共318项，冻结实现首次315项通过、3项失败；失败源于旧 knowledge 单元样本未声明目录 artifact/fact/rule refs。仅补全这些样本（未放宽生产校验）后，受影响文件4/4通过；其余315项的生产输入与结果复用。精确提交的干净安装和完整318项结果以 GitHub Actions 为准。既有真实状态副本 rev161/rev172 经当前正式 inspect 与知识消费回读成功，状态字节不变，历史精确灵感引用仍可读。本轮新增材料及审核 JSON 为明确 fixture；既有真实 Chrome、媒体、专业生成证据按未变化范围复用，不代表新增发布或增长效果。

## 再审修订：2.3.0-rc.3

本次以 `44eef0d` 为基线，修复再审确认的三项 P1 和三项 P2，保留 state 5、transport 1 与既有对象 ID。新增字段为兼容可选项，历史记录不重写。

| 审查项 | 修复及贯通证据 |
| --- | --- |
| P1 实际源码变化被元数据掩盖 | check 的文件 SHA 与历史 material_hash 比较，真实修改进入 impact/source_bindings；同元数据旧 pin 即使完成审核及三态 replay 仍不能激活。review-knowledge 正式 CLI 检查、提案、保存回读、激活拒绝与合法激活 |
| P1 实验结果错绑策略 | propose-pattern 从实验 originating action 取得策略；无关策略拒绝且不增加 revision，合法策略保存后由下一次教练读取。personal 与 review-personal |
| P1 未定稿灵感进入运营交付 | 历史 resolver 与当前 delivery resolver 分离；当前消费要求 selected/finalized、精确 assessment 和真实 novelty 批准。inspiration-delivery-cli 覆盖正式入口、回读及下游 |
| P2 撤销父偏好保留旧兄弟字段 | 父 set 拆为 JSON Pointer 叶字段；后写 child 保留，其余旧值恢复默认。数组/null 原子处理。personal/review-personal 及正式 CLI 回读 |
| P2 同时刻解决事件被 ID 顺序覆盖 | 失败事件保存 committed_revision，同时间使用提交顺序和明确解决关系；重启后不复活旧失败，重复解决幂等。personal 与私有 CLI 复现 |
| P2 明确用户修改被 double unknown 误拒 | 仅 user_preference 可越过该算法适用性拒绝；仍要求肯定检查、实际信号、精确交付及保存的当前请求。rc3-preference-rule 经 CLI 记录、独立审核文件、保存回读至 ready，撤销后新进程降为 needs_review |

独立跨模块复核另确认两处同范围遗漏：未检查的注册源码路径仍可能被当成无影响、定稿灵感未在直接消费前重算个人上下文；均已补齐，定向验证通过。冻结实现后本地完整回归 **314/314 通过，0失败、0跳过、0取消**，Node v24.20.0；同提交干净安装与 CI 结果以 GitHub Actions 为准。两个既有真实状态副本 rev161/rev172 经正式 personal-step inspect 只读回读成功，状态字节不变，历史精确灵感引用可解析。既有真实 Chrome、媒体和生成证据按未变化范围复用；本次新增入口验证使用明确 fixture，不代表新增真实发布或增长效果。原账号目录与全局旧 skill 不切换。

## 审查修订：2.3.0-rc.2

本次以 `9d40430` 为修复基线。先为确认的缺陷补失败回归，再修真实入口和下游合同；初轮完整回归297/297，最终冻结业务实现完整回归 **308/308通过，0失败、0跳过、0取消**，本地Node v24.20.0。GitHub干净安装及同提交结果另以Actions为准。

| 本次审查项 | 修复及直接证据 |
| --- | --- |
| state5旧动作未审核接受 | 所有兼容采纳/试验接受均走当前Guidance；历史事实保留。next23-review-actions与coach-cli验证拒绝、合法审核后采用、保存回读与试验流程 |
| 撤销覆盖较新偏好 | config和feedback同commit维护字段head及commit顺序，支持JSON Pointer父子覆盖；撤销旧指令/同时间戳反向ID/重复撤销均不复活旧值。next23-review-personal正式CLI保存及新进程回读 |
| 过期灵感与无效新闻主张 | 相关上下文变化须重评；事件归属、支持状态、原文locator与冻结窗口在assess/finalize核对。next23-inspiration与media-dispatch实际CLI |
| 重复发布膨胀样本 | 真实post identity先去重，再按cadence组；有效执行样本、独立实验、独立发布分别计数。review-actions/review-personal覆盖同帖、多帖、分窗口和重复模式 |
| 个人模型和失败反馈 | 按strategy/scope/metric/window/相关算法版本分组，保留统计、覆盖、正负与不确定证据；精确依赖变化使旧模式排除，无关变化稳定；相关未解决质量/运行失败进入当前选择。review-personal与coach-cli |
| 完整计划与规则依据 | Guidance核对当前proposal全部canonical plans及实际交付；修改动作需affirmative且依据类型匹配的检查、实际信号与交付引用。review-actions |
| 灵感查询、媒体和审核 | query绑定子任务/seed；媒体引用精确到版本。真实review_novelty绑定候选、NoveltyDelta、当前个人选择和引用媒体的完整内容；旧审核不能批准同ID的新图片/来源/条件。inspiration/media-dispatch |
| 知识源码字节 | check验证Git HEAD/blob与文件字节；候选源文件、调用者、事实摘录及派生评审文档逐项对应检查，缺范围/未提交修改/仅填SHA拒绝。review-knowledge及knowledge-cli保存、回读、审核激活 |
| 历史兼容和重审 | 旧state5上下文与已完成灵感引用可读取；旧活动会话先补冻结窗口并重评；model_selection可重放，变化的个人依据追加新RuleContext后可重新审核。review-personal/review-delivery |

本轮独立跨模块复核发现媒体审核哈希和独立实验分母两处遗漏，均已修复并加定向回归。既有真实Chrome采集、源图字节和专业生成材料按未变化范围复用；本轮新增入口/拒绝与恢复验证使用明确合成材料，不把fixture批准称为真实专业判断或增长。新版正式CLI还只读回读了此前真实账号副本rev161与灵感副本rev172，状态字节未改变，历史精确灵感ref可解析。原账号目录、全局skill、实际X发布及付费/调度均未变更。

## 上一轮工程证据

保留既有230项回归的业务断言；旧state4夹具按实际migration5或当前初始化更新，不跳过、不删除测试。旧八组专业配对显式使用保留的V4知识快照，当前V5行为由新的真实SignalSet案例与新生成配对验证。首次完整回归为271项：238通过、33失败；失败涉及旧写入目标以及真实消费者衔接，已逐项定位后定向修复。本地最终完整套件280/280通过（包含真实来源兼容缺陷新增回归），0 fail/skip/cancel。精确提交的干净安装与完整套件以同提交Actions日志为准。

Stage A在CURRENT_STATE_VERSION仍为4时，从空actions/experiments经正式CLI跑通建议、完整计划、实际审核文件、否决/批准、finalize幂等、采纳、建试验、发布关联、复盘保存和新进程关闭。随后才切换state5。最终CI的state4分支检查迁移拒绝，不能冒称它再次运行Stage A。state5下另有完整A01–A03链，试验不是手工预填running。

| 场景 | 主要实际验证入口 |
| --- | --- |
| A01–A03 新建议到下一轮经验 | next23-coach-cli：prepare/propose/materialize→完整指导审核→accept→experiment→compute/reload/close→候选模式→模式审核→active→新进程再次prepare/propose |
| A04–A05 真实信号与规则三态 | next23-knowledge-signals、next23-coach-core；只读正文抽取、精确语义审核、unknown mechanism与editorial适用分别处理 |
| A06 完整计划与生命周期 | next23-coach-core；修改窗口/停止条件改变plan hash，接受状态不改变计划hash |
| A07–A09 有限经验与相关反证 | next23-personal；continue不等于supported、独立发布去重、scope/goal/account隔离、chain head与激活时间 |
| A10 失败策略稳定身份 | next23-coach-core；同义改写和无关新闻不解除旧失败，重试绑定解决原因的新证据 |
| A11 分层指导力度 | 既有账号/教练口径回归及新生成配对；正文、公开样本、Analytics、成熟结果不混用 |
| A12/A27 明确偏好 | next23-personal、next23-controller；config与反馈同commit，本次覆盖不污染长期，撤销不复活旧值 |
| A13–A17 历史灵感 | next23-inspiration与正式personal dispatch；真实seed/query依据、五种类型、NoveltyDelta、版本引用、相关恢复 |
| A18 真实媒体 | next23-media、next23-media-dispatch；用户图无生成能力仍可用，原图来源/字节/使用条件，缩略图不能交付 |
| A19 局部修改与恢复 | 既有next-runtime-flows与next22-visual-cli保留原断言；只失效受影响素材/审核、恢复原字节与预算 |
| A20–A21 格式与编辑处方 | next23-media、六组新生成配对；好原稿可保持、只建议不代写、不伪造经历，Article/长帖unsupported |
| A22 真实知识更新 | next23-knowledge-cli/updates与官方上游check；远端HEAD、checkout、文件hash、失败留痕、保存候选、重算影响、实际三态replay和独立审核 |
| A23 状态边界 | next23-state-migration及保留迁移回归；旧IDs/备份/哈希/回读、旧91d8cae writer拒绝state5 |
| A24 质量/运行失败 | next23-personal及实际私有否决记录；失败去重、最小复现和原因保留，不把质量问题混为运营效果 |
| A25 所有兼容入口当前门 | next23-controller与coach-cli；state5上旧data/content/collection/review可用，未审核采纳拒绝，未完成指导不伪ready |
| A26 父预算中断恢复 | next23-inspiration；唯一ticket账本、直接子news reserve仍受父上限，resume不重置 |
| A28 模式版本与审核 | next23-personal；候选→精确审核→active→stale/contradicted，新head不会令旧active复活，激活前cutoff不选用 |
| A29 执行单位 | next23-coach-core及personal；非发帖执行有记录而无虚构publication，节奏组不增加独立策略样本 |

## 专业输出

保留上一版八组配对作回归。本轮另制作六组新输入，分别只改变目标、数据成熟度、真实经历、历史重复、编辑范围和相关反证。生成者实际读取后给出12份完整结果；另一Agent读取相同输入与完整输出并评审。第一版一处冒称“已读截图”被要求修改，原不合格版本保留，修订版改为发布前实际查看后再附图。

[完整合成输入、两版输出和独立评审](evaluations/next23-generated-pairs.json)。这证明本轮取舍和表达质量；以后复用这些材料属于回归，不证明新的现场泛化或真实增长。

## 真实宿主

真实账号只使用私有副本，不迁移原账号目录、不切换全局旧skill。实际Chrome读到登录账号、Analytics范围和当前可见总览；正常Download CSV产生新的28行导出。浏览器download事件超时，随后以正常下载文件、真实创建时间、SHA和原始字节确认；未把超时当导出成功。新材料经正式data-import追加并由新进程读取。来源时区未确认、当前日未结束，覆盖保持partial。

真实媒体执行官方来源检索→查看原图→检查使用条件→正式V5登记/导入→字节回读。图片生成能力不可用时仍能保存合格源图，生成预算为0。标识图片用于检验来源复用，不代表发布内容或品牌背书。

真实短稿和运营指导使用精确版本、实际独立审核JSON和当前交付门。第一次编辑审核因未登记original_ref而否决，已原样保存，并登记质量反馈；修正引用后重新审核，随后指导审查又准确指出旧稿short_post与原始reply语境不一致，保存否决和未就绪结果；最终交付统一reply，编辑及完整指导分别由独立Agent批准，新进程回读 content/guidance/task 均ready。实际失败另以反馈事件保存，修复以追加解决事件关联，不修改旧失败。私有原始材料、账号指标、评审原件与状态不公开。

历史驱动查询的实机补验证使用另一份私有副本：历史分析实际决定seed和查询，正式父预算与子票据先保存，随后执行一次官方域搜索。该次宿主返回在落盘前被截断，原搜索保持reserved并计入消耗；未伪造RawReceipt、findings或no_findings。随后修正宿主绑定为紧凑返回并要求先保存原件，使用独立受限案例验证：搜索和官方页面原件完整保存；页面首次ingest暴露旧public_page本地locator的兼容问题，代码修复后仅重放同一raw成功。正式assess/finalize交付一张reader_question，旧记录不变，新进程恢复会话complete、两个票据均succeeded、预算search=1/read=1、付费0。本任务两案例累计search=2/read=1；首案例消耗未重置。该卡是有来源的读者问题灵感，不称今日热点。

## 不扩大结论

本轮没有在X发布、购买API或建立后台任务；完整学习时间线使用明确fixture。真实账号尚无本轮策略采用、发布后的成熟效果或增长归因。有限Chrome与单条深读不能代表全量近期内容诊断；未确认来源时区不猜测。公开算法只证明实际读取范围，生产开关、隐藏标签和当次请求仍需证据。
