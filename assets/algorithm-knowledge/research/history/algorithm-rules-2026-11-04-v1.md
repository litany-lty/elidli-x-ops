# X公开算法规则定向核查（2026-11-04）

状态：**source_reviewed_not_operationally_activated，尚未激活为运行规则**。

核查UTC：2026-11-04T06:35:06.884Z。当前commit：b220448766ab4ee4c83d58a67d51f0cb5bda86c2；既有运行基线：2f252142b9284e692ac72851768c8072d045f0d5。完整diff为242项，仅审查清单中所列符号/范围，**不是242个文件全面已审**。完整清单、未审路径、逐字源码节选与哈希见 [research/current.json](../assets/algorithm-knowledge/research/current.json) 和 [diff-name-status.json](../assets/algorithm-knowledge/research/diff-name-status.json)。

源码许可：[Apache许可证](../assets/algorithm-knowledge/source-snapshots/LICENSE.xai-algorithm.txt)。节选保留原始源码文本与准确行号，manifest记录完整上游文件SHA256和节选SHA256；git-diff来源是派生证据，其哈希明确指派生文件而非仓库源码。

## 必须先区分的默认配置

Home本地先算weighted与冷启动，再调用VM服务；RPC失败保留本地值。VM的ComputeValueModel默认false，只约束VM服务重算，**不能据此称价值模型未工作**。[home-mixer/scorers/vm_ranker.rs:59-140](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/vm_ranker.rs#L59-L140)；[home-mixer/scorers/value_model.rs:8-88](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/value_model.rs#L8-L88)；[vm-ranker/scoring/value_model.rs:21-175](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/value_model.rs#L21-L175)。

|预测项/连续值权重|Home本地默认|VM服务重算默认|
|---|---:|---:|
|favorite|0.66|0.5|
|reply|5|5|
|retweet|1|1|
|photo_expand|0.05|0.05|
|video_open|0.02|0.07|
|click|0.3|0.3|
|open_link|0.2|0.2|
|profile_click|0|0|
|vqv|0|0|
|share|2|2|
|share_via_dm|5|5|
|share_via_copy_link|20|20|
|dwell|0.05|0.05|
|quote|5|5|
|quoted_click|0.05|0.05|
|quoted_vqv|0|0|
|follow_author|4|4|
|post_unexplored|0.015|0.02|
|post_video|0|0|
|cont_dwell_time|0.006|0.004|
|cont_click_dwell_time|0.4|0.4|
|not_interested|-52.272|-47.52|
|block_author|-31.2|-31.2|
|mute_author|-58.8|-58.8|
|report|-234|-234|
|not_dwelled|-0.02|-0.02|

来源：[home-mixer/params/param.rs:375-520](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L375-L520)；[vm-ranker/params.rs:1-258](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L1-L258)。所有数值只是公开默认，不是已验证生产配置；权重乘预测概率/连续量，不乘互动次数，不能据此声称一次举报抵消多少点赞。Home本地video_continuation、user_video_continuation、profile_visit_secs均硬编码0，VM对应默认也为0；作者多样性在Home本地关闭，在VM参数默认true但仍受路径约束。

## 一、降低权重与减少可见机会

### 1. 预测负反馈降低候选分

- **代码事实：**Home默认不感兴趣−52.272、屏蔽−31.2、静音−58.8、举报−234、未停留−0.02；与各预测量相乘。
- **前提：**候选进入价值模型计算；其余输入不变且对应预测项上升。
- **启用状态：**公开本地默认；线上动态配置与实际曝光效果未知。
- **相对旧版：**本次确认当前实现；不据此宣称为本轮新增机制。
- **建议/推论：**建议降低目标受众的不适与误导性预期，不通过系数换算互动次数。
- **不可推导：**一次举报抵消固定点赞数；多人举报必然等比例压低全站曝光。
- **来源：**[home-mixer/params/param.rs:375-520](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L375-L520)；[xai-value-model/scoring.rs:28-213](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/scoring.rs#L28-L213)。

### 2. 屏蔽和静音关系过滤

- **代码事实：**观看者屏蔽/静音作者、作者屏蔽观看者，或命中引用/转推相关屏蔽关系时移除候选。
- **前提：**当前请求的关系数据命中过滤条件。
- **启用状态：**公开本地默认；线上动态配置与实际曝光效果未知。
- **相对旧版：**本次确认当前实现；不据此宣称为本轮新增机制。
- **建议/推论：**建议把特定受众的不可见与全站降权分开排查。
- **不可推导：**一个人屏蔽意味着全站账号受罚。
- **来源：**[home-mixer/filters/author_socialgraph_filter.rs:15-58](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/author_socialgraph_filter.rs#L15-L58)；[home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs:421-476](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L421-L476)。

### 3. 已看内容去重

- **代码事实：**关联帖子ID命中seen_ids或Bloom filter时移除。
- **前提：**观看者已看数据或Bloom判定命中。
- **启用状态：**公开本地默认；线上动态配置与实际曝光效果未知。
- **相对旧版：**本次确认当前实现；不据此宣称为本轮新增机制。
- **建议/推论：**同一观看者的重复展示减少，不应直接视为账号限流。
- **不可推导：**重复曝光减少证明账号降权；Bloom判定绝无误判。
- **来源：**[home-mixer/filters/previously_seen_posts_filter.rs:16-33](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/previously_seen_posts_filter.rs#L16-L33)；[home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs:421-476](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L421-L476)。

### 4. 候选年龄窗口

- **代码事实：**该Phoenix pipeline将MAX_POST_AGE=48小时传入AgeFilter；年龄不可取得或超窗的候选移除。
- **前提：**该pipeline候选路径；帖子年龄超过48小时或解析失败。
- **启用状态：**公开本地默认；线上动态配置与实际曝光效果未知。
- **相对旧版：**本次确认当前实现；不据此宣称为本轮新增机制。
- **建议/推论：**新鲜内容有进入该候选链的机会；旧内容另行分发不能由此判断。
- **不可推导：**旧帖全站失效；48小时是封禁或shadowban期限。
- **来源：**[home-mixer/filters/age_filter.rs:7-34](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/age_filter.rs#L7-L34)；[home-mixer/params/config.rs:35-42](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/config.rs#L35-L42)；[home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs:421-476](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L421-L476)。

### 5. 同作者候选多样性衰减

- **代码事实：**VM默认开启作者多样性，decay=.5、floor=.25；按同作者在候选分序中已有数量计算1、.625、.4375等乘子。Home本地weights明确关闭此项。
- **前提：**进入启用该乘子的VM路径；同作者多个候选竞争。
- **启用状态：**VM条件路径；ComputeValueModel默认false，不能视为全部请求生效。
- **相对旧版：**本次确认当前实现；不据此宣称为本轮新增机制。
- **建议/推论：**可避免密集重复挤占同一受众页面，但不是每天发帖次数规则。
- **不可推导：**每天固定发帖上限；所有请求默认执行该乘子。
- **来源：**[vm-ranker/params.rs:1-258](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L1-L258)；[xai-value-model/scoring.rs:257-409](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/scoring.rs#L257-L409)；[home-mixer/scorers/value_model.rs:8-88](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/value_model.rs#L8-L88)。

### 6. 关系外候选的条件乘子

- **代码事实：**VM普通OON默认.75、主题请求.5；关注内回复和转推也可适用，相关开关默认true。Home本地不应用此乘子。
- **前提：**VM对应价值模型路径被启用；明确OON，或启用关注内回复转推重算。
- **启用状态：**VM条件路径；ComputeValueModel默认false，不能视为全部请求生效。
- **相对旧版：**本次确认当前实现；不据此宣称为本轮新增机制。
- **建议/推论：**关注关系与请求场景会改变竞争条件，不能当作作者永久评分。
- **不可推导：**所有陌生作者永久降权25%。
- **来源：**[vm-ranker/params.rs:1-258](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L1-L258)；[xai-value-model/scoring.rs:257-409](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/scoring.rs#L257-L409)；[vm-ranker/scoring/value_model.rs:21-175](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/value_model.rs#L21-L175)；[home-mixer/scorers/value_model.rs:8-88](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/value_model.rs#L8-L88)。

### 7. 新观看者soft NSFW过滤范围调整【默认false】

- **代码事实：**For You非主题请求中，观看者年龄小于7天且评分序列长度小于100时，可移除明确OON且soft_nsfw=true的内容；长度未知满足该子条件，max_length=0可关闭长度限制。
- **前提：**EnableNewUserSoftNsfwFilter=true（默认false）；满足观看者年龄与序列条件；候选明确OON且有soft NSFW标签。
- **启用状态：**default_false。
- **相对旧版：**已有机制范围调整：年龄默认从86400秒到604800秒，新增序列长度条件；不是新发明。
- **建议/推论：**涉及新观看者的推荐保护，不是新作者受罚。
- **不可推导：**新作者7天限流；默认已全量启用。
- **来源：**[home-mixer/params/param.rs:868-885](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L868-L885)；[home-mixer/filters/new_user_soft_nsfw_filter.rs:13-55](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/new_user_soft_nsfw_filter.rs#L13-L55)；[git-diff/targeted-changes:1-963](https://github.com/xai-org/x-algorithm/compare/2f252142b9284e692ac72851768c8072d045f0d5...b220448766ab4ee4c83d58a67d51f0cb5bda86c2)。

### 8. 视频轮播MediumRisk过滤【新增，默认false】

- **代码事实：**轮播选片新增MediumRisk开关默认false；HighRisk默认true。风险结论缺失时，任一风险过滤开关打开即不入选轮播。
- **前提：**视频轮播功能启用；对应风险过滤开关启用。
- **启用状态：**medium_risk_default_false_high_risk_default_true。
- **相对旧版：**新增MediumRisk过滤配置与分支。
- **建议/推论：**主时间线与视频轮播曝光应分开分析。
- **不可推导：**MediumRisk全站默认限流；风险标签等于账号信用分。
- **来源：**[home-mixer/params/param.rs:1245-1256](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1245-L1256)；[home-mixer/filters/video_carousel_filter.rs:14-49](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/video_carousel_filter.rs#L14-L49)；[git-diff/targeted-changes:1-963](https://github.com/xai-org/x-algorithm/compare/2f252142b9284e692ac72851768c8072d045f0d5...b220448766ab4ee4c83d58a67d51f0cb5bda86c2)。

## 二、提升排名与分发机会

### 9. 提高目标受众真实兴趣匹配

- **代码事实：**Home正项包括点赞.66、回复5、转推1、点击.3、打开链接.2、分享2、私信分享5、复制链接分享20、引用5、关注作者4；乘预测量。
- **前提：**进入Home本地融合路径；其他变量不变时正向预测量提高。
- **启用状态：**公开本地默认；线上动态配置与实际曝光效果未知。
- **相对旧版：**本次确认当前实现；不据此宣称为本轮新增机制。
- **建议/推论：**建议内容与目标受众兴趣匹配并提供真实分享价值。
- **不可推导：**一次复制链接等于固定数量点赞；系数最高即最容易操纵。
- **来源：**[home-mixer/params/param.rs:375-520](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L375-L520)；[xai-value-model/scoring.rs:28-213](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/scoring.rs#L28-L213)。

### 10. 阅读与点击后停留价值

- **代码事实：**Home默认dwell=.05、连续停留=.006、点击后停留=.4，各有独立项。
- **前提：**模型给出相应预测概率或连续时间值。
- **启用状态：**公开本地默认；线上动态配置与实际曝光效果未知。
- **相对旧版：**本次确认当前实现；不据此宣称为本轮新增机制。
- **建议/推论：**建议开头承诺与正文承接一致，提升实际阅读价值。
- **不可推导：**任意拉长文字必然增流；所有停留字段单位与语义相同。
- **来源：**[home-mixer/params/param.rs:375-520](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L375-L520)；[xai-value-model/scoring.rs:28-213](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/scoring.rs#L28-L213)。

### 11. 互关原帖的回复预测加成

- **代码事实：**非回复、非转推且观看者与作者互关时，回复预测权重默认由5加15。互关停留加成默认0。
- **前提：**互相关注；候选不是回复或转推。
- **启用状态：**公开本地默认；线上动态配置与实际曝光效果未知。
- **相对旧版：**本次确认当前实现；不据此宣称为本轮新增机制。
- **建议/推论：**可重视真实关系中的内容交流。
- **不可推导：**整篇帖子分数固定乘4；互关加成适用于所有观看者。
- **来源：**[home-mixer/params/param.rs:375-520](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L375-L520)；[xai-value-model/inputs.rs:19-35](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/inputs.rs#L19-L35)；[xai-value-model/weights.rs:84-100](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/weights.rs#L84-L100)。

### 12. 关注内探索预测项

- **代码事实：**Home post_unexplored权重=.015，本地明确不包括OON；该预测项被线性加入融合。
- **前提：**候选in_network明确为true；对应预测值存在。
- **启用状态：**公开本地默认；线上动态配置与实际曝光效果未知。
- **相对旧版：**本次确认当前实现；不据此宣称为本轮新增机制。
- **建议/推论：**关注内内容有独立探索价值项，但不把字段名当流量承诺。
- **不可推导：**低曝光帖保证得到额外曝光。
- **来源：**[home-mixer/params/param.rs:375-520](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L375-L520)；[home-mixer/scorers/value_model.rs:8-88](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/value_model.rs#L8-L88)；[xai-value-model/scoring.rs:28-213](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/scoring.rs#L28-L213)。

### 13. 低曝光原帖的冷启动机会

- **代码事实：**原帖非回复非转推；已知作者粉丝≤50000、帖子年龄≤7200秒、已知Home曝光<200、非零分候选中位置在前97%范围时可参与冷启动。主题请求跳过。
- **前提：**EnableViewerColdStart默认true；满足上述全部候选条件；实验分桶适配当前观看者。
- **启用状态：**公开本地默认；线上动态配置与实际曝光效果未知。
- **相对旧版：**本次确认当前实现；不据此宣称为本轮新增机制。
- **建议/推论：**符合条件的小作者原帖有探索通道，仍需经过资格和选择。
- **不可推导：**每条保底200曝光；账号刚注册必有流量奖励。
- **来源：**[home-mixer/scorers/author_cold_start.rs:188-333](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/author_cold_start.rs#L188-L333)；[home-mixer/scorers/author_cold_start.rs:378-418](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/author_cold_start.rs#L378-L418)；[home-mixer/params/param.rs:565-667](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L565-L667)。

### 14. 冷启动Thompson探索

- **代码事实：**默认开启采样，alpha=.75、beta=49.25、topK=2；使用Home展示数与点赞数构造采样，再在前K中选现分最高者。
- **前提：**冷启动资格成立；采样参数有效且开关开启。
- **启用状态：**公开本地默认；线上动态配置与实际曝光效果未知。
- **相对旧版：**本次确认当前实现；不据此宣称为本轮新增机制。
- **建议/推论：**探索阶段允许低样本候选竞争，不只按现分直接取第一。
- **不可推导：**可以用主价值模型系数换算这些互动计数；点赞保证抬升。
- **来源：**[home-mixer/scorers/author_cold_start.rs:188-333](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/author_cold_start.rs#L188-L333)；[home-mixer/params/param.rs:565-667](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L565-L667)。

### 15. 单候选抬升而非最终位置保证

- **代码事实：**默认目标索引区间[15,16)，选择一个合格候选把分数抬至至少目标分；Control/Treatment需匹配作者分桶，Holdout允许全部作者语料。
- **前提：**候选数量支持目标区间；存在合格候选；后续排序与过滤仍可改变结果。
- **启用状态：**公开本地默认；线上动态配置与实际曝光效果未知。
- **相对旧版：**本次确认当前实现；不据此宣称为本轮新增机制。
- **建议/推论：**把它理解为一次排序机会，而非最终排名承诺。
- **不可推导：**最终必在第16位；所有低曝光帖都抬升。
- **来源：**[home-mixer/scorers/author_cold_start.rs:188-333](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/author_cold_start.rs#L188-L333)；[home-mixer/scorers/author_cold_start.rs:378-418](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/author_cold_start.rs#L378-L418)；[home-mixer/params/param.rs:565-667](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L565-L667)。

### 16. page decode页面重排【新增，默认false】

- **代码事实：**有page_decode_slot的候选按slot置前，其余按原分序，重分配已有分数；无选中项时保持分数。默认pool=200、steps=64、temperature=0。
- **前提：**EnablePageDecodeRerank=true（默认false）；上游返回有效选中slot。
- **启用状态：**default_false。
- **相对旧版：**本轮新增页面解码重排能力。
- **建议/推论：**未来或实验路径下，页面级选择可能覆盖简单单帖分序；无可验证创作者触发诀窍。
- **不可推导：**已经全量上线；某种固定写法能保证置顶。
- **来源：**[home-mixer/scorers/page_decode_rerank_scorer.rs:81-138](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/page_decode_rerank_scorer.rs#L81-L138)；[home-mixer/params/param.rs:295-365](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L295-L365)；[git-diff/targeted-changes:1-963](https://github.com/xai-org/x-algorithm/compare/2f252142b9284e692ac72851768c8072d045f0d5...b220448766ab4ee4c83d58a67d51f0cb5bda86c2)。

## 三、账号状态与上下文

### 17. 账号状态与可见性受众

- **代码事实：**封停、注销、擦除、停用作者的drop规则针对NonAuthors；保护账号针对NonFollowers。
- **前提：**对应安全级别使用规则；账号状态匹配；观看者在规则受众范围内。
- **启用状态：**surface_and_audience_dependent。
- **相对旧版：**本次确认当前实现；不据此宣称为本轮新增机制。
- **建议/推论：**排查账号可见性时先区分真实状态、关注关系与观看者身份。
- **不可推导：**这些状态是一个连续账号信用分；保护账号全体用户均不可见。
- **来源：**[visibility-filtering/rules/author_rules.rs:7-54](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/author_rules.rs#L7-L54)。

### 18. 安全标签依surface和条件处理

- **代码事实：**存在SpamHighRecall、Compromised、ReadOnly、ImpersonationHighPrecision的NonAuthors drop规则。通知级别可绑定低质、重复内容、UQF等规则；低质该条还要求帖子不晚于PUBLIC_INTEREST_LABELS_START。
- **前提：**确有标签；当前level绑定对应规则；附加日期与受众条件成立。
- **启用状态：**surface_and_label_dependent。
- **相对旧版：**本轮规则组织/覆盖有变化；本条仅审查所列定义与通知绑定，不宣称全面安全审计。
- **建议/推论：**减少垃圾互动与误导内容属于合理建议，但先确认标签与适用surface。
- **不可推导：**所有重复内容在Home统一扣分；通知过滤等同全站封禁。
- **来源：**[visibility-filtering/rules/author_rules.rs:183-236](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/author_rules.rs#L183-L236)；[visibility-filtering/rules/levels.rs:1-270](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/levels.rs#L1-L270)；[visibility-filtering/rules/tweet_rules.rs:925-1008](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L925-L1008)。

### 19. Brazil特定名单过滤移除【removed】

- **代码事实：**Home Brazil2026ElectionFilter文件及pipeline接入已删除；visibility仍保留BRAZIL_ELECTION_LEGAL标签且请求国家br时的drop规则，并在OON规则集合中引用。
- **前提：**删除事实对应本次commit差异；仍存规则要求标签、国家与适用level。
- **启用状态：**specific_filter_removed_other_legal_label_rule_retained。
- **相对旧版：**removed：仅特定2026名单过滤。
- **建议/推论：**更新旧报告中的特定名单过滤描述，仍保留法律标签处理边界。
- **不可推导：**全部巴西政治或法律限制取消；删除名单过滤等于所有相关账号增流。
- **来源：**[git-diff/targeted-changes:1-963](https://github.com/xai-org/x-algorithm/compare/2f252142b9284e692ac72851768c8072d045f0d5...b220448766ab4ee4c83d58a67d51f0cb5bda86c2)；[git-diff/name-status:1-1468](https://github.com/xai-org/x-algorithm/compare/2f252142b9284e692ac72851768c8072d045f0d5...b220448766ab4ee4c83d58a67d51f0cb5bda86c2)；[home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs:421-476](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L421-L476)；[visibility-filtering/rules/tweet_rules.rs:925-1008](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L925-L1008)；[visibility-filtering/rules/levels.rs:1-270](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/levels.rs#L1-L270)。

### 20. pacing与新观看者OON不等于账号信用分

- **代码事实：**pacing目前核查到的是view_count与author_followers_count请求输入，发送开关默认false；未在所查VM路径确认对应pacing分配公式。新观看者OON特殊因子=.00001，但年龄阈值默认0且要求观看者关注数≥5，默认资格不成立。
- **前提：**pacing输入发送需开关开启；新观看者特殊OON需要非零年龄阈值且满足年龄和关注数条件；VM相应路径启用。
- **启用状态：**pacing_default_false_new_viewer_age_threshold_zero。
- **相对旧版：**本次确认当前实现；不据此宣称为本轮新增机制。
- **建议/推论：**保留为条件机制/未知项，不据字段名编造发帖额度或新作者处罚。
- **不可推导：**固定每日发帖额度；新作者流量被压为十万分之一；统一账号信用总分；固定shadowban期限。
- **来源：**[home-mixer/scorers/vm_ranker_debias_payload.rs:33-48](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/vm_ranker_debias_payload.rs#L33-L48)；[home-mixer/params/param.rs:565-667](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L565-L667)；[vm-ranker/params.rs:1-258](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L1-L258)；[vm-ranker/scoring/value_model.rs:21-175](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/value_model.rs#L21-L175)。

## 覆盖限制

- reviewed_paths只代表选定符号和行范围已读，不代表整文件全面审查；未审路径不表示没有重要变化。
- git diff清单覆盖全部242项，但只有所列代码范围和定向patch被解释；定向patch中的其余行也不表示逐行全面审查。
- 公开默认值不等于生产动态配置，未实测生产曝光。
- Home本地默认与VM服务重算默认不同，不能拼成统一表；ComputeValueModel默认false不等于Home未计算价值分。
- 源代码中的概率权重不是互动次数换算；冷启动采样明确使用计数，与主融合不同。
- 研究未激活operational catalog、未更改既有catalog或执行完整回归。
- 不提供统一账号信用分、固定shadowban期限、保底曝光量或刷量方法。

源码注释关于组织举报效果的描述是项目方说明，不是本次生产实测。未进行全量安全审计或模型/浏览器测试。仅进行研究包格式与证据哈希的定向加载验证。
