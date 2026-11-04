# X公开算法规则交叉核查（2026-11-04）

修订：`2026-11-04-crosschecked-v2`。状态：**source_reviewed_not_operationally_activated，未激活为运行规则**。

上游固定提交：`b220448766ab4ee4c83d58a67d51f0cb5bda86c2`。既有运行基线仍为 `2f252142b9284e692ac72851768c8072d045f0d5`。

[完整审查报告](algorithm-full-review-2026-11-04.md) · [当前规则与证据 manifest](../assets/algorithm-knowledge/research/current.json) · [原研究 manifest](../assets/algorithm-knowledge/research/history/1864d7e20c701f93445396282c5ef35d8081cf1cefcc35d88ac5cdb17f84bc5f.json) · [原研究文档](../assets/algorithm-knowledge/research/history/algorithm-rules-2026-11-04-v1.md)

## 覆盖与限制

本修订补齐重要调用者、实现与消费者的静态交叉证据。全仓盘点为2353个跟踪文件、29个顶层目录和3个根文件，**不是逐文件、逐分支全量语义审计**。原242项变动清单和原审核记录保持；本次新增节选不自动将234个未审核变动改为已审核。生产部署、实验覆盖、模型权重和实际请求输入未知；本次未运行上游服务、模型或测试。

逐字源码节选使用新文件名，保留全部历史材料。manifest分别记录完整源码文件与节选的SHA256及准确行范围。源码许可见[Apache许可](../assets/algorithm-knowledge/source-snapshots/LICENSE.xai-algorithm.txt)。

## 五项关键接线纠正

### home_vm_value_model

Home启用Ranking并发起该请求时，request true OR FS ComputeValueModel使compute开启；实际重算仍需feature config，缺配置回退。RPC错误或响应缺候选保留Home本地分。

声明默认：{"ComputeValueModel": false, "EnableRanking": true}。请求/消费字段：{"compute_value_model": true, "value_model_id": "dpp"}。生产状态：unknown。

