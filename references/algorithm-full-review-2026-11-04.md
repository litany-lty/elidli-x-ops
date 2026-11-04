# X 算法完整规则与交叉审查

**单份整合版：分发、降权、增流、账号评分、安全执法与模型链路**

## 阅读说明与版本

- **审查对象**：[xai-org/x-algorithm 固定提交](https://github.com/xai-org/x-algorithm/tree/b220448766ab4ee4c83d58a67d51f0cb5bda86c2)，SHA 为 `b220448766ab4ee4c83d58a67d51f0cb5bda86c2`，提交时间 `2026-11-03T02:56:51Z`。本次整理日期：2026-11-04，时间均用 UTC。
- **范围**：2353 个 Git 跟踪文件，29 个顶层目录、3 个根文件。主要解释公开的 For You 核心链路，并区分 Following、搜索、通知、回复、视频和广告的适用边界。不是 X 全部产品、全部线上配置的导出。
- **完成深度**：已完成全目录/文件清单盘点、三份专题分析整合与关键冲突的源码复核。核心分发、可见性、安全、账号信誉与模型/离线链路有深入或关键片段审查；**未完成 2353 个文件逐行、逐分支的全量语义审计**。具体深度见第六部分，完整文件清单在附录 E。
- **验证方式**：静态阅读、调用链追踪、常量与调用者交叉检查、文档内容整理。未运行测试、模型、训练或服务；未安装依赖、修改上游源码、操作账号、提交或部署。未使用 Claude。
- **题名中的“完整”**：指本次材料按同一版本整理成一份自包含文档，覆盖所有顶层模块、已审规则、参数及未知边界；**不表示 X 的全部规则已公开，也不表示尚未审查的代码已通过审计**。
- **代码链接**均固定到上述 SHA，避免 `main` 漂移。链接证明的是该快照的源码，不是查询到某个真实账号的当前线上结果。

### 怎样判断一条结论的可靠程度

1. **A，静态接线可证**：从入口、调用者、实现到消费者能够连起来。仍不等于确认当天生产流量实际开启。
2. **B，条件或默认可证**：源码有数值和开关，但可被实验、请求分群、作者定向、部署参数或远端配置覆盖。
3. **C，未知或未验证**：生产权重、数据、名单、提示词、删节门槛、未追完的分支、未运行的验证。不会用猜测补齐。
4. **D，机制推导建议**：供内容和账号运营参考，不是官方承诺，不保证曝光或增长。

证据优先级是：**实际调用者/接线 → 被调用实现 → 当前默认配置 → README**。函数名、标签名、参数存在或历史文档不能单独证明实际效果。

### 文档导航

- 第一至五部分：面向使用者的结论、规则速查和交叉纠偏。
- 第六部分：全仓覆盖矩阵，明确哪些深读、哪些抽查、哪些仅盘点。
- 第七部分：未公开内容与可复现边界。
- 附录 A：分发链完整细节，含 9 个来源、21 个前置过滤、评分/重排/混排、缓存和其他产品路径。
- 附录 B：可见性、安全标签、执法、媒体与法律下架细节。
- 附录 C：Phoenix 训练/检索、入池、UserCred、Agatha、BDSM、SimClusters 与透明度报告。
- 附录 D：Home 218 项、VM 58 项参数宏默认值，共 276 项；不是全仓所有常量。
- 附录 E：2353 条文件盘点索引。它不是逐文件“已审通过”清单。

## 一、先区分六种不同的“流量变化”

| 层次 | 实际问题 | 常见误读 |
|---|---|---|
| 候选可得性 | 帖子有没有进入某个索引、被某个来源召回 | 没被召回就等于账号被处罚 |
| 推荐资格 | 帖子是否通过年龄、去重、关系、权限、内容和安全过滤 | 能在作者主页看到，就一定能向陌生人推荐 |
| 个性化价值分 | 系统预测这个观看者会做哪些正负动作 | 已获得的点赞/举报次数按固定汇率兑换分数 |
| 重排与探索 | 同作者重复、内容相似、探索候选改变当前池的相对次序 | 每日第几条发帖永久扣权重 |
| 页面混排 | 广告邻接安全、模块、会话/视频去重改变可用位置 | 模型得分就是用户最终看到的绝对位置 |
| 账号/帖子执法 | 模型和规则写标签、发挑战、限制或封禁 | 每个风险分直接加到 Home 总分，或每个标签都全站封禁 |

主链是：**用户/请求补充 → 多源召回 → 候选补充 → 前置过滤 → Phoenix 等预测 → VM 价值融合/重排 → TopK → VF 等后置检查 → 截断 → 广告和模块混排**。实际 scorer 顺序是 Phoenix、ImmersiveVideo、VMRanker、PageDecode、PageRL；后两项默认关闭。内层默认先取 50 个，再做后置过滤，最终最多 35 个，之后页面还有变化。[主 pipeline](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L371-L508)、[页面槽位](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/config.rs#L17-L35)。

## 二、降权、减少推荐机会与过滤规则速查

下面的“默认”均是固定提交中的代码默认。具体值和例外在附录展开；本表把业务意义、触发场景和建议放在一起，不将过滤、排序和执法混称为一种降权。

| 机制 / 作用场景 | 触发与效果 | 默认、限制及例外 | 建议（D）与代码证据 |
|---|---|---|---|
| 负反馈预测 / Home 价值分 | 预测不感兴趣、拉黑、静音、举报、不停留会降低净价值 | Home 权重依次为 -52.272、-31.2、-58.8、-234、-0.02；VM 不感兴趣为 -47.52，其余同表。乘的是个性化预测，不是已发生次数 | 降低标题与正文落差、误导和无关推送；不能算“一个举报抵多少赞”。[融合](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/scoring.rs#L57-L214) |
| 同作者多样性 / VM 当前候选池 | 已有更高位同作者候选时，对后续候选乘衰减 | 默认开启，系数 `0.75×0.5^k+0.25`，即 1、0.625、0.4375…；Home 本地备用关闭此项 | 避免把短时间内密集发同类内容理解为线性叠加曝光。不是每日发帖配额。[实现](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/scoring.rs#L257-L325) |
| 关注外再计分 / VM | OON 候选乘系数，默认也把关注内回复/转帖计入相应处理 | 普通默认 0.75，主题 0.5；新用户极低系数另有门槛，当前 Home 请求未填所需 following_count，不能仅改一个参数就判定启用 | 对关注者的相关性与陌生人的相关性分别看；不是全站固定关注内外比例。[VM 上下文](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/value_model.rs#L122-L145) |
| DPP 内容多样性 / VM | 分数和向量相似度共同选子集，未选分数设为 0 | 部署 CLI 默认关闭；服务初始化后还看请求/FS，普通 gate 默认 true、主题 false。0 分不等同硬过滤 | 内容应有独立信息价值；不能承诺“换图/换词即可绕过相似性”。[双重 gate](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/mod.rs#L40-L102)、[DPP](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/dpp.rs#L35-L170) |
| 时间、已见、重复 / Home 前置过滤 | 当前 Home 候选帖龄、已见/已服务 ID、转帖原帖和重复会话影响资格 | Home AgeFilter 为 48h；检查重发 wrapper，不是所有池统一寿命；Bloom 可能有假阳性 | 不把“48h 后所有地方消失”当结论；同帖反复触达同一人有去重边界。[过滤接线](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L420-L444) |
| 关系、权限、主题 / Home | 静音/拉黑、订阅权限不满足、主题不匹配、缺作者核心数据等可直接丢弃 | 普通主题、bulk 主题、显式排除主题有不同缺失处理；用户关键词不是全站禁词表 | 先核对观看者与帖子所在场景，避免仅凭单账号自测认定全站状态。[关系过滤](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/author_socialgraph_filter.rs)、[主题过滤](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/topic_ids_filter.rs#L14-L105) |
| 关注外回复/转帖 / Home | OON 转帖丢弃；OON 回复只有特定 Phoenix 来源与开关条件可通过；缺 ancestors 的回复会丢 | `EnablePhoenixOonReplies=false`；不能推成所有回复产品无曝光 | 区分回复页互动与普通 For You 的陌生人召回。[实现](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/oon_retweet_reply_filter.rs#L15-L27) |
| VF 推荐资格 / Home 与 OON | 封禁/保护/拉黑、严重标签、年龄、地域、权限；OON 另加成人、SpamHighRecall、DoNotAmplify、恶意链接等 | 关注内 `TimelineHome`，关注外 `TimelineHomeRecommendations`。标签要结合 audience、开关与客户端 | 先区分关注者、陌生人、搜索和通知，不能把单场景限制说成全站隐形封禁。[规则级别](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/levels.rs#L296-L357) |
| 新观看者内容过滤 / Home、VF | soft NSFW、最低互动等是特定新/复活观看者的过滤路径 | Home 两开关默认 false；VF SoftNsfw 新用户请求开关默认 false。不是对“新作者”统一扣分 | 不把观看者新旧与作者新旧混淆。[Home 参数](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L838-L891)、[VF 条件](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L919-L928) |
| 反垃圾标签 / Botmaker、Grox | 恶意 URL、复制垃圾、互动诱导/农场、卡片操纵、垃圾回复可产生不同标签或动作 | 规则只公开一部分；部分高信誉豁免不涵盖互动诱导/农场/卡片操纵；并非所有标签直接被当前 Home 消费 | 使用真实内容和真实互动，不推算删节阈值、不靠刷量。[Grox 标签 sink](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/flows/ptos/task_write_safety_post_annotations_result_sink.py#L188-L248) |
| 广告品牌安全 / 页面混排 | 风险分类影响能否邻接某类广告，广告重排可移动/截断自然帖 | 当前默认 `multi_risk`；缺判定对外默认 medium。品牌安全不是自然帖删除的同义词 | 不能把无法邻接广告等同全站无法推荐；相关标签还可能独立影响 VF。[混排](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/multi_risk_blender.rs#L38-L259)、[风险模型](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/models/brand_safety.rs#L73-L191) |
| 账号执法 / AES | 已路由风险消息经过规则、安全检查、白名单、去重、限速、申诉 hold 后才执行挑战/标签/封禁 | 12.34 等门槛明示 mock；BDSM 9.99/999999 为删节占位；hold 默认 Off | 保留误判与申诉材料；公开数字不能拿来计算安全操作上限。[AES 主链](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/lib.rs#L353-L865) |

## 三、增流与增加推荐机会：哪些是源码事实

“增流”在此只表示提高入池机会、预测价值或相对排序的机制。它不是给作者发放固定曝光额度。

| 机制 / 场景 | 触发与作用 | 默认或边界 | 建议（D）与代码证据 |
|---|---|---|---|
| 正反馈预测 / Home 价值融合 | 预测回复、引用、转帖、分享、关注、停留等按权重进入净值 | 例如 reply 5、quote 5、retweet 1、copy-link 20、follow 4；Home favorite 0.66、VM 0.5。完整表在附录 A.5.3 | 做对目标读者有用、愿意自然阅读和转述的内容，不刷单一指标。[融合与权重](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/scoring.rs#L57-L214) |
| 互关原创帖 / Home 与 VM | 非回复、非转帖、互关作者，reply 预测权重得到额外 boost | 默认从 5 加 15 成为 20；dwell boost 默认 0。不是整帖乘 15，也不是所有互关内容同等加权 | 重视真实关系与相关讨论；互关本身不保证高分。[资格](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/inputs.rs#L20-L21)、[权重](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/weights.rs#L84-L99) |
| 小作者/低曝光新帖探索 / Home | 原创非回复非转帖、粉丝已知且 ≤50000、帖龄 ≤2h、Home 曝光已知且 <200，且非末端低分 | 默认开启；Thompson 抽样后仅选一个合资格候选提到目标分数；slot [15,16) 不锁定最终第16格。holdout arm 仍可参与 | 这是机会机制，不是“每条保底200曝光”。[资格与抽样](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/author_cold_start.rs#L188-L333)、[holdout 接线](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/author_cold_start.rs#L378-L421) |
| 发帖事件与 tail 索引 / Rankall | PostCreation 有直接入池路径；SIDTail 有小作者池 | tail 默认粉丝 <1000、最低 fav 为 0；仍要过池自身条件、实际召回和后续排序 | 不需要先假造点赞才能证明内容有入池机会；无赞不等于全局无曝光。[事件分流](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix-rankall-strato/columns/phoenix_rank_all/phoenixRankAllCandidateProcessor.strato#L430-L530)、[tail 默认](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix-rankall/src/config/mod.rs#L119-L123) |
| 关注图与多路兴趣召回 / Thunder、Phoenix、SimClusters | 真实关注、历史行为、语义与兴趣向量有助于来源找到相关帖子 | 多源上限不是保证配额；同帖可能多源重叠；没有统一 50/50 关注内外比 | 保持主题与受众相关性；不能把兴趣特征解释为可手算固定话题奖分。[来源注册](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L371-L380) |
| 未探索帖预测 / 价值分 | 特定预测头对 IN 候选贡献小额正项 | Home 0.015、VM 0.02；VM include OON 默认 false。不是所有新帖无条件奖励 | 与作者冷启动、零赞索引分开理解。[Home 权重接线](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/value_model.rs#L8-L50) |
| 热门原帖 / PopularPosts | 热门作者池中原帖按曝光和年龄修正质量选入 | 默认每作者5、总500、窗口24h、时间常数8h；不包含全平台任意作者 | 这是受限定来源，不是通用曝光奖励；不据此承诺热门时间表。[作业](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/popular_posts_job.rs#L67-L155) |
| 页面/视频探索 / 可选实验 | PageDecode、PageRL、视频 carousel 可改变部分页面内容 | 三者主要开关默认 false，且有互斥和资格；视频不是天生统一加分 | 按内容是否适合视频选择媒介，不为未经证实的“固定倍数”改格式。[参数](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L324-L371)、[视频模块](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/video_carousel_filter.rs) |

## 四、账号评分：至少四类信号，不是一个“账号权重”

| 信号 | 机制与场景 | 已知默认 / 未知 | 对实际使用的解释与证据 |
|---|---|---|---|
| UserCredV2 | 有效账号关注图 PageRank + 互动加权 teleport；输出账号 mass 与 0–100 score | `clamp(165.2 + 7.07×ln(mass),0,100)`；beta 0.5、jump 0.2、最多50轮、互动7天。真实图与快照未提供 | 是图信誉，不是粉丝数，也没有证据直接把该 score 加入 Home 总分。[核心计算](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/user-cred-v2/UserCredV2App.scala)、[score](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/user-cred-v2/UserCredV2.scala#L10-L20) |
| Premium / 认证与信誉先验 | 代码把 blue/gray/gold、verified organization 与 affiliate 合称 `isPremium`；仅非 near-zero 的该集合进入均匀先验 | 此先验与互动质量混合；不是对全体账号均匀发放，也不是购买蓝标后帖分乘固定倍数 | 不能用它推导付费增长回报。[定义](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/user-cred-v2/ValidUserInfo.scala#L5-L43)、[teleport](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/user-cred-v2/UserCredV2App.scala#L154-L199) |
| HighPageRank 风控分流 | Botmaker 读取 UserCredV2 或预测标签；只有不可使用该判据时才走粉丝数后备 | 函数中的粉丝后备条件 >25000；它只用于该函数，不是通用免审门槛，且其他链的阈值可能删节 | 高信誉可影响部分送审/标签路径，但互动诱导等类别没有一般豁免。[消费者](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/botmaker-rules/scarecrow/derived-feature/IsHighPageRankUser.df#L2-L28) |
| Agatha | 去重、来源筛选、抽样和平滑比率标签，经 PMI 与图/行为特征产生多组预测 | 平滑率 `(interaction+0.1)/(interaction+favs+0.1/prior)`；30/180/21/14天属于不同步骤，不是单一窗口 | 举报/赞不是直接兑换排名，需追 Botmaker 标签及后续消费者。[标签](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/agatha/scalding/labels/rate_based_labels/RateBasedLabels.scala#L24-L119)、[PMI](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/agatha/hub/agatha/predict/Predict.scala#L17-L54) |
| BDSM | 行为序列 Transformer，8个检测头，输入行为、时间、设备、网络、目标等 | 模型结构/头训练可见；真实权重和执法 operating points 未给出 | 不是“几分钟发几条”的公开硬规则，不应为猜阈值构造行为。[模型](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/bdsm/runtime/model.py)、[删节政策](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/bdsm/runtime/sink_policy.yaml#L4-L45) |
| 帖到账号安全标签聚合 | 一段历史的内容标签可形成账号标签；旧 Botmaker 与新 Strato 聚合并存 | 新静态默认有最近5条3条命中的 NSFW_HIGH_PRECISION 规则，TTL7天；另一规则10条窗口要求11条，默认不可满足；均可动态替换 | 关注内容、媒体和账号历史；不能声称线上统一使用该配额。[规则与覆盖](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/safety-label-user-agg/postToUserLabelRules.strato#L360-L432) |

**不能做的推导**：从一个账号总曝光倒算 UserCred；把 UserCred、Agatha、BDSM 的分数互相换算；把安全标签直接当成 Phoenix 训练系数；把一次真实互动直接换成固定流量奖励。数据、模型、消费者和产品场景不同。

## 五、三份材料交叉复核：已统一的冲突与易误读

| 原始材料或常见表述的问题 | 本文采用的结论 | 核验落点 |
|---|---|---|
| VFFilter 缺字段被写成缺 `visibility_reason` | **更正为缺 `visibility_action`**。过滤器只看 action；有 reason 没 action 也不会由此过滤，反之 Drop action 仍会丢 | [VFFilter](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/vf_filter.rs#L8-L26) |
| 安全材料强调 RPC Err，分发材料强调保留，看起来相反 | 二者是不同层：VF hydrator 返回 Err；通用 `update_all` 只应用 Ok，原候选字段保留。若原来没有 action，VFFilter 不因缺 action 丢弃；若已有旧字段也可能保留。显式 NotEvaluated 则丢，旧 Strato 映射又不同 | [通用更新](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/candidate-pipeline/hydrator.rs#L61-L69)、[VF hydration](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_hydrators/vf_candidate_hydrator.rs#L112-L181) |
| VF 返回 Downrank 等于本过滤器必乘惩罚 | 当前 Home VFFilter 保留 Downrank/Avoid/Interstitial，没有在这里乘系数；其他消费者需另证 | [动作匹配](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/vf_filter.rs#L22-L26) |
| Home 与 VM 权重被混成一张线上常量表 | 两套默认分别列出；调用者先算 Home 备用，远端可按自身配置重算。差异包括 favorite、video_open、post_unexplored、连续停留、不感兴趣 | [本地接线](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/value_model.rs#L8-L50)、[VM 默认](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L3-L156) |
| VM `ComputeValueModel=false` 推出价值模型没执行 | Home 请求显式 `compute_value_model=true`；远端仍依赖可用配置，有配置缺失回退 | [请求](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/vm_ranker_request.rs#L38-L46)、[接收](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/mod.rs#L40-L46) |
| `VMRankerEnableFallback=false` 推出 RPC 失败没有备用分 | 此开关管 xDS→DNS 回落；本地候选分仍作为 RPC 失败/漏项备用 | [VMRanker](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/vm_ranker.rs#L25-L140) |
| DPP 默认 true/false 自相矛盾 | 部署 context 初始化默认 false，初始化后普通 FS gate 默认 true，主题 false。没有参数配置时 gate helper 为 true，仍必须有 DPP context | [CLI](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/args.rs#L15-L28)、[多层 gate](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/mod.rs#L40-L102) |
| 冷启动 viewer treatment/control 默认 false，因此冷启动没生效 | 它们共同产生 Holdout arm；`cold_start_corpus_eligible(Holdout, _)` 明确 true，仍须其他资格与总开关。**holdout 名字不代表禁用** | [arm 资格](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/author_cold_start.rs#L228-L234)、[实际决策](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/author_cold_start.rs#L393-L421) |
| README 的 RankingScorer 与 partition_organic 被当当前主链 | 当前 scorer 是五项接线，广告默认 multi_risk；README 只能作概述 | [scorer 列表](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L466-L472)、[广告默认](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L937-L942) |
| README 指向 VF `rules/registry.rs` | 当前树无此文件，应读 levels、catalog、engine 与具体 rule_spec | [实际目录](https://github.com/xai-org/x-algorithm/tree/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules) |
| Premium 等于普通蓝标、UserCred 等于粉丝数 | `isPremium` 包含多种认证角色；信誉是图传播和互动先验；风险消费者存在但不能直接等同 Home boost | [角色定义](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/user-cred-v2/ValidUserInfo.scala#L5-L16) |
| Agatha BlocksPerFav 生成器存在，等于当前训练必用 | 当前两个 job 的 labelNames 未包含它；必须区分工具能力与实际 job 集合 | [BuildJob](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/agatha/scalding/RateBasedBuildJob.scala#L22-L29)、[PredictJob](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/agatha/scalding/AgathaFeaturesPredictJob.scala#L26-L85) |
| 1/32赞、400粉丝、48h、8h半衰期被并成全站门槛 | 分别属于特定索引、KnownFor 种子、Home/Thunder窗口、某流式分数；存在其他池与时间常数 | 详见附录 A.2、A.3、C.4、C.5.4 的逐项源码 |
| 检索只学点赞、没有直接 MM 输入就不懂内容 | combined 检索有多头/停留；部分 ranker 用 SID 表达内容，SID 源自 MM 量化 | 详见附录 C.3.1–C.3.5 |
| 模型候选隔离等于最终名次独立 | 基础注意力隔离不取消后续候选竞争、作者多样性、DPP 和广告混排 | 详见附录 C.3.2 与 A.5–A.9 |
| 9.99、999999、12.34 都是可用“安全线” | 明确为删节或 mock，不能推导真实封禁或限流阈值 | [BDSM](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/bdsm/runtime/sink_policy.yaml#L4-L45)、[AES](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/rules/enforcement_user.yaml#L19-L33) |
| 透明度报告为空等于无任何可见性限制 | 报告有认证、账号年龄、发帖量、月度时延、开关和 best-effort 限制，不是完整排名原因日志 | 详见附录 C.6.2 |

### 使用这些结论的具体顺序

1. 先明确要解释的是 For You、Following、搜索、回复、通知还是视频产品；不同入口不共用全套规则。
2. 把问题定位到“未入池、被过滤、分数较低、重排/混排、标签/执法”中的哪一层。仅有曝光数不足以区分。
3. 查看已知的账号状态、可见标签、内容权限、观看者关系和发布时间；不要用猜测填补实际请求日志。
4. 内容上优先降低误导、重复灌水和负反馈风险，提高对目标读者的实际价值。外链、图片、视频没有被此快照证明存在全站统一固定奖惩。
5. 面对误判保留帖子、时间、提示与申诉材料。申诉 hold 的代码存在，不代表每个生产案件都使用相同保护。
6. 不承诺曝光数、不设计刷互动、不根据删节阈值制造行为。真实增量效果需要适当的数据和对照；本次未执行这类实验。

## 六、全目录覆盖矩阵与未完成部分

覆盖等级是描述本次实际阅读范围，不是评分。“深入”也不表示该目录所有文件逐行读完；“抽查”明确只证明选定接口或关键片段。所有 2353 条路径已做文件盘点，但没有伪造逐文件完成状态。

| 顶层目录 | 跟踪文件数 | 实际阅读深度 | 已检查的主要内容 | 尚未证明 / 未完成 |
|---|---:|---|---|---|
| [`candidate-pipeline`](https://github.com/xai-org/x-algorithm/tree/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/candidate-pipeline) | 11 | 深入主链 | 阶段顺序、并发补充、错误保留、selector、异步 side effect | 未逐行审核全部辅助统计/测试 |
| [`home-mixer`](https://github.com/xai-org/x-algorithm/tree/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer) | 273 | 深入核心，周边抽查 | 入口、9源、21前置与5后置过滤、5 scorer、VM接线、冷启动、品牌安全、混排、缓存 | UI marshal、全部日志/客户端重试、所有备选广告求解器和topic字典语义未逐行覆盖 |
| [`thunder`](https://github.com/xai-org/x-algorithm/tree/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/thunder) | 24 | 深入关键检索 | 内存保留、作者扫描上限、回复/转帖资格、排除和排序 | 未验证事件消费运行、真实图或服务性能 |
| [`phoenix`](https://github.com/xai-org/x-algorithm/tree/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix) | 383 | 模型/训练关键路径，内核仅盘点 | 排序与检索配置、损失、注意力mask、SID/MM参考链、训练/权重边界 | 未逐行审全部383文件、CUDA/Pallas/CuTe数值等价、引擎并发/RDMA/存储 |
| [`phoenix-rankall`](https://github.com/xai-org/x-algorithm/tree/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix-rankall) | 45 | 核心读取 | 池/窗口、SID与tail、backfill、外部黑名单 | 真实索引、部署配置和全消费者组合未知 |
| [`phoenix-rankall-strato`](https://github.com/xai-org/x-algorithm/tree/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix-rankall-strato) | 17 | 核心读取 | 事件分流、Fav/PostCreation、VF、回复/视频/成人池 | 全部外部列、策展名单与事件运行值未知 |
| [`simclusters`](https://github.com/xai-org/x-algorithm/tree/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/simclusters) | 232 | 离线关键路径+在线ANN | KnownFor、InterestedIn、TweetJob、时间常数、Home ANN | 全部232文件/周边job未逐行审，内部SBF/数据未提供 |
| [`xai-value-model`](https://github.com/xai-org/x-algorithm/tree/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model) | 6 | 深入核心 | 头融合、互关资格、偏移、作者多样性、OON、扰动 | 无真实预测值，未做数值/运行验证 |
| [`vm-ranker`](https://github.com/xai-org/x-algorithm/tree/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker) | 16 | 深入核心，服务边界抽查 | 参数覆盖、重算/兜底、DPP、去偏、作者规则接入 | 真实CLI/FS/embedding/debias工件不可得，未启动服务 |
| [`visibility-filtering`](https://github.com/xai-org/x-algorithm/tree/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering) | 139 | 深入核心，其他场景抽查 | Home两级规则、通知对比、engine/catalog/audience、动态开关、地区条件 | 全部hydration clients、golden corpus、GraphQL呈现分支未逐行审 |
| [`visibility-filtering-client`](https://github.com/xai-org/x-algorithm/tree/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering-client) | 11 | 接口与兼容抽查 | 安全级别、Rust/Strato调用、NotEvaluated映射 | 未做RPC/schema兼容验证 |
| [`safety-label-source`](https://github.com/xai-org/x-algorithm/tree/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/safety-label-source) | 9 | 深入读取链 | 标签expiry、缓存、proto字段解码 | 真实Manhattan/Twemcache与存储内容未知 |
| [`safety-label-user-agg`](https://github.com/xai-org/x-algorithm/tree/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/safety-label-user-agg) | 3 | 深入核心 | 规则JSON、窗口/阈值/TTL、验证、FS覆盖、写用户标签 | 线上JSON、实际事件与标签结果未知 |
| [`grox`](https://github.com/xai-org/x-algorithm/tree/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox) | 199 | PTOS/回复核心深入，MM/UPA接线抽查 | plan、过滤/去重、分类接口、写标签、模式、MM多版本与UPA发布 | 提示词缺失；所有renderer、backfill、视频plan未逐行审 |
| [`clip`](https://github.com/xai-org/x-algorithm/tree/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/clip) | 20 | 算法与依赖深入 | 编码器、对比loss、维度、权重URL占位 | notebook管线未完整核查，未获得/运行模型 |
| [`adult-content`](https://github.com/xai-org/x-algorithm/tree/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/adult-content) | 8 | 训练/校准深入 | MLP、BCE、isotonic、precision/recall/FPR | 无数据、权重与实际质量评估 |
| [`pnsfwmedia`](https://github.com/xai-org/x-algorithm/tree/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/pnsfwmedia) | 1 | 单文件结构阅读 | 冻结CLIP、账号/媒体特征拼接、训练/导出 | 实验文件到特定生产端点无可证版本连线 |
| [`media-model-proxy`](https://github.com/xai-org/x-algorithm/tree/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/media-model-proxy) | 98 | 服务关键链深入 | registry、module、service、XxNsfw descriptor、decider | 其余descriptor按注册确认，未逐行全审；后端未知 |
| [`agatha`](https://github.com/xai-org/x-algorithm/tree/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/agatha) | 90 | 核心算法与消费者深入 | 平滑标签、来源/窗口、抽样、PMI、leave-one-out、moments、Botmaker消费 | 全部loader/job与生产数据未逐行/运行验证 |
| [`bdsm`](https://github.com/xai-org/x-algorithm/tree/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/bdsm) | 46 | 模型/损失/执法结构深入 | 时间RoPE、输入、8头、head训练、sink policy、格式校验 | 完整backbone预训练流水线/权重/真实阈值未提供，未验证运行 |
| [`user-cred-v2`](https://github.com/xai-org/x-algorithm/tree/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/user-cred-v2) | 9 | 核心算法与消费者深入 | 有效账号、关联边、teleport、PageRank、score、快照gate、高信誉消费 | 真实图/历史mass/发布结果不可得，未执行作业 |
| [`botmaker`](https://github.com/xai-org/x-algorithm/tree/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/botmaker) | 492 | 框架/依赖抽查，其余盘点 | 规则包、解释/编译框架入口与构建依赖 | 492文件多为基础设施/生成代码，未逐文件语义审核 |
| [`botmaker-rules`](https://github.com/xai-org/x-algorithm/tree/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/botmaker-rules) | 73 | 代表性端到端深入 | URL、重复文本、Agatha、Grox、gore、NSFW聚合、高信誉函数 | 其余公开规则未逐条展开；未公开规则无法审 |
| [`scarecrow`](https://github.com/xai-org/x-algorithm/tree/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/scarecrow) | 35 | 接线抽查 | loader、调度、规则包、transpiled开关 | 未逐文件审核/编译运行，实际规则包和流量未知 |
| [`abuse-enforcement-service`](https://github.com/xai-org/x-algorithm/tree/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service) | 55 | 执法主链深入 | user/post YAML、动作、动态cache、安全检查、dry-run、dedup、hold、final checks | 管理API/鉴权/backfill/全部confidence规则未逐行审；不是漏洞审计 |
| [`abuse-ledger-service`](https://github.com/xai-org/x-algorithm/tree/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-ledger-service) | 12 | 读侧接口抽查 | hold查询SQL、API/repo/config定位 | 申诉写侧、真实queue/TTL与数据未知 |
| [`takedowns`](https://github.com/xai-org/x-algorithm/tree/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/takedowns) | 4 | 关键读取/合并/消费深入 | post+user理由、read gate、VF国家判断 | 外部法律处理工作流未提供 |
| [`under-the-hood`](https://github.com/xai-org/x-algorithm/tree/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood) | 38 | 日任务/服务/展示关键路径 | 资格、UTC月份/时延、标签事件和快照、帖子ID展示开关 | 全部回填/legacy实验/月度发布程序未逐行审 |
| [`docs`](https://github.com/xai-org/x-algorithm/tree/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/docs) | 1 | 历史说明核对 | 互关boost历史文档与当前实现对比 | 历史文档不覆盖当前调用者/默认 |
| 根文件 | 3 | 文档/许可盘点 | README、LICENSE、CODE_OF_CONDUCT | 不计作代码目录 |

**计数校验**：29 个目录合计 2350 个文件，加根文件 3 个，共 2353 个。`.git` 不计入。未发现 submodule 项。Rust 661、Scala 568、Python 483、Java 313、`.df` 53、`.bot` 20、Strato 29、Thrift 12、Proto 10；扩展名数量只说明工程组成，不表示语义审查完成度。

### 当前仍然开放的审查事项

- 2353 个文件的逐文件、逐分支语义审查尚未完成，尤其底层数值内核、服务并发/通信/存储、生成代码、全部离线周边作业、剩余公开 Botmaker 规则与全部测试。
- 未验证全仓构建、服务启动、训练/推理、CPU/GPU等价、性能、误报/漏报、公平性与线上质量。**没有测试通过率，也没有模型质量结论。**
- 缺少真实生产权重、事件、图、索引、标签、提示词、有效配置和请求日志，不能精确复算任意真实账号或帖子。
- 本文不据“目录已覆盖”把上述工作标记完成。若后续继续，只能补齐明确剩余范围，不能把本次静态阅读包装成已执行运行验收。

## 七、公开源码与可复现边界


### 7.1 能看到源码，不代表所有组件能独立构建

1. 根目录没有统一 `Cargo.toml`、Bazel `WORKSPACE` / `MODULE.bazel`、npm `package.json` 或全仓锁文件。`home-mixer`、`thunder`、`vm-ranker`、`visibility-filtering`、`phoenix-rankall` 等目录没有各自Cargo清单。这是透明度导出，不是完整单仓生产部署工程。
2. [`phoenix/Cargo.toml`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/Cargo.toml) 明列9个workspace成员：公共recsys、engine、MM server、recsys proto/server、SID proto/retrieval/proto、storage。提供Cargo.lock及Python构建清单；这是仓库里最完整的可运行参考链路。Python关键依赖包括 JAX 0.8.1、dm-haiku 0.0.16、Optax、Orbax、Arrow；引擎有CUDA、RDMA/libibverbs、C/C++、Rust、protoc等环境要求。**本次没有安装或验证它。**
3. Scala/Bazel构建文件广泛引用原内部单仓路径，如 `scalding_internal`、`finagle-internal`、`src/thrift/...`、`decider`、`3rdparty/...`。这里不含这些完整依赖树/数据集定义。UserCred与SimClusters大量依赖内部DAL、Manhattan、图快照，不可能仅用仓库重现生产结果。
4. 在线链路依赖 xai Feature Switches/Decider、XDS/服务发现、Kafka、Strato、Manhattan、Tweetypie/Gizmoduck/关注图/安全标签服务。这些接口可见，线上值和全体实现不在仓库。默认参数的含义受请求分群与调用者覆盖影响。
5. BDSM分别有Rust累积器和特征抽取器Cargo清单、Python清单。但 [`runtime/model.py`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/bdsm/runtime/model.py) 直接依赖 `haiku2`、JAX，Python清单的GPU extra只列Optax；文档也要求另备GPU环境及匹配特征抽取器。不能把“有pyproject”写成“所有依赖及部署可无缝复现”。

证据：[Phoenix workspace](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/Cargo.toml)、[Python清单](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/pyproject.toml)、[Botmaker内部依赖示例](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/botmaker/src/scala/com/twitter/botmaker/BUILD)、[Agatha构建示例](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/agatha/scalding/data/BUILD.bazel)、[Home配置匹配](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/server.rs#L186-L200)、[BDSM清单](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/bdsm/pyproject.toml)。

### 7.2 明确未公开或未随本快照提供的内容

| 缺口 | 可确认事实 | 不能推出的结论 |
|---|---|---|
| Grox提示词、部分Botmaker规则 | 根README明确说明不公布 | 无法枚举所有检测规则、提示词分类边界或所有规避条件 |
| 生产权重/数据 | Phoenix TRAINING明确无生产checkpoint、训练feed、多机编排；全仓跟踪文件没有 `.npz/.npy/.safetensors/.ckpt/.pt/.parquet` 或 `MANIFEST.json` | 不能复现某个真实账号/帖的生产预测值，不能把随机/合成演练当质量评估 |
| BDSM真实阈值 | 概率阈值以9.99替代，动作数量门槛以999999替代，申诉note模板也删节 | 不能得出“9.99才封”“999999次操作才封”，也不能恢复真实安全界限 |
| 线上分群/实验 | 根README只说目标是较大流量实验（例如10%以上）可见、cron同步主要生产默认 | 不能说每个用户必定用仓库默认，也不能证明无小流量未公布实验 |
| 召回策展和黑名单 | Strato导入 `hydra/curatedAuthorLists`、`hydra/authorCategoryConstants`；Rankall读取外部 `blacklisted_post_ids.txt`/`blacklisted_author_ids.txt` | 这些实际列表未随本快照提供，不能枚举被纳入/排除的账号或帖 |
| 人工标签与执法输入 | README明确透明度工具也可显示手动应用的标签 | 源码不能重建所有历史人工判定及其理由 |
| 全站其他产品 | 有搜索/视频/广告的部分共享模块，但没有据此证明全站端到端覆盖 | 不能把For You规则直接等同搜索、通知、所有回复、关注页、广告竞价规则 |

证据：[实验配置](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/README.md#L428-L434)、[Phoenix训练边界](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/TRAINING.md)、[BDSM删节声明](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/bdsm/README.md)、[外部黑名单读取](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix-rankall/src/processor/blacklist.rs#L12-L24)、[外部策展依赖](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix-rankall-strato/lib/eventProcessing.strato#L1-L3)。


### 7.3 本文不作出的承诺

没有足够证据支持：固定互动换曝光公式、全站关注内外固定比例、无赞无曝光、每天固定发帖上限、某时刻必获奖励、外链一律降权、图片/视频一律增权、购买认证固定倍数、所有账号使用同一安全阈值、没有透明度标签就没有任何限制。已有代码也不保证这些机制在某个线上请求中开启。

后续若要解释某一次真实页面，至少需要请求场景、候选来源、各阶段过滤结果、有效配置、模型输出、帖子/作者标签、缓存状态和最终页日志。当前公开仓库不能代替这些证据。

## 附录 A：分发链详细规则

### A.1 真正的执行顺序

#### A.1.1 通用调度语义

[`candidate-pipeline/candidate_pipeline.rs:L129-L178`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/candidate-pipeline/candidate_pipeline.rs#L129-L178)：

查询 hydration → dependent query hydration → 多源召回 → candidate hydration → 顺序过滤 → 顺序 scorer → selector → post-selection hydration → post-selection filters → 结果截断 → finalize → 异步 side effects。

- 查询 hydrator、sources、同一批候选 hydrator 各自并发执行；sources 的结果仍按注册列表合并，而非按网络返回先后排序。`L239-L257,L291-L306,L331-L347`。
- 同一阶段候选 hydrator 都看到阶段开始时的候选，不是前一个 hydrator 更新后的候选；其返回结果按列表顺序应用。因此需追踪源是否先补作者等字段，不能把列表当串行数据依赖。`L331-L347`。
- filters 和 scorers 顺序执行。过滤不可逆地缩小后续池。scorer 单项失败保留原候选字段；返回长度不匹配时整批更新被跳过。[`candidate_pipeline.rs:L378-L430`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/candidate-pipeline/candidate_pipeline.rs#L378-L430)，[`candidate-pipeline/scorer.rs:L27-L58`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/candidate-pipeline/scorer.rs#L27-L58)。
- 召回失败通常丢失该源，而不是让整个页面失败；查询 hydration 失败不更新相应字段。某些具体组件另有 fail-closed 逻辑，不能概括为“所有失败都放行”。
- side effects 在后台任务运行，日志/缓存写成功并非本页响应的先决条件。[`candidate_pipeline.rs:L433-L445`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/candidate-pipeline/candidate_pipeline.rs#L433-L445)。

#### A.1.2 Home 内层 PhoenixCandidatePipeline 实际注册

[`home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs:L282-L534`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L282-L534)：

**查询补充**：scoring/immersive/retrieval sequence、blocked/muted/followed/subscribed IDs、候选缓存、mutual-follow、人口属性、关注的 Grok topics、starter packs、安装应用、近期搜索、显式/隐式互动、曝光 Bloom filter、IP 与推断性别。

**源的合并顺序**：Thunder → PopularPosts → TweetMixer → Simclusters → Phoenix → PhoenixTopics → PhoenixMOE → SID → CachedPosts。`L371-L380`。

**打分前候选补充**：InNetwork、BidirectionalFollow、CoreData、PhoenixReplyAncestors、Quote、MediaInfo、Subscription、Gizmoduck、BlockedBy、FilteredTopics、LanguageCode、EngagementCounts、PostEngagers、SemanticId、NewUserSoftNsfwLabel。`L383-L414`。

**打分器实际顺序**：
1. PhoenixScorer
2. ImmersiveVideoScorer
3. VMRanker
4. PageDecodeRerankScorer
5. PageRlExplorationScorer

证据 `L466-L472`。不能将旧 README 的 RankingScorer 当作当前独立接线阶段。

**打分后补充**：VF、广告品牌安全、推文类型指标、回复关系、mutual-follow Jaccard、topic/AI trend feedback、视频信息/embedding、祖先视频。`L476-L500`。

**打分后过滤**：VF → AncillaryVF → AncestorVideo → DedupConversation → VideoCarousel。`L502-L508`。

内层 selector 默认先取 50 个，再做后置安全/会话过滤，最后至多 35 个；不是先在全池执行本阶段VF后取最佳35再返回。后置丢弃可能造成短页，代码没有从全量未选池重新补齐的循环。[`home-mixer/selectors/top_k_score_selector.rs:L15-L45`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/selectors/top_k_score_selector.rs#L15-L45)，[`params/config.rs:L17-L22`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/config.rs#L17-L22)，pipeline `L1118-L1120`。

#### A.1.3 外层页面还会再变一次

ForYou 外层源为 ScoredPosts、Ads、WhoToFollow、Prompts、PushToHome、JetfuelFrame、FeedSurvey。内层最终分数不是最终绝对位置。外层先 PushToHome 去重，再 BlenderSelector，后置可选 AdAdjacentServedFilter。[`for_you_candidate_pipeline.rs:L210-L234`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/for_you_candidate_pipeline.rs#L210-L234)。最大48条是 35 普通槽 + 5 模块槽 + 8 frame，不是48条自然推荐。[`params/config.rs:L18-L22`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/config.rs#L18-L22)。

### A.2 召回规则：哪些内容有机会进入评分池

| 源 | 默认/关键门槛 | 规模与操作 | 源码证据 |
|---|---|---|---|
| Thunder | 非候选缓存请求；没有一个固定“50%关注内容”配额 | 关注列表内候选，默认最多1200；排除请求已见IDs，受 quality factor 影响；algorithm="default" | [`sources/thunder_source.rs:L23-L65`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/sources/thunder_source.rs#L23-L65); [`params/param.rs:L23-L34`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L23-L34) |
| PopularPosts | 默认true；非缓存、非in_network_only | 共享热门帖列表前500，然后排除已见；此源不是按个人向量选500 | [`sources/popular_posts_source.rs:L27-L63`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/sources/popular_posts_source.rs#L27-L63); params `L1099-L1110` |
| TweetMixer | 默认false；非缓存、非in_network_only | 默认800，经外部 TweetMixer 服务；本地剔除超过48h候选 | [`sources/tweet_mixer_source.rs:L25-L80`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/sources/tweet_mixer_source.rs#L25-L80); params `L35-L46` |
| Simclusters | 默认true；非缓存、非in_network_only、有互动post seeds | ANN召回后轮转合并去重，最终800；core hydration后丢author=0 | [`sources/simclusters_source.rs:L215-L274`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/sources/simclusters_source.rs#L215-L274) |
| Phoenix | 默认true；非缓存、非in_network_only；普通或bulk-topic请求 | 默认1000 + cold-start max200；需要 retrieval_sequence；普通cluster Experiment1Fou | [`sources/phoenix_source.rs:L34-L70,L105-L146`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/sources/phoenix_source.rs#L34-L70); params `L4-L21,L61-L66` |
| PhoenixTopics | topic非空且不超过6；非缓存、非in_network_only | 单独cluster Experiment2Fou，max引用Phoenix1000，cold0，topic展开和采样模式 | [`sources/phoenix_topics_source.rs:L25-L94`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/sources/phoenix_topics_source.rs#L25-L94) |
| PhoenixMOE | 默认false；非缓存、非in_network_only；排除非bulk topic；SID开关会排他；kill-switch | max默认0、cold200；Experiment2Memy04 | [`sources/phoenix_moe_source.rs:L25-L85`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/sources/phoenix_moe_source.rs#L25-L85)；参数见附录D |
| SID | 默认false；非topic、非缓存、非in_network_only、有互动seeds | 最新去重50个seed，800结果，每seed100，minprefix3、maxprefix0；core hydration | [`sources/sid_source.rs:L46-L110`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/sources/sid_source.rs#L46-L110)；参数见附录D |
| CachedPosts | 仅 has_cached_posts=true | 不重新召回，走缓存候选 | [`sources/cached_posts_source.rs:L9-L17`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/sources/cached_posts_source.rs#L9-L17) |

**特殊开关边界**：PhoenixTopics 的 enable 没检查 EnablePhoenixSource，因此关闭普通 Phoenix 不等于关闭主题 Phoenix。SID 参数打开但无可用seeds时，SID不产出，MOE仍可能因 SID 参数而被禁用；不能把两者理解成完整自动容错。[`phoenix_topics_source.rs:L25-L32`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/sources/phoenix_topics_source.rs#L25-L32)，[`phoenix_moe_source.rs:L25-L35`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/sources/phoenix_moe_source.rs#L25-L35)，[`sid_source.rs:L46-L64`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/sources/sid_source.rs#L46-L64)。

**主题定义**：topic_ids 非空即主题请求，长度 >6 才是 bulk，恰好6仍属于普通主题分支。[`models/query.rs:L265-L270`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/models/query.rs#L265-L270)。

**早期排已见并非总开启**：PhoenixRetrievalExcludeSeenPosts 默认false；开后将 seen+served IDs 及 Bloom 排除项传给检索。没有 Bloom 时再加 impressed IDs。无论该开关是否开启，后面的本地 PreviouslySeen 过滤仍是另一层。[`phoenix_source.rs:L72-L100`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/sources/phoenix_source.rs#L72-L100)。

**召回数不等于保证产出**：quality factor、超时、删除、缓存、排除、索引空缺及后续过滤都会减少数量；多个源重叠时去重；不能把9个上限相加当每次精确评分数。

#### A.2.1 Thunder 的细粒度上限与回复资格

- 常量：普通默认结果1200、视频600、输入following/exclude ID上限10000、每作者原帖50、回复/重发30、视频100、每作者扫描500、posting list5000。[`thunder/config.rs`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/thunder/config.rs)。
- 默认驻留172800秒，即48h；它是 Thunder 内存存储保留配置，不是整个平台所有推荐/搜索/视频的共同寿命。[`thunder/args.rs:L48-L49`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/thunder/args.rs#L48-L49)。
- 请求给出的 per-author 原帖/secondary上限分别被50/30封顶；全局 max_results 为正则使用请求值，并非这里一律强制<=1200。[`thunder/thunder_service.rs:L226-L245`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/thunder/thunder_service.rs#L226-L245)。
- `default`、`recent`、`latest`、空串都走按 created_at 倒序；未知算法也回退此分支。[`thunder_service.rs:L307-L342`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/thunder/thunder_service.rs#L307-L342)。
- 迭代关注作者，排除删除tombstone/已见；对每作者逆序列表扫描上限500；去掉转发“查看者自己原帖”的候选。[`posts/post_store.rs:L156-L225,L288-L367`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/thunder/posts/post_store.rs#L156-L225)。
- 回复原帖可进入secondary；回复另一个回复时，需要该父回复直接回复root，且父回复目标用户被查看者关注。缺少parent时丢弃。视频召回不收普通回复，转发需原帖为非回复视频。上述是Thunder源规则，不等于所有源同一规则。
- 服务另有少数公开账号ID的硬编码排除；这不能推成泛化的政治或身份规则。[`thunder_service.rs:L33-L38,L254-L279`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/thunder/thunder_service.rs#L33-L38)。

#### A.2.2 Simclusters 的检索可见规则

[`home-mixer/sources/simclusters_source.rs:L25-L36,L215-L332`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/sources/simclusters_source.rs#L25-L36)：
- seed来自显式和隐式互动，合并按最新时间排序、post ID去重，只保留<=90天。
- 使用 source `LOG_FAV_LONGEST_L2_EMBEDDING_TWEET`、candidate `LOG_FAV_BASED_TWEET`、model `MODEL_20M_145K_2020`。
- 每seed ANN请求上限200；返回结果再按每seed最多max(10000/seed数,1)裁剪；每cluster最多800、扫描50个cluster、候选最小年龄0、最大年龄默认48h；ANN请求 min_score=0，但最终进入池要求 score>0.5。
- 合并采用轮转+post去重，截800；不是对所有seed分数简单全局取最高。
- 本地缓存TTL600秒、容量2百万；shared cache/ANN服务可失败，部分错误会使整个该源返回Err，因此不保证每次都有800。
- 这些参数描述在线源；embedding训练与索引覆盖另见附录C.5.4，不应把“基于赞的embedding”误写成整个推荐仅训练点赞。

#### A.2.3 PopularPosts 并非单纯按总曝光降序

[`home-mixer/popular_posts_job.rs:L67-L129,L134-L155`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/popular_posts_job.rs#L67-L129)：从热门作者集合取原帖（不含reply/retweet），读取曝光数，做时间修正。默认每作者5、总预算500、窗口24h、半衰8h、年龄floor0.5h。[`util/popular_posts.rs:L36-L85`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/util/popular_posts.rs#L36-L85)。

令 λ=ln2/8，质量值为：views × (1-exp(-λ×24)) / (1-exp(-λ×max(age_hours,0.5)))。先每作者取前5，再全局取500，负年龄和超24h剔除。热门作者集合由另一个作业生成，不能因此认定全平台所有作者均进入这个候选源。列表缓存每60s尝试刷新，源本身没有因列表过旧而强制拒绝的检查，只记录年龄指标。[`util/popular_posts.rs:L7,L182-L195`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/util/popular_posts.rs#L7); [`popular_posts_source.rs:L33-L48`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/sources/popular_posts_source.rs#L33-L48)。

### A.3 打分前21个过滤器：完整接线顺序

以下顺序来自 [`phoenix_candidate_pipeline.rs:L420-L444`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L420-L444)。没有写特殊enable的过滤器按框架默认启用；仍依赖相关字段存在。

| 次序/组件 | 实际规则与边界 | 证据（均在home-mixer/filters/） |
|---|---|---|
| 1 DropDuplicates | 相同tweet_id保留最先源的候选，同时并入其他retrieval_sources；因此注册顺序有意义 | [`drop_duplicates_filter.rs:L19-L28`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/drop_duplicates_filter.rs#L19-L28) |
| 2 ZeroFavCodivert | 默认viewer treatment=false；仅当主served_type和所有记录来源都是zero-fav时，按作者treatment资格过滤。混合来源不一刀切 | [`zero_fav_codivert_filter.rs:L60-L80,L105-L110`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/zero_fav_codivert_filter.rs#L60-L80) |
| 3 CoreData | author_id=0丢弃 | [`core_data_hydration_filter.rs:L13-L16`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/core_data_hydration_filter.rs#L13-L16) |
| 4 NewUserSoftNsfw | 默认false；只限ForYou、非topic、新查看者<7天且scoring seq<100（缺失也视作少）；仅OON且soft=true丢弃 | [`new_user_soft_nsfw_filter.rs:L13-L55`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/new_user_soft_nsfw_filter.rs#L13-L55) |
| 5 Age | Snowflake帖子年龄<=48h，无法解析年龄不保留；检查wrapper tweet ID，不是一定检查被重发原帖年龄 | [`age_filter.rs:L16-L31`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/age_filter.rs#L16-L31) |
| 6 SelfTweet | author_id等于viewer丢弃 | [`self_tweet_filter.rs`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/self_tweet_filter.rs) |
| 7 OONRetweetReply | OON重发丢弃；OON回复默认丢弃，只有EnablePhoenixOonReplies打开且来源属于Phoenix home并满足可选root-only时例外。任何网络类别的reply若ancestors空都丢 | [`oon_retweet_reply_filter.rs:L15-L27`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/oon_retweet_reply_filter.rs#L15-L27) |
| 8 OONNsfwSimclusters | 仅主served_type=Simclusters、OON、nsfw_author=true时丢弃，不是所有源统一成人账户过滤 | [`oon_nsfw_simclusters_filter.rs:L19-L23`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/oon_nsfw_simclusters_filter.rs#L19-L23) |
| 9 RetweetDedup | 以原帖ID（retweet original否则self）去重，先出现保留并并入来源 | [`retweet_deduplication_filter.rs:L19-L33`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/retweet_deduplication_filter.rs#L19-L33) |
| 10 IneligibleSubscription | 设置了subscription_author_id但viewer未订阅其作者时丢弃 | [`ineligible_subscription_filter.rs:L21-L27`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/ineligible_subscription_filter.rs#L21-L27) |
| 11 PreviouslySeen | 自身ID、重发原帖ID、直接回复目标ID任一在seen或Bloom may_contain中即丢。不是任意quote/全部ancestor都查 | [`previously_seen_posts_filter.rs:L24-L30`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/previously_seen_posts_filter.rs#L24-L30); [`util/candidates_util.rs:L13-L17`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/util/candidates_util.rs#L13-L17) |
| 12 PreviouslySeenBackup | impressed_post_ids非空时作相同related ID检查；当前主构造器虽创建了_impressed_posts_hydrator却未注册进query vector，不能默认认为此回填链生效 | [`previously_seen_posts_backup_filter.rs:L15-L26`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/previously_seen_posts_backup_filter.rs#L15-L26); pipeline `L341-L343` |
| 13 PreviouslyServed | 默认所有请求启用；若关该旗标，仍在bottom且不是ForegroundTruncate时启用；检查同上3种related ID | [`previously_served_posts_filter.rs:L14-L30`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/previously_served_posts_filter.rs#L14-L30); params `L1007-L1012` |
| 14 ViewerMutedKeyword | 用户自己配置的muted关键词与candidate文本tokens匹配；不是仓库公开的全站关键词禁词表 | [`viewer_muted_keyword_filter.rs:L28-L55`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/viewer_muted_keyword_filter.rs#L28-L55) |
| 15 AuthorSocialgraph | 静音作者、viewer拉黑作者、作者拉黑viewer、引用作者拉黑viewer、viewer拉黑引用作者、viewer拉黑重发原作者均可丢；缺失bool按false | [`author_socialgraph_filter.rs:L27-L51`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/author_socialgraph_filter.rs#L27-L51) |
| 16 Video | 仅exclude_videos请求启用；正文min video duration或quote video duration存在即丢 | [`video_filter.rs:L8-L24`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/video_filter.rs#L8-L24) |
| 17 TopicIds | 普通主题需命中展开topic，或原始topic+已过滤supertopic；bulk>6用生产topic集合的补集排除，缺topic可放行；显式排除topic时命中任一个丢且缺topic/空topic也丢 | [`topic_ids_filter.rs:L14-L105`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/topic_ids_filter.rs#L14-L105) |
| 18 NewUserMinEngagement | 默认false，只针对新/复活查看者的OON。年龄窗口默认1800s；fav/engagement/view或ratio可选，默认fav、threshold0、非ratio；缺指标一般保留 | [`new_user_min_engagement_filter.rs:L32-L117`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/new_user_min_engagement_filter.rs#L32-L117); params `L839-L893` |
| 19 InventoryHoldout | 默认false，各类别比例0；根据originalpost+viewer稳定哈希按类别抽掉，重发优先于reply分类，比例cap100 | [`inventory_holdout_filter.rs`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/inventory_holdout_filter.rs)；params `L1014-L1037` |
| 20 FavHoldout | 默认false；按fav档位给2%–15%稳定哈希holdout；不是重复请求独立掷硬币，也不是“赞越多越限流”生产事实 | [`fav_holdout_filter.rs`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/fav_holdout_filter.rs); params `L1039-L1044` |
| 21 FairShareRanking | 默认true；缓存/无scoring sequence/kill-switch时不运行。按served_type当前候选数比例分配2800总评分预算，最大余数法补齐；各组取原顺序前N，不是先跑模型再公平取top | [`fair_share_ranking_filter.rs:L11-L109`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/fair_share_ranking_filter.rs#L11-L109) |

FavHoldout 精确阶梯 `(严格大于的fav阈值,百分比)`：10000→15,5000→15,3000→15,2000→14,1500→13,1000→13,750→12,500→11,300→10,200→9,150→8,100→7,75→7,50→6,30→6,20→5,15→5,10→5,7→4,5→4,3→3,2→3,1→2。<=1不抽。边界是严格 `>`，不是 `>=`。

Topic 分类展开表本身在 [`topic_ids_filter.rs:L110-L637`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/topic_ids_filter.rs#L110-L637)，按topic的过滤实验覆盖在 `L645-L692`；这是具体分类ID与父子类别关系，不适合解释成某类政治观点天然加分。Bloom是概率结构，may_contain可能有假阳性；公开此使用方式不等于能知道某位用户某帖是否被误去重。

### A.4 输入特征：模型看什么，与“固定奖励”不是同一个概念

#### A.4.1 用户与请求

[`home-mixer/util/phoenix_request.rs:L84-L158,L185-L195`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/util/phoenix_request.rs#L84-L158)：
- user_id、client app、国家/语言、roles、IP、客户端版本；设备网络、时区、国家等context。
- 年龄段、性别、州、年龄年数、推断性别类别+分数；IP地理经纬/DMA；关注的Grok topics最多32、starter packs最多20；安装应用multihot；近期搜索embedding。
- scoring/retrieval互动序列默认最长各1024，源类型实际默认 **NEW_UUA_ARROW**，无法解析时才回退Arrow；返回格式Arrow，聚合类型默认 DENSE_WITH_LONG_DWELL。300000ms是传给聚合服务的window参数，不能仅凭名字断言“只看最近5分钟全部历史”。[`query_hydrators/scoring_sequence_query_hydrator.rs:L92-L117`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/query_hydrators/scoring_sequence_query_hydrator.rs#L92-L117); [`retrieval_sequence_query_hydrator.rs:L36-L66`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/query_hydrators/retrieval_sequence_query_hydrator.rs#L36-L66); params `L981-L999`。
- Explicit/ImplicitEngagementSignals默认true，每类型15；隐式包括photo expand、普通VQV、immersive VQV，视频时长至少10秒且排promoted。[`implicit_engagement_signals_query_hydrator.rs:L19-L21,L40-L75`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/query_hydrators/implicit_engagement_signals_query_hydrator.rs#L19-L21)及后续insert函数。
- UserContext、IP、安装应用、推断性别默认开；近期搜索默认关；影子请求可另满足门槛。搜索路径输入的是embedding，不是这里逐条把查询文本放入最终特征。每个来源可缺失；功能门槛不是数据必然有值。
- history topics计算默认关闭，窗口默认28天；发送至VM也另有默认false门槛。不能看到相关字段就称全用户都正在运行历史topic重排。

#### A.4.2 帖子与作者

[`models/candidate.rs:L326-L386`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/models/candidate.rs#L326-L386)：
- 原帖/作者ID、重发wrapper/作者、引用/回复目标、关注关系。
- fav/repost/quote/reply/view/bookmark原始计数、语言、媒体/重发/quote/reply布尔值、视频时长。
- 作者是否关注viewer、follower数只在非重发情况下填入；semantic IDs、正文和引用内容特征。
- 内容特征包括视频/最大时长、图片/媒体数、加权文本长度、换行数、has_url；URL按23字符处理并排除附着媒体URL，CJK等字符权重不同。[`models/content_features.rs:L8-L101`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/models/content_features.rs#L8-L101)。**has_url作为输入不等于存在“带外链固定降权倍数”**。
- AUTHOR_NSFW安全bit只有非重发且nsfw_author_phoenix=true时设置。不能从输入bit反推出模型学到的具体惩罚。

#### A.4.3 三个NSFW作者字段不能混淆

[`candidate_hydrators/gizmoduck_hydrator.rs:L124-L149`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_hydrators/gizmoduck_hydrator.rs#L124-L149)：
- `nsfw_author` = nsfw_admin 或 nsfw_user 或账户NSFW_HIGH_PRECISION。
- `nsfw_author_ads` 与 `nsfw_author_phoenix` 在上述基础上再包括POSSIBLY_NSFW_ACCOUNT。
- 前者用于特定Simclusters OON过滤；后两者分别影响广告品牌安全/预测特征，不能说标签在所有环节同等一刀切。

独立的 `NewUserSoftNsfwLabelHydrator` 与该过滤共用新查看者门槛，默认关闭，只获取未已有标签且非自己/已关注作者的候选，已存在标签保留；成功查询但没有SOFT_NSFW标签是false，服务错误不自动变true。[`new_user_soft_nsfw_label_hydrator.rs:L34-L90`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_hydrators/new_user_soft_nsfw_label_hydrator.rs#L34-L90)。

### A.5 预测、价值分与本地/远程差异

#### A.5.1 Phoenix预测不是最终分数

[`scorers/phoenix_scorer.rs:L73-L98`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/phoenix_scorer.rs#L73-L98)：非缓存且ranker kill-switch未开才执行；它的enable并不检查EnableRanking。缺scoring_sequence则返回不带预测的默认更新；请求最多2800候选。预测头是行为发生概率或连续时间预测，不是已发生互动计数。模型训练、隔离mask和所有头另见附录C。

ImmersiveVideoScorer是可选视频carousel专用预测，不直接取代主Phoenix分数；需要carousel启用、非零相关权重和immersive sequence。不能从主源码有视频scorer就认定每页都额外用同一视频模型加权。

#### A.5.2 VMRanker实际会先算本地备用分

[`scorers/vm_ranker.rs:L59-L74,L79-L140`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/vm_ranker.rs#L59-L74)：EnableRanking默认true；先用缓存weighted_score或本地fuse_heads，做作者cold-start决策，然后调用VM。RPC失败直接使用这份本地分；RPC成功但某候选不在响应，也只对该候选保留本地分。

`VMRankerEnableFallback=false` 管的是xDS请求是否回落DNS，不是“关闭本地备用打分”。[`vm_ranker.rs:L25-L56`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/vm_ranker.rs#L25-L56)。

远端请求明确写 `value_model_id="dpp"`、`compute_value_model=true`，所以VM自己的ComputeValueModel默认false并不证明价值模型没被调用。[`scorers/vm_ranker_request.rs:L38-L46`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/vm_ranker_request.rs#L38-L46)。远端仍需要加载到feature config：缺配置则VM value recompute回退，可能保留上游本地分。[`vm-ranker/scoring/value_model.rs:L158-L175`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/value_model.rs#L158-L175)。

#### A.5.3 默认权重表：Home备用与VM不能混成一份

| 预测头/项 | Home本地默认 | VM默认 |
|---|---:|---:|
| favorite | 0.66 | 0.5 |
| reply | 5 | 5 |
| retweet | 1 | 1 |
| photo_expand | 0.05 | 0.05 |
| video_open | 0.02 | 0.07 |
| click | 0.3 | 0.3 |
| open_link | 0.2 | 0.2 |
| profile_click | 0 | 0 |
| VQV | 0 | 0 |
| share | 2 | 2 |
| share_via_dm | 5 | 5 |
| share_via_copy_link | 20 | 20 |
| dwell | 0.05 | 0.05 |
| quote | 5 | 5 |
| quoted_click | 0.05 | 0.05 |
| quoted_vqv | 0 | 0 |
| follow_author | 4 | 4 |
| post_unexplored | 0.015 | 0.02 |
| post_video | 0 | 0 |
| continuous dwell time | 0.006 | 0.004 |
| continuous click dwell time | 0.4 | 0.4 |
| not_interested | -52.272 | -47.52 |
| block_author | -31.2 | -31.2 |
| mute_author | -58.8 | -58.8 |
| report | -234 | -234 |
| not_dwelled | -0.02 | -0.02 |
| video continuation / user video continuation / profile visit seconds | 本地硬设0 | 各默认0 |

证据：[`home-mixer/params/param.rs`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs)（完整逐项行号见附录D.1）；[`home-mixer/scorers/value_model.rs:L8-L50`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/value_model.rs#L8-L50)；[`vm-ranker/params.rs:L3-L156`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L3-L156)。各头概率的分布/校准不同，**不能直接说“一个复制链接=40个赞”**，更不能把预测系数当事后每次互动加分。

#### A.5.4 精确融合与偏移

[`xai-value-model/scoring.rs:L57-L214,L235-L254`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/scoring.rs#L57-L214)：
- 缺失prediction按0；各头经资格条件取值并线性加权；continuation项为video_open概率×条件观看秒数，profile_visit项为profile_click概率×条件停留秒数。
- 未探索post项默认只给IN候选，VM另有默认false的include OON开关。
- 互关boost只有“原创、非reply、非retweet、互关作者”满足。reply权重是在5上**加15成为20**，不是总分×15，也不是所有互关内容固定放大15倍。dwell boost默认0。`inputs.rs:L20-L21`; [`weights.rs:L84-L99`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/weights.rs#L84-L99)。
- 令z为加权净值，N为负权重绝对值之和，T为正普通行为权重与负绝对权重之和。T=0时输出max(z,0)；z<0时输出 `(z+N)/T×0.001`；z>=0时输出 `z+0.001`。这是源码分段规则，不能简单把所有净负分删除。T的helper不把连续时间项/互关boost直接加进常规权重总和。[`weights.rs:L50-L81`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/weights.rs#L50-L81)。
- 本地VQV资格还看viewer粉丝数<10000、视频最短时长>10000ms；quote时长校验默认false。两套调用路径字段并不完全相同，尤其remote候选没有完整viewer/quote视频资格输入，不能未经追踪声称完全等价。remote转换实际上只以视频时长判VQV，quoted_vqv_eligible硬设true；VM侧EnableQuotedVqvDurationCheck虽有参数但此转换不消费它。当前两种VQV权重均默认0。[`home-mixer/util/candidates_util.rs:L19-L44`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/util/candidates_util.rs#L19-L44); [`scorers/vm_ranker_request.rs:L55-L75`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/vm_ranker_request.rs#L55-L75); [`xai-value-model/proto.rs:L76-L95`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/proto.rs#L76-L95)。

#### A.5.5 作者多样性、OON和作者实验

VM默认作者多样性true，decay=.5、floor=.25。按预排序中已有更高位同作者个数k，乘 `(1-floor)×decay^k+floor`，依次为1、0.625、0.4375……趋向0.25。这是同一候选池作者重复的软重排，不是每天发第几条或永久作者信誉惩罚。[`xai-value-model/scoring.rs:L257-L325`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/scoring.rs#L257-L325); [`vm-ranker/params.rs:L169-L186`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L169-L186)。

VM默认OON系数0.75；主题请求0.5；默认还把IN reply/retweet纳入OON再计分范围。Home备用明确关闭作者多样性和IN reply/retweet OON特例。[`vm-ranker/params.rs:L187-L227`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L187-L227); [`home-mixer/scorers/value_model.rs:L45-L49`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/value_model.rs#L45-L49)。

VM有新查看者专用OON=0.00001，但年龄阈值默认0关闭；还要求viewer_following_count>=5。**当前Home请求构建未填该字段，保持protobuf默认0，因此只改年龄参数不能据此认定这一路有效。** [`vm-ranker/scoring/value_model.rs:L122-L145`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/value_model.rs#L122-L145); [`home-mixer/scorers/vm_ranker_request.rs:L38-L46`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/vm_ranker_request.rs#L38-L46)。

默认multiplier_pre_offset=false，即偏移后乘作者/OON因子；若开，则正净值先乘再偏移，负净值不按同式缩放。作者定向exploration bonus默认0，来自AuthorRulesEvaluator，不公开实际作者覆盖。[`xai-value-model/scoring.rs:L337-L408`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/scoring.rs#L337-L408); [`vm-ranker/scoring/value_model.rs:L242-L253`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/value_model.rs#L242-L253)。

权重扰动用按viewer/head确定性的正负号乘exp(±sigma)，sigma默认0。它是实验/探索设施，不等于每次完全随机权重。[`xai-value-model/weights.rs:L102-L109`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/weights.rs#L102-L109)。

#### A.5.6 用户去偏不是默认开启

[`vm-ranker/scoring/debias.rs:L125-L234`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/debias.rs#L125-L234)：UserDebiasEnabled默认false，alpha0、clip logit2、artifact最大年龄3600s；模型未加载、过期、无序列、解析/特征维度不匹配则跳过。对有效概率才修正，最终按alpha在原概率与debiased概率间插值并clamp [1e-7,1-1e-7]。

默认目标列表含fav/reply/quote/retweet/dwelled/not_dwelled/vqv/photo_expand/click/profile_click/bookmark/share/open_link/video_open，是否有对应模型head又是一层条件。完整缓存weighted时通常不重算去偏。[`scoring/value_model.rs:L179-L216`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/value_model.rs#L179-L216)。发送debias输入默认true不等于去偏执行默认true；工件文件与训练值仍不可得。

### A.6 冷启动探索：有条件的单候选提分，不是保证曝光

[`home-mixer/scorers/author_cold_start.rs:L188-L193,L216-L333,L378-L421`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/author_cold_start.rs#L188-L193)：
- EnableViewerColdStart默认true，topic请求关闭。
- 候选必须原创非回复非重发；作者粉丝数已知且<=50000；帖子年龄<=7200s；Home曝光数已知且<200。
- 在当前非零分候选中的位置必须优于`floor(.97×非零候选数)`的末端门槛，不能让任意最差内容无限上升。
- viewer treatment/control默认都false，即holdout；作者cohort规则另影响哪些作者可被这个viewer arm选中。这里的Holdout明确使cold_start_corpus_eligible返回true，不受control/treatment作者桶匹配限制；其他基础资格与总开关仍适用。
- 默认slot范围[15,16)，是0-based第16位分数的目标；候选总数等条件还需满足。提升的是分数到该目标，不是绕过之后所有阶段锁死第16格。
- 默认Thompson sampling开，n=Home曝光×scale1，x=fav裁剪到[0,n]；Beta(.75+x,49.25+n-x)，选采样最好的2个再按原分选一个；参数无效时存在回退。只提升一个合资格候选。
- 冷启动提分后仍过VM作者/OON/DPP、页面重排、VF、会话去重、广告和模块，所以“每个新作者必给200曝光”“所有0赞帖自动进固定流量池”“都保证排第16”都不是代码结论。

### A.7 内容多样性DPP与两类页面重排

#### A.7.1 DPP至少两个开关层

[`vm-ranker/args.rs:L15-L28`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/args.rs#L15-L28) 的部署CLI `dpp_enabled` 默认false，top_k50、theta.5、pool100、embedding维度1024。只有其true才创建DppContext。[`vm-ranker/main.rs:L30-L51`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/main.rs#L30-L51)。

当服务已初始化DPP时，还受请求/FS gate：DppEnabled默认true，主题TopicDppEnabled默认false；config存在时theta默认.65、pool150覆盖CLI相应值。不能只看到params的true就称生产所有请求已启用DPP。没有Params配置时gate helper默认放行，但仍要求DppContext已初始化。[`vm-ranker/scoring/mod.rs:L40-L102`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/mod.rs#L40-L102); `params.rs:L235-L253`。

[`vm-ranker/dpp.rs:L35-L136,L154-L170`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/dpp.rs#L35-L136)：
1. 先按分取最大pool，maxscore floor1e-6；theta clamp。
2. alpha=theta/[2(1-theta)]；quality=exp(alpha×score/maxscore)。
3. kernel对角quality²，非对角为quality_i×quality_j×embedding cosine；greedy Cholesky选高边际行列式的子集，收益很小时提前停；可有预选pin。
4. 选中集合最后仍按原分排序，不用DPP新分当页面次序。
5. 缺embedding使用按ID缓存的随机单位向量，retweet用原帖embedding。[`dpp_model.rs:L43-L50,L80-L85`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/dpp_model.rs#L43-L50)。
6. 未选候选被置score=0，不是从候选vector删除。[`dpp_model.rs:L196-L205`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/dpp_model.rs#L196-L205)。Home TopK没有`score>0`过滤，因此在选中不足或后续重排情况下不能把0分等同于绝对不展示。

#### A.7.2 PageDecode

默认false，pool200、steps64、temperature0、reward head0。Phoenix返回的页面slot picks按slot号排序优先，之后拼接原分降序的未picked候选；将原有降序score集合重新赋给新顺序，而不是重新产生可跨页面比较的校准价值分。没有picks时原分保留。[`home-mixer/scorers/page_decode_rerank_scorer.rs:L81-L110`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/page_decode_rerank_scorer.rs#L81-L110)，相关params见附录D。

#### A.7.3 Page RL exploration

默认false，topk64、温度.2；从score/tau logits做逐步Plackett-Luce抽样，重排后同样重新赋原score集合，记录slot propensity。已有PageDecode picks时跳过，不能说两种在所有请求上叠加。[`page_rl_exploration_scorer.rs:L29-L62,L81-L109,L119-L148`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/page_rl_exploration_scorer.rs#L29-L62)。

### A.8 后置可见性、会话、视频

#### A.8.1 VF动作的消费必须看代码

[`home-mixer/filters/vf_filter.rs`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/vf_filter.rs)：Allow、Interstitial、Avoid、Downrank保留；Drop、Tombstone、NotEvaluated丢弃；缺visibility_action也保留。**此filter遇到Downrank并没有自己乘任何降权系数**。标签如何生成、Rust VF执行哪些rule另见附录B；这里仅确认Home消费者行为。

AncillaryVF按附属内容的丢弃标记过滤；AncestorVideo仅exclude_videos请求且祖先有视频时丢。ConversationDedup以最小ancestor ID或原帖ID分组，保最高分，平分保先出现。[`ancillary_vf_filter.rs`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/ancillary_vf_filter.rs)，[`ancestor_video_filter.rs`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/ancestor_video_filter.rs)，[`dedup_conversation_filter.rs:L19-L48`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/dedup_conversation_filter.rs#L19-L48)。

#### A.8.2 视频carousel不等于普通视频统一加分

默认EnableVideoCarousel=false；实际展示还须ForYou、video_carousel_eligible且非bottom请求。[`util/video_carousel.rs:L13-L18`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/util/video_carousel.rs#L13-L18)。启用后TopK可额外取30个video候选供carousel，普通主流只取前35；carousel从尾部及额外候选选，不把额外标记候选直接灌入主流。默认video_open权重1，其他carousel权重0。

[`filters/video_carousel_filter.rs`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/video_carousel_filter.rs) 与 [`params/param.rs`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs)：
- 非reply、has_video=true、有video_open prediction、竖屏aspect<1；该资格函数没有单独排retweet，不应概括成“仅原创”。[`util/video_carousel.rs:L187-L196`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/util/video_carousel.rs#L187-L196)。
- 默认高风险剔除，medium不剔除；如果启用相应风险过滤但判定缺失，也不直接当安全。
- 与主流及已选视频按media ID/md5去重；默认carousel作者去重、semantic前3层去重、embedding cosine>=.72去重；quote embedding有例外。
- 最多5个，至少3个才构建模块；fatigue默认60分钟，插入目标位置6。
- 当WTF模块出现时，BlenderSelector会让carousel不出现，最终位置还可被之后模块移动。[`selectors/blender_selector.rs:L84-L93,L157-L161`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/selectors/blender_selector.rs#L84-L93)。

### A.9 广告/品牌安全与页面模块如何改变自然排序

#### A.9.1 实际默认不是README所说的partition_organic

AdsSource默认true，但preview请求禁用。请求给外部AdIndex带产品surface、seen IDs、上下文；广告选材/拍卖本身不是这个blender完整实现。[`sources/ads_source.rs:L19-L85`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/sources/ads_source.rs#L19-L85)。

当前 `AdsBlenderType="multi_risk"`。Selector另外支持partition_organic_low_risk、safe_gap、slot_spread、least_movement、time_gap；未知值回退partition，而不是multi_risk。[`params/param.rs:L937-L942`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L937-L942); [`selectors/blender_selector.rs:L61-L79`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/selectors/blender_selector.rs#L61-L79)。

默认multi_risk逻辑，[`ads/multi_risk_blender.rs:L38-L259`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/multi_risk_blender.rs#L38-L259)：
- 无广告或自然帖<5，不混广告。
- 从前4条广告建议位置推断spacing，默认3；不能将“每3条必插广告”当保证。
- 将自然帖划分safe/low、medium、high；safe成对配成广告上下邻居，safe预算受广告数量、spacing容量与floor(safecount/2)共同限制。
- BsrHigh广告可用medium邻居，high风险不允许作为邻居；BsrLow还排low-risk。另检查广告指定排除账号/关键词。
- 可重组 `(上邻帖,广告,下邻帖)` 三元组，再以分数排序的剩余自然帖填缝；最终35总条数**包括广告**。这会移动/截掉自然内容，即使其模型分更高。
- 账号限制可涉及正文作者、重发作者、quote作者和ancestors；关键词检查候选文本token。[`ads/util.rs:L77-L173`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/util.rs#L77-L173)。

备选策略与默认不同：safe_gap找原有安全gap再安置；partition_organic重新组织安全/避免内容；time_gap用预测dwell累计间隔，默认基准4秒、单帖clamp .5–2倍；slot_spread/least_movement共享neighbour eligibility并以位置安排/移动代价优化。这些存在并可被配置选中，但不能混写为所有请求同时执行。[`ads/safe_gap_blender.rs:L25-L45`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/safe_gap_blender.rs#L25-L45); [`partition_organic_blender.rs:L21-L45`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/partition_organic_blender.rs#L21-L45); [`time_gap_blender.rs:L11-L35`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/time_gap_blender.rs#L11-L35); [`slot_spread_blender.rs`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/slot_spread_blender.rs); [`least_movement_blender.rs`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/least_movement_blender.rs)。

#### A.9.2 Brand safety不是同一个“帖子删除”机制

[`candidate_hydrators/ads_brand_safety_vf_hydrator.rs:L110-L187`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_hydrators/ads_brand_safety_vf_hydrator.rs#L110-L187)：查原帖、quote及ancestors标签，取最差判定；主帖读取失败使该candidate hydration Err，附属失败可作medium。作者fallback默认true；未被帖子Grok评分时可用作者品牌安全，缺作者结果保守处理。[`params/param.rs:L951-L956`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L951-L956)。

[`models/brand_safety.rs:L73-L130`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/models/brand_safety.rs#L73-L130)：
- High：NSFW_HIGH_PRECISION、NSFW_HIGH_RECALL、GORE_AND_VIOLENCE_HIGH_PRECISION、PDNA、EGREGIOUS_NSFW、SOFT_NSFW。
- Medium：NSFA_HIGH_PRECISION、NSFA_KEYWORDS_HIGH_PRECISION、NSFW_REPORTED_HEURISTICS、GORE_AND_VIOLENCE_REPORTED_HEURISTICS、NSFW_CARD_IMAGE、DO_NOT_AMPLIFY、MALICIOUS_URL、NSFA_COMMUNITY_NOTE、GROK_NSFA、NSFW_TEXT。
- Low：NSFA_LIMITED_INVENTORY、GROK_NSFA_LIMITED、NSFA_HIGH_RECALL。
- high优先于medium；未被Grok确认为SFA/limited也可medium；要求PTOS review而缺review同样medium；其后才low/safe。
- V2默认false，替换部分Grok/NSFA标签集合；没有任意V2已写标签会回落V1，不能仅开启V2就认定旧标签全部失效。[`brand_safety.rs:L133-L191`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/models/brand_safety.rs#L133-L191)。
- nsfw_author_ads=true直接使品牌安全变HighRisk；变量名含dropped的指标并不意味着这里从自然feed删除帖子。
- 输出到外层时缺brand verdict默认MediumRisk。[`scored_posts_server.rs:L134-L137`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scored_posts_server.rs#L134-L137)。

因此“标签让帖子不能邻接某类广告”和“该帖在推荐中彻底消失”不是同一件事；某些相同标签还会独立命中VF或新用户过滤，必须分路径解释。

#### A.9.3 非帖子模块

Blender顺序：先广告混排，再prompts、WTF、carousel、PushToHome pin、Jetfuel frames、survey。WTF目标第6、prompts起始、survey第12，后续插入会移动位置。[`selectors/blender_selector.rs:L84-L93`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/selectors/blender_selector.rs#L84-L93); [`params/config.rs:L28-L35`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/config.rs#L28-L35)。WTF默认开、fatigue30小时；survey/push/frames有各自资格与外部返回，存在模块源并不保证本次一定出现。

### A.10 缓存、失败与配置会造成“同用户两次不一样”

#### A.10.1 候选缓存

[`query_hydrators/cached_posts_query_hydrator.rs:L11-L80`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/query_hydrators/cached_posts_query_hydrator.rs#L11-L80)：默认EnableCachedPosts=true；key包含user、topic、in_network_only、exclude_videos；300ms Redis读超时；zstd+JSON；缓存条数>=500才设置has_cached_posts。

命中后主召回源及Phoenix预测关闭，而其他过滤/VM/后置安全是否运行由自己的gate决定，不能说“缓存直接原样展示”。许多字段沿用之前hydrated状态，部分检查仍刷新。

[`side_effects/redis_post_candidate_cache_side_effect.rs:L10-L46,L56-L88`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/side_effects/redis_post_candidate_cache_side_effect.rs#L10-L46)：只在prod且非cache-hit后台写；selected与nonselected中weighted_score>0的候选合并，按weighted取最多750，TTL180秒。写gate没有检查EnableCachedPosts读开关；cache-hit不刷新这份TTL。过滤掉的候选不进入该缓存写集合。

#### A.10.2 各种失败不同

- 源失败：失去该源候选；候选可能仍被别源召回。
- CoreData缺失author=0：后续明确丢弃。
- 部分布尔字段缺失：有些filter按false继续；Topic exclusions缺分类反而丢弃。
- Phoenix失败：保留没有新预测的状态，VM可本地融合已有/默认值。
- VM失败或返回漏项：本地备用分仍有机会排序。
- VF hydrate失败返回Err；框架不应用该更新而保留原候选字段。若原来缺visibility_action，VFFilter不会因此丢弃；若已有action则继续按原字段判断。VF显式NotEvaluated会丢，旧Strato映射另有差异。不能用单一fail-open/fail-closed概括。
- 品牌安全缺失：对外默认medium；carousel有独立保守处理。
- 日志/缓存sideeffect失败：一般不回滚已生成页面。

#### A.10.3 生产有效配置不可从仓库默认值完全恢复

Home FS路径 `/usr/local/config/features/home-mixer/main/rust_home_mixer.yml`，decider来自按DATACENTER定位的prod overlay。[`params/config.rs:L1-L10`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/config.rs#L1-L10)。VM可从远端同步配置，进程XAI_FS_OVERRIDES再覆盖，按viewer国家/语言/app/roles/年龄/复活时间/product等匹配；可定向作者规则。[`vm-ranker/main.rs:L59-L96`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/main.rs#L59-L96); [`ranking_config.rs:L55-L102`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/ranking_config.rs#L55-L102)。这些配置路径是运行时依赖，不意味着此仓库包含该生产配置文件。

故“默认false”“某代码没有直接惩罚”都不是“全平台永远不启用/不存在任何模型关联”的证明。

### A.11 其他产品路径不能套用ForYou全链

- **RankedFollowing**：外层主要ScoredPosts+Ads，不注入ForYou所有模块；同一内层通过in_network_only禁用OON源。[`candidate_pipeline/ranked_following_candidate_pipeline.rs:L133-L178`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/ranked_following_candidate_pipeline.rs#L133-L178)。最大38另有独立常量。
- **Following/Latest**：FollowingNightOwlSource → CoreData/ConversationGap/QuoteText → FollowingRetweetDedup、FollowingMutedKeyword、SelfReplyChain → passthrough selector → BlockedBy/VF/AdsSafety → AuthorSocialgraph/VF/AncillaryVF。没有Phoenix/VM scorers。[`reverse_chron_posts_pipeline.rs:L142-L187,L210-L215`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/reverse_chron_posts_pipeline.rs#L142-L187)。外层还有InvalidConversationModuleFilter和FollowingBlender，源包括Ads/WTF/Prompts。[`following_candidate_pipeline.rs:L180-L223`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/following_candidate_pipeline.rs#L180-L223)。默认取帖101、广告top9、feed110、pipeline112各有不同含义。
- **PhoenixScores API**：SeedCandidatesSource，不是全站检索；CoreData与FairShare过滤，PhoenixScorer+PhoenixScoresRankingScorer，passthrough selector，ResultSizeFilter。不把ForYou完整安全/广告链套给这个内部评分接口。[`phoenix_scores_pipeline.rs:L115-L185`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_scores_pipeline.rs#L115-L185)。
- 搜索、主题、视频、rankall索引都还有自己的入口和资格。rankall中的1fav/32fav等是特定索引门槛，另有post_creation、SIDTail等池，不能升级成“全X无赞帖没有曝光”。参见附录C固定行证据。

## 附录 B：可见性、安全标签、执法与媒体详细规则

### B.2 已接上的实际链路

#### B.2.1 Home 的 VF 调用链

1. `PhoenixCandidatePipeline` 的 scorer 列表运行后，使用 `TopKScoreSelector`；随后 `post_selection_hydrators` 注册 `VFCandidateHydrator`。[A：[`home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs:L466–479`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L466-L479)]
2. `EnableXaiVfClient` 决定使用 Rust VF 还是旧 Strato VF。源码注释称已完全迁移，参数默认 `true`，但保留故障回退入口。这是公开默认，不是观察到的实时生产开关。[A/B：[`home-mixer/candidate_hydrators/vf_candidate_hydrator.rs:L58–65`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_hydrators/vf_candidate_hydrator.rs#L58-L65)；`home-mixer/params/param.rs:L1306–1311`]
3. 候选依据 `in_network` 拆成两个批次；祖先和被引用帖子进入关注外批次，被转推原帖进入关注内批次；结果合并时关注内结果覆盖同 ID 的关注外结果。[A：[`home-mixer/candidate_hydrators/vf_candidate_hydrator.rs:L67–110`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_hydrators/vf_candidate_hydrator.rs#L67-L110)]
4. 主帖获得 `visibility_action` / `visibility_reason`；祖先、引用、转推原帖若返回应剔除动作，`drop_ancillary_posts` 可让外层候选被过滤。已标记 tombstone 的祖先被跳过。[A：同文件 `L112–181`]
5. VFFilter 根据返回动作剔除候选，AncillaryVFFilter 根据辅助帖标记剔除候选。[A：[`home-mixer/filters/vf_filter.rs:L8–26`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/vf_filter.rs#L8-L26)；`home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs:L502–508`]
6. Rust VF 的 `FilterTweetsEndpoint` 先解析 safety level 和 viewer，构造 batch，经 `PostEvaluator.run` 评估，再转换为 RPC 结果。[A：[`visibility-filtering/filter_tweets.rs:L37–97`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/filter_tweets.rs#L37-L97)]

**错误处理边界：** 缺失 action 在 VFFilter 本身不会被剔除，而显式 `NotEvaluated` 会；hydrator 对主帖 RPC 错误返回 `Err`，并非把错误直接等同 Allow。[通用 Hydrator.update_all](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/candidate-pipeline/hydrator.rs#L61-L69) 只应用 Ok，所以错误会保留原候选字段；原来没有 action 的候选可能继续通过这一过滤器，已有 action 则仍按原值判断。旧 Strato client 又将返回中的 `NotEvaluated` 映射为 Allow。不能用一句“VF 全部 fail-open”或“全部 fail-closed”概括不同层次。[A：[`home-mixer/filters/vf_filter.rs:L14–26`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/vf_filter.rs#L14-L26)；[`home-mixer/candidate_hydrators/vf_candidate_hydrator.rs:L119–128,L172–181`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_hydrators/vf_candidate_hydrator.rs#L119-L128)；`visibility-filtering-client/vf_client.rs:L183–191`]

#### B.2.2 规则注册与优先级

- 当前规则组织为 `levels.rs`、[`author_rules.rs`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/author_rules.rs)、[`tweet_rules.rs`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs)、`rule_spec/*`，**并不存在 README 多处链接的 `visibility-filtering/rules/registry.rs`**。这是文档与当前目录的差异，审计以实际代码为准。
- Policy 构造时校验规则，再按 action severity 降序稳定排序；普通评估遇到终止决定后停止。规则不是简单“所有命中相加”。[A：[`visibility-filtering/rules/engine.rs:L26–52,L91–138`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/engine.rs#L26-L52)]
- Catalog 明示一个级别先折叠 user 列表，再折叠 post 列表，各列表内按动作优先级折叠，第一项 withholding 决定，媒体/提示/互动各有槽位。[A：[`visibility-filtering/rules/catalog.rs:L69–79`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/catalog.rs#L69-L79)；`visibility-filtering/rules/defaults.rs:L19–36`]
- 规则 audience 包括 Everyone、NonAuthors、NonFollowers、OnlyAuthor。作者能看到的自帖结果与陌生人结果可能不同。[A：[`visibility-filtering/rules/rule_spec/rule.rs:L99–114`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/rule_spec/rule.rs#L99-L114)]
- hydration 缺失还会产生 Complete/Partial 及 `fail_open_defaults`，不能仅看一条规则的布尔表达式判断最终客户端结果。[A：[`visibility-filtering/rules/engine.rs:L140–172`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/engine.rs#L140-L172)]

### B.3 推荐资格：具体规则及范围

#### B.3.1 两个 Home 级别共有

| 机制 | 代码中的条件/动作 | 证据 |
|---|---|---|
| 账号状态 | 封禁、停用、抹除、offboarded 作者对非作者 Drop；受保护账号对非关注者 Drop | [`author_rules.rs:L7–40`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/author_rules.rs#L7-L40)；注册 `levels.rs:L54–60,L296–312` |
| 用户选择 | 登录观看者 block/mute 作者则 Drop；可屏蔽某作者转推 | [`author_rules.rs:L42–65`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/author_rules.rs#L42-L65) |
| 严重帖子标签 | PDNA、BOUNCE、SPAM 对非作者 Drop，紧急标签对 Everyone Drop | [`tweet_rules.rs:L28–60`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L28-L60) |
| FOSNR | hateful conduct、violent speech、abuse、civic integrity 对非作者 Drop | [`tweet_rules.rs:L141–167`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L141-L167)；注册 `levels.rs:L102–107,L306` |
| 非标准帖子状态 | nullcast 条件成立则 Drop；“stale”在此是被新编辑版本替代，不是一般发布时间久 | [`tweet_rules.rs:L215–232`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L215-L232) |
| 法律/地域 | 按请求国家判断合法下架和地方法律下架 | [`tweet_rules.rs:L244–256`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L244-L256) |
| 年龄/登录 | 敏感媒体/文字/卡片在未登录、未成年、特定地区未声明年龄时有 Drop | [`tweet_rules.rs:L294–379`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L294-L379)；复合标签 [`rule_spec/conditions.rs:L6–31`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/rule_spec/conditions.rs#L6-L31) |
| 订阅与圈子 | 独家内容、非订阅者、trusted-friends 等访问资格 | 注册 `levels.rs:L126–131,L310` |
| 敏感媒体呈现 | 有些已关注帖子可留存，但依据观看者设置产生 blur/interstitial | `levels.rs:L133–140,L311`；[`tweet_rules.rs:L456–475`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L456-L475) |

此表路径简写均位于 `visibility-filtering/rules/`。

#### B.3.2 关注外推荐追加的限制

账号层追加：

- nsfw_user / nsfw_admin 旗标；NsfwHighRecall、NsfwHighPrecision、NsfwAvatarImage、NsfwBannerImage、NsfwNearPerfect 标签。[A：[`visibility-filtering/rules/levels.rs:L315–327`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/levels.rs#L315-L327)；`author_rules.rs:L155–202`]
- SpamHighRecall、Compromised、ReadOnly、ImpersonationHighPrecision、AbusiveHighRecall、DoNotAmplify。[A：`levels.rs:L65–72,L328`；[`author_rules.rs:L204–244`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/author_rules.rs#L204-L244)]

帖子层追加：

- DMCA 媒体、媒体地域许可；NSFW 用户/管理员旗标；高精度 gore、NSFW high recall/high precision、NSFW card image；soft NSFW 新用户规则；DoNotAmplify、MaliciousUrl、SpamHighRecall、巴西选举地域标签；FosnrAbuseInsults。[A：`levels.rs:L344–355`；[`tweet_rules.rs:L884–958`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L884-L958)]
- **SoftNsfw 并非所有人、所有场景自动剔除**：必须 `RequestHasSoftNsfwNewUserDrop && ViewerIsNewAccount && TweetHasLabel(SOFT_NSFW)`；开关查询默认 false。[B：[`tweet_rules.rs:L919–928`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L919-L928)；`visibility-filtering/params/client_switches.rs:L121–134`]

**不要跨产品泛化：** AgathaSpamTopUser、EngagementSpammer、BlinkWorst、NotGraduated、DownrankSpamReply 等出现在通知作者规则；DuplicateContent、DuplicateMention、UntrustedUrl 等出现在通知帖子规则，部分要求观看者开启 UQF。它们并不自动等于当前 HomeRecommendations 规则的同名限制。[A：[`visibility-filtering/rules/levels.rs:L81–100,L178–218`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/levels.rs#L81-L100)；`tweet_rules.rs:L971–1020`]

#### B.3.3 动态开关与地区名单

- 国家名单在代码有默认值，同时 `CountryLists.refresh()` 从 feature switches 替换。[B：[`visibility-filtering/params.rs:L76–123`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params.rs#L76-L123)]
- 客户端 capability 对 blur、FOSNR、stale 限制等分别查开关；存在客户端上下文和支持版本差异。[B：[`visibility-filtering/params/client_switches.rs:L12–48,L90–134`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params/client_switches.rs#L12-L48)]
- 特征开关默认路径在部署文件系统 `/usr/local/config/features/visibility/main/rust_vf.yml`，还读取多个外部 YAML；这些实时内容不在本次证据中。[C：[`visibility-filtering/config.rs:L10–19`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/config.rs#L10-L19)；`visibility-filtering/params.rs:L25–36`]

### B.4 反垃圾标签从哪里来

#### B.4.1 Botmaker / Scarecrow：事件 → 规则 → 标签/审核

Scarecrow 注入 `Loader[BotMakerRulesPackage]` 并创建调度器，BotMaker 消费该规则包；可按 flag 排除 transpiled rules。公开 `.bot` 中的 `isActive: true` 和 expiry 说明导出规则状态，不能证明线上该事件正在产生、规则包最新版本、配置开关、限速桶和依赖全部可用。[A/B：[`scarecrow/Module.scala:L46–68,L85–100`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/scarecrow/Module.scala#L46-L68)；`scarecrow/ScarecrowBotMaker.scala:L309–338`]

典型生成链：

| 来源 | 已公开操作 | 不能扩大解释为 |
|---|---|---|
| URL 事件 | 匹配 BAD verdict 后发 SPAM 或 SPAM_HIGH_RECALL，并带作者级排除条件 | 任意外链都受罚 |
| Duplicate text BQ 事件 | 对符合条件的 cluster 发 COPYPASTA_SPAM，设去重标记、限速，排除特定作者和推广卡片 | 所有复用短句必限流；或该标签必定在 Home 直接 Drop |
| Agatha 分数 | 发帖事件可生成 AGATHA_SPAM，通知写事件可生成 AGATHA_SPAM_TOP_USER，带 TTL 与排除条件 | 点赞/举报固定换算成最终排序系数 |
| Grox spamScore 事件 | 满足分数与作者/会话条件后加 RISKY_HIGH_VIZ_REPLY，过期时间 14 天 | 每条此标签在 Home 必乘固定惩罚 |
| gore 媒体事件 | 帖子媒体可标 GORE_AND_VIOLENCE_HIGH_PRECISION；头像/横幅或部分高信誉情形进入人工审核 | 每张“疑似暴力”图都自动封号 |

证据逐项：

- [`botmaker-rules/scarecrow/bot/Tweet_Spam_High_Recall_RTF_All_Bad_URL_Sources.bot:L3–50`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/botmaker-rules/scarecrow/bot/Tweet_Spam_High_Recall_RTF_All_Bad_URL_Sources.bot#L3-L50)。
- [`botmaker-rules/scarecrow/bot/BBQDuplicateTextProd.bot:L3–47,L60–76`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/botmaker-rules/scarecrow/bot/BBQDuplicateTextProd.bot#L3-L47)；[`BBQDuplicateTextRepliesProd.bot:L3–45,L47–61`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/botmaker-rules/scarecrow/bot/BBQDuplicateTextRepliesProd.bot#L3-L45)。
- [`botmaker-rules/scarecrow/bot/AgathaSpamProduction__ApplySearchTopTweetLabel.bot:L3–30`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/botmaker-rules/scarecrow/bot/AgathaSpamProduction__ApplySearchTopTweetLabel.bot#L3-L30)；[`ProductionAgatha__FilterOutOrganicNotifications.bot:L3–38`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/botmaker-rules/scarecrow/bot/ProductionAgatha__FilterOutOrganicNotifications.bot#L3-L38)。
- [`botmaker-rules/scarecrow/bot/GroxTweetProcessor.bot:L3–39`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/botmaker-rules/scarecrow/bot/GroxTweetProcessor.bot#L3-L39)。
- [`botmaker-rules/scarecrow/bot/ViolenceAndGore_ImageModel_MTT.bot:L9–49,L83–106`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/botmaker-rules/scarecrow/bot/ViolenceAndGore_ImageModel_MTT.bot#L9-L49)。

**未公开边界：** 根 README 明示部分 Botmaker 规则未公布，因此列出公开 20 个左右规则文件不能称“全部反垃圾规则”。[C：[`README.md:L440–447`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/README.md#L440-L447)]

#### B.4.2 帖子风险可以聚合成账号风险

两套可见链路并存，不要混成单一固定配额：

1. `NsfwTweetMediaProcessor` 接收 NSFW 媒体事件，根据类别触发 `ApplyNsfwUserLabel`。后者用 HLL 做一天窗口计数，再做 fatigue 控制，最终交 `ApplyNsfwUserLabelOrCreateReport` 决定标账号或送审。[A/B：[`botmaker-rules/scarecrow/bot/NsfwTweetMediaProcessor.bot:L3–38`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/botmaker-rules/scarecrow/bot/NsfwTweetMediaProcessor.bot#L3-L38)；`derived-feature/ApplyNsfwUserLabel.df:L2–51`]
2. 新 `safety-label-user-agg` 在 `Applied` 标签事件到来时读 JSON 规则，抓取作者最新帖子、原始转推帖子标签，并把命中的账号标签写回 Gizmoduck。[A：[`safety-label-user-agg/safetyLabelToUserLevelAggregationV2Processor.strato:L12–29,L56–106`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/safety-label-user-agg/safetyLabelToUserLevelAggregationV2Processor.strato#L12-L29)]
3. 新规则的窗口、最近时间、mediaOnly、any/all 标签、TTL 与排除项均可配置。[A/B：[`safety-label-user-agg/postToUserLabelRules.strato:L11–43,L119–138,L266–318`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/safety-label-user-agg/postToUserLabelRules.strato#L11-L43)]
4. 重要静态默认：`POSSIBLY_NSFW_ACCOUNT` 的窗口为 10，但最小匹配数为 11，因此默认条件不可满足；另一个 `NSFW_HIGH_PRECISION` 默认是最近 5 条中 3 条命中、最大 60 天、TTL 7 天。这些默认可被 `safety_understanding_post_to_user_label_rules` 替换，不能声称生产一定采用此配额。[B：同文件 `L360–432`]
5. 旧 NSFW 账号标注逻辑检查最近人工移除记录、可能误报、高信誉/灰标/金标/临时排除名单，可送人工审核、设置不同 TTL 或跳过。[A/B：[`botmaker-rules/scarecrow/derived-feature/ApplyNsfwUserLabelOrCreateReport.df:L2–81`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/botmaker-rules/scarecrow/derived-feature/ApplyNsfwUserLabelOrCreateReport.df#L2-L81)]

#### B.4.3 标签不是永久且不是全都一样

- SafetyLabelSource 本地缓存 TTL 为 10 秒，读出时逐条丢弃已过期标签。[A：[`safety-label-source/source.rs:L12,L34–49,L115–147`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/safety-label-source/source.rs#L12)]
- 原始 label 能带 score、适用用户、holdback、来源、创建/过期时间、适用国家；当前 VF 的 `SafetyLabelMap` 聚焦 type、部分 agent 来源和少数 source 字段。不能看到底层字段存在就断言每条 Home 规则都读取该字段。[A：[`safety-label-source/decode.rs:L67–105`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/safety-label-source/decode.rs#L67-L105)；`visibility-filtering/models/safety_labels.rs:L6–21,L46–80`]

### B.6 执法服务：模型结果还需经过防误伤控制

#### B.6.1 输入标签到动作

AES 支持 suspend（临时/永久）、用户标签、帖子标签、Arkose、Captcha、SpamLivenessCheck；动作有不同 dedup class。[A：[`abuse-enforcement-service/service-lib/src/decision.rs:L1–40`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/decision.rs#L1-L40)]

- 用户规则可把 `bb1_*_bounce` 变成 SpamHighRecall 加 liveness challenge；`llm_slop_user` 变成短期 SpamHighRecall；不同 label 指向不同动作。[A：[`service-lib/rules/enforcement_user.yaml:L36–142`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/rules/enforcement_user.yaml#L36-L142)]
- 帖子规则可将 `llm_slop_post` 标 RiskyHighVizReply，将 `gibberish_post` / `fast_reply_spam_post` 标 SpamHighRecall；没有 actionable label 的帖子最终 skip。[A：[`service-lib/rules/enforcement_post.yaml:L39–82`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/rules/enforcement_post.yaml#L39-L82)]
- 用户 YAML 最后一条是 fallback suspend，但它不是“全 X 用户默认封禁”。它只处于服务已经接收并路由的执法消息处理内，还受下面各层控制。[A：[`service-lib/rules/enforcement_user.yaml:L184–189`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/rules/enforcement_user.yaml#L184-L189)；`service-lib/src/lib.rs:L353–419,L525–614`]

以上省略前缀为 `abuse-enforcement-service/`。

#### B.6.2 公开可追的控制链

1. `run_enforcement_inner` 确认目标实体、global dry run / record-only，跳过测试账号；页面未读取规则且没有动作时 skip。[A：[`abuse-enforcement-service/service-lib/src/lib.rs:L353–419`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/lib.rs#L353-L419)]
2. 获取白名单和账号事实；规则从动态配置/YAML cache 解析。页面控制路径和 YAML 路径分别决定动作，安全检查或规则解释报错时 skip。[A：同文件 `L421–430,L525–614`]
3. 可跳过已贴相同标签、已封禁/停用账号，剔除冗余 suspend 动作。[A：同文件 `L628–706`]
4. 在执行之前应用 overturn hold，阻止申诉已撤销的 suspend，或从动作集合剔除受保护标签。[A：同文件 `L709–765`]
5. 比较动作 dedup class，然后执行 off-switch、head guard、rate cap 等 final checks，最终才调用 AIS 动作接口。[A：同文件 `L767–865,L966–1064`]
6. 规则可由 GrowthBook 动态覆盖，错误/空覆盖落回 last-good。仅阅读仓库 YAML 不足以确定线上即时规则。[B/C：[`abuse-enforcement-service/service-lib/src/rules.rs:L590–635,L644–699`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/rules.rs#L590-L635)]

#### B.6.3 必须显式标记的未知与占位

- YAML 中 `cred.follower_count >= 12.34`、`cred.score >= 12.34` 的注释明确说生产采用不同阈值，这是防 gaming mock。[C：[`abuse-enforcement-service/service-lib/rules/enforcement_user.yaml:L19–33`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/rules/enforcement_user.yaml#L19-L33)；`enforcement_post.yaml:L23–37`]
- [`safety_checks.rs`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/safety_checks.rs) 同步持有这些表达式，另有异常占位式 follower ceiling 12345.67；不应把数字从源代码抄成真实平台准则。[C/B：`abuse-enforcement-service/service-lib/src/safety_checks.rs:L19–68,L158–175`]
- overturn hold 有 Off/Shadow/Enforce，默认 Off；查询错误可 Allow 或 Skip，默认 Allow。不能把“存在 hold 功能”写成“生产所有申诉都被同样保护”。[B：[`abuse-enforcement-service/service-lib/src/overturn_hold.rs:L50–99,L138–161`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/overturn_hold.rs#L50-L99)]
- `abuse-ledger-service` 是 hold 的读侧：仅查询未 cleared 且 expires_at>now 的记录，按 suspend/指定 label 过滤。申诉处理系统如何创建记录、各 queue 实际期限不由这几条 SQL 证明。[A/C：[`abuse-ledger-service/src/sql.rs:L3–13`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-ledger-service/src/sql.rs#L3-L13)]

### B.7 媒体与 Grox：分类、写标签和展示的三层区别

#### B.7.1 CLIP、adult-content、pnsfwmedia

- CLIP 同时编码图像与文本，可归一化输出；训练使用图像→文字与文字→图像交叉熵平均的对比目标。默认输出维度 256。[A：[`clip/model.py:L160–223`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/clip/model.py#L160-L223)；[`clip/training.py:L122–170`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/clip/training.py#L122-L170)；`clip/config.py:L5–16`]
- [`clip/model.py`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/clip/model.py) 的预训练和 Twitter 权重 URL 是 `example.invalid`，不能当有效权重下载地址。[C：`clip/model.py:L34–47`]
- adult-content 从 embedding 经 BatchNorm、GELU dense、sigmoid 输出概率，二元交叉熵训练；calibration 使用单调 isotonic regression，并输出 precision/recall/FPR 等不同统计量。[A：[`adult-content/training.py:L13–42`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/adult-content/training.py#L13-L42)；`adult-content/calibration.py:L12–35,L61–88`]
- pnsfwmedia 冻结图像 CLIP 子模型，将图像分数、Agatha 校准 NSFW 分数、文本账号 NSFW 分数、NSFW consumer follower 分数、log 粉丝数及缺失值标记拼接，再分类。[A：[`pnsfwmedia/model_experimental.py:L17–26,L44–92`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/pnsfwmedia/model_experimental.py#L17-L26)]
- **这只能证明实验模型结构**。文件名就是 [`model_experimental.py`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/pnsfwmedia/model_experimental.py)，模型数据路径与 trained model 也由外部给定；本次没有追到它以该权重版本直接被 media-model-proxy 某一生产 endpoint 使用。[C：同文件 `L136–173,L191–204`]

#### B.7.2 media-model-proxy

注册表包括 CategoryClassification、CategoryClassificationEmbeddings、Fingerprinting v1/v2、HatefulSymbolRecognition、ViolenceAndGore、XxNsfw。[A：[`media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/model_descriptors/ModelDescriptorRegistry.scala:L7–27`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/model_descriptors/ModelDescriptorRegistry.scala#L7-L27)]

- `ModelsModule` 按 descriptor 建客户端；`ModelsService` 只调用可用 client，并过滤返回错误。[A：同目录 [`modules/ModelsModule.scala:L17–45`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/modules/ModelsModule.scala#L17-L45)；`services/ModelsService.scala:L38–102`]
- XxNsfw 支持图片、视频、直播和 GIF，输出 probability、score、precision、recall、fpr，并请求 Deepbird 后端；这些字段含义不同。[A：[`model_descriptors/XXNsfwModelDescriptor.scala:L29–43,L76–84`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/model_descriptors/XXNsfwModelDescriptor.scala#L29-L43)]
- decider 文件存在模型禁用、负载丢弃、GIF、dummy embeddings、dark traffic 等开关，默认值不是实时线上证明。[B：[`media-model-proxy/config/decider.yml:L1–59`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/media-model-proxy/config/decider.yml#L1-L59)]
- 注册表、预测接口、部分训练代码齐全，不意味着知道每种图片的精确分数、误判率或线上训练权重。

#### B.7.3 Grox 的 PTOS 与回复垃圾链

PTOS Plan 实际注册了：filter → rate limit → 去重 → media hydration → 类别检测 → 政策检测 → safemodel → adult cross-validation → 结果 sink。[A：[`grox/flows/ptos/plan_safety_ptos.py:L22–55`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/flows/ptos/plan_safety_ptos.py#L22-L55)]

在 sink 中能继续追到：

- violent media 且实际有媒体 → GoreAndViolenceHighPrecision；hard adult → NsfwHighRecall，有媒体再加 NsfwHighPrecision；soft adult → SoftNsfw。[A：[`grox/flows/ptos/task_write_safety_post_annotations_result_sink.py:L204–231`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/flows/ptos/task_write_safety_post_annotations_result_sink.py#L204-L231)]
- spam engagement baiting/farming/card manipulation → SpamHighRecall；其他一般 spam 视 high-page-rank/灰标判断；这说明“高信誉豁免”是有条件、分类型的。[A：同文件 `L188–248`]
- 定向侮辱仅在此路径的英语内容且不属高信誉用户时加 FosnrAbuseInsults；自伤鼓励/描绘有 bounce 路径，自伤表达意愿有支持消息路径，儿童性剥削有 suspend 接口；**这些只说明调用分支，具体模型分类条件不公开**。[A/C：同文件 `L258–307`]
- PTOS reviewed 标记、safemodel 独立成人检测补充标签、已有结果合并、删除标签接口调用和结果存储均可读到。[A：同文件 `L309–314,L383–485`]
- sink 受 `DisableTaskForNonPtosProd` 控制。配置还依赖未提供的 `grox.config.env`、环境 YAML 与 Strato 后端，故不能声称所有注册计划都全量线上运行。[B/C：[`grox/flows/ptos/task_write_safety_post_annotations_result_sink.py:L48–63`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/flows/ptos/task_write_safety_post_annotations_result_sink.py#L48-L63)；[`grox/flows/ptos/disable_rules.py:L1–11`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/flows/ptos/disable_rules.py#L1-L11)；`grox/config/config.py:L7,L25–37,L225–234`]
- 回复垃圾 sink 可以把 0 分回复写为 RiskyHighVizReply，另写 reply-ranking score；高信誉/灰标/测试账号有不同处理。回复排名消费者与 Home 不能直接视为同一个产品。[A：[`grox/flows/reply_spam/task_write.py:L39–80,L124–148`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/flows/reply_spam/task_write.py#L39-L80)；`plan_multi_step_reply_spam.py:L11–29`]

**最关键黑箱：** 模板加载器访问 `.j2` 政策 prompt，代码明确说 prompts 被排除。读取函数名和模型名称只能理解流程，不能复原 LLM 的完整评判规则；环境 YAML、endpoint、权重及流量选择也不在此次验证范围。[C：[`grox/flows/ptos/prompts.py:L4–31`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/flows/ptos/prompts.py#L4-L31)；`README.md:L440–447`；`grox/config/config.py:L25–37`]

### B.8 法律下架与可见性

- TweetEntityService 在 hasTakedown 条件下合并帖子的 takedown reasons 与作者账号 reasons。[A：[`takedowns/tweet-entity-service/TakedownReasonsTransform.scala:L19–34,L52–72`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/takedowns/tweet-entity-service/TakedownReasonsTransform.scala#L19-L34)]
- Gizmoduck 在特定 read gate 开启时会过滤未执行的 takedown 项，区分全球代码与类型。[B：[`takedowns/gizmoduck/RedactUnenforcedTakedownsFilter.scala:L26–48,L64–80`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/takedowns/gizmoduck/RedactUnenforcedTakedownsFilter.scala#L26-L48)]
- VF 的最终国家判断区分 worldwide 代码、LegalRequest、DMCA、BystanderReport 和请求国家；媒体 allow/deny 国家列表又是另一条判断。[A：[`visibility-filtering/models/tweet.rs:L74–138`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/models/tweet.rs#L74-L138)]
- 这是**具体内容合规限制机制**，不是本报告提供法律建议，也不能据某个标签认定账号触犯法律。

## 附录 C：模型、离线链路、入池与透明度详细规则

### C.3 Phoenix：模型、训练和内容理解

#### C.3.1 排序模型到底在学什么

- Phoenix排序器从用户近期行为、候选帖/作者表示及上下文预测多个动作；它不是一个直接手写“优质帖分”。离散动作训练是带padding/loss mask和可选样本权重的多标签sigmoid BCE，连续停留时长有独立损失头。
- `home_direct_packed` 基础配置为历史1022、候选64、8层、hidden2560、20个Q头/4个KV头。这里只是该配置，不是所有服务、所有用户请求的固定长度承诺。
- 配置启用语义ID、IP表示、国家/语言/位置/年龄/性别、产品面、帖龄、时区、停留、双向关注关系和互动计数等输入。**输入存在不代表某特征具有固定正负系数，更不证明对某人群必定增降权。** 对某变量的效果取决于未公布的训练权重、其余输入及调用者。
- `multimodal_embedding_type=None` 不能误读为完全不理解内容：同一配置 `use_post_sid=True`，SID由内容多模态表示量化而来。反过来，也不能声称每次排序直接把帖子全文图片喂给GroK生成一个判断。

证据：[配置和特征](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/xrecsys.py#L263-L331)、[多标签损失](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/loss_recsys.py#L16-L55)。

#### C.3.2 候选隔离不等于最终名次不受其他候选影响

`history_candidate_mask` 只允许历史/候选看历史，候选之间只有自身对角线：这是模型注意力层面的隔离。实际模型概率可以稳定缓存，但随后TopK、作者多样性、DPP和广告混排仍会取决于同批其他候选。不能把README“batch-invariant scores”扩大成“整条信息流最终名次独立于竞争帖”。

证据：[注意力mask](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/pallas/ranker_attention_utils.py#L16-L56)、[分发重排实现目录](https://github.com/xai-org/x-algorithm/tree/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker)。本次读取了mask和调用配置，没有对所有Pallas/CUDA/CuTe实现作数值等价验证。

#### C.3.3 检索并非只能用“点赞”目标解释

- 二塔把用户历史压成用户向量、把候选表示成可预建索引的向量；训练采用批内与全局负样本，采样频率可用于log-Q修正。
- 默认类中仍有点赞正样本路径，但**combined配置有 `home / immersive / ld` 三头**。home使用Favorite；immersive还可使用Reply、Quote、Retweet、QualityView、Follow、Bookmark、Share；ld使用 `CLIENT_TWEET_RECAP_DWELLED`，其配置 `w_ld=0.75`，`w_fav`类默认1.0。实际服务可传入query head weights覆盖。
- 所以“检索只学点赞”已不足以描述当前公开配置；同时也不能把`.75`写成“读完一条帖抵0.75个赞”。这是检索头输出的组合权重，不是互动数量兑换率，更不是Home最终价值分权重。
- 候选SID为6层、每层256码的配置，不是“每个帖随机hash即全部语义”。不同retrieval配置的hash/SID/用户特征开关不同，nano也不等同生产几何。

证据：[combined三头配置](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/xrecsys_two_tower.py#L251-L349)、[loss与log-Q](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_two_tower_model.py#L1124-L1164)、[服务端选择头权重](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_two_tower_model.py#L2293-L2300)、[head定义](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_two_tower_model.py#L2897-L2967)。

#### C.3.4 停留时长训练与线上价值分要分开

当前home基础配置将传统Tweedie/MAE损失权重设为0，CREAD与immersive CREAD各0.1，click-dwell二分类1.0。CREAD对多个时长阈值做BCE分类，再加恢复原始时长的损失，支持Huber与sentinel屏蔽。这里的0.1/1.0是**训练损失权重**，不是信息流最终的停留时长评分系数，也不证明用户读越久在任何情境都必定越排前。

证据：[训练权重](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/xrecsys.py#L281-L285)、[CREAD实现](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/loss_recsys.py#L128-L187)、[连续目标接线](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/xrecsys.py#L801-L856)。

#### C.3.5 训练公开程度与复现条件

- Phoenix已经不是早期Grok-1示例移植。仓库自述当前导出生产模型定义与Rust服务引擎，并提供单机nano/合成数据训练路径。
- 旗舰排序及nano使用公开Muon配方；另外一组旧slot和检索配置的公开版使用标准Optax AdamW，文档明确生产内部对应的是调优RMS-normalized-Adam变体。应记录这一真实差别，不能写“全部训练配方完全一致”。
- 稀疏embedding用独立rowwise AdaGrad；非有限梯度可跳过更新。nano训练损失降低只验证机械链路，不证明推荐质量、收敛、生产吞吐或真实账号效果。
- [`reference/world.py`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/reference/world.py) / dump生成器构造合成世界；MM默认合成向量，SID可以从合成世界训练量化码。[`mm_encoder.py`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/reference/mm_encoder.py)提供真实算法移植路径，需另备公开Qwen embedding权重或对应服务；它不是训练所得X生产checkpoint。
- SID训练/分配的算法代码已经公开，因此不能笼统说“所有内容向量算法都缺失”。真正缺的是生产权重、训练数据/码本/快照及实时输入。

证据：[TRAINING完整说明](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/TRAINING.md)、[reference组件真实/合成映射](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/reference/README.md)、[SID算法](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/reference/sid_codebook.py#L143-L227)、[有效梯度判断](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/reference/train_step.py#L93-L98)。

### C.4 候选入池：Phoenix Rankall与Strato

#### C.4.1 先有候选资格，才有排序机会

[`phoenixRankAllCandidateProcessor.strato`](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix-rankall-strato/columns/phoenix_rank_all/phoenixRankAllCandidateProcessor.strato) 按事件和内容走不同索引：

- Fav事件、非社区/非转帖先可进入 `search_unfiltered`，发生在普通VF判断之前。名字表示候选池处理，不意味着最终搜索页面免除安全过滤。
- 后续普通候选先判断社区、回复、转帖、VF drop与成人标签。回复走 `1fav_reply/32fav_reply`；self-reply在该回复索引路径跳过。不能推成“全X不分发自回复”，因为这里只是一条召回索引路径。
- 合格Fav可入 `1fav`、backup、topic、`32fav`及视频相关池；合格PostCreation可直接入 `post_creation`，视频另有video池。所以**“全X必须先有1赞/32赞才有曝光”是错误的全局化。**
- 成人视频可进入专用 `nsfw_video` 池；Evergreen、广告等事件还有分开的分支。存在这个池不代表成人内容被普通For You无条件允许。
- `shouldDropPostByVF` 自身还受decider决定调用Rust VF或旧服务，不能只看一个被调用函数就当唯一生产实现。

证据：[候选分流完整条件](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix-rankall-strato/columns/phoenix_rank_all/phoenixRankAllCandidateProcessor.strato#L430-L530)、[VF客户端分支](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix-rankall-strato/lib/eventProcessing.strato#L260-L286)。

#### C.4.2 时间窗和小作者池都不能泛化成全局准则

- Rankall的Main/SID/Topic等pipeline分别持有多个时间窗：post_creation 24小时、1fav 24/48小时、部分视频多日、Evergreen多年。普通Home还有自己的帖龄过滤。因此“48小时以后X一律不推”与“只要视频可存5年就能持续入普通Home”都不成立。
- `SidTail` 默认只收作者粉丝数 `<1000`，`TAIL_MIN_FAV_COUNT=0`。这一支使小作者内容可进入独立tail池，不是所有小作者全局乘某一boost，也不代表1000粉丝以下必保量。
- SID查不到时，处理器可以保存空SID等待backfill；这是数据延迟恢复逻辑，不是帖必然永久被过滤。
- 外部黑名单的内容、实际索引快照及客户端请求哪些池仍是完整性边界。

证据：[tail默认](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix-rankall/src/config/mod.rs#L119-L123)、[各池时间窗](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix-rankall/src/config/mod.rs#L184-L239)、[tail过滤](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix-rankall/src/processor/sid_tail_processor.rs#L72-L109)、[SID空结果保留](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix-rankall/src/processor/sid_processor.rs#L94-L113)。

### C.5 信誉、行为检测和离线图算法

#### C.5.1 UserCredV2：不是粉丝数评分，也不是每次互动等量加分

1. 从有效账号、关注图、最近7天Favorite/Retweet建立输入；忽略受限、停用、封禁、擦除账号。剔除内部调查数据中关联账号之间的边；自己给自己的互动也不计入这条互动边。
2. 初次质量均匀初始化；后续可用上个快照warm start。
3. Teleport分布混合两路：非near-zero且Premium/认证类账号的均匀先验，以及按互动发起者此前mass及其对目标的互动占比分配的权重。默认beta0.5。**不是所有用户的均匀先验，也不是固定“蓝标排名乘2”。**
4. 图上mass按出边均分，默认jump概率0.2，缺失/悬挂质量依teleport重新分配。near-zero账号不作为活跃出边来源，但仍可接收质量。
5. 输出score为 `clamp(165.2 + 7.07 * ln(mass), 0, 100)`，非正mass给0。maxIterations默认50、收敛差阈值0.001。
6. 产出前核查快照行数、Vit数量、总mass等，异常隔离而不是正常发布，除非显式skipGate。

这是账号侧图信誉模型。要说明对某条帖如何影响，必须继续追踪读取该score的规则/特征与其场景，不能直接将score加到Home价值分；也不能把它和老版TweepCred算法常见传言混用。

证据：[输入与关联账号边剔除](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/user-cred-v2/UserCredV2App.scala#L88-L134)、[teleport](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/user-cred-v2/UserCredV2App.scala#L154-L199)、[PageRank传播](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/user-cred-v2/UserCredV2App.scala#L285-L391)、[分数映射](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/user-cred-v2/UserCredV2.scala#L10-L20)、[参数](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/user-cred-v2/UserCredV2Config.scala#L24-L49)、[Premium定义/有效账号](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/user-cred-v2/ValidUserInfo.scala#L14-L43)。

#### C.5.2 Agatha：比率标签、图特征与PMI，而非按举报条数直接扣排名

- RateBasedLabels构造Blocks/Reports/SpamReports相对fav的平滑标签。公式是 `(interaction+0.1)/(interaction+favs+0.1/prior)`，不是裸`reports/likes`。
- fav样本是不同账号对作者的去重对，并排除双方任意方向存在关注的关系；不是所有帖总赞数。负反馈也有来源过滤和去重，每个来源默认reservoir sample最多100个目标。先验统计会把每个账号总量cap到1000以免过大账号支配。
- 常规标签抽取窗口30天，abuse reports读取180天；特征活动读取21天、预测配置14天。**不能全归为一个统一“30天账号信誉窗口”。**
- 模型构造与预测通过PMI，预测采用leave-one-out以避免自身标签泄漏，再聚合present moments形成多组特征。公开的预测job标签集有reports、两种spam reports、spam suspended、NSFW，并不是一个单一可手算“信誉分”。
- `BlocksPerFav`生成器存在，不等于当前RateBasedBuildJob或AgathaFeaturesPredictJob一定把它列为训练/预测标签。后两者的实际labelNames集合不含BlocksPerFav，要按接线描述。

证据：[平滑和各窗口](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/agatha/scalding/labels/rate_based_labels/RateBasedLabels.scala#L24-L119)、[点赞来源定义](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/agatha/scalding/labels/favs/Favs.scala#L15-L67)、[去重规模/先验cap](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/agatha/scalding/labels/LabelUtil.scala#L12-L44)、[PMI预测](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/agatha/hub/agatha/predict/Predict.scala#L17-L54)、[当前预测标签和moments](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/agatha/scalding/AgathaFeaturesPredictJob.scala#L26-L85)、[当前RateBased标签集](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/agatha/scalding/RateBasedBuildJob.scala#L22-L29)。

#### C.5.3 BDSM：行为序列检测的公开结构真实，具体操作点未知

- Transformer backbone用时间戳驱动RoPE，输入动作、产品面、停留、设备/网络、目标hash和行为统计。模型不是只看“发帖频率”或“是不是机器人API”的简单判定。
- 8个头：FollowBot、LikeBot、EngagementAmplifier、ReplySpamBot、TweetSpamBot、RTBot、MultiActionBot、LegitimateUser。可同时产生多个分数，不是8选1硬分类。
- Head训练读取缓存的CLS embedding，用label mask、label smoothing、BCE、reverse-CE和focal weighting。仓库有head训练程序，没有随树提供完整backbone自监督预训练流水线或已训权重。
- 评分流水线含Kafka事件累积、Redis缓存/冷却/去重、序列抽取、GPU评分、结果sink。单一输入特征不能被解释为确定处罚因果；分类得分、政策门槛、豁免、冷却和实际执法动作是不同层。
- README写到npz+MANIFEST权重格式，但当前Git清单没有任何对应权重文件。应报告“加载/校验格式可见，实际产物未提供”，不可声称已下载或验证权重。

证据：[时间RoPE](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/bdsm/runtime/model.py#L62-L80)、[输入](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/bdsm/runtime/model.py#L118-L223)、[训练损失](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/bdsm/runtime/loss.py#L7-L50)、[权重读取与hash校验](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/bdsm/runtime/load_backbone.py#L9-L39)、[head训练](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/bdsm/training/train_head.py)。

#### C.5.4 SimClusters：至少三层，不能只读在线余弦排序

1. **KnownFor**：从关注相似图筛选活跃作者并更新社区归属，公开job默认最少400活跃粉丝、top20M、最多400邻居，使用SBF算法依赖。此门槛用于一个离线聚类job的种子选择，**不是所有作者进入For You必须400粉丝**。
2. **InterestedIn**：用户关注/fav加权邻居乘KnownFor，聚合社区权重；使用不同social proof去重门槛，再做归一化及TopK。生产类默认socialProof=2、最多50簇；adhoc路径可用另一默认20。不能把adhoc常量贴成线上统一值。
3. **帖向量与簇内倒排**：TweetJob从非自赞且不过老的ServerTweetFav事件出发，读取点赞者兴趣，把分数累计到帖/簇，并维护TopK缓存。Configs中此类分数为8小时半衰期；用户图fav权重另有100天半衰期。不同数据流的时间常数不能合并成“X算法统一8小时衰减”。
4. **在线ANN**：用户兴趣向量对簇中候选作相似检索，再交Home统一排序；这一步的相似度不是最后信息流价值分。在线默认和过滤见附录A。

仓库还包含主题、实体、相似用户、topic-recommendation、abuse特征、Ads/Twhin等周边产物。不应仅因源码在同目录就声称这些分支全部被当前For You使用；必须找到当前调用者。

证据：[KnownFor job默认](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/simclusters/simclusters_v2/scalding/update_known_for/UpdateKnownFor20M145K2020.scala#L52-L91)、[SBF依赖与调用](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/simclusters/simclusters_v2/scalding/update_known_for/UpdateKnownForSBFRunner.scala#L3-L9)、[兴趣job默认](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/simclusters/simclusters_v2/scalding/InterestedInFromKnownFor.scala#L56-L78)、[兴趣生成公式/去重](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/simclusters/simclusters_v2/scalding/InterestedInFromKnownFor.scala#L230-L290)、[帖事件累积](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/simclusters/simclusters_v2/summingbird/storm/TweetJob.scala#L64-L137)、[流式缓存配置](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/simclusters/simclusters_v2/summingbird/common/Configs.scala#L39-L77)。

### C.6 搜索、广告、视频、透明度的适用边界

| 产品面 | 此仓库确实有的材料 | 当前能下的结论 |
|---|---|---|
| For You | Home接线、候选、排序、过滤、混排和标签生产大部分核心 | 可对这份快照的公开路径作较完整结构解释；仍不可还原真实请求的实时配置/模型输出 |
| Following / RankedFollowing | Home入口与相关pipeline | 可审特定入口；不可把普通For You参数不加区分地套用 |
| Search | `xrecsys_search`配置、搜索相关特征、`search_unfiltered`入池、VF部分搜索场景 | **不是完全没有搜索代码**，但没有全站搜索从解析、索引、召回、检索排序、混排到生产配置的完整可复现链路 |
| 广告 | Home广告混排、相关预测头、部分Ads/Twhin/索引分支 | 不等于广告竞价、预算、定向和全部广告排序公开；不得用自然帖分数预测广告投放回报 |
| 视频/沉浸式 | immersive/evergreen/nsfw候选池和模型配置 | 说明共享模型支持这些场景；不能说普通Home允许所有同池内容 |
| 回复 | 回复特征/模型与reply池、对话相关过滤 | 不等于全部Conversation排序产品的完整链路 |
| 通知 | VF通知过滤/客户端 | 看到安全过滤不代表通知生成与排序算法已完整开源 |
| Under the Hood | 标签聚合批任务、服务和页面 | 可解释标签透明度，但不是对每次曝光/每个排名完整因果解释 |

搜索证据：[明确的搜索模型配置](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/xrecsys.py#L558-L594)、[search_unfiltered分流](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix-rankall-strato/columns/phoenix_rank_all/phoenixRankAllCandidateProcessor.strato#L473-L480)。

#### C.6.1 补充核查：Grox内容向量不止一个版本

- `PlanPostEmbeddingV5`、`PlanPostEmbeddingV82`、`PlanPostEmbeddingV8Search`分别注册不同plan，基本链路是限速 → 媒体补全 → ASR → embedding → 存储/消息发布。不能把V5公开参考程序当成当前所有流量唯一内容编码器。
- V5实现拼接文本、图片、可选转写结果，经embedding后截到1024维并L2归一化。V82和search使用另一些renderer和配置后端。
- 写入sink按 `v5_1`、`v8_2` 等版本键存入Manhattan；部分主帖plan对回复跳过某条Kafka发布，但仍写Manhattan，且V5另有all-topic发布。**“跳过一条回复Kafka”不等于“所有回复没有embedding”。**
- UPA plan把模型返回的布尔安全元数据、tags与topic等写成统一帖注释，随后候选入池等消费者可使用。topic需要在available_topics列表中校验。注册plan不等于已确定当日生产流量比例；外部配置、模型与提示词仍有限制。

证据：[V5计划](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/flows/mm_emb/plan_post_embedding_v5.py)、[V82计划](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/flows/mm_emb/plan_post_embedding_v82.py)、[搜索向量计划](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/flows/mm_emb/plan_post_embedding_v8_search.py)、[V5编码和归一化](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/flows/mm_emb/embedder.py#L14-L103)、[多版本sink](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/flows/mm_emb/task_write_mm_embedding_sink.py#L37-L161)、[UPA topic校验和发布](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/flows/upa/task_write.py#L29-L144)。这部分为接口/接线抽查，未逐行覆盖所有renderer、backfill和特殊视频plan。

#### C.6.2 补充核查：Under the Hood报告有资格、时延与展示限制

- 面向已认证的当前viewer且受feature switch控制，不是任意访客输入他人账号就能取报告。
- 公开服务常量要求账号年龄超过365天，所选月份合格原创帖计数至少10条。封禁账号返回missing。它是**报告展示资格**，不能误读为“新账号一年内没有推荐”。
- 选用过去UTC月份，月末后至少10天并有完整观察数据才可用；不完整会再退一月，且可被max-month配置限制。因此不能拿它诊断“刚才这条帖为何没有曝光”。
- 日任务结合发帖数据、标签应用/删除事件与标签快照补洞，处理逻辑帖ID去重，再由月度聚合服务输出。报告记录某期间曾携带的标签及统计，不是当前所有标签的逐秒快照。
- 法律下架、申诉指引、具体帖ID各有单独feature switch，源默认false不代表生产永远关闭。帖ID默认策略参数为少量标签帖≤3时可列、占比>5%时可不列、最多50条；仍取决于开关与运行覆盖，不能把没有列出帖ID当成没有受影响。
- 服务文案明确best-effort；没有取得报告、报告为空、某标签没列出，都不能单独作为“没有任何可见性限制”的证明。报告本身不提供Phoenix分数或反事实曝光数量。

证据：[认证与总开关](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.strato#L8-L18)、[资格常量/文案](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.User.strato#L17-L22)、[服务资格与月份回退](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.User.strato#L573-L718)、[月份/展示规则说明](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.User.strato#L735-L749)、[显示开关与数量默认](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/lib/params.strato)、[日任务输入](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthDailyPostsJob.scala#L33-L124)。本次未逐行审所有回填/legacy实验任务及月度发布程序。

## 附录 D：Home 与 VM 的全部参数宏默认值

### D.1 home-mixer/params/param.rs：218 项

以下为固定提交文本提取的全部 218 个 `param!` 声明。列出的值是声明默认值，不表示该项实际接线、符合enable条件或线上已采用。键名精确保留以便跨调用链检索；附录A解释了重要互斥/多层门槛。

| 参数 | 类型 | 默认值 | feature-switch key | 证据行 |
|---|---|---|---|---|
| PhoenixMaxResults | u32 | `1000` | `rust_home_mixer_phoenix_max_results` | [L4–L9](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L4-L9) |
| EnablePhoenixSource | bool | `true` | `rust_home_mixer_enable_phoenix_source` | [L10–L15](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L10-L15) |
| PhoenixColdStartMaxResults | u32 | `200` | `rust_home_mixer_phoenix_cold_start_max_results` | [L16–L21](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L16-L21) |
| ThunderMaxResults | u32 | `1200` | `rust_home_mixer_thunder_max_results` | [L23–L28](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L23-L28) |
| ThunderAlgorithm | String | `"default"` | `rust_home_mixer_thunder_algorithm` | [L29–L34](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L29-L34) |
| TweetMixerMaxResults | u32 | `800` | `rust_home_mixer_tweet_mixer_max_results` | [L35–L40](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L35-L40) |
| EnableTweetMixerSource | bool | `false` | `rust_home_mixer_enable_tweet_mixer_source` | [L41–L46](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L41-L46) |
| EnableSimclustersSource | bool | `true` | `rust_home_mixer_enable_simclusters_source` | [L48–L53](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L48-L53) |
| PhoenixInferenceClusterId | String | `"Experiment1Fou"` | `rust_home_mixer_phoenix_inference_cluster_id` | [L55–L60](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L55-L60) |
| PhoenixRetrievalInferenceClusterId | String | `"Experiment1Fou"` | `rust_home_mixer_phoenix_retrieval_inference_cluster_id` | [L61–L66](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L61-L66) |
| EnablePhoenixOonReplies | bool | `false` | `rust_home_mixer_enable_phoenix_oon_replies` | [L67–L72](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L67-L72) |
| PhoenixOonRepliesRootOnly | bool | `false` | `rust_home_mixer_phoenix_oon_replies_root_only` | [L73–L78](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L73-L78) |
| ShadowTrafficPhoenixClustersList | Vec<String> | `vec![]` | `rust_home_mixer_shadow_traffic_phoenix_clusters_list` | [L79–L84](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L79-L84) |
| ShadowTrafficPhoenixRetrievalClustersList | Vec<String> | `vec![]` | `rust_home_mixer_shadow_traffic_phoenix_retrieval_clusters_list` | [L85–L90](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L85-L90) |
| ShadowTrafficPhoenixClusterRates | Vec<String> | `vec![ "Experiment18Fou:0.3".to_string(), "Experiment19Fou:0.3".to_string() ]` | `rust_home_mixer_shadow_traffic_phoenix_cluster_rates` | [L91–L99](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L91-L99) |
| ShadowTrafficPhoenixClusterAggregationTypes | Vec<String> | `vec!["Experiment16Fou:DENSE_WITH_LONG_DWELL_HOME_EXCURSION".to_string()]` | `rust_home_mixer_shadow_traffic_phoenix_cluster_aggregation_types` | [L100–L105](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L100-L105) |
| ShadowTrafficDefaultPercent | f64 | `0.3` | `rust_home_mixer_shadow_traffic_default_percent` | [L106–L111](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L106-L111) |
| EnablePhoenixRetrievalStatsExperimentBucket | bool | `false` | `rust_home_mixer_enable_phoenix_retrieval_stats_experiment_bucket` | [L112–L117](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L112-L117) |
| EnablePhoenixScoreStatsExperimentBucket | bool | `false` | `rust_home_mixer_enable_phoenix_score_stats_experiment_bucket` | [L118–L123](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L118-L123) |
| RetrievalCandidatesKafkaSamplePercent | f64 | `5.0` | `rust_home_mixer_retrieval_candidates_kafka_sample_percent` | [L124–L129](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L124-L129) |
| RetrievalCandidatesKafkaMaxCandidates | u32 | `100000` | `rust_home_mixer_retrieval_candidates_kafka_max_candidates` | [L130–L135](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L130-L135) |
| EnableResponseDiversityStatsExperimentBucket | bool | `false` | `rust_home_mixer_enable_response_diversity_stats_experiment_bucket` | [L136–L141](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L136-L141) |
| PhoenixRetrievalTopicInferenceClusterId | String | `"Experiment2Fou"` | `rust_home_mixer_phoenix_retrieval_topic_inference_cluster_id` | [L142–L147](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L142-L147) |
| TopicFilteringId | String | `"PostBased50Pct"` | `rust_home_mixer_topic_filtering_experiment_id` | [L148–L153](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L148-L153) |
| TopicFilteringOverrides | String | `""` | `rust_home_mixer_topic_filtering_overrides` | [L154–L159](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L154-L159) |
| UserActionsClusterId | String | `"Fou"` | `rust_home_mixer_user_actions_cluster_id` | [L160–L165](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L160-L165) |
| PhoenixAggregationType | String | `"DENSE_WITH_LONG_DWELL"` | `rust_home_mixer_phoenix_aggregation_type` | [L166–L171](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L166-L171) |
| PhoenixRetrievalAggregationType | String | `"DENSE_WITH_LONG_DWELL"` | `rust_home_mixer_phoenix_retrieval_aggregation_type` | [L172–L177](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L172-L177) |
| EnablePhoenixMOESource | bool | `false` | `rust_home_mixer_enable_phoenix_moe_source` | [L179–L184](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L179-L184) |
| PhoenixMoeCodivertViewerIsControl | bool | `false` | `rust_home_mixer_phoenix_moe_codivert_viewer_is_control` | [L185–L190](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L185-L190) |
| PhoenixMoeCodivertViewerIsTreatment | bool | `false` | `rust_home_mixer_phoenix_moe_codivert_viewer_is_treatment` | [L191–L196](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L191-L196) |
| PhoenixRetrievalMOEInferenceClusterId | String | `"Experiment2Memy04"` | `rust_home_mixer_phoenix_retrieval_moe_inference_cluster_id` | [L197–L202](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L197-L202) |
| PhoenixMOEMaxResults | u32 | `0` | `rust_home_mixer_phoenix_moe_max_results` | [L203–L208](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L203-L208) |
| PhoenixMoeColdStartMaxResults | u32 | `200` | `rust_home_mixer_phoenix_moe_cold_start_max_results` | [L209–L214](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L209-L214) |
| AuthorPhoenixMoeEnabled | bool | `false` | `rust_home_mixer_author_phoenix_moe_enabled` | [L215–L220](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L215-L220) |
| AuthorIsControl | bool | `false` | `rust_home_mixer_author_is_control` | [L221–L226](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L221-L226) |
| AuthorIsTreatment | bool | `false` | `rust_home_mixer_author_is_treatment` | [L227–L232](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L227-L232) |
| ViewerZeroFavCodivertIsTreatment | bool | `false` | `rust_home_mixer_viewer_zero_fav_codivert_is_treatment` | [L233–L238](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L233-L238) |
| AuthorZeroFavCodivertIsTreatment | bool | `false` | `rust_home_mixer_author_zero_fav_codivert_is_treatment` | [L239–L244](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L239-L244) |
| AuthorZeroFavCodivertIsControl | bool | `false` | `rust_home_mixer_author_zero_fav_codivert_is_control` | [L245–L250](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L245-L250) |
| PhoenixRetrievalNewUserInferenceClusterId | String | `"Experiment1Lap7"` | `rust_home_mixer_phoenix_retrieval_new_user_inference_cluster_id` | [L252–L257](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L252-L257) |
| PhoenixRetrievalNewUserHistoryThreshold | u64 | `0` | `rust_home_mixer_phoenix_retrieval_new_user_history_threshold` | [L258–L263](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L258-L263) |
| PhoenixXdsRetrievalMaxRetries | u32 | `0` | `rust_home_mixer_phoenix_xds_retrieval_max_retries` | [L264–L269](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L264-L269) |
| PhoenixRetrievalExcludeSeenPosts | bool | `false` | `rust_home_mixer_phoenix_retrieval_exclude_seen_posts` | [L271–L276](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L271-L276) |
| RetrievalValueModelWeights | String | `""` | `rust_home_mixer_retrieval_value_model_weights` | [L278–L283](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L278-L283) |
| PhoenixRankerNewUserInferenceClusterId | String | `"Experiment1Fou"` | `rust_home_mixer_phoenix_ranker_new_user_inference_cluster_id` | [L285–L290](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L285-L290) |
| PhoenixRankerNewUserHistoryThreshold | u64 | `0` | `rust_home_mixer_phoenix_ranker_new_user_history_threshold` | [L291–L296](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L291-L296) |
| EnableRanking | bool | `true` | `rust_home_mixer_enable_ranking` | [L298–L298](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L298-L298) |
| LogSlateContext | bool | `false` | `rust_home_mixer_log_slate_context` | [L299–L304](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L299-L304) |
| RerankerHeadTag | i64 | `0` | `rust_home_mixer_reranker_head_tag` | [L305–L305](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L305-L305) |
| EnableHomeExcursionScores | bool | `false` | `rust_home_mixer_enable_home_excursion_scores` | [L306–L311](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L306-L311) |
| EnablePageLogging | bool | `true` | `rust_home_mixer_enable_page_logging` | [L312–L317](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L312-L317) |
| PageLogTtlSeconds | u64 | `3600` | `rust_home_mixer_page_log_ttl_seconds` | [L318–L323](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L318-L323) |
| EnablePageDecodeRerank | bool | `false` | `rust_home_mixer_enable_page_decode_rerank` | [L324–L329](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L324-L329) |
| PageDecodePoolN | u32 | `200` | `rust_home_mixer_page_decode_pool_n` | [L330–L335](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L330-L335) |
| PageDecodeSteps | u32 | `64` | `rust_home_mixer_page_decode_steps` | [L336–L341](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L336-L341) |
| PageDecodeTemperature | f64 | `0.0` | `rust_home_mixer_page_decode_temperature` | [L342–L347](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L342-L347) |
| PageDecodeRewardHead | u32 | `0` | `rust_home_mixer_page_decode_reward_head` | [L348–L353](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L348-L353) |
| EnablePageRlExploration | bool | `false` | `rust_home_mixer_enable_page_rl_exploration` | [L354–L359](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L354-L359) |
| PageRlExplorationTemperature | f64 | `0.2` | `rust_home_mixer_page_rl_exploration_temperature` | [L360–L365](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L360-L365) |
| PageRlExplorationTopK | usize | `64` | `rust_home_mixer_page_rl_exploration_top_k` | [L366–L371](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L366-L371) |
| FavoriteWeight | f64 | `0.66` | `rust_home_mixer_favorite_weight` | [L402–L402](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L402-L402) |
| ReplyWeight | f64 | `5.0` | `rust_home_mixer_reply_weight` | [L403–L403](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L403-L403) |
| BidirectionalFollowReplyWeightBoost | f64 | `15.0` | `rust_home_mixer_bidirectional_follow_reply_weight_boost` | [L404–L409](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L404-L409) |
| BidirectionalFollowDwellWeightBoost | f64 | `0.0` | `rust_home_mixer_bidirectional_follow_dwell_weight_boost` | [L410–L415](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L410-L415) |
| RetweetWeight | f64 | `1.0` | `rust_home_mixer_retweet_weight` | [L416–L416](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L416-L416) |
| PhotoExpandWeight | f64 | `0.05` | `rust_home_mixer_photo_expand_weight` | [L417–L422](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L417-L422) |
| VideoOpenWeight | f64 | `0.02` | `rust_home_mixer_video_open_weight` | [L423–L428](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L423-L428) |
| ClickWeight | f64 | `0.3` | `rust_home_mixer_click_weight` | [L429–L429](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L429-L429) |
| OpenLinkWeight | f64 | `0.2` | `rust_home_mixer_open_link_weight` | [L430–L430](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L430-L430) |
| ProfileClickWeight | f64 | `0.0` | `rust_home_mixer_profile_click_weight` | [L431–L436](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L431-L436) |
| VqvWeight | f64 | `0.0` | `rust_home_mixer_vqv_weight` | [L437–L437](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L437-L437) |
| ShareWeight | f64 | `2.0` | `rust_home_mixer_share_weight` | [L438–L438](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L438-L438) |
| ShareViaDmWeight | f64 | `5.0` | `rust_home_mixer_share_via_dm_weight` | [L439–L444](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L439-L444) |
| ShareViaCopyLinkWeight | f64 | `20.0` | `rust_home_mixer_share_via_copy_link_weight` | [L445–L450](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L445-L450) |
| DwellWeight | f64 | `0.05` | `rust_home_mixer_dwell_weight` | [L451–L451](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L451-L451) |
| QuoteWeight | f64 | `5.0` | `rust_home_mixer_quote_weight` | [L452–L452](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L452-L452) |
| QuotedClickWeight | f64 | `0.05` | `rust_home_mixer_quoted_click_weight` | [L453–L458](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L453-L458) |
| QuotedVqvWeight | f64 | `0.0` | `rust_home_mixer_quoted_vqv_weight` | [L459–L464](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L459-L464) |
| FollowAuthorWeight | f64 | `4.0` | `rust_home_mixer_follow_author_weight` | [L465–L470](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L465-L470) |
| PostUnexploredWeight | f64 | `0.015` | `rust_home_mixer_post_unexplored_weight` | [L471–L476](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L471-L476) |
| PostVideoWeight | f64 | `0.0` | `rust_home_mixer_post_video_weight` | [L477–L482](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L477-L482) |
| ContDwellTimeWeight | f64 | `0.006` | `rust_home_mixer_cont_dwell_time_weight` | [L483–L488](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L483-L488) |
| ContClickDwellTimeWeight | f64 | `0.4` | `rust_home_mixer_cont_click_dwell_time_weight` | [L489–L494](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L489-L494) |
| NotInterestedWeight | f64 | `-52.272` | `rust_home_mixer_not_interested_weight` | [L496–L501](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L496-L501) |
| BlockAuthorWeight | f64 | `-31.2` | `rust_home_mixer_block_author_weight` | [L502–L507](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L502-L507) |
| MuteAuthorWeight | f64 | `-58.8` | `rust_home_mixer_mute_author_weight` | [L508–L513](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L508-L513) |
| ReportWeight | f64 | `-234.0` | `rust_home_mixer_report_weight` | [L514–L514](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L514-L514) |
| NotDwelledWeight | f64 | `-0.02` | `rust_home_mixer_not_dwelled_weight` | [L515–L520](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L515-L520) |
| EnableFollowingRepliedUsersFacepile | bool | `false` | `rust_home_mixer_enable_following_replied_users_facepile` | [L522–L527](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L522-L527) |
| FollowingRepliedUsersFacepileMinUsers | i64 | `0` | `rust_home_mixer_following_replied_users_facepile_min_users` | [L528–L533](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L528-L533) |
| FollowingRepliedUsersFacepileMaxPosts | i64 | `0` | `rust_home_mixer_following_replied_users_facepile_max_posts` | [L534–L539](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L534-L539) |
| VMRankerEnableFallback | bool | `false` | `rust_home_mixer_vm_ranker_enable_fallback` | [L541–L546](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L541-L546) |
| VMRankerClusterId | String | `"Experiment1"` | `rust_home_mixer_vm_ranker_cluster_id` | [L547–L552](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L547-L552) |
| PhoenixExperimentOverrides | String | `""` | `rust_home_mixer_phoenix_experiment_overrides` | [L553–L558](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L553-L558) |
| VMRankerSendDebiasInputs | bool | `true` | `rust_home_mixer_vm_ranker_send_debias_inputs` | [L559–L564](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L559-L564) |
| VMRankerSendPacingInputs | bool | `false` | `rust_home_mixer_vm_ranker_send_pacing_inputs` | [L565–L570](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L565-L570) |
| VMRankerSendHistoryTopics | bool | `false` | `rust_home_mixer_vm_ranker_send_history_topics` | [L571–L576](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L571-L576) |
| HistoryTopicsEnabled | bool | `false` | `rust_home_mixer_history_topics_enabled` | [L577–L582](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L577-L582) |
| HistoryTopicsWindowDays | i64 | `28` | `rust_home_mixer_history_topics_window_days` | [L583–L588](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L583-L588) |
| EnableSerendipityStatsExperimentBucket | bool | `false` | `rust_home_mixer_enable_serendipity_stats_experiment_bucket` | [L589–L594](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L589-L594) |
| ColdStartImpressionThreshold | u32 | `200` | `rust_home_mixer_cold_start_impression_threshold` | [L595–L600](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L595-L600) |
| ColdStartSlotMin | u32 | `15` | `rust_home_mixer_cold_start_slot_min` | [L601–L606](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L601-L606) |
| ColdStartSlotMax | u32 | `16` | `rust_home_mixer_cold_start_slot_max` | [L607–L612](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L607-L612) |
| ColdStartFollowerCap | i64 | `50000` | `rust_home_mixer_cold_start_follower_cap` | [L613–L618](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L613-L618) |
| ColdStartMaxPostAgeSecs | u64 | `7200` | `rust_home_mixer_cold_start_max_post_age_secs` | [L619–L624](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L619-L624) |
| LowImpressionsMaxPositionRatio | f64 | `0.97` | `rust_home_mixer_low_impressions_max_boost_position_ratio` | [L626–L631](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L626-L631) |
| EnableViewerColdStart | bool | `true` | `rust_home_mixer_enable_viewer_cold_start_boost` | [L633–L638](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L633-L638) |
| EnableColdStartThompsonSampling | bool | `true` | `rust_home_mixer_enable_cold_start_thompson_sampling` | [L639–L644](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L639-L644) |
| ColdStartBetaAlpha0 | f64 | `0.75` | `rust_home_mixer_cold_start_beta_alpha0` | [L645–L650](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L645-L650) |
| ColdStartBetaBeta0 | f64 | `49.25` | `rust_home_mixer_cold_start_beta_beta0` | [L651–L656](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L651-L656) |
| ColdStartTsTopK | u32 | `2` | `rust_home_mixer_cold_start_ts_top_k` | [L657–L662](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L657-L662) |
| ColdStartImpressionScale | f64 | `1.0` | `rust_home_mixer_cold_start_impression_scale` | [L663–L668](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L663-L668) |
| ColdStartTrackedIds | String | `""` | `rust_home_mixer_cold_start_tracked_ids` | [L669–L674](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L669-L674) |
| EnableCachedPosts | bool | `true` | `rust_home_mixer_enable_cached_posts` | [L676–L681](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L676-L681) |
| EnableUnderTheHood | bool | `false` | `rust_home_mixer_enable_under_the_hood` | [L682–L687](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L682-L687) |
| MaxPostsToCache | usize | `750` | `rust_home_mixer_max_posts_to_cache` | [L688–L693](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L688-L693) |
| MinVideoDurationMs | i32 | `10_000` | `rust_home_mixer_min_video_duration_ms` | [L694–L699](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L694-L699) |
| EnableQuotedVqvDurationCheck | bool | `false` | `rust_home_mixer_enable_quoted_vqv_duration_check` | [L701–L706](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L701-L706) |
| EnableContextFeatures | bool | `true` | `rust_home_mixer_enable_context_features` | [L708–L713](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L708-L713) |
| EnableIpFeature | bool | `true` | `rust_home_mixer_enable_geo_features` | [L715–L720](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L715-L720) |
| EnableExplicitEngagementSignals | bool | `true` | `rust_home_mixer_enable_explicit_engagement_signals` | [L722–L727](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L722-L727) |
| EnableImplicitEngagementSignals | bool | `true` | `rust_home_mixer_enable_implicit_engagement_signals` | [L728–L733](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L728-L733) |
| EngagementSignalsMaxPerType | usize | `15` | `rust_home_mixer_engagement_signals_max_per_type` | [L734–L739](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L734-L739) |
| SimclustersMaxCandidateAgeHours | i32 | `48` | `rust_home_mixer_simclusters_max_candidate_age_hours` | [L740–L745](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L740-L745) |
| EnableSidSource | bool | `false` | `rust_home_mixer_enable_sid_source` | [L746–L751](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L746-L751) |
| SidSourceMaxResults | u32 | `800` | `rust_home_mixer_sid_source_max_results` | [L752–L757](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L752-L757) |
| SidSourceMaxSeeds | usize | `50` | `rust_home_mixer_sid_source_max_seeds` | [L758–L763](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L758-L763) |
| SidSourceMaxPerSeed | u32 | `100` | `rust_home_mixer_sid_source_max_per_seed` | [L764–L769](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L764-L769) |
| SidSourceMinPrefixDepth | u32 | `3` | `rust_home_mixer_sid_source_min_prefix_depth` | [L770–L775](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L770-L775) |
| EnableUserInstalledAppsHydration | bool | `true` | `rust_home_mixer_enable_user_installed_apps_hydration` | [L777–L782](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L777-L782) |
| EnableRecentSearchQueriesHydration | bool | `false` | `rust_home_mixer_enable_recent_search_queries_hydration` | [L784–L789](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L784-L789) |
| EnableUserInstalledAppsV2 | bool | `false` | `rust_home_mixer_enable_user_installed_apps_v2` | [L791–L796](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L791-L796) |
| EnableInferredGenderHydration | bool | `true` | `rust_home_mixer_enable_inferred_gender_hydration` | [L798–L803](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L798-L803) |
| EnableRetrievalSequenceHydration | bool | `true` | `rust_home_mixer_enable_retrieval_sequence_hydration` | [L805–L810](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L805-L810) |
| EnableScoringSequenceHydration | bool | `true` | `rust_home_mixer_enable_scoring_sequence_hydration` | [L812–L817](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L812-L817) |
| EnableMutualFollowJaccardHydration | bool | `false` | `rust_home_mixer_enable_mutual_follow_jaccard_hydration` | [L819–L824](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L819-L824) |
| EnableBidirectionalFollowHydration | bool | `true` | `rust_home_mixer_enable_bidirectional_follow_hydration` | [L826–L831](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L826-L831) |
| EnableAllAuthorFollowHydration | bool | `true` | `rust_home_mixer_enable_all_author_follow_hydration` | [L832–L837](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L832-L837) |
| EnableNewUserMinEngagementFilter | bool | `false` | `rust_home_mixer_enable_new_user_min_engagement_filter` | [L838–L843](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L838-L843) |
| NewUserMinEngagementFilterMetric | String | `"fav"` | `rust_home_mixer_new_user_min_engagement_filter_metric` | [L844–L849](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L844-L849) |
| NewUserMinEngagementFilterUseRatio | bool | `false` | `rust_home_mixer_new_user_min_engagement_filter_use_ratio` | [L850–L855](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L850-L855) |
| NewUserMinEngagementThreshold | f64 | `0.0` | `rust_home_mixer_new_user_min_engagement_threshold` | [L856–L861](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L856-L861) |
| NewUserMinEngagementFilterMaxAccountAgeSecs | u64 | `1800` | `rust_home_mixer_new_user_min_engagement_filter_max_account_age_secs` | [L862–L867](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L862-L867) |
| EnableNewUserSoftNsfwFilter | bool | `false` | `rust_home_mixer_enable_new_user_soft_nsfw_filter` | [L868–L873](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L868-L873) |
| NewUserSoftNsfwFilterMaxAccountAgeSecs | u64 | `604800` | `rust_home_mixer_new_user_soft_nsfw_filter_max_account_age_secs` | [L874–L879](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L874-L879) |
| NewUserSoftNsfwFilterMaxScoringSeqLength | u64 | `100` | `rust_home_mixer_new_user_soft_nsfw_filter_max_scoring_seq_length` | [L880–L885](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L880-L885) |
| NewUserMinEngagementFilterMaxResurrectionAgeSecs | u64 | `1800` | `rust_home_mixer_new_user_min_engagement_filter_max_resurrection_age_secs` | [L886–L891](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L886-L891) |
| EnableEngagementCountsHydration | bool | `true` | `rust_home_mixer_enable_engagement_counts_hydration` | [L892–L897](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L892-L897) |
| EnablePostEngagers | bool | `false` | `rust_home_mixer_enable_post_engagers` | [L898–L903](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L898-L903) |
| EnableSemanticIdHydration | bool | `true` | `rust_home_mixer_enable_semantic_id_hydration` | [L904–L909](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L904-L909) |
| SidServerEndpoint | String | `"xds://xai-recsys-sid-v8-root.prod.recsys-infra:grpc"` | `rust_home_mixer_sid_server_endpoint` | [L910–L915](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L910-L915) |
| EnableAdsSource | bool | `true` | `rust_home_mixer_enable_ads_source` | [L916–L921](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L916-L921) |
| EnableAdsInjectionLogging | bool | `true` | `rust_home_mixer_enable_ads_injection_logging` | [L923–L928](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L923-L928) |
| EnableAdsFunnelTrace | bool | `true` | `rust_home_mixer_enable_ads_funnel_trace` | [L930–L935](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L930-L935) |
| AdsBlenderType | String | `"multi_risk"` | `rust_home_mixer_ads_blender` | [L937–L942](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L937-L942) |
| EnableAdsBrandSafetyVerdictV2 | bool | `false` | `rust_home_mixer_ads_bs_v2_exp_enabled` | [L944–L949](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L944-L949) |
| EnableAdsAuthorBrandSafetyFallback | bool | `true` | `rust_home_mixer_ads_bs_author_fallback_enabled` | [L951–L956](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L951-L956) |
| AdsTimeGapTSec | f64 | `4.0` | `rust_home_mixer_ads_time_gap_t_sec` | [L957–L962](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L957-L962) |
| AdsTimeGapClampLo | f64 | `0.5` | `rust_home_mixer_ads_time_gap_clamp_lo` | [L963–L968](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L963-L968) |
| AdsTimeGapClampHi | f64 | `2.0` | `rust_home_mixer_ads_time_gap_clamp_hi` | [L969–L974](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L969-L974) |
| AdsTimeGapMinOrganicGap | u32 | `3` | `rust_home_mixer_ads_time_gap_min_organic_gap` | [L975–L980](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L975-L980) |
| UseXdsForUas | bool | `true` | `rust_home_mixer_use_xds_for_uas` | [L981–L981](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L981-L981) |
| UasSourceDataType | String | `"NEW_UUA_ARROW"` | `rust_home_mixer_uas_source_data_type` | [L982–L987](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L982-L987) |
| MaxSeqLengthScoring | u32 | `1024` | `rust_home_mixer_max_seq_length_scoring` | [L988–L993](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L988-L993) |
| MaxSeqLengthRetrieval | u32 | `1024` | `rust_home_mixer_max_seq_length_retrieval` | [L994–L999](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L994-L999) |
| EnableAdAdjacentServedFilter | bool | `false` | `rust_home_mixer_enable_ad_adjacent_served_filter` | [L1001–L1006](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1001-L1006) |
| EnableServedFilterAllRequests | bool | `true` | `rust_home_mixer_enable_served_filter_all_requests` | [L1007–L1012](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1007-L1012) |
| EnableInventoryHoldout | bool | `false` | `rust_home_mixer_enable_inventory_holdout` | [L1014–L1019](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1014-L1019) |
| InventoryHoldoutOriginalsPercent | u32 | `0` | `rust_home_mixer_inventory_holdout_originals_percent` | [L1020–L1025](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1020-L1025) |
| InventoryHoldoutRepliesPercent | u32 | `0` | `rust_home_mixer_inventory_holdout_replies_percent` | [L1026–L1031](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1026-L1031) |
| InventoryHoldoutRetweetsPercent | u32 | `0` | `rust_home_mixer_inventory_holdout_retweets_percent` | [L1032–L1037](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1032-L1037) |
| EnableFavHoldout | bool | `false` | `rust_home_mixer_enable_fav_holdout` | [L1039–L1044](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1039-L1044) |
| EnableEntryIdRandomHash | bool | `false` | `rust_home_mixer_enable_entry_id_random_hash` | [L1046–L1051](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1046-L1051) |
| EnableTopicFeedbackContext | bool | `false` | `rust_home_mixer_enable_topic_feedback_context` | [L1053–L1058](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1053-L1058) |
| EnableAiTrendFeedbackContext | bool | `false` | `rust_home_mixer_enable_ai_trend_feedback_context` | [L1060–L1065](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1060-L1065) |
| EnablePhoenixRequestCacheSideEffect | bool | `true` | `rust_home_mixer_enable_phoenix_request_cache_side_effect` | [L1067–L1072](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1067-L1072) |
| PhoenixRequestCacheSideEffectTtlSeconds | u64 | `10800` | `rust_home_mixer_phoenix_request_cache_side_effect_ttl_seconds` | [L1073–L1078](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1073-L1078) |
| EnableUrtMigrationComponents | bool | `true` | `rust_home_mixer_enable_urt_migration_components` | [L1080–L1085](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1080-L1085) |
| EnableAuthorServedMetricsExperimentBucket | bool | `false` | `rust_home_mixer_enable_author_served_metrics_experiment_bucket` | [L1087–L1092](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1087-L1092) |
| AuthorServedMetricsAuthorIds | Vec<u64> | `vec![]` | `rust_home_mixer_author_served_metrics_author_ids` | [L1093–L1098](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1093-L1098) |
| EnablePopularPostsSource | bool | `true` | `rust_home_mixer_enable_popular_posts_source` | [L1099–L1104](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1099-L1104) |
| PopularPostsMaxResults | u32 | `500` | `rust_home_mixer_popular_posts_max_results` | [L1105–L1110](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1105-L1110) |
| EnablePublishSeenIdsToKafka | bool | `true` | `rust_home_mixer_enable_publish_seen_ids_kafka` | [L1112–L1117](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1112-L1117) |
| EnableWhoToFollowModule | bool | `true` | `rust_home_mixer_enable_who_to_follow_module` | [L1119–L1124](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1119-L1124) |
| WhoToFollowFatigueHours | u32 | `30` | `rust_home_mixer_who_to_follow_fatigue_hours` | [L1125–L1130](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1125-L1130) |
| EnablePrompts | bool | `true` | `rust_home_mixer_enable_prompts` | [L1132–L1132](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1132-L1132) |
| ExcludeServedTweetIdsDuration | u32 | `10` | `rust_home_mixer_exclude_served_tweet_ids_duration_minutes` | [L1134–L1139](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1134-L1139) |
| ExcludeServedTweetIdsNumber | usize | `100` | `rust_home_mixer_exclude_served_tweet_ids_number` | [L1140–L1145](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1140-L1145) |
| EnableJetfuelFrames | bool | `false` | `rust_home_mixer_enable_jetfuel_frames` | [L1147–L1152](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1147-L1152) |
| EnableJetfuelFrameSoccer | bool | `false` | `rust_home_mixer_jetfuel_frame_soccer_enabled` | [L1153–L1158](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1153-L1158) |
| EnableJetfuelFrameNfl | bool | `false` | `rust_home_mixer_jetfuel_frame_nfl_enabled` | [L1159–L1164](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1159-L1164) |
| EnableJetfuelFrameMlbCarousel | bool | `false` | `rust_home_mixer_jetfuel_frame_mlb_carousel_enabled` | [L1165–L1170](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1165-L1170) |
| EnableJetfuelFrameNflTimelinePinned | bool | `false` | `rust_home_mixer_jetfuel_frame_nfl_timeline_pinned_enabled` | [L1171–L1176](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1171-L1176) |
| EnableJetfuelFrameNflTimelineRotation | bool | `false` | `rust_home_mixer_jetfuel_frame_nfl_timeline_rotation_enabled` | [L1177–L1182](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1177-L1182) |
| EnableFeedSurvey | bool | `false` | `rust_home_mixer_enable_feed_survey` | [L1184–L1189](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1184-L1189) |
| FeedSurveyFatigueMinutes | u32 | `1440` | `rust_home_mixer_feed_survey_fatigue_minutes` | [L1190–L1195](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1190-L1195) |
| EnableVideoCarousel | bool | `false` | `rust_home_mixer_enable_video_carousel` | [L1197–L1202](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1197-L1202) |
| VideoCarouselFatigueMinutes | u32 | `60` | `rust_home_mixer_video_carousel_fatigue_minutes` | [L1203–L1208](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1203-L1208) |
| VideoCarouselPosition | u32 | `6` | `rust_home_mixer_video_carousel_position` | [L1209–L1214](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1209-L1214) |
| EnableVideoCarouselAuthorDedupe | bool | `true` | `rust_home_mixer_enable_video_carousel_author_dedupe` | [L1215–L1220](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1215-L1220) |
| VideoCarouselSemanticIdDedupeLevels | u32 | `3` | `rust_home_mixer_video_carousel_semantic_id_dedupe_levels` | [L1221–L1226](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1221-L1226) |
| EnableVideoCarouselEmbeddingDedupe | bool | `true` | `rust_home_mixer_enable_video_carousel_embedding_dedupe` | [L1227–L1232](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1227-L1232) |
| VideoCarouselEmbeddingDedupeThreshold | f64 | `0.72` | `rust_home_mixer_video_carousel_embedding_dedupe_threshold` | [L1233–L1238](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1233-L1238) |
| VideoCarouselEmbeddingVersion | String | `"v8_search_1"` | `rust_home_mixer_video_carousel_embedding_version` | [L1239–L1244](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1239-L1244) |
| EnableVideoCarouselHighRiskFilter | bool | `true` | `rust_home_mixer_enable_video_carousel_high_risk_filter` | [L1245–L1250](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1245-L1250) |
| EnableVideoCarouselMediumRiskFilter | bool | `false` | `rust_home_mixer_enable_video_carousel_medium_risk_filter` | [L1251–L1256](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1251-L1256) |
| EnableVideoCarouselCandidatesLogging | bool | `true` | `rust_home_mixer_enable_video_carousel_candidates_logging` | [L1257–L1262](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1257-L1262) |
| VideoCarouselVideoOpenWeight | f64 | `1.0` | `rust_home_mixer_video_carousel_video_open_weight` | [L1263–L1268](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1263-L1268) |
| VideoCarouselImmersiveVqvWeight | f64 | `0.0` | `rust_home_mixer_video_carousel_immersive_vqv_weight` | [L1269–L1274](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1269-L1274) |
| VideoCarouselOpenTimesImmersiveDwellWeight | f64 | `0.0` | `rust_home_mixer_video_carousel_open_times_immersive_dwell_weight` | [L1275–L1280](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1275-L1280) |
| VideoCarouselWeightedScoreWeight | f64 | `0.0` | `rust_home_mixer_video_carousel_weighted_score_weight` | [L1281–L1286](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1281-L1286) |
| VideoCarouselImmersiveClusterId | String | `"Experiment3Fou"` | `rust_home_mixer_video_carousel_immersive_cluster_id` | [L1287–L1292](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1287-L1292) |
| VideoCarouselImmersiveAggregationType | String | `"IMMERSIVE_LONG_DWELL"` | `rust_home_mixer_video_carousel_immersive_aggregation_type` | [L1293–L1298](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1293-L1298) |
| VideoCarouselExtraCandidates | usize | `30` | `rust_home_mixer_video_carousel_extra_candidates` | [L1299–L1304](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1299-L1304) |
| EnableXaiVfClient | bool | `true` | `rust_home_mixer_enable_xai_vf_client` | [L1306–L1311](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1306-L1311) |
| PhoenixScoresResultSize | u32 | `2800` | `rust_home_mixer_phoenix_scores_result_size` | [L1313–L1318](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1313-L1318) |
| EnableFairShareRanking | bool | `true` | `rust_home_mixer_enable_fair_share_ranking` | [L1319–L1324](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1319-L1324) |

### D.2 vm-ranker/params.rs：58 项

以下为固定提交文本提取的全部 58 个 `param!` 声明。列出的值是声明默认值，不表示该项实际接线、符合enable条件或线上已采用。键名精确保留以便跨调用链检索；附录A解释了重要互斥/多层门槛。

| 参数 | 类型 | 默认值 | feature-switch key | 证据行 |
|---|---|---|---|---|
| FavoriteWeight | f64 | `0.5` | `rust_home_mixer_favorite_weight` | [L3–L3](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L3-L3) |
| ReplyWeight | f64 | `5.0` | `rust_home_mixer_reply_weight` | [L4–L4](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L4-L4) |
| RetweetWeight | f64 | `1.0` | `rust_home_mixer_retweet_weight` | [L5–L5](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L5-L5) |
| PhotoExpandWeight | f64 | `0.05` | `rust_home_mixer_photo_expand_weight` | [L6–L11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L6-L11) |
| VideoOpenWeight | f64 | `0.07` | `rust_home_mixer_video_open_weight` | [L12–L17](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L12-L17) |
| ClickWeight | f64 | `0.3` | `rust_home_mixer_click_weight` | [L18–L18](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L18-L18) |
| OpenLinkWeight | f64 | `0.2` | `rust_home_mixer_open_link_weight` | [L19–L19](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L19-L19) |
| ProfileClickWeight | f64 | `0.0` | `rust_home_mixer_profile_click_weight` | [L20–L25](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L20-L25) |
| VqvWeight | f64 | `0.0` | `rust_home_mixer_vqv_weight` | [L26–L26](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L26-L26) |
| ShareWeight | f64 | `2.0` | `rust_home_mixer_share_weight` | [L27–L27](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L27-L27) |
| ShareViaDmWeight | f64 | `5.0` | `rust_home_mixer_share_via_dm_weight` | [L28–L33](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L28-L33) |
| ShareViaCopyLinkWeight | f64 | `20.0` | `rust_home_mixer_share_via_copy_link_weight` | [L34–L39](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L34-L39) |
| DwellWeight | f64 | `0.05` | `rust_home_mixer_dwell_weight` | [L40–L40](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L40-L40) |
| QuoteWeight | f64 | `5.0` | `rust_home_mixer_quote_weight` | [L41–L41](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L41-L41) |
| QuotedClickWeight | f64 | `0.05` | `rust_home_mixer_quoted_click_weight` | [L42–L47](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L42-L47) |
| QuotedVqvWeight | f64 | `0.0` | `rust_home_mixer_quoted_vqv_weight` | [L48–L53](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L48-L53) |
| ContDwellTimeWeight | f64 | `0.004` | `rust_home_mixer_cont_dwell_time_weight` | [L54–L59](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L54-L59) |
| ContClickDwellTimeWeight | f64 | `0.4` | `rust_home_mixer_cont_click_dwell_time_weight` | [L60–L65](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L60-L65) |
| VideoContinuationWeight | f64 | `0.0` | `rust_home_mixer_video_continuation_weight` | [L66–L71](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L66-L71) |
| UserVideoContinuationWeight | f64 | `0.0` | `rust_home_mixer_user_video_continuation_weight` | [L72–L77](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L72-L77) |
| ProfileVisitSecsWeight | f64 | `0.0` | `rust_home_mixer_profile_visit_secs_weight` | [L78–L83](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L78-L83) |
| FollowAuthorWeight | f64 | `4.0` | `rust_home_mixer_follow_author_weight` | [L84–L89](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L84-L89) |
| PostUnexploredWeight | f64 | `0.02` | `rust_home_mixer_post_unexplored_weight` | [L90–L95](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L90-L95) |
| PostUnexploredIncludeOutOfNetwork | bool | `false` | `rust_home_mixer_post_unexplored_include_out_of_network` | [L96–L101](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L96-L101) |
| PostVideoWeight | f64 | `0.0` | `rust_home_mixer_post_video_weight` | [L102–L107](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L102-L107) |
| NotInterestedWeight | f64 | `-47.52` | `rust_home_mixer_not_interested_weight` | [L108–L113](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L108-L113) |
| BlockAuthorWeight | f64 | `-31.2` | `rust_home_mixer_block_author_weight` | [L114–L119](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L114-L119) |
| MuteAuthorWeight | f64 | `-58.8` | `rust_home_mixer_mute_author_weight` | [L120–L125](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L120-L125) |
| ReportWeight | f64 | `-234.0` | `rust_home_mixer_report_weight` | [L126–L126](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L126-L126) |
| NotDwelledWeight | f64 | `-0.02` | `rust_home_mixer_not_dwelled_weight` | [L127–L132](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L127-L132) |
| MinVideoDurationMs | i32 | `10_000` | `rust_home_mixer_min_video_duration_ms` | [L133–L138](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L133-L138) |
| EnableQuotedVqvDurationCheck | bool | `false` | `rust_home_mixer_enable_quoted_vqv_duration_check` | [L139–L144](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L139-L144) |
| BidirectionalFollowReplyWeightBoost | f64 | `15.0` | `rust_home_mixer_bidirectional_follow_reply_weight_boost` | [L145–L150](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L145-L150) |
| BidirectionalFollowDwellWeightBoost | f64 | `0.0` | `rust_home_mixer_bidirectional_follow_dwell_weight_boost` | [L151–L156](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L151-L156) |
| WeightPerturbationSigma | f64 | `0.0` | `rust_home_mixer_weight_perturbation_sigma` | [L157–L162](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L157-L162) |
| WeightPerturbationSalt | String | `""` | `rust_home_mixer_weight_perturbation_salt` | [L163–L168](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L163-L168) |
| EnableAuthorDiversity | bool | `true` | `rust_home_mixer_enable_author_diversity` | [L169–L174](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L169-L174) |
| AuthorDiversityDecay | f64 | `0.5` | `rust_home_mixer_author_diversity_decay` | [L175–L180](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L175-L180) |
| AuthorDiversityFloor | f64 | `0.25` | `rust_home_mixer_author_diversity_floor` | [L181–L186](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L181-L186) |
| EnableOonRescoreForInNetworkRepliesRetweets | bool | `true` | `rust_home_mixer_enable_oon_rescore_for_in_network_replies_retweets` | [L187–L192](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L187-L192) |
| MultiplierPreOffset | bool | `false` | `rust_home_mixer_multiplier_pre_offset` | [L193–L198](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L193-L198) |
| AuthorExplorationBonus | f64 | `0.0` | `rust_home_mixer_author_exploration_bonus` | [L199–L204](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L199-L204) |
| TopicOonWeightFactor | f64 | `0.5` | `rust_home_mixer_topic_oon_weight_factor` | [L205–L210](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L205-L210) |
| OonWeightFactor | f64 | `0.75` | `rust_home_mixer_oon_weight_factor` | [L211–L216](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L211-L216) |
| NewUserAgeThresholdSecs | u64 | `0` | `rust_home_mixer_new_user_age_threshold_secs` | [L217–L222](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L217-L222) |
| NewUserOonWeightFactor | f64 | `0.00001` | `rust_home_mixer_new_user_oon_weight_factor` | [L223–L228](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L223-L228) |
| ComputeValueModel | bool | `false` | `rust_home_mixer_vm_ranker_compute_value_model` | [L229–L234](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L229-L234) |
| DppEnabled | bool | `true` | `rust_home_mixer_vm_ranker_dpp_enabled` | [L235–L240](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L235-L240) |
| TopicDppEnabled | bool | `false` | `rust_home_mixer_vm_ranker_topic_dpp_enabled` | [L241–L246](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L241-L246) |
| DppTheta | f64 | `0.65` | `rust_home_mixer_vm_ranker_dpp_theta` | [L247–L247](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L247-L247) |
| DppMaxSelectedRank | u32 | `150` | `rust_home_mixer_vm_ranker_dpp_max_selected_rank` | [L248–L253](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L248-L253) |
| UserDebiasEnabled | bool | `false` | `rust_home_mixer_vm_ranker_user_debias_enabled` | [L254–L259](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L254-L259) |
| UserDebiasAlpha | f64 | `0.0` | `rust_home_mixer_vm_ranker_user_debias_alpha` | [L260–L265](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L260-L265) |
| UserDebiasClipLogit | f64 | `2.0` | `rust_home_mixer_vm_ranker_user_debias_clip_logit` | [L266–L271](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L266-L271) |
| UserDebiasHeads | String | `""` | `rust_home_mixer_vm_ranker_user_debias_heads` | [L272–L277](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L272-L277) |
| UserDebiasHeadAlpha | String | `""` | `rust_home_mixer_vm_ranker_user_debias_head_alpha` | [L278–L283](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L278-L283) |
| UserDebiasHeadClipLogit | String | `""` | `rust_home_mixer_vm_ranker_user_debias_head_clip_logit` | [L284–L289](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L284-L289) |
| UserDebiasMaxArtifactAgeSecs | f64 | `3600.0` | `rust_home_mixer_vm_ranker_user_debias_max_artifact_age_secs` | [L290–L295](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L290-L295) |


**参数表范围**：两文件全部 `param!` 声明，不是全仓全部常量。Thunder、DPP CLI、缓存、PopularPosts、页面槽位、过滤硬编码、topic映射及安全规则仍须结合对应附录。宏默认不证明接线、资格或线上采用。
## 附录 E：固定提交的完整文件盘点索引

此表列出全部 2353 条 Git 跟踪路径。每条只声明“已列入盘点”，**不声明已逐行审完**；语义阅读深度见第六部分。清单不包含 `.git`，未列外部依赖、线上数据和未公开文件。原始清单（每行路径、LF结尾）的 SHA-256：`2452ff40812405344ff0c26f51a6b8effaca74c2034b0b381ca0efd4383454fa`。

```text
CODE_OF_CONDUCT.md
LICENSE
README.md
abuse-enforcement-service/server/src/main.rs
abuse-enforcement-service/service-lib/rules/enforcement_post.yaml
abuse-enforcement-service/service-lib/rules/enforcement_user.yaml
abuse-enforcement-service/service-lib/src/action_control.rs
abuse-enforcement-service/service-lib/src/action_control/levels.rs
abuse-enforcement-service/service-lib/src/action_control_path_tests.rs
abuse-enforcement-service/service-lib/src/action_control_rollback.rs
abuse-enforcement-service/service-lib/src/ais_client.rs
abuse-enforcement-service/service-lib/src/allowlist.rs
abuse-enforcement-service/service-lib/src/api_doc.rs
abuse-enforcement-service/service-lib/src/auth.rs
abuse-enforcement-service/service-lib/src/backfill.rs
abuse-enforcement-service/service-lib/src/backfill_claims.rs
abuse-enforcement-service/service-lib/src/backfill_path_tests.rs
abuse-enforcement-service/service-lib/src/bin/action_control_rollback.rs
abuse-enforcement-service/service-lib/src/bin/validate_rules_yaml.rs
abuse-enforcement-service/service-lib/src/confidence.rs
abuse-enforcement-service/service-lib/src/confidence_adversarial_tests.rs
abuse-enforcement-service/service-lib/src/confidence_path_tests.rs
abuse-enforcement-service/service-lib/src/config.rs
abuse-enforcement-service/service-lib/src/decision.rs
abuse-enforcement-service/service-lib/src/dedup_cache.rs
abuse-enforcement-service/service-lib/src/entities.rs
abuse-enforcement-service/service-lib/src/facts.rs
abuse-enforcement-service/service-lib/src/fixtures/mock_rules_post.yaml
abuse-enforcement-service/service-lib/src/fixtures/mock_rules_user.yaml
abuse-enforcement-service/service-lib/src/fixtures/replay_no_records.golden
abuse-enforcement-service/service-lib/src/gizmoduck.rs
abuse-enforcement-service/service-lib/src/gizmoduck_labels.rs
abuse-enforcement-service/service-lib/src/growthbook.rs
abuse-enforcement-service/service-lib/src/growthbook_writer.rs
abuse-enforcement-service/service-lib/src/head_guard.rs
abuse-enforcement-service/service-lib/src/ledger_contract_fixtures.rs
abuse-enforcement-service/service-lib/src/lib.rs
abuse-enforcement-service/service-lib/src/limiter.rs
abuse-enforcement-service/service-lib/src/manhattan.rs
abuse-enforcement-service/service-lib/src/metrics.rs
abuse-enforcement-service/service-lib/src/off_switch.rs
abuse-enforcement-service/service-lib/src/overturn_hold.rs
abuse-enforcement-service/service-lib/src/replay_tests.rs
abuse-enforcement-service/service-lib/src/restart_on_config_change.rs
abuse-enforcement-service/service-lib/src/rules.rs
abuse-enforcement-service/service-lib/src/safety_audit_tests.rs
abuse-enforcement-service/service-lib/src/safety_checks.rs
abuse-enforcement-service/service-lib/src/service.rs
abuse-enforcement-service/service-lib/src/sliding_window.rs
abuse-enforcement-service/service-lib/src/strato.rs
abuse-enforcement-service/service-lib/src/test_user.rs
abuse-enforcement-service/types/src/action_control.rs
abuse-enforcement-service/types/src/allowlist.rs
abuse-enforcement-service/types/src/backfill.rs
abuse-enforcement-service/types/src/config.rs
abuse-enforcement-service/types/src/head_guard.rs
abuse-enforcement-service/types/src/lib.rs
abuse-enforcement-service/types/src/off_switch.rs
abuse-ledger-service/NOTICE
abuse-ledger-service/src/api.rs
abuse-ledger-service/src/boot.rs
abuse-ledger-service/src/codes.rs
abuse-ledger-service/src/config.rs
abuse-ledger-service/src/lib.rs
abuse-ledger-service/src/main.rs
abuse-ledger-service/src/metrics.rs
abuse-ledger-service/src/pg.rs
abuse-ledger-service/src/repo.rs
abuse-ledger-service/src/sql.rs
abuse-ledger-service/src/tls.rs
adult-content/BUILD
adult-content/calibration.py
adult-content/config.py
adult-content/dataset_utils.py
adult-content/scripts/BUILD
adult-content/scripts/calibrate_model_scores.py
adult-content/scripts/train_model.py
adult-content/training.py
agatha/hub/agatha/BUILD
agatha/hub/agatha/Bijections.scala
agatha/hub/agatha/builder/BUILD
agatha/hub/agatha/builder/Builder.scala
agatha/hub/agatha/job/AgathaJobTemplates.scala
agatha/hub/agatha/job/BUILD.bazel
agatha/hub/agatha/labels/BUILD
agatha/hub/agatha/labels/LabelGenerator.scala
agatha/hub/agatha/labels/LabelManager.scala
agatha/hub/agatha/predict/Aggregators.scala
agatha/hub/agatha/predict/BUILD
agatha/hub/agatha/predict/Predict.scala
agatha/hub/agatha/predict/package.scala
agatha/hub/agatha/thrift/BUILD
agatha/hub/agatha/thrift/agatha.thrift
agatha/hub/agatha/thrift/featureSource.thrift
agatha/hub/agatha/util/BUILD
agatha/hub/agatha/util/CrossedPMIStatToModelledFeature.scala
agatha/hub/pmi/BUILD
agatha/hub/pmi/ModelCommon.scala
agatha/hub/pmi/PMI.scala
agatha/hub/pmi/PMISetExtractors.scala
agatha/hub/pmi/PMITypes.scala
agatha/hub/pmi/PreProcessors.scala
agatha/hub/pmi/examples/BUILD.bazel
agatha/hub/pmi/examples/TopFollowPmi.scala
agatha/hub/pmi/math/BUILD
agatha/hub/pmi/math/Math.scala
agatha/hub/pmi/math/aggregators/BUILD
agatha/hub/pmi/math/aggregators/Moments.scala
agatha/hub/pmi/math/aggregators/Percentiles.scala
agatha/scalding/AgathaFeaturesPredictJob.scala
agatha/scalding/NSFWBuildJob.scala
agatha/scalding/RateBasedBuildJob.scala
agatha/scalding/SpagathaBuildJob.scala
agatha/scalding/blink/BlinkScoreJobTemplate.scala
agatha/scalding/blink/ManhattanImportInjection.scala
agatha/scalding/data/ActiveUserFeaturesJob.scala
agatha/scalding/data/BUILD.bazel
agatha/scalding/data/DataLoader.scala
agatha/scalding/data/DataLoaderUtil.scala
agatha/scalding/data/FeatureExtractionTemplate.scala
agatha/scalding/data/loaders/AbuseReportGraphDataLoader.scala
agatha/scalding/data/loaders/BUILD.bazel
agatha/scalding/data/loaders/BlockGraphDataLoader.scala
agatha/scalding/data/loaders/CombinedUserDataLoader.scala
agatha/scalding/data/loaders/ContributorGraphDataLoader.scala
agatha/scalding/data/loaders/DirectMessageGraphDataLoader.scala
agatha/scalding/data/loaders/FavGraphDataLoader.scala
agatha/scalding/data/loaders/FavedTweetsDataLoader.scala
agatha/scalding/data/loaders/FollowGraphDataLoader.scala
agatha/scalding/data/loaders/HashtagTweetsDataLoader.scala
agatha/scalding/data/loaders/LegitTattleGraphDataLoader.scala
agatha/scalding/data/loaders/ListFollowerGraphDataLoader.scala
agatha/scalding/data/loaders/ListMembershipGraphDataLoader.scala
agatha/scalding/data/loaders/MostRecentEdgeSourceDataLoader.scala
agatha/scalding/data/loaders/MuteGraphDataLoader.scala
agatha/scalding/data/loaders/NonLegitTattlesNoBlocksGraphDataLoader.scala
agatha/scalding/data/loaders/RetweetedTweetsDataLoader.scala
agatha/scalding/data/loaders/TweetAuthorEngagementGraph.scala
agatha/scalding/labels/AgathaLabelManager.scala
agatha/scalding/labels/BUILD.bazel
agatha/scalding/labels/LabelExtractionTemplate.scala
agatha/scalding/labels/LabelUtil.scala
agatha/scalding/labels/blocks_per_fav/BUILD.bazel
agatha/scalding/labels/blocks_per_fav/BlocksPerFav.scala
agatha/scalding/labels/favs/BUILD.bazel
agatha/scalding/labels/favs/Favs.scala
agatha/scalding/labels/nsfw/BUILD.bazel
agatha/scalding/labels/nsfw/NSFWLabel.scala
agatha/scalding/labels/nsfw/NSFWLabelExtraction.scala
agatha/scalding/labels/nsfw/NsfwAgathaLabelManager.scala
agatha/scalding/labels/rate_based_labels/BUILD.bazel
agatha/scalding/labels/rate_based_labels/RateBasedLabels.scala
agatha/scalding/labels/rate_based_labels/RateBasedLabelsExtraction.scala
agatha/scalding/labels/reports_per_fav/BUILD.bazel
agatha/scalding/labels/reports_per_fav/ReportsPerFav.scala
agatha/scalding/labels/spam_reports_per_fav/BUILD.bazel
agatha/scalding/labels/spam_reports_per_fav/SpamReportsPerFav.scala
agatha/scalding/labels/spam_suspended/BUILD.bazel
agatha/scalding/labels/spam_suspended/SpamSuspendedLabel.scala
agatha/scalding/labels/spam_suspended/SpamSuspendedLabelExtraction.scala
agatha/scalding/quantile/BUILD.bazel
agatha/scalding/quantile/QuantileFeatureExport.scala
agatha/scalding/util/BUILD.bazel
agatha/scalding/util/FeaturesToLabels.scala
agatha/scalding/util/GetActiveUsers.scala
agatha/scalding/util/GetSuspendedUsers.scala
agatha/scalding/util/PredictionsToDataSetPipe.scala
agatha/thrift/agatha.thrift
bdsm/README.md
bdsm/proto/abuse_inference.proto
bdsm/pyproject.toml
bdsm/runtime/__init__.py
bdsm/runtime/action_names.json
bdsm/runtime/batch_prefetcher.py
bdsm/runtime/feature_norm.py
bdsm/runtime/gizmoduck_age.py
bdsm/runtime/gpu_scorer.py
bdsm/runtime/heads.py
bdsm/runtime/labels.py
bdsm/runtime/load_backbone.py
bdsm/runtime/login_starter_pack_counter.py
bdsm/runtime/loss.py
bdsm/runtime/manhattan_arrow_adapter.py
bdsm/runtime/manhattan_scorer.py
bdsm/runtime/metrics.py
bdsm/runtime/model.py
bdsm/runtime/pipeline_security.py
bdsm/runtime/proto_gen/__init__.py
bdsm/runtime/proto_gen/abuse_inference_pb2.py
bdsm/runtime/score_layout.py
bdsm/runtime/score_results_sink_focal.py
bdsm/runtime/sequence_cache.py
bdsm/runtime/sink_policy.yaml
bdsm/runtime/starter_pack_follows.py
bdsm/runtime/task_heads.py
bdsm/rust/abuse-v3-features/Cargo.toml
bdsm/rust/abuse-v3-features/src/derived.rs
bdsm/rust/abuse-v3-features/src/lib.rs
bdsm/rust/accumulator/Cargo.lock
bdsm/rust/accumulator/Cargo.toml
bdsm/rust/accumulator/Dockerfile
bdsm/rust/accumulator/src/main.rs
bdsm/rust/accumulator/src/trace.rs
bdsm/tests/conftest.py
bdsm/tests/test_feature_norm.py
bdsm/tests/test_heads.py
bdsm/tests/test_labels.py
bdsm/tests/test_loss.py
bdsm/tests/test_pipeline_security.py
bdsm/tests/test_score_layout.py
bdsm/tests/test_sink_policy.py
bdsm/tests/test_train_head.py
bdsm/training/__init__.py
bdsm/training/train_head.py
botmaker-rules/scarecrow/bot/AgathaSpamProduction__ApplySearchTopTweetLabel.bot
botmaker-rules/scarecrow/bot/BBQDuplicateTextProd.bot
botmaker-rules/scarecrow/bot/BBQDuplicateTextRepliesProd.bot
botmaker-rules/scarecrow/bot/FollowFromActorWithPinnedLowQualityOrBadUrl.bot
botmaker-rules/scarecrow/bot/GroxTweetProcessor.bot
botmaker-rules/scarecrow/bot/LQ_Tweets_With_LQ_URL_Verdict_At_Mention_To_NonFollower.bot
botmaker-rules/scarecrow/bot/LQ_Tweets_With_LQ_URL_Verdict_At_Mention_To_NonFollower_v2.bot
botmaker-rules/scarecrow/bot/NSFW_Card_Image_Media_To_URL_Verdict.bot
botmaker-rules/scarecrow/bot/NSFW_Card_Image_URL_to_Tweet_Verdict.bot
botmaker-rules/scarecrow/bot/NSFW_Grok_Generated_Image_To_URL_Verdict.bot
botmaker-rules/scarecrow/bot/NSFW_Grok_Share.bot
botmaker-rules/scarecrow/bot/NsfwTweetMediaProcessor.bot
botmaker-rules/scarecrow/bot/PinnedLowQualityOrBadUrl.bot
botmaker-rules/scarecrow/bot/ProductionAgatha__FilterOutOrganicNotifications.bot
botmaker-rules/scarecrow/bot/Tweet_Search_Blacklist_RTF_All_UNSAFE_URL_Sources.bot
botmaker-rules/scarecrow/bot/Tweet_Spam_High_Recall_RTF_All_Bad_URL_Sources.bot
botmaker-rules/scarecrow/bot/ViolenceAndGore_ImageModel_MTT.bot
botmaker-rules/scarecrow/bot/nsfw_user_write_user_label.bot
botmaker-rules/scarecrow/bot/rtf_tweets_on_unsafe_verdict.bot
botmaker-rules/scarecrow/bot/tweet_rtf_or_unrtf_on_bad_verdict.bot
botmaker-rules/scarecrow/derived-feature/AddToHLLForDataCenter.df
botmaker-rules/scarecrow/derived-feature/AddTwitterSupportGuanoNote.df
botmaker-rules/scarecrow/derived-feature/ApplyNsfwUserLabel.df
botmaker-rules/scarecrow/derived-feature/ApplyNsfwUserLabelOrCreateReport.df
botmaker-rules/scarecrow/derived-feature/BQ_to_BM_namespace.df
botmaker-rules/scarecrow/derived-feature/Coalesce.df
botmaker-rules/scarecrow/derived-feature/CreateRemediationFatigueNamespace.df
botmaker-rules/scarecrow/derived-feature/DayInSecs.df
botmaker-rules/scarecrow/derived-feature/EmptyLongList.df
botmaker-rules/scarecrow/derived-feature/EmptyStringSet.df
botmaker-rules/scarecrow/derived-feature/FollowerCountFromGizmoduck.df
botmaker-rules/scarecrow/derived-feature/GetDataCenterName.df
botmaker-rules/scarecrow/derived-feature/GetExpandedUrlsForTweet.df
botmaker-rules/scarecrow/derived-feature/GetGrokShareIdsFromGrokMediaId.df
botmaker-rules/scarecrow/derived-feature/GetHLLCountFromDataCenters.df
botmaker-rules/scarecrow/derived-feature/GetTweetAuthorId.df
botmaker-rules/scarecrow/derived-feature/GetTweetCardOrEmptyObject.df
botmaker-rules/scarecrow/derived-feature/GetTweetFullText.df
botmaker-rules/scarecrow/derived-feature/GetTweetLabelInfoFromURL.df
botmaker-rules/scarecrow/derived-feature/GetTweetOrNull.df
botmaker-rules/scarecrow/derived-feature/GetUrlResolutionChains.df
botmaker-rules/scarecrow/derived-feature/GetUserLabels.df
botmaker-rules/scarecrow/derived-feature/GetUserPinnedTweetIds.df
botmaker-rules/scarecrow/derived-feature/GetVerifiedFollowers.df
botmaker-rules/scarecrow/derived-feature/HasBigQuerytoBotmakerLabel.df
botmaker-rules/scarecrow/derived-feature/HasLabel.df
botmaker-rules/scarecrow/derived-feature/HasRemediationFatigueLabel.df
botmaker-rules/scarecrow/derived-feature/HighPageRankThreshold.df
botmaker-rules/scarecrow/derived-feature/IsHighPageRankUser.df
botmaker-rules/scarecrow/derived-feature/IsHighPrecisionNsfw.df
botmaker-rules/scarecrow/derived-feature/IsHighPrecisionNsfwNewModelLogic.df
botmaker-rules/scarecrow/derived-feature/IsHighRecallNsfw.df
botmaker-rules/scarecrow/derived-feature/IsHighRecallNsfwNewModelLogic.df
botmaker-rules/scarecrow/derived-feature/IsNearPerfectNsfw.df
botmaker-rules/scarecrow/derived-feature/IsNearPerfectNsfwNewModelLogic.df
botmaker-rules/scarecrow/derived-feature/IsTweetFound.df
botmaker-rules/scarecrow/derived-feature/IsUserGoldVerified.df
botmaker-rules/scarecrow/derived-feature/IsUserGrayVerified.df
botmaker-rules/scarecrow/derived-feature/OneDayInMillis.df
botmaker-rules/scarecrow/derived-feature/OneDayInSecs.df
botmaker-rules/scarecrow/derived-feature/OneMinuteInSecs.df
botmaker-rules/scarecrow/derived-feature/OneWeekInSecs.df
botmaker-rules/scarecrow/derived-feature/RULE_ID.df
botmaker-rules/scarecrow/derived-feature/RemediationFatigueLabel.df
botmaker-rules/scarecrow/derived-feature/SetBigQuerytoBotmakerLabel.df
botmaker-rules/scarecrow/derived-feature/SetRemediationFatigueLabel.df
botmaker-rules/scarecrow/derived-feature/SetTweetRtfApplyLabelWithExpirationMs.df
botmaker-rules/scarecrow/derived-feature/SevenDaysInSecs.df
botmaker-rules/scarecrow/derived-feature/SpammerIdString.df
botmaker-rules/scarecrow/derived-feature/StringIdListToLongList.df
botmaker-rules/scarecrow/derived-feature/SubLongList.df
botmaker-rules/scarecrow/derived-feature/ThirtyDaysInSecs.df
botmaker-rules/scarecrow/derived-feature/TwitterSafetyUserId.df
botmaker/BUILD.bazel
botmaker/CONFIG.ini
botmaker/botmaker_aggregator/src/main/scala/com/twitter/botmaker/BUILD
botmaker/botmaker_aggregator/src/main/scala/com/twitter/botmaker/runtime/LocalAggregator.scala
botmaker/botmaker_aggregator/src/main/scala/com/twitter/botmaker/runtime/MoniodAggregator.scala
botmaker/botmaker_aggregator/src/main/scala/com/twitter/botmaker/runtime/config/BloomFilterAggregator.scala
botmaker/botmaker_aggregator/src/main/scala/com/twitter/botmaker/runtime/config/ComboAggregator.scala
botmaker/botmaker_aggregator/src/main/scala/com/twitter/botmaker/runtime/config/CounterAggregator.scala
botmaker/botmaker_aggregator/src/main/scala/com/twitter/botmaker/runtime/config/HllAggregator.scala
botmaker/botmaker_aggregator/src/main/scala/com/twitter/botmaker/runtime/config/LocalAggregatorConfigs.scala
botmaker/botmaker_aggregator/src/main/scala/com/twitter/botmaker/runtime/config/QTreeAggregator.scala
botmaker/botmaker_aggregator/src/main/scala/com/twitter/botmaker/runtime/config/SetAggregator.scala
botmaker/botmaker_aggregator/src/main/scala/com/twitter/botmaker/runtime/config/SimpleStatsAggregator.scala
botmaker/botmaker_aggregator/src/main/scala/com/twitter/botmaker/runtime/config/SketchMapAggregator.scala
botmaker/botmaker_aggregator/src/main/scala/com/twitter/botmaker/runtime/function/BloomFilterFunctions.scala
botmaker/botmaker_aggregator/src/main/scala/com/twitter/botmaker/runtime/function/HllFunctions.scala
botmaker/botmaker_aggregator/src/main/scala/com/twitter/botmaker/runtime/function/QTreeFunctions.scala
botmaker/botmaker_aggregator/src/main/scala/com/twitter/botmaker/runtime/function/SketchMapFunctions.scala
botmaker/botmaker_app/src/main/resources/BUILD
botmaker/botmaker_app/src/main/resources/logback.xml
botmaker/botmaker_app/src/main/scala/com/twitter/botmaker/app/client/AppClient.scala
botmaker/botmaker_app/src/main/scala/com/twitter/botmaker/app/client/BUILD.bazel
botmaker/botmaker_app/src/main/scala/com/twitter/botmaker/app/client/BotMakerAppClient.scala
botmaker/botmaker_app/src/main/scala/com/twitter/botmaker/app/module/AppBotMaker.scala
botmaker/botmaker_app/src/main/scala/com/twitter/botmaker/app/module/BUILD
botmaker/botmaker_app/src/main/scala/com/twitter/botmaker/app/module/BotMakerApp.scala
botmaker/botmaker_app/src/main/scala/com/twitter/botmaker/app/module/BotMakerAppController.scala
botmaker/botmaker_app/src/main/scala/com/twitter/botmaker/app/module/BotMakerAppModule.scala
botmaker/botmaker_app/src/main/scala/com/twitter/botmaker/app/module/InjectionNamedConstants.scala
botmaker/botmaker_app/src/main/scala/com/twitter/botmaker/app/publisher/function/Arguments.scala
botmaker/botmaker_app/src/main/scala/com/twitter/botmaker/app/publisher/function/WriteToConfigBus.scala
botmaker/botmaker_app/src/main/scala/com/twitter/botmaker/app/publisher/function/WriteToFile.scala
botmaker/botmaker_app/src/main/scala/com/twitter/botmaker/app/runtime/BUILD.bazel
botmaker/botmaker_app/src/main/scala/com/twitter/botmaker/app/runtime/StdBotMakerAppRuntime.scala
botmaker/botmaker_app/src/main/scala/com/twitter/botmaker/app/server/BUILD.bazel
botmaker/botmaker_app/src/main/scala/com/twitter/botmaker/app/server/BotMakerAppServer.scala
botmaker/botmaker_app/src/main/scala/com/twitter/botmaker/app/server/BotMakerAppThriftController.scala
botmaker/botmaker_app/src/main/scala/com/twitter/botmaker/app/util/BUILD
botmaker/botmaker_app/src/main/scala/com/twitter/botmaker/app/util/JsonUtils.scala
botmaker/botmaker_common/src/main/scala/com/twitter/botmaker/common/BUILD
botmaker/botmaker_common/src/main/scala/com/twitter/botmaker/common/UserAgent.scala
botmaker/botmaker_common/src/main/scala/com/twitter/botmaker/common/UserAgentProperties.scala
botmaker/botmaker_eventbus/src/main/scala/com/twitter/botmaker/BUILD.bazel
botmaker/botmaker_eventbus/src/main/scala/com/twitter/botmaker/runtime/EventBusContainer.scala
botmaker/botmaker_eventbus/src/main/scala/com/twitter/botmaker/runtime/EventPublisher.scala
botmaker/botmaker_eventbus/src/main/scala/com/twitter/botmaker/runtime/EventSubscriber.scala
botmaker/botmaker_eventbus/src/main/scala/com/twitter/botmaker/runtime/KafkaConsumer.scala
botmaker/botmaker_eventbus/src/main/scala/com/twitter/botmaker/runtime/KafkaProducer.scala
botmaker/botmaker_eventbus/src/main/scala/com/twitter/botmaker/runtime/KafkaSerdes.scala
botmaker/botmaker_eventbus/src/main/scala/com/twitter/botmaker/runtime/TwitterKafkaUtil.scala
botmaker/botmaker_eventbus/src/main/scala/com/twitter/botmaker/runtime/config/EventBusConfigs.scala
botmaker/botmaker_eventbus/src/main/scala/com/twitter/botmaker/runtime/config/EventPublisherConfigs.scala
botmaker/botmaker_eventbus/src/main/scala/com/twitter/botmaker/runtime/config/EventSubscriberConfigs.scala
botmaker/botmaker_eventbus/src/main/scala/com/twitter/botmaker/runtime/config/KafkaConsumerConfigs.scala
botmaker/botmaker_eventbus/src/main/scala/com/twitter/botmaker/runtime/config/KafkaProducerConfigs.scala
botmaker/botmaker_http/src/main/scala/com/twitter/botmaker/BUILD
botmaker/botmaker_http/src/main/scala/com/twitter/botmaker/runtime/HttpEndpoint.scala
botmaker/botmaker_http/src/main/scala/com/twitter/botmaker/runtime/config/HttpEndpointConfigs.scala
botmaker/botmaker_loader/src/main/scala/com/twitter/botmaker/loader/BUILD
botmaker/botmaker_loader/src/main/scala/com/twitter/botmaker/loader/BotmakerRulesConfigbusLoader.scala
botmaker/botmaker_loader/src/main/scala/com/twitter/botmaker/loader/ConfigbusLoader.scala
botmaker/botmaker_manhattan/src/main/scala/com/twitter/botmaker/BUILD
botmaker/botmaker_manhattan/src/main/scala/com/twitter/botmaker/runtime/ManhattanClient.scala
botmaker/botmaker_manhattan/src/main/scala/com/twitter/botmaker/runtime/ManhattanContainer.scala
botmaker/botmaker_manhattan/src/main/scala/com/twitter/botmaker/runtime/ManhattanEndpoint.scala
botmaker/botmaker_manhattan/src/main/scala/com/twitter/botmaker/runtime/config/ManhattanClientConfigs.scala
botmaker/botmaker_manhattan/src/main/scala/com/twitter/botmaker/runtime/config/ManhattanConfigs.scala
botmaker/botmaker_manhattan/src/main/scala/com/twitter/botmaker/runtime/config/ManhattanEndpointConfigs.scala
botmaker/botmaker_memcached/src/main/scala/com/twitter/botmaker/BUILD
botmaker/botmaker_memcached/src/main/scala/com/twitter/botmaker/runtime/MemCachedClient.scala
botmaker/botmaker_memcached/src/main/scala/com/twitter/botmaker/runtime/MemCachedContainer.scala
botmaker/botmaker_memcached/src/main/scala/com/twitter/botmaker/runtime/MemCachedCounter.scala
botmaker/botmaker_memcached/src/main/scala/com/twitter/botmaker/runtime/MemCachedEndpoint.scala
botmaker/botmaker_memcached/src/main/scala/com/twitter/botmaker/runtime/config/MemCachedClientConfigs.scala
botmaker/botmaker_memcached/src/main/scala/com/twitter/botmaker/runtime/config/MemCachedConfigs.scala
botmaker/botmaker_memcached/src/main/scala/com/twitter/botmaker/runtime/config/MemCachedCounterConfigs.scala
botmaker/botmaker_memcached/src/main/scala/com/twitter/botmaker/runtime/config/MemCachedEndpointConfigs.scala
botmaker/botmaker_package/src/main/scala/com/twitter/botmaker/botmaker_package/BUILD.bazel
botmaker/botmaker_package/src/main/scala/com/twitter/botmaker/botmaker_package/BotMakerPackageDetails.scala
botmaker/botmaker_thrift/src/main/scala/com/twitter/botmaker/BUILD
botmaker/botmaker_thrift/src/main/scala/com/twitter/botmaker/runtime/ScribePublisher.scala
botmaker/botmaker_thrift/src/main/scala/com/twitter/botmaker/runtime/ThriftEndpoint.scala
botmaker/botmaker_thrift/src/main/scala/com/twitter/botmaker/runtime/config/ScribePublisherConfigs.scala
botmaker/botmaker_thrift/src/main/scala/com/twitter/botmaker/runtime/config/ThriftEndpointConfigs.scala
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/BUILD
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfArkoseVerifyEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfAudioSpaceBaseEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfAudioSpaceCoHostJoinEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfAudioSpaceCoHostLeaveEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfAudioSpaceEndEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfAudioSpaceListenerJoinEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfAudioSpaceListenerLeaveEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfAudioSpacePublishEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfAudioSpaceReplayToggleOffEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfAudioSpaceScheduledEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfAudioSpaceSpeakerPublishEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfAudioSpaceTopicsUpdatedEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfAudioSpaceTranscriptionEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfAudioSpaceUserBannedEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfAudioSpaceUserUnbannedEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfAuthCompletion.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfAuthTransactionLog.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfBirdwatchStatusChangeEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfBookmarkEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfBotSmyterLabel.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfBouncerEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfCastleEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfClientApplicationEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfClientEventTcoResolution.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfCommunityEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfCommunityJoinEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfCommunityJoinRequestsAutoEnrollData.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfCommunityPinEntryData.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfCommunityRuleCreateData.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfCommunityRuleRemoveData.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfCommunityRuleUpdateData.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfCommunityTweetHideData.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfCommunityTweetReportData.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfCommunityUnpinEntryData.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfDMConversationReport.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfDMReport.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfDestroyStatus.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfEmailChange.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfEventBusFanoutEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfExploreClientEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfFavorite.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfFilteredAuthRequest.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfGrokShareEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfHealthGenericEntityEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfHealthSideEffectEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfHmlSignupPredictionEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfInAppReport.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfListReport.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfLoginChallengeAction.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfMediaUpdate.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfNsfwFlag.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfPeriscopePublishBroadcastEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfPinkStealthResolutionsNotification.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfPromotedTweet.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfPublishedTicket.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfReportAsSpam.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfRtpCaseUpdateEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfSgsBlockGraphEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfSgsFollowGraphEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfSgsListCreateRequestResult.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfSgsListMemberAddRequestResult.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfSgsListMemberRemoveRequestResult.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfSgsListRemoveRequestResult.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfSgsListSubscribeRequestResult.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfSgsListUnsubscribeRequestResult.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfSgsListUpdateRequestResult.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfSgsMuteGraphEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfSgsWriteRequestResult.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfSoftFollowEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfSqrlEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfThornInfo.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfTitleUpdatedEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfTweet.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfTweetCreate.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfTweetDelete.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfTweetReport.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfTweetSafetyLabelEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfTweetUndelete.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfTwitterContext.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfUnbookmarkEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfUnfavorite.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfUnifiedPostAnnotationsEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfUrlEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfUrlReputationChange.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfUserCreate.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfUserModification.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfUserReport.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfXchatMessageCreateEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/FeaturesOfXchatMessageEvent.java
botmaker/scarecrow_features/src/main/java/com/twitter/scarecrow/features/SqrlEventThriftSimpleJSONProtocol.java
botmaker/src/antlr/com/twitter/botmaker/BUILD
botmaker/src/antlr/com/twitter/botmaker/CONFIG.ini
botmaker/src/antlr/com/twitter/botmaker/antlr/BotMaker.g
botmaker/src/java/com/twitter/botmaker/ASTNode.java
botmaker/src/java/com/twitter/botmaker/BUILD
botmaker/src/java/com/twitter/botmaker/CONFIG.ini
botmaker/src/java/com/twitter/botmaker/Context.java
botmaker/src/java/com/twitter/botmaker/ContextBuilder.java
botmaker/src/java/com/twitter/botmaker/Extractor.java
botmaker/src/java/com/twitter/botmaker/compiler/ActionLevel.java
botmaker/src/java/com/twitter/botmaker/compiler/BotMakerDoc.java
botmaker/src/java/com/twitter/botmaker/compiler/BotMakerFunction.java
botmaker/src/java/com/twitter/botmaker/compiler/ClassCache.java
botmaker/src/java/com/twitter/botmaker/compiler/Compiler.java
botmaker/src/java/com/twitter/botmaker/compiler/CompilerBuilder.java
botmaker/src/java/com/twitter/botmaker/compiler/CompilerContext.java
botmaker/src/java/com/twitter/botmaker/compiler/CompilerScope.java
botmaker/src/java/com/twitter/botmaker/compiler/CompilerUnit.java
botmaker/src/java/com/twitter/botmaker/compiler/DerivedFeature.java
botmaker/src/java/com/twitter/botmaker/compiler/DerivedFeatureProvider.java
botmaker/src/java/com/twitter/botmaker/compiler/Fingerprint.java
botmaker/src/java/com/twitter/botmaker/compiler/InterruptibleCharSequence.java
botmaker/src/java/com/twitter/botmaker/compiler/Mock.java
botmaker/src/java/com/twitter/botmaker/compiler/Parameter.java
botmaker/src/java/com/twitter/botmaker/compiler/Parser.java
botmaker/src/java/com/twitter/botmaker/compiler/RegexCache.java
botmaker/src/java/com/twitter/botmaker/compiler/Serializer.java
botmaker/src/java/com/twitter/botmaker/compiler/Timeout.java
botmaker/src/java/com/twitter/botmaker/compiler/UsageUnit.java
botmaker/src/java/com/twitter/botmaker/compiler/exceptions/BadFetchedDataException.java
botmaker/src/java/com/twitter/botmaker/compiler/exceptions/ContextCancelledException.java
botmaker/src/java/com/twitter/botmaker/compiler/exceptions/FunctionFailure.java
botmaker/src/java/com/twitter/botmaker/compiler/exceptions/MissingFeatureException.java
botmaker/src/java/com/twitter/botmaker/compiler/exceptions/ParseFailure.java
botmaker/src/java/com/twitter/botmaker/compiler/exceptions/RegexTimeoutException.java
botmaker/src/java/com/twitter/botmaker/compiler/exceptions/RuntimeFailure.java
botmaker/src/java/com/twitter/botmaker/compiler/exceptions/SemanticCheckFailure.java
botmaker/src/java/com/twitter/botmaker/compiler/thrift/FieldMetaData.java
botmaker/src/java/com/twitter/botmaker/compiler/thrift/FieldValueMetaData.java
botmaker/src/java/com/twitter/botmaker/compiler/thrift/ListMetaData.java
botmaker/src/java/com/twitter/botmaker/compiler/thrift/MapMetaData.java
botmaker/src/java/com/twitter/botmaker/compiler/thrift/PrimitiveValueMetaData.java
botmaker/src/java/com/twitter/botmaker/compiler/thrift/SetMetaData.java
botmaker/src/java/com/twitter/botmaker/compiler/thrift/TBaseStructMetaData.java
botmaker/src/java/com/twitter/botmaker/compiler/thrift/TEnumMetaData.java
botmaker/src/java/com/twitter/botmaker/compiler/thrift/TFieldRequirementType.java
botmaker/src/java/com/twitter/botmaker/compiler/thrift/TType.java
botmaker/src/java/com/twitter/botmaker/compiler/thrift/ThriftEnumMetaData.java
botmaker/src/java/com/twitter/botmaker/compiler/thrift/ThriftStructMetaData.java
botmaker/src/java/com/twitter/botmaker/compiler/tuples/OutputKey.java
botmaker/src/java/com/twitter/botmaker/compiler/tuples/Pair.java
botmaker/src/java/com/twitter/botmaker/compiler/tuples/StackFrame.java
botmaker/src/java/com/twitter/botmaker/compiler/tuples/StructTuple.java
botmaker/src/java/com/twitter/botmaker/compiler/tuples/Symbol.java
botmaker/src/java/com/twitter/botmaker/compiler/tuples/Try.java
botmaker/src/java/com/twitter/botmaker/compiler/tuples/TryWithStack.java
botmaker/src/java/com/twitter/botmaker/compiler/tuples/Tuple.java
botmaker/src/java/com/twitter/botmaker/compiler/tuples/Tuple3.java
botmaker/src/java/com/twitter/botmaker/compiler/tuples/Tuple4.java
botmaker/src/java/com/twitter/botmaker/compiler/types/FieldAccessibleType.java
botmaker/src/java/com/twitter/botmaker/compiler/types/StructTupleType.java
botmaker/src/java/com/twitter/botmaker/compiler/types/Symbol.java
botmaker/src/java/com/twitter/botmaker/compiler/types/ThriftEnumType.java
botmaker/src/java/com/twitter/botmaker/compiler/types/ThriftStructType.java
botmaker/src/java/com/twitter/botmaker/compiler/types/ThriftType.java
botmaker/src/java/com/twitter/botmaker/compiler/types/TupleType.java
botmaker/src/java/com/twitter/botmaker/compiler/types/Type.java
botmaker/src/java/com/twitter/botmaker/compiler/types/TypeCompiler.java
botmaker/src/java/com/twitter/botmaker/compiler/types/TypeContext.java
botmaker/src/java/com/twitter/botmaker/config/ConfigContainer.java
botmaker/src/java/com/twitter/botmaker/config/ConfigNode.java
botmaker/src/java/com/twitter/botmaker/function/Block.java
botmaker/src/java/com/twitter/botmaker/function/Constant.java
botmaker/src/java/com/twitter/botmaker/function/DerivedFeatureCall.java
botmaker/src/java/com/twitter/botmaker/function/Do.java
botmaker/src/java/com/twitter/botmaker/function/DoAsync.java
botmaker/src/java/com/twitter/botmaker/function/DoSequential.java
botmaker/src/java/com/twitter/botmaker/function/FunctionNode.java
botmaker/src/java/com/twitter/botmaker/function/FunctionNode0.java
botmaker/src/java/com/twitter/botmaker/function/FunctionNode1.java
botmaker/src/java/com/twitter/botmaker/function/FunctionNode1O1.java
botmaker/src/java/com/twitter/botmaker/function/FunctionNode1O3.java
botmaker/src/java/com/twitter/botmaker/function/FunctionNode2.java
botmaker/src/java/com/twitter/botmaker/function/FunctionNode2O1.java
botmaker/src/java/com/twitter/botmaker/function/FunctionNode3.java
botmaker/src/java/com/twitter/botmaker/function/FunctionNode6O5.java
botmaker/src/java/com/twitter/botmaker/function/GeneralNode.java
botmaker/src/java/com/twitter/botmaker/function/IfThenElse.java
botmaker/src/java/com/twitter/botmaker/function/Val.java
botmaker/src/java/com/twitter/botmaker/function/Variable.java
botmaker/src/java/com/twitter/botmaker/function/With.java
botmaker/src/java/com/twitter/botmaker/function/bitwise/BitwiseAnd.java
botmaker/src/java/com/twitter/botmaker/function/bitwise/BitwiseInvert.java
botmaker/src/java/com/twitter/botmaker/function/bitwise/BitwiseOp.java
botmaker/src/java/com/twitter/botmaker/function/bitwise/BitwiseOr.java
botmaker/src/java/com/twitter/botmaker/function/bitwise/BitwiseSignedLeftShift.java
botmaker/src/java/com/twitter/botmaker/function/bitwise/BitwiseSignedRightShift.java
botmaker/src/java/com/twitter/botmaker/function/bitwise/BitwiseUnsignedRightShift.java
botmaker/src/java/com/twitter/botmaker/function/bitwise/BitwiseXor.java
botmaker/src/java/com/twitter/botmaker/function/bitwise/ReverseBits.java
botmaker/src/java/com/twitter/botmaker/function/collection/Any.java
botmaker/src/java/com/twitter/botmaker/function/collection/Contains.java
botmaker/src/java/com/twitter/botmaker/function/collection/Copy.java
botmaker/src/java/com/twitter/botmaker/function/collection/Count.java
botmaker/src/java/com/twitter/botmaker/function/collection/Distinct.java
botmaker/src/java/com/twitter/botmaker/function/collection/ElementAtIndex.java
botmaker/src/java/com/twitter/botmaker/function/collection/Filter.java
botmaker/src/java/com/twitter/botmaker/function/collection/First.java
botmaker/src/java/com/twitter/botmaker/function/collection/FirstN.java
botmaker/src/java/com/twitter/botmaker/function/collection/Flatten.java
botmaker/src/java/com/twitter/botmaker/function/collection/Fold.java
botmaker/src/java/com/twitter/botmaker/function/collection/ForEach.java
botmaker/src/java/com/twitter/botmaker/function/collection/IndexAccessor.java
botmaker/src/java/com/twitter/botmaker/function/collection/IsCollection.java
botmaker/src/java/com/twitter/botmaker/function/collection/Last.java
botmaker/src/java/com/twitter/botmaker/function/collection/LastN.java
botmaker/src/java/com/twitter/botmaker/function/collection/ListAppend.java
botmaker/src/java/com/twitter/botmaker/function/collection/ListConcat.java
botmaker/src/java/com/twitter/botmaker/function/collection/ListJoin.java
botmaker/src/java/com/twitter/botmaker/function/collection/ListOperator.java
botmaker/src/java/com/twitter/botmaker/function/collection/ListPrepend.java
botmaker/src/java/com/twitter/botmaker/function/collection/MapContains.java
botmaker/src/java/com/twitter/botmaker/function/collection/MapEntries.java
botmaker/src/java/com/twitter/botmaker/function/collection/MapGet.java
botmaker/src/java/com/twitter/botmaker/function/collection/MapKeys.java
botmaker/src/java/com/twitter/botmaker/function/collection/MapMerge.java
botmaker/src/java/com/twitter/botmaker/function/collection/MapOperator.java
botmaker/src/java/com/twitter/botmaker/function/collection/MapRemove.java
botmaker/src/java/com/twitter/botmaker/function/collection/MapValues.java
botmaker/src/java/com/twitter/botmaker/function/collection/PairFirst.java
botmaker/src/java/com/twitter/botmaker/function/collection/PairSecond.java
botmaker/src/java/com/twitter/botmaker/function/collection/Range.java
botmaker/src/java/com/twitter/botmaker/function/collection/SetDiff.java
botmaker/src/java/com/twitter/botmaker/function/collection/SetIntersect.java
botmaker/src/java/com/twitter/botmaker/function/collection/SetOperator.java
botmaker/src/java/com/twitter/botmaker/function/collection/SetSymmetricDiff.java
botmaker/src/java/com/twitter/botmaker/function/collection/SetUnion.java
botmaker/src/java/com/twitter/botmaker/function/collection/Slice.java
botmaker/src/java/com/twitter/botmaker/function/collection/Sort.java
botmaker/src/java/com/twitter/botmaker/function/collection/ToStructTuple.java
botmaker/src/java/com/twitter/botmaker/function/collection/ToTuple.java
botmaker/src/java/com/twitter/botmaker/function/conversion/Cast.java
botmaker/src/java/com/twitter/botmaker/function/conversion/FromBase64.java
botmaker/src/java/com/twitter/botmaker/function/conversion/FromHex.java
botmaker/src/java/com/twitter/botmaker/function/conversion/StringFromBase64.java
botmaker/src/java/com/twitter/botmaker/function/conversion/StringToBase64.java
botmaker/src/java/com/twitter/botmaker/function/conversion/ThriftFromDict.java
botmaker/src/java/com/twitter/botmaker/function/conversion/ToBase64.java
botmaker/src/java/com/twitter/botmaker/function/conversion/ToBinary.java
botmaker/src/java/com/twitter/botmaker/function/conversion/ToDouble.java
botmaker/src/java/com/twitter/botmaker/function/conversion/ToHex.java
botmaker/src/java/com/twitter/botmaker/function/conversion/ToList.java
botmaker/src/java/com/twitter/botmaker/function/conversion/ToLong.java
botmaker/src/java/com/twitter/botmaker/function/conversion/ToMap.java
botmaker/src/java/com/twitter/botmaker/function/conversion/ToPair.java
botmaker/src/java/com/twitter/botmaker/function/conversion/ToScript.java
botmaker/src/java/com/twitter/botmaker/function/conversion/ToSet.java
botmaker/src/java/com/twitter/botmaker/function/conversion/ToString.java
botmaker/src/java/com/twitter/botmaker/function/conversion/ToThrift.java
botmaker/src/java/com/twitter/botmaker/function/datetime/CurrentTimeMs.java
botmaker/src/java/com/twitter/botmaker/function/datetime/StringToTimeMs.java
botmaker/src/java/com/twitter/botmaker/function/datetime/TimeMsToString.java
botmaker/src/java/com/twitter/botmaker/function/exception/Assert.java
botmaker/src/java/com/twitter/botmaker/function/exception/Try.java
botmaker/src/java/com/twitter/botmaker/function/exception/TryOrElse.java
botmaker/src/java/com/twitter/botmaker/function/exception/TryWithStack.java
botmaker/src/java/com/twitter/botmaker/function/feature/Exists.java
botmaker/src/java/com/twitter/botmaker/function/feature/GetOrElse.java
botmaker/src/java/com/twitter/botmaker/function/feature/InputFeature.java
botmaker/src/java/com/twitter/botmaker/function/feature/OutputFeature.java
botmaker/src/java/com/twitter/botmaker/function/logic/BatchedOr.java
botmaker/src/java/com/twitter/botmaker/function/logic/Conjunction.java
botmaker/src/java/com/twitter/botmaker/function/logic/Disjunction.java
botmaker/src/java/com/twitter/botmaker/function/logic/Equals.java
botmaker/src/java/com/twitter/botmaker/function/logic/GreaterThan.java
botmaker/src/java/com/twitter/botmaker/function/logic/GreaterThanOrEquals.java
botmaker/src/java/com/twitter/botmaker/function/logic/LessThan.java
botmaker/src/java/com/twitter/botmaker/function/logic/LessThanOrEquals.java
botmaker/src/java/com/twitter/botmaker/function/logic/NotEquals.java
botmaker/src/java/com/twitter/botmaker/function/math/Abs.java
botmaker/src/java/com/twitter/botmaker/function/math/ArithmeticOperation.java
botmaker/src/java/com/twitter/botmaker/function/math/Ceil.java
botmaker/src/java/com/twitter/botmaker/function/math/Exp.java
botmaker/src/java/com/twitter/botmaker/function/math/Floor.java
botmaker/src/java/com/twitter/botmaker/function/math/Ln.java
botmaker/src/java/com/twitter/botmaker/function/math/Max.java
botmaker/src/java/com/twitter/botmaker/function/math/Min.java
botmaker/src/java/com/twitter/botmaker/function/math/Mod.java
botmaker/src/java/com/twitter/botmaker/function/math/Negate.java
botmaker/src/java/com/twitter/botmaker/function/math/Pow.java
botmaker/src/java/com/twitter/botmaker/function/math/Random.java
botmaker/src/java/com/twitter/botmaker/function/math/Round.java
botmaker/src/java/com/twitter/botmaker/function/math/Sqrt.java
botmaker/src/java/com/twitter/botmaker/function/misc/DebugOutput.java
botmaker/src/java/com/twitter/botmaker/function/misc/FarmFingerprintAsLong.java
botmaker/src/java/com/twitter/botmaker/function/misc/GetMurmur3Hashes.java
botmaker/src/java/com/twitter/botmaker/function/misc/GetStackTrace.java
botmaker/src/java/com/twitter/botmaker/function/misc/InstanceOf.java
botmaker/src/java/com/twitter/botmaker/function/misc/Nop.java
botmaker/src/java/com/twitter/botmaker/function/misc/Print.java
botmaker/src/java/com/twitter/botmaker/function/misc/SHA256.java
botmaker/src/java/com/twitter/botmaker/function/misc/TestRun.java
botmaker/src/java/com/twitter/botmaker/function/misc/TypeName.java
botmaker/src/java/com/twitter/botmaker/function/misc/UUID.java
botmaker/src/java/com/twitter/botmaker/function/string/Chr.java
botmaker/src/java/com/twitter/botmaker/function/string/Concat.java
botmaker/src/java/com/twitter/botmaker/function/string/CosineDist.java
botmaker/src/java/com/twitter/botmaker/function/string/EndsWith.java
botmaker/src/java/com/twitter/botmaker/function/string/HammingDist.java
botmaker/src/java/com/twitter/botmaker/function/string/IndexOf.java
botmaker/src/java/com/twitter/botmaker/function/string/Join.java
botmaker/src/java/com/twitter/botmaker/function/string/LastIndexOf.java
botmaker/src/java/com/twitter/botmaker/function/string/Quotes.java
botmaker/src/java/com/twitter/botmaker/function/string/RegexExtract.java
botmaker/src/java/com/twitter/botmaker/function/string/RegexMatch.java
botmaker/src/java/com/twitter/botmaker/function/string/Replace.java
botmaker/src/java/com/twitter/botmaker/function/string/SplitString.java
botmaker/src/java/com/twitter/botmaker/function/string/StartsWith.java
botmaker/src/java/com/twitter/botmaker/function/string/StrLen.java
botmaker/src/java/com/twitter/botmaker/function/string/StringFormat.java
botmaker/src/java/com/twitter/botmaker/function/string/ToLower.java
botmaker/src/java/com/twitter/botmaker/function/string/ToUpper.java
botmaker/src/java/com/twitter/botmaker/function/string/Trim.java
botmaker/src/java/com/twitter/botmaker/function/thrift/FieldAccessor.java
botmaker/src/java/com/twitter/botmaker/function/thrift/ThriftOperator.java
botmaker/src/java/com/twitter/botmaker/function/thrift/ThriftStructOperator.java
botmaker/src/java/com/twitter/botmaker/runtime/Runtime.java
botmaker/src/java/com/twitter/botmaker/util/TriConsumer.java
botmaker/src/scala/com/twitter/botmaker/BUILD
botmaker/src/scala/com/twitter/botmaker/CONFIG.ini
botmaker/src/scala/com/twitter/botmaker/FunctionUnit.scala
botmaker/src/scala/com/twitter/botmaker/FunctionUnitGen.scala
botmaker/src/scala/com/twitter/botmaker/common/AsyncRateLimiter.scala
botmaker/src/scala/com/twitter/botmaker/common/BatchDispatcher.scala
botmaker/src/scala/com/twitter/botmaker/common/FeatureDataConverter.scala
botmaker/src/scala/com/twitter/botmaker/common/RatelimitedLogger.scala
botmaker/src/scala/com/twitter/botmaker/common/TypedFeatureDataInjection.scala
botmaker/src/scala/com/twitter/botmaker/common/Using.scala
botmaker/src/scala/com/twitter/botmaker/compiler/types/ScalaType.scala
botmaker/src/scala/com/twitter/botmaker/loader/Loader.scala
botmaker/src/scala/com/twitter/botmaker/loader/Scheduler.scala
botmaker/src/scala/com/twitter/botmaker/rule/ActionRateLimiter.scala
botmaker/src/scala/com/twitter/botmaker/rule/BotMaker.scala
botmaker/src/scala/com/twitter/botmaker/rule/ConfigContainer.scala
botmaker/src/scala/com/twitter/botmaker/rule/DerivedFeatureContainer.scala
botmaker/src/scala/com/twitter/botmaker/rule/EventContext.scala
botmaker/src/scala/com/twitter/botmaker/rule/EventEvaluator.scala
botmaker/src/scala/com/twitter/botmaker/rule/EventOutput.scala
botmaker/src/scala/com/twitter/botmaker/rule/EventProcessor.scala
botmaker/src/scala/com/twitter/botmaker/rule/ExceptionCategory.scala
botmaker/src/scala/com/twitter/botmaker/rule/ExprCache.scala
botmaker/src/scala/com/twitter/botmaker/rule/ExtractorVisitorUnit.scala
botmaker/src/scala/com/twitter/botmaker/rule/FailureCollector.scala
botmaker/src/scala/com/twitter/botmaker/rule/InputProvider.scala
botmaker/src/scala/com/twitter/botmaker/rule/OutputCollector.scala
botmaker/src/scala/com/twitter/botmaker/rule/Package.scala
botmaker/src/scala/com/twitter/botmaker/rule/ProfilingCollector.scala
botmaker/src/scala/com/twitter/botmaker/rule/RuleAst.scala
botmaker/src/scala/com/twitter/botmaker/rule/RuleAstExtractorForAnalysis.scala
botmaker/src/scala/com/twitter/botmaker/rule/RuleContainer.scala
botmaker/src/scala/com/twitter/botmaker/rule/RuleContext.scala
botmaker/src/scala/com/twitter/botmaker/rule/RuleEvaluator.scala
botmaker/src/scala/com/twitter/botmaker/rule/RuleResult.scala
botmaker/src/scala/com/twitter/botmaker/rule/StatCollector.scala
botmaker/src/scala/com/twitter/botmaker/rule/config/SystemConfigs.scala
botmaker/src/scala/com/twitter/botmaker/rule/function/CacheGet.scala
botmaker/src/scala/com/twitter/botmaker/rule/function/CacheSet.scala
botmaker/src/scala/com/twitter/botmaker/rule/function/FeatureDataMapToInputFeatures.scala
botmaker/src/scala/com/twitter/botmaker/rule/function/GetFunctionOrFeatureDirectUsages.scala
botmaker/src/scala/com/twitter/botmaker/rule/function/GetRule.scala
botmaker/src/scala/com/twitter/botmaker/rule/function/InputFeatures.scala
botmaker/src/scala/com/twitter/botmaker/rule/function/IsFunctionOrFeatureUsed.scala
botmaker/src/scala/com/twitter/botmaker/rule/function/ResponseCodes.scala
botmaker/src/scala/com/twitter/botmaker/rule/sys/PreEventOutput.scala
botmaker/src/scala/com/twitter/botmaker/runtime/BatchQueue.scala
botmaker/src/scala/com/twitter/botmaker/runtime/LocalCounter.scala
botmaker/src/scala/com/twitter/botmaker/runtime/LocalStore.scala
botmaker/src/scala/com/twitter/botmaker/runtime/LogWriter.scala
botmaker/src/scala/com/twitter/botmaker/runtime/RegexOptions.scala
botmaker/src/scala/com/twitter/botmaker/runtime/RuntimeDebugger.scala
botmaker/src/scala/com/twitter/botmaker/runtime/RuntimeFailures.scala
botmaker/src/scala/com/twitter/botmaker/runtime/ScheduledEvent.scala
botmaker/src/scala/com/twitter/botmaker/runtime/ServiceContainer.scala
botmaker/src/scala/com/twitter/botmaker/runtime/TwitterRuntime.scala
botmaker/src/scala/com/twitter/botmaker/runtime/config/BatchQueueConfigs.scala
botmaker/src/scala/com/twitter/botmaker/runtime/config/EventTypeConfigs.scala
botmaker/src/scala/com/twitter/botmaker/runtime/config/LocalCounterConfigs.scala
botmaker/src/scala/com/twitter/botmaker/runtime/config/LocalStoreConfigs.scala
botmaker/src/scala/com/twitter/botmaker/runtime/config/LogWriterConfigs.scala
botmaker/src/scala/com/twitter/botmaker/runtime/config/PackageConfigs.scala
botmaker/src/scala/com/twitter/botmaker/runtime/config/RegexConfigs.scala
botmaker/src/scala/com/twitter/botmaker/runtime/config/ScheduledEventConfigs.scala
botmaker/src/scala/com/twitter/botmaker/runtime/config/ServiceConfigs.scala
botmaker/src/scala/com/twitter/botmaker/runtime/config/StructTupleTypeConfigs.scala
botmaker/src/scala/com/twitter/botmaker/runtime/config/TeamConfigs.scala
botmaker/src/scala/com/twitter/botmaker/runtime/config/ThriftTypeConfigs.scala
botmaker/src/scala/com/twitter/botmaker/runtime/function/GetHelp.scala
botmaker/src/scala/com/twitter/botmaker/runtime/function/IncrementStat.scala
botmaker/src/scala/com/twitter/botmaker/runtime/function/IncrementStatEventwise.scala
botmaker/src/scala/com/twitter/botmaker/runtime/function/IncrementStats.scala
botmaker/src/scala/com/twitter/botmaker/runtime/function/IncrementStatsEventwise.scala
botmaker/src/scala/com/twitter/botmaker/runtime/function/RPrint.scala
botmaker/src/scala/com/twitter/botmaker/runtime/function/SampleStat.scala
botmaker/src/scala/com/twitter/botmaker/runtime/function/SampleStats.scala
botmaker/src/scala/com/twitter/botmaker/runtime/function/SetStat.scala
botmaker/src/scala/com/twitter/botmaker/runtime/function/SetStats.scala
botmaker/src/scala/com/twitter/botmaker/runtime/function/ToFeatureDataMap.scala
botmaker/src/scala/com/twitter/botmaker/runtime/function/TryAcquire.scala
botmaker/src/scala/com/twitter/botmaker/util/CodeAnalysisUtil.scala
botmaker/src/scala/com/twitter/botmaker/util/FileUtil.scala
botmaker/src/scala/com/twitter/botmaker/util/ThriftUtil.scala
botmaker/src/thrift/com/twitter/botmaker/app/BUILD
botmaker/src/thrift/com/twitter/botmaker/app/app.thrift
botmaker/src/thrift/com/twitter/botmaker/rule/BUILD
botmaker/src/thrift/com/twitter/botmaker/rule/rule.thrift
botmaker/src/thrift/com/twitter/botmaker/runtime/BUILD
botmaker/src/thrift/com/twitter/botmaker/runtime/runtime.thrift
candidate-pipeline/candidate_pipeline.rs
candidate-pipeline/filter.rs
candidate-pipeline/hydrator.rs
candidate-pipeline/lib.rs
candidate-pipeline/pipeline_summary.rs
candidate-pipeline/query_hydrator.rs
candidate-pipeline/scorer.rs
candidate-pipeline/selector.rs
candidate-pipeline/side_effect.rs
candidate-pipeline/source.rs
candidate-pipeline/util.rs
clip/BUILD
clip/config.py
clip/datasets/language_image_dataset.py
clip/datasets/media_cache_dataset.py
clip/keras_model.py
clip/model.py
clip/modules.py
clip/notebooks/BUILD
clip/notebooks/create_bq_language_image_dataset.ipynb
clip/notebooks/create_gcs_language_image_dataset.ipynb
clip/notebooks/gcs_lifecycle_config.json
clip/notebooks/media_embeddings_dataflow.ipynb
clip/scripts/BUILD
clip/scripts/export_dbv2_image_model.py
clip/scripts/export_keras_models.py
clip/training.py
clip/utils/data_utils.py
clip/utils/io_utils.py
clip/utils/model_utils.py
clip/utils/train_utils.py
docs/BIDIRECTIONAL_BOOST_CHANGE.md
grox/config/config.py
grox/core/__init__.py
grox/core/clients/nightowl_client.py
grox/core/constants.py
grox/core/data_loaders/asr_processor.py
grox/core/data_loaders/data_types.py
grox/core/data_loaders/descendant_hydrator.py
grox/core/data_loaders/descendant_id_provider.py
grox/core/data_loaders/embedding_ranked_key_frames.py
grox/core/data_loaders/kafka_loader.py
grox/core/data_loaders/media_loader.py
grox/core/data_loaders/media_processor.py
grox/core/data_loaders/media_reference_bundle.py
grox/core/data_loaders/message_queue_loader.py
grox/core/data_loaders/post_mapper.py
grox/core/data_loaders/strato_loader.py
grox/core/data_loaders/user_replies.py
grox/core/dispatcher.py
grox/core/engine.py
grox/core/generators/__init__.py
grox/core/generators/registry.py
grox/core/generators/stream_generator.py
grox/core/generators/task_generator.py
grox/core/lib/utils.py
grox/core/lm/convo.py
grox/core/lm/json_output.py
grox/core/lm/post.py
grox/core/lm/thread.py
grox/core/lm/user.py
grox/core/loading.py
grox/core/plans/__init__.py
grox/core/plans/plan.py
grox/core/plans/plan_master.py
grox/core/plans/registry.py
grox/core/processors.py
grox/core/registry.py
grox/core/schedules/context.py
grox/core/schedules/init.py
grox/core/schedules/types.py
grox/core/services/__init__.py
grox/core/services/registry.py
grox/core/services/service.py
grox/core/tasks/disable_rules.py
grox/core/tasks/task.py
grox/core/tasks/task_asr.py
grox/core/tasks/task_filters.py
grox/core/tasks/task_load_post.py
grox/core/tasks/task_media.py
grox/core/tasks/task_rate_limit.py
grox/flows/mm_emb/__init__.py
grox/flows/mm_emb/adaptive_min_fav.py
grox/flows/mm_emb/backfill_consumer_dedup.py
grox/flows/mm_emb/batched_fav_hydrator.py
grox/flows/mm_emb/constants.py
grox/flows/mm_emb/disable_rules.py
grox/flows/mm_emb/embedder.py
grox/flows/mm_emb/embedder_v82.py
grox/flows/mm_emb/embedder_v8_search.py
grox/flows/mm_emb/generators.py
grox/flows/mm_emb/plan_post_embedding_v5.py
grox/flows/mm_emb/plan_post_embedding_v5_for_reply.py
grox/flows/mm_emb/plan_post_embedding_v82.py
grox/flows/mm_emb/plan_post_embedding_v82_for_reply.py
grox/flows/mm_emb/plan_post_embedding_v8_search.py
grox/flows/mm_emb/plan_post_embedding_v8_search_backfill.py
grox/flows/mm_emb/plan_post_embedding_v8_search_backfill_batch.py
grox/flows/mm_emb/plan_post_embedding_v8_search_for_reply.py
grox/flows/mm_emb/renderer.py
grox/flows/mm_emb/renderer_v82.py
grox/flows/mm_emb/renderer_v8_search.py
grox/flows/mm_emb/state.py
grox/flows/mm_emb/task_backfill_fanout.py
grox/flows/mm_emb/task_backfill_gate.py
grox/flows/mm_emb/task_embedding_pub.py
grox/flows/mm_emb/task_filter.py
grox/flows/mm_emb/task_multimodal_post_embedding.py
grox/flows/mm_emb/task_rate_limit.py
grox/flows/mm_emb/task_write_mm_embedding_sink.py
grox/flows/ptos/__init__.py
grox/flows/ptos/classifier.py
grox/flows/ptos/constants.py
grox/flows/ptos/disable_rules.py
grox/flows/ptos/generators.py
grox/flows/ptos/kafka_loader.py
grox/flows/ptos/mode.py
grox/flows/ptos/plan_safety_ptos.py
grox/flows/ptos/plan_safety_ptos_adult_content_leading_frames.py
grox/flows/ptos/plan_safety_ptos_key_frames.py
grox/flows/ptos/plan_safety_ptos_live_cluster_anchors.py
grox/flows/ptos/plan_safety_ptos_media_injected_adult_infrared_video_spam_detection.py
grox/flows/ptos/plan_safety_ptos_realtime_with_signals.py
grox/flows/ptos/plan_safety_ptos_special_video.py
grox/flows/ptos/prior_nsfw.py
grox/flows/ptos/prompts.py
grox/flows/ptos/state.py
grox/flows/ptos/task_filter.py
grox/flows/ptos/task_ptos_spam_detection.py
grox/flows/ptos/task_rate_limit.py
grox/flows/ptos/task_safety_ptos_adult_content_cross_validation.py
grox/flows/ptos/task_safety_ptos_adult_content_leading_frames_filter.py
grox/flows/ptos/task_safety_ptos_category.py
grox/flows/ptos/task_safety_ptos_key_frames_filter.py
grox/flows/ptos/task_safety_ptos_media_injected_adult_infrared_video_spam_detection.py
grox/flows/ptos/task_safety_ptos_media_injected_adult_infrared_video_spam_detection_filter.py
grox/flows/ptos/task_safety_ptos_min_traction_dedupe_filter.py
grox/flows/ptos/task_safety_ptos_policy.py
grox/flows/ptos/task_safety_ptos_safemodel_sex_nudity.py
grox/flows/ptos/task_safety_ptos_special_video_filter.py
grox/flows/ptos/task_special_video_screen.py
grox/flows/ptos/task_write_live_cluster_anchor_verdict_sink.py
grox/flows/ptos/task_write_safety_post_annotations_result_sink.py
grox/flows/reply_spam/__init__.py
grox/flows/reply_spam/classifier_coordinated_spam.py
grox/flows/reply_spam/classifier_multi_step_reply_spam.py
grox/flows/reply_spam/classifier_reply_ranking.py
grox/flows/reply_spam/classifier_simple_reply_scorer.py
grox/flows/reply_spam/constants.py
grox/flows/reply_spam/generators.py
grox/flows/reply_spam/plan_coordinated_spam.py
grox/flows/reply_spam/plan_multi_step_reply_spam.py
grox/flows/reply_spam/plan_reply_ranking.py
grox/flows/reply_spam/plan_spam_comment.py
grox/flows/reply_spam/prompts.py
grox/flows/reply_spam/state_coordinated_spam.py
grox/flows/reply_spam/state_multi_step_reply_spam.py
grox/flows/reply_spam/state_reply_ranking.py
grox/flows/reply_spam/strato_loader.py
grox/flows/reply_spam/task_coordinated_spam.py
grox/flows/reply_spam/task_filter.py
grox/flows/reply_spam/task_multi_step_reply_spam.py
grox/flows/reply_spam/task_rank_replies.py
grox/flows/reply_spam/task_rate_limit.py
grox/flows/reply_spam/task_spam_detection.py
grox/flows/reply_spam/task_write.py
grox/flows/upa/__init__.py
grox/flows/upa/classifier_banger_initial_screen_gemma.py
grox/flows/upa/classifier_post_safety_screen_deluxe.py
grox/flows/upa/constants.py
grox/flows/upa/generators.py
grox/flows/upa/models.py
grox/flows/upa/plan_initial_banger.py
grox/flows/upa/plan_post_safety.py
grox/flows/upa/prompts.py
grox/flows/upa/state_initial_banger.py
grox/flows/upa/state_post_safety.py
grox/flows/upa/task_banger_screen.py
grox/flows/upa/task_filter.py
grox/flows/upa/task_grok_upa_action_with_labels.py
grox/flows/upa/task_post_safety_screen_deluxe.py
grox/flows/upa/task_rate_limit.py
grox/flows/upa/task_write.py
grox/libs/blobstore_http/__init__.py
grox/libs/blobstore_http/blobstore.py
grox/libs/blobstore_http/cdn_downloader.py
grox/libs/blobstore_http/py.typed
grox/libs/circuit_breaker/__init__.py
grox/libs/circuit_breaker/circuit_breaker.py
grox/libs/circuit_breaker/py.typed
grox/libs/embed/__init__.py
grox/libs/embed/embed_http.py
grox/libs/grok_sampler/__init__.py
grox/libs/grok_sampler/config.py
grox/libs/grok_sampler/eapi_sampler.py
grox/libs/grok_sampler/llm.py
grox/libs/grok_sampler/oai_sampler.py
grox/libs/grok_sampler/py.typed
grox/libs/grok_sampler/text_sampler.py
grox/libs/grok_sampler/vision_sampler.py
grox/libs/grpc_cli/__init__.py
grox/libs/grpc_cli/grpc_client.py
grox/libs/grpc_cli/py.typed
grox/libs/html_render/__init__.py
grox/libs/html_render/py.typed
grox/libs/html_render/tweet_render_for_grox.py
grox/libs/kafka_cli/__init__.py
grox/libs/kafka_cli/config.py
grox/libs/kafka_cli/consumer.py
grox/libs/kafka_cli/mtls.py
grox/libs/kafka_cli/multi_region_consumer.py
grox/libs/kafka_cli/multi_region_producer.py
grox/libs/kafka_cli/patched_gssapi.py
grox/libs/kafka_cli/producer.py
grox/libs/kafka_cli/py.typed
grox/libs/kerberos_cli/__init__.py
grox/libs/kerberos_cli/kerberos.py
grox/libs/kerberos_cli/py.typed
grox/libs/video_tools/__init__.py
grox/libs/video_tools/frame_sampler.py
grox/libs/video_tools/image.py
grox/libs/video_tools/key_frames.py
grox/libs/video_tools/py.typed
grox/libs/video_tools/subtitles.py
grox/libs/video_tools/video_frames.py
grox/libs/wily_cli/__init__.py
grox/libs/wily_cli/config.py
grox/libs/wily_cli/http_client.py
grox/libs/wily_cli/py.typed
grox/libs/wily_cli/wily_client.py
grox/main.py
home-mixer/ads/drops.rs
home-mixer/ads/following_ad_blender.rs
home-mixer/ads/health_metrics.rs
home-mixer/ads/least_movement_blender.rs
home-mixer/ads/mod.rs
home-mixer/ads/multi_risk_blender.rs
home-mixer/ads/neighbours.rs
home-mixer/ads/partition_organic_blender.rs
home-mixer/ads/safe_gap_blender.rs
home-mixer/ads/slot_spread_blender.rs
home-mixer/ads/tests/blender_comparison_test.rs
home-mixer/ads/tests/following_ad_blender_tests.rs
home-mixer/ads/tests/least_movement_blender_tests.rs
home-mixer/ads/tests/mod.rs
home-mixer/ads/tests/multi_risk_blender_tests.rs
home-mixer/ads/tests/partition_organic_blender_tests.rs
home-mixer/ads/tests/safe_gap_blender_tests.rs
home-mixer/ads/tests/slot_spread_blender_tests.rs
home-mixer/ads/tests/time_gap_blender_tests.rs
home-mixer/ads/time_gap_blender.rs
home-mixer/ads/util.rs
home-mixer/candidate_hydrators/ads_brand_safety_vf_hydrator.rs
home-mixer/candidate_hydrators/ai_trend_feedback_context_hydrator.rs
home-mixer/candidate_hydrators/ancestor_video_hydrator.rs
home-mixer/candidate_hydrators/bidirectional_follow_hydrator.rs
home-mixer/candidate_hydrators/blocked_by_hydrator.rs
home-mixer/candidate_hydrators/broadcast_liveness_hydrator.rs
home-mixer/candidate_hydrators/conversation_gap_ancestor_hydrator.rs
home-mixer/candidate_hydrators/core_data_candidate_hydrator.rs
home-mixer/candidate_hydrators/engagement_counts_hydrator.rs
home-mixer/candidate_hydrators/filtered_topics_hydrator.rs
home-mixer/candidate_hydrators/following_blocked_by_hydrator.rs
home-mixer/candidate_hydrators/following_replied_users_hydrator.rs
home-mixer/candidate_hydrators/gizmoduck_hydrator.rs
home-mixer/candidate_hydrators/in_network_candidate_hydrator.rs
home-mixer/candidate_hydrators/language_code_hydrator.rs
home-mixer/candidate_hydrators/media_info_hydrator.rs
home-mixer/candidate_hydrators/mod.rs
home-mixer/candidate_hydrators/mutual_follow_jaccard_hydrator.rs
home-mixer/candidate_hydrators/new_user_soft_nsfw_label_hydrator.rs
home-mixer/candidate_hydrators/phoenix_reply_ancestors_hydrator.rs
home-mixer/candidate_hydrators/post_engagers_hydrator.rs
home-mixer/candidate_hydrators/quote_hydrator.rs
home-mixer/candidate_hydrators/quoted_post_text_hydrator.rs
home-mixer/candidate_hydrators/semantic_id_hydrator.rs
home-mixer/candidate_hydrators/subscription_hydrator.rs
home-mixer/candidate_hydrators/topic_feedback_context_hydrator.rs
home-mixer/candidate_hydrators/tweet_type_metrics_hydrator.rs
home-mixer/candidate_hydrators/vf_candidate_hydrator.rs
home-mixer/candidate_hydrators/vf_following_candidate_hydrator.rs
home-mixer/candidate_hydrators/video_embedding_hydrator.rs
home-mixer/candidate_hydrators/video_media_hydrator.rs
home-mixer/candidate_pipeline/following_candidate_pipeline.rs
home-mixer/candidate_pipeline/for_you_candidate_pipeline.rs
home-mixer/candidate_pipeline/mod.rs
home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs
home-mixer/candidate_pipeline/phoenix_scores_pipeline.rs
home-mixer/candidate_pipeline/ranked_following_candidate_pipeline.rs
home-mixer/candidate_pipeline/reverse_chron_posts_pipeline.rs
home-mixer/clients/ad_index_client.rs
home-mixer/clients/author_brand_safety_client.rs
home-mixer/clients/engagement_counts_client.rs
home-mixer/clients/engagement_signals_client.rs
home-mixer/clients/gizmoduck_client.rs
home-mixer/clients/impressed_posts_client.rs
home-mixer/clients/mod.rs
home-mixer/clients/night_owl_client.rs
home-mixer/clients/past_request_timestamps_client.rs
home-mixer/clients/popular_authors_store_client.rs
home-mixer/clients/post_engagers_client.rs
home-mixer/clients/post_v8_search_embedding_client.rs
home-mixer/clients/prompts_client.rs
home-mixer/clients/recent_search_queries_store_client.rs
home-mixer/clients/resurrection_date_client.rs
home-mixer/clients/rotating_channel.rs
home-mixer/clients/s2s.rs
home-mixer/clients/served_history_client.rs
home-mixer/clients/sid_retrieval_client.rs
home-mixer/clients/simclusters_ann_cache_client.rs
home-mixer/clients/simclusters_ann_client.rs
home-mixer/clients/tweet_entity_service_client.rs
home-mixer/clients/uas_fetcher.rs
home-mixer/clients/user_action_aggregation_client.rs
home-mixer/clients/vm_ranker_client.rs
home-mixer/clients/who_to_follow_client.rs
home-mixer/config.rs
home-mixer/dark_traffic_setup.rs
home-mixer/filters/ad_adjacent_served_filter.rs
home-mixer/filters/age_filter.rs
home-mixer/filters/ancestor_video_filter.rs
home-mixer/filters/ancillary_vf_filter.rs
home-mixer/filters/author_socialgraph_filter.rs
home-mixer/filters/core_data_hydration_filter.rs
home-mixer/filters/dedup_conversation_filter.rs
home-mixer/filters/drop_duplicates_filter.rs
home-mixer/filters/fair_share_ranking_filter.rs
home-mixer/filters/fav_holdout_filter.rs
home-mixer/filters/following_retweet_deduplication_filter.rs
home-mixer/filters/following_viewer_muted_keyword_filter.rs
home-mixer/filters/ineligible_subscription_filter.rs
home-mixer/filters/invalid_conversation_module_filter.rs
home-mixer/filters/inventory_holdout_filter.rs
home-mixer/filters/mod.rs
home-mixer/filters/new_user_min_engagement_filter.rs
home-mixer/filters/new_user_soft_nsfw_filter.rs
home-mixer/filters/oon_nsfw_simclusters_filter.rs
home-mixer/filters/oon_retweet_reply_filter.rs
home-mixer/filters/popular_topics_author_dedup_filter.rs
home-mixer/filters/previously_seen_posts_backup_filter.rs
home-mixer/filters/previously_seen_posts_filter.rs
home-mixer/filters/previously_served_posts_filter.rs
home-mixer/filters/push_to_home_dedup_filter.rs
home-mixer/filters/result_size_filter.rs
home-mixer/filters/retweet_deduplication_filter.rs
home-mixer/filters/self_reply_chain_filter.rs
home-mixer/filters/self_tweet_filter.rs
home-mixer/filters/topic_ids_filter.rs
home-mixer/filters/vf_filter.rs
home-mixer/filters/video_carousel_filter.rs
home-mixer/filters/video_filter.rs
home-mixer/filters/viewer_muted_keyword_filter.rs
home-mixer/filters/zero_fav_codivert_filter.rs
home-mixer/following_feed_server.rs
home-mixer/for_you_server.rs
home-mixer/frames/catalog.rs
home-mixer/frames/mod.rs
home-mixer/frames/placement.rs
home-mixer/frames/plan.rs
home-mixer/frames/served.rs
home-mixer/lib.rs
home-mixer/main.rs
home-mixer/models/brand_safety.rs
home-mixer/models/candidate.rs
home-mixer/models/candidate_features.rs
home-mixer/models/content_features.rs
home-mixer/models/engagement_signals.rs
home-mixer/models/fs_recipient.rs
home-mixer/models/in_network_reply.rs
home-mixer/models/mod.rs
home-mixer/models/query.rs
home-mixer/models/user_features.rs
home-mixer/params/config.rs
home-mixer/params/mod.rs
home-mixer/params/param.rs
home-mixer/phoenix_scores_server.rs
home-mixer/popular_authors_job.rs
home-mixer/popular_posts_job.rs
home-mixer/query_hydrators/blocked_user_ids_query_hydrator.rs
home-mixer/query_hydrators/cached_posts_query_hydrator.rs
home-mixer/query_hydrators/explicit_engagement_signals_query_hydrator.rs
home-mixer/query_hydrators/followed_grok_topics_query_hydrator.rs
home-mixer/query_hydrators/followed_starter_packs_query_hydrator.rs
home-mixer/query_hydrators/followed_user_ids_query_hydrator.rs
home-mixer/query_hydrators/immersive_scoring_sequence_query_hydrator.rs
home-mixer/query_hydrators/implicit_engagement_signals_query_hydrator.rs
home-mixer/query_hydrators/impressed_posts_query_hydrator.rs
home-mixer/query_hydrators/impression_bloom_filter_query_hydrator.rs
home-mixer/query_hydrators/ip_query_hydrator.rs
home-mixer/query_hydrators/mod.rs
home-mixer/query_hydrators/muted_user_ids_query_hydrator.rs
home-mixer/query_hydrators/mutual_follow_query_hydrator.rs
home-mixer/query_hydrators/past_request_timestamps_query_hydrator.rs
home-mixer/query_hydrators/recent_search_queries_query_hydrator.rs
home-mixer/query_hydrators/retrieval_sequence_query_hydrator.rs
home-mixer/query_hydrators/scoring_sequence_query_hydrator.rs
home-mixer/query_hydrators/served_history_query_hydrator.rs
home-mixer/query_hydrators/subscribed_user_ids_query_hydrator.rs
home-mixer/query_hydrators/user_demographics_query_hydrator.rs
home-mixer/query_hydrators/user_inferred_gender_query_hydrator.rs
home-mixer/query_hydrators/user_installed_apps_query_hydrator.rs
home-mixer/ranked_following_feed_server.rs
home-mixer/scored_posts_server.rs
home-mixer/scorers/author_cold_start.rs
home-mixer/scorers/immersive_video_scorer.rs
home-mixer/scorers/mod.rs
home-mixer/scorers/page_decode_rerank_scorer.rs
home-mixer/scorers/page_rl_exploration_scorer.rs
home-mixer/scorers/phoenix_scorer.rs
home-mixer/scorers/phoenix_scores_ranking_scorer.rs
home-mixer/scorers/value_model.rs
home-mixer/scorers/vm_ranker.rs
home-mixer/scorers/vm_ranker_debias_payload.rs
home-mixer/scorers/vm_ranker_request.rs
home-mixer/selectors/blender_selector.rs
home-mixer/selectors/following_blender_selector.rs
home-mixer/selectors/mod.rs
home-mixer/selectors/passthrough_selector.rs
home-mixer/selectors/top_k_score_selector.rs
home-mixer/server.rs
home-mixer/side_effects/ads_injection_logging_side_effect.rs
home-mixer/side_effects/author_served_metrics_side_effect.rs
home-mixer/side_effects/client_events_kafka_side_effect.rs
home-mixer/side_effects/debug_side_effect.rs
home-mixer/side_effects/funnel_trace_side_effect.rs
home-mixer/side_effects/mod.rs
home-mixer/side_effects/mutual_follow_stats_side_effect.rs
home-mixer/side_effects/phoenix_experiments_side_effect.rs
home-mixer/side_effects/phoenix_request_cache_side_effect.rs
home-mixer/side_effects/publish_seen_ids_to_kafka_side_effect.rs
home-mixer/side_effects/redis_post_candidate_cache_side_effect.rs
home-mixer/side_effects/reranking_kafka_side_effect.rs
home-mixer/side_effects/response_diversity_stats_side_effect.rs
home-mixer/side_effects/response_stats_side_effect.rs
home-mixer/side_effects/retrieval_candidates_kafka_side_effect.rs
home-mixer/side_effects/scored_stats_side_effect.rs
home-mixer/side_effects/serendipity_stats_side_effect.rs
home-mixer/side_effects/served_ad_history_cache_side_effect.rs
home-mixer/side_effects/served_candidates_kafka_side_effect.rs
home-mixer/side_effects/served_event_kafka_side_effect.rs
home-mixer/side_effects/truncate_served_history_side_effect.rs
home-mixer/side_effects/update_past_request_timestamps_side_effect.rs
home-mixer/side_effects/update_served_history_side_effect.rs
home-mixer/side_effects/video_carousel_candidates_kafka_side_effect.rs
home-mixer/sources/ads_source.rs
home-mixer/sources/cached_posts_source.rs
home-mixer/sources/feed_survey_source.rs
home-mixer/sources/following_night_owl_source.rs
home-mixer/sources/jetfuel_frame_source.rs
home-mixer/sources/mod.rs
home-mixer/sources/phoenix_moe_source.rs
home-mixer/sources/phoenix_source.rs
home-mixer/sources/phoenix_topics_source.rs
home-mixer/sources/popular_posts_source.rs
home-mixer/sources/popular_topics_source.rs
home-mixer/sources/prompts_source.rs
home-mixer/sources/push_to_home_source.rs
home-mixer/sources/reverse_chron_posts_source.rs
home-mixer/sources/scored_posts_source.rs
home-mixer/sources/seed_candidates_source.rs
home-mixer/sources/sid_source.rs
home-mixer/sources/simclusters_source.rs
home-mixer/sources/thunder_source.rs
home-mixer/sources/tweet_mixer_source.rs
home-mixer/sources/who_to_follow_source.rs
home-mixer/util/candidates_util.rs
home-mixer/util/conversation_grouping.rs
home-mixer/util/country_codes.rs
home-mixer/util/egress.rs
home-mixer/util/feed_log.rs
home-mixer/util/mod.rs
home-mixer/util/phoenix_request.rs
home-mixer/util/popular_authors.rs
home-mixer/util/popular_posts.rs
home-mixer/util/post_engagers.rs
home-mixer/util/rescore.rs
home-mixer/util/shadow.rs
home-mixer/util/shadow_scores.rs
home-mixer/util/strato_context.rs
home-mixer/util/string_case.rs
home-mixer/util/tweet_type_metrics.rs
home-mixer/util/under_the_hood.rs
home-mixer/util/url.rs
home-mixer/util/urt/ad_marshaller.rs
home-mixer/util/urt/client_event.rs
home-mixer/util/urt/controller_data.rs
home-mixer/util/urt/convo_marshaller.rs
home-mixer/util/urt/cursors.rs
home-mixer/util/urt/feed_survey_marshaller.rs
home-mixer/util/urt/feedback.rs
home-mixer/util/urt/frame_marshaller.rs
home-mixer/util/urt/mod.rs
home-mixer/util/urt/navigation.rs
home-mixer/util/urt/new_tweets_pill.rs
home-mixer/util/urt/post_marshaller.rs
home-mixer/util/urt/prompt_marshaller.rs
home-mixer/util/urt/push_to_home_marshaller.rs
home-mixer/util/urt/reverse_chron_following/cursors.rs
home-mixer/util/urt/reverse_chron_following/mod.rs
home-mixer/util/urt/video_carousel_marshaller.rs
home-mixer/util/urt/wtf_marshaller.rs
home-mixer/util/video_carousel.rs
home-mixer/util/viewer_history.rs
home-mixer/util/xds.rs
media-model-proxy/BUILD.bazel
media-model-proxy/README.rst
media-model-proxy/config/decider.yml
media-model-proxy/integrationtest/scripts/local.sh
media-model-proxy/integrationtest/scripts/workflow.sh
media-model-proxy/integrationtest/src/test/resources/com/twitter/media_understanding/model_proxy/integrationtest/BUILD.bazel
media-model-proxy/integrationtest/src/test/resources/com/twitter/media_understanding/model_proxy/integrationtest/models.txt
media-model-proxy/integrationtest/src/test/scala/com/twitter/media_understanding/model_proxy/integrationtest/BUILD.bazel
media-model-proxy/integrationtest/src/test/scala/com/twitter/media_understanding/model_proxy/integrationtest/MediaModelProxyService.scala
media-model-proxy/integrationtest/src/test/scala/com/twitter/media_understanding/model_proxy/integrationtest/MediaModelProxyTest.scala
media-model-proxy/loadtest/BUILD
media-model-proxy/loadtest/config/loadtest.yaml
media-model-proxy/loadtest/launcher.sh
media-model-proxy/loadtest/logs/.gitignore
media-model-proxy/loadtest/src/scala/com/twitter/media_understanding/media_model_proxy/loadtest/BUILD
media-model-proxy/loadtest/src/scala/com/twitter/media_understanding/media_model_proxy/loadtest/MediaModelProxyLoadTest.scala
media-model-proxy/loadtest/src/scala/com/twitter/media_understanding/media_model_proxy/loadtest/MediaModelProxyLogSampler.scala
media-model-proxy/scripts/local.sh
media-model-proxy/src/main/resources/BUILD
media-model-proxy/src/main/resources/META-INF/services/com.twitter.util.tunable.ServiceLoadedTunableMap
media-model-proxy/src/main/resources/com/twitter/tunables/cortex_media_annotator/instances.json
media-model-proxy/src/main/resources/okta_features_metadata.xml
media-model-proxy/src/main/resources/okta_features_prod_metadata.xml
media-model-proxy/src/main/resources/sample-image.jpg
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/app/BUILD.bazel
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/app/ModelClientValidator.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/app/Server.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/clients/BUILD.bazel
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/clients/DeepbirdClient.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/clients/DummyEmbeddingsClient.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/clients/ModelClient.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/clients/SwitchingModelClient.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/config/BUILD
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/config/Config.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/config/Deciders.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/config/Features.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/config/TunableMap.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/config/Tunables.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/controllers/BUILD.bazel
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/controllers/ProxyController.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/exception/BUILD.bazel
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/exception/Exceptions.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/model_descriptors/BUILD.bazel
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/model_descriptors/CategoryClassificationEmbeddingsModelDescriptor.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/model_descriptors/CategoryClassificationModelDescriptor.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/model_descriptors/FingerprintingModelDescriptor.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/model_descriptors/FingerprintingV2ModelDescriptor.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/model_descriptors/HatefulSymbolRecognitionModelDescriptor.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/model_descriptors/ModelDescriptor.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/model_descriptors/ModelDescriptorRegistry.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/model_descriptors/ViolenceAndGoreModelDescriptor.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/model_descriptors/XXNsfwModelDescriptor.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/modules/BUILD.bazel
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/modules/BlobStoreModule.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/modules/ConfigModule.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/modules/FeaturesModule.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/modules/LoadSheddingFilterModule.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/modules/MediaModelProxyModule.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/modules/ModelsModule.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/modules/ScribeLoggerModule.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/modules/StatsReceiverModule.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/modules/ThriftDiffyProxyModule.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/modules/package.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/services/BUILD.bazel
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/services/BlobStoreService.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/services/ModelsService.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/util/BUILD.bazel
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/util/ScribeLogger.scala
media-model-proxy/src/main/scala/com/twitter/media_understanding/model_proxy/util/Scriber.scala
media-model-proxy/src/main/thrift/BUILD
media-model-proxy/src/main/thrift/com/twitter/cortex_media_annotator/annotate.thrift
media-model-proxy/src/main/thrift/com/twitter/cortex_media_annotator/annotate_scribe.thrift
media-model-proxy/src/test/resources/BUILD.bazel
media-model-proxy/src/test/resources/test_decider_base.yml
media-model-proxy/src/test/scala/com/twitter/media_understanding/model_proxy/app/BUILD.bazel
media-model-proxy/src/test/scala/com/twitter/media_understanding/model_proxy/app/FeatureTest.scala
media-model-proxy/src/test/scala/com/twitter/media_understanding/model_proxy/app/StartupTest.scala
media-model-proxy/src/test/scala/com/twitter/media_understanding/model_proxy/clients/BUILD.bazel
media-model-proxy/src/test/scala/com/twitter/media_understanding/model_proxy/clients/DeepbirdClientSpec.scala
media-model-proxy/src/test/scala/com/twitter/media_understanding/model_proxy/clients/DummyEmbeddingsClientSpec.scala
media-model-proxy/src/test/scala/com/twitter/media_understanding/model_proxy/clients/SwitchingModelClientSpec.scala
media-model-proxy/src/test/scala/com/twitter/media_understanding/model_proxy/config/BUILD.bazel
media-model-proxy/src/test/scala/com/twitter/media_understanding/model_proxy/config/FeaturesSpec.scala
media-model-proxy/src/test/scala/com/twitter/media_understanding/model_proxy/model_descriptors/BUILD.bazel
media-model-proxy/src/test/scala/com/twitter/media_understanding/model_proxy/model_descriptors/CategoryClassificationEmbeddingsModelDescriptorSpec.scala
media-model-proxy/src/test/scala/com/twitter/media_understanding/model_proxy/model_descriptors/CategoryClassificationModelDescriptorSpec.scala
media-model-proxy/src/test/scala/com/twitter/media_understanding/model_proxy/model_descriptors/FingerprintingModelDescriptorSpec.scala
media-model-proxy/src/test/scala/com/twitter/media_understanding/model_proxy/model_descriptors/FingerprintingV2ModelDescriptorSpec.scala
media-model-proxy/src/test/scala/com/twitter/media_understanding/model_proxy/model_descriptors/HatefulSymbolRecognitionModelDescriptorSpec.scala
media-model-proxy/src/test/scala/com/twitter/media_understanding/model_proxy/model_descriptors/ViolenceAndGoreModelDescriptorSpec.scala
media-model-proxy/src/test/scala/com/twitter/media_understanding/model_proxy/model_descriptors/XXNsfwModelDescriptorSpec.scala
media-model-proxy/src/test/scala/com/twitter/media_understanding/model_proxy/modules/BUILD.bazel
media-model-proxy/src/test/scala/com/twitter/media_understanding/model_proxy/modules/TestClientModules.scala
media-model-proxy/src/test/scala/com/twitter/media_understanding/model_proxy/services/BUILD.bazel
media-model-proxy/src/test/scala/com/twitter/media_understanding/model_proxy/services/BlobStoreServiceSpec.scala
media-model-proxy/src/test/scala/com/twitter/media_understanding/model_proxy/services/ModelsServiceSpec.scala
media-model-proxy/src/test/scala/com/twitter/media_understanding/model_proxy/util/BUILD.bazel
media-model-proxy/src/test/scala/com/twitter/media_understanding/model_proxy/util/ScribeLoggerSpec.scala
phoenix-rankall-strato/columns/favoriteEventProcessor.strato
phoenix-rankall-strato/columns/kafka/favIndexingEventKafkaTopic.strato
phoenix-rankall-strato/columns/kafka/indexingEventKafkaBackupTopic.strato
phoenix-rankall-strato/columns/kafka/indexingEventKafkaTopic.strato
phoenix-rankall-strato/columns/kafka/metadataEventKafkaTopic.strato
phoenix-rankall-strato/columns/mh/filteredTopicsByExperiment.strato
phoenix-rankall-strato/columns/mh/phoenixRankAllPostAuthorMetadata.strato
phoenix-rankall-strato/columns/phoenix_rank_all/getPostPhoenixRankAllMetadata.strato
phoenix-rankall-strato/columns/phoenix_rank_all/phoenixRankAllCandidateProcessor.strato
phoenix-rankall-strato/columns/phoenix_rank_all/postCreationEventProcessor.strato
phoenix-rankall-strato/columns/scribeEvents.strato
phoenix-rankall-strato/columns/tweetUpdateThresholdsCache.strato
phoenix-rankall-strato/lib/eventProcessing.strato
phoenix-rankall-strato/lib/sharedConfig.strato
phoenix-rankall-strato/stream_forwarders/favoriteEventForwarder.strato
phoenix-rankall-strato/stream_forwarders/favoritePhoenixIndexingEventForwarder.strato
phoenix-rankall-strato/stream_forwarders/postCreationEventForwarder.strato
phoenix-rankall/build.rs
phoenix-rankall/proto/sid_lookup.proto
phoenix-rankall/src/config/mod.rs
phoenix-rankall/src/consumer/kafka.rs
phoenix-rankall/src/consumer/mod.rs
phoenix-rankall/src/hydrate/columns.rs
phoenix-rankall/src/hydrate/fav_counts.rs
phoenix-rankall/src/hydrate/features.rs
phoenix-rankall/src/hydrate/fetcher.rs
phoenix-rankall/src/hydrate/metrics.rs
phoenix-rankall/src/hydrate/mod.rs
phoenix-rankall/src/hydrate/post_metadata.rs
phoenix-rankall/src/hydrate/scheduler.rs
phoenix-rankall/src/hydrate/strato.rs
phoenix-rankall/src/hydrate/tweet_fields.rs
phoenix-rankall/src/lib.rs
phoenix-rankall/src/main.rs
phoenix-rankall/src/metrics/mod.rs
phoenix-rankall/src/pipeline/mod.rs
phoenix-rankall/src/processor/analysis_processor.rs
phoenix-rankall/src/processor/blacklist.rs
phoenix-rankall/src/processor/gen/hydra.rs
phoenix-rankall/src/processor/gen/mod.rs
phoenix-rankall/src/processor/gen/scored_candidate.rs
phoenix-rankall/src/processor/main_processor.rs
phoenix-rankall/src/processor/metadata_processor.rs
phoenix-rankall/src/processor/mod.rs
phoenix-rankall/src/processor/record.rs
phoenix-rankall/src/processor/sid_processor.rs
phoenix-rankall/src/processor/sid_tail_processor.rs
phoenix-rankall/src/processor/thrift_types.rs
phoenix-rankall/src/processor/topic_names.rs
phoenix-rankall/src/processor/topic_processor.rs
phoenix-rankall/src/sid/backfill.rs
phoenix-rankall/src/sid/client.rs
phoenix-rankall/src/sid/metrics.rs
phoenix-rankall/src/sid/mod.rs
phoenix-rankall/src/store/analysis.rs
phoenix-rankall/src/store/base.rs
phoenix-rankall/src/store/mod.rs
phoenix-rankall/src/store/snowflake.rs
phoenix-rankall/src/store/writer.rs
phoenix-rankall/tests/integration_test.rs
phoenix-rankall/thrift/hydra.thrift
phoenix-rankall/thrift/scored_candidate.thrift
phoenix/Cargo.lock
phoenix/Cargo.toml
phoenix/NOTICE
phoenix/QUICKSTART.md
phoenix/README.md
phoenix/THIRD_PARTY_NOTICES.md
phoenix/TRAINING.md
phoenix/crates/common/xai-recsys/Cargo.toml
phoenix/crates/common/xai-recsys/build.rs
phoenix/crates/common/xai-recsys/pyproject.toml
phoenix/crates/common/xai-recsys/src/lib.rs
phoenix/crates/common/xai-recsys/src/model_config.rs
phoenix/crates/common/xai-recsys/src/reply.rs
phoenix/crates/common/xai-recsys/src/util.rs
phoenix/crates/serving/xai-recsys-engine/Cargo.toml
phoenix/crates/serving/xai-recsys-engine/pyproject.toml
phoenix/crates/serving/xai-recsys-engine/src/adler32.rs
phoenix/crates/serving/xai-recsys-engine/src/admission.rs
phoenix/crates/serving/xai-recsys-engine/src/bin/checkpoint_server.rs
phoenix/crates/serving/xai-recsys-engine/src/checkpoint_proxy.rs
phoenix/crates/serving/xai-recsys-engine/src/checkpoint_proxy_metrics.rs
phoenix/crates/serving/xai-recsys-engine/src/checkpoint_store.rs
phoenix/crates/serving/xai-recsys-engine/src/const.rs
phoenix/crates/serving/xai-recsys-engine/src/copy.rs
phoenix/crates/serving/xai-recsys-engine/src/copy_manifest.rs
phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs
phoenix/crates/serving/xai-recsys-engine/src/emb_table.rs
phoenix/crates/serving/xai-recsys-engine/src/grpc_compression.rs
phoenix/crates/serving/xai-recsys-engine/src/grpc_server_latency.rs
phoenix/crates/serving/xai-recsys-engine/src/grpc_util.rs
phoenix/crates/serving/xai-recsys-engine/src/host_buffer.rs
phoenix/crates/serving/xai-recsys-engine/src/ibverbs_util.rs
phoenix/crates/serving/xai-recsys-engine/src/lib.rs
phoenix/crates/serving/xai-recsys-engine/src/mem_util.rs
phoenix/crates/serving/xai-recsys-engine/src/multimodal_retrieval.rs
phoenix/crates/serving/xai-recsys-engine/src/proto_parser.rs
phoenix/crates/serving/xai-recsys-engine/src/python.rs
phoenix/crates/serving/xai-recsys-engine/src/request_metrics.rs
phoenix/crates/serving/xai-recsys-engine/src/request_queue.rs
phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs
phoenix/crates/serving/xai-recsys-engine/src/storage_util.rs
phoenix/crates/serving/xai-recsys-engine/src/tls.rs
phoenix/crates/serving/xai-recsys-engine/src/util.rs
phoenix/crates/serving/xai-recsys-engine/xai_recsys_engine.pyi
phoenix/crates/serving/xai-recsys-mm-server/Cargo.toml
phoenix/crates/serving/xai-recsys-mm-server/src/embedding_cache.rs
phoenix/crates/serving/xai-recsys-mm-server/src/events.rs
phoenix/crates/serving/xai-recsys-mm-server/src/lib.rs
phoenix/crates/serving/xai-recsys-mm-server/src/mm_embedding_client.rs
phoenix/crates/serving/xai-recsys-mm-server/src/mm_embedding_fetcher.rs
phoenix/crates/serving/xai-recsys-mm-server/src/o2.rs
phoenix/crates/serving/xai-recsys-mm-server/src/python.rs
phoenix/crates/serving/xai-recsys-mm-server/src/snapshot.rs
phoenix/crates/serving/xai-recsys-mm-server/src/snowflake.rs
phoenix/crates/serving/xai-recsys-proto/Cargo.toml
phoenix/crates/serving/xai-recsys-proto/build.rs
phoenix/crates/serving/xai-recsys-proto/proto/recsys.proto
phoenix/crates/serving/xai-recsys-proto/proto/recsys_features.proto
phoenix/crates/serving/xai-recsys-proto/proto/served_feed.proto
phoenix/crates/serving/xai-recsys-proto/src/brand_engagement.rs
phoenix/crates/serving/xai-recsys-proto/src/grok_topics.rs
phoenix/crates/serving/xai-recsys-proto/src/installed_apps.rs
phoenix/crates/serving/xai-recsys-proto/src/lib.rs
phoenix/crates/serving/xai-recsys-proto/src/purchase_value.rs
phoenix/crates/serving/xai-recsys-proto/src/starter_packs.rs
phoenix/crates/serving/xai-recsys-server/Cargo.toml
phoenix/crates/serving/xai-recsys-server/src/lib.rs
phoenix/crates/serving/xai-recsys-server/src/load_gauge.rs
phoenix/crates/serving/xai-recsys-server/src/readyz.rs
phoenix/crates/serving/xai-recsys-sid-proto/Cargo.toml
phoenix/crates/serving/xai-recsys-sid-proto/build.rs
phoenix/crates/serving/xai-recsys-sid-proto/proto/sid_lookup.proto
phoenix/crates/serving/xai-recsys-sid-proto/src/lib.rs
phoenix/crates/serving/xai-recsys-sid-retrieval-proto/Cargo.toml
phoenix/crates/serving/xai-recsys-sid-retrieval-proto/build.rs
phoenix/crates/serving/xai-recsys-sid-retrieval-proto/proto/sid_retrieval.proto
phoenix/crates/serving/xai-recsys-sid-retrieval-proto/src/lib.rs
phoenix/crates/serving/xai-recsys-sid-retrieval/Cargo.toml
phoenix/crates/serving/xai-recsys-sid-retrieval/src/http_api.rs
phoenix/crates/serving/xai-recsys-sid-retrieval/src/index.rs
phoenix/crates/serving/xai-recsys-sid-retrieval/src/loader.rs
phoenix/crates/serving/xai-recsys-sid-retrieval/src/main.rs
phoenix/crates/serving/xai-recsys-sid-retrieval/src/metrics.rs
phoenix/crates/serving/xai-recsys-sid-retrieval/src/seed_sids.rs
phoenix/crates/serving/xai-recsys-sid-retrieval/src/service.rs
phoenix/crates/storage/xai-o2/Cargo.toml
phoenix/crates/storage/xai-o2/src/base_client.rs
phoenix/crates/storage/xai-o2/src/lib.rs
phoenix/crates/storage/xai-o2/src/o2_client_builder.rs
phoenix/pyproject.toml
phoenix/python/common/xai-configlib/pyproject.toml
phoenix/python/common/xai-configlib/src/xai_configlib/__init__.py
phoenix/python/common/xai-configlib/src/xai_configlib/py.typed
phoenix/python/common/xai-gimmick/pyproject.toml
phoenix/python/common/xai-gimmick/src/xai_gimmick/__init__.py
phoenix/python/common/xai-proto/backend_proxy.py
phoenix/python/common/xai-proto/hatch_build.py
phoenix/python/common/xai-proto/proto/copy.proto
phoenix/python/common/xai-proto/proto/recsys.proto
phoenix/python/common/xai-proto/proto/recsys_kafka.proto
phoenix/python/common/xai-proto/pyproject.toml
phoenix/python/common/xai-proto/xai_proto/__init__.py
phoenix/python/training/xai-checkpointing/pyproject.toml
phoenix/python/training/xai-checkpointing/xai_checkpointing/__init__.py
phoenix/python/training/xai-checkpointing/xai_checkpointing/adler32_zlib.py
phoenix/python/training/xai-checkpointing/xai_checkpointing/checksum.py
phoenix/python/training/xai-checkpointing/xai_checkpointing/common.py
phoenix/python/training/xai-checkpointing/xai_checkpointing/dek.py
phoenix/python/training/xai-checkpointing/xai_checkpointing/encrypted_kvstore.py
phoenix/python/training/xai-checkpointing/xai_checkpointing/fix_jax.py
phoenix/python/training/xai-checkpointing/xai_checkpointing/kms_client.py
phoenix/python/training/xai-checkpointing/xai_checkpointing/load.py
phoenix/python/training/xai-checkpointing/xai_checkpointing/orbax_encrypted.py
phoenix/python/training/xai-checkpointing/xai_checkpointing/tree_util.py
phoenix/reference/README.md
phoenix/reference/_sid_proto/sid_lookup_pb2.py
phoenix/reference/_sid_proto/sid_lookup_pb2_grpc.py
phoenix/reference/dump_gen.py
phoenix/reference/example_data/example_posts.py
phoenix/reference/mm_encoder.py
phoenix/reference/mm_snapshot_gen.py
phoenix/reference/oss_recsys_synth.py
phoenix/reference/repack_checkpoint.py
phoenix/reference/retrieve_then_rank.py
phoenix/reference/sid_assign.py
phoenix/reference/sid_codebook.py
phoenix/reference/sid_index_server.py
phoenix/reference/sid_io.py
phoenix/reference/sid_mock_server.py
phoenix/reference/sid_snapshot_gen.py
phoenix/reference/train_step.py
phoenix/reference/train_synth.py
phoenix/reference/world.py
phoenix/reference/world_snapshots.py
phoenix/xrex/__init__.py
phoenix/xrex/configs/__init__.py
phoenix/xrex/configs/config.py
phoenix/xrex/configs/config_loader.py
phoenix/xrex/configs/config_registry.py
phoenix/xrex/configs/data_feeds.py
phoenix/xrex/configs/xrecsys.py
phoenix/xrex/configs/xrecsys_reply_two_tower_v2.py
phoenix/xrex/configs/xrecsys_two_tower.py
phoenix/xrex/configs/xrecsys_two_tower_evals.py
phoenix/xrex/cuda/__init__.py
phoenix/xrex/cuda/adler32/__init__.py
phoenix/xrex/cuda/adler32/src/adler32_api.cc
phoenix/xrex/cuda/adler32/src/adler32_api.cu
phoenix/xrex/cuda/adler32/src/adler32_api.h
phoenix/xrex/cuda/adler32/src/adler32_cpu.cc
phoenix/xrex/cuda/adler32/src/adler32_kernel.cuh
phoenix/xrex/cuda/async_emb/__init__.py
phoenix/xrex/cuda/async_emb/async_emb.py
phoenix/xrex/cuda/async_emb/comm_utils.py
phoenix/xrex/cuda/async_emb/src/async_emb_api.cc
phoenix/xrex/cuda/async_emb/src/async_emb_comm.cc
phoenix/xrex/cuda/async_emb/src/async_emb_comm.hpp
phoenix/xrex/cuda/async_emb/src/async_emb_kernel.cu
phoenix/xrex/cuda/async_emb/src/async_emb_kernel.hpp
phoenix/xrex/cuda/async_emb/src/comm_utils.cc
phoenix/xrex/cuda/async_emb/src/comm_utils.h
phoenix/xrex/cuda/async_emb/src/cuda_error_utils.hpp
phoenix/xrex/cuda/mol_epilogue/__init__.py
phoenix/xrex/cuda/mol_epilogue/src/mol_epilogue_api.cc
phoenix/xrex/cuda/mol_epilogue/src/mol_epilogue_kernel.cu
phoenix/xrex/cuda/mol_epilogue/src/mol_epilogue_kernel.hpp
phoenix/xrex/cuda/mol_epilogue/src/mol_fused_kernel.cu
phoenix/xrex/cuda/mol_epilogue/src/mol_gate.hpp
phoenix/xrex/cuda/mol_epilogue/src/mol_gate_bwd_kernel.cu
phoenix/xrex/cuda/row_emb/__init__.py
phoenix/xrex/cuda/row_emb/comm_utils.py
phoenix/xrex/cuda/row_emb/row_emb.py
phoenix/xrex/cuda/row_emb/src/comm_utils.cc
phoenix/xrex/cuda/row_emb/src/comm_utils.h
phoenix/xrex/cuda/row_emb/src/cuda_error_utils.hpp
phoenix/xrex/cuda/row_emb/src/row_emb_api.cc
phoenix/xrex/cuda/row_emb/src/row_emb_comm.cc
phoenix/xrex/cuda/row_emb/src/row_emb_comm.hpp
phoenix/xrex/cuda/row_emb/src/row_emb_common.cuh
phoenix/xrex/cuda/row_emb/src/row_emb_kernel.cu
phoenix/xrex/cuda/row_emb/src/row_emb_kernel.hpp
phoenix/xrex/cuda/top_k_by_key/__init__.py
phoenix/xrex/cuda/top_k_by_key/src/top_k_by_key_api.cc
phoenix/xrex/cuda/top_k_by_key/src/top_k_by_key_async_api.cc
phoenix/xrex/cuda/top_k_by_key/src/top_k_by_key_async_kernel.cu
phoenix/xrex/cuda/top_k_by_key/src/top_k_by_key_async_kernel.hpp
phoenix/xrex/cuda/top_k_by_key/src/top_k_by_key_ffi.cc
phoenix/xrex/cuda/top_k_by_key/src/top_k_by_key_kernel.cu
phoenix/xrex/cuda/top_k_by_key/src/top_k_by_key_kernel.hpp
phoenix/xrex/cuda/top_k_by_key/src/top_k_by_key_radix_select_api.cc
phoenix/xrex/cuda/top_k_by_key/src/top_k_by_key_radix_select_kernel.cu
phoenix/xrex/cuda/top_k_by_key/src/top_k_by_key_radix_select_kernel.hpp
phoenix/xrex/cuda/unique/__init__.py
phoenix/xrex/cuda/unique/src/unique_api.cc
phoenix/xrex/cuda/unique/src/unique_kernel.cu
phoenix/xrex/cuda/unique/src/unique_kernel.hpp
phoenix/xrex/cuda/xla_utils/cuda_error_utils.hpp
phoenix/xrex/cuda/xla_utils/thrust_allocator.hpp
phoenix/xrex/cutedsl/__init__.py
phoenix/xrex/cutedsl/fp8_transpose.py
phoenix/xrex/cutedsl/qk_norm_rope_backward.py
phoenix/xrex/cutedsl/quack/LICENSE
phoenix/xrex/cutedsl/quack/__init__.py
phoenix/xrex/cutedsl/quack/activation.py
phoenix/xrex/cutedsl/quack/copy_utils.py
phoenix/xrex/cutedsl/quack/cute_dsl_elf_fix.py
phoenix/xrex/cutedsl/quack/cute_dsl_mlir_threading.py
phoenix/xrex/cutedsl/quack/cute_dsl_utils.py
phoenix/xrex/cutedsl/quack/layout_utils.py
phoenix/xrex/cutedsl/quack/rounding.py
phoenix/xrex/cutedsl/quack/sm90_utils.py
phoenix/xrex/cutedsl/quack/utils.py
phoenix/xrex/cutedsl/ranker_attention_candidate_only_fa4.py
phoenix/xrex/cutedsl/ranker_attention_fa4.py
phoenix/xrex/cutedsl/ranker_attention_varlen_candidate_packed_fa4.py
phoenix/xrex/cutedsl/ranker_attention_varlen_fa4.py
phoenix/xrex/cutedsl/ranker_fa4/__init__.py
phoenix/xrex/cutedsl/ranker_fa4/ampere_helpers.py
phoenix/xrex/cutedsl/ranker_fa4/barrier.py
phoenix/xrex/cutedsl/ranker_fa4/blackwell_helpers.py
phoenix/xrex/cutedsl/ranker_fa4/block_info.py
phoenix/xrex/cutedsl/ranker_fa4/block_sparse_utils.py
phoenix/xrex/cutedsl/ranker_fa4/block_sparsity.py
phoenix/xrex/cutedsl/ranker_fa4/copy_utils.py
phoenix/xrex/cutedsl/ranker_fa4/cute_dsl_utils.py
phoenix/xrex/cutedsl/ranker_fa4/fa_logging.py
phoenix/xrex/cutedsl/ranker_fa4/fast_math.py
phoenix/xrex/cutedsl/ranker_fa4/flash_bwd.py
phoenix/xrex/cutedsl/ranker_fa4/flash_bwd_postprocess.py
phoenix/xrex/cutedsl/ranker_fa4/flash_bwd_preprocess.py
phoenix/xrex/cutedsl/ranker_fa4/flash_bwd_sm100.py
phoenix/xrex/cutedsl/ranker_fa4/flash_bwd_sm90.py
phoenix/xrex/cutedsl/ranker_fa4/flash_fwd.py
phoenix/xrex/cutedsl/ranker_fa4/flash_fwd_sm100.py
phoenix/xrex/cutedsl/ranker_fa4/flash_fwd_sm90.py
phoenix/xrex/cutedsl/ranker_fa4/mask.py
phoenix/xrex/cutedsl/ranker_fa4/mma_sm100_desc.py
phoenix/xrex/cutedsl/ranker_fa4/named_barrier.py
phoenix/xrex/cutedsl/ranker_fa4/pack_gqa.py
phoenix/xrex/cutedsl/ranker_fa4/paged_kv.py
phoenix/xrex/cutedsl/ranker_fa4/pipeline.py
phoenix/xrex/cutedsl/ranker_fa4/seqlen_info.py
phoenix/xrex/cutedsl/ranker_fa4/softmax.py
phoenix/xrex/cutedsl/ranker_fa4/tile_scheduler.py
phoenix/xrex/cutedsl/ranker_fa4/utils.py
phoenix/xrex/data/__init__.py
phoenix/xrex/data/cold_pool_filter.py
phoenix/xrex/data/conversion_labels.py
phoenix/xrex/data/grpc_recsys.py
phoenix/xrex/data/parquet_recsys.py
phoenix/xrex/data/parquet_recsys_metadata.py
phoenix/xrex/data/recsys/__init__.py
phoenix/xrex/data/recsys/ads_head_masking.py
phoenix/xrex/data/recsys/ads_late_window.py
phoenix/xrex/data/recsys/ads_pixel_head_masking.py
phoenix/xrex/data/recsys/array_allocator.py
phoenix/xrex/data/recsys/constants.py
phoenix/xrex/data/recsys/feature_config.py
phoenix/xrex/data/recsys/history_id_lists.py
phoenix/xrex/data/recsys/id_list_features.py
phoenix/xrex/data/recsys/id_list_presets.py
phoenix/xrex/data/recsys/negative_word_match.py
phoenix/xrex/data/recsys/recsys_batch.py
phoenix/xrex/data/recsys/reply_features.py
phoenix/xrex/data/recsys/safety_filter.py
phoenix/xrex/data/recsys/sequence_packing.py
phoenix/xrex/data/retrieval_dataset.py
phoenix/xrex/data/rust_ext.py
phoenix/xrex/data/rust_kafka_recsys.py
phoenix/xrex/data/rust_parquet_recsys.py
phoenix/xrex/data/streaming/__init__.py
phoenix/xrex/data/streaming/history_url_embedding.py
phoenix/xrex/data/streaming/kafkaconsumer.py
phoenix/xrex/data/streaming/kafkadispatcherloader.py
phoenix/xrex/data/streaming/kafkaloader.py
phoenix/xrex/driver/__init__.py
phoenix/xrex/driver/config_factory.py
phoenix/xrex/driver/core.py
phoenix/xrex/driver/hooks.py
phoenix/xrex/driver/local.py
phoenix/xrex/driver/run.py
phoenix/xrex/eval/eval_utils.py
phoenix/xrex/eval/evaluator_recsys.py
phoenix/xrex/eval/metrics.py
phoenix/xrex/eval/metrics_recsys.py
phoenix/xrex/eval/recsys_eval.py
phoenix/xrex/inference/__init__.py
phoenix/xrex/inference/checkpoint_storage.py
phoenix/xrex/inference/debug_logger.py
phoenix/xrex/inference/h2d.py
phoenix/xrex/inference/int8_post_table.py
phoenix/xrex/inference/launch_inference.py
phoenix/xrex/inference/launch_multi_inference.py
phoenix/xrex/inference/metrics.py
phoenix/xrex/inference/model_runner.py
phoenix/xrex/inference/oss_bench/__init__.py
phoenix/xrex/inference/oss_bench/bench.py
phoenix/xrex/inference/pinned_d2h.py
phoenix/xrex/inference/reply_services.py
phoenix/xrex/inference/service_registry.py
phoenix/xrex/inference/serving_services.py
phoenix/xrex/inference/status_server.py
phoenix/xrex/models/__init__.py
phoenix/xrex/models/attention.py
phoenix/xrex/models/collective_policy.py
phoenix/xrex/models/compress_token_ids.py
phoenix/xrex/models/fp8.py
phoenix/xrex/models/layers.py
phoenix/xrex/models/linear_layer.py
phoenix/xrex/models/loss_recsys.py
phoenix/xrex/models/model_utils.py
phoenix/xrex/models/normalization.py
phoenix/xrex/models/page_critic.py
phoenix/xrex/models/page_decoder.py
phoenix/xrex/models/page_rl.py
phoenix/xrex/models/recsys_attention.py
phoenix/xrex/models/recsys_embedding.py
phoenix/xrex/models/recsys_feature_prep.py
phoenix/xrex/models/recsys_model.py
phoenix/xrex/models/recsys_reply_two_tower_v2_model.py
phoenix/xrex/models/recsys_sid.py
phoenix/xrex/models/recsys_two_tower_model.py
phoenix/xrex/models/recsys_user_features.py
phoenix/xrex/models/remat.py
phoenix/xrex/models/scaling.py
phoenix/xrex/models/sharding_context.py
phoenix/xrex/models/topic_categories.py
phoenix/xrex/models/transformer.py
phoenix/xrex/models/value_bin_tables.py
phoenix/xrex/models/value_heads.py
phoenix/xrex/optimizers/__init__.py
phoenix/xrex/optimizers/optim.py
phoenix/xrex/optimizers/recsys/__init__.py
phoenix/xrex/optimizers/recsys/config.py
phoenix/xrex/optimizers/recsys/dense_optim.py
phoenix/xrex/optimizers/recsys/muon.py
phoenix/xrex/optimizers/recsys/protocol.py
phoenix/xrex/optimizers/recsys/rowwise_adagrad.py
phoenix/xrex/optimizers/schedule.py
phoenix/xrex/pallas/__init__.py
phoenix/xrex/pallas/attention.py
phoenix/xrex/pallas/ranker_attention.py
phoenix/xrex/pallas/ranker_attention_fa3.py
phoenix/xrex/pallas/ranker_attention_utils.py
phoenix/xrex/pallas/ranker_attention_v2.py
phoenix/xrex/pallas/ranker_attention_varlen.py
phoenix/xrex/settings.py
phoenix/xrex/testing.py
phoenix/xrex/tools/id_list_fill_stats.py
phoenix/xrex/train/__init__.py
phoenix/xrex/train/checkpoint_write.py
phoenix/xrex/train/embedding_loader.py
phoenix/xrex/train/follow_data_end.py
phoenix/xrex/train/misc.py
phoenix/xrex/train/parallel_config.py
phoenix/xrex/train/recsys_bundle_export.py
phoenix/xrex/train/retrieval_corpus_stager.py
phoenix/xrex/train/row_embedding_restore.py
phoenix/xrex/train/trainer.py
phoenix/xrex/train/trainer_recsys.py
phoenix/xrex/utils/__init__.py
phoenix/xrex/utils/aot.py
phoenix/xrex/utils/checkpointing.py
phoenix/xrex/utils/cluster.py
phoenix/xrex/utils/coalesced_device_put.py
phoenix/xrex/utils/gpu.py
phoenix/xrex/utils/jax_extensions.py
phoenix/xrex/utils/launch_env.py
phoenix/xrex/utils/layer_stack.py
phoenix/xrex/utils/log_timer.py
phoenix/xrex/utils/log_util.py
phoenix/xrex/utils/metadata.py
phoenix/xrex/utils/metrics.py
phoenix/xrex/utils/model.py
phoenix/xrex/utils/nsys.py
phoenix/xrex/utils/ocdbt.py
phoenix/xrex/utils/profiler.py
phoenix/xrex/utils/pyspy_profiler.py
phoenix/xrex/utils/recsys_async_emb.py
phoenix/xrex/utils/sharding.py
phoenix/xrex/utils/toolbox_notify.py
phoenix/xrex/utils/tracer.py
phoenix/xrex/utils/utils.py
pnsfwmedia/model_experimental.py
safety-label-source/connect.rs
safety-label-source/decode.rs
safety-label-source/lib.rs
safety-label-source/metrics.rs
safety-label-source/mh_client.rs
safety-label-source/remote.rs
safety-label-source/source.rs
safety-label-source/testing.rs
safety-label-source/warmer.rs
safety-label-user-agg/postToUserLabelRules.strato
safety-label-user-agg/safetyLabelToUserLevelAggregationV2Forwarder.strato
safety-label-user-agg/safetyLabelToUserLevelAggregationV2Processor.strato
scarecrow/BotmakerInitializer.scala
scarecrow/GuiceNamedConstants.scala
scarecrow/Module.scala
scarecrow/ScarecrowBotMaker.scala
scarecrow/ScarecrowRuntime.scala
scarecrow/Server.scala
scarecrow/function/ActionIntakeServiceRegistry.scala
scarecrow/function/JsonRegistry.scala
scarecrow/function/ListRegistry.scala
scarecrow/legacy/ActionerRegistry.scala
scarecrow/legacy/DownstreamServices.scala
scarecrow/legacy/Fetcher10Functions.scala
scarecrow/legacy/FlockRegistry.scala
scarecrow/legacy/FunctionsWithoutDownstreams.scala
scarecrow/legacy/GizmoduckRegistry.scala
scarecrow/legacy/GuanoRegistry.scala
scarecrow/legacy/HllCounterStoreRegistry.scala
scarecrow/legacy/LimiterRegistry.scala
scarecrow/legacy/ModelRegistry.scala
scarecrow/legacy/ReportServiceRegistry.scala
scarecrow/legacy/SlugToTweetIdStoreRegistry.scala
scarecrow/legacy/SpamLabelStoreRegistry.scala
scarecrow/legacy/StratoRegistry.scala
scarecrow/legacy/TweetServiceRegistry.scala
scarecrow/legacy/UrlPartsRegistry.scala
scarecrow/legacy/UrlResolutionRegistry.scala
scarecrow/legacy/UrlToSlugStoreRegistry.scala
scarecrow/legacy/UrlVerdictRegistry.scala
scarecrow/legacy/XReviewIntakeRegistry.scala
scarecrow/legacy/XReviewReportBuilder.scala
scarecrow/legacy/XReviewReportSubmitter.scala
scarecrow/legacy/function/Log.scala
scarecrow/legacy/function/RateLimited.scala
scarecrow/sys/FixBotMakerLog.scala
scarecrow/util/RegexUtils.scala
simclusters/simclusters_v2/candidate_source/ClusterRanker.scala
simclusters/simclusters_v2/candidate_source/HeavyRanker.scala
simclusters/simclusters_v2/candidate_source/SimClustersANNCandidateSource.scala
simclusters/simclusters_v2/candidate_source/SimClustersANNWrapperCandidateSource.scala
simclusters/simclusters_v2/common/CosineSimilarityUtil.scala
simclusters/simclusters_v2/common/DeciderGateBuilderWithIdHashing.scala
simclusters/simclusters_v2/common/ModelVersions.scala
simclusters/simclusters_v2/common/SeqStandardDeviation.scala
simclusters/simclusters_v2/common/SimClustersEmbedding.scala
simclusters/simclusters_v2/common/SimClustersEmbeddingAttentionUtil.scala
simclusters/simclusters_v2/common/SimClustersEmbeddingId.scala
simclusters/simclusters_v2/common/SimClustersEmbeddingIdCacheKeyBuilder.scala
simclusters/simclusters_v2/common/SimClustersEmbeddingMonoid.scala
simclusters/simclusters_v2/common/SimClustersMultiEmbedding.scala
simclusters/simclusters_v2/common/SimClustersMultiEmbeddingId.scala
simclusters/simclusters_v2/common/clustering/ClusterRepresentativeSelectionMethod.scala
simclusters/simclusters_v2/common/clustering/ClusteringMethod.scala
simclusters/simclusters_v2/common/clustering/ConnectedComponentsClusteringMethod.scala
simclusters/simclusters_v2/common/clustering/LargestDimensionClusteringMethod.scala
simclusters/simclusters_v2/common/clustering/LouvainClusteringMethod.scala
simclusters/simclusters_v2/common/clustering/MaxFavScoreRepresentativeSelectionMethod.scala
simclusters/simclusters_v2/common/clustering/MedoidRepresentativeSelectionMethod.scala
simclusters/simclusters_v2/common/clustering/SimilarityFunctions.scala
simclusters/simclusters_v2/common/ml/SimClustersEmbeddingAdapter.scala
simclusters/simclusters_v2/common/package.scala
simclusters/simclusters_v2/scalding/BipartiteClusterEvaluation.scala
simclusters/simclusters_v2/scalding/BipartiteClusterEvaluationClasses.scala
simclusters/simclusters_v2/scalding/ClusterDetailsJob.scala
simclusters/simclusters_v2/scalding/ClusterEvaluation.scala
simclusters/simclusters_v2/scalding/CompareClusters.scala
simclusters/simclusters_v2/scalding/EigenVectorsForSparseSymmetric.scala
simclusters/simclusters_v2/scalding/InterestedInFromAggregatableProducerEmbeddings.scala
simclusters/simclusters_v2/scalding/InterestedInFromKnownFor.scala
simclusters/simclusters_v2/scalding/InterestedInFromKnownForLite.scala
simclusters/simclusters_v2/scalding/InterestedInFromProducerEmbeddingsAdhocApp.scala
simclusters/simclusters_v2/scalding/KnownForSources.scala
simclusters/simclusters_v2/scalding/LabeledSimclusters.scala
simclusters/simclusters_v2/scalding/ProducerNormsAndCounts.scala
simclusters/simclusters_v2/scalding/TopUsersSimilarityGraph.scala
simclusters/simclusters_v2/scalding/UpdateKnownFor.scala
simclusters/simclusters_v2/scalding/UpdateKnownForApps.scala
simclusters/simclusters_v2/scalding/UserUserFavGraph.scala
simclusters/simclusters_v2/scalding/UserUserGraph.scala
simclusters/simclusters_v2/scalding/UserUserNormalizedGraph.scala
simclusters/simclusters_v2/scalding/common/PersistentTweetEmbeddingSource.scala
simclusters/simclusters_v2/scalding/common/QTreeMultiAggregator.scala
simclusters/simclusters_v2/scalding/common/TypedRichPipe.scala
simclusters/simclusters_v2/scalding/common/Util.scala
simclusters/simclusters_v2/scalding/common/matrix/DenseRowMatrix.scala
simclusters/simclusters_v2/scalding/common/matrix/SparseMatrix.scala
simclusters/simclusters_v2/scalding/common/matrix/SparseRowMatrix.scala
simclusters/simclusters_v2/scalding/common/matrix/TypedPipeMatrix.scala
simclusters/simclusters_v2/scalding/embedding/EntityEmbeddingFromProducerEmbeddingJob.scala
simclusters/simclusters_v2/scalding/embedding/EntityToSimClustersEmbeddingsJob.scala
simclusters/simclusters_v2/scalding/embedding/GlobalSimClustersLanguageEmbedding.scala
simclusters/simclusters_v2/scalding/embedding/LocaleEntitySimClustersEmbeddingV2Job.scala
simclusters/simclusters_v2/scalding/embedding/LocaleEntitySimClustersEmbeddingsJob.scala
simclusters/simclusters_v2/scalding/embedding/ProducerEmbeddingsFromInterestedIn.scala
simclusters/simclusters_v2/scalding/embedding/SimilarUsersBySimClustersEmbedding.scala
simclusters/simclusters_v2/scalding/embedding/abuse/AbuseSimclusterFeaturesScaldingJob.scala
simclusters/simclusters_v2/scalding/embedding/abuse/AdhocAbuseSimClusterFeaturesScaldingJob.scala
simclusters/simclusters_v2/scalding/embedding/abuse/CrossSimClusterFeaturesScaldingJob.scala
simclusters/simclusters_v2/scalding/embedding/abuse/DataSources.scala
simclusters/simclusters_v2/scalding/embedding/abuse/PairedinteractionFeatures.scala
simclusters/simclusters_v2/scalding/embedding/abuse/SingleSideInteractionTransformation.scala
simclusters/simclusters_v2/scalding/embedding/common/EmbeddingUtil.scala
simclusters/simclusters_v2/scalding/embedding/common/EntityEmbeddingUtil.scala
simclusters/simclusters_v2/scalding/embedding/common/ExternalDataSources.scala
simclusters/simclusters_v2/scalding/embedding/common/SimClustersEmbeddingJob.scala
simclusters/simclusters_v2/scalding/embedding/producer/AggregatableFavBasedProducerEmbeddings.scala
simclusters/simclusters_v2/scalding/embedding/producer/AggregatableFollowBasedProducerEmbeddings.scala
simclusters/simclusters_v2/scalding/embedding/producer/AggregatableLogFavBasedProducerEmbeddings.scala
simclusters/simclusters_v2/scalding/embedding/producer/AggregatableProducerEmbeddings.scala
simclusters/simclusters_v2/scalding/embedding/tfg/EngagementWeightedTfgBasedTopicEmbeddingsJob.scala
simclusters/simclusters_v2/scalding/embedding/tfg/FavInferredLanguageTfgBasedTopicEmbeddings.scala
simclusters/simclusters_v2/scalding/embedding/tfg/FavTfgBasedTopicEmbeddings.scala
simclusters/simclusters_v2/scalding/embedding/tfg/InferredLanguageTfgBasedTopicEmbeddingsBaseApp.scala
simclusters/simclusters_v2/scalding/embedding/tfg/LogFavTfgBasedTopicEmbeddings.scala
simclusters/simclusters_v2/scalding/embedding/tfg/TfgBasedTopicEmbeddingsBaseApp.scala
simclusters/simclusters_v2/scalding/embedding/twice/InterestedInTwice.scala
simclusters/simclusters_v2/scalding/embedding/twice/InterestedInTwiceBaseApp.scala
simclusters/simclusters_v2/scalding/evaluation/CandidateEvaluationBase.scala
simclusters/simclusters_v2/scalding/evaluation/EvaluationMetricHelper.scala
simclusters/simclusters_v2/scalding/evaluation/EvaluationReferenceDataExtraction.scala
simclusters/simclusters_v2/scalding/evaluation/LabelCorrelationsHelper.scala
simclusters/simclusters_v2/scalding/evaluation/SimClustersEvaluationAdhocApp.scala
simclusters/simclusters_v2/scalding/inferred_entities/InferredEntities.scala
simclusters/simclusters_v2/scalding/inferred_entities/InferredEntitiesFromInterestedIn.scala
simclusters/simclusters_v2/scalding/inferred_entities/InferredSemanticCoreEntitiesFromKnownFor.scala
simclusters/simclusters_v2/scalding/inferred_entities/ProdSources.scala
simclusters/simclusters_v2/scalding/mbcg/AllFeatures.scala
simclusters/simclusters_v2/scalding/mbcg/RecordAdapters.scala
simclusters/simclusters_v2/scalding/mbcg/TweetEmbeddingGenerationJob.scala
simclusters/simclusters_v2/scalding/mbcg/UserEmbeddingGenerationJob.scala
simclusters/simclusters_v2/scalding/multi_type_graph/assemble_multi_type_graph/AssembleMultiTypeGraph.scala
simclusters/simclusters_v2/scalding/multi_type_graph/assemble_multi_type_graph/AssembleMultiTypeGraphApp.scala
simclusters/simclusters_v2/scalding/multi_type_graph/assemble_multi_type_graph/AssembleMultiTypeGraphBaseApp.scala
simclusters/simclusters_v2/scalding/multi_type_graph/assemble_multi_type_graph/Config.scala
simclusters/simclusters_v2/scalding/offline_data_conversion/AsyncMeterLimiter.scala
simclusters/simclusters_v2/scalding/offline_data_conversion/ClusterDetails20M145K2020FlattenJob.scala
simclusters/simclusters_v2/scalding/offline_data_conversion/HydrationHelper.scala
simclusters/simclusters_v2/scalding/offline_data_conversion/InterestedIn20M145K2020FlattenJob.scala
simclusters/simclusters_v2/scalding/offline_data_conversion/InterestedIn20M145K2020FlattenTransform.scala
simclusters/simclusters_v2/scalding/offline_data_conversion/KnownFor20M145K2020FlattenJob.scala
simclusters/simclusters_v2/scalding/offline_data_conversion/KnownFor20M145K2020FlattenTransform.scala
simclusters/simclusters_v2/scalding/offline_job/OfflineTweetRecommendation.scala
simclusters/simclusters_v2/scalding/offline_job/SimClustersOfflineJob.scala
simclusters/simclusters_v2/scalding/offline_job/SimClustersOfflineJobAdhocApp.scala
simclusters/simclusters_v2/scalding/offline_job/SimClustersOfflineJobScheduledApp.scala
simclusters/simclusters_v2/scalding/offline_job/SimClustersOfflineJobUtil.scala
simclusters/simclusters_v2/scalding/offline_job/adhoc/SimClustersTweetEmbeddingAdhocApp.scala
simclusters/simclusters_v2/scalding/offline_job/adhoc/TweetSimilarityEvaluationAdhocApp.scala
simclusters/simclusters_v2/scalding/offline_tweets/ClusterTopMediaTweetsJob.scala
simclusters/simclusters_v2/scalding/optout/InterestedInOptOut.scala
simclusters/simclusters_v2/scalding/optout/KnownForOptOut.scala
simclusters/simclusters_v2/scalding/optout/SimClustersOptOutUtil.scala
simclusters/simclusters_v2/scalding/topic_recommendations/GeoPopularTopicsApp.scala
simclusters/simclusters_v2/scalding/topic_recommendations/ProducersForTopicsFromTopicFollowGraph.scala
simclusters/simclusters_v2/scalding/topic_recommendations/SimilarTopicsFromTopicFollowGraphApp.scala
simclusters/simclusters_v2/scalding/topic_recommendations/TopicsForProducersFromEM.scala
simclusters/simclusters_v2/scalding/topic_recommendations/TopicsForProducersUtils.scala
simclusters/simclusters_v2/scalding/topic_recommendations/model_based_topic_recommendations/DataSources.scala
simclusters/simclusters_v2/scalding/topic_recommendations/model_based_topic_recommendations/UserFeatures.scala
simclusters/simclusters_v2/scalding/topic_recommendations/model_based_topic_recommendations/UserTopicDataRecordAdapter.scala
simclusters/simclusters_v2/scalding/topic_recommendations/model_based_topic_recommendations/UserTopicModellingTrainingDataCollectionJob.scala
simclusters/simclusters_v2/scalding/tweet_similarity/DatasetTopKAnalysisJob.scala
simclusters/simclusters_v2/scalding/tweet_similarity/TrainingDataCollectionJob.scala
simclusters/simclusters_v2/scalding/tweet_similarity/TrainingDataCollectionUtil.scala
simclusters/simclusters_v2/scalding/tweet_similarity/TweetPairFeatureHydrationUtil.scala
simclusters/simclusters_v2/scalding/tweet_similarity/TweetPairLabelCollectionUtil.scala
simclusters/simclusters_v2/scalding/tweet_similarity/UnhydratedPairsCollectionJob.scala
simclusters/simclusters_v2/scalding/tweet_similarity/evaluation/ModelEvalAdhocApp.scala
simclusters/simclusters_v2/scalding/tweet_similarity/evaluation/RUXLandingDdgAnalysisAdhocApp.scala
simclusters/simclusters_v2/scalding/update_known_for/UpdateKnownFor20M145K2020.scala
simclusters/simclusters_v2/scalding/update_known_for/UpdateKnownForSBFRunner.scala
simclusters/simclusters_v2/score/AggregatedScoreStore.scala
simclusters/simclusters_v2/score/Score.scala
simclusters/simclusters_v2/score/ScoreFacadeStore.scala
simclusters/simclusters_v2/score/ScoreId.scala
simclusters/simclusters_v2/score/ScoreStore.scala
simclusters/simclusters_v2/score/SimClustersEmbeddingPairScoreStore.scala
simclusters/simclusters_v2/score/WeightedSumAggregatedScoreStore.scala
simclusters/simclusters_v2/stores/LanguageFilteredLocaleEntityEmbeddingStore.scala
simclusters/simclusters_v2/stores/MultiTypeGraphStore.scala
simclusters/simclusters_v2/stores/SimClustersEmbeddingStore.scala
simclusters/simclusters_v2/stores/SimClustersMultiEmbeddingStore.scala
simclusters/simclusters_v2/stores/TopicTopProducersStore.scala
simclusters/simclusters_v2/stores/WtfMbcgStore.scala
simclusters/simclusters_v2/summingbird/common/ClientConfigs.scala
simclusters/simclusters_v2/summingbird/common/Configs.scala
simclusters/simclusters_v2/summingbird/common/EntityUtil.scala
simclusters/simclusters_v2/summingbird/common/Implicits.scala
simclusters/simclusters_v2/summingbird/common/ModelVersionProfile.scala
simclusters/simclusters_v2/summingbird/common/Monoids.scala
simclusters/simclusters_v2/summingbird/common/SimClustersEmbeddingWithMetadataMonoid.scala
simclusters/simclusters_v2/summingbird/common/SimClustersHashUtil.scala
simclusters/simclusters_v2/summingbird/common/SimClustersInterestedInUtil.scala
simclusters/simclusters_v2/summingbird/common/SimClustersProfile.scala
simclusters/simclusters_v2/summingbird/common/StatsUtil.scala
simclusters/simclusters_v2/summingbird/common/SummerWithSumValues.scala
simclusters/simclusters_v2/summingbird/common/ThriftDecayedValueMonoid.scala
simclusters/simclusters_v2/summingbird/common/TweetEntityExtractor.scala
simclusters/simclusters_v2/summingbird/stores/AdsTwhinTweetEmbeddingStore.scala
simclusters/simclusters_v2/summingbird/stores/AdsTwhinUserEmbeddingStore.scala
simclusters/simclusters_v2/summingbird/stores/ApeTopicEmbeddingStore.scala
simclusters/simclusters_v2/summingbird/stores/ClusterDetailsReadableStore.scala
simclusters/simclusters_v2/summingbird/stores/EntityClusterScoreReadableStore.scala
simclusters/simclusters_v2/summingbird/stores/GizmoduckUserStore.scala
simclusters/simclusters_v2/summingbird/stores/ManhattanFromStratoStore.scala
simclusters/simclusters_v2/summingbird/stores/PersistentTweetEmbeddingStore.scala
simclusters/simclusters_v2/summingbird/stores/ProducerClusterEmbeddingReadableStores.scala
simclusters/simclusters_v2/summingbird/stores/SemanticCoreEntityEmbeddingStore.scala
simclusters/simclusters_v2/summingbird/stores/SimClustersManhattanReadableStoreForReadWriteDataset.scala
simclusters/simclusters_v2/summingbird/stores/TfgTopicEmbeddingsStore.scala
simclusters/simclusters_v2/summingbird/stores/TopKClustersForEntityReadableStore.scala
simclusters/simclusters_v2/summingbird/stores/TopKClustersForTweetReadableStore.scala
simclusters/simclusters_v2/summingbird/stores/TopKHydratedTweetsForClusterReadableStore.scala
simclusters/simclusters_v2/summingbird/stores/TopKTweetsForClusterReadableStore.scala
simclusters/simclusters_v2/summingbird/stores/TweetMetadataStore.scala
simclusters/simclusters_v2/summingbird/stores/TweetSquaredL2NormWritableStore.scala
simclusters/simclusters_v2/summingbird/stores/TweetStatusCountsStore.scala
simclusters/simclusters_v2/summingbird/stores/TweetStatusCountsTesStore.scala
simclusters/simclusters_v2/summingbird/stores/TwhinTweetEmbeddingStore.scala
simclusters/simclusters_v2/summingbird/stores/TwhinUserEmbeddingStore.scala
simclusters/simclusters_v2/summingbird/stores/UserInterestedInReadableStore.scala
simclusters/simclusters_v2/summingbird/stores/UserKnownForReadableStore.scala
simclusters/simclusters_v2/summingbird/storm/AdsTwhinRebuildTweetJob.scala
simclusters/simclusters_v2/summingbird/storm/AdsTwhinRebuildTweetJobRunner.scala
simclusters/simclusters_v2/summingbird/storm/AdsTwhinRebuildUserJob.scala
simclusters/simclusters_v2/summingbird/storm/AdsTwhinRebuildUserJobRunner.scala
simclusters/simclusters_v2/summingbird/storm/PersistentTweetJob.scala
simclusters/simclusters_v2/summingbird/storm/PersistentTweetJobRunner.scala
simclusters/simclusters_v2/summingbird/storm/TweetJob.scala
simclusters/simclusters_v2/summingbird/storm/TweetJobRunner.scala
simclusters/simclusters_v2/summingbird/storm/TwhinRebuildTweetJob.scala
simclusters/simclusters_v2/summingbird/storm/TwhinRebuildTweetJobRunner.scala
simclusters/simclusters_v2/summingbird/storm/TwhinRebuildUserJob.scala
simclusters/simclusters_v2/summingbird/storm/TwhinRebuildUserJobRunner.scala
simclusters/simclusters_v2/summingbird/storm/TwhinTweetJob.scala
simclusters/simclusters_v2/summingbird/storm/TwhinTweetJobRunner.scala
simclusters/simclusters_v2/summingbird/storm/TwhinUserJob.scala
simclusters/simclusters_v2/summingbird/storm/TwhinUserJobRunner.scala
simclusters/simclusters_v2/tweet_similarity/ModelBasedTweetSimilaritySimClustersEmbeddingAdapter.scala
simclusters/simclusters_v2/tweet_similarity/TweetSimilarityFeatures.scala
simclusters/simclustersann/SimclustersAnnServer.scala
simclusters/simclustersann/SimclustersAnnWarmupHandler.scala
simclusters/simclustersann/candidate_source/ApproximateCosineSimilarity.scala
simclusters/simclustersann/candidate_source/ExperimentalApproximateCosineSimilarity.scala
simclusters/simclustersann/candidate_source/OptimizedApproximateCosineSimilarity.scala
simclusters/simclustersann/candidate_source/SimClustersANNCandidateSource.scala
simclusters/simclustersann/common/FlagNames.scala
simclusters/simclustersann/controllers/GetTweetCandidatesGrpcController.scala
simclusters/simclustersann/controllers/SimClustersANNController.scala
simclusters/simclustersann/exceptions/InvalidRequestForSimClustersAnnVariantException.scala
simclusters/simclustersann/exceptions/InvalidRequestForSimClustersAnnVariantExceptionMapper.scala
simclusters/simclustersann/exceptions/MissingClusterConfigForSimClustersAnnVariantException.scala
simclusters/simclustersann/filters/GetTweetCandidatesResponseStatsFilter.scala
simclusters/simclustersann/filters/SimClustersAnnVariantFilter.scala
simclusters/simclustersann/modules/CacheModule.scala
simclusters/simclustersann/modules/ClusterConfigMapperModule.scala
simclusters/simclustersann/modules/ClusterConfigModule.scala
simclusters/simclustersann/modules/ClusterDetailsModule.scala
simclusters/simclustersann/modules/ClusterTweetIndexProviderModule.scala
simclusters/simclustersann/modules/CustomMtlsThriftWebFormsModule.scala
simclusters/simclustersann/modules/EmbeddingStoreModule.scala
simclusters/simclustersann/modules/FlagsModule.scala
simclusters/simclustersann/modules/FuturePoolProvider.scala
simclusters/simclustersann/modules/RateLimiterModule.scala
simclusters/simclustersann/modules/ServiceNameMapperModule.scala
simclusters/simclustersann/modules/SimClustersANNCandidateSourceModule.scala
simclusters/simclustersann/modules/SquaredL2NormStoreModule.scala
simclusters/simclustersann/modules/StratoClientProviderModule.scala
takedowns/gizmoduck/ReadFilters.scala
takedowns/gizmoduck/RedactUnenforcedTakedownsFilter.scala
takedowns/tweet-entity-service/TakedownReasonsColumn.scala
takedowns/tweet-entity-service/TakedownReasonsTransform.scala
thunder/args.rs
thunder/config.rs
thunder/deserializer.rs
thunder/kafka/mod.rs
thunder/kafka/tweet_events_listener.rs
thunder/kafka/tweet_events_listener_v2.rs
thunder/kafka/utils.rs
thunder/kafka_utils.rs
thunder/lib.rs
thunder/main.rs
thunder/metrics.rs
thunder/o2/mod.rs
thunder/posts/mod.rs
thunder/posts/post_store.rs
thunder/schema/events.rs
thunder/schema/media_common.rs
thunder/schema/media_entity.rs
thunder/schema/mod.rs
thunder/schema/tweet.rs
thunder/schema/tweet_events.rs
thunder/schema/tweet_media.rs
thunder/schema/user.rs
thunder/strato_client.rs
thunder/thunder_service.rs
under-the-hood/jetfuel/gql/underTheHoodReport.gql
under-the-hood/jetfuel/routes/_lib/load.ts
under-the-hood/jetfuel/routes/_lib/report.ts
under-the-hood/jetfuel/routes/_lib/ui.tsx
under-the-hood/jetfuel/routes/download.tsx
under-the-hood/jetfuel/routes/index.tsx
under-the-hood/jetfuel/routes/report.tsx
under-the-hood/scalding/AccountLabelEvents.scala
under-the-hood/scalding/GizmoduckLabelDiff.scala
under-the-hood/scalding/GizmoduckSafetyFlags.scala
under-the-hood/scalding/TakedownDeltas.scala
under-the-hood/scalding/TakedownLabels.scala
under-the-hood/scalding/TakedownReplay.scala
under-the-hood/scalding/UnderTheHoodCommon.scala
under-the-hood/scalding/UnderTheHoodDates.scala
under-the-hood/scalding/UthDailyAccountLabelsJob.scala
under-the-hood/scalding/UthDailyPostTakedownLabelsJob.scala
under-the-hood/scalding/UthDailyPostsBackfillJob.scala
under-the-hood/scalding/UthDailyPostsJob.scala
under-the-hood/scalding/UthMhInjections.scala
under-the-hood/scalding/UthPctdAccountTakedownEventsJob.scala
under-the-hood/scalding/UthReferenceMonthMhPublisherJob.scala
under-the-hood/scalding/UthUserMonthMhPublisherJob.scala
under-the-hood/scalding/legacy_experimental_adhoc/UnderTheHoodAccountLabelsJob.scala
under-the-hood/scalding/legacy_experimental_adhoc/UnderTheHoodPostLabelsJob.scala
under-the-hood/scalding/legacy_experimental_adhoc/UthFilterTweetSafetyLabelsByDateJob.scala
under-the-hood/scalding/legacy_experimental_adhoc/UthGizmoduckSafetyFlagDailyBackfillJob.scala
under-the-hood/strato/columns/featureSwitches.strato
under-the-hood/strato/columns/graphql/userUnderTheHoodReport.GraphQlQuery.strato
under-the-hood/strato/columns/mh/referenceMonthAggregates.strato
under-the-hood/strato/columns/mh/userMonthAggregates.strato
under-the-hood/strato/columns/underTheHoodReport.User.strato
under-the-hood/strato/columns/underTheHoodReport.strato
under-the-hood/strato/graphql/under_the_hood.thrift
under-the-hood/strato/lib/params.strato
under-the-hood/strato/lib/sharedConfig.strato
under-the-hood/strato/lib/underTheHoodLabels.strato
under-the-hood/thrift/uth_serving.thrift
user-cred-v2/Edge.scala
user-cred-v2/SnapshotSafeguard.scala
user-cred-v2/UserCredV2.scala
user-cred-v2/UserCredV2App.scala
user-cred-v2/UserCredV2Config.scala
user-cred-v2/UserCredV2Injection.scala
user-cred-v2/UserMass.scala
user-cred-v2/UserNode.scala
user-cred-v2/ValidUserInfo.scala
visibility-filtering-client/discovery.rs
visibility-filtering-client/evaluated.rs
visibility-filtering-client/graphql_results.rs
visibility-filtering-client/lib.rs
visibility-filtering-client/links.rs
visibility-filtering-client/metrics.rs
visibility-filtering-client/models.rs
visibility-filtering-client/notifications.rs
visibility-filtering-client/test_support.rs
visibility-filtering-client/tweet_safety_label.rs
visibility-filtering-client/vf_client.rs
visibility-filtering/bin/vf-gate.rs
visibility-filtering/caller_identity.rs
visibility-filtering/clients/about_this_account_client.rs
visibility-filtering/clients/article_client.rs
visibility-filtering/clients/gizmoduck_client.rs
visibility-filtering/clients/label_warm_client.rs
visibility-filtering/clients/mod.rs
visibility-filtering/clients/socialgraph_client.rs
visibility-filtering/clients/strato.rs
visibility-filtering/clients/trusted_friends_client.rs
visibility-filtering/clients/user_devices_client.rs
visibility-filtering/clients/user_location_client.rs
visibility-filtering/clients/wingman_client.rs
visibility-filtering/config.rs
visibility-filtering/dark_traffic_setup.rs
visibility-filtering/evaluate_tweets.rs
visibility-filtering/explain.rs
visibility-filtering/filter_notifications.rs
visibility-filtering/filter_tweets.rs
visibility-filtering/get_safety_labels.rs
visibility-filtering/hydration/batch.rs
visibility-filtering/hydration/community_source.rs
visibility-filtering/hydration/decode/article.rs
visibility-filtering/hydration/decode/author.rs
visibility-filtering/hydration/decode/mod.rs
visibility-filtering/hydration/decode/tweet.rs
visibility-filtering/hydration/decode/viewer.rs
visibility-filtering/hydration/execute.rs
visibility-filtering/hydration/fallback_cache.rs
visibility-filtering/hydration/fetcher.rs
visibility-filtering/hydration/hydrator.rs
visibility-filtering/hydration/inventory.rs
visibility-filtering/hydration/metrics.rs
visibility-filtering/hydration/mod.rs
visibility-filtering/hydration/plan.rs
visibility-filtering/hydration/relation.rs
visibility-filtering/hydration/sources.rs
visibility-filtering/hydration/sources/fake_backends.rs
visibility-filtering/hydration/sources/in_memory.rs
visibility-filtering/hydration/store.rs
visibility-filtering/hydration/store/conversation_root.rs
visibility-filtering/hydration/store/edges.rs
visibility-filtering/hydration/store/key_origin.rs
visibility-filtering/hydration/store/quotes.rs
visibility-filtering/hydration/store/resolve.rs
visibility-filtering/hydration/tweet_source.rs
visibility-filtering/ingress.rs
visibility-filtering/lib.rs
visibility-filtering/main.rs
visibility-filtering/metrics/families.rs
visibility-filtering/metrics/mod.rs
visibility-filtering/models/author.rs
visibility-filtering/models/conversation_control.rs
visibility-filtering/models/mod.rs
visibility-filtering/models/region.rs
visibility-filtering/models/safety_labels.rs
visibility-filtering/models/tweet.rs
visibility-filtering/models/verdict.rs
visibility-filtering/models/viewer.rs
visibility-filtering/params.rs
visibility-filtering/params/client_switches.rs
visibility-filtering/params/limited_actions_copy.rs
visibility-filtering/params/limited_actions_policy.rs
visibility-filtering/pinned.rs
visibility-filtering/post_card.rs
visibility-filtering/post_evaluator.rs
visibility-filtering/post_evaluator/author.rs
visibility-filtering/post_evaluator/notification.rs
visibility-filtering/post_evaluator/retweet.rs
visibility-filtering/quote.rs
visibility-filtering/result_label.rs
visibility-filtering/rules/author_rules.rs
visibility-filtering/rules/catalog.rs
visibility-filtering/rules/context.rs
visibility-filtering/rules/defaults.rs
visibility-filtering/rules/engine.rs
visibility-filtering/rules/expansion.rs
visibility-filtering/rules/fixtures.rs
visibility-filtering/rules/golden_corpus/age_gating.rs
visibility-filtering/rules/golden_corpus/age_verification.rs
visibility-filtering/rules/golden_corpus/article.rs
visibility-filtering/rules/golden_corpus/author_state.rs
visibility-filtering/rules/golden_corpus/baseline.rs
visibility-filtering/rules/golden_corpus/community.rs
visibility-filtering/rules/golden_corpus/conversation_control.rs
visibility-filtering/rules/golden_corpus/exclusive_content.rs
visibility-filtering/rules/golden_corpus/interstitial.rs
visibility-filtering/rules/golden_corpus/label_interstitial.rs
visibility-filtering/rules/golden_corpus/legacy_interstitial.rs
visibility-filtering/rules/golden_corpus/local_regulations.rs
visibility-filtering/rules/golden_corpus/local_tweet.rs
visibility-filtering/rules/golden_corpus/mod.rs
visibility-filtering/rules/golden_corpus/notifications.rs
visibility-filtering/rules/golden_corpus/oon_media.rs
visibility-filtering/rules/golden_corpus/oon_tweet_label.rs
visibility-filtering/rules/golden_corpus/oon_user_label.rs
visibility-filtering/rules/golden_corpus/post_notifications.rs
visibility-filtering/rules/golden_corpus/quoted_tweet_rules.rs
visibility-filtering/rules/golden_corpus/reaction_video.rs
visibility-filtering/rules/golden_corpus/relationship.rs
visibility-filtering/rules/golden_corpus/takedown.rs
visibility-filtering/rules/golden_corpus/trusted_friends.rs
visibility-filtering/rules/golden_corpus/tweet_label.rs
visibility-filtering/rules/golden_corpus/tweet_state.rs
visibility-filtering/rules/levels.rs
visibility-filtering/rules/mod.rs
visibility-filtering/rules/rule_spec.rs
visibility-filtering/rules/rule_spec/conditions.rs
visibility-filtering/rules/rule_spec/engine.rs
visibility-filtering/rules/rule_spec/features.rs
visibility-filtering/rules/rule_spec/features/article.rs
visibility-filtering/rules/rule_spec/features/author.rs
visibility-filtering/rules/rule_spec/features/community.rs
visibility-filtering/rules/rule_spec/features/compound.rs
visibility-filtering/rules/rule_spec/features/edges.rs
visibility-filtering/rules/rule_spec/features/post.rs
visibility-filtering/rules/rule_spec/features/reaction.rs
visibility-filtering/rules/rule_spec/features/request.rs
visibility-filtering/rules/rule_spec/features/tweet.rs
visibility-filtering/rules/rule_spec/features/viewer.rs
visibility-filtering/rules/rule_spec/inputs.rs
visibility-filtering/rules/rule_spec/laws.rs
visibility-filtering/rules/rule_spec/observed.rs
visibility-filtering/rules/rule_spec/predicates.rs
visibility-filtering/rules/rule_spec/rule.rs
visibility-filtering/rules/safety_level.rs
visibility-filtering/rules/tweet_rules.rs
visibility-filtering/scenario.rs
visibility-filtering/server.rs
visibility-filtering/server_deps.rs
visibility-filtering/staging/main.rs
visibility-filtering/staging/mod.rs
visibility-filtering/staging/reference/mod.rs
visibility-filtering/staging/reference/tweetypie.rs
visibility-filtering/staging/reference/tweetypie/quotes.rs
visibility-filtering/staging/serve.rs
visibility-filtering/thrift_read.rs
visibility-filtering/treatment.rs
visibility-filtering/verdict_gate.rs
vm-ranker/args.rs
vm-ranker/config_sync.rs
vm-ranker/dpp.rs
vm-ranker/embedding_store.rs
vm-ranker/helpers.rs
vm-ranker/lib.rs
vm-ranker/main.rs
vm-ranker/metrics.rs
vm-ranker/params.rs
vm-ranker/ranker_service.rs
vm-ranker/ranking_config.rs
vm-ranker/scoring/debias.rs
vm-ranker/scoring/dpp_model.rs
vm-ranker/scoring/mod.rs
vm-ranker/scoring/value_model.rs
vm-ranker/user_debias_store.rs
xai-value-model/inputs.rs
xai-value-model/lib.rs
xai-value-model/phoenix_scores.rs
xai-value-model/proto.rs
xai-value-model/scoring.rs
xai-value-model/weights.rs
```