证据：[home-request](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/vm_ranker_request.rs#L1-L95)；[vm-rank-gates](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/mod.rs#L40-L102)；[vm-defaults](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L1-L258)；[vm-value](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/value_model.rs#L21-L175)；[home-gates](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L295-L365)；[home-vm](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/vm_ranker.rs#L59-L140)。

### home_vm_new_user_oon

null表示Home调用者未显式传viewer_following_count，不是声明线上字段为null；builder以Default补齐。非主题分支需age<threshold且following_count>=5；不能仅改变年龄默认值便声称Home特殊因子启用。

声明默认：{"NewUserAgeThresholdSecs": 0, "NewUserOonWeightFactor": 1e-05, "NEW_USER_MIN_FOLLOWING": 5}。请求/消费字段：{"viewer_following_count": null, "topic_request": "query.is_topic_request()"}。生产状态：unknown。

证据：[home-request](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/vm_ranker_request.rs#L1-L95)；[vm-value](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/value_model.rs#L21-L175)；[vm-defaults](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L1-L258)。

### home_vf_action_consumption

后置filter只分组保留/移除；此消费者不为Downrank或Avoid乘数值系数。其他surface应独立追踪。

声明默认：{}。请求/消费字段：{"in_network_safety_level": "TimelineHome", "out_of_network_safety_level": "TimelineHomeRecommendations", "actions_mapping": {"Allow": "keep", "Interstitial": "keep", "Avoid": "keep", "Downrank": "keep", "Drop": "remove", "Tombstone": "remove", "NotEvaluated": "remove", "missing": "keep"}}。生产状态：unknown。

证据：[pipeline-v2](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L371-L508)；[vf-hydrator](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_hydrators/vf_candidate_hydrator.rs#L39-L138)；[vf-consumer](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/vf_filter.rs#L1-L27)。

### vm_dpp_gates

必须部署初始化DppContext并通过请求/FS gate；有Params时DppEnabled且非主题或TopicDppEnabled；无Params时gate放行仍需Context。value_model_id=dpp不等于部署已开启。

声明默认：{"dpp_enabled": false, "DppEnabled": true, "TopicDppEnabled": false}。请求/消费字段：{"value_model_id": "dpp", "topic_request": "query.is_topic_request()"}。生产状态：unknown。

证据：[dpp-cli](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/args.rs#L15-L28)；[dpp-init](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/main.rs#L30-L51)；[vm-rank-gates](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/mod.rs#L40-L102)；[vm-defaults](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L1-L258)；[home-request](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/vm_ranker_request.rs#L1-L95)；[dpp-consumer](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/dpp_model.rs#L39-L206)。

### home_page_experiments

各scorer受本身开关控制；Decode启用且已有slot时RL保持原分并跳过抽样。声明默认不等于生产实时配置。

声明默认：{"EnablePageDecodeRerank": false, "EnablePageRlExploration": false}。请求/消费字段：{"page_decode_slot": "candidate output from upstream"}。生产状态：unknown。

证据：[pipeline-v2](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L371-L508)；[page-defaults](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L325-L372)；[page-decode](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/page_decode_rerank_scorer.rs#L81-L138)；[page-rl](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/page_rl_exploration_scorer.rs#L29-L169)。

## 规则目录

以下新增研究条目不表示这些机制是此次上游版本新引入。运营建议属于机制推导，不能换算固定互动汇率、曝光保底或全站处罚。

### research-01 · 预测负反馈降低候选分

Home默认不感兴趣−52.272、屏蔽−31.2、静音−58.8、举报−234、未停留−0.02；与各预测量相乘。

**前提：** 候选进入价值模型计算；其余输入不变且对应预测项上升。
**不可推导：** 一次举报抵消固定点赞数；多人举报必然等比例压低全站曝光。
**状态：** 公开本地默认；线上动态配置与实际曝光效果未知。
**建议：** 建议降低目标受众的不适与误导性预期，不通过系数换算互动次数。
证据：[home-weights](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L375-L520)；[score-fusion](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/scoring.rs#L28-L213)。

### research-02 · 屏蔽和静音关系过滤

观看者屏蔽/静音作者、作者屏蔽观看者，或命中引用/转推相关屏蔽关系时移除候选。

**前提：** 当前请求的关系数据命中过滤条件。
**不可推导：** 一个人屏蔽意味着全站账号受罚。
**状态：** 公开本地默认；线上动态配置与实际曝光效果未知。
**建议：** 建议把特定受众的不可见与全站降权分开排查。
证据：[socialgraph](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/author_socialgraph_filter.rs#L15-L58)；[pipeline](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L421-L476)。

### research-03 · 已看内容去重

关联帖子ID命中seen_ids或Bloom filter时移除。

**前提：** 观看者已看数据或Bloom判定命中。
**不可推导：** 重复曝光减少证明账号降权；Bloom判定绝无误判。
**状态：** 公开本地默认；线上动态配置与实际曝光效果未知。
**建议：** 同一观看者的重复展示减少，不应直接视为账号限流。
证据：[seen](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/previously_seen_posts_filter.rs#L16-L33)；[pipeline](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L421-L476)。

### research-04 · 候选年龄窗口

该Phoenix pipeline将MAX_POST_AGE=48小时传入AgeFilter；年龄不可取得或超窗的候选移除。

**前提：** 该pipeline候选路径；帖子年龄超过48小时或解析失败。
**不可推导：** 旧帖全站失效；48小时是封禁或shadowban期限。
**状态：** 公开本地默认；线上动态配置与实际曝光效果未知。
**建议：** 新鲜内容有进入该候选链的机会；旧内容另行分发不能由此判断。
证据：[age](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/age_filter.rs#L7-L34)；[max-age](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/config.rs#L35-L42)；[pipeline](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L421-L476)。

### research-05 · 同作者候选多样性衰减

VM默认开启作者多样性，decay=.5、floor=.25；按同作者在候选分序中已有数量计算1、.625、.4375等乘子。Home本地weights明确关闭此项。

**前提：** 进入启用该乘子的VM路径；同作者多个候选竞争。
**不可推导：** 每天固定发帖上限；所有请求默认执行该乘子。
**状态：** Home请求明确compute_value_model=true；需VM配置与对应路径；生产覆盖未知。
**建议：** 可避免密集重复挤占同一受众页面，但不是每天发帖次数规则。
证据：[vm-defaults](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L1-L258)；[score-adjustments](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/scoring.rs#L257-L409)；[home-value](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/value_model.rs#L8-L88)；[home-request](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/vm_ranker_request.rs#L1-L95)；[vm-rank-gates](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/mod.rs#L40-L102)。

### research-06 · 关系外候选的条件乘子

VM普通OON默认.75、主题请求.5；关注内回复和转推也可适用，相关开关默认true。Home本地不应用此乘子。

**前提：** VM对应价值模型路径被启用；明确OON，或启用关注内回复转推重算。
**不可推导：** 所有陌生作者永久降权25%。
**状态：** Home请求明确compute_value_model=true；需VM配置与对应路径；生产覆盖未知。
**建议：** 关注关系与请求场景会改变竞争条件，不能当作作者永久评分。
证据：[vm-defaults](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L1-L258)；[score-adjustments](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/scoring.rs#L257-L409)；[vm-value](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/value_model.rs#L21-L175)；[home-value](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/value_model.rs#L8-L88)；[home-request](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/vm_ranker_request.rs#L1-L95)；[vm-rank-gates](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/mod.rs#L40-L102)。

### research-07 · 新观看者soft NSFW过滤范围调整【默认false】

For You非主题请求中，观看者年龄小于7天且评分序列长度小于100时，可移除明确OON且soft_nsfw=true的内容；长度未知满足该子条件，max_length=0可关闭长度限制。

**前提：** EnableNewUserSoftNsfwFilter=true（默认false）；满足观看者年龄与序列条件；候选明确OON且有soft NSFW标签。
**不可推导：** 新作者7天限流；默认已全量启用。
**状态：** default_false。
**建议：** 涉及新观看者的推荐保护，不是新作者受罚。
证据：[soft-defaults](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L868-L885)；[soft-filter](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/new_user_soft_nsfw_filter.rs#L13-L55)；[targeted-diff](https://github.com/xai-org/x-algorithm/compare/2f252142b9284e692ac72851768c8072d045f0d5...b220448766ab4ee4c83d58a67d51f0cb5bda86c2)。

### research-08 · 视频轮播MediumRisk过滤【新增，默认false】

轮播选片新增MediumRisk开关默认false；HighRisk默认true。风险结论缺失时，任一风险过滤开关打开即不入选轮播。

**前提：** 视频轮播功能启用；对应风险过滤开关启用。
**不可推导：** MediumRisk全站默认限流；风险标签等于账号信用分。
**状态：** medium_risk_default_false_high_risk_default_true。
**建议：** 主时间线与视频轮播曝光应分开分析。
证据：[carousel-defaults](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1245-L1256)；[carousel-filter](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/video_carousel_filter.rs#L14-L49)；[targeted-diff](https://github.com/xai-org/x-algorithm/compare/2f252142b9284e692ac72851768c8072d045f0d5...b220448766ab4ee4c83d58a67d51f0cb5bda86c2)。

### research-09 · 提高目标受众真实兴趣匹配

Home正项包括点赞.66、回复5、转推1、点击.3、打开链接.2、分享2、私信分享5、复制链接分享20、引用5、关注作者4；乘预测量。

**前提：** 进入Home本地融合路径；其他变量不变时正向预测量提高。
**不可推导：** 一次复制链接等于固定数量点赞；系数最高即最容易操纵。
**状态：** 公开本地默认；线上动态配置与实际曝光效果未知。
**建议：** 建议内容与目标受众兴趣匹配并提供真实分享价值。
证据：[home-weights](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L375-L520)；[score-fusion](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/scoring.rs#L28-L213)。

### research-10 · 阅读与点击后停留价值

Home默认dwell=.05、连续停留=.006、点击后停留=.4，各有独立项。

**前提：** 模型给出相应预测概率或连续时间值。
**不可推导：** 任意拉长文字必然增流；所有停留字段单位与语义相同。
**状态：** 公开本地默认；线上动态配置与实际曝光效果未知。
**建议：** 建议开头承诺与正文承接一致，提升实际阅读价值。
证据：[home-weights](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L375-L520)；[score-fusion](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/scoring.rs#L28-L213)。

### research-11 · 互关原帖的回复预测加成

非回复、非转推且观看者与作者互关时，回复预测权重默认由5加15。互关停留加成默认0。

**前提：** 互相关注；候选不是回复或转推。
**不可推导：** 整篇帖子分数固定乘4；互关加成适用于所有观看者。
**状态：** 公开本地默认；线上动态配置与实际曝光效果未知。
**建议：** 可重视真实关系中的内容交流。
证据：[home-weights](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L375-L520)；[mutual-input](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/inputs.rs#L19-L35)；[mutual-weights](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/weights.rs#L84-L100)。

### research-12 · 关注内探索预测项

Home post_unexplored权重=.015，本地明确不包括OON；该预测项被线性加入融合。

**前提：** 候选in_network明确为true；对应预测值存在。
**不可推导：** 低曝光帖保证得到额外曝光。
**状态：** 公开本地默认；线上动态配置与实际曝光效果未知。
**建议：** 关注内内容有独立探索价值项，但不把字段名当流量承诺。
证据：[home-weights](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L375-L520)；[home-value](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/value_model.rs#L8-L88)；[score-fusion](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/scoring.rs#L28-L213)。

### research-13 · 低曝光原帖的冷启动机会

原帖非回复非转推；已知作者粉丝≤50000、帖子年龄≤7200秒、已知Home曝光<200、非零分候选中位置在前97%范围时可参与冷启动。主题请求跳过。

**前提：** EnableViewerColdStart默认true；满足上述全部候选条件；实验分桶适配当前观看者。
**不可推导：** 每条保底200曝光；账号刚注册必有流量奖励。
**状态：** 公开本地默认；线上动态配置与实际曝光效果未知。
**建议：** 符合条件的小作者原帖有探索通道，仍需经过资格和选择。
证据：[cold-eligibility](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/author_cold_start.rs#L188-L333)；[cold-gates](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/author_cold_start.rs#L378-L418)；[home-cold-defaults](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L565-L667)。

### research-14 · 冷启动Thompson探索

默认开启采样，alpha=.75、beta=49.25、topK=2；使用Home展示数与点赞数构造采样，再在前K中选现分最高者。

**前提：** 冷启动资格成立；采样参数有效且开关开启。
**不可推导：** 可以用主价值模型系数换算这些互动计数；点赞保证抬升。
**状态：** 公开本地默认；线上动态配置与实际曝光效果未知。
**建议：** 探索阶段允许低样本候选竞争，不只按现分直接取第一。
证据：[cold-eligibility](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/author_cold_start.rs#L188-L333)；[home-cold-defaults](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L565-L667)。

### research-15 · 单候选抬升而非最终位置保证

默认目标索引区间[15,16)，选择一个合格候选把分数抬至至少目标分；Control/Treatment需匹配作者分桶，Holdout允许全部作者语料。

**前提：** 候选数量支持目标区间；存在合格候选；后续排序与过滤仍可改变结果。
**不可推导：** 最终必在第16位；所有低曝光帖都抬升。
**状态：** 公开本地默认；线上动态配置与实际曝光效果未知。
**建议：** 把它理解为一次排序机会，而非最终排名承诺。
证据：[cold-eligibility](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/author_cold_start.rs#L188-L333)；[cold-gates](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/author_cold_start.rs#L378-L418)；[home-cold-defaults](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L565-L667)。

### research-16 · page decode页面重排【新增，默认false】

有page_decode_slot的候选按slot置前，其余按原分序，重分配已有分数；无选中项时保持分数。默认pool=200、steps=64、temperature=0。

**前提：** EnablePageDecodeRerank=true（默认false）；上游返回有效选中slot。
**不可推导：** 已经全量上线；某种固定写法能保证置顶。
**状态：** default_false。
**建议：** 未来或实验路径下，页面级选择可能覆盖简单单帖分序；无可验证创作者触发诀窍。
证据：[page-decode](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/page_decode_rerank_scorer.rs#L81-L138)；[home-gates](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L295-L365)；[targeted-diff](https://github.com/xai-org/x-algorithm/compare/2f252142b9284e692ac72851768c8072d045f0d5...b220448766ab4ee4c83d58a67d51f0cb5bda86c2)；[page-defaults](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L325-L372)；[page-rl](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/page_rl_exploration_scorer.rs#L29-L169)。

### research-17 · 账号状态与可见性受众

封停、注销、擦除、停用作者的drop规则针对NonAuthors；保护账号针对NonFollowers。

**前提：** 对应安全级别使用规则；账号状态匹配；观看者在规则受众范围内。
**不可推导：** 这些状态是一个连续账号信用分；保护账号全体用户均不可见。
**状态：** surface_and_audience_dependent。
**建议：** 排查账号可见性时先区分真实状态、关注关系与观看者身份。
证据：[author-state](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/author_rules.rs#L7-L54)。

### research-18 · 安全标签依surface和条件处理

存在SpamHighRecall、Compromised、ReadOnly、ImpersonationHighPrecision的NonAuthors drop规则。通知级别可绑定低质、重复内容、UQF等规则；低质该条还要求帖子不晚于PUBLIC_INTEREST_LABELS_START。

**前提：** 确有标签；当前level绑定对应规则；附加日期与受众条件成立。
**不可推导：** 所有重复内容在Home统一扣分；通知过滤等同全站封禁。
**状态：** surface_and_label_dependent。
**建议：** 减少垃圾互动与误导内容属于合理建议，但先确认标签与适用surface。
证据：[author-labels](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/author_rules.rs#L183-L236)；[level-bindings](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/levels.rs#L1-L270)；[tweet-labels](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L925-L1008)。

### research-19 · Brazil特定名单过滤移除【removed】

Home Brazil2026ElectionFilter文件及pipeline接入已删除；visibility仍保留BRAZIL_ELECTION_LEGAL标签且请求国家br时的drop规则，并在OON规则集合中引用。

**前提：** 删除事实对应本次commit差异；仍存规则要求标签、国家与适用level。
**不可推导：** 全部巴西政治或法律限制取消；删除名单过滤等于所有相关账号增流。
**状态：** specific_filter_removed_other_legal_label_rule_retained。
**建议：** 更新旧报告中的特定名单过滤描述，仍保留法律标签处理边界。
证据：[targeted-diff](https://github.com/xai-org/x-algorithm/compare/2f252142b9284e692ac72851768c8072d045f0d5...b220448766ab4ee4c83d58a67d51f0cb5bda86c2)；[diff-inventory](https://github.com/xai-org/x-algorithm/compare/2f252142b9284e692ac72851768c8072d045f0d5...b220448766ab4ee4c83d58a67d51f0cb5bda86c2)；[pipeline](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L421-L476)；[tweet-labels](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L925-L1008)；[level-bindings](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/levels.rs#L1-L270)。

### research-20 · pacing与新观看者OON不等于账号信用分

pacing核查到view_count与author_followers_count请求输入，发送默认false；未在所查VM路径确认其分配公式。新观看者OON特殊因子=.00001，年龄阈值默认0且要求following_count≥5；Home RequestShape未显式传viewer_following_count。

**前提：** pacing输入发送需开关开启；非主题特殊OON需非零年龄阈值、满足年龄及关注数条件；调用者必须提供适用的viewer_following_count；Home当前builder未显式提供；VM重算路径需配置。
**不可推导：** 固定每日发帖额度；新作者流量被压为十万分之一；统一账号信用总分；固定shadowban期限；只修改新用户年龄参数即可开启Home特殊OON因子。
**状态：** pacing_default_false_new_viewer_request_field_not_supplied。
**建议：** 保留为条件机制/未知项，不据字段名编造发帖额度或新作者处罚。
证据：[pacing](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/vm_ranker_debias_payload.rs#L33-L48)；[home-cold-defaults](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L565-L667)；[vm-defaults](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L1-L258)；[vm-value](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/value_model.rs#L21-L175)；[home-request](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/vm_ranker_request.rs#L1-L95)；[vm-rank-gates](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/mod.rs#L40-L102)。

### research-21 · Home远端重算与本地备用分

Home先算本地weighted与冷启动；请求明确compute_value_model=true。VM以请求或FS开关决定重算，缺配置回退；RPC失败或响应缺某候选时保留该本地分。

**前提：** EnableRanking启用；VM服务调用返回与配置影响最终路径。
**不可推导：** VM全局默认false等于Home价值模型未启用；Home和VM系数可混成一套。
**状态：** 静态源码接线已核查；生产配置与实际效果未知。
**建议：** 按具体产品场景与调用链解释，不将条件机制当作曝光承诺。
证据：[home-request](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/vm_ranker_request.rs#L1-L95)；[vm-rank-gates](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/mod.rs#L40-L102)；[vm-value](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/value_model.rs#L21-L175)；[home-vm](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/vm_ranker.rs#L59-L140)。

### research-22 · Home VF动作消费不是同名数值降权

Allow/Interstitial/Avoid/Downrank及缺action均保留；Drop/Tombstone/NotEvaluated移除。Home VFFilter没有给Downrank或Avoid乘降分系数。

**前提：** 当前Home后置VFFilter路径；实际action由相关安全level产生。
**不可推导：** 动作叫Downrank就必按固定数值降分；Home保留动作意味着所有产品均保留。
**状态：** 静态源码接线已核查；生产配置与实际效果未知。
**建议：** 按具体产品场景与调用链解释，不将条件机制当作曝光承诺。
证据：[vf-consumer](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/vf_filter.rs#L1-L27)；[vf-hydrator](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_hydrators/vf_candidate_hydrator.rs#L39-L138)；[pipeline-v2](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L371-L508)。

### research-23 · DPP双层gate与未选候选零分

部署dpp_enabled默认false；已初始化后普通请求DppEnabled默认true、主题TopicDppEnabled默认false。DPP联合分数与向量相似度选子集，选中项保留原分，未选项置0；Home TopK未把0分硬过滤。

**前提：** 部署DppContext存在；请求/FS gate满足；候选进入DPP池。
**不可推导：** 请求写dpp就等于生产启用；0分保证绝不展示；换词换图可保证绕过相似性。
**状态：** 静态源码接线已核查；生产配置与实际效果未知。
**建议：** 按具体产品场景与调用链解释，不将条件机制当作曝光承诺。
证据：[dpp-cli](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/args.rs#L15-L28)；[dpp-init](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/main.rs#L30-L51)；[vm-rank-gates](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/mod.rs#L40-L102)；[vm-defaults](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L1-L258)；[dpp-impl](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/dpp.rs#L35-L170)；[dpp-consumer](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/dpp_model.rs#L39-L206)；[home-topk](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/selectors/top_k_score_selector.rs#L1-L34)。

### research-24 · Home关注外回复与转帖资格

明确OON的转帖移除；OON回复仅EnablePhoenixOonReplies启用、Phoenix Home检索来源以及root-only条件满足可通过。缺ancestors的回复无论关系均移除。EnablePhoenixOonReplies默认false。

**前提：** 当前OONRetweetReplyFilter路径；候选关系/回复/转帖与祖先字段判定。
**不可推导：** 所有回复页无曝光；所有产品均丢自回复。
**状态：** 静态源码接线已核查；生产配置与实际效果未知。
**建议：** 按具体产品场景与调用链解释，不将条件机制当作曝光承诺。
证据：[oon-replies](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/oon_retweet_reply_filter.rs#L1-L32)；[oon-reply-defaults](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L67-L79)；[pipeline-v2](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L371-L508)。

### research-25 · 多源召回与分阶段选择

内层注册Thunder、PopularPosts、TweetMixer、SimClusters、Phoenix、PhoenixTopics、PhoenixMoe、SID、缓存九个来源；scorer依次Phoenix、ImmersiveVideo、VMRanker、PageDecode、PageRL，之后TopK和VF等后置过滤。注册不保证每个请求实际启用每个来源。

**前提：** 各来源和scorer enable条件满足；候选经前后置资格检查。
**不可推导：** 模型分就是最终页面绝对位置；九来源在每个请求全量运行。
**状态：** 静态源码接线已核查；生产配置与实际效果未知。
**建议：** 按具体产品场景与调用链解释，不将条件机制当作曝光承诺。
证据：[pipeline-v2](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L371-L508)；[home-topk](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/selectors/top_k_score_selector.rs#L1-L34)。

### research-26 · 候选事件入池而非全站点赞门槛

Fav事件非社区非转帖可先进入search_unfiltered；普通分支结合回复/转帖、VF与成人标签。合格PostCreation可直接进入post_creation，合格Fav分入1fav/32fav/topic等池；回复与成人视频有单独分支。

**前提：** 进入该Strato候选处理器；对应事件、内容和过滤条件成立；下游实际请求相关索引。
**不可推导：** 全X必须先有1赞或32赞才曝光；search_unfiltered等于最终搜索免审；成人视频池意味着普通Home无条件允许。
**状态：** 静态源码接线已核查；生产配置与实际效果未知。
**建议：** 按具体产品场景与调用链解释，不将条件机制当作曝光承诺。
证据：[intake](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix-rankall-strato/columns/phoenix_rank_all/phoenixRankAllCandidateProcessor.strato#L430-L530)；[intake-vf](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix-rankall-strato/lib/eventProcessing.strato#L260-L286)。

### research-27 · 广告混排会改变自然帖位置

AdsBlenderType默认multi_risk，未知值回退partition策略；multi_risk按风险和可用邻居组合广告三元组，剩余自然帖按分填缝并截断总长度。品牌安全邻接限制与自然帖删除不同。

**前提：** 有广告且满足最少自然帖数；当前选择multi_risk；风险邻接与广告限制满足。
**不可推导：** 固定每三帖必有广告；不能邻接广告等于全站删除；模型分高保证最终位置。
**状态：** 静态源码接线已核查；生产配置与实际效果未知。
**建议：** 按具体产品场景与调用链解释，不将条件机制当作曝光承诺。
证据：[ads-default](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L937-L942)；[ads-selector](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/selectors/blender_selector.rs#L48-L85)；[ads-multi-risk](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/multi_risk_blender.rs#L1-L259)。

### research-28 · UserCred图信誉与认证类先验

UserCredV2通过关注图传播mass，teleport混合互动来源mass与非near-zero认证类账号均匀先验；isPremium包含blue/gray/gold/组织及affiliate。score=clamp(165.2+7.07×ln(mass),0,100)，非正mass给0。

**前提：** 有效账号与图/互动输入可用；对应离线UserCred任务运行。
**不可推导：** UserCred等于粉丝数；直接把UserCred加入Home总分；购买蓝标固定倍数提升帖分。
**状态：** 静态源码接线已核查；生产配置与实际效果未知。
**建议：** 按具体产品场景与调用链解释，不将条件机制当作曝光承诺。
证据：[cred-score](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/user-cred-v2/UserCredV2.scala#L1-L20)；[cred-graph](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/user-cred-v2/UserCredV2App.scala#L285-L391)；[cred-teleport](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/user-cred-v2/UserCredV2App.scala#L154-L199)；[cred-roles](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/user-cred-v2/ValidUserInfo.scala#L1-L43)。

### research-29 · 高信誉消费者仅是部分风控分流

IsHighPageRankUser优先使用UserCredV2或预测高PageRank标签；只有不可用时才退回粉丝>25000。Agatha搜索标签规则调用该函数作为排除条件，且另有测试用户、临时名单和gray verified排除。

**前提：** 对应Botmaker规则命中；实际数据和各附加条件满足。
**不可推导：** 25000粉丝是全站免审线；高信誉对所有标签豁免；信誉直接产生固定Home boost。
**状态：** 静态源码接线已核查；生产配置与实际效果未知。
**建议：** 按具体产品场景与调用链解释，不将条件机制当作曝光承诺。
证据：[cred-consumer](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/botmaker-rules/scarecrow/derived-feature/IsHighPageRankUser.df#L1-L30)；[cred-label-consumer](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/botmaker-rules/scarecrow/bot/AgathaSpamProduction__ApplySearchTopTweetLabel.bot#L1-L31)。

### research-30 · Agatha平滑标签与实际job集合

RateBasedLabels用(interaction+0.1)/(interaction+favs+0.1/prior)构造标签；Build job列reports与两种spam reports，Predict job另含spam suspended和NSFW，两者没有BlocksPerFav。Botmaker可消费预测并写有期限的AGATHA_SPAM标签。

**前提：** 对应训练/预测job实际选择标签；下游具体规则满足条件。
**不可推导：** 举报次数直接兑换排名扣分；有BlocksPerFav生成器等于当前job必用；所有标签都被Home直接消费。
**状态：** 静态源码接线已核查；生产配置与实际效果未知。
**建议：** 按具体产品场景与调用链解释，不将条件机制当作曝光承诺。
证据：[agatha-rate](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/agatha/scalding/labels/rate_based_labels/RateBasedLabels.scala#L24-L119)；[agatha-build](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/agatha/scalding/RateBasedBuildJob.scala#L22-L29)；[agatha-predict](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/agatha/scalding/AgathaFeaturesPredictJob.scala#L26-L85)；[cred-label-consumer](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/botmaker-rules/scarecrow/bot/AgathaSpamProduction__ApplySearchTopTweetLabel.bot#L1-L31)。

### research-31 · BDSM行为模型与删节执法门槛

行为序列模型包含时间RoPE与行为输入；sink消费分类分数与LegitimateUser分数并检查动作数量等条件。公开policy明确9.99概率门槛、999999动作数是删节占位，不是生产阈值。

**前提：** 真实模型和输入可用；sink政策、数量及相关分支门槛满足。
**不可推导：** 可据公开占位数字计算安全操作上限；单看发帖频率就能确定处罚；分类分数就是Home排名系数。
**状态：** 静态源码接线已核查；生产配置与实际效果未知。
**建议：** 按具体产品场景与调用链解释，不将条件机制当作曝光承诺。
证据：[bdsm-model](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/bdsm/runtime/model.py#L62-L223)；[bdsm-policy](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/bdsm/runtime/sink_policy.yaml#L1-L45)；[bdsm-consumer](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/bdsm/runtime/score_results_sink_focal.py#L840-L858)；[bdsm-low-actions](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/bdsm/runtime/score_results_sink_focal.py#L960-L979)。

### research-32 · AES执法受多层控制

已路由执法消息进入规则与白名单处理，检查dry-run、去重、申诉hold和final checks后才执行动作。YAML中12.34为mock；hold模式默认Off，不等于线上全部申诉均受该机制保护。

**前提：** 服务收到并路由风险消息；动作规则、控制模式、安全检查通过。
**不可推导：** fallback suspend意味着全体用户默认封禁；源码占位阈值就是生产安全线；存在hold代码等于生产全量开启。
**状态：** 静态源码接线已核查；生产配置与实际效果未知。
**建议：** 按具体产品场景与调用链解释，不将条件机制当作曝光承诺。
证据：[aes-control](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/lib.rs#L353-L865)；[aes-placeholders](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/rules/enforcement_user.yaml#L19-L33)；[aes-hold](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/overturn_hold.rs#L50-L99)。

### research-33 · 安全标签过期与缓存时效

SafetyLabelSource本地缓存TTL10秒；get返回前检查每条expires_at_msec并移除过期标签，无过期时间的标签在该判断中保持有效。缓存TTL不同于标签寿命。

**前提：** 通过该SafetyLabelSource读取；标签有相应过期时间或未设过期。
**不可推导：** 所有标签10秒消失；所有安全标签永久有效；标签过期保证排名立即恢复。
**状态：** 静态源码接线已核查；生产配置与实际效果未知。
**建议：** 按具体产品场景与调用链解释，不将条件机制当作曝光承诺。
证据：[labels-live](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/safety-label-source/source.rs#L1-L49)；[labels-read](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/safety-label-source/source.rs#L115-L147)。

### research-34 · 透明度报告有身份与月份资格

入口需要已认证当前会话身份（登录身份，不是认证徽章）与feature switch。服务要求账号创建时间早于365天门槛、所选月份合格帖≥10；封禁账号missing，报告受月末10天、数据完整度、回退及展示开关影响。

**前提：** 当前登录viewer；报告开关允许；账号与月份资格和完整数据满足。
**不可推导：** 报告为空证明无任何可见性限制；一年内新账号没有推荐；报告能解释刚才每次排名；必须购买蓝标才能由此源码推出资格。
**状态：** 静态源码接线已核查；生产配置与实际效果未知。
**建议：** 按具体产品场景与调用链解释，不将条件机制当作曝光承诺。
证据：[transparency-auth](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.strato#L1-L30)；[transparency-defaults](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.User.strato#L17-L22)；[transparency-eligibility](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.User.strato#L573-L718)；[transparency-conditions](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.User.strato#L735-L749)。

### research-35 · Page RL实验与Decode互斥条件

Page RL默认false，启用后可按温度与TopK做逐步抽样，重分配已有分数并记录propensity；Decode开关开启且已有slot时跳过RL。

**前提：** EnablePageRlExploration=true；未命中Decode已有slot分支；样本和参数有效。
**不可推导：** 两种页面重排所有请求叠加；实验已全量上线；重分配后分数可跨页面直接比较。
**状态：** default_false。
**建议：** 按具体产品场景与调用链解释，不将条件机制当作曝光承诺。
证据：[page-rl](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/page_rl_exploration_scorer.rs#L29-L169)；[page-defaults](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L325-L372)；[pipeline-v2](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L371-L508)。
