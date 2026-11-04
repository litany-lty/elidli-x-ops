# X 算法增量语义审查账本

基线 `2f252142b9284e692ac72851768c8072d045f0d5` → `b220448766ab4ee4c83d58a67d51f0cb5bda86c2`。

全部 **248条路径** (242条rename-aware变更) 已静态核对diff、相关上下文与调用/消费链。原234条未审路径已完成，另外14条此前定向审查路径补足记录。不是全仓全分支语义审计。

- 本账本完成此base→target全部248条新增/删除/修改路径的静态diff语义审查；重命名按两条路径，等于242条rename-aware变更。
- 这是增量公共源码审查，不是2353文件全部分支逐行审核，未运行上游模型、训练、服务或生产曝光测试。
- 生产权重、动态开关、数据、缺失私有依赖保持未知；无消费者的新schema/helper不据此宣称已端到端生效。
- no_operational_effect表示当前十项编辑动作没有修改依据，不表示程序变化没有技术作用。

审计hash：`3340492991377100a5228445cf2511425f32b6a916b138bcaf7efc7a2bab217e`。机器账本：[JSON](../assets/algorithm-knowledge/research/diff-review-2f252142-b220448.json)。

## home

### candidate-pipeline/candidate_pipeline.rs

变化：新增result_size_for(query)默认调用result_size；后置过滤后截断改用该钩子，仍把截断者放入non_selected。

影响：框架扩展点不是已生效的Home动态预算：目标树搜索只见定义和调用，无实现override；Home仍RESULT_SIZE=35。research-25/C16分阶段选择结论保持。

关联：research-25、C16。

- [candidate-pipeline/candidate_pipeline.rs:97–105](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/candidate-pipeline/candidate_pipeline.rs#L97-L105) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [candidate-pipeline/candidate_pipeline.rs:151–160](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/candidate-pipeline/candidate_pipeline.rs#L151-L160) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs:1114–1121](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L1114-L1121) Home只实现固定result_size
- [home-mixer/params/config.rs:17–23](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/config.rs#L17-L23) TOP_K=50，RESULT_SIZE=35

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/ads/drops.rs

变化：logged_ad_info新增line_item_id/campaign_id/line_item_objective；dropped_ad去掉重复字段赋值，沿用公共映射。

影响：改善已投放与丢弃广告日志字段，不变更风险判定、排序或自然帖权重。

关联：research-27。

- [home-mixer/ads/drops.rs:23–31](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/drops.rs#L23-L31) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/ads/drops.rs:44–49](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/drops.rs#L44-L49) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/side_effects/ads_injection_logging_side_effect.rs:120–149](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/side_effects/ads_injection_logging_side_effect.rs#L120-L149) 投放日志使用同一logged_ad_info

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/ads/health_metrics.rs

变化：从multi_risk提取enforcement、slot_outcome、serving_limitation与SlotRejections，新增emit_page聚合已投/丢弃广告并归因。

影响：纯统计输出；budget归因与阻塞原因标签不等于用户处罚，不回写候选分。

关联：research-27。

- [home-mixer/ads/health_metrics.rs:1–131](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/health_metrics.rs#L1-L131) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/ads/multi_risk_blender.rs:181–199](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/multi_risk_blender.rs#L181-L199) 原混排调用抽取后的统计
- [home-mixer/ads/least_movement_blender.rs:34–44](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/least_movement_blender.rs#L34-L44) 新混排调用emit_page

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/ads/least_movement_blender.rs

变化：新增least_movement：按输入广告顺序选择具两名兼容邻居且整体配对可行的广告；布局以位置移动成本+首广告50/后续2的slack代价挑选，必要时紧凑配对，记录跳过并截断。

影响：是有约束的候选布局启发式，不保证数学全局最小移动或固定广告位置；仅AdsBlenderType显式取least_movement启用，默认仍multi_risk。新增选项可改变自然帖相对位置，但不能推导内容固定boost。

关联：research-27。

- [home-mixer/ads/least_movement_blender.rs:1–485](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/least_movement_blender.rs#L1-L485) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/selectors/blender_selector.rs:39–106](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/selectors/blender_selector.rs#L39-L106) 查询AdsBlenderType选择混排器并插入模块
- [home-mixer/params/param.rs:937–942](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L937-L942) 公开声明默认multi_risk，运行时可覆盖
- [home-mixer/ads/neighbours.rs:107–139](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/neighbours.rs#L107-L139) 风险、handle和keyword兼容限制

边界：生产AdsBlenderType与广告供给未知；未执行合成测试，不能把用例名称当效果保证。；公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/ads/mod.rs

变化：导出两种新blender并注册health_metrics/neighbours；blend_inner默认转给with_drops，保留with_drops默认反向兼容老实现。

影响：支持旧实现override blend_inner与新实现override with_drops；当前具体实现均实现其一。默认方法互调不是额外排序规则，未来两者都不实现会递归。

关联：research-27。

- [home-mixer/ads/mod.rs:1–23](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/mod.rs#L1-L23) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/ads/mod.rs:26–34](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/mod.rs#L26-L34) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/selectors/blender_selector.rs:39–106](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/selectors/blender_selector.rs#L39-L106) 查询AdsBlenderType选择混排器并插入模块

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/ads/multi_risk_blender.rs

变化：移出统计类型/辅助函数到health_metrics，删显式blend_inner改由trait默认转发，blend_impl限制cfg(test)。

影响：核心风险分组、三元组构造、填缝和截断差异未改变；默认生产路径仍blend_inner_with_drops，故research-27原multi_risk描述有效。

关联：research-27。

- [home-mixer/ads/multi_risk_blender.rs:1–21](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/multi_risk_blender.rs#L1-L21) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/ads/multi_risk_blender.rs:26–32](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/multi_risk_blender.rs#L26-L32) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/ads/multi_risk_blender.rs:44–50](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/multi_risk_blender.rs#L44-L50) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/ads/multi_risk_blender.rs:71–77](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/multi_risk_blender.rs#L71-L77) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/ads/multi_risk_blender.rs:181–187](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/multi_risk_blender.rs#L181-L187) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/ads/multi_risk_blender.rs:190–196](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/multi_risk_blender.rs#L190-L196) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/ads/multi_risk_blender.rs:258–260](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/multi_risk_blender.rs#L258-L260) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/selectors/blender_selector.rs:39–106](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/selectors/blender_selector.rs#L39-L106) 查询AdsBlenderType选择混排器并插入模块
- [home-mixer/params/param.rs:937–942](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L937-L942) 公开声明默认multi_risk，运行时可覆盖
- [home-mixer/ads/health_metrics.rs:1–131](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/health_metrics.rs#L1-L131) 提取的相同统计与新增复用接口

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/ads/neighbours.rs

变化：新增共享邻居兼容器、按首token哈希索引且最终token精确匹配的排除词检查、风险class计数、广告/自然帖组装、容量估算与拒绝原因。

影响：供两种新布局使用：HighRisk邻居拒绝，MediumRisk仅BSR_HIGH可用，另查低风险敏感广告/作者/词；是不邻接广告而非删自然帖的全站安全规则。估算不是保证可排广告数。

关联：research-27。

- [home-mixer/ads/neighbours.rs:1–267](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/neighbours.rs#L1-L267) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/ads/least_movement_blender.rs:96–129](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/least_movement_blender.rs#L96-L129) 配对选择消费fit
- [home-mixer/ads/slot_spread_blender.rs:119–197](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/slot_spread_blender.rs#L119-L197) 分配邻居消费兼容与class
- [home-mixer/ads/util.rs:170–230](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/util.rs#L170-L230) 关键词词元化和低风险/handle公共判定

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/ads/slot_spread_blender.rs

变化：新增slot_spread：按spacing、页面容量和safe_slot估计均匀分散插槽；就近交换兼容自然帖并为后续敏感广告预留Safe，记录不能配对/超限广告。

影响：显式选择时可改变自然帖次序；默认multi_risk不变，合成用例中的位置不是所有页面固定广告节奏。

关联：research-27。

- [home-mixer/ads/slot_spread_blender.rs:1–272](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/slot_spread_blender.rs#L1-L272) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/selectors/blender_selector.rs:39–106](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/selectors/blender_selector.rs#L39-L106) 查询AdsBlenderType选择混排器并插入模块
- [home-mixer/params/param.rs:937–942](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L937-L942) 公开声明默认multi_risk，运行时可覆盖
- [home-mixer/ads/neighbours.rs:107–139](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/neighbours.rs#L107-L139) 实际邻接约束

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/ads/tests/blender_comparison_test.rs

变化：比较集合加入slot_spread/least_movement；共同断言风险/handle/关键词邻接，并新增每广告唯一served-or-drop及全合成集合投放量不低于multi_risk的断言。

影响：仅cfg(test)合成场景，不影响生产配置，不证明线上投放量或全输入的最优性。本次只读，未运行。

关联：research-27。

- [home-mixer/ads/tests/blender_comparison_test.rs:1–13](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/tests/blender_comparison_test.rs#L1-L13) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/ads/tests/blender_comparison_test.rs:497–508](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/tests/blender_comparison_test.rs#L497-L508) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/ads/tests/blender_comparison_test.rs:687–766](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/tests/blender_comparison_test.rs#L687-L766) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/ads/mod.rs:10–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/mod.rs#L10-L11) 测试模块只在cfg(test)编译

边界：

### home-mixer/ads/tests/least_movement_blender_tests.rs

变化：新增混合流七广告位置、三SpacingCap丢弃、organic_moves=6和无法投放时首阻塞原因的静态用例。

影响：仅新布局的具体夹具预期，不是所有页面最少移动证明；未执行。

关联：research-27。

- [home-mixer/ads/tests/least_movement_blender_tests.rs:1–45](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/tests/least_movement_blender_tests.rs#L1-L45) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/ads/tests/mod.rs:34–88](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/tests/mod.rs#L34-L88) 人工35帖和12帖夹具
- [home-mixer/ads/least_movement_blender.rs:207–264](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/least_movement_blender.rs#L207-L264) 实际布局循环

边界：

### home-mixer/ads/tests/mod.rs

变化：注册两个测试模块并新增共享帖/广告构造、混合风险词/handle场景、投放/移动/丢弃统计、邻接安全断言。

影响：只为测试造数据。assert_brand_safe的MediumRisk拒绝匹配该夹具非BSR_HIGH广告，不能覆盖代码允许BSR_HIGH邻接MediumRisk的例外。未执行。

关联：research-27。

- [home-mixer/ads/tests/mod.rs:1–144](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/tests/mod.rs#L1-L144) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/ads/mod.rs:10–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/mod.rs#L10-L11) cfg(test)
- [home-mixer/ads/neighbours.rs:109–121](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/neighbours.rs#L109-L121) 真实MediumRisk例外

边界：

### home-mixer/ads/tests/slot_spread_blender_tests.rs

变化：新增混合流七广告布局、SpacingCap、organic_moves=8与首阻塞原因用例。

影响：测试名prod_positions只是固定夹具断言，不是生产测量；未执行，不能取代真实运行时证据。

关联：research-27。

- [home-mixer/ads/tests/slot_spread_blender_tests.rs:1–45](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/tests/slot_spread_blender_tests.rs#L1-L45) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/ads/tests/mod.rs:34–88](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/tests/mod.rs#L34-L88) 人工输入夹具
- [home-mixer/ads/slot_spread_blender.rs:106–116](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/slot_spread_blender.rs#L106-L116) 实际位置分散计算

边界：

### home-mixer/ads/util.rs

变化：ad_keywords可见性由私有变pub(crate)，算法体未变。

影响：给neighbours索引复用原词元化语义；不改变既有multi_risk关键词匹配规则。

关联：research-27。

- [home-mixer/ads/util.rs:205–211](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/util.rs#L205-L211) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/ads/neighbours.rs:44–83](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/neighbours.rs#L44-L83) 新消费者建立索引，仍matches_at验证完整词元

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/candidate_hydrators/video_embedding_hydrator.rs

变化：改读取VideoCarouselEmbeddingVersion并传fetch_embeddings，旧硬编码版本迁至参数。

影响：轮播+embedding dedupe gate保持；默认v8_search_1保持原行为，非默认版本可改变相似去重输入，不代表全站视频语义降权。

关联：research-08、research-25、C16、OP09。

- [home-mixer/candidate_hydrators/video_embedding_hydrator.rs:1–7](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_hydrators/video_embedding_hydrator.rs#L1-L7) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/candidate_hydrators/video_embedding_hydrator.rs:25–31](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_hydrators/video_embedding_hydrator.rs#L25-L31) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/candidate_hydrators/video_embedding_hydrator.rs:33–40](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_hydrators/video_embedding_hydrator.rs#L33-L40) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/filters/video_carousel_filter.rs:14–49](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/video_carousel_filter.rs#L14-L49) 真实后置消费者分离extra、取主流外视频、风险与去重后保存轮播
- [home-mixer/params/param.rs:1197–1306](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1197-L1306) 轮播默认false，版本/分数/额外候选参数默认与运行时覆盖边界
- [home-mixer/clients/post_v8_search_embedding_client.rs:53–95](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/clients/post_v8_search_embedding_client.rs#L53-L95) 版本作为存储次键，缺失/异常/维度不符不返回向量

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/candidate_pipeline/for_you_candidate_pipeline.rs

变化：生产构造获取共享双DC Redis客户端、注入ServedSlateCacheSideEffect；build side_effect集合追加，mock注入MockRedis。

影响：把最终FeedItem页面日志接到该时间线，非新增评分或候选过滤；日志是否写入由is_prod与EnablePageLogging共同控制。

关联：research-16、research-35。

- [home-mixer/candidate_pipeline/for_you_candidate_pipeline.rs:21–27](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/for_you_candidate_pipeline.rs#L21-L27) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/candidate_pipeline/for_you_candidate_pipeline.rs:44–50](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/for_you_candidate_pipeline.rs#L44-L50) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/candidate_pipeline/for_you_candidate_pipeline.rs:91–97](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/for_you_candidate_pipeline.rs#L91-L97) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/candidate_pipeline/for_you_candidate_pipeline.rs:157–167](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/for_you_candidate_pipeline.rs#L157-L167) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/candidate_pipeline/for_you_candidate_pipeline.rs:182–188](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/for_you_candidate_pipeline.rs#L182-L188) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/candidate_pipeline/for_you_candidate_pipeline.rs:205–211](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/for_you_candidate_pipeline.rs#L205-L211) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/candidate_pipeline/for_you_candidate_pipeline.rs:256–262](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/for_you_candidate_pipeline.rs#L256-L262) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/candidate_pipeline/for_you_candidate_pipeline.rs:296–305](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/for_you_candidate_pipeline.rs#L296-L305) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/candidate_pipeline/for_you_candidate_pipeline.rs:318–324](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/for_you_candidate_pipeline.rs#L318-L324) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/side_effects/phoenix_request_cache_side_effect.rs:294–339](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/side_effects/phoenix_request_cache_side_effect.rs#L294-L339) side effect gate及最终页面追加逻辑
- [home-mixer/params/param.rs:312–372](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L312-L372) 日志默认true，Decode和RL默认false，TTL3600与抽样参数

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/candidate_pipeline/mod.rs

变化：新增双DC Phoenix request-cache Redis共享客户端，通过OnceCell惰性初始化并返回Arc，初始化失败panic。

影响：资源复用/日志基础设施，不是模型参数。公开端点字符串不能证明生产部署或授权连接；本审查未访问端点。

关联：无直接运营动作。

- [home-mixer/candidate_pipeline/mod.rs:14–24](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/mod.rs#L14-L24) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/candidate_pipeline/mod.rs:100–141](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/mod.rs#L100-L141) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/candidate_pipeline/for_you_candidate_pipeline.rs:154–164](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/for_you_candidate_pipeline.rs#L154-L164) 生产构造调用
- [home-mixer/candidate_pipeline/ranked_following_candidate_pipeline.rs:89–100](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/ranked_following_candidate_pipeline.rs#L89-L100) 另一生产构造调用

边界：Redis依赖实现和实际服务运行状态未知。；公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/candidate_pipeline/ranked_following_candidate_pipeline.rs

变化：生产构造获取共享双DC Redis客户端、注入ServedSlateCacheSideEffect；build side_effect集合追加，mock注入MockRedis。

影响：把最终FeedItem页面日志接到该时间线，非新增评分或候选过滤；日志是否写入由is_prod与EnablePageLogging共同控制。

关联：research-16、research-35。

- [home-mixer/candidate_pipeline/ranked_following_candidate_pipeline.rs:14–20](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/ranked_following_candidate_pipeline.rs#L14-L20) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/candidate_pipeline/ranked_following_candidate_pipeline.rs:31–37](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/ranked_following_candidate_pipeline.rs#L31-L37) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/candidate_pipeline/ranked_following_candidate_pipeline.rs:62–68](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/ranked_following_candidate_pipeline.rs#L62-L68) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/candidate_pipeline/ranked_following_candidate_pipeline.rs:92–102](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/ranked_following_candidate_pipeline.rs#L92-L102) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/candidate_pipeline/ranked_following_candidate_pipeline.rs:111–117](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/ranked_following_candidate_pipeline.rs#L111-L117) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/candidate_pipeline/ranked_following_candidate_pipeline.rs:128–134](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/ranked_following_candidate_pipeline.rs#L128-L134) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/candidate_pipeline/ranked_following_candidate_pipeline.rs:165–171](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/ranked_following_candidate_pipeline.rs#L165-L171) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/candidate_pipeline/ranked_following_candidate_pipeline.rs:194–203](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/ranked_following_candidate_pipeline.rs#L194-L203) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/candidate_pipeline/ranked_following_candidate_pipeline.rs:210–216](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/ranked_following_candidate_pipeline.rs#L210-L216) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/side_effects/phoenix_request_cache_side_effect.rs:294–339](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/side_effects/phoenix_request_cache_side_effect.rs#L294-L339) side effect gate及最终页面追加逻辑
- [home-mixer/params/param.rs:312–372](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L312-L372) 日志默认true，Decode和RL默认false，TTL3600与抽样参数

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/clients/post_v8_search_embedding_client.rs

变化：fetch_embeddings接口新增version参数，Manhattan次键改调用者版本字节，Noop同签名；删常量。

影响：embedding仍要求1024维，批失败/缺条目/解码失败忽略；默认版本不变，配置可改变轮播去重。

关联：research-08、C16。

- [home-mixer/clients/post_v8_search_embedding_client.rs:13–30](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/clients/post_v8_search_embedding_client.rs#L13-L30) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/clients/post_v8_search_embedding_client.rs:53–63](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/clients/post_v8_search_embedding_client.rs#L53-L63) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/candidate_hydrators/video_embedding_hydrator.rs:20–52](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_hydrators/video_embedding_hydrator.rs#L20-L52) 唯一业务调用传FS版本
- [home-mixer/params/param.rs:1197–1306](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1197-L1306) 轮播默认false，版本/分数/额外候选参数默认与运行时覆盖边界

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/filters/brazil_2026_election_filter.rs

变化：删除整文件297行。旧实现按25个混淆名单ID，若未关注则过滤作者、转推作者、引用作者及祖先作者；包含配套测试。

影响：基线Phoenix过滤链实际使用，目标链及mod已去除，因此research-19的removed成立；不可由删除这一个过滤器推导其他法律/安全规则或全站限制全部解除。

关联：research-19。

- [home-mixer/filters/brazil_2026_election_filter.rs:1–297](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/home-mixer/filters/brazil_2026_election_filter.rs#L1-L297) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs:433–446](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L433-L446) 旧链真实挂载
- [home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs:421–448](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L421-L448) 目标过滤链已无该项

边界：名单ID公开源码注明混淆；不用于判断具体账号。生产上线时间未知。；公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/filters/mod.rs

变化：删除brazil_2026_election_filter模块声明，无其他过滤器声明变化。

影响：配合实现和pipeline移除，确认不是仅不导出而保留另一接线；不改变其他过滤器含义。

关联：research-19。

- [home-mixer/filters/mod.rs:3–8](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/mod.rs#L3-L8) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs:421–448](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L421-L448) 目标实际链
- [home-mixer/filters/brazil_2026_election_filter.rs:78–124](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/home-mixer/filters/brazil_2026_election_filter.rs#L78-L124) 旧实现

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/models/candidate.rs

变化：新增top_heads与page_decode_slot/prob、page_rl_exploration_prob，serde默认兼容旧缓存；通用ScoreInfo中page_decoded=None；增加旧缓存缺字段测试。

影响：新增传输/缓存状态，不是字段存在即机制启用。Decode/RL由各scorer gate消费；top_heads服务解释而非加分。测试只静态读取。

关联：research-16、research-21、research-35。

- [home-mixer/models/candidate.rs:28–45](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/models/candidate.rs#L28-L45) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/models/candidate.rs:319–325](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/models/candidate.rs#L319-L325) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/models/candidate.rs:451–483](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/models/candidate.rs#L451-L483) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/scorers/phoenix_scorer.rs:118–169](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/phoenix_scorer.rs#L118-L169) Decode字段生产者
- [home-mixer/scorers/page_rl_exploration_scorer.rs:119–181](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/page_rl_exploration_scorer.rs#L119-L181) RL gate与更新
- [vm-ranker/scoring/value_model.rs:175–241](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/value_model.rs#L175-L241) 缓存分与解释项分离；top3绝对贡献及至少10%占比

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/models/query.rs

变化：新增serde跳过的Arc<OnceLock<HashMap<tweet_id,ScoreInfo>>>并在构造初始化。

影响：跨内部query克隆共享评分日志状态，不作为模型输入，也不导出query JSON；用于最终页面日志映射。

关联：research-35。

- [home-mixer/models/query.rs:5–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/models/query.rs#L5-L11) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/models/query.rs:140–147](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/models/query.rs#L140-L147) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/models/query.rs:258–264](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/models/query.rs#L258-L264) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/scored_posts_server.rs:73–86](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scored_posts_server.rs#L73-L86) 实际写入
- [home-mixer/side_effects/phoenix_request_cache_side_effect.rs:240–279](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/side_effects/phoenix_request_cache_side_effect.rs#L240-L279) 实际读取并附加ScoreInfo

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/query_hydrators/served_history_query_hydrator.rs

变化：recently_served_ids在时间窗内排除VIDEO_CAROUSEL_MODULE条目，其余tweet/source IDs与max_items限制保持；轮播疲劳计算未去掉。

影响：改变served_ids来源，影响PreviouslyServed过滤及Phoenix检索排除；不能等同已看seen/Bloom去重失效，也不能保证已看视频重现。需补充research-03和C16边界。

关联：research-03、research-25、C16。

- [home-mixer/query_hydrators/served_history_query_hydrator.rs:94–110](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/query_hydrators/served_history_query_hydrator.rs#L94-L110) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/filters/previously_served_posts_filter.rs:13–32](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/previously_served_posts_filter.rs#L13-L32) served IDs过滤受请求gate控制
- [home-mixer/sources/phoenix_source.rs:72–84](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/sources/phoenix_source.rs#L72-L84) 检索排除消费served_ids
- [home-mixer/query_hydrators/served_history_query_hydrator.rs:24–64](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/query_hydrators/served_history_query_hydrator.rs#L24-L64) hydrator gate和独立轮播fatigue

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/scored_posts_server.rs

变化：Phoenix pipeline完成后，在EnablePageLogging启用时将selected_candidates的served_post_score_infos写入共享OnceLock。

影响：保存打分到最终页面日志，不对分数做修改；后续外层页面可重排/插广告，因此不能把该映射顺序当最终槽位。

关联：research-16、research-35。

- [home-mixer/scored_posts_server.rs:5–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scored_posts_server.rs#L5-L11) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/scored_posts_server.rs:73–87](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scored_posts_server.rs#L73-L87) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/side_effects/phoenix_request_cache_side_effect.rs:240–279](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/side_effects/phoenix_request_cache_side_effect.rs#L240-L279) 最终FeedItem顺序决定记录槽位
- [home-mixer/params/param.rs:312–372](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L312-L372) 日志默认true，Decode和RL默认false，TTL3600与抽样参数

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/scorers/immersive_video_scorer.rs

变化：移除has_cached_posts总gate，逐候选只对轮播视频且immersive_scores缺失者请求评分；已有分保留，无待评视频也保留已有字段。

影响：允许缓存页补齐缺失immersive分，不是每页全体重复评分；仍需轮播启用、相关非零权重与sequence，默认轮播false/immersive权重0。

关联：research-08、research-25、C16、OP09。

- [home-mixer/scorers/immersive_video_scorer.rs:15–21](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/immersive_video_scorer.rs#L15-L21) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/scorers/immersive_video_scorer.rs:25–43](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/immersive_video_scorer.rs#L25-L43) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/scorers/immersive_video_scorer.rs:52–64](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/immersive_video_scorer.rs#L52-L64) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs:421–508](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L421-L508) 真实过滤、评分、选择与后置过滤顺序
- [home-mixer/params/param.rs:1197–1306](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1197-L1306) 轮播默认false，版本/分数/额外候选参数默认与运行时覆盖边界
- [home-mixer/util/video_carousel.rs:13–24](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/util/video_carousel.rs#L13-L24) 轮播和immersive所需条件

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/scorers/mod.rs

变化：导出PageDecodeRerankScorer和PageRlExplorationScorer模块。

影响：仅模块注册；真实执行顺序为VM后Decode再RL，默认各false，不能凭导出判断开启。

关联：research-16、research-35。

- [home-mixer/scorers/mod.rs:1–7](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/mod.rs#L1-L7) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs:421–508](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L421-L508) 真实过滤、评分、选择与后置过滤顺序
- [home-mixer/params/param.rs:312–372](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L312-L372) 日志默认true，Decode和RL默认false，TTL3600与抽样参数

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/scorers/page_rl_exploration_scorer.rs

变化：新增TopK按分取池，温度下限1e-6，Plackett-Luce逐槽抽样，将原TopK分数多重集合重新分配并记录每步prob；Decode开关且任一slot存在则保持原分跳过。

影响：research-35成立：默认false，TopK64/温度.2为公开默认；只改当前页候选相对优先级，不创造固定奖励。score相同不保证最终selector严格保持抽样顺序。新增seeded/unit测试未运行。

关联：research-16、research-35。

- [home-mixer/scorers/page_rl_exploration_scorer.rs:1–285](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/page_rl_exploration_scorer.rs#L1-L285) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs:421–508](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L421-L508) 真实过滤、评分、选择与后置过滤顺序
- [home-mixer/params/param.rs:312–372](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L312-L372) 日志默认true，Decode和RL默认false，TTL3600与抽样参数
- [home-mixer/selectors/top_k_score_selector.rs:9–36](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/selectors/top_k_score_selector.rs#L9-L36) 下游依score选择

边界：实际候选分必须有意义且数值有限；缺失/NaN行为不能当线上安全保证。生产实验覆盖未知。；公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/scorers/phoenix_scorer.rs

变化：EnablePageDecodeRerank时给预测请求附page_decode参数；将返回pick按原帖ID映射slot/prob并update至候选，加入请求/返回统计。

影响：只是Decode数据生产者，排序需后置scorer消费；原has_cached_posts禁用主Phoenix评分与kill switch保持，缓存页可消费缓存slot。

关联：research-16、research-35。

- [home-mixer/scorers/phoenix_scorer.rs:2–17](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/phoenix_scorer.rs#L2-L17) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/scorers/phoenix_scorer.rs:99–111](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/phoenix_scorer.rs#L99-L111) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/scorers/phoenix_scorer.rs:118–156](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/phoenix_scorer.rs#L118-L156) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/scorers/phoenix_scorer.rs:163–170](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/phoenix_scorer.rs#L163-L170) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/scorers/page_decode_rerank_scorer.rs:80–146](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/page_decode_rerank_scorer.rs#L80-L146) 后置重分配consumer
- [home-mixer/params/param.rs:312–372](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L312-L372) 日志默认true，Decode和RL默认false，TTL3600与抽样参数
- [home-mixer/scorers/phoenix_scorer.rs:72–83](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/phoenix_scorer.rs#L72-L83) 既有enable gate

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/scorers/vm_ranker_request.rs

变化：debias输入gate放宽到非缓存或under-the-hood请求，仍需FS开关；under-the-hood请求include_top_heads；react_with_video_score映射替换为post_video_score。

影响：缓存解释可重新去偏计算head贡献，但VM对已有weighted_score保留已有分而非自动重算。compute_value_model=true及dpp请求名原有逻辑不变；post_video默认权重0。

关联：research-21、research-34。

- [home-mixer/scorers/vm_ranker_request.rs:16–23](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/vm_ranker_request.rs#L16-L23) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/scorers/vm_ranker_request.rs:42–48](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/vm_ranker_request.rs#L42-L48) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/scorers/vm_ranker_request.rs:120–126](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/vm_ranker_request.rs#L120-L126) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [vm-ranker/scoring/value_model.rs:175–241](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/value_model.rs#L175-L241) 缓存分与解释项分离；top3绝对贡献及至少10%占比
- [home-mixer/scorers/vm_ranker.rs:83–140](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/vm_ranker.rs#L83-L140) Ranking gate、RPC失败本地回退、响应score/weighted/top_heads消费
- [home-mixer/params/param.rs:477–482](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L477-L482) PostVideoWeight默认0

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/selectors/blender_selector.rs

变化：注册并匹配slot_spread/least_movement两新类型；旧类型和未知值partition回退保持。

影响：扩大可选策略而未改默认multi_risk；实际排序受请求FS与广告约束，research-27应补新类型而不是替换默认。

关联：research-27。

- [home-mixer/selectors/blender_selector.rs:1–7](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/selectors/blender_selector.rs#L1-L7) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/selectors/blender_selector.rs:20–27](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/selectors/blender_selector.rs#L20-L27) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/selectors/blender_selector.rs:30–37](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/selectors/blender_selector.rs#L30-L37) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/selectors/blender_selector.rs:62–69](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/selectors/blender_selector.rs#L62-L69) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/params/param.rs:937–942](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L937-L942) 公开声明默认multi_risk，运行时可覆盖
- [home-mixer/ads/slot_spread_blender.rs:66–102](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/slot_spread_blender.rs#L66-L102) 新策略布局
- [home-mixer/ads/least_movement_blender.rs:66–93](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/least_movement_blender.rs#L66-L93) 新策略布局

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/selectors/top_k_score_selector.rs

变化：轮播extra数量由常量30改VideoCarouselExtraCandidates，统一CarouselScoring替代两个参数传递。

影响：仍先50个按候选score取TopK，轮播合格时才从余项追加视频；默认extra30但可运行时覆盖，无曝光保底。补C16旧固定数措辞。

关联：research-25、C16、OP09。

- [home-mixer/selectors/top_k_score_selector.rs:1–7](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/selectors/top_k_score_selector.rs#L1-L7) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/selectors/top_k_score_selector.rs:18–25](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/selectors/top_k_score_selector.rs#L18-L25) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/params/param.rs:1197–1306](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1197-L1306) 轮播默认false，版本/分数/额外候选参数默认与运行时覆盖边界
- [home-mixer/filters/video_carousel_filter.rs:14–49](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/video_carousel_filter.rs#L14-L49) 真实后置消费者分离extra、取主流外视频、风险与去重后保存轮播
- [home-mixer/params/config.rs:17–19](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/config.rs#L17-L19) 固定主TopK50和最终35

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/side_effects/ads_injection_logging_side_effect.rs

变化：只新增断言line_item_id/campaign_id/objective保留、其余广告敏感细节不拷贝的单元测试。

影响：生产差异实际在logged_ad_info共享映射，不在该测试；没有新增投放或过滤逻辑，未执行。

关联：research-27。

- [home-mixer/side_effects/ads_injection_logging_side_effect.rs:177–228](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/side_effects/ads_injection_logging_side_effect.rs#L177-L228) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/ads/drops.rs:23–47](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/ads/drops.rs#L23-L47) 被测实际生产映射
- [home-mixer/side_effects/ads_injection_logging_side_effect.rs:120–149](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/side_effects/ads_injection_logging_side_effect.rs#L120-L149) 真实投放日志consumer

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/side_effects/phoenix_experiments_side_effect.rs

变化：insert_cluster_scores新增post_video预测head日志。

影响：只拓展实验日志，未对候选重打分；日志中存在某head不能推定权重非零或生产采用。

关联：research-09、research-21。

- [home-mixer/side_effects/phoenix_experiments_side_effect.rs:485–491](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/side_effects/phoenix_experiments_side_effect.rs#L485-L491) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/side_effects/video_carousel_candidates_kafka_side_effect.rs:81–105](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/side_effects/video_carousel_candidates_kafka_side_effect.rs#L81-L105) 复用insert_cluster_scores的真实消费者
- [home-mixer/params/param.rs:477–482](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L477-L482) 该权重默认0

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/side_effects/phoenix_request_cache_side_effect.rs

变化：提取双DC写入/错误占比逻辑；新增served_post_score_infos和ServedSlateCacheSideEffect：只记非零prediction ID的自然帖、总计至多64、转帖归原帖、按prediction ID分组并追加zset页面，最终组内位置不含广告/模块；Decode概率仅温度>0且启用有slot时记录。

影响：新增页面日志而非排序开关；EnablePageLogging默认true且is_prod gate，TTL默认3600。Decode/RL默认false；缓存页记录当前实际served序。超过10%写错报告失败不更改排名。新增各类日志测试未运行。

关联：research-16、research-35。

- [home-mixer/side_effects/phoenix_request_cache_side_effect.rs:1–112](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/side_effects/phoenix_request_cache_side_effect.rs#L1-L112) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/side_effects/phoenix_request_cache_side_effect.rs:157–167](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/side_effects/phoenix_request_cache_side_effect.rs#L157-L167) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/side_effects/phoenix_request_cache_side_effect.rs:184–340](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/side_effects/phoenix_request_cache_side_effect.rs#L184-L340) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/side_effects/phoenix_request_cache_side_effect.rs:647–1066](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/side_effects/phoenix_request_cache_side_effect.rs#L647-L1066) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/candidate_pipeline/for_you_candidate_pipeline.rs:245–260](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/for_you_candidate_pipeline.rs#L245-L260) ForYou外层side effect接线
- [home-mixer/candidate_pipeline/ranked_following_candidate_pipeline.rs:154–169](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/ranked_following_candidate_pipeline.rs#L154-L169) RankedFollowing接线
- [home-mixer/scored_posts_server.rs:73–86](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scored_posts_server.rs#L73-L86) 评分信息写入来源
- [home-mixer/params/param.rs:312–372](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L312-L372) 日志默认true，Decode和RL默认false，TTL3600与抽样参数

边界：目标公开树未找到外部训练消费者；日志存在不证明RL在线更新，也不保证客户端实际看见。；公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/side_effects/redis_post_candidate_cache_side_effect.rs

变化：只新增mock Redis写入再CachedPostsQueryHydrator回读的page slot/prob三字段保留测试。

影响：生产缓存写入/TTL180/仅正weighted过滤逻辑未变，字段持久化由PostCandidate serde新增实现。不得把静态用例说成已通过运行验收。

关联：research-16、research-35。

- [home-mixer/side_effects/redis_post_candidate_cache_side_effect.rs:190–238](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/side_effects/redis_post_candidate_cache_side_effect.rs#L190-L238) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/models/candidate.rs:28–46](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/models/candidate.rs#L28-L46) 字段serde默认
- [home-mixer/side_effects/redis_post_candidate_cache_side_effect.rs:22–91](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/side_effects/redis_post_candidate_cache_side_effect.rs#L22-L91) 未改的实际缓存通道

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/side_effects/reranking_kafka_side_effect.rs

变化：预测分map新增post_video项。

影响：用于日志记录，非新候选加分；不能把日志字段当固定视频boost。

关联：research-09、research-21。

- [home-mixer/side_effects/reranking_kafka_side_effect.rs:145–151](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/side_effects/reranking_kafka_side_effect.rs#L145-L151) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs:421–508](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L421-L508) 真实过滤、评分、选择与后置过滤顺序
- [home-mixer/params/param.rs:477–482](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L477-L482) post_video权重默认0

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/side_effects/scored_stats_side_effect.rs

变化：移除PhoenixScorer引用与retrieval contribution统计中的ranker_cluster参数/标签；retrieval_cluster及实验桶标签保持。

影响：降低指标维度，不改来源归因候选集合或模型选择，不能推导检索/排名权重变化。

关联：research-25。

- [home-mixer/side_effects/scored_stats_side_effect.rs:4–9](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/side_effects/scored_stats_side_effect.rs#L4-L9) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/side_effects/scored_stats_side_effect.rs:137–142](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/side_effects/scored_stats_side_effect.rs#L137-L142) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/side_effects/scored_stats_side_effect.rs:224–229](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/side_effects/scored_stats_side_effect.rs#L224-L229) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/side_effects/scored_stats_side_effect.rs:275–280](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/side_effects/scored_stats_side_effect.rs#L275-L280) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs:421–508](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L421-L508) 真实过滤、评分、选择与后置过滤顺序

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/side_effects/video_carousel_candidates_kafka_side_effect.rs

变化：轮播日志分改调用统一CarouselScoring，与新选片分公式一致。

影响：该文件自身只记录真正最终FeedItem含carousel时的query视频，受生产+日志开关控制；不额外排序或曝光。

关联：research-08、research-25、C16。

- [home-mixer/side_effects/video_carousel_candidates_kafka_side_effect.rs:1–10](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/side_effects/video_carousel_candidates_kafka_side_effect.rs#L1-L10) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/side_effects/video_carousel_candidates_kafka_side_effect.rs:76–82](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/side_effects/video_carousel_candidates_kafka_side_effect.rs#L76-L82) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/side_effects/video_carousel_candidates_kafka_side_effect.rs:86–92](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/side_effects/video_carousel_candidates_kafka_side_effect.rs#L86-L92) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/util/video_carousel.rs:27–65](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/util/video_carousel.rs#L27-L65) 真实共用打分公式
- [home-mixer/params/param.rs:1197–1306](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1197-L1306) 轮播默认false，版本/分数/额外候选参数默认与运行时覆盖边界

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/sources/thunder_source.rs

变化：去掉ThunderClusterId及ThunderCluster parse/decider resolve，非CAPI分支改无参数get_random_channel。

影响：召回路由接口简化，following列表、seen排除、quality factor后的max_results和请求algorithm保持；不足以宣称关注内配额或排序权重调整。

关联：research-25。

- [home-mixer/sources/thunder_source.rs:1–10](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/sources/thunder_source.rs#L1-L10) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/sources/thunder_source.rs:52–60](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/sources/thunder_source.rs#L52-L60) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs:421–508](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L421-L508) 真实过滤、评分、选择与后置过滤顺序
- [home-mixer/sources/thunder_source.rs:21–66](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/sources/thunder_source.rs#L21-L66) 源gate、请求构造与CAPI分支

边界：ThunderClient依赖实现未在本公开树对应路径找到；实际通道池/生产路由未知。；公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/util/under_the_hood.rs

变化：UnderTheHoodScores移除所有原始head_scores map，改导出candidate.top_heads的head/contribution/share。

影响：解释输出改变：至多3个、按绝对加权贡献且占总绝对贡献≥10%；不代表完整加权分拆，更非曝光因果归因，后续乘子/DPP/页面/广告会改最终结果。缓存解释可基于重算head但仍保留缓存总分。research-34月份报告并非同一接口，应另补机制而不混为一谈。

关联：research-21、research-34。

- [home-mixer/util/under_the_hood.rs:1–3](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/util/under_the_hood.rs#L1-L3) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/util/under_the_hood.rs:76–89](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/util/under_the_hood.rs#L76-L89) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [vm-ranker/scoring/value_model.rs:175–241](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/value_model.rs#L175-L241) 缓存分与解释项分离；top3绝对贡献及至少10%占比
- [home-mixer/scorers/vm_ranker.rs:83–140](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/vm_ranker.rs#L83-L140) Ranking gate、RPC失败本地回退、响应score/weighted/top_heads消费
- [home-mixer/scorers/vm_ranker_request.rs:16–50](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/vm_ranker_request.rs#L16-L50) 仅under-the-hood请求top_heads

边界：远端失败或未算value model可返回空top_heads；value_model字符串vm_ranker仅由EnableRanking决定，不证明本请求RPC成功。；公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/util/video_carousel.rs

变化：抽出CarouselScoring，新增video_open×immersive dwell与weighted_score线性项、同分以video_open降序；immersive需求gate兼顾dwell项，选片与extra共享排序；测试调用适配。

影响：默认权重仍open1、其余0且轮播默认false；配置新项后可能改变选片，不能推广为所有媒体加分。竖屏、作者/SID/向量/媒体去重与最少3最多5保持。

关联：research-08、research-25、C16、OP09。

- [home-mixer/util/video_carousel.rs:2–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/util/video_carousel.rs#L2-L11) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/util/video_carousel.rs:20–73](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/util/video_carousel.rs#L20-L73) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/util/video_carousel.rs:76–82](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/util/video_carousel.rs#L76-L82) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/util/video_carousel.rs:169–180](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/util/video_carousel.rs#L169-L180) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/util/video_carousel.rs:196–201](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/util/video_carousel.rs#L196-L201) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/util/video_carousel.rs:208–233](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/util/video_carousel.rs#L208-L233) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/util/video_carousel.rs:265–278](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/util/video_carousel.rs#L265-L278) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/util/video_carousel.rs:299–312](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/util/video_carousel.rs#L299-L312) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/util/video_carousel.rs:322–335](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/util/video_carousel.rs#L322-L335) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/util/video_carousel.rs:348–361](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/util/video_carousel.rs#L348-L361) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/util/video_carousel.rs:368–374](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/util/video_carousel.rs#L368-L374) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/util/video_carousel.rs:391–404](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/util/video_carousel.rs#L391-L404) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/util/video_carousel.rs:425–431](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/util/video_carousel.rs#L425-L431) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/util/video_carousel.rs:454–467](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/util/video_carousel.rs#L454-L467) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/util/video_carousel.rs:484–490](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/util/video_carousel.rs#L484-L490) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [home-mixer/params/param.rs:1197–1306](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1197-L1306) 轮播默认false，版本/分数/额外候选参数默认与运行时覆盖边界
- [home-mixer/filters/video_carousel_filter.rs:14–49](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/video_carousel_filter.rs#L14-L49) 真实后置消费者分离extra、取主流外视频、风险与去重后保存轮播
- [home-mixer/selectors/top_k_score_selector.rs:9–24](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/selectors/top_k_score_selector.rs#L9-L24) extra消费者

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### vm-ranker/scoring/debias.rs

变化：head_field新增share_copylink/share_dm映射至两种分享概率。

影响：只是支持选择这两个去偏head；DEFAULT_HEADS未加入，需UserDebiasEnabled、可用模型/sequence与配置选择且模型包含head。research-09的公开权重不能解释成去偏必启用。

关联：research-09、research-21。

- [vm-ranker/scoring/debias.rs:253–260](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/debias.rs#L253-L260) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [vm-ranker/scoring/debias.rs:17–32](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/debias.rs#L17-L32) 默认head列表未包含两新增映射
- [vm-ranker/scoring/debias.rs:125–208](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/debias.rs#L125-L208) 实际gate与模型字段交集
- [vm-ranker/scoring/value_model.rs:175–241](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/value_model.rs#L175-L241) 缓存分与解释项分离；top3绝对贡献及至少10%占比

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### vm-ranker/scoring/mod.rs

变化：RankedCandidate新增从ValueModelOutput按候选索引带出top_heads，缺失时空列表。

影响：为解释响应接线，不改变score、weighted_score或DPP gate；仅上游请求include_top_heads且value model计算路径成功才有贡献项。

关联：research-21、research-23。

- [vm-ranker/scoring/mod.rs:147–156](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/mod.rs#L147-L156) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [vm-ranker/scoring/value_model.rs:175–241](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/value_model.rs#L175-L241) 缓存分与解释项分离；top3绝对贡献及至少10%占比
- [home-mixer/scorers/vm_ranker.rs:83–140](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/vm_ranker.rs#L83-L140) Ranking gate、RPC失败本地回退、响应score/weighted/top_heads消费

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### xai-value-model/lib.rs

变化：导出weighted_terms供外部消费者使用，原评分接口仍保留。

影响：允许VM解释贡献复用真实融合项，不新增第二套分数；研究正负项规则不因导出改变。

关联：research-01、research-09、research-10、research-21。

- [xai-value-model/lib.rs:10–15](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/lib.rs#L10-L15) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [xai-value-model/scoring.rs:68–84](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/scoring.rs#L68-L84) compute_weighted_score是weighted_terms求和
- [vm-ranker/scoring/value_model.rs:175–241](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/value_model.rs#L175-L241) 缓存分与解释项分离；top3绝对贡献及至少10%占比

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### xai-value-model/phoenix_scores.rs

变化：结构字段react_with_video_score替换为post_video_score，无旧JSON别名。

影响：是预测head语义/命名更新，不是用户只要发布视频就得到分。Home/VM post_video公开权重均0；旧序列化数据能否保留该旧字段不可假定。

关联：research-09、OP09。

- [xai-value-model/phoenix_scores.rs:23–29](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/phoenix_scores.rs#L23-L29) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [xai-value-model/scoring.rs:208–213](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/scoring.rs#L208-L213) 实际post_video加权项
- [home-mixer/params/param.rs:477–482](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L477-L482) Home默认0
- [vm-ranker/params.rs:102–108](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L102-L108) VM默认0

边界：公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### xai-value-model/proto.rs

变化：protobuf↔PhoenixScores双向转换都由react_with_video字段改post_video。

影响：同步结构和wire字段消费，不改变其他预测量；proto标签兼容需结合协议审查，不能仅按同位置断言老字段数值语义相同。

关联：research-09、research-21。

- [xai-value-model/proto.rs:28–34](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/proto.rs#L28-L34) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [xai-value-model/proto.rs:63–69](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/proto.rs#L63-L69) 已阅读完整差异；本片段定位该路径具体变化及相邻上下文。
- [xai-value-model/phoenix_scores.rs:20–30](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/phoenix_scores.rs#L20-L30) 目标结构字段
- [xai-value-model/scoring.rs:208–213](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/scoring.rs#L208-L213) 下游加权消费
- [home-mixer/scorers/vm_ranker_request.rs:97–127](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/vm_ranker_request.rs#L97-L127) Home到VM显式映射

边界：协议生产滚动升级与历史字段语义兼容未知。；公开静态源码不能确认生产部署、请求级feature-switch覆盖或实际曝光效果；本次未运行上游服务或测试。

### home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs

变化：移除Brazil2026ElectionFilter import/实例；VM后追加Decode、RL scorer；生产双DC request cache由本地创建改共享OnceCell客户端。

影响：真实评分阶段按顺序启用并update，故Decode先于RL且RL有Decode-slot跳过条件；默认两者false。名单过滤实际移除而非仅删孤立源码，其他安全过滤保持；Redis改造不改变分数。

关联：research-16、research-19、research-35。

- [home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs:68–73](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L68-L73) 完整diff语义已读，定位变化与相邻上下文。
- [home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs:114–121](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L114-L121) 完整diff语义已读，定位变化与相邻上下文。
- [home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs:435–440](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L435-L440) 完整diff语义已读，定位变化与相邻上下文。
- [home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs:463–475](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L463-L475) 完整diff语义已读，定位变化与相邻上下文。
- [home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs:556–561](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L556-L561) 完整diff语义已读，定位变化与相邻上下文。
- [home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs:572–578](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L572-L578) 完整diff语义已读，定位变化与相邻上下文。
- [home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs:700–706](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L700-L706) 完整diff语义已读，定位变化与相邻上下文。
- [candidate-pipeline/candidate_pipeline.rs:403–413](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/candidate-pipeline/candidate_pipeline.rs#L403-L413) scorer真实顺序执行和enable gate
- [home-mixer/scorers/page_rl_exploration_scorer.rs:119–143](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/page_rl_exploration_scorer.rs#L119-L143) Decode互斥条件
- [home-mixer/candidate_pipeline/mod.rs:103–138](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/mod.rs#L103-L138) 共享双DC客户端
- [home-mixer/params/param.rs:324–372](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L324-L372) 公开页面实验默认false

边界：生产部署、运行时feature-switch覆盖和实际效果未知；本次仅源码阅读，未运行上游服务或测试。

### home-mixer/filters/new_user_soft_nsfw_filter.rs

变化：在既有ForYou非topic、Enable与观看者年龄gate后新增scoring sequence长度：max=0禁用长度限制，未知长度允许，否则严格小于max。

影响：当前默认年龄从1天扩大7天且长度<100，功能默认false；过滤仍只移除明确OON且soft_nsfw=true。共享helper同时控制标签hydrate，不能解读成新作者7天受限。

关联：research-07、C19。

- [home-mixer/filters/new_user_soft_nsfw_filter.rs:1–9](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/new_user_soft_nsfw_filter.rs#L1-L9) 完整diff语义已读，定位变化与相邻上下文。
- [home-mixer/filters/new_user_soft_nsfw_filter.rs:18–38](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/new_user_soft_nsfw_filter.rs#L18-L38) 完整diff语义已读，定位变化与相邻上下文。
- [home-mixer/params/param.rs:868–885](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L868-L885) 默认false/7天/100
- [home-mixer/candidate_hydrators/new_user_soft_nsfw_label_hydrator.rs:33–58](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_hydrators/new_user_soft_nsfw_label_hydrator.rs#L33-L58) 相同gate控制hydrate
- [home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs:410–430](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L410-L430) 先hydrate后filter接线

边界：生产部署、运行时feature-switch覆盖和实际效果未知；本次仅源码阅读，未运行上游服务或测试。

### home-mixer/filters/video_carousel_filter.rs

变化：新引入HighRisk和MediumRisk可配置过滤，missing verdict仅在两开关均false时允许；同时采用CarouselScoring统一公式。

影响：这是选入轮播的限制，非删主流自然帖。HighRisk默认true、MediumRisk默认false，两项在本diff均新增；先分extra，主流前35仅作去重参考，轮播从其余池选择。

关联：research-08、research-25、C16、OP09。

- [home-mixer/filters/video_carousel_filter.rs:1–12](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/video_carousel_filter.rs#L1-L12) 完整diff语义已读，定位变化与相邻上下文。
- [home-mixer/filters/video_carousel_filter.rs:25–44](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/video_carousel_filter.rs#L25-L44) 完整diff语义已读，定位变化与相邻上下文。
- [home-mixer/params/param.rs:1244–1256](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1244-L1256) 两风险gate默认
- [home-mixer/util/video_carousel.rs:13–24](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/util/video_carousel.rs#L13-L24) 轮播总开关和请求资格
- [home-mixer/util/video_carousel.rs:67–91](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/util/video_carousel.rs#L67-L91) vertical及数量/去重消费者
- [home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs:475–507](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L475-L507) 品牌风险hydrator先于轮播filter

边界：生产部署、运行时feature-switch覆盖和实际效果未知；本次仅源码阅读，未运行上游服务或测试。

### home-mixer/params/config.rs

变化：删VIDEO_CAROUSEL_EXTRA_CANDIDATES=30编译期常量，其他常量不变。

影响：由FS参数取代而非删除轮播额外候选；默认仍30，50主TopK/35结果不变。

关联：research-25、C16、OP09。

- [home-mixer/params/config.rs:15–20](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/config.rs#L15-L20) 完整diff语义已读，定位变化与相邻上下文。
- [home-mixer/params/param.rs:1298–1303](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1298-L1303) 新参数默认30
- [home-mixer/selectors/top_k_score_selector.rs:15–23](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/selectors/top_k_score_selector.rs#L15-L23) 运行时参数实际消费者

边界：生产部署、运行时feature-switch覆盖和实际效果未知；本次仅源码阅读，未运行上游服务或测试。

### home-mixer/params/param.rs

变化：同步时间更新；删除ThunderClusterId；新增PageLogging=true/TTL3600，Decode=false/pool200/steps64/temp0/reward0，RL=false/temp.2/TopK64；ReactWithVideo换PostVideo权重0；softNSFW年龄86400→604800并加seq100；AdsBrandSafetyVerdictV2 true→false；轮播embedding version v8_search_1、HighRisk=true/Medium=false、open×dwell与weighted分权重0、extra30。

影响：全部声明默认需与请求FS覆盖区分。重要新增实际影响是品牌安全默认走旧compute_verdict而非V2，不是关闭品牌安全；同一verdict可被广告邻接和轮播消费。年龄、页面和轮播参数的影响均受各自gate控制。

关联：research-07、research-08、research-16、research-27、research-35、C16、C19。

- [home-mixer/params/param.rs:1–4](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1-L4) 完整diff语义已读，定位变化与相邻上下文。
- [home-mixer/params/param.rs:32–37](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L32-L37) 完整diff语义已读，定位变化与相邻上下文。
- [home-mixer/params/param.rs:309–374](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L309-L374) 完整diff语义已读，定位变化与相邻上下文。
- [home-mixer/params/param.rs:475–483](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L475-L483) 完整diff语义已读，定位变化与相邻上下文。
- [home-mixer/params/param.rs:875–887](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L875-L887) 完整diff语义已读，定位变化与相邻上下文。
- [home-mixer/params/param.rs:945–951](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L945-L951) 完整diff语义已读，定位变化与相邻上下文。
- [home-mixer/params/param.rs:1236–1259](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1236-L1259) 完整diff语义已读，定位变化与相邻上下文。
- [home-mixer/params/param.rs:1272–1289](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1272-L1289) 完整diff语义已读，定位变化与相邻上下文。
- [home-mixer/params/param.rs:1296–1307](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L1296-L1307) 完整diff语义已读，定位变化与相邻上下文。
- [home-mixer/candidate_hydrators/ads_brand_safety_vf_hydrator.rs:105–118](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_hydrators/ads_brand_safety_vf_hydrator.rs#L105-L118) V2 gate切换真实风险算法
- [home-mixer/models/brand_safety.rs:103–191](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/models/brand_safety.rs#L103-L191) 旧与V2分别读取不同标签组，V2无标签时回退旧算法
- [home-mixer/scorers/page_decode_rerank_scorer.rs:22–49](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/page_decode_rerank_scorer.rs#L22-L49) Decode参数及权重消费者
- [home-mixer/filters/new_user_soft_nsfw_filter.rs:13–35](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/new_user_soft_nsfw_filter.rs#L13-L35) 年龄长度gate
- [home-mixer/filters/video_carousel_filter.rs:25–49](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/video_carousel_filter.rs#L25-L49) 轮播参数consumer
- [home-mixer/sources/thunder_source.rs:43–65](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/sources/thunder_source.rs#L43-L65) 不再读cluster参数
- [home-mixer/side_effects/phoenix_request_cache_side_effect.rs:294–338](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/side_effects/phoenix_request_cache_side_effect.rs#L294-L338) page logging+prod与TTL消费

边界：生产部署、运行时feature-switch覆盖和实际效果未知；本次仅源码阅读，未运行上游服务或测试。

### home-mixer/scorers/page_decode_rerank_scorer.rs

变化：新增Decode参数构造（pool/steps/temp/reward和一部分当前Home权重，diversity_weight=None）、指标、decoded_on_top及scorer；按slot排序decoded候选优先，再按原分排其余并重分配整个分数集合，无pick则保持。

影响：公开默认false；不是对原模型分新增固定倍数，缓存幸存slot可继续参与。上游传递的ranking weights是列举子集，不是29项完整VM公式；最终TopK/过滤/广告仍可改变位置。全部新增用例只读未运行。

关联：research-16、research-35。

- [home-mixer/scorers/page_decode_rerank_scorer.rs:1–291](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/page_decode_rerank_scorer.rs#L1-L291) 完整diff语义已读，定位变化与相邻上下文。
- [home-mixer/scorers/phoenix_scorer.rs:99–155](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/phoenix_scorer.rs#L99-L155) 参数请求与pick生产者
- [home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs:466–474](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L466-L474) VM后Decode再RL
- [home-mixer/params/param.rs:324–353](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L324-L353) 默认false/200/64/0/0
- [home-mixer/selectors/top_k_score_selector.rs:9–36](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/selectors/top_k_score_selector.rs#L9-L36) 下游分数选择

边界：生产部署、运行时feature-switch覆盖和实际效果未知；本次仅源码阅读，未运行上游服务或测试。

### home-mixer/scorers/value_model.rs

变化：Home本地weights_for改PostVideoWeight、shared_phoenix_scores改post_video_score，其他local配置保持。

影响：接通新head且默认0；本地仍关闭作者多样性和OON rescore、post_unexplored不含OON、三个continuation/profile项为0。不能把VM默认套到Home本地备用分。

关联：research-05、research-06、research-09、research-12、research-21。

- [home-mixer/scorers/value_model.rs:27–33](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/value_model.rs#L27-L33) 完整diff语义已读，定位变化与相邻上下文。
- [home-mixer/scorers/value_model.rs:112–118](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/value_model.rs#L112-L118) 完整diff语义已读，定位变化与相邻上下文。
- [home-mixer/scorers/vm_ranker.rs:59–75](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/vm_ranker.rs#L59-L75) 本地分缓存优先并cold start
- [home-mixer/params/param.rs:477–482](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L477-L482) 新权重默认0
- [xai-value-model/scoring.rs:68–84](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/scoring.rs#L68-L84) 实际融合共用函数

边界：生产部署、运行时feature-switch覆盖和实际效果未知；本次仅源码阅读，未运行上游服务或测试。

### home-mixer/scorers/vm_ranker.rs

变化：响应map从引用的(score,weighted)改owned RankedCandidate，remove消费后带出top_heads；update写入解释项。

影响：正常去重候选的score/weighted和缺失/RPC失败本地回退保持；remove使同tweet_id最多消费一次响应，若出现重复输入后续重复会留本地分，但真实链先DropDuplicates。贡献项只用于解释。

关联：research-21。

- [home-mixer/scorers/vm_ranker.rs:10–16](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/vm_ranker.rs#L10-L16) 完整diff语义已读，定位变化与相邻上下文。
- [home-mixer/scorers/vm_ranker.rs:113–135](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/vm_ranker.rs#L113-L135) 完整diff语义已读，定位变化与相邻上下文。
- [home-mixer/scorers/vm_ranker.rs:145–151](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/vm_ranker.rs#L145-L151) 完整diff语义已读，定位变化与相邻上下文。
- [home-mixer/filters/drop_duplicates_filter.rs:14–31](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/drop_duplicates_filter.rs#L14-L31) 真实链先按tweet_id去重
- [home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs:421–427](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L421-L427) 去重在评分前
- [vm-ranker/scoring/mod.rs:140–158](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/mod.rs#L140-L158) VM响应构造
- [home-mixer/util/under_the_hood.rs:70–89](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/util/under_the_hood.rs#L70-L89) top_heads最终解释输出

边界：生产部署、运行时feature-switch覆盖和实际效果未知；本次仅源码阅读，未运行上游服务或测试。

### vm-ranker/params.rs

变化：唯一变化是ReactWithVideoWeight及旧FS key改PostVideoWeight和rust_home_mixer_post_video_weight，默认仍0。

影响：旧FS key不能假定继续覆盖新项；VM其余负反馈/OON/多样性/DPP默认未由此diff改变，无普遍视频加分。

关联：research-05、research-06、research-09、research-21。

- [vm-ranker/params.rs:100–108](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L100-L108) 完整diff语义已读，定位变化与相邻上下文。
- [vm-ranker/scoring/value_model.rs:67–98](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/value_model.rs#L67-L98) weights_from_params消费新key
- [xai-value-model/scoring.rs:208–213](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/scoring.rs#L208-L213) 预测post_video加权项

边界：生产部署、运行时feature-switch覆盖和实际效果未知；本次仅源码阅读，未运行上游服务或测试。

### vm-ranker/scoring/value_model.rs

变化：ValueModelOutput新增top_heads，新增至多3项/绝对贡献占比至少10%解释；include_top_heads时缓存weighted不再提前跳过head recenter，但最终缓存分仍保留；新head换post_video。

影响：真实计算仍需compute gate与params；无config回退。解释可基于当前权重/去偏head而非缓存总分的精确分解；不是固定互动汇率、也不包括后置作者/OON/DPP/页面布局因果。普通缓存请求无include_top_heads仍原快路径。

关联：research-01、research-09、research-21。

- [vm-ranker/scoring/value_model.rs:5–14](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/value_model.rs#L5-L14) 完整diff语义已读，定位变化与相邻上下文。
- [vm-ranker/scoring/value_model.rs:28–34](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/value_model.rs#L28-L34) 完整diff语义已读，定位变化与相邻上下文。
- [vm-ranker/scoring/value_model.rs:90–96](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/value_model.rs#L90-L96) 完整diff语义已读，定位变化与相邻上下文。
- [vm-ranker/scoring/value_model.rs:183–244](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/value_model.rs#L183-L244) 完整diff语义已读，定位变化与相邻上下文。
- [home-mixer/scorers/vm_ranker_request.rs:16–50](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/vm_ranker_request.rs#L16-L50) 仅under-the-hood申请top_heads并可带缓存debias输入
- [vm-ranker/scoring/mod.rs:40–97](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/mod.rs#L40-L97) compute/DPP gate和输出调用
- [vm-ranker/scoring/debias.rs:125–162](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/debias.rs#L125-L162) recenter另需开关/模型
- [vm-ranker/params.rs:254–265](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L254-L265) 去偏默认false/alpha0
- [xai-value-model/scoring.rs:79–213](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/scoring.rs#L79-L213) 解释使用加权项而非最后分

边界：生产部署、运行时feature-switch覆盖和实际效果未知；本次仅源码阅读，未运行上游服务或测试。

### xai-value-model/scoring.rs

变化：把原29项数值数组抽成(name,value) weighted_terms，compute_weighted_score保持同序求和；最后react_with_video项替换post_video；测试fixture同步新名字。

影响：除新head字段/权重来源外，各项算式、互关boost/VQV资格/post_unexplored gate和后续offset/乘子未变。解释名称不等于实际互动次数；提取函数不是引入新的排名权重。

关联：research-01、research-09、research-10、research-11、research-12。

- [xai-value-model/scoring.rs:70–85](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/scoring.rs#L70-L85) 完整diff语义已读，定位变化与相邻上下文。
- [xai-value-model/scoring.rs:100–216](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/scoring.rs#L100-L216) 完整diff语义已读，定位变化与相邻上下文。
- [xai-value-model/scoring.rs:424–430](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/scoring.rs#L424-L430) 完整diff语义已读，定位变化与相邻上下文。
- [xai-value-model/scoring.rs:446–452](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/scoring.rs#L446-L452) 完整diff语义已读，定位变化与相邻上下文。
- [vm-ranker/scoring/value_model.rs:220–241](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/value_model.rs#L220-L241) top_heads解释消费者
- [home-mixer/scorers/value_model.rs:81–88](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/value_model.rs#L81-L88) Home本地fuse消费者
- [xai-value-model/weights.rs:84–99](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/weights.rs#L84-L99) 互关回复与停留weight条件

边界：生产部署、运行时feature-switch覆盖和实际效果未知；本次仅源码阅读，未运行上游服务或测试。

### xai-value-model/weights.rs

变化：react_with_video改post_video，同时正项总和、perturbation命名和applied_weights_map同步，新map输出post_video。

影响：公开默认0时不增加影响；若运行时非零且sigma>0，perturbation按salt/user/head哈希，因此head名字改变可能改变确定性扰动符号，不能只称完全无语义重命名。其余权重/offset归一化规则保持。

关联：research-09、research-21。

- [xai-value-model/weights.rs:24–30](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/weights.rs#L24-L30) 完整diff语义已读，定位变化与相邻上下文。
- [xai-value-model/weights.rs:66–72](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/weights.rs#L66-L72) 完整diff语义已读，定位变化与相邻上下文。
- [xai-value-model/weights.rs:134–140](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/weights.rs#L134-L140) 完整diff语义已读，定位变化与相邻上下文。
- [xai-value-model/weights.rs:165–171](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/weights.rs#L165-L171) 完整diff语义已读，定位变化与相邻上下文。
- [xai-value-model/weights.rs:102–110](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/weights.rs#L102-L110) 非零sigma权重扰动入口
- [xai-value-model/weights.rs:198–205](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/xai-value-model/weights.rs#L198-L205) head名称参与哈希
- [vm-ranker/scoring/value_model.rs:116–123](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/scoring/value_model.rs#L116-L123) VM实际调用perturbed
- [home-mixer/scorers/value_model.rs:53–55](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/value_model.rs#L53-L55) applied_weights_map消费者
- [home-mixer/params/param.rs:477–482](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/params/param.rs#L477-L482) Home默认权重0
- [vm-ranker/params.rs:102–108](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/vm-ranker/params.rs#L102-L108) VM默认权重0

边界：生产部署、运行时feature-switch覆盖和实际效果未知；本次仅源码阅读，未运行上游服务或测试。

## models

### grox/config/config.py

变化：新增Grok 4.5内部模型名称和可选XReviewIntakeConfig(endpoint, timeout=10s)，GroxConfig.xreview_intake默认None。

影响：配置声明不等于审核服务启用或购买认证获得排名提升；公开Grox树未找到新名称/intake配置读取者。

关联：research-18、OP08。

- [grox/config/config.py:90–95](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/grox/config/config.py#L90-L95) Baseline implementation/context for reviewed change class ModelName:
- [grox/config/config.py:90–96](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/config/config.py#L90-L96) Target implementation/context for reviewed change class ModelName:
- [grox/config/config.py:216–221](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/grox/config/config.py#L216-L221) Baseline implementation/context for reviewed change class MediaReferenceBundleConfig(BaseModel):
- [grox/config/config.py:217–227](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/config/config.py#L217-L227) Target implementation/context for reviewed change class MediaReferenceBundleConfig(BaseModel):
- [grox/config/config.py:246–251](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/grox/config/config.py#L246-L251) Baseline implementation/context for reviewed change class GroxConfig(BaseSettings):
- [grox/config/config.py:252–258](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/config/config.py#L252-L258) Target implementation/context for reviewed change class GroxConfig(BaseSettings):
- [grox/config/config.py:22–38](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/config/config.py#L22-L38) YAML config source selection; runtime configuration is external to declaration

边界：实际模型选择、intake调用方及部署配置未公开确认。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### grox/core/data_loaders/data_types.py

变化：User增加is_suspended可空字段、Premium/PremiumPlus蓝标属性、大小写不敏感的注册/使用国家不一致属性；AffiliatedBusiness增加badge_image_url，Thrift映射填充。

影响：增加审核输入表达能力，不是新的封禁判定或Home boost；国家任一缺失时返回false而非确认一致。蓝标属性不能替代UserCred isPremium的更广认证类别定义。

关联：research-17、research-28、OP08。

- [grox/core/data_loaders/data_types.py:15–20](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/grox/core/data_loaders/data_types.py#L15-L20) Baseline implementation/context for reviewed change from strato_http.queries.data_types import (
- [grox/core/data_loaders/data_types.py:15–24](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/core/data_loaders/data_types.py#L15-L24) Target implementation/context for reviewed change from strato_http.queries.data_types import (
- [grox/core/data_loaders/data_types.py:42–47](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/grox/core/data_loaders/data_types.py#L42-L47) Baseline implementation/context for reviewed change class User(BaseModel):
- [grox/core/data_loaders/data_types.py:46–61](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/core/data_loaders/data_types.py#L46-L61) Target implementation/context for reviewed change class User(BaseModel):
- [grox/core/data_loaders/data_types.py:86–91](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/grox/core/data_loaders/data_types.py#L86-L91) Baseline implementation/context for reviewed change class User(BaseModel):
- [grox/core/data_loaders/data_types.py:100–106](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/core/data_loaders/data_types.py#L100-L106) Target implementation/context for reviewed change class User(BaseModel):
- [grox/core/data_loaders/data_types.py:96–101](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/grox/core/data_loaders/data_types.py#L96-L101) Baseline implementation/context for reviewed change class User(BaseModel):
- [grox/core/data_loaders/data_types.py:111–117](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/core/data_loaders/data_types.py#L111-L117) Target implementation/context for reviewed change class User(BaseModel):
- [grox/core/data_loaders/data_types.py:779–790](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/core/data_loaders/data_types.py#L779-L790) Post hydration calls User.from_thrift_model
- [grox/core/data_loaders/post_mapper.py:343–379](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/core/data_loaders/post_mapper.py#L343-L379) Strato mapping populates newly added metadata

边界：属性的执法消费者未在公开Grox树中找到；实际生产输入未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### grox/core/data_loaders/post_mapper.py

变化：Strato作者映射额外传入badgeImageUrl与isSuspended。

影响：UserStratoLoader和帖子/提及用户映射消费此函数；仅丰富元数据，不会自行执行封禁、降权或改变Home权重。

关联：research-17、OP08。

- [grox/core/data_loaders/post_mapper.py:364–369](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/grox/core/data_loaders/post_mapper.py#L364-L369) Baseline implementation/context for reviewed change class PostMapper:
- [grox/core/data_loaders/post_mapper.py:364–370](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/core/data_loaders/post_mapper.py#L364-L370) Target implementation/context for reviewed change class PostMapper:
- [grox/core/data_loaders/post_mapper.py:374–379](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/grox/core/data_loaders/post_mapper.py#L374-L379) Baseline implementation/context for reviewed change class PostMapper:
- [grox/core/data_loaders/post_mapper.py:375–381](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/core/data_loaders/post_mapper.py#L375-L381) Target implementation/context for reviewed change class PostMapper:
- [grox/core/data_loaders/strato_loader.py:60–71](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/core/data_loaders/strato_loader.py#L60-L71) UserStratoLoader consumes mapper

边界：下游审核策略与生产字段完整度未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### grox/core/lm/convo.py

变化：motion-reveal提示词强调不同场景的隐藏半透明层，并明确可见人物原地轮廓运动本身不构成隐藏内容。

影响：Video两种序列化路径只有存在motion_reveal_frames才加入说明；这是内容理解输入改动，不是普通视频统一降权。

关联：research-18、OP08。

- [grox/core/lm/convo.py:23–33](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/grox/core/lm/convo.py#L23-L33) Baseline implementation/context for reviewed change NO_THINKING_PROMPT = grox_config.prompt_tokens.no_thinking_prompt
- [grox/core/lm/convo.py:23–38](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/core/lm/convo.py#L23-L38) Target implementation/context for reviewed change NO_THINKING_PROMPT = grox_config.prompt_tokens.no_thinking_prompt
- [grox/core/lm/convo.py:227–233](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/core/lm/convo.py#L227-L233) native content serialization condition
- [grox/core/lm/convo.py:455–467](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/core/lm/convo.py#L455-L467) alternate message serialization condition

边界：模型判断准确率与接收这些输入的生产政策未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### grox/core/lm/json_output.py

变化：新增extract_json：优先提取<json>标签内容，再提取代码围栏，最后json.loads；is_placeholder识别空值和限定占位词。

影响：新解析辅助文件没有在公开Grox树中找到导入/调用者；不能据此新增审核或运营规则，解析异常也未在这里吞掉。

关联：无直接运营动作。

- [grox/core/lm/json_output.py:1–22](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/core/lm/json_output.py#L1-L22) Target implementation/context for reviewed change

边界：使用者、异常处理和生产启用未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### grox/libs/video_tools/image.py

变化：motion-reveal由残差幅度预筛改为全局/局部透明叠层特征打分、遮挡运动比例过滤；局部背景选择影响配准与窗口残差，新增最多2张plain增强图，保留overview/detail与肤色不可信时灰度输出。

影响：VideoFramesExtractor仅enable_motion_reveal时调用且失败退回RGB；media_loader参数默认false。检测阈值是图像预处理条件而非内容处罚线，不可据此建议绕过审核。

关联：research-18、OP08、OP09。

- [grox/libs/video_tools/image.py:160–167](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/grox/libs/video_tools/image.py#L160-L167) Baseline implementation/context for reviewed change _MOTION_REVEAL_MAX_INPUT_FRAMES = 48
- [grox/libs/video_tools/image.py:160–168](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/libs/video_tools/image.py#L160-L168) Target implementation/context for reviewed change _MOTION_REVEAL_MAX_INPUT_FRAMES = 48
- [grox/libs/video_tools/image.py:177–183](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/grox/libs/video_tools/image.py#L177-L183) Baseline implementation/context for reviewed change _MOTION_REVEAL_STATIC_MIN_RESPONSE = 0.05
- [grox/libs/video_tools/image.py:178–196](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/libs/video_tools/image.py#L178-L196) Target implementation/context for reviewed change _MOTION_REVEAL_STATIC_MIN_RESPONSE = 0.05
- [grox/libs/video_tools/image.py:230–235](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/grox/libs/video_tools/image.py#L230-L235) Baseline implementation/context for reviewed change def _stretch_to_u8(arr: np.ndarray) -> np.ndarray:
- [grox/libs/video_tools/image.py:243–295](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/libs/video_tools/image.py#L243-L295) Target implementation/context for reviewed change def _stretch_to_u8(arr: np.ndarray) -> np.ndarray:
- [grox/libs/video_tools/image.py:405–410](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/grox/libs/video_tools/image.py#L405-L410) Baseline implementation/context for reviewed change def _skin_plausible(overlays: list[np.ndarray]) -> bool:
- [grox/libs/video_tools/image.py:465–583](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/libs/video_tools/image.py#L465-L583) Target implementation/context for reviewed change def _skin_plausible(overlays: list[np.ndarray]) -> bool:
- [grox/libs/video_tools/image.py:437–454](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/grox/libs/video_tools/image.py#L437-L454) Baseline implementation/context for reviewed change def build_motion_reveal_images(frame_jpegs: list[bytes]) -> list[bytes]:
- [grox/libs/video_tools/image.py:610–636](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/libs/video_tools/image.py#L610-L636) Target implementation/context for reviewed change def build_motion_reveal_images(frame_jpegs: list[bytes]) -> list[bytes]:
- [grox/libs/video_tools/image.py:465–471](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/grox/libs/video_tools/image.py#L465-L471) Baseline implementation/context for reviewed change def build_motion_reveal_images(frame_jpegs: list[bytes]) -> list[bytes]:
- [grox/libs/video_tools/image.py:647–653](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/libs/video_tools/image.py#L647-L653) Target implementation/context for reviewed change def build_motion_reveal_images(frame_jpegs: list[bytes]) -> list[bytes]:
- [grox/libs/video_tools/image.py:474–490](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/grox/libs/video_tools/image.py#L474-L490) Baseline implementation/context for reviewed change def build_motion_reveal_images(frame_jpegs: list[bytes]) -> list[bytes]:
- [grox/libs/video_tools/image.py:656–679](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/libs/video_tools/image.py#L656-L679) Target implementation/context for reviewed change def build_motion_reveal_images(frame_jpegs: list[bytes]) -> list[bytes]:
- [grox/libs/video_tools/image.py:493–508](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/grox/libs/video_tools/image.py#L493-L508) Baseline implementation/context for reviewed change def build_motion_reveal_images(frame_jpegs: list[bytes]) -> list[bytes]:
- [grox/libs/video_tools/image.py:682–694](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/libs/video_tools/image.py#L682-L694) Target implementation/context for reviewed change def build_motion_reveal_images(frame_jpegs: list[bytes]) -> list[bytes]:
- [grox/libs/video_tools/image.py:510–516](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/grox/libs/video_tools/image.py#L510-L516) Baseline implementation/context for reviewed change def build_motion_reveal_images(frame_jpegs: list[bytes]) -> list[bytes]:
- [grox/libs/video_tools/image.py:696–702](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/libs/video_tools/image.py#L696-L702) Target implementation/context for reviewed change def build_motion_reveal_images(frame_jpegs: list[bytes]) -> list[bytes]:
- [grox/libs/video_tools/image.py:528–534](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/grox/libs/video_tools/image.py#L528-L534) Baseline implementation/context for reviewed change def build_motion_reveal_images(frame_jpegs: list[bytes]) -> list[bytes]:
- [grox/libs/video_tools/image.py:714–721](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/libs/video_tools/image.py#L714-L721) Target implementation/context for reviewed change def build_motion_reveal_images(frame_jpegs: list[bytes]) -> list[bytes]:
- [grox/libs/video_tools/image.py:542–547](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/grox/libs/video_tools/image.py#L542-L547) Baseline implementation/context for reviewed change def build_motion_reveal_images(frame_jpegs: list[bytes]) -> list[bytes]:
- [grox/libs/video_tools/image.py:729–744](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/libs/video_tools/image.py#L729-L744) Target implementation/context for reviewed change def build_motion_reveal_images(frame_jpegs: list[bytes]) -> list[bytes]:
- [grox/libs/video_tools/video_frames.py:92–118](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/libs/video_tools/video_frames.py#L92-L118) enabled reveal generation and RGB fallback
- [grox/core/data_loaders/media_loader.py:623–647](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/grox/core/data_loaders/media_loader.py#L623-L647) caller default false, flag propagated

边界：实际调用者是否开启、误报漏报和后续政策动作未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/crates/common/xai-recsys/build.rs

变化：构建过程检查Python Int64Feature中两个时间间隔字段；同时存在启用recsys_time_gap，部分存在panic，全部缺失不启用。

影响：保护Rust/Python特征布局一致性；只有编译支持且宽度匹配的输入才stamp，不改变48h候选年龄规则。

关联：research-04、research-10。

- [phoenix/crates/common/xai-recsys/build.rs:163–168](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/common/xai-recsys/build.rs#L163-L168) Baseline implementation/context for reviewed change fn emit_ads_dpa_cfg(classes: &[EnumClass], consts: &[ModuleConst]) {
- [phoenix/crates/common/xai-recsys/build.rs:163–190](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/common/xai-recsys/build.rs#L163-L190) Target implementation/context for reviewed change fn emit_ads_dpa_cfg(classes: &[EnumClass], consts: &[ModuleConst]) {
- [phoenix/crates/common/xai-recsys/build.rs:174–179](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/common/xai-recsys/build.rs#L174-L179) Baseline implementation/context for reviewed change fn main() {
- [phoenix/crates/common/xai-recsys/build.rs:196–202](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/common/xai-recsys/build.rs#L196-L202) Target implementation/context for reviewed change fn main() {
- [phoenix/crates/common/xai-recsys/src/util.rs:407–447](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/common/xai-recsys/src/util.rs#L407-L447) compile-time cfg gates timestamp implementation

边界：构建产物、模型宽度与生产启用未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/crates/common/xai-recsys/src/model_config.rs

变化：HashTableConfig增加ads_count_features；现有ModelConfig构造明确置false。

影响：为广告计数侧输入提供独立gate，不是organic帖子互动门槛。公开树stamp_ads_count_buckets未见外部调用，不能从字段存在推断服务已接线。

关联：research-09、research-27。

- [phoenix/crates/common/xai-recsys/src/model_config.rs:107–112](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/common/xai-recsys/src/model_config.rs#L107-L112) Baseline implementation/context for reviewed change pub struct HashTableConfig {
- [phoenix/crates/common/xai-recsys/src/model_config.rs:107–113](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/common/xai-recsys/src/model_config.rs#L107-L113) Target implementation/context for reviewed change pub struct HashTableConfig {
- [phoenix/crates/common/xai-recsys/src/model_config.rs:353–358](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/common/xai-recsys/src/model_config.rs#L353-L358) Baseline implementation/context for reviewed change impl ModelConfig {
- [phoenix/crates/common/xai-recsys/src/model_config.rs:354–360](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/common/xai-recsys/src/model_config.rs#L354-L360) Target implementation/context for reviewed change impl ModelConfig {
- [phoenix/crates/common/xai-recsys/src/util.rs:592–621](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/common/xai-recsys/src/util.rs#L592-L621) ads_count_features gate; no external caller found in public tree

边界：外部配置反序列化/覆盖和部署调用方未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/crates/common/xai-recsys/src/reply.rs

变化：将n_post_int64 > REPLY_SELF_REPLY_INT64_INDEX提取为is_reply_width并复用原reply gate。

影响：原回复字段填充条件等价；新time-gap consumer借此排除reply宽度，避免复用槽位冲突。不修改OON回复资格。

关联：research-24、OP03。

- [phoenix/crates/common/xai-recsys/src/reply.rs:313–318](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/common/xai-recsys/src/reply.rs#L313-L318) Baseline implementation/context for reviewed change fn record_candidate_fill(feature: &str, filled: u64, total: u64) {
- [phoenix/crates/common/xai-recsys/src/reply.rs:313–322](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/common/xai-recsys/src/reply.rs#L313-L322) Target implementation/context for reviewed change fn record_candidate_fill(feature: &str, filled: u64, total: u64) {
- [phoenix/crates/common/xai-recsys/src/reply.rs:452–458](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/common/xai-recsys/src/reply.rs#L452-L458) Baseline implementation/context for reviewed change impl InputBuffer {
- [phoenix/crates/common/xai-recsys/src/reply.rs:456–462](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/common/xai-recsys/src/reply.rs#L456-L462) Target implementation/context for reviewed change impl InputBuffer {
- [phoenix/crates/common/xai-recsys/src/util.rs:407–419](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/common/xai-recsys/src/util.rs#L407-L419) reply width excludes time-gap stamping

边界：模型布局运行选择未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/crates/common/xai-recsys/src/util.rs

变化：新增广告3组×7计数×8窗口的168个log2桶特征与gate填充；新增request/latest-history时间戳stamp，在proto及columnar输入路径调用，跳过reply宽度/不足宽度；增加相应静态测试源码。

影响：time-gap是观看者历史输入而非发帖时段奖励；ad count零桶也代表缺数据。广告stamp没有公开外部调用者，时间stamp有两条实际调用链；不能等同全部侧输入都上线。

关联：research-04、research-09、research-10、research-27。

- [phoenix/crates/common/xai-recsys/src/util.rs:164–169](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/common/xai-recsys/src/util.rs#L164-L169) Baseline implementation/context for reviewed change use crate::feature_config::int64_feature::{
- [phoenix/crates/common/xai-recsys/src/util.rs:164–175](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/common/xai-recsys/src/util.rs#L164-L175) Target implementation/context for reviewed change use crate::feature_config::int64_feature::{
- [phoenix/crates/common/xai-recsys/src/util.rs:174–179](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/common/xai-recsys/src/util.rs#L174-L179) Baseline implementation/context for reviewed change pub const EXACT_PHRASE_CATEGORICAL_IDX: usize = EXACT_PHRASE_SEQ;
- [phoenix/crates/common/xai-recsys/src/util.rs:180–224](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/common/xai-recsys/src/util.rs#L180-L224) Target implementation/context for reviewed change pub const EXACT_PHRASE_CATEGORICAL_IDX: usize = EXACT_PHRASE_SEQ;
- [phoenix/crates/common/xai-recsys/src/util.rs:361–366](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/common/xai-recsys/src/util.rs#L361-L366) Baseline implementation/context for reviewed change const TZ_ENUM_TO_UTC_OFFSET_SECS: [i64; 32] = [
- [phoenix/crates/common/xai-recsys/src/util.rs:406–450](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/common/xai-recsys/src/util.rs#L406-L450) Target implementation/context for reviewed change const TZ_ENUM_TO_UTC_OFFSET_SECS: [i64; 32] = [
- [phoenix/crates/common/xai-recsys/src/util.rs:474–479](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/common/xai-recsys/src/util.rs#L474-L479) Baseline implementation/context for reviewed change pub struct InputBuffer {
- [phoenix/crates/common/xai-recsys/src/util.rs:558–564](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/common/xai-recsys/src/util.rs#L558-L564) Target implementation/context for reviewed change pub struct InputBuffer {
- [phoenix/crates/common/xai-recsys/src/util.rs:503–508](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/common/xai-recsys/src/util.rs#L503-L508) Baseline implementation/context for reviewed change impl InputBuffer {
- [phoenix/crates/common/xai-recsys/src/util.rs:588–624](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/common/xai-recsys/src/util.rs#L588-L624) Target implementation/context for reviewed change impl InputBuffer {
- [phoenix/crates/common/xai-recsys/src/util.rs:1078–1083](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/common/xai-recsys/src/util.rs#L1078-L1083) Baseline implementation/context for reviewed change impl InputBuffer {
- [phoenix/crates/common/xai-recsys/src/util.rs:1194–1210](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/common/xai-recsys/src/util.rs#L1194-L1210) Target implementation/context for reviewed change impl InputBuffer {
- [phoenix/crates/common/xai-recsys/src/util.rs:1210–1215](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/common/xai-recsys/src/util.rs#L1210-L1215) Baseline implementation/context for reviewed change impl InputBuffer {
- [phoenix/crates/common/xai-recsys/src/util.rs:1337–1343](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/common/xai-recsys/src/util.rs#L1337-L1343) Target implementation/context for reviewed change impl InputBuffer {
- [phoenix/crates/common/xai-recsys/src/util.rs:1376–1381](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/common/xai-recsys/src/util.rs#L1376-L1381) Baseline implementation/context for reviewed change impl InputBuffer {
- [phoenix/crates/common/xai-recsys/src/util.rs:1504–1510](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/common/xai-recsys/src/util.rs#L1504-L1510) Target implementation/context for reviewed change impl InputBuffer {
- [phoenix/crates/common/xai-recsys/src/util.rs:1539–1544](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/common/xai-recsys/src/util.rs#L1539-L1544) Baseline implementation/context for reviewed change impl InputBuffer {
- [phoenix/crates/common/xai-recsys/src/util.rs:1668–1684](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/common/xai-recsys/src/util.rs#L1668-L1684) Target implementation/context for reviewed change impl InputBuffer {
- [phoenix/crates/common/xai-recsys/src/util.rs:1671–1676](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/common/xai-recsys/src/util.rs#L1671-L1676) Baseline implementation/context for reviewed change impl InputBuffer {
- [phoenix/crates/common/xai-recsys/src/util.rs:1811–1817](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/common/xai-recsys/src/util.rs#L1811-L1817) Target implementation/context for reviewed change impl InputBuffer {
- [phoenix/crates/common/xai-recsys/src/util.rs:1864–1869](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/common/xai-recsys/src/util.rs#L1864-L1869) Baseline implementation/context for reviewed change mod tests {
- [phoenix/crates/common/xai-recsys/src/util.rs:2005–2011](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/common/xai-recsys/src/util.rs#L2005-L2011) Target implementation/context for reviewed change mod tests {
- [phoenix/crates/common/xai-recsys/src/util.rs:2820–2823](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/common/xai-recsys/src/util.rs#L2820-L2823) Baseline implementation/context for reviewed change mod tests {
- [phoenix/crates/common/xai-recsys/src/util.rs:2962–3111](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/common/xai-recsys/src/util.rs#L2962-L3111) Target implementation/context for reviewed change mod tests {
- [phoenix/xrex/models/recsys_feature_prep.py:1026–1041](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_feature_prep.py#L1026-L1041) history gap consumer
- [phoenix/xrex/models/recsys_feature_prep.py:1083–1101](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_feature_prep.py#L1083-L1101) candidate gap consumer
- [phoenix/crates/common/xai-recsys/src/model_config.rs:349–358](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/common/xai-recsys/src/model_config.rs#L349-L358) ads count public constructor defaults false

边界：输入数据、运行模型宽度、广告stamp服务接线及生产部署未知；未执行测试。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs

变化：下载接口增加replicas参数，简易wrapper传false；当sharded布局每rank片数覆盖全量时可转换为replicated ownership，新增单peer并行读取测试并更新测试调用参数。

影响：改变embedding checkpoint传输/连接利用，不改embedding内容的排名公式。公开树layout接口非测试调用仅为传false的wrapper，true在测试中不证明生产启用。

关联：无直接运营动作。

- [phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs:830–835](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs#L830-L835) Baseline implementation/context for reviewed change pub async fn download_embedding_table(
- [phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs:830–836](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs#L830-L836) Target implementation/context for reviewed change pub async fn download_embedding_table(
- [phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs:842–847](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs#L842-L847) Baseline implementation/context for reviewed change pub async fn download_embedding_table_with_layout(
- [phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs:843–849](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs#L843-L849) Target implementation/context for reviewed change pub async fn download_embedding_table_with_layout(
- [phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs:852–857](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs#L852-L857) Baseline implementation/context for reviewed change pub async fn download_embedding_table_with_layout(
- [phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs:854–860](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs#L854-L860) Target implementation/context for reviewed change pub async fn download_embedding_table_with_layout(
- [phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs:865–875](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs#L865-L875) Baseline implementation/context for reviewed change async fn download_embedding_table_with_conns(
- [phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs:868–882](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs#L868-L882) Target implementation/context for reviewed change async fn download_embedding_table_with_conns(
- [phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs:1051–1056](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs#L1051-L1056) Baseline implementation/context for reviewed change pub(crate) enum ShardOwnership {
- [phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs:1058–1077](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs#L1058-L1077) Target implementation/context for reviewed change pub(crate) enum ShardOwnership {
- [phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs:2500–2505](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs#L2500-L2505) Baseline implementation/context for reviewed change mod trainer_e2e_tests {
- [phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs:2521–2527](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs#L2521-L2527) Target implementation/context for reviewed change mod trainer_e2e_tests {
- [phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs:2515–2520](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs#L2515-L2520) Baseline implementation/context for reviewed change mod trainer_e2e_tests {
- [phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs:2537–2576](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs#L2537-L2576) Target implementation/context for reviewed change mod trainer_e2e_tests {
- [phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs:2601–2606](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs#L2601-L2606) Baseline implementation/context for reviewed change mod p2p_e2e_tests {
- [phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs:2657–2663](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs#L2657-L2663) Target implementation/context for reviewed change mod p2p_e2e_tests {
- [phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs:2661–2666](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs#L2661-L2666) Baseline implementation/context for reviewed change mod p2p_e2e_tests {
- [phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs:2718–2724](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs#L2718-L2724) Target implementation/context for reviewed change mod p2p_e2e_tests {
- [phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs:2821–2826](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs#L2821-L2826) Baseline implementation/context for reviewed change mod p2p_e2e_tests {
- [phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs:2879–2885](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs#L2879-L2885) Target implementation/context for reviewed change mod p2p_e2e_tests {
- [phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs:816–858](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-engine/src/copy_port_client.rs#L816-L858) public wrapper supplies replicas=false

边界：实际下载调用、拓扑与性能未知；未执行测试。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs

变化：SID client将固定2连接/单缓存改为可配置连接数和分片缓存，异步有界队列批量插入，满队列丢缓存写入；增加RPC完成标志和阶段指标；Python builder仍2连接1分片。

影响：hydrate仍只补空semantic_ids且校验首code非负，预算/超时规则保留；异步写入可改变后续命中率而非授权内容或直接分值。不能把缓存TTL=6h当帖寿命。

关联：research-25。

- [phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs:2–8](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs#L2-L8) Baseline implementation/context for reviewed change
- [phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs:2–8](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs#L2-L8) Target implementation/context for reviewed change
- [phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs:17–26](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs#L17-L26) Baseline implementation/context for reviewed change use xai_recsys_proto as pb;
- [phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs:17–28](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs#L17-L28) Target implementation/context for reviewed change use xai_recsys_proto as pb;
- [phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs:48–64](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs#L48-L64) Baseline implementation/context for reviewed change lazy_static! {
- [phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs:50–109](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs#L50-L109) Target implementation/context for reviewed change lazy_static! {
- [phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs:66–88](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs#L66-L88) Baseline implementation/context for reviewed change impl SemanticIdClient {
- [phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs:111–139](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs#L111-L139) Target implementation/context for reviewed change impl SemanticIdClient {
- [phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs:108–114](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs#L108-L114) Baseline implementation/context for reviewed change impl SemanticIdClient {
- [phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs:159–169](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs#L159-L169) Target implementation/context for reviewed change impl SemanticIdClient {
- [phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs:120–131](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs#L120-L131) Baseline implementation/context for reviewed change impl SemanticIdClient {
- [phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs:175–201](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs#L175-L201) Target implementation/context for reviewed change impl SemanticIdClient {
- [phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs:157–163](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs#L157-L163) Baseline implementation/context for reviewed change impl SemanticIdClient {
- [phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs:227–233](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs#L227-L233) Target implementation/context for reviewed change impl SemanticIdClient {
- [phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs:175–191](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs#L175-L191) Baseline implementation/context for reviewed change impl SemanticIdClient {
- [phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs:245–270](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs#L245-L270) Target implementation/context for reviewed change impl SemanticIdClient {
- [phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs:193–199](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs#L193-L199) Baseline implementation/context for reviewed change impl SemanticIdClient {
- [phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs:272–280](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs#L272-L280) Target implementation/context for reviewed change impl SemanticIdClient {
- [phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs:241–247](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs#L241-L247) Baseline implementation/context for reviewed change pub struct PySemanticIdClient {
- [phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs:322–333](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs#L322-L333) Target implementation/context for reviewed change pub struct PySemanticIdClient {
- [phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs:256–258](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs#L256-L258) Baseline implementation/context for reviewed change impl PySemanticIdClient {
- [phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs:342–379](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs#L342-L379) Target implementation/context for reviewed change impl PySemanticIdClient {
- [phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs:137–223](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs#L137-L223) actual hydrate result consumption and deadline
- [phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs:323–333](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-engine/src/sid_client.rs#L323-L333) Python builder explicit 2-channel/1-shard defaults

边界：服务端非Python构造配置、队列压力及生产延迟未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/crates/serving/xai-recsys-mm-server/src/mm_embedding_fetcher.rs

变化：移除MM_CACHE_ENDPOINT/MM_CACHE_FALLBACK_DISABLED与匿名S3 data-loader fallback；list/get_raw仅向O2重试并返回错误，保留退避与MAX_RETRIES。

影响：实际snapshot及初始化加载消费者现在不能依赖旧fallback；可影响embedding可用性，不提供媒体固定排名加分或全站删帖机制。

关联：research-25、OP09。

- [phoenix/crates/serving/xai-recsys-mm-server/src/mm_embedding_fetcher.rs:1–16](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-mm-server/src/mm_embedding_fetcher.rs#L1-L16) Baseline implementation/context for reviewed change
- [phoenix/crates/serving/xai-recsys-mm-server/src/mm_embedding_fetcher.rs:1–12](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-mm-server/src/mm_embedding_fetcher.rs#L1-L12) Target implementation/context for reviewed change
- [phoenix/crates/serving/xai-recsys-mm-server/src/mm_embedding_fetcher.rs:25–31](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-mm-server/src/mm_embedding_fetcher.rs#L25-L31) Baseline implementation/context for reviewed change lazy_static! {
- [phoenix/crates/serving/xai-recsys-mm-server/src/mm_embedding_fetcher.rs:21–27](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-mm-server/src/mm_embedding_fetcher.rs#L21-L27) Target implementation/context for reviewed change lazy_static! {
- [phoenix/crates/serving/xai-recsys-mm-server/src/mm_embedding_fetcher.rs:37–92](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-mm-server/src/mm_embedding_fetcher.rs#L37-L92) Baseline implementation/context for reviewed change const MAX_RETRIES: usize = 9;
- [phoenix/crates/serving/xai-recsys-mm-server/src/mm_embedding_fetcher.rs:33–49](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-mm-server/src/mm_embedding_fetcher.rs#L33-L49) Target implementation/context for reviewed change const MAX_RETRIES: usize = 9;
- [phoenix/crates/serving/xai-recsys-mm-server/src/mm_embedding_fetcher.rs:110–142](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-mm-server/src/mm_embedding_fetcher.rs#L110-L142) Baseline implementation/context for reviewed change impl MmEmbeddingFetcher {
- [phoenix/crates/serving/xai-recsys-mm-server/src/mm_embedding_fetcher.rs:67–79](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-mm-server/src/mm_embedding_fetcher.rs#L67-L79) Target implementation/context for reviewed change impl MmEmbeddingFetcher {
- [phoenix/crates/serving/xai-recsys-mm-server/src/mm_embedding_fetcher.rs:155–195](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-mm-server/src/mm_embedding_fetcher.rs#L155-L195) Baseline implementation/context for reviewed change impl MmEmbeddingFetcher {
- [phoenix/crates/serving/xai-recsys-mm-server/src/mm_embedding_fetcher.rs:92–111](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-mm-server/src/mm_embedding_fetcher.rs#L92-L111) Target implementation/context for reviewed change impl MmEmbeddingFetcher {
- [phoenix/crates/serving/xai-recsys-mm-server/src/mm_embedding_fetcher.rs:198–227](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-mm-server/src/mm_embedding_fetcher.rs#L198-L227) Baseline implementation/context for reviewed change impl MmEmbeddingFetcher {
- [phoenix/crates/serving/xai-recsys-mm-server/src/mm_embedding_fetcher.rs:114–117](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-mm-server/src/mm_embedding_fetcher.rs#L114-L117) Target implementation/context for reviewed change impl MmEmbeddingFetcher {
- [phoenix/crates/serving/xai-recsys-mm-server/src/mm_embedding_client.rs:371–395](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-mm-server/src/mm_embedding_client.rs#L371-L395) initial load caller propagates O2 errors
- [phoenix/crates/serving/xai-recsys-mm-server/src/snapshot.rs:368–378](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-mm-server/src/snapshot.rs#L368-L378) list consumer requires O2 results

边界：部署O2可靠性与上层容错/缓存效果未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/crates/serving/xai-recsys-proto/proto/recsys.proto

变化：Rust proto新增PageDecodeParams.rewardHead、ScoreInfo.pageDecoded、广告late-window/leadgen动作、AdTargeting/ad_taxonomy_id、两个history aggregation类型；44号动作ReactWithVideo重命名PostVideo，wire编号不变。

影响：Home调用者传reward_head并缓存decoded标志，Python proto同步；这是请求/日志/训练契约变更，不保证服务端消费rewardHead。广告目标字段不是organic受众限制；动作名迁移应同步旧解释。

关联：research-16、research-25、research-27、research-35。

- [phoenix/crates/serving/xai-recsys-proto/proto/recsys.proto:211–216](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-proto/proto/recsys.proto#L211-L216) Baseline implementation/context for reviewed change message PageDecodeParams {
- [phoenix/crates/serving/xai-recsys-proto/proto/recsys.proto:211–218](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-proto/proto/recsys.proto#L211-L218) Target implementation/context for reviewed change message PageDecodeParams {
- [phoenix/crates/serving/xai-recsys-proto/proto/recsys.proto:485–491](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-proto/proto/recsys.proto#L485-L491) Baseline implementation/context for reviewed change enum ActionName {
- [phoenix/crates/serving/xai-recsys-proto/proto/recsys.proto:487–493](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-proto/proto/recsys.proto#L487-L493) Target implementation/context for reviewed change enum ActionName {
- [phoenix/crates/serving/xai-recsys-proto/proto/recsys.proto:553–558](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-proto/proto/recsys.proto#L553-L558) Baseline implementation/context for reviewed change enum ActionName {
- [phoenix/crates/serving/xai-recsys-proto/proto/recsys.proto:555–562](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-proto/proto/recsys.proto#L555-L562) Target implementation/context for reviewed change enum ActionName {
- [phoenix/crates/serving/xai-recsys-proto/proto/recsys.proto:622–627](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-proto/proto/recsys.proto#L622-L627) Baseline implementation/context for reviewed change enum ActionName {
- [phoenix/crates/serving/xai-recsys-proto/proto/recsys.proto:626–632](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-proto/proto/recsys.proto#L626-L632) Target implementation/context for reviewed change enum ActionName {
- [phoenix/crates/serving/xai-recsys-proto/proto/recsys.proto:1492–1497](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-proto/proto/recsys.proto#L1492-L1497) Baseline implementation/context for reviewed change message ScoreInfo {
- [phoenix/crates/serving/xai-recsys-proto/proto/recsys.proto:1497–1503](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-proto/proto/recsys.proto#L1497-L1503) Target implementation/context for reviewed change message ScoreInfo {
- [phoenix/crates/serving/xai-recsys-proto/proto/recsys.proto:1708–1713](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-proto/proto/recsys.proto#L1708-L1713) Baseline implementation/context for reviewed change message AdInfo {
- [phoenix/crates/serving/xai-recsys-proto/proto/recsys.proto:1714–1730](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-proto/proto/recsys.proto#L1714-L1730) Target implementation/context for reviewed change message AdInfo {
- [phoenix/crates/serving/xai-recsys-proto/proto/recsys.proto:1930–1936](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-proto/proto/recsys.proto#L1930-L1936) Baseline implementation/context for reviewed change enum UserActionAggregationType {
- [phoenix/crates/serving/xai-recsys-proto/proto/recsys.proto:1947–1954](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-proto/proto/recsys.proto#L1947-L1954) Target implementation/context for reviewed change enum UserActionAggregationType {
- [home-mixer/scorers/page_decode_rerank_scorer.rs:22–31](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/page_decode_rerank_scorer.rs#L22-L31) Home request produces reward_head
- [home-mixer/side_effects/phoenix_request_cache_side_effect.rs:201–226](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/side_effects/phoenix_request_cache_side_effect.rs#L201-L226) page_decoded emitted only when enabled and slot exists
- [phoenix/xrex/data/recsys/constants.py:85–89](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/constants.py#L85-L89) renamed action metric consumer

边界：公开Phoenix树未找到rewardHead读取或AdTargeting consumer；生产客户端/服务端版本兼容性未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/crates/serving/xai-recsys-proto/src/lib.rs

变化：新增AD_TARGETING_MAX_INTEREST_CATEGORY_IDS=8常量。

影响：公开树搜索仅声明，不能宣称所有广告实际已截断8个兴趣类，更不能当自然帖推荐上限。

关联：research-27。

- [phoenix/crates/serving/xai-recsys-proto/src/lib.rs:19–24](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/crates/serving/xai-recsys-proto/src/lib.rs#L19-L24) Baseline implementation/context for reviewed change pub const SAFETY_BIT_TWEET_NSFW: u64 = 1 << 3;
- [phoenix/crates/serving/xai-recsys-proto/src/lib.rs:19–26](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/serving/xai-recsys-proto/src/lib.rs#L19-L26) Target implementation/context for reviewed change pub const SAFETY_BIT_TWEET_NSFW: u64 = 1 << 3;

边界：实际调用者/边界校验未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/python/common/xai-configlib/src/xai_configlib/__init__.py

变化：replace_recursive新增对嵌套dict的递归替换；叶子bool/int/float按原类型cast，其余替为字符串，记录匹配路径。

影响：由replace_cli_subs及配置加载/导出调用消费，使更深层运行覆盖能生效。公开配方值不能视为不可覆盖的生产常量；不直接新增创作者规则。

关联：无直接运营动作。

- [phoenix/python/common/xai-configlib/src/xai_configlib/__init__.py:385–390](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/python/common/xai-configlib/src/xai_configlib/__init__.py#L385-L390) Baseline implementation/context for reviewed change def replace_recursive(
- [phoenix/python/common/xai-configlib/src/xai_configlib/__init__.py:385–392](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/python/common/xai-configlib/src/xai_configlib/__init__.py#L385-L392) Target implementation/context for reviewed change def replace_recursive(
- [phoenix/python/common/xai-configlib/src/xai_configlib/__init__.py:400–405](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/python/common/xai-configlib/src/xai_configlib/__init__.py#L400-L405) Baseline implementation/context for reviewed change def replace_recursive(
- [phoenix/python/common/xai-configlib/src/xai_configlib/__init__.py:402–428](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/python/common/xai-configlib/src/xai_configlib/__init__.py#L402-L428) Target implementation/context for reviewed change def replace_recursive(
- [phoenix/python/common/xai-configlib/src/xai_configlib/__init__.py:312–324](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/python/common/xai-configlib/src/xai_configlib/__init__.py#L312-L324) replace_cli_subs invokes recursive replacement
- [phoenix/xrex/configs/config_loader.py:52–64](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/config_loader.py#L52-L64) real config CLI consumer checks used overrides

边界：实际CLI/preset覆盖内容未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/python/common/xai-proto/proto/recsys.proto

变化：Python proto与Rust镜像同步新增rewardHead/pageDecoded、广告late-window/leadgen动作与targeting/taxonomy、history聚合枚举；动作44保持编号改名为PostVideo。

影响：constants中的IsPostedVideo消费者与新枚举一致；Home字段生产/读取需独立追踪，不能把schema声明等同模型能力已服务。

关联：research-16、research-25、research-27、research-35。

- [phoenix/python/common/xai-proto/proto/recsys.proto:211–216](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/python/common/xai-proto/proto/recsys.proto#L211-L216) Baseline implementation/context for reviewed change message PageDecodeParams {
- [phoenix/python/common/xai-proto/proto/recsys.proto:211–218](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/python/common/xai-proto/proto/recsys.proto#L211-L218) Target implementation/context for reviewed change message PageDecodeParams {
- [phoenix/python/common/xai-proto/proto/recsys.proto:485–491](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/python/common/xai-proto/proto/recsys.proto#L485-L491) Baseline implementation/context for reviewed change enum ActionName {
- [phoenix/python/common/xai-proto/proto/recsys.proto:487–493](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/python/common/xai-proto/proto/recsys.proto#L487-L493) Target implementation/context for reviewed change enum ActionName {
- [phoenix/python/common/xai-proto/proto/recsys.proto:553–558](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/python/common/xai-proto/proto/recsys.proto#L553-L558) Baseline implementation/context for reviewed change enum ActionName {
- [phoenix/python/common/xai-proto/proto/recsys.proto:555–562](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/python/common/xai-proto/proto/recsys.proto#L555-L562) Target implementation/context for reviewed change enum ActionName {
- [phoenix/python/common/xai-proto/proto/recsys.proto:622–627](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/python/common/xai-proto/proto/recsys.proto#L622-L627) Baseline implementation/context for reviewed change enum ActionName {
- [phoenix/python/common/xai-proto/proto/recsys.proto:626–632](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/python/common/xai-proto/proto/recsys.proto#L626-L632) Target implementation/context for reviewed change enum ActionName {
- [phoenix/python/common/xai-proto/proto/recsys.proto:1492–1497](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/python/common/xai-proto/proto/recsys.proto#L1492-L1497) Baseline implementation/context for reviewed change message ScoreInfo {
- [phoenix/python/common/xai-proto/proto/recsys.proto:1497–1503](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/python/common/xai-proto/proto/recsys.proto#L1497-L1503) Target implementation/context for reviewed change message ScoreInfo {
- [phoenix/python/common/xai-proto/proto/recsys.proto:1708–1713](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/python/common/xai-proto/proto/recsys.proto#L1708-L1713) Baseline implementation/context for reviewed change message AdInfo {
- [phoenix/python/common/xai-proto/proto/recsys.proto:1714–1730](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/python/common/xai-proto/proto/recsys.proto#L1714-L1730) Target implementation/context for reviewed change message AdInfo {
- [phoenix/python/common/xai-proto/proto/recsys.proto:1930–1936](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/python/common/xai-proto/proto/recsys.proto#L1930-L1936) Baseline implementation/context for reviewed change enum UserActionAggregationType {
- [phoenix/python/common/xai-proto/proto/recsys.proto:1947–1954](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/python/common/xai-proto/proto/recsys.proto#L1947-L1954) Target implementation/context for reviewed change enum UserActionAggregationType {
- [home-mixer/scorers/page_decode_rerank_scorer.rs:22–31](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scorers/page_decode_rerank_scorer.rs#L22-L31) Rust proto request producer
- [phoenix/xrex/data/recsys/constants.py:85–89](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/constants.py#L85-L89) action rename consumer

边界：下游generated stubs、服务端rewardHead读取及生产版本未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/configs/data_feeds.py

变化：注册immersive_page_rl_cread训练消费组；各dataset factory传递ads_late_window_heads，聚合和Rust Kafka另传read_ads_engagement_counts，均get默认false。

影响：_make_dataset通过registry选择factory；是否启用由所选配方/覆盖决定，不是所有流都启用广告延迟目标或所有organic帖计数。

关联：research-10、research-27。

- [phoenix/xrex/configs/data_feeds.py:68–73](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/configs/data_feeds.py#L68-L73) Baseline implementation/context for reviewed change GROUP_IDS: dict[str, str] = {
- [phoenix/xrex/configs/data_feeds.py:68–74](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/data_feeds.py#L68-L74) Target implementation/context for reviewed change GROUP_IDS: dict[str, str] = {
- [phoenix/xrex/configs/data_feeds.py:144–150](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/configs/data_feeds.py#L144-L150) Baseline implementation/context for reviewed change def _ranking_aggregated_kafka(mparams, hash_table, use_post_sid, sid_num_levels,
- [phoenix/xrex/configs/data_feeds.py:145–153](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/data_feeds.py#L145-L153) Target implementation/context for reviewed change def _ranking_aggregated_kafka(mparams, hash_table, use_post_sid, sid_num_levels,
- [phoenix/xrex/configs/data_feeds.py:175–181](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/configs/data_feeds.py#L175-L181) Baseline implementation/context for reviewed change def _ranking_rust_kafka(mparams, hash_table, use_post_sid, sid_num_levels, confi
- [phoenix/xrex/configs/data_feeds.py:178–186](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/data_feeds.py#L178-L186) Target implementation/context for reviewed change def _ranking_rust_kafka(mparams, hash_table, use_post_sid, sid_num_levels, confi
- [phoenix/xrex/configs/data_feeds.py:210–215](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/configs/data_feeds.py#L210-L215) Baseline implementation/context for reviewed change def _ranking_kafka_dispatcher(mparams, hash_table, use_post_sid, sid_num_levels,
- [phoenix/xrex/configs/data_feeds.py:215–221](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/data_feeds.py#L215-L221) Target implementation/context for reviewed change def _ranking_kafka_dispatcher(mparams, hash_table, use_post_sid, sid_num_levels,
- [phoenix/xrex/configs/data_feeds.py:233–238](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/configs/data_feeds.py#L233-L238) Baseline implementation/context for reviewed change def _ranking_offline_kafka_dump(mparams, hash_table, use_post_sid, sid_num_level
- [phoenix/xrex/configs/data_feeds.py:239–245](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/data_feeds.py#L239-L245) Target implementation/context for reviewed change def _ranking_offline_kafka_dump(mparams, hash_table, use_post_sid, sid_num_level
- [phoenix/xrex/configs/data_feeds.py:256–261](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/configs/data_feeds.py#L256-L261) Baseline implementation/context for reviewed change def _ranking_rust_parquet(mparams, hash_table, use_post_sid, sid_num_levels, con
- [phoenix/xrex/configs/data_feeds.py:263–269](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/data_feeds.py#L263-L269) Target implementation/context for reviewed change def _ranking_rust_parquet(mparams, hash_table, use_post_sid, sid_num_levels, con
- [phoenix/xrex/configs/data_feeds.py:283–288](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/configs/data_feeds.py#L283-L288) Baseline implementation/context for reviewed change def _ranking_grpc_recsys(mparams, hash_table, use_post_sid, sid_num_levels, conf
- [phoenix/xrex/configs/data_feeds.py:291–297](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/data_feeds.py#L291-L297) Target implementation/context for reviewed change def _ranking_grpc_recsys(mparams, hash_table, use_post_sid, sid_num_levels, conf
- [phoenix/xrex/configs/xrecsys.py:188–211](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/xrecsys.py#L188-L211) dataset factory selection through registry
- [phoenix/xrex/data/streaming/kafkaloader.py:1270–1283](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/streaming/kafkaloader.py#L1270-L1283) flags reach batch converter

边界：运行dataset选择和覆盖未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/configs/xrecsys.py

变化：新增immersive_page_rl_cread配方用cread两项.1替代Tweedie/MAE；home_direct_packed将view loss=.5、time-gap=true/lr4、clip1.4、embedding WD5.6e-4/window37/SR及三类LR缩放.25；新增多项可选模型/dataset开关并更换H100 remat。

影响：这是具体训练配方与mparams接线，不是Home价值融合系数；泛型开关默认false/0/1，home_direct_packed是明确局部覆盖且不扩散到GB300/nano。可建议补机制说明，但OP01–10无新确定性写法。

关联：research-09、research-10、research-16、research-35、OP02、OP09。

- [phoenix/xrex/configs/xrecsys.py:207–212](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/configs/xrecsys.py#L207-L212) Baseline implementation/context for reviewed change def _make_dataset(
- [phoenix/xrex/configs/xrecsys.py:207–213](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/xrecsys.py#L207-L213) Target implementation/context for reviewed change def _make_dataset(
- [phoenix/xrex/configs/xrecsys.py:226–231](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/configs/xrecsys.py#L226-L231) Baseline implementation/context for reviewed change def _make_dataset(
- [phoenix/xrex/configs/xrecsys.py:227–233](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/xrecsys.py#L227-L233) Target implementation/context for reviewed change def _make_dataset(
- [phoenix/xrex/configs/xrecsys.py:243–248](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/configs/xrecsys.py#L243-L248) Baseline implementation/context for reviewed change def _make_dataset(
- [phoenix/xrex/configs/xrecsys.py:245–251](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/xrecsys.py#L245-L251) Target implementation/context for reviewed change def _make_dataset(
- [phoenix/xrex/configs/xrecsys.py:334–340](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/configs/xrecsys.py#L334-L340) Baseline implementation/context for reviewed change _H100_OVERRIDES = {
- [phoenix/xrex/configs/xrecsys.py:337–343](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/xrecsys.py#L337-L343) Target implementation/context for reviewed change _H100_OVERRIDES = {
- [phoenix/xrex/configs/xrecsys.py:418–423](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/configs/xrecsys.py#L418-L423) Baseline implementation/context for reviewed change def _immersive_page_rl() -> dict:
- [phoenix/xrex/configs/xrecsys.py:421–438](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/xrecsys.py#L421-L438) Target implementation/context for reviewed change def _immersive_page_rl() -> dict:
- [phoenix/xrex/configs/xrecsys.py:471–476](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/configs/xrecsys.py#L471-L476) Baseline implementation/context for reviewed change MODEL_CFGS = {
- [phoenix/xrex/configs/xrecsys.py:486–509](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/xrecsys.py#L486-L509) Target implementation/context for reviewed change MODEL_CFGS = {
- [phoenix/xrex/configs/xrecsys.py:491–496](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/configs/xrecsys.py#L491-L496) Baseline implementation/context for reviewed change MODEL_CFGS = {
- [phoenix/xrex/configs/xrecsys.py:524–536](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/xrecsys.py#L524-L536) Target implementation/context for reviewed change MODEL_CFGS = {
- [phoenix/xrex/configs/xrecsys.py:667–673](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/configs/xrecsys.py#L667-L673) Baseline implementation/context for reviewed change def make_trainer(config_name: str, mparams: dict, dataset_type: str) -> RecsysTr
- [phoenix/xrex/configs/xrecsys.py:707–713](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/xrecsys.py#L707-L713) Target implementation/context for reviewed change def make_trainer(config_name: str, mparams: dict, dataset_type: str) -> RecsysTr
- [phoenix/xrex/configs/xrecsys.py:719–724](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/configs/xrecsys.py#L719-L724) Baseline implementation/context for reviewed change def make_trainer(config_name: str, mparams: dict, dataset_type: str) -> RecsysTr
- [phoenix/xrex/configs/xrecsys.py:759–766](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/xrecsys.py#L759-L766) Target implementation/context for reviewed change def make_trainer(config_name: str, mparams: dict, dataset_type: str) -> RecsysTr
- [phoenix/xrex/configs/xrecsys.py:727–733](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/configs/xrecsys.py#L727-L733) Baseline implementation/context for reviewed change def make_trainer(config_name: str, mparams: dict, dataset_type: str) -> RecsysTr
- [phoenix/xrex/configs/xrecsys.py:769–778](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/xrecsys.py#L769-L778) Target implementation/context for reviewed change def make_trainer(config_name: str, mparams: dict, dataset_type: str) -> RecsysTr
- [phoenix/xrex/configs/xrecsys.py:740–745](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/configs/xrecsys.py#L740-L745) Baseline implementation/context for reviewed change def make_trainer(config_name: str, mparams: dict, dataset_type: str) -> RecsysTr
- [phoenix/xrex/configs/xrecsys.py:785–791](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/xrecsys.py#L785-L791) Target implementation/context for reviewed change def make_trainer(config_name: str, mparams: dict, dataset_type: str) -> RecsysTr
- [phoenix/xrex/configs/xrecsys.py:946–951](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/configs/xrecsys.py#L946-L951) Baseline implementation/context for reviewed change def make_trainer(config_name: str, mparams: dict, dataset_type: str) -> RecsysTr
- [phoenix/xrex/configs/xrecsys.py:992–1000](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/xrecsys.py#L992-L1000) Target implementation/context for reviewed change def make_trainer(config_name: str, mparams: dict, dataset_type: str) -> RecsysTr
- [phoenix/xrex/models/recsys_model.py:5003–5012](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L5003-L5012) view weight consumed in training loss mask
- [phoenix/xrex/models/recsys_feature_prep.py:1026–1041](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_feature_prep.py#L1026-L1041) time gap feature consumer
- [phoenix/xrex/configs/xrecsys.py:597–606](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/xrecsys.py#L597-L606) registry extension and config combinations

边界：部署模型、训练checkpoint、registry扩展和CLI覆盖未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/cuda/async_emb/async_emb.py

变化：async_emb Python lazy Adagrad FFI新增weight_decay_exempt_window=0与stochastic_rounding=False属性。

影响：optimizer经kernel_bindings选择此后端并传参数；默认保持原路径，改变训练数值更新而非推理排名系数。

关联：无直接运营动作。

- [phoenix/xrex/cuda/async_emb/async_emb.py:253–258](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/cuda/async_emb/async_emb.py#L253-L258) Baseline implementation/context for reviewed change def rowwise_adagrad_lazy_update_start(
- [phoenix/xrex/cuda/async_emb/async_emb.py:253–260](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/async_emb/async_emb.py#L253-L260) Target implementation/context for reviewed change def rowwise_adagrad_lazy_update_start(
- [phoenix/xrex/cuda/async_emb/async_emb.py:276–281](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/cuda/async_emb/async_emb.py#L276-L281) Baseline implementation/context for reviewed change def rowwise_adagrad_lazy_update_start(
- [phoenix/xrex/cuda/async_emb/async_emb.py:278–285](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/async_emb/async_emb.py#L278-L285) Target implementation/context for reviewed change def rowwise_adagrad_lazy_update_start(
- [phoenix/xrex/optimizers/recsys/rowwise_adagrad.py:127–174](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/optimizers/recsys/rowwise_adagrad.py#L127-L174) optimizer dispatches to selected backend

边界：生产后端、参数覆盖与数值效果未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/cuda/async_emb/src/async_emb_api.cc

变化：async CUDA API扩展AdagradParams初始化，读取并校验exempt窗口有限非负，传随机舍入flag及rank×shard_width列偏移。

影响：Python FFI调用与kernel消费者匹配；非lazy/warmup显式零值保持旧行为，不产生用户可触发的奖励阈值。

关联：无直接运营动作。

- [phoenix/xrex/cuda/async_emb/src/async_emb_api.cc:300–306](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/cuda/async_emb/src/async_emb_api.cc#L300-L306) Baseline implementation/context for reviewed change ffi::Error initializeRowwiseAdagrad(
- [phoenix/xrex/cuda/async_emb/src/async_emb_api.cc:300–306](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/async_emb/src/async_emb_api.cc#L300-L306) Target implementation/context for reviewed change ffi::Error initializeRowwiseAdagrad(
- [phoenix/xrex/cuda/async_emb/src/async_emb_api.cc:392–398](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/cuda/async_emb/src/async_emb_api.cc#L392-L398) Baseline implementation/context for reviewed change ffi::Error RowwiseAdagradUpdateStart(
- [phoenix/xrex/cuda/async_emb/src/async_emb_api.cc:392–400](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/async_emb/src/async_emb_api.cc#L392-L400) Target implementation/context for reviewed change ffi::Error RowwiseAdagradUpdateStart(
- [phoenix/xrex/cuda/async_emb/src/async_emb_api.cc:447–463](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/cuda/async_emb/src/async_emb_api.cc#L447-L463) Baseline implementation/context for reviewed change ffi::Error RowwiseAdagradLazyUpdateStart(
- [phoenix/xrex/cuda/async_emb/src/async_emb_api.cc:449–469](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/async_emb/src/async_emb_api.cc#L449-L469) Target implementation/context for reviewed change ffi::Error RowwiseAdagradLazyUpdateStart(
- [phoenix/xrex/cuda/async_emb/src/async_emb_api.cc:481–487](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/cuda/async_emb/src/async_emb_api.cc#L481-L487) Baseline implementation/context for reviewed change ffi::Error RowwiseAdagradLazyUpdateStart(
- [phoenix/xrex/cuda/async_emb/src/async_emb_api.cc:487–502](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/async_emb/src/async_emb_api.cc#L487-L502) Target implementation/context for reviewed change ffi::Error RowwiseAdagradLazyUpdateStart(
- [phoenix/xrex/cuda/async_emb/async_emb.py:253–284](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/async_emb/async_emb.py#L253-L284) Python producer of FFI attrs
- [phoenix/xrex/cuda/async_emb/src/async_emb_kernel.cu:444–497](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/async_emb/src/async_emb_kernel.cu#L444-L497) kernel consumes window and random rounding

边界：实际编译内核版本和运行参数未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/cuda/async_emb/src/async_emb_kernel.cu

变化：async CUDA kernel新增hash式BF16随机舍入；lazy非零梯度且delta>exempt窗口才衰减，随机路径单次float合成后舍入，未启用时保留旧BF16中间舍入。

影响：窗口是embedding行更新步数，不是账号新用户期或帖子发布窗口；启用会改变训练数值，不能保证对任意帖加分。

关联：无直接运营动作。

- [phoenix/xrex/cuda/async_emb/src/async_emb_kernel.cu:65–70](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/cuda/async_emb/src/async_emb_kernel.cu#L65-L70) Baseline implementation/context for reviewed change __device__ __forceinline__ bool segment_in_range(int32_t segment, int64_t num_un
- [phoenix/xrex/cuda/async_emb/src/async_emb_kernel.cu:65–85](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/async_emb/src/async_emb_kernel.cu#L65-L85) Target implementation/context for reviewed change __device__ __forceinline__ bool segment_in_range(int32_t segment, int64_t num_un
- [phoenix/xrex/cuda/async_emb/src/async_emb_kernel.cu:429–435](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/cuda/async_emb/src/async_emb_kernel.cu#L429-L435) Baseline implementation/context for reviewed change __global__ void rowwise_adagrad_apply(
- [phoenix/xrex/cuda/async_emb/src/async_emb_kernel.cu:444–452](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/async_emb/src/async_emb_kernel.cu#L444-L452) Target implementation/context for reviewed change __global__ void rowwise_adagrad_apply(
- [phoenix/xrex/cuda/async_emb/src/async_emb_kernel.cu:457–465](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/cuda/async_emb/src/async_emb_kernel.cu#L457-L465) Baseline implementation/context for reviewed change __global__ void rowwise_adagrad_apply(
- [phoenix/xrex/cuda/async_emb/src/async_emb_kernel.cu:474–495](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/async_emb/src/async_emb_kernel.cu#L474-L495) Target implementation/context for reviewed change __global__ void rowwise_adagrad_apply(
- [phoenix/xrex/cuda/async_emb/src/async_emb_api.cc:449–502](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/async_emb/src/async_emb_api.cc#L449-L502) API validates and supplies kernel parameters

边界：训练统计效果、权重与实际启用未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/cuda/async_emb/src/async_emb_kernel.hpp

变化：async AdagradParams结构增加exempt窗口、随机舍入flag和列偏移。

影响：与API构造、kernel读取成套ABI变化；结构本身无新排序或运营政策。

关联：无直接运营动作。

- [phoenix/xrex/cuda/async_emb/src/async_emb_kernel.hpp:23–28](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/cuda/async_emb/src/async_emb_kernel.hpp#L23-L28) Baseline implementation/context for reviewed change struct AdagradParams {
- [phoenix/xrex/cuda/async_emb/src/async_emb_kernel.hpp:23–31](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/async_emb/src/async_emb_kernel.hpp#L23-L31) Target implementation/context for reviewed change struct AdagradParams {
- [phoenix/xrex/cuda/async_emb/src/async_emb_api.cc:487–501](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/async_emb/src/async_emb_api.cc#L487-L501) struct initializer
- [phoenix/xrex/cuda/async_emb/src/async_emb_kernel.cu:444–497](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/async_emb/src/async_emb_kernel.cu#L444-L497) kernel consumer

边界：部署二进制与Python包装版本同步未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/cuda/row_emb/row_emb.py

变化：row_emb Python lazy更新新增窗口/随机舍入参数；非默认请求要求native capability标记，否则明确抛错。

影响：防止旧kernel静默忽略新优化器选项；kernel_bindings在row-sharded上下文选择此实现，不改内容资格规则。

关联：无直接运营动作。

- [phoenix/xrex/cuda/row_emb/row_emb.py:249–256](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/cuda/row_emb/row_emb.py#L249-L256) Baseline implementation/context for reviewed change def rowwise_adagrad_lazy_update_start(
- [phoenix/xrex/cuda/row_emb/row_emb.py:249–265](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/row_emb/row_emb.py#L249-L265) Target implementation/context for reviewed change def rowwise_adagrad_lazy_update_start(
- [phoenix/xrex/cuda/row_emb/row_emb.py:272–277](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/cuda/row_emb/row_emb.py#L272-L277) Baseline implementation/context for reviewed change def rowwise_adagrad_lazy_update_start(
- [phoenix/xrex/cuda/row_emb/row_emb.py:281–288](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/row_emb/row_emb.py#L281-L288) Target implementation/context for reviewed change def rowwise_adagrad_lazy_update_start(
- [phoenix/xrex/utils/recsys_async_emb.py:33–41](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/utils/recsys_async_emb.py#L33-L41) row-sharded backend dispatcher
- [phoenix/xrex/optimizers/recsys/rowwise_adagrad.py:127–174](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/optimizers/recsys/rowwise_adagrad.py#L127-L174) optimizer invokes selected API

边界：部署内核版本及后端选择未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/cuda/row_emb/src/row_emb_api.cc

变化：row CUDA API扩展参数读取/非负有限校验、warmup/nonlazy零初始化，导出支持窗口和随机舍入的capability常量。

影响：供Python版本gate和row kernel实际消费，属于训练实现同步而非新Home权重。

关联：无直接运营动作。

- [phoenix/xrex/cuda/row_emb/src/row_emb_api.cc:299–305](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/cuda/row_emb/src/row_emb_api.cc#L299-L305) Baseline implementation/context for reviewed change ffi::Error initializeRowwiseAdagrad(
- [phoenix/xrex/cuda/row_emb/src/row_emb_api.cc:299–305](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/row_emb/src/row_emb_api.cc#L299-L305) Target implementation/context for reviewed change ffi::Error initializeRowwiseAdagrad(
- [phoenix/xrex/cuda/row_emb/src/row_emb_api.cc:382–388](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/cuda/row_emb/src/row_emb_api.cc#L382-L388) Baseline implementation/context for reviewed change ffi::Error RowwiseAdagradUpdateStart(
- [phoenix/xrex/cuda/row_emb/src/row_emb_api.cc:382–390](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/row_emb/src/row_emb_api.cc#L382-L390) Target implementation/context for reviewed change ffi::Error RowwiseAdagradUpdateStart(
- [phoenix/xrex/cuda/row_emb/src/row_emb_api.cc:437–453](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/cuda/row_emb/src/row_emb_api.cc#L437-L453) Baseline implementation/context for reviewed change ffi::Error RowwiseAdagradLazyUpdateStart(
- [phoenix/xrex/cuda/row_emb/src/row_emb_api.cc:439–459](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/row_emb/src/row_emb_api.cc#L439-L459) Target implementation/context for reviewed change ffi::Error RowwiseAdagradLazyUpdateStart(
- [phoenix/xrex/cuda/row_emb/src/row_emb_api.cc:471–477](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/cuda/row_emb/src/row_emb_api.cc#L471-L477) Baseline implementation/context for reviewed change ffi::Error RowwiseAdagradLazyUpdateStart(
- [phoenix/xrex/cuda/row_emb/src/row_emb_api.cc:477–491](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/row_emb/src/row_emb_api.cc#L477-L491) Target implementation/context for reviewed change ffi::Error RowwiseAdagradLazyUpdateStart(
- [phoenix/xrex/cuda/row_emb/src/row_emb_api.cc:715–720](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/cuda/row_emb/src/row_emb_api.cc#L715-L720) Baseline implementation/context for reviewed change nb::bytes testSnapshot(int64_t context_id, const std::string& region) {
- [phoenix/xrex/cuda/row_emb/src/row_emb_api.cc:729–735](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/row_emb/src/row_emb_api.cc#L729-L735) Target implementation/context for reviewed change nb::bytes testSnapshot(int64_t context_id, const std::string& region) {
- [phoenix/xrex/cuda/row_emb/row_emb.py:249–288](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/row_emb/row_emb.py#L249-L288) Python capability check and FFI producer
- [phoenix/xrex/cuda/row_emb/src/row_emb_kernel.cu:423–454](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/row_emb/src/row_emb_kernel.cu#L423-L454) kernel consumer

边界：实际加载二进制版本未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/cuda/row_emb/src/row_emb_comm.cc

变化：row通信warmup的AdagradParams聚合初始化补两个零参数。

影响：只保持预热内核ABI兼容；真实训练值来自API调用，无运营规则变化。

关联：无直接运营动作。

- [phoenix/xrex/cuda/row_emb/src/row_emb_comm.cc:94–100](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/cuda/row_emb/src/row_emb_comm.cc#L94-L100) Baseline implementation/context for reviewed change void warmupKernels(int8_t* scratch, cudaStream_t stream) {
- [phoenix/xrex/cuda/row_emb/src/row_emb_comm.cc:94–100](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/row_emb/src/row_emb_comm.cc#L94-L100) Target implementation/context for reviewed change void warmupKernels(int8_t* scratch, cudaStream_t stream) {
- [phoenix/xrex/cuda/row_emb/src/row_emb_comm.cc:58–101](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/row_emb/src/row_emb_comm.cc#L58-L101) warmup kernel context

边界：编译/部署状态未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/cuda/row_emb/src/row_emb_kernel.cu

变化：row kernel添加确定性hash随机BF16舍入与lazy decay exempt窗口判断；全局row、列、step参与随机值，旧非随机路径保留。

影响：与Python参考和async分片路径意图一致；改变启用后的数值轨迹，不是内容多样性/账号处罚随机化。

关联：无直接运营动作。

- [phoenix/xrex/cuda/row_emb/src/row_emb_kernel.cu:370–375](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/cuda/row_emb/src/row_emb_kernel.cu#L370-L375) Baseline implementation/context for reviewed change __global__ void owner_reduce_rows_kernel(
- [phoenix/xrex/cuda/row_emb/src/row_emb_kernel.cu:370–388](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/row_emb/src/row_emb_kernel.cu#L370-L388) Target implementation/context for reviewed change __global__ void owner_reduce_rows_kernel(
- [phoenix/xrex/cuda/row_emb/src/row_emb_kernel.cu:410–416](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/cuda/row_emb/src/row_emb_kernel.cu#L410-L416) Baseline implementation/context for reviewed change __global__ void rowwise_adagrad_apply_kernel(
- [phoenix/xrex/cuda/row_emb/src/row_emb_kernel.cu:423–431](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/row_emb/src/row_emb_kernel.cu#L423-L431) Target implementation/context for reviewed change __global__ void rowwise_adagrad_apply_kernel(
- [phoenix/xrex/cuda/row_emb/src/row_emb_kernel.cu:422–430](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/cuda/row_emb/src/row_emb_kernel.cu#L422-L430) Baseline implementation/context for reviewed change __global__ void rowwise_adagrad_apply_kernel(
- [phoenix/xrex/cuda/row_emb/src/row_emb_kernel.cu:437–452](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/row_emb/src/row_emb_kernel.cu#L437-L452) Target implementation/context for reviewed change __global__ void rowwise_adagrad_apply_kernel(
- [phoenix/xrex/cuda/row_emb/src/row_emb_api.cc:439–490](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/row_emb/src/row_emb_api.cc#L439-L490) actual update parameter producer

边界：跨后端数值一致性未运行验证、生产模型未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/cuda/row_emb/src/row_emb_kernel.hpp

变化：row AdagradParams增加float窗口与int随机舍入开关。

影响：对应row API/kernel/warmup结构字段；不改变公开互动价值权重。

关联：无直接运营动作。

- [phoenix/xrex/cuda/row_emb/src/row_emb_kernel.hpp:32–37](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/cuda/row_emb/src/row_emb_kernel.hpp#L32-L37) Baseline implementation/context for reviewed change struct AdagradParams {
- [phoenix/xrex/cuda/row_emb/src/row_emb_kernel.hpp:32–39](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/row_emb/src/row_emb_kernel.hpp#L32-L39) Target implementation/context for reviewed change struct AdagradParams {
- [phoenix/xrex/cuda/row_emb/src/row_emb_api.cc:477–490](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/row_emb/src/row_emb_api.cc#L477-L490) struct producer
- [phoenix/xrex/cuda/row_emb/src/row_emb_kernel.cu:423–454](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/cuda/row_emb/src/row_emb_kernel.cu#L423-L454) struct consumer

边界：构建版本一致性未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/data/parquet_recsys.py

变化：Parquet reader新增预读、read-ahead、block lookahead；支持shards大于partitions时等份交错行切分；明确end_batch_id及单向扩展、数据终点probe；计步按行分片调整，padding/dataset传入ads桶与late-window选项。

影响：训练样本读序、尾部丢弃和终点控制变化，需匹配trainer follow gate；不是线上候选采样/曝光配额。广告选项默认false，新增bucket随训练batch传递。

关联：research-25、research-27。

- [phoenix/xrex/data/parquet_recsys.py:49–54](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L49-L54) Baseline implementation/context for reviewed change from xrex.data.recsys.array_allocator import ArrayAllocator
- [phoenix/xrex/data/parquet_recsys.py:49–55](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L49-L55) Target implementation/context for reviewed change from xrex.data.recsys.array_allocator import ArrayAllocator
- [phoenix/xrex/data/parquet_recsys.py:279–284](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L279-L284) Baseline implementation/context for reviewed change class LazyRecordBatchIterator:
- [phoenix/xrex/data/parquet_recsys.py:280–325](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L280-L325) Target implementation/context for reviewed change class LazyRecordBatchIterator:
- [phoenix/xrex/data/parquet_recsys.py:387–392](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L387-L392) Baseline implementation/context for reviewed change def _block_shuffle_order(
- [phoenix/xrex/data/parquet_recsys.py:428–445](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L428-L445) Target implementation/context for reviewed change def _block_shuffle_order(
- [phoenix/xrex/data/parquet_recsys.py:762–767](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L762-L767) Baseline implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:815–821](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L815-L821) Target implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:815–821](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L815-L821) Baseline implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:869–875](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L869-L875) Target implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:859–864](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L859-L864) Baseline implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:913–934](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L913-L934) Target implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:874–880](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L874-L880) Baseline implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:944–950](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L944-L950) Target implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:882–888](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L882-L888) Baseline implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:952–964](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L952-L964) Target implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:1026–1032](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L1026-L1032) Baseline implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:1102–1108](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L1102-L1108) Target implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:1076–1082](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L1076-L1082) Baseline implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:1152–1159](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L1152-L1159) Target implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:1085–1100](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L1085-L1100) Baseline implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:1162–1179](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L1162-L1179) Target implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:1103–1108](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L1103-L1108) Baseline implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:1182–1197](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L1182-L1197) Target implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:1131–1136](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L1131-L1136) Baseline implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:1220–1226](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L1220-L1226) Target implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:1161–1166](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L1161-L1166) Baseline implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:1251–1257](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L1251-L1257) Target implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:1193–1199](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L1193-L1199) Baseline implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:1284–1292](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L1284-L1292) Target implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:1201–1206](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L1201-L1206) Baseline implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:1294–1300](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L1294-L1300) Target implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:1319–1325](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L1319-L1325) Baseline implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:1413–1419](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L1413-L1419) Target implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:1361–1368](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L1361-L1368) Baseline implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:1455–1468](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L1455-L1468) Target implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:1445–1457](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L1445-L1457) Baseline implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:1545–1575](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L1545-L1575) Target implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:1463–1480](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L1463-L1480) Baseline implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:1581–1617](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L1581-L1617) Target implementation/context for reviewed change class InterleavingRecordBatchProvider:
- [phoenix/xrex/data/parquet_recsys.py:1663–1668](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L1663-L1668) Baseline implementation/context for reviewed change def pad_batch(batch_unpadded: RecsysFeaturesBatch, batch_size: int) -> RecsysFea
- [phoenix/xrex/data/parquet_recsys.py:1800–1807](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L1800-L1807) Target implementation/context for reviewed change def pad_batch(batch_unpadded: RecsysFeaturesBatch, batch_size: int) -> RecsysFea
- [phoenix/xrex/data/parquet_recsys.py:1800–1806](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L1800-L1806) Baseline implementation/context for reviewed change class PhoenixDataset(Dataset):
- [phoenix/xrex/data/parquet_recsys.py:1939–1947](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L1939-L1947) Target implementation/context for reviewed change class PhoenixDataset(Dataset):
- [phoenix/xrex/data/parquet_recsys.py:1863–1873](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L1863-L1873) Baseline implementation/context for reviewed change class PhoenixDataset(Dataset):
- [phoenix/xrex/data/parquet_recsys.py:2004–2019](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L2004-L2019) Target implementation/context for reviewed change class PhoenixDataset(Dataset):
- [phoenix/xrex/data/parquet_recsys.py:1876–1889](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L1876-L1889) Baseline implementation/context for reviewed change class PhoenixDataset(Dataset):
- [phoenix/xrex/data/parquet_recsys.py:2022–2038](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L2022-L2038) Target implementation/context for reviewed change class PhoenixDataset(Dataset):
- [phoenix/xrex/data/parquet_recsys.py:1894–1900](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L1894-L1900) Baseline implementation/context for reviewed change class PhoenixDataset(Dataset):
- [phoenix/xrex/data/parquet_recsys.py:2043–2055](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L2043-L2055) Target implementation/context for reviewed change class PhoenixDataset(Dataset):
- [phoenix/xrex/data/parquet_recsys.py:1950–1964](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L1950-L1964) Baseline implementation/context for reviewed change class PhoenixDataset(Dataset):
- [phoenix/xrex/data/parquet_recsys.py:2105–2122](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L2105-L2122) Target implementation/context for reviewed change class PhoenixDataset(Dataset):
- [phoenix/xrex/data/parquet_recsys.py:1971–1977](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L1971-L1977) Baseline implementation/context for reviewed change class PhoenixDataset(Dataset):
- [phoenix/xrex/data/parquet_recsys.py:2129–2135](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L2129-L2135) Target implementation/context for reviewed change class PhoenixDataset(Dataset):
- [phoenix/xrex/data/parquet_recsys.py:1993–2009](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L1993-L2009) Baseline implementation/context for reviewed change class PhoenixDataset(Dataset):
- [phoenix/xrex/data/parquet_recsys.py:2151–2168](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L2151-L2168) Target implementation/context for reviewed change class PhoenixDataset(Dataset):
- [phoenix/xrex/data/parquet_recsys.py:2025–2030](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L2025-L2030) Baseline implementation/context for reviewed change class PhoenixDataset(Dataset):
- [phoenix/xrex/data/parquet_recsys.py:2184–2232](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L2184-L2232) Target implementation/context for reviewed change class PhoenixDataset(Dataset):
- [phoenix/xrex/data/parquet_recsys.py:2048–2053](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L2048-L2053) Baseline implementation/context for reviewed change class PhoenixDataset(Dataset):
- [phoenix/xrex/data/parquet_recsys.py:2250–2256](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L2250-L2256) Target implementation/context for reviewed change class PhoenixDataset(Dataset):
- [phoenix/xrex/data/parquet_recsys.py:2100–2110](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L2100-L2110) Baseline implementation/context for reviewed change class PhoenixDataset(Dataset):
- [phoenix/xrex/data/parquet_recsys.py:2303–2316](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L2303-L2316) Target implementation/context for reviewed change class PhoenixDataset(Dataset):
- [phoenix/xrex/data/parquet_recsys.py:2171–2176](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L2171-L2176) Baseline implementation/context for reviewed change class PhoenixDataset(Dataset):
- [phoenix/xrex/data/parquet_recsys.py:2377–2383](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L2377-L2383) Target implementation/context for reviewed change class PhoenixDataset(Dataset):
- [phoenix/xrex/data/parquet_recsys.py:2266–2275](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L2266-L2275) Baseline implementation/context for reviewed change class PhoenixDataset(Dataset):
- [phoenix/xrex/data/parquet_recsys.py:2473–2484](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L2473-L2484) Target implementation/context for reviewed change class PhoenixDataset(Dataset):
- [phoenix/xrex/data/parquet_recsys.py:2557–2562](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys.py#L2557-L2562) Baseline implementation/context for reviewed change class PhoenixDataset(Dataset):
- [phoenix/xrex/data/parquet_recsys.py:2766–2775](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L2766-L2775) Target implementation/context for reviewed change class PhoenixDataset(Dataset):
- [phoenix/xrex/train/trainer_recsys.py:1317–1350](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/train/trainer_recsys.py#L1317-L1350) follow mode validation and counting integration
- [phoenix/xrex/data/recsys/recsys_batch.py:1677–1684](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/recsys_batch.py#L1677-L1684) count reading produces model input

边界：运行数据分片配置、实际样本内容和训练结果未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/data/parquet_recsys_metadata.py

变化：remaining_steps_from_manifest按batch_size×shards_per_partition计整批、按分片后尾行决定保留；新增batch_start_time_ms访问器。

影响：计步消费者是PhoenixDataset.compute_max_steps；属于训练数据完整度/停训时机，不是帖子生命周期或推荐窗口。

关联：无直接运营动作。

- [phoenix/xrex/data/parquet_recsys_metadata.py:223–232](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys_metadata.py#L223-L232) Baseline implementation/context for reviewed change def remaining_steps_from_manifest(
- [phoenix/xrex/data/parquet_recsys_metadata.py:223–234](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys_metadata.py#L223-L234) Target implementation/context for reviewed change def remaining_steps_from_manifest(
- [phoenix/xrex/data/parquet_recsys_metadata.py:260–265](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/parquet_recsys_metadata.py#L260-L265) Baseline implementation/context for reviewed change def _batch_timestamps(
- [phoenix/xrex/data/parquet_recsys_metadata.py:262–271](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys_metadata.py#L262-L271) Target implementation/context for reviewed change def _batch_timestamps(
- [phoenix/xrex/data/parquet_recsys.py:2148–2164](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L2148-L2164) manifest remaining step consumer

边界：manifest实际数据与使用batch_start_time_ms的外部调用未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/data/recsys/ads_head_masking.py

变化：新增fresh leadgen点击条件与各head自有metric slice映射；late-window stream=3不再被归为early；启用late heads时分别建立fresh负样本及late-window正样本mask。

影响：build_trained_candidate_mask由from_record_batch消费，metric映射由model/trainer消费；ads_head_masking=false先返回原keep广播。模型训练目标不能当自然帖已发生互动的积分。

关联：research-09、research-27。

- [phoenix/xrex/data/recsys/ads_head_masking.py:6–20](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/recsys/ads_head_masking.py#L6-L20) Baseline implementation/context for reviewed change import numpy as np
- [phoenix/xrex/data/recsys/ads_head_masking.py:6–24](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/ads_head_masking.py#L6-L24) Target implementation/context for reviewed change import numpy as np
- [phoenix/xrex/data/recsys/ads_head_masking.py:26–37](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/recsys/ads_head_masking.py#L26-L37) Baseline implementation/context for reviewed change EARLY_RELABEL_STREAM_ID = 1
- [phoenix/xrex/data/recsys/ads_head_masking.py:30–73](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/ads_head_masking.py#L30-L73) Target implementation/context for reviewed change EARLY_RELABEL_STREAM_ID = 1
- [phoenix/xrex/data/recsys/ads_head_masking.py:45–50](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/recsys/ads_head_masking.py#L45-L50) Baseline implementation/context for reviewed change def build_trained_candidate_mask(
- [phoenix/xrex/data/recsys/ads_head_masking.py:81–87](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/ads_head_masking.py#L81-L87) Target implementation/context for reviewed change def build_trained_candidate_mask(
- [phoenix/xrex/data/recsys/ads_head_masking.py:59–90](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/recsys/ads_head_masking.py#L59-L90) Baseline implementation/context for reviewed change def build_trained_candidate_mask(
- [phoenix/xrex/data/recsys/ads_head_masking.py:96–138](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/ads_head_masking.py#L96-L138) Target implementation/context for reviewed change def build_trained_candidate_mask(
- [phoenix/xrex/data/recsys/recsys_batch.py:1587–1597](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/recsys_batch.py#L1587-L1597) training mask consumer
- [phoenix/xrex/models/recsys_model.py:2533–2585](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L2533-L2585) metrics grouping consumes head mask map
- [phoenix/xrex/train/trainer_recsys.py:715–740](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/train/trainer_recsys.py#L715-L740) EMA metric key consumer

边界：实际流源分布与训练开关未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/data/recsys/ads_late_window.py

变化：新增stream3的open-link/long-dwell迟到label，要求新事件且early counterpart未发生；缺early输入则清零。新增raw b截断[0,.5]再b/(1-b)、p_early+(1-p_early)×p_late组合及log更新。

影响：标签处理由batch读取调用，组合仅serve_late_window_composed开启在runner/export调用，默认false；不得把训练校正算式推广成全部Home权重或固定曝光收益。

关联：research-09、research-10、research-27。

- [phoenix/xrex/data/recsys/ads_late_window.py:1–5](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/recsys/ads_late_window.py#L1-L5) Baseline implementation/context for reviewed change
- [phoenix/xrex/data/recsys/ads_late_window.py:1–8](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/ads_late_window.py#L1-L8) Target implementation/context for reviewed change
- [phoenix/xrex/data/recsys/ads_late_window.py:42–44](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/recsys/ads_late_window.py#L42-L44) Baseline implementation/context for reviewed change ADS_LATE_WINDOW_TWIN_SUPPRESSOR = {
- [phoenix/xrex/data/recsys/ads_late_window.py:45–97](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/ads_late_window.py#L45-L97) Target implementation/context for reviewed change ADS_LATE_WINDOW_TWIN_SUPPRESSOR = {
- [phoenix/xrex/data/recsys/recsys_batch.py:935–951](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/recsys_batch.py#L935-L951) late label call under flag
- [phoenix/xrex/inference/model_runner.py:4464–4473](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/inference/model_runner.py#L4464-L4473) serving probability consumer under explicit flag

边界：生产开关、已训练twin heads和真实延迟窗口时长未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/data/recsys/constants.py

变化：IsReactedWithVideo/ServerTweetReactWithVideo改IsPostedVideo/ServerTweetPostVideo；新增leadgen engagement/点击条件族；view loss族为recap dwelled、not dwelled、video quality view。

影响：新名称与proto动作44配对，view族被训练loss mask消费；没有据此更改Home VQV或dwell融合权重。旧ReactWithVideo含义不能继续当新标签名。

关联：research-09、research-10、OP09。

- [phoenix/xrex/data/recsys/constants.py:83–90](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/recsys/constants.py#L83-L90) Baseline implementation/context for reviewed change primary_engagement_to_action_types = {
- [phoenix/xrex/data/recsys/constants.py:83–90](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/constants.py#L83-L90) Target implementation/context for reviewed change primary_engagement_to_action_types = {
- [phoenix/xrex/data/recsys/constants.py:296–301](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/recsys/constants.py#L296-L301) Baseline implementation/context for reviewed change ads_p_conv_click_engagement_to_action_types = {
- [phoenix/xrex/data/recsys/constants.py:296–304](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/constants.py#L296-L304) Target implementation/context for reviewed change ads_p_conv_click_engagement_to_action_types = {
- [phoenix/xrex/data/recsys/constants.py:494–499](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/recsys/constants.py#L494-L499) Baseline implementation/context for reviewed change CLICK_CONDITIONED_ACTION_INDICES = [
- [phoenix/xrex/data/recsys/constants.py:497–506](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/constants.py#L497-L506) Target implementation/context for reviewed change CLICK_CONDITIONED_ACTION_INDICES = [
- [phoenix/xrex/data/recsys/constants.py:543–548](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/recsys/constants.py#L543-L548) Baseline implementation/context for reviewed change MACT_IN_APP_LOSS_ACTION_INDICES = [
- [phoenix/xrex/data/recsys/constants.py:550–561](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/constants.py#L550-L561) Target implementation/context for reviewed change MACT_IN_APP_LOSS_ACTION_INDICES = [
- [phoenix/xrex/models/recsys_model.py:5003–5012](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L5003-L5012) VIEW_LOSS_ACTION_INDICES loss consumer
- [phoenix/xrex/data/recsys/ads_head_masking.py:104–135](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/ads_head_masking.py#L104-L135) fresh leadgen mask consumer

边界：动作生产端对PostVideo的具体语义和线上label覆盖未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/data/recsys/feature_config.py

变化：Int64布局增加requestTimeSecSeq=15、latestHistoryImpressionTimeSecSeq=16并标computed；新增广告计数7族/8窗/168特征/33桶及earlyAction可选列。

影响：build.rs、batch reader和feature prep共用布局；模型兼容及开关仍必要。窗口是特征聚合而非发布最佳时间或观看次数门槛。

关联：research-04、research-09、research-10、research-27。

- [phoenix/xrex/data/recsys/feature_config.py:68–76](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/recsys/feature_config.py#L68-L76) Baseline implementation/context for reviewed change class Int64Feature(enum.IntEnum):
- [phoenix/xrex/data/recsys/feature_config.py:68–80](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/feature_config.py#L68-L80) Target implementation/context for reviewed change class Int64Feature(enum.IntEnum):
- [phoenix/xrex/data/recsys/feature_config.py:83–88](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/recsys/feature_config.py#L83-L88) Baseline implementation/context for reviewed change ADS_PRODUCT_KEY_HASH_MODULUS = 2_147_483_647
- [phoenix/xrex/data/recsys/feature_config.py:87–105](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/feature_config.py#L87-L105) Target implementation/context for reviewed change ADS_PRODUCT_KEY_HASH_MODULUS = 2_147_483_647
- [phoenix/xrex/data/recsys/feature_config.py:164–169](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/recsys/feature_config.py#L164-L169) Baseline implementation/context for reviewed change OPTIONAL_COLUMNS: list[str] = [
- [phoenix/xrex/data/recsys/feature_config.py:181–187](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/feature_config.py#L181-L187) Target implementation/context for reviewed change OPTIONAL_COLUMNS: list[str] = [
- [phoenix/crates/common/xai-recsys/build.rs:166–198](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/crates/common/xai-recsys/build.rs#L166-L198) Rust layout generation gate
- [phoenix/xrex/data/recsys/recsys_batch.py:727–763](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/recsys_batch.py#L727-L763) bucket schema reader
- [phoenix/xrex/models/recsys_feature_prep.py:1026–1041](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_feature_prep.py#L1026-L1041) time gap consumer

边界：生产数据列可用性、模型布局和特征启用未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/data/recsys/recsys_batch.py

变化：批次读取增加late labels、early counterpart处理、广告计数log2桶及与人工负样本不兼容校验；非reply模式计算最早自身候选请求时间和不晚于请求的最新历史时间并填充int64。

影响：供Python模型特征准备和可选广告侧输入消费；零值区分不了缺失与零计数，时间gap不能误解为帖子年龄或作者发帖频率。训练和Rust输入都排除reply槽位，但空/异常输入行为不能凭静态审查宣称完全一致。

关联：research-04、research-09、research-10、research-27。

- [phoenix/xrex/data/recsys/recsys_batch.py:17–22](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/recsys/recsys_batch.py#L17-L22) Baseline implementation/context for reviewed change from numpy import typing as npt
- [phoenix/xrex/data/recsys/recsys_batch.py:17–28](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/recsys_batch.py#L17-L28) Target implementation/context for reviewed change from numpy import typing as npt
- [phoenix/xrex/data/recsys/recsys_batch.py:28–33](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/recsys/recsys_batch.py#L28-L33) Baseline implementation/context for reviewed change from xrex.data.recsys.constants import (
- [phoenix/xrex/data/recsys/recsys_batch.py:34–42](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/recsys_batch.py#L34-L42) Target implementation/context for reviewed change from xrex.data.recsys.constants import (
- [phoenix/xrex/data/recsys/recsys_batch.py:39–44](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/recsys/recsys_batch.py#L39-L44) Baseline implementation/context for reviewed change from xrex.data.recsys.feature_config import (
- [phoenix/xrex/data/recsys/recsys_batch.py:48–54](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/recsys_batch.py#L48-L54) Target implementation/context for reviewed change from xrex.data.recsys.feature_config import (
- [phoenix/xrex/data/recsys/recsys_batch.py:348–353](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/recsys/recsys_batch.py#L348-L353) Baseline implementation/context for reviewed change class PostSeq(TypedDict):
- [phoenix/xrex/data/recsys/recsys_batch.py:358–364](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/recsys_batch.py#L358-L364) Target implementation/context for reviewed change class PostSeq(TypedDict):
- [phoenix/xrex/data/recsys/recsys_batch.py:713–718](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/recsys/recsys_batch.py#L713-L718) Baseline implementation/context for reviewed change def _warn_once_on_zeroed_history_ads(arrays: history_id_lists.HistoryArrays) ->
- [phoenix/xrex/data/recsys/recsys_batch.py:724–767](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/recsys_batch.py#L724-L767) Target implementation/context for reviewed change def _warn_once_on_zeroed_history_ads(arrays: history_id_lists.HistoryArrays) ->
- [phoenix/xrex/data/recsys/recsys_batch.py:741–755](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/recsys/recsys_batch.py#L741-L755) Baseline implementation/context for reviewed change def from_record_batch(
- [phoenix/xrex/data/recsys/recsys_batch.py:790–812](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/recsys_batch.py#L790-L812) Target implementation/context for reviewed change def from_record_batch(
- [phoenix/xrex/data/recsys/recsys_batch.py:875–880](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/recsys/recsys_batch.py#L875-L880) Baseline implementation/context for reviewed change def from_record_batch(
- [phoenix/xrex/data/recsys/recsys_batch.py:932–953](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/recsys_batch.py#L932-L953) Target implementation/context for reviewed change def from_record_batch(
- [phoenix/xrex/data/recsys/recsys_batch.py:1518–1523](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/recsys/recsys_batch.py#L1518-L1523) Baseline implementation/context for reviewed change def from_record_batch(
- [phoenix/xrex/data/recsys/recsys_batch.py:1591–1597](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/recsys_batch.py#L1591-L1597) Target implementation/context for reviewed change def from_record_batch(
- [phoenix/xrex/data/recsys/recsys_batch.py:1584–1589](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/recsys/recsys_batch.py#L1584-L1589) Baseline implementation/context for reviewed change def from_record_batch(
- [phoenix/xrex/data/recsys/recsys_batch.py:1658–1672](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/recsys_batch.py#L1658-L1672) Target implementation/context for reviewed change def from_record_batch(
- [phoenix/xrex/data/recsys/recsys_batch.py:1594–1599](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/recsys/recsys_batch.py#L1594-L1599) Baseline implementation/context for reviewed change def from_record_batch(
- [phoenix/xrex/data/recsys/recsys_batch.py:1677–1686](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/recsys_batch.py#L1677-L1686) Target implementation/context for reviewed change def from_record_batch(
- [phoenix/xrex/data/recsys/recsys_batch.py:2297–2302](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/recsys/recsys_batch.py#L2297-L2302) Baseline implementation/context for reviewed change def compute_local_time_features(
- [phoenix/xrex/data/recsys/recsys_batch.py:2384–2410](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/recsys_batch.py#L2384-L2410) Target implementation/context for reviewed change def compute_local_time_features(
- [phoenix/xrex/data/streaming/kafkaloader.py:1260–1283](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/streaming/kafkaloader.py#L1260-L1283) streaming conversion caller
- [phoenix/xrex/data/parquet_recsys.py:2466–2487](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L2466-L2487) offline conversion caller
- [phoenix/xrex/models/recsys_model.py:3680–3708](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L3680-L3708) ads count consumer

边界：原始样本质量、真实gate以及跨实现数值一致性未验证。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/data/rust_parquet_recsys.py

变化：RustParquetDataset显式supports_follow_data_end=False，并将ads_late_window_heads传至from_record_batch。

影响：trainer验证拒绝Rust reader开启follow模式；广告标签功能透传不代表所有模型已开启。

关联：无直接运营动作。

- [phoenix/xrex/data/rust_parquet_recsys.py:322–327](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/rust_parquet_recsys.py#L322-L327) Baseline implementation/context for reviewed change class RustParquetDataset(PhoenixDataset):
- [phoenix/xrex/data/rust_parquet_recsys.py:322–330](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/rust_parquet_recsys.py#L322-L330) Target implementation/context for reviewed change class RustParquetDataset(PhoenixDataset):
- [phoenix/xrex/data/rust_parquet_recsys.py:417–422](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/rust_parquet_recsys.py#L417-L422) Baseline implementation/context for reviewed change class RustParquetDataset(PhoenixDataset):
- [phoenix/xrex/data/rust_parquet_recsys.py:420–426](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/rust_parquet_recsys.py#L420-L426) Target implementation/context for reviewed change class RustParquetDataset(PhoenixDataset):
- [phoenix/xrex/train/trainer_recsys.py:1317–1340](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/train/trainer_recsys.py#L1317-L1340) follow validation consumes support check

边界：实际reader与配置未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/data/streaming/kafkaloader.py

变化：Kafka reader在read_ads_engagement_counts时追加两组广告计数可选列，并将该flag及ads_late_window_heads传到batch转换。

影响：读取数据而非直接打分；缺列由bucket reader置零。由factory默认false控制，不能推成所有organic内容都使用广告行为计数。

关联：research-27。

- [phoenix/xrex/data/streaming/kafkaloader.py:48–55](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/streaming/kafkaloader.py#L48-L55) Baseline implementation/context for reviewed change from xrex.data.recsys.feature_config import (
- [phoenix/xrex/data/streaming/kafkaloader.py:48–57](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/streaming/kafkaloader.py#L48-L57) Target implementation/context for reviewed change from xrex.data.recsys.feature_config import (
- [phoenix/xrex/data/streaming/kafkaloader.py:1200–1205](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/streaming/kafkaloader.py#L1200-L1205) Baseline implementation/context for reviewed change class PhoenixKafkaDataset(PhoenixDataset):
- [phoenix/xrex/data/streaming/kafkaloader.py:1202–1209](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/streaming/kafkaloader.py#L1202-L1209) Target implementation/context for reviewed change class PhoenixKafkaDataset(PhoenixDataset):
- [phoenix/xrex/data/streaming/kafkaloader.py:1268–1277](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/data/streaming/kafkaloader.py#L1268-L1277) Baseline implementation/context for reviewed change class PhoenixKafkaDataset(PhoenixDataset):
- [phoenix/xrex/data/streaming/kafkaloader.py:1272–1283](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/streaming/kafkaloader.py#L1272-L1283) Target implementation/context for reviewed change class PhoenixKafkaDataset(PhoenixDataset):
- [phoenix/xrex/configs/data_feeds.py:145–152](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/data_feeds.py#L145-L152) default false factory flags
- [phoenix/xrex/data/recsys/recsys_batch.py:727–763](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/recsys_batch.py#L727-L763) count reader consumer

边界：实际Kafka schema、配置与数据覆盖未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/inference/model_runner.py

变化：RankingModelRunner forward在sigmoid转log后，只有serve_late_window_composed时调用late engagement组合，再进行NaN检查。

影响：实际推理consumer支持可选迟到点击/停留校正；模型config验证要求先开启late heads与ads masking。不能与原始early预测或Home融合权重混淆。

关联：research-09、research-10、research-27。

- [phoenix/xrex/inference/model_runner.py:46–51](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/inference/model_runner.py#L46-L51) Baseline implementation/context for reviewed change from xrex.data.parquet_recsys import (
- [phoenix/xrex/inference/model_runner.py:46–52](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/inference/model_runner.py#L46-L52) Target implementation/context for reviewed change from xrex.data.parquet_recsys import (
- [phoenix/xrex/inference/model_runner.py:4464–4469](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/inference/model_runner.py#L4464-L4469) Baseline implementation/context for reviewed change class RankingModelRunner(
- [phoenix/xrex/inference/model_runner.py:4465–4472](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/inference/model_runner.py#L4465-L4472) Target implementation/context for reviewed change class RankingModelRunner(
- [phoenix/xrex/models/recsys_model.py:1213–1221](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L1213-L1221) flag prerequisites
- [phoenix/xrex/data/recsys/ads_late_window.py:81–97](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/ads_late_window.py#L81-L97) probability composition implementation

边界：部署模型flag与输出消费者覆盖未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/models/layers.py

变化：注意力QKV/out矩阵LR乘transformer_matrix_lr_scale；candidate-only路径检测额外user行并传独立history key范围，校验seqpack布局。

影响：训练缩放默认1；用户token路径由Transformer配置开启而非所有candidate-only层默认更新，实际attention consumer使用独立范围。

关联：research-16、research-35。

- [phoenix/xrex/models/layers.py:158–164](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/layers.py#L158-L164) Baseline implementation/context for reviewed change class MultiHeadAttention(hk.Module):
- [phoenix/xrex/models/layers.py:158–167](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/layers.py#L158-L167) Target implementation/context for reviewed change class MultiHeadAttention(hk.Module):
- [phoenix/xrex/models/layers.py:319–325](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/layers.py#L319-L325) Baseline implementation/context for reviewed change class MultiHeadAttention(hk.Module):
- [phoenix/xrex/models/layers.py:322–331](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/layers.py#L322-L331) Target implementation/context for reviewed change class MultiHeadAttention(hk.Module):
- [phoenix/xrex/models/layers.py:348–354](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/layers.py#L348-L354) Baseline implementation/context for reviewed change class MultiHeadAttention(hk.Module):
- [phoenix/xrex/models/layers.py:354–361](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/layers.py#L354-L361) Target implementation/context for reviewed change class MultiHeadAttention(hk.Module):
- [phoenix/xrex/models/layers.py:647–652](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/layers.py#L647-L652) Baseline implementation/context for reviewed change class CandidateOnlyAttention(MultiHeadAttention):
- [phoenix/xrex/models/layers.py:654–669](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/layers.py#L654-L669) Target implementation/context for reviewed change class CandidateOnlyAttention(MultiHeadAttention):
- [phoenix/xrex/models/layers.py:678–684](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/layers.py#L678-L684) Baseline implementation/context for reviewed change class CandidateOnlyAttention(MultiHeadAttention):
- [phoenix/xrex/models/layers.py:695–702](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/layers.py#L695-L702) Target implementation/context for reviewed change class CandidateOnlyAttention(MultiHeadAttention):
- [phoenix/xrex/models/transformer.py:805–842](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/transformer.py#L805-L842) caller appends user rows conditionally
- [phoenix/xrex/models/recsys_attention.py:397–456](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_attention.py#L397-L456) separate candidate/user kernel consumer

边界：运行模型架构与scale覆盖未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/models/recsys_attention.py

变化：candidate-only CuTe attention新增用户行分支，拆分候选/用户query，以不同key starts/counts各调用同一内核再拼接。

影响：服务于Transformer可选用户prefix更新，避免将其当普通候选；不是用户间交互或新的作者boost。

关联：research-16、research-35。

- [phoenix/xrex/models/recsys_attention.py:394–399](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_attention.py#L394-L399) Baseline implementation/context for reviewed change class CutedslRankerCandidateOnlyAttention(CustomAttention):
- [phoenix/xrex/models/recsys_attention.py:394–401](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_attention.py#L394-L401) Target implementation/context for reviewed change class CutedslRankerCandidateOnlyAttention(CustomAttention):
- [phoenix/xrex/models/recsys_attention.py:408–413](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_attention.py#L408-L413) Baseline implementation/context for reviewed change class CutedslRankerCandidateOnlyAttention(CustomAttention):
- [phoenix/xrex/models/recsys_attention.py:410–456](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_attention.py#L410-L456) Target implementation/context for reviewed change class CutedslRankerCandidateOnlyAttention(CustomAttention):
- [phoenix/xrex/models/recsys_attention.py:431–434](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_attention.py#L431-L434) Baseline implementation/context for reviewed change class CutedslRankerCandidateOnlyAttention(CustomAttention):
- [phoenix/xrex/models/recsys_attention.py:474–479](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_attention.py#L474-L479) Target implementation/context for reviewed change class CutedslRankerCandidateOnlyAttention(CustomAttention):
- [phoenix/xrex/models/layers.py:654–670](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/layers.py#L654-L670) attention keyword producer

边界：具体后端部署与训练模型未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/models/recsys_feature_prep.py

变化：新增19类time-gap桶，60×2^k边界、未知/负gap为0；默认关闭，分别加入history请求差及candidate距最新history差，零初始化表和可调LR；引入dwell合法范围0..86400及hidden投影缩放。

影响：home_direct_packed配方局部启用，其他泛型默认false；这些时间特征是viewer会话而非帖新鲜度固定奖励。dwell范围供训练loss过滤，不是观看越久最多24h加分。

关联：research-04、research-10、OP02。

- [phoenix/xrex/models/recsys_feature_prep.py:49–54](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_feature_prep.py#L49-L54) Baseline implementation/context for reviewed change class FeaturePrepStreams(NamedTuple):
- [phoenix/xrex/models/recsys_feature_prep.py:49–55](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_feature_prep.py#L49-L55) Target implementation/context for reviewed change class FeaturePrepStreams(NamedTuple):
- [phoenix/xrex/models/recsys_feature_prep.py:69–74](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_feature_prep.py#L69-L74) Baseline implementation/context for reviewed change def _compute_post_age_bucket_linear(
- [phoenix/xrex/models/recsys_feature_prep.py:70–83](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_feature_prep.py#L70-L83) Target implementation/context for reviewed change def _compute_post_age_bucket_linear(
- [phoenix/xrex/models/recsys_feature_prep.py:176–181](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_feature_prep.py#L176-L181) Baseline implementation/context for reviewed change class FeaturePrepConfig(Config):
- [phoenix/xrex/models/recsys_feature_prep.py:185–192](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_feature_prep.py#L185-L192) Target implementation/context for reviewed change class FeaturePrepConfig(Config):
- [phoenix/xrex/models/recsys_feature_prep.py:277–283](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_feature_prep.py#L277-L283) Baseline implementation/context for reviewed change def _feature_scale_spec(
- [phoenix/xrex/models/recsys_feature_prep.py:288–298](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_feature_prep.py#L288-L298) Target implementation/context for reviewed change def _feature_scale_spec(
- [phoenix/xrex/models/recsys_feature_prep.py:317–322](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_feature_prep.py#L317-L322) Baseline implementation/context for reviewed change def _get_emb_table(
- [phoenix/xrex/models/recsys_feature_prep.py:332–338](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_feature_prep.py#L332-L338) Target implementation/context for reviewed change def _get_emb_table(
- [phoenix/xrex/models/recsys_feature_prep.py:334–340](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_feature_prep.py#L334-L340) Baseline implementation/context for reviewed change def _get_emb_table(
- [phoenix/xrex/models/recsys_feature_prep.py:350–356](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_feature_prep.py#L350-L356) Target implementation/context for reviewed change def _get_emb_table(
- [phoenix/xrex/models/recsys_feature_prep.py:378–385](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_feature_prep.py#L378-L385) Baseline implementation/context for reviewed change def _embed_categorical(
- [phoenix/xrex/models/recsys_feature_prep.py:394–405](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_feature_prep.py#L394-L405) Target implementation/context for reviewed change def _embed_categorical(
- [phoenix/xrex/models/recsys_feature_prep.py:398–403](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_feature_prep.py#L398-L403) Baseline implementation/context for reviewed change def _embed_scalar_times_vector(
- [phoenix/xrex/models/recsys_feature_prep.py:418–425](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_feature_prep.py#L418-L425) Target implementation/context for reviewed change def _embed_scalar_times_vector(
- [phoenix/xrex/models/recsys_feature_prep.py:1001–1006](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_feature_prep.py#L1001-L1006) Baseline implementation/context for reviewed change def _add_history_features(
- [phoenix/xrex/models/recsys_feature_prep.py:1023–1043](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_feature_prep.py#L1023-L1043) Target implementation/context for reviewed change def _add_history_features(
- [phoenix/xrex/models/recsys_feature_prep.py:1043–1048](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_feature_prep.py#L1043-L1048) Baseline implementation/context for reviewed change def _add_candidate_features(
- [phoenix/xrex/models/recsys_feature_prep.py:1080–1102](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_feature_prep.py#L1080-L1102) Target implementation/context for reviewed change def _add_candidate_features(
- [phoenix/xrex/configs/xrecsys.py:479–507](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/xrecsys.py#L479-L507) named recipe override
- [phoenix/xrex/data/recsys/recsys_batch.py:2387–2407](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/recsys_batch.py#L2387-L2407) timestamp input producer
- [phoenix/xrex/models/recsys_model.py:4621–4634](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L4621-L4634) dwell bounds consumer

边界：实际模型权重、开关、int64宽度及用户效果未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/models/recsys_model.py

变化：模型新增ads侧计数/会话recency零初始化投影、late-window配置验证、head专属metric slices、view loss权重、head LR缩放、dwell异常label屏蔽与预测统计分离；放开一个candidate-only层更新user token以支持page_rl，仍禁止transformer_output_only。

影响：关键变化均为特征、训练目标/metrics或配置受限架构。侧输入要求feature_prep关闭且计数数据存在；不直接修改Home价值系数或保证Page RL已启用；dwell负值/超86400排除训练而非全站内容处罚。

关联：research-09、research-10、research-16、research-27、research-35、OP02。

- [phoenix/xrex/models/recsys_model.py:24–29](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_model.py#L24-L29) Baseline implementation/context for reviewed change from xrex.data.recsys.ads_head_masking import (
- [phoenix/xrex/models/recsys_model.py:24–30](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L24-L30) Target implementation/context for reviewed change from xrex.data.recsys.ads_head_masking import (
- [phoenix/xrex/models/recsys_model.py:39–49](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_model.py#L39-L49) Baseline implementation/context for reviewed change from xrex.data.recsys.constants import (
- [phoenix/xrex/models/recsys_model.py:40–52](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L40-L52) Target implementation/context for reviewed change from xrex.data.recsys.constants import (
- [phoenix/xrex/models/recsys_model.py:95–100](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_model.py#L95-L100) Baseline implementation/context for reviewed change from xrex.models.recsys_embedding import (
- [phoenix/xrex/models/recsys_model.py:98–105](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L98-L105) Target implementation/context for reviewed change from xrex.models.recsys_embedding import (
- [phoenix/xrex/models/recsys_model.py:169–174](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_model.py#L169-L174) Baseline implementation/context for reviewed change ANDROID_CLIENT_APP_IDS = (
- [phoenix/xrex/models/recsys_model.py:174–191](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L174-L191) Target implementation/context for reviewed change ANDROID_CLIENT_APP_IDS = (
- [phoenix/xrex/models/recsys_model.py:1193–1200](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_model.py#L1193-L1200) Baseline implementation/context for reviewed change class RecsysAggregatedModelConfig(Config):
- [phoenix/xrex/models/recsys_model.py:1210–1231](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L1210-L1231) Target implementation/context for reviewed change class RecsysAggregatedModelConfig(Config):
- [phoenix/xrex/models/recsys_model.py:1216–1221](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_model.py#L1216-L1221) Baseline implementation/context for reviewed change class RecsysAggregatedModelConfig(Config):
- [phoenix/xrex/models/recsys_model.py:1247–1255](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L1247-L1255) Target implementation/context for reviewed change class RecsysAggregatedModelConfig(Config):
- [phoenix/xrex/models/recsys_model.py:1235–1240](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_model.py#L1235-L1240) Baseline implementation/context for reviewed change class RecsysAggregatedModelConfig(Config):
- [phoenix/xrex/models/recsys_model.py:1269–1275](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L1269-L1275) Target implementation/context for reviewed change class RecsysAggregatedModelConfig(Config):
- [phoenix/xrex/models/recsys_model.py:1279–1286](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_model.py#L1279-L1286) Baseline implementation/context for reviewed change class RecsysAggregatedModelConfig(Config):
- [phoenix/xrex/models/recsys_model.py:1314–1326](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L1314-L1326) Target implementation/context for reviewed change class RecsysAggregatedModelConfig(Config):
- [phoenix/xrex/models/recsys_model.py:1315–1320](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_model.py#L1315-L1320) Baseline implementation/context for reviewed change class RecsysAggregatedModelConfig(Config):
- [phoenix/xrex/models/recsys_model.py:1355–1361](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L1355-L1361) Target implementation/context for reviewed change class RecsysAggregatedModelConfig(Config):
- [phoenix/xrex/models/recsys_model.py:1328–1340](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_model.py#L1328-L1340) Baseline implementation/context for reviewed change class RecsysAggregatedModelConfig(Config):
- [phoenix/xrex/models/recsys_model.py:1369–1396](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L1369-L1396) Target implementation/context for reviewed change class RecsysAggregatedModelConfig(Config):
- [phoenix/xrex/models/recsys_model.py:1498–1503](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_model.py#L1498-L1503) Baseline implementation/context for reviewed change def compute_continuous_metrics(
- [phoenix/xrex/models/recsys_model.py:1554–1561](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L1554-L1561) Target implementation/context for reviewed change def compute_continuous_metrics(
- [phoenix/xrex/models/recsys_model.py:1550–1555](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_model.py#L1550-L1555) Baseline implementation/context for reviewed change def compute_continuous_metrics(
- [phoenix/xrex/models/recsys_model.py:1608–1615](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L1608-L1615) Target implementation/context for reviewed change def compute_continuous_metrics(
- [phoenix/xrex/models/recsys_model.py:1558–1570](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_model.py#L1558-L1570) Baseline implementation/context for reviewed change def compute_continuous_metrics(
- [phoenix/xrex/models/recsys_model.py:1618–1632](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L1618-L1632) Target implementation/context for reviewed change def compute_continuous_metrics(
- [phoenix/xrex/models/recsys_model.py:2468–2502](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_model.py#L2468-L2502) Baseline implementation/context for reviewed change class RecsysAggregatedModel(hk.Module):
- [phoenix/xrex/models/recsys_model.py:2530–2589](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L2530-L2589) Target implementation/context for reviewed change class RecsysAggregatedModel(hk.Module):
- [phoenix/xrex/models/recsys_model.py:3210–3216](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_model.py#L3210-L3216) Baseline implementation/context for reviewed change class RecsysAggregatedModel(hk.Module):
- [phoenix/xrex/models/recsys_model.py:3297–3303](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L3297-L3303) Target implementation/context for reviewed change class RecsysAggregatedModel(hk.Module):
- [phoenix/xrex/models/recsys_model.py:3248–3254](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_model.py#L3248-L3254) Baseline implementation/context for reviewed change class RecsysAggregatedModel(hk.Module):
- [phoenix/xrex/models/recsys_model.py:3335–3341](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L3335-L3341) Target implementation/context for reviewed change class RecsysAggregatedModel(hk.Module):
- [phoenix/xrex/models/recsys_model.py:3375–3381](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_model.py#L3375-L3381) Baseline implementation/context for reviewed change class RecsysAggregatedModel(hk.Module):
- [phoenix/xrex/models/recsys_model.py:3462–3468](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L3462-L3468) Target implementation/context for reviewed change class RecsysAggregatedModel(hk.Module):
- [phoenix/xrex/models/recsys_model.py:3568–3573](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_model.py#L3568-L3573) Baseline implementation/context for reviewed change class RecsysAggregatedModel(hk.Module):
- [phoenix/xrex/models/recsys_model.py:3655–3769](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L3655-L3769) Target implementation/context for reviewed change class RecsysAggregatedModel(hk.Module):
- [phoenix/xrex/models/recsys_model.py:3897–3902](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_model.py#L3897-L3902) Baseline implementation/context for reviewed change class RecsysAggregatedModel(hk.Module):
- [phoenix/xrex/models/recsys_model.py:4093–4102](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L4093-L4102) Target implementation/context for reviewed change class RecsysAggregatedModel(hk.Module):
- [phoenix/xrex/models/recsys_model.py:4073–4078](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_model.py#L4073-L4078) Baseline implementation/context for reviewed change class RecsysAggregatedModel(hk.Module):
- [phoenix/xrex/models/recsys_model.py:4273–4282](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L4273-L4282) Target implementation/context for reviewed change class RecsysAggregatedModel(hk.Module):
- [phoenix/xrex/models/recsys_model.py:4414–4419](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_model.py#L4414-L4419) Baseline implementation/context for reviewed change class RecsysAggregatedModel(hk.Module):
- [phoenix/xrex/models/recsys_model.py:4618–4631](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L4618-L4631) Target implementation/context for reviewed change class RecsysAggregatedModel(hk.Module):
- [phoenix/xrex/models/recsys_model.py:4788–4793](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_model.py#L4788-L4793) Baseline implementation/context for reviewed change class RecsysAggregatedModel(hk.Module):
- [phoenix/xrex/models/recsys_model.py:5000–5013](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L5000-L5013) Target implementation/context for reviewed change class RecsysAggregatedModel(hk.Module):
- [phoenix/xrex/models/recsys_model.py:5168–5173](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_model.py#L5168-L5173) Baseline implementation/context for reviewed change class RecsysAggregatedModel(hk.Module):
- [phoenix/xrex/models/recsys_model.py:5388–5394](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L5388-L5394) Target implementation/context for reviewed change class RecsysAggregatedModel(hk.Module):
- [phoenix/xrex/models/recsys_model.py:5257–5262](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_model.py#L5257-L5262) Baseline implementation/context for reviewed change class RecsysAggregatedModel(hk.Module):
- [phoenix/xrex/models/recsys_model.py:5478–5492](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L5478-L5492) Target implementation/context for reviewed change class RecsysAggregatedModel(hk.Module):
- [phoenix/xrex/models/recsys_model.py:5268–5273](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/recsys_model.py#L5268-L5273) Baseline implementation/context for reviewed change class RecsysAggregatedModel(hk.Module):
- [phoenix/xrex/models/recsys_model.py:5498–5505](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L5498-L5505) Target implementation/context for reviewed change class RecsysAggregatedModel(hk.Module):
- [phoenix/xrex/configs/xrecsys.py:759–793](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/xrecsys.py#L759-L793) model flag producer
- [phoenix/xrex/inference/model_runner.py:4464–4473](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/inference/model_runner.py#L4464-L4473) model forward consumer
- [phoenix/xrex/train/trainer_recsys.py:715–740](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/train/trainer_recsys.py#L715-L740) metric consumer

边界：真实训练/服务配置、已训练参数、权重校准与生产影响未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/models/remat.py

变化：删除SAVE_H100_QKV_ATTN_FFN枚举34及旧H100保存策略分支，将其主要保存集合并入SAVE_H100_RECSYS=32并加gate_up_proj；Pallas策略仍基于H100再保存pallas输出。

影响：configs、transformer与testing同步改名；影响重计算/显存策略不是新的算法运营法则。旧配置若引用已删名字需迁移，不能声称纯文本重命名完全无运行影响。

关联：无直接运营动作。

- [phoenix/xrex/models/remat.py:14–20](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/remat.py#L14-L20) Baseline implementation/context for reviewed change class RematType(enum.IntEnum):
- [phoenix/xrex/models/remat.py:14–19](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/remat.py#L14-L19) Target implementation/context for reviewed change class RematType(enum.IntEnum):
- [phoenix/xrex/models/remat.py:42–68](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/remat.py#L42-L68) Baseline implementation/context for reviewed change def custom_remat_policy(policy: RematType):
- [phoenix/xrex/models/remat.py:41–46](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/remat.py#L41-L46) Target implementation/context for reviewed change def custom_remat_policy(policy: RematType):
- [phoenix/xrex/models/remat.py:71–76](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/remat.py#L71-L76) Baseline implementation/context for reviewed change def custom_remat_policy(policy: RematType):
- [phoenix/xrex/models/remat.py:49–55](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/remat.py#L49-L55) Target implementation/context for reviewed change def custom_remat_policy(policy: RematType):
- [phoenix/xrex/models/remat.py:78–83](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/remat.py#L78-L83) Baseline implementation/context for reviewed change def custom_remat_policy(policy: RematType):
- [phoenix/xrex/models/remat.py:57–67](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/remat.py#L57-L67) Target implementation/context for reviewed change def custom_remat_policy(policy: RematType):
- [phoenix/xrex/configs/xrecsys.py:337–344](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/xrecsys.py#L337-L344) H100 remat config
- [phoenix/xrex/models/transformer.py:738–747](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/transformer.py#L738-L747) FP8 remat consumer

边界：旧checkpoint配置兼容及性能未验证。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/models/scaling.py

变化：ScaleConfig新增transformer_matrix/head/hidden_proj三类lr_scale=1，head_lr_multiplier为旧embedding倍率再乘head scale。

影响：layers/transformer/feature prep/model分别消费，具体home配方覆盖.25；LR是学习率不是关注/分享价值的权重。

关联：research-09、research-10。

- [phoenix/xrex/models/scaling.py:9–14](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/scaling.py#L9-L14) Baseline implementation/context for reviewed change from xrex.utils.utils import ffn_size
- [phoenix/xrex/models/scaling.py:9–17](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/scaling.py#L9-L17) Target implementation/context for reviewed change from xrex.utils.utils import ffn_size
- [phoenix/xrex/models/scaling.py:22–27](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/scaling.py#L22-L27) Baseline implementation/context for reviewed change class ScaleConfig(Config):
- [phoenix/xrex/models/scaling.py:25–33](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/scaling.py#L25-L33) Target implementation/context for reviewed change class ScaleConfig(Config):
- [phoenix/xrex/models/layers.py:158–166](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/layers.py#L158-L166) attention scale consumer
- [phoenix/xrex/models/recsys_model.py:3297–3304](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L3297-L3304) head scale consumer
- [phoenix/xrex/configs/xrecsys.py:504–507](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/xrecsys.py#L504-L507) named recipe override

边界：实际训练配置未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/models/transformer.py

变化：Transformer加入candidate_only_layers_update_user_token默认false；需要时收集prefix user行、加入candidate更新、扩展position/mask并写回history。各Dense投影接LR scale，FP8 remat gate改新枚举。

影响：与layers/attention和model验证成套；可使Page RL使用更新user token，但只支持受限架构，不能推断Home PageRL默认开。

关联：research-16、research-35。

- [phoenix/xrex/models/transformer.py:17–23](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/transformer.py#L17-L23) Baseline implementation/context for reviewed change from jax.sharding import NamedSharding
- [phoenix/xrex/models/transformer.py:17–23](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/transformer.py#L17-L23) Target implementation/context for reviewed change from jax.sharding import NamedSharding
- [phoenix/xrex/models/transformer.py:84–89](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/transformer.py#L84-L89) Baseline implementation/context for reviewed change class TransformerConfig(Config):
- [phoenix/xrex/models/transformer.py:84–90](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/transformer.py#L84-L90) Target implementation/context for reviewed change class TransformerConfig(Config):
- [phoenix/xrex/models/transformer.py:296–302](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/transformer.py#L296-L302) Baseline implementation/context for reviewed change class DenseBlock(hk.Module):
- [phoenix/xrex/models/transformer.py:297–304](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/transformer.py#L297-L304) Target implementation/context for reviewed change class DenseBlock(hk.Module):
- [phoenix/xrex/models/transformer.py:315–321](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/transformer.py#L315-L321) Baseline implementation/context for reviewed change class DenseBlock(hk.Module):
- [phoenix/xrex/models/transformer.py:317–324](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/transformer.py#L317-L324) Target implementation/context for reviewed change class DenseBlock(hk.Module):
- [phoenix/xrex/models/transformer.py:326–332](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/transformer.py#L326-L332) Baseline implementation/context for reviewed change class DenseBlock(hk.Module):
- [phoenix/xrex/models/transformer.py:329–336](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/transformer.py#L329-L336) Target implementation/context for reviewed change class DenseBlock(hk.Module):
- [phoenix/xrex/models/transformer.py:341–347](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/transformer.py#L341-L347) Baseline implementation/context for reviewed change class DenseBlock(hk.Module):
- [phoenix/xrex/models/transformer.py:345–352](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/transformer.py#L345-L352) Target implementation/context for reviewed change class DenseBlock(hk.Module):
- [phoenix/xrex/models/transformer.py:357–363](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/transformer.py#L357-L363) Baseline implementation/context for reviewed change class DenseBlock(hk.Module):
- [phoenix/xrex/models/transformer.py:362–369](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/transformer.py#L362-L369) Target implementation/context for reviewed change class DenseBlock(hk.Module):
- [phoenix/xrex/models/transformer.py:369–375](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/transformer.py#L369-L375) Baseline implementation/context for reviewed change class DenseBlock(hk.Module):
- [phoenix/xrex/models/transformer.py:375–382](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/transformer.py#L375-L382) Target implementation/context for reviewed change class DenseBlock(hk.Module):
- [phoenix/xrex/models/transformer.py:733–739](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/transformer.py#L733-L739) Baseline implementation/context for reviewed change class Transformer(hk.Module):
- [phoenix/xrex/models/transformer.py:740–746](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/transformer.py#L740-L746) Target implementation/context for reviewed change class Transformer(hk.Module):
- [phoenix/xrex/models/transformer.py:747–752](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/transformer.py#L747-L752) Baseline implementation/context for reviewed change class Transformer(hk.Module):
- [phoenix/xrex/models/transformer.py:754–760](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/transformer.py#L754-L760) Target implementation/context for reviewed change class Transformer(hk.Module):
- [phoenix/xrex/models/transformer.py:797–805](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/transformer.py#L797-L805) Baseline implementation/context for reviewed change class Transformer(hk.Module):
- [phoenix/xrex/models/transformer.py:805–838](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/transformer.py#L805-L838) Target implementation/context for reviewed change class Transformer(hk.Module):
- [phoenix/xrex/models/transformer.py:809–814](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/transformer.py#L809-L814) Baseline implementation/context for reviewed change class Transformer(hk.Module):
- [phoenix/xrex/models/transformer.py:842–853](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/transformer.py#L842-L853) Target implementation/context for reviewed change class Transformer(hk.Module):
- [phoenix/xrex/models/transformer.py:822–827](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/transformer.py#L822-L827) Baseline implementation/context for reviewed change class Transformer(hk.Module):
- [phoenix/xrex/models/transformer.py:861–872](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/transformer.py#L861-L872) Target implementation/context for reviewed change class Transformer(hk.Module):
- [phoenix/xrex/models/transformer.py:888–893](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/models/transformer.py#L888-L893) Baseline implementation/context for reviewed change class Transformer(hk.Module):
- [phoenix/xrex/models/transformer.py:933–943](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/transformer.py#L933-L943) Target implementation/context for reviewed change class Transformer(hk.Module):
- [phoenix/xrex/models/recsys_model.py:1372–1394](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L1372-L1394) architecture validation
- [phoenix/xrex/models/layers.py:654–670](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/layers.py#L654-L670) user row consumer

边界：部署架构、kernel和参数未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/optimizers/recsys/config.py

变化：embedding optimizer factory将exempt窗口和stochastic_rounding传给RecsysRowwiseAdagradOptimizer。

影响：保持配置到实现接线；默认0/false，具体home配方不同。无直接内容筛选或价值融合变化。

关联：无直接运营动作。

- [phoenix/xrex/optimizers/recsys/config.py:34–37](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/optimizers/recsys/config.py#L34-L37) Baseline implementation/context for reviewed change class RecsysEmbeddingOptimConfig(Config):
- [phoenix/xrex/optimizers/recsys/config.py:34–39](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/optimizers/recsys/config.py#L34-L39) Target implementation/context for reviewed change class RecsysEmbeddingOptimConfig(Config):
- [phoenix/xrex/optimizers/recsys/rowwise_adagrad.py:64–84](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/optimizers/recsys/rowwise_adagrad.py#L64-L84) constructor validation and storage

边界：实际配方与运行覆盖未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/optimizers/recsys/rowwise_adagrad.py

变化：参考Adagrad新增窗口和随机舍入，校验需lazy_decay且window非负；timestamp状态也支持仅随机舍入；fused后端透传参数，Python参考按delta窗口衰减并hash舍入。

影响：优化器影响训练轨迹，window37是home配方训练步数，不是用户期/发帖频率。默认行为和新选项分开，不能换算排名收益。

关联：无直接运营动作。

- [phoenix/xrex/optimizers/recsys/rowwise_adagrad.py:25–30](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/optimizers/recsys/rowwise_adagrad.py#L25-L30) Baseline implementation/context for reviewed change _LN2 = math.log(2)
- [phoenix/xrex/optimizers/recsys/rowwise_adagrad.py:25–44](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/optimizers/recsys/rowwise_adagrad.py#L25-L44) Target implementation/context for reviewed change _LN2 = math.log(2)
- [phoenix/xrex/optimizers/recsys/rowwise_adagrad.py:34–39](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/optimizers/recsys/rowwise_adagrad.py#L34-L39) Baseline implementation/context for reviewed change class RecsysRowwiseAdagradConfig(Config):
- [phoenix/xrex/optimizers/recsys/rowwise_adagrad.py:48–55](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/optimizers/recsys/rowwise_adagrad.py#L48-L55) Target implementation/context for reviewed change class RecsysRowwiseAdagradConfig(Config):
- [phoenix/xrex/optimizers/recsys/rowwise_adagrad.py:51–62](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/optimizers/recsys/rowwise_adagrad.py#L51-L62) Baseline implementation/context for reviewed change class RecsysRowwiseAdagradOptimizer(RecsysEmbeddingOptimizer, AsyncEmbOptimizer)
- [phoenix/xrex/optimizers/recsys/rowwise_adagrad.py:67–86](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/optimizers/recsys/rowwise_adagrad.py#L67-L86) Target implementation/context for reviewed change class RecsysRowwiseAdagradOptimizer(RecsysEmbeddingOptimizer, AsyncEmbOptimizer)
- [phoenix/xrex/optimizers/recsys/rowwise_adagrad.py:68–74](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/optimizers/recsys/rowwise_adagrad.py#L68-L74) Baseline implementation/context for reviewed change class RecsysRowwiseAdagradOptimizer(RecsysEmbeddingOptimizer, AsyncEmbOptimizer)
- [phoenix/xrex/optimizers/recsys/rowwise_adagrad.py:92–100](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/optimizers/recsys/rowwise_adagrad.py#L92-L100) Target implementation/context for reviewed change class RecsysRowwiseAdagradOptimizer(RecsysEmbeddingOptimizer, AsyncEmbOptimizer)
- [phoenix/xrex/optimizers/recsys/rowwise_adagrad.py:110–115](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/optimizers/recsys/rowwise_adagrad.py#L110-L115) Baseline implementation/context for reviewed change class RecsysRowwiseAdagradOptimizer(RecsysEmbeddingOptimizer, AsyncEmbOptimizer)
- [phoenix/xrex/optimizers/recsys/rowwise_adagrad.py:136–147](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/optimizers/recsys/rowwise_adagrad.py#L136-L147) Target implementation/context for reviewed change class RecsysRowwiseAdagradOptimizer(RecsysEmbeddingOptimizer, AsyncEmbOptimizer)
- [phoenix/xrex/optimizers/recsys/rowwise_adagrad.py:139–144](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/optimizers/recsys/rowwise_adagrad.py#L139-L144) Baseline implementation/context for reviewed change class RecsysRowwiseAdagradOptimizer(RecsysEmbeddingOptimizer, AsyncEmbOptimizer)
- [phoenix/xrex/optimizers/recsys/rowwise_adagrad.py:171–177](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/optimizers/recsys/rowwise_adagrad.py#L171-L177) Target implementation/context for reviewed change class RecsysRowwiseAdagradOptimizer(RecsysEmbeddingOptimizer, AsyncEmbOptimizer)
- [phoenix/xrex/optimizers/recsys/rowwise_adagrad.py:243–262](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/optimizers/recsys/rowwise_adagrad.py#L243-L262) Baseline implementation/context for reviewed change class RecsysRowwiseAdagradOptimizer(RecsysEmbeddingOptimizer, AsyncEmbOptimizer)
- [phoenix/xrex/optimizers/recsys/rowwise_adagrad.py:276–307](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/optimizers/recsys/rowwise_adagrad.py#L276-L307) Target implementation/context for reviewed change class RecsysRowwiseAdagradOptimizer(RecsysEmbeddingOptimizer, AsyncEmbOptimizer)
- [phoenix/xrex/optimizers/recsys/config.py:26–39](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/optimizers/recsys/config.py#L26-L39) optimizer constructor caller
- [phoenix/xrex/utils/recsys_async_emb.py:33–41](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/utils/recsys_async_emb.py#L33-L41) CUDA backend selection
- [phoenix/xrex/configs/xrecsys.py:494–503](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/configs/xrecsys.py#L494-L503) home recipe enables options

边界：跨后端数值一致性和真实模型效果未测试。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/testing.py

变化：home_like_transformer测试辅助配方将remat枚举改SAVE_H100_RECSYS。

影响：仅静态读取辅助源码，未执行测试；与删除枚举保持一致，不是生产默认改变的独立证据。

关联：无直接运营动作。

- [phoenix/xrex/testing.py:152–158](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/testing.py#L152-L158) Baseline implementation/context for reviewed change def home_like_transformer(fp8_gemms: str = "off"):
- [phoenix/xrex/testing.py:152–158](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/testing.py#L152-L158) Target implementation/context for reviewed change def home_like_transformer(fp8_gemms: str = "off"):
- [phoenix/xrex/models/remat.py:41–63](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/remat.py#L41-L63) replacement enum policy behavior

边界：公开树未找到该辅助函数调用；测试和构建未执行。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/train/follow_data_end.py

变化：新增DataEndFollower协调进程0异步探测增量数据、全进程广播与reader窗口最大值；近结束窗口冻结，连续3次计步失败抛错，新增终点不能减少max_steps。

影响：由RecsysTrainer仅follow_data_end开启时创建；这是离线训练跟进数据，不是用户内容刷新、24h标签窗口或生产持续在线学习的证明。

关联：无直接运营动作。

- [phoenix/xrex/train/follow_data_end.py:1–225](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/train/follow_data_end.py#L1-L225) Target implementation/context for reviewed change
- [phoenix/xrex/train/trainer_recsys.py:1346–1425](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/train/trainer_recsys.py#L1346-L1425) follower construction and before-stop consumer

边界：生产训练模式、协调服务可靠性与输入索引未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/train/recsys_bundle_export.py

变化：导出forward在BF16往返后的log_sigmoid上按serve_late_window_composed应用迟到概率组合。

影响：与在线Python runner同一组合函数但数值量化顺序不同；这是可选服务输出语义，不能宣称两路径逐位一致或全部Home开启。

关联：research-09、research-10、research-27。

- [phoenix/xrex/train/recsys_bundle_export.py:17–22](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/train/recsys_bundle_export.py#L17-L22) Baseline implementation/context for reviewed change import jax
- [phoenix/xrex/train/recsys_bundle_export.py:17–23](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/train/recsys_bundle_export.py#L17-L23) Target implementation/context for reviewed change import jax
- [phoenix/xrex/train/recsys_bundle_export.py:693–698](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/train/recsys_bundle_export.py#L693-L698) Baseline implementation/context for reviewed change def _make_forward_fn(
- [phoenix/xrex/train/recsys_bundle_export.py:694–701](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/train/recsys_bundle_export.py#L694-L701) Target implementation/context for reviewed change def _make_forward_fn(
- [phoenix/xrex/data/recsys/ads_late_window.py:81–97](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/recsys/ads_late_window.py#L81-L97) probability correction implementation
- [phoenix/xrex/models/recsys_model.py:1213–1221](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L1213-L1221) config prerequisite validation

边界：部署bundle/flag、精度影响及服务消费者未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/train/trainer.py

变化：通用训练循环在stop_reason前调用新增before_stop_check空hook。

影响：默认无行为，RecsysTrainer覆写以扩展数据终点；不代表通用trainer默认永不停止。

关联：无直接运营动作。

- [phoenix/xrex/train/trainer.py:1582–1587](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/train/trainer.py#L1582-L1587) Baseline implementation/context for reviewed change class Trainer(Config):
- [phoenix/xrex/train/trainer.py:1582–1588](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/train/trainer.py#L1582-L1588) Target implementation/context for reviewed change class Trainer(Config):
- [phoenix/xrex/train/trainer.py:1603–1608](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/train/trainer.py#L1603-L1608) Baseline implementation/context for reviewed change class Trainer(Config):
- [phoenix/xrex/train/trainer.py:1604–1612](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/train/trainer.py#L1604-L1612) Target implementation/context for reviewed change class Trainer(Config):
- [phoenix/xrex/train/trainer_recsys.py:1419–1429](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/train/trainer_recsys.py#L1419-L1429) subclass hook consumer

边界：具体trainer与follow开关未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

### phoenix/xrex/train/trainer_recsys.py

变化：trainer增加follow_data_end默认false及200步检查、验证只许Python离线block shuffle训练；创建follower并更新max_steps；prefetch默认2；EMA按head slice分配/恢复；自身checkpoint恢复Kafka offsets时清首启配置；移除page_rl对seqpack候选打包的全面禁止。

影响：训练可靠性/指标与受限Page RL架构兼容变化，不能当生产Home RL全量启用；manual checkpoint不套用own-restart清理；follow需stop_at_data_end且开放日期上界。

关联：research-16、research-35。

- [phoenix/xrex/train/trainer_recsys.py:42–48](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/train/trainer_recsys.py#L42-L48) Baseline implementation/context for reviewed change from xai_checkpointing.common import _unsafe_jax2np
- [phoenix/xrex/train/trainer_recsys.py:42–49](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/train/trainer_recsys.py#L42-L49) Target implementation/context for reviewed change from xai_checkpointing.common import _unsafe_jax2np
- [phoenix/xrex/train/trainer_recsys.py:93–98](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/train/trainer_recsys.py#L93-L98) Baseline implementation/context for reviewed change from xrex.optimizers.optim import InjectHyperparamsState, apply_updates, partiti
- [phoenix/xrex/train/trainer_recsys.py:94–100](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/train/trainer_recsys.py#L94-L100) Target implementation/context for reviewed change from xrex.optimizers.optim import InjectHyperparamsState, apply_updates, partiti
- [phoenix/xrex/train/trainer_recsys.py:190–195](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/train/trainer_recsys.py#L190-L195) Baseline implementation/context for reviewed change def _pad_axis(x: jax.Array, axis: int, length: int | None) -> jax.Array:
- [phoenix/xrex/train/trainer_recsys.py:192–209](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/train/trainer_recsys.py#L192-L209) Target implementation/context for reviewed change def _pad_axis(x: jax.Array, axis: int, length: int | None) -> jax.Array:
- [phoenix/xrex/train/trainer_recsys.py:443–448](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/train/trainer_recsys.py#L443-L448) Baseline implementation/context for reviewed change class RecsysTrainer(Trainer):
- [phoenix/xrex/train/trainer_recsys.py:457–464](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/train/trainer_recsys.py#L457-L464) Target implementation/context for reviewed change class RecsysTrainer(Trainer):
- [phoenix/xrex/train/trainer_recsys.py:477–482](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/train/trainer_recsys.py#L477-L482) Baseline implementation/context for reviewed change class RecsysTrainer(Trainer):
- [phoenix/xrex/train/trainer_recsys.py:493–500](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/train/trainer_recsys.py#L493-L500) Target implementation/context for reviewed change class RecsysTrainer(Trainer):
- [phoenix/xrex/train/trainer_recsys.py:484–489](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/train/trainer_recsys.py#L484-L489) Baseline implementation/context for reviewed change class RecsysTrainer(Trainer):
- [phoenix/xrex/train/trainer_recsys.py:502–508](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/train/trainer_recsys.py#L502-L508) Target implementation/context for reviewed change class RecsysTrainer(Trainer):
- [phoenix/xrex/train/trainer_recsys.py:542–547](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/train/trainer_recsys.py#L542-L547) Baseline implementation/context for reviewed change class RecsysTrainer(Trainer):
- [phoenix/xrex/train/trainer_recsys.py:561–568](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/train/trainer_recsys.py#L561-L568) Target implementation/context for reviewed change class RecsysTrainer(Trainer):
- [phoenix/xrex/train/trainer_recsys.py:691–696](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/train/trainer_recsys.py#L691-L696) Baseline implementation/context for reviewed change class RecsysTrainer(Trainer):
- [phoenix/xrex/train/trainer_recsys.py:712–744](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/train/trainer_recsys.py#L712-L744) Target implementation/context for reviewed change class RecsysTrainer(Trainer):
- [phoenix/xrex/train/trainer_recsys.py:785–813](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/train/trainer_recsys.py#L785-L813) Baseline implementation/context for reviewed change class RecsysTrainer(Trainer):
- [phoenix/xrex/train/trainer_recsys.py:833–844](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/train/trainer_recsys.py#L833-L844) Target implementation/context for reviewed change class RecsysTrainer(Trainer):
- [phoenix/xrex/train/trainer_recsys.py:817–824](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/train/trainer_recsys.py#L817-L824) Baseline implementation/context for reviewed change class RecsysTrainer(Trainer):
- [phoenix/xrex/train/trainer_recsys.py:848–854](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/train/trainer_recsys.py#L848-L854) Target implementation/context for reviewed change class RecsysTrainer(Trainer):
- [phoenix/xrex/train/trainer_recsys.py:1284–1289](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/train/trainer_recsys.py#L1284-L1289) Baseline implementation/context for reviewed change class RecsysTrainer(Trainer):
- [phoenix/xrex/train/trainer_recsys.py:1314–1428](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/train/trainer_recsys.py#L1314-L1428) Target implementation/context for reviewed change class RecsysTrainer(Trainer):
- [phoenix/xrex/train/trainer_recsys.py:1333–1338](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/train/trainer_recsys.py#L1333-L1338) Baseline implementation/context for reviewed change class RecsysTrainer(Trainer):
- [phoenix/xrex/train/trainer_recsys.py:1472–1479](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/train/trainer_recsys.py#L1472-L1479) Target implementation/context for reviewed change class RecsysTrainer(Trainer):
- [phoenix/xrex/train/trainer_recsys.py:1345–1355](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/train/trainer_recsys.py#L1345-L1355) Baseline implementation/context for reviewed change class RecsysTrainer(Trainer):
- [phoenix/xrex/train/trainer_recsys.py:1486–1497](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/train/trainer_recsys.py#L1486-L1497) Target implementation/context for reviewed change class RecsysTrainer(Trainer):
- [phoenix/xrex/train/trainer_recsys.py:1359–1366](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/train/trainer_recsys.py#L1359-L1366) Baseline implementation/context for reviewed change class RecsysTrainer(Trainer):
- [phoenix/xrex/train/trainer_recsys.py:1501–1507](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/train/trainer_recsys.py#L1501-L1507) Target implementation/context for reviewed change class RecsysTrainer(Trainer):
- [phoenix/xrex/train/trainer_recsys.py:2574–2581](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/train/trainer_recsys.py#L2574-L2581) Baseline implementation/context for reviewed change class RecsysTrainer(Trainer):
- [phoenix/xrex/train/trainer_recsys.py:2715–2720](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/train/trainer_recsys.py#L2715-L2720) Target implementation/context for reviewed change class RecsysTrainer(Trainer):
- [phoenix/xrex/train/trainer_recsys.py:3068–3103](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/train/trainer_recsys.py#L3068-L3103) Baseline implementation/context for reviewed change class RecsysTrainer(Trainer):
- [phoenix/xrex/train/trainer_recsys.py:3207–3230](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/train/trainer_recsys.py#L3207-L3230) Target implementation/context for reviewed change class RecsysTrainer(Trainer):
- [phoenix/xrex/train/trainer_recsys.py:3109–3122](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/phoenix/xrex/train/trainer_recsys.py#L3109-L3122) Baseline implementation/context for reviewed change class RecsysTrainer(Trainer):
- [phoenix/xrex/train/trainer_recsys.py:3236–3248](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/train/trainer_recsys.py#L3236-L3248) Target implementation/context for reviewed change class RecsysTrainer(Trainer):
- [phoenix/xrex/train/follow_data_end.py:144–225](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/train/follow_data_end.py#L144-L225) coordinated follower decision implementation
- [phoenix/xrex/data/parquet_recsys.py:2187–2228](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/data/parquet_recsys.py#L2187-L2228) data end probe and update consumer
- [phoenix/xrex/models/recsys_model.py:1372–1394](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/phoenix/xrex/models/recsys_model.py#L1372-L1394) remaining Page RL architecture constraints

边界：实际训练配置、Kafka offset/checkpoint和生产部署未知。；Public source defaults and named recipe overrides are distinguished from runtime overrides; production deployment, weights and effects remain unknown.

## safety

### visibility-filtering/models/mod.rs

变化：导出Deletion/RequestViewer/ClientSwitch；新增RetweetMerge与五种NotificationKind；PostEntity移除is_reply并增加conversation_root_author_blocks_viewer。

影响：模型为通知分型、删除态和根作者关系接线提供载体，不新增Home分数。

关联：research-02、research-18、research-22。

- [visibility-filtering/models/mod.rs:14–28](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/models/mod.rs#L14-L28) 逐hunk前后语境语义核对；导出Deletion/RequestViewer/ClientSwitch；新增RetweetMerge与五种NotificationKind；PostEntity移除is_reply并增加conversation_root_author_blocks_viewer。
- [visibility-filtering/models/mod.rs:90–123](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/models/mod.rs#L90-L123) 逐hunk前后语境语义核对；导出Deletion/RequestViewer/ClientSwitch；新增RetweetMerge与五种NotificationKind；PostEntity移除is_reply并增加conversation_root_author_blocks_viewer。
- [visibility-filtering/models/mod.rs:216–221](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/models/mod.rs#L216-L221) 逐hunk前后语境语义核对；导出Deletion/RequestViewer/ClientSwitch；新增RetweetMerge与五种NotificationKind；PostEntity移除is_reply并增加conversation_root_author_blocks_viewer。
- [visibility-filtering/models/mod.rs:227–231](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/models/mod.rs#L227-L231) 逐hunk前后语境语义核对；导出Deletion/RequestViewer/ClientSwitch；新增RetweetMerge与五种NotificationKind；PostEntity移除is_reply并增加conversation_root_author_blocks_viewer。
- [visibility-filtering/filter_notifications.rs:22–142](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/filter_notifications.rs#L22-L142) 真实RPC将user/post请求分流，调用post evaluator，逐行经notification_result输出
- [visibility-filtering/ingress.rs:207–242](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/ingress.rs#L207-L242) FilterTweets默认capability且Unmerged；EvaluateTweets解析client switches且Merged
- [visibility-filtering/hydration/store/conversation_root.rs:72–113](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/conversation_root.rs#L72-L113) 根作者来源先以reply_to判断回复，再选pure-core/control/root-post，故非回复不会凭control误加根屏蔽
- [visibility-filtering/hydration/store/resolve.rs:287–290](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/resolve.rs#L287-L290) 所有根作者屏蔽边在hydration层归并为PostEntity布尔字段

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。

### visibility-filtering/models/verdict.rs

变化：Evaluation新增Deleted(Deleted或BounceDeleted)，verdict映射仍NotFound，fail_open_defaults为空。

影响：补充精确删除态；不能把已删内容当新安全标签或排名惩罚。

关联：research-18、research-22。

- [visibility-filtering/models/verdict.rs:310–330](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/models/verdict.rs#L310-L330) 逐hunk前后语境语义核对；Evaluation新增Deleted(Deleted或BounceDeleted)，verdict映射仍NotFound，fail_open_defaults为空。
- [visibility-filtering/models/verdict.rs:333–339](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/models/verdict.rs#L333-L339) 逐hunk前后语境语义核对；Evaluation新增Deleted(Deleted或BounceDeleted)，verdict映射仍NotFound，fail_open_defaults为空。
- [visibility-filtering/models/verdict.rs:353–359](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/models/verdict.rs#L353-L359) 逐hunk前后语境语义核对；Evaluation新增Deleted(Deleted或BounceDeleted)，verdict映射仍NotFound，fail_open_defaults为空。
- [visibility-filtering/treatment.rs:773–787](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/treatment.rs#L773-L787) EvaluateTweets把Deleted/BounceDeleted消费为NotFound(true,isBounceDeleted)，不同于一般NotFound
- [home-mixer/filters/vf_filter.rs:9–27](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/vf_filter.rs#L9-L27) Home真实消费者仅移除Drop/Tombstone/NotEvaluated，不把Downrank/Avoid转为数值乘子

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。

### visibility-filtering/models/viewer.rs

变化：RequestViewer统一正signed-id/非空country及Arc context；六bool改ClientSwitchSet；StaleTweetLimits/FosnrRules默认true，其余四项false，verify unsupported，soft_nsfw false保持。

影响：类型重构不证明线上开关变化；无context使用默认，有context在resolver读取运行时FS。

关联：research-18、research-22。

- [visibility-filtering/models/viewer.rs:1–6](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/models/viewer.rs#L1-L6) 逐hunk前后语境语义核对；RequestViewer统一正signed-id/非空country及Arc context；六bool改ClientSwitchSet；StaleTweetLimits/FosnrRules默认true，其余四项false，verify unsupported，soft_nsfw false保持。
- [visibility-filtering/models/viewer.rs:23–67](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/models/viewer.rs#L23-L67) 逐hunk前后语境语义核对；RequestViewer统一正signed-id/非空country及Arc context；六bool改ClientSwitchSet；StaleTweetLimits/FosnrRules默认true，其余四项false，verify unsupported，soft_nsfw false保持。
- [visibility-filtering/models/viewer.rs:117–245](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/models/viewer.rs#L117-L245) 逐hunk前后语境语义核对；RequestViewer统一正signed-id/非空country及Arc context；六bool改ClientSwitchSet；StaleTweetLimits/FosnrRules默认true，其余四项false，verify unsupported，soft_nsfw false保持。
- [visibility-filtering/ingress.rs:207–242](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/ingress.rs#L207-L242) FilterTweets默认capability且Unmerged；EvaluateTweets解析client switches且Merged

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。

### visibility-filtering/params.rs

变化：SwitchFiles/load/refresh及drift改用Metrics，删除测试Counted；30秒刷新、解析失败保留last good、country refresh流程不变。

影响：无运营规则变化；外部FS仍可覆盖默认且生产配置未知。

关联：C17、research-18。

- [visibility-filtering/params.rs:1–9](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params.rs#L1-L9) 逐hunk前后语境语义核对；SwitchFiles/load/refresh及drift改用Metrics，删除测试Counted；30秒刷新、解析失败保留last good、country refresh流程不变。
- [visibility-filtering/params.rs:18–23](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params.rs#L18-L23) 逐hunk前后语境语义核对；SwitchFiles/load/refresh及drift改用Metrics，删除测试Counted；30秒刷新、解析失败保留last good、country refresh流程不变。
- [visibility-filtering/params.rs:35–40](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params.rs#L35-L40) 逐hunk前后语境语义核对；SwitchFiles/load/refresh及drift改用Metrics，删除测试Counted；30秒刷新、解析失败保留last good、country refresh流程不变。
- [visibility-filtering/params.rs:254–266](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params.rs#L254-L266) 逐hunk前后语境语义核对；SwitchFiles/load/refresh及drift改用Metrics，删除测试Counted；30秒刷新、解析失败保留last good、country refresh流程不变。
- [visibility-filtering/params.rs:271–277](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params.rs#L271-L277) 逐hunk前后语境语义核对；SwitchFiles/load/refresh及drift改用Metrics，删除测试Counted；30秒刷新、解析失败保留last good、country refresh流程不变。
- [visibility-filtering/params.rs:282–294](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params.rs#L282-L294) 逐hunk前后语境语义核对；SwitchFiles/load/refresh及drift改用Metrics，删除测试Counted；30秒刷新、解析失败保留last good、country refresh流程不变。
- [visibility-filtering/params.rs:296–312](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params.rs#L296-L312) 逐hunk前后语境语义核对；SwitchFiles/load/refresh及drift改用Metrics，删除测试Counted；30秒刷新、解析失败保留last good、country refresh流程不变。
- [visibility-filtering/params.rs:344–349](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params.rs#L344-L349) 逐hunk前后语境语义核对；SwitchFiles/load/refresh及drift改用Metrics，删除测试Counted；30秒刷新、解析失败保留last good、country refresh流程不变。
- [visibility-filtering/params.rs:441–468](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params.rs#L441-L468) 逐hunk前后语境语义核对；SwitchFiles/load/refresh及drift改用Metrics，删除测试Counted；30秒刷新、解析失败保留last good、country refresh流程不变。
- [visibility-filtering/params.rs:506–512](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params.rs#L506-L512) 逐hunk前后语境语义核对；SwitchFiles/load/refresh及drift改用Metrics，删除测试Counted；30秒刷新、解析失败保留last good、country refresh流程不变。
- [visibility-filtering/params.rs:514–520](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params.rs#L514-L520) 逐hunk前后语境语义核对；SwitchFiles/load/refresh及drift改用Metrics，删除测试Counted；30秒刷新、解析失败保留last good、country refresh流程不变。
- [visibility-filtering/params/client_switches.rs:136–164](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params/client_switches.rs#L136-L164) 按reason及context/viewer/country匹配动态FS，再调用LimitedActionsPolicies::resolve

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。；实际feature-switch bundle/实验分桶与文案部署内容不由此diff证明。

### visibility-filtering/params/client_switches.rs

变化：六开关key/default由共享枚举驱动；年龄验证支持另列但仍按VARIANTS首个开启项；metrics接线改造。

影响：公开默认与先前相同，非空context才resolve动态客户端配置；软NSFW与limited-actions按独立方法。

关联：C17、research-18。

- [visibility-filtering/params/client_switches.rs:1–50](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params/client_switches.rs#L1-L50) 逐hunk前后语境语义核对；六开关key/default由共享枚举驱动；年龄验证支持另列但仍按VARIANTS首个开启项；metrics接线改造。
- [visibility-filtering/params/client_switches.rs:100–119](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params/client_switches.rs#L100-L119) 逐hunk前后语境语义核对；六开关key/default由共享枚举驱动；年龄验证支持另列但仍按VARIANTS首个开启项；metrics接线改造。
- [visibility-filtering/params/client_switches.rs:139–145](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params/client_switches.rs#L139-L145) 逐hunk前后语境语义核对；六开关key/default由共享枚举驱动；年龄验证支持另列但仍按VARIANTS首个开启项；metrics接线改造。
- [visibility-filtering/params/client_switches.rs:159–165](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params/client_switches.rs#L159-L165) 逐hunk前后语境语义核对；六开关key/default由共享枚举驱动；年龄验证支持另列但仍按VARIANTS首个开启项；metrics接线改造。
- [visibility-filtering/params/client_switches.rs:184–194](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params/client_switches.rs#L184-L194) 逐hunk前后语境语义核对；六开关key/default由共享枚举驱动；年龄验证支持另列但仍按VARIANTS首个开启项；metrics接线改造。
- [visibility-filtering/params/client_switches.rs:231–237](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params/client_switches.rs#L231-L237) 逐hunk前后语境语义核对；六开关key/default由共享枚举驱动；年龄验证支持另列但仍按VARIANTS首个开启项；metrics接线改造。
- [visibility-filtering/params/client_switches.rs:292–298](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params/client_switches.rs#L292-L298) 逐hunk前后语境语义核对；六开关key/default由共享枚举驱动；年龄验证支持另列但仍按VARIANTS首个开启项；metrics接线改造。
- [visibility-filtering/params/client_switches.rs:308–314](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params/client_switches.rs#L308-L314) 逐hunk前后语境语义核对；六开关key/default由共享枚举驱动；年龄验证支持另列但仍按VARIANTS首个开启项；metrics接线改造。
- [visibility-filtering/params/client_switches.rs:328–342](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params/client_switches.rs#L328-L342) 逐hunk前后语境语义核对；六开关key/default由共享枚举驱动；年龄验证支持另列但仍按VARIANTS首个开启项；metrics接线改造。
- [visibility-filtering/params/client_switches.rs:362–372](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params/client_switches.rs#L362-L372) 逐hunk前后语境语义核对；六开关key/default由共享枚举驱动；年龄验证支持另列但仍按VARIANTS首个开启项；metrics接线改造。
- [visibility-filtering/ingress.rs:207–242](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/ingress.rs#L207-L242) FilterTweets默认capability且Unmerged；EvaluateTweets解析client switches且Merged
- [visibility-filtering/params/client_switches.rs:136–164](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params/client_switches.rs#L136-L164) 按reason及context/viewer/country匹配动态FS，再调用LimitedActionsPolicies::resolve

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。；实际feature-switch bundle/实验分桶与文案部署内容不由此diff证明。

### visibility-filtering/params/limited_actions_copy.rs

变化：baked copy key gauge及live metadata drift计数迁移到Metrics；load fail-fast、hash比较、翻译回退算法保持。

影响：只改观测，不据此发布新的互动限制矩阵。

关联：C17、OP08。

- [visibility-filtering/params/limited_actions_copy.rs:1–9](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params/limited_actions_copy.rs#L1-L9) 逐hunk前后语境语义核对；baked copy key gauge及live metadata drift计数迁移到Metrics；load fail-fast、hash比较、翻译回退算法保持。
- [visibility-filtering/params/limited_actions_copy.rs:11–16](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params/limited_actions_copy.rs#L11-L16) 逐hunk前后语境语义核对；baked copy key gauge及live metadata drift计数迁移到Metrics；load fail-fast、hash比较、翻译回退算法保持。
- [visibility-filtering/params/limited_actions_copy.rs:76–82](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params/limited_actions_copy.rs#L76-L82) 逐hunk前后语境语义核对；baked copy key gauge及live metadata drift计数迁移到Metrics；load fail-fast、hash比较、翻译回退算法保持。
- [visibility-filtering/params/limited_actions_copy.rs:85–91](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params/limited_actions_copy.rs#L85-L91) 逐hunk前后语境语义核对；baked copy key gauge及live metadata drift计数迁移到Metrics；load fail-fast、hash比较、翻译回退算法保持。
- [visibility-filtering/params/limited_actions_copy.rs:176–188](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params/limited_actions_copy.rs#L176-L188) 逐hunk前后语境语义核对；baked copy key gauge及live metadata drift计数迁移到Metrics；load fail-fast、hash比较、翻译回退算法保持。
- [visibility-filtering/params/limited_actions_copy.rs:360–372](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params/limited_actions_copy.rs#L360-L372) 逐hunk前后语境语义核对；baked copy key gauge及live metadata drift计数迁移到Metrics；load fail-fast、hash比较、翻译回退算法保持。
- [visibility-filtering/params/client_switches.rs:136–164](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params/client_switches.rs#L136-L164) 按reason及context/viewer/country匹配动态FS，再调用LimitedActionsPolicies::resolve

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。；实际feature-switch bundle/实验分桶与文案部署内容不由此diff证明。

### visibility-filtering/params/limited_actions_policy.rs

变化：missing actions/copy计数器改Metrics，测试记录格式调整；去重reason、空动作skip、prompt可缺失逻辑未变。

影响：C17与OP08边界继续有效：精确动作依动态FS/外部policy，不可从缺文案推断动作失效。

关联：C17、C14、OP08。

- [visibility-filtering/params/limited_actions_policy.rs:1–8](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params/limited_actions_policy.rs#L1-L8) 逐hunk前后语境语义核对；missing actions/copy计数器改Metrics，测试记录格式调整；去重reason、空动作skip、prompt可缺失逻辑未变。
- [visibility-filtering/params/limited_actions_policy.rs:10–15](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params/limited_actions_policy.rs#L10-L15) 逐hunk前后语境语义核对；missing actions/copy计数器改Metrics，测试记录格式调整；去重reason、空动作skip、prompt可缺失逻辑未变。
- [visibility-filtering/params/limited_actions_policy.rs:35–50](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params/limited_actions_policy.rs#L35-L50) 逐hunk前后语境语义核对；missing actions/copy计数器改Metrics，测试记录格式调整；去重reason、空动作skip、prompt可缺失逻辑未变。
- [visibility-filtering/params/limited_actions_policy.rs:121–126](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params/limited_actions_policy.rs#L121-L126) 逐hunk前后语境语义核对；missing actions/copy计数器改Metrics，测试记录格式调整；去重reason、空动作skip、prompt可缺失逻辑未变。
- [visibility-filtering/params/limited_actions_policy.rs:313–325](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params/limited_actions_policy.rs#L313-L325) 逐hunk前后语境语义核对；missing actions/copy计数器改Metrics，测试记录格式调整；去重reason、空动作skip、prompt可缺失逻辑未变。
- [visibility-filtering/params/limited_actions_policy.rs:338–344](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params/limited_actions_policy.rs#L338-L344) 逐hunk前后语境语义核对；missing actions/copy计数器改Metrics，测试记录格式调整；去重reason、空动作skip、prompt可缺失逻辑未变。
- [visibility-filtering/params/limited_actions_policy.rs:362–374](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params/limited_actions_policy.rs#L362-L374) 逐hunk前后语境语义核对；missing actions/copy计数器改Metrics，测试记录格式调整；去重reason、空动作skip、prompt可缺失逻辑未变。
- [visibility-filtering/params/limited_actions_policy.rs:380–394](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params/limited_actions_policy.rs#L380-L394) 逐hunk前后语境语义核对；missing actions/copy计数器改Metrics，测试记录格式调整；去重reason、空动作skip、prompt可缺失逻辑未变。
- [visibility-filtering/params/client_switches.rs:136–164](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/params/client_switches.rs#L136-L164) 按reason及context/viewer/country匹配动态FS，再调用LimitedActionsPolicies::resolve

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。；实际feature-switch bundle/实验分桶与文案部署内容不由此diff证明。

### visibility-filtering/post_evaluator.rs

变化：请求携带RequestViewer与显式RetweetMerge，Metrics脱离语义RPC；NotFound带deletion时保留Deleted；run按Merged决定源帖合并。

影响：真实ingress保留FilterTweets不合并/EvaluateTweets合并语义；增加删除态输出，不改Home动作数值含义。

关联：research-22。

- [visibility-filtering/post_evaluator.rs:3–12](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator.rs#L3-L12) 逐hunk前后语境语义核对；请求携带RequestViewer与显式RetweetMerge，Metrics脱离语义RPC；NotFound带deletion时保留Deleted；run按Merged决定源帖合并。
- [visibility-filtering/post_evaluator.rs:16–22](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator.rs#L16-L22) 逐hunk前后语境语义核对；请求携带RequestViewer与显式RetweetMerge，Metrics脱离语义RPC；NotFound带deletion时保留Deleted；run按Merged决定源帖合并。
- [visibility-filtering/post_evaluator.rs:24–53](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator.rs#L24-L53) 逐hunk前后语境语义核对；请求携带RequestViewer与显式RetweetMerge，Metrics脱离语义RPC；NotFound带deletion时保留Deleted；run按Merged决定源帖合并。
- [visibility-filtering/post_evaluator.rs:64–69](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator.rs#L64-L69) 逐hunk前后语境语义核对；请求携带RequestViewer与显式RetweetMerge，Metrics脱离语义RPC；NotFound带deletion时保留Deleted；run按Merged决定源帖合并。
- [visibility-filtering/post_evaluator.rs:86–92](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator.rs#L86-L92) 逐hunk前后语境语义核对；请求携带RequestViewer与显式RetweetMerge，Metrics脱离语义RPC；NotFound带deletion时保留Deleted；run按Merged决定源帖合并。
- [visibility-filtering/post_evaluator.rs:94–106](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator.rs#L94-L106) 逐hunk前后语境语义核对；请求携带RequestViewer与显式RetweetMerge，Metrics脱离语义RPC；NotFound带deletion时保留Deleted；run按Merged决定源帖合并。
- [visibility-filtering/post_evaluator.rs:108–139](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator.rs#L108-L139) 逐hunk前后语境语义核对；请求携带RequestViewer与显式RetweetMerge，Metrics脱离语义RPC；NotFound带deletion时保留Deleted；run按Merged决定源帖合并。
- [visibility-filtering/post_evaluator.rs:151–164](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator.rs#L151-L164) 逐hunk前后语境语义核对；请求携带RequestViewer与显式RetweetMerge，Metrics脱离语义RPC；NotFound带deletion时保留Deleted；run按Merged决定源帖合并。
- [visibility-filtering/post_evaluator.rs:179–185](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator.rs#L179-L185) 逐hunk前后语境语义核对；请求携带RequestViewer与显式RetweetMerge，Metrics脱离语义RPC；NotFound带deletion时保留Deleted；run按Merged决定源帖合并。
- [visibility-filtering/post_evaluator.rs:204–210](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator.rs#L204-L210) 逐hunk前后语境语义核对；请求携带RequestViewer与显式RetweetMerge，Metrics脱离语义RPC；NotFound带deletion时保留Deleted；run按Merged决定源帖合并。
- [visibility-filtering/post_evaluator.rs:256–269](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator.rs#L256-L269) 逐hunk前后语境语义核对；请求携带RequestViewer与显式RetweetMerge，Metrics脱离语义RPC；NotFound带deletion时保留Deleted；run按Merged决定源帖合并。
- [visibility-filtering/post_evaluator.rs:306–312](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator.rs#L306-L312) 逐hunk前后语境语义核对；请求携带RequestViewer与显式RetweetMerge，Metrics脱离语义RPC；NotFound带deletion时保留Deleted；run按Merged决定源帖合并。
- [visibility-filtering/post_evaluator.rs:317–326](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator.rs#L317-L326) 逐hunk前后语境语义核对；请求携带RequestViewer与显式RetweetMerge，Metrics脱离语义RPC；NotFound带deletion时保留Deleted；run按Merged决定源帖合并。
- [visibility-filtering/post_evaluator.rs:647–653](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator.rs#L647-L653) 逐hunk前后语境语义核对；请求携带RequestViewer与显式RetweetMerge，Metrics脱离语义RPC；NotFound带deletion时保留Deleted；run按Merged决定源帖合并。
- [visibility-filtering/post_evaluator.rs:845–851](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator.rs#L845-L851) 逐hunk前后语境语义核对；请求携带RequestViewer与显式RetweetMerge，Metrics脱离语义RPC；NotFound带deletion时保留Deleted；run按Merged决定源帖合并。
- [visibility-filtering/post_evaluator.rs:925–933](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator.rs#L925-L933) 逐hunk前后语境语义核对；请求携带RequestViewer与显式RetweetMerge，Metrics脱离语义RPC；NotFound带deletion时保留Deleted；run按Merged决定源帖合并。
- [visibility-filtering/ingress.rs:207–242](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/ingress.rs#L207-L242) FilterTweets默认capability且Unmerged；EvaluateTweets解析client switches且Merged
- [visibility-filtering/treatment.rs:773–787](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/treatment.rs#L773-L787) EvaluateTweets把Deleted/BounceDeleted消费为NotFound(true,isBounceDeleted)，不同于一般NotFound
- [home-mixer/filters/vf_filter.rs:9–27](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/vf_filter.rs#L9-L27) Home真实消费者仅移除Drop/Tombstone/NotEvaluated，不把Downrank/Avoid转为数值乘子

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。

### visibility-filtering/post_evaluator/author.rs

变化：evaluate_authors严格只接受QuotePass，evaluate_users只接受Notifications；共享VIEWER_LOOKUPS，传递metrics并容纳Deleted。

影响：避免以“无post规则”猜测用途；引用作者判定与通知actor判定仍分离。

关联：research-17、research-18。

- [visibility-filtering/post_evaluator/author.rs:1–15](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/author.rs#L1-L15) 逐hunk前后语境语义核对；evaluate_authors严格只接受QuotePass，evaluate_users只接受Notifications；共享VIEWER_LOOKUPS，传递metrics并容纳Deleted。
- [visibility-filtering/post_evaluator/author.rs:32–38](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/author.rs#L32-L38) 逐hunk前后语境语义核对；evaluate_authors严格只接受QuotePass，evaluate_users只接受Notifications；共享VIEWER_LOOKUPS，传递metrics并容纳Deleted。
- [visibility-filtering/post_evaluator/author.rs:55–88](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/author.rs#L55-L88) 逐hunk前后语境语义核对；evaluate_authors严格只接受QuotePass，evaluate_users只接受Notifications；共享VIEWER_LOOKUPS，传递metrics并容纳Deleted。
- [visibility-filtering/post_evaluator/author.rs:122–150](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/author.rs#L122-L150) 逐hunk前后语境语义核对；evaluate_authors严格只接受QuotePass，evaluate_users只接受Notifications；共享VIEWER_LOOKUPS，传递metrics并容纳Deleted。
- [visibility-filtering/post_evaluator/author.rs:176–185](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/author.rs#L176-L185) 逐hunk前后语境语义核对；evaluate_authors严格只接受QuotePass，evaluate_users只接受Notifications；共享VIEWER_LOOKUPS，传递metrics并容纳Deleted。
- [visibility-filtering/post_evaluator/author.rs:220–245](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/author.rs#L220-L245) 逐hunk前后语境语义核对；evaluate_authors严格只接受QuotePass，evaluate_users只接受Notifications；共享VIEWER_LOOKUPS，传递metrics并容纳Deleted。
- [visibility-filtering/post_evaluator/author.rs:294–305](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/author.rs#L294-L305) 逐hunk前后语境语义核对；evaluate_authors严格只接受QuotePass，evaluate_users只接受Notifications；共享VIEWER_LOOKUPS，传递metrics并容纳Deleted。
- [visibility-filtering/post_evaluator/author.rs:307–327](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/author.rs#L307-L327) 逐hunk前后语境语义核对；evaluate_authors严格只接受QuotePass，evaluate_users只接受Notifications；共享VIEWER_LOOKUPS，传递metrics并容纳Deleted。
- [visibility-filtering/post_evaluator/author.rs:338–350](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/author.rs#L338-L350) 逐hunk前后语境语义核对；evaluate_authors严格只接受QuotePass，evaluate_users只接受Notifications；共享VIEWER_LOOKUPS，传递metrics并容纳Deleted。
- [visibility-filtering/filter_notifications.rs:22–142](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/filter_notifications.rs#L22-L142) 真实RPC将user/post请求分流，调用post evaluator，逐行经notification_result输出
- [visibility-filtering/treatment.rs:800–840](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/treatment.rs#L800-L840) 通知消费：withheld为Dropped，shown为Allowed；缺数据或fail-open defaults为Failed

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。

### visibility-filtering/post_evaluator/notification.rs

变化：新增按(post,kind,actor)评估；post去重hydration、每kind admission，viewer lookups失败返回None；实际作者与actor不符返回Tweet NotFound。

影响：新通知帖子链有身份一致性和缺数据边界；不等于Home重复内容扣分。

关联：research-18。

- [visibility-filtering/post_evaluator/notification.rs:1–90](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/notification.rs#L1-L90) 逐hunk前后语境语义核对；新增按(post,kind,actor)评估；post去重hydration、每kind admission，viewer lookups失败返回None；实际作者与actor不符返回Tweet NotFound。
- [visibility-filtering/filter_notifications.rs:22–142](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/filter_notifications.rs#L22-L142) 真实RPC将user/post请求分流，调用post evaluator，逐行经notification_result输出
- [visibility-filtering/rules/levels.rs:175–280](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/levels.rs#L175-L280) Mention/Reply绑定帖子安全规则；MediaTagged仅绑定社区外关注过滤及共用user规则
- [visibility-filtering/treatment.rs:800–840](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/treatment.rs#L800-L840) 通知消费：withheld为Dropped，shown为Allowed；缺数据或fail-open defaults为Failed

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。

### visibility-filtering/post_evaluator/retweet.rs

变化：source trace触发由Rpc改RetweetMerge，指标迁移；源Evaluation::Deleted与Partial/NotFound/Failed同属SourceIncomplete，requested Deleted仍RequestedOnly。

影响：合并策略不把不完整源当完整Allow，且默认ingress语义未改。

关联：research-22。

- [visibility-filtering/post_evaluator/retweet.rs:1–14](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/retweet.rs#L1-L14) 逐hunk前后语境语义核对；source trace触发由Rpc改RetweetMerge，指标迁移；源Evaluation::Deleted与Partial/NotFound/Failed同属SourceIncomplete，requested Deleted仍RequestedOnly。
- [visibility-filtering/post_evaluator/retweet.rs:41–52](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/retweet.rs#L41-L52) 逐hunk前后语境语义核对；source trace触发由Rpc改RetweetMerge，指标迁移；源Evaluation::Deleted与Partial/NotFound/Failed同属SourceIncomplete，requested Deleted仍RequestedOnly。
- [visibility-filtering/post_evaluator/retweet.rs:87–95](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/retweet.rs#L87-L95) 逐hunk前后语境语义核对；source trace触发由Rpc改RetweetMerge，指标迁移；源Evaluation::Deleted与Partial/NotFound/Failed同属SourceIncomplete，requested Deleted仍RequestedOnly。
- [visibility-filtering/post_evaluator/retweet.rs:160–169](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/retweet.rs#L160-L169) 逐hunk前后语境语义核对；source trace触发由Rpc改RetweetMerge，指标迁移；源Evaluation::Deleted与Partial/NotFound/Failed同属SourceIncomplete，requested Deleted仍RequestedOnly。
- [visibility-filtering/post_evaluator/retweet.rs:191–200](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/retweet.rs#L191-L200) 逐hunk前后语境语义核对；source trace触发由Rpc改RetweetMerge，指标迁移；源Evaluation::Deleted与Partial/NotFound/Failed同属SourceIncomplete，requested Deleted仍RequestedOnly。
- [visibility-filtering/post_evaluator/retweet.rs:246–255](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/retweet.rs#L246-L255) 逐hunk前后语境语义核对；source trace触发由Rpc改RetweetMerge，指标迁移；源Evaluation::Deleted与Partial/NotFound/Failed同属SourceIncomplete，requested Deleted仍RequestedOnly。
- [visibility-filtering/post_evaluator/retweet.rs:445–451](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/retweet.rs#L445-L451) 逐hunk前后语境语义核对；source trace触发由Rpc改RetweetMerge，指标迁移；源Evaluation::Deleted与Partial/NotFound/Failed同属SourceIncomplete，requested Deleted仍RequestedOnly。
- [visibility-filtering/post_evaluator/retweet.rs:481–487](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/retweet.rs#L481-L487) 逐hunk前后语境语义核对；source trace触发由Rpc改RetweetMerge，指标迁移；源Evaluation::Deleted与Partial/NotFound/Failed同属SourceIncomplete，requested Deleted仍RequestedOnly。
- [visibility-filtering/post_evaluator/retweet.rs:603–609](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/retweet.rs#L603-L609) 逐hunk前后语境语义核对；source trace触发由Rpc改RetweetMerge，指标迁移；源Evaluation::Deleted与Partial/NotFound/Failed同属SourceIncomplete，requested Deleted仍RequestedOnly。
- [visibility-filtering/post_evaluator/retweet.rs:639–645](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/retweet.rs#L639-L645) 逐hunk前后语境语义核对；source trace触发由Rpc改RetweetMerge，指标迁移；源Evaluation::Deleted与Partial/NotFound/Failed同属SourceIncomplete，requested Deleted仍RequestedOnly。
- [visibility-filtering/post_evaluator/retweet.rs:650–656](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/retweet.rs#L650-L656) 逐hunk前后语境语义核对；source trace触发由Rpc改RetweetMerge，指标迁移；源Evaluation::Deleted与Partial/NotFound/Failed同属SourceIncomplete，requested Deleted仍RequestedOnly。
- [visibility-filtering/post_evaluator/retweet.rs:678–684](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/retweet.rs#L678-L684) 逐hunk前后语境语义核对；source trace触发由Rpc改RetweetMerge，指标迁移；源Evaluation::Deleted与Partial/NotFound/Failed同属SourceIncomplete，requested Deleted仍RequestedOnly。
- [visibility-filtering/post_evaluator/retweet.rs:691–698](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/retweet.rs#L691-L698) 逐hunk前后语境语义核对；source trace触发由Rpc改RetweetMerge，指标迁移；源Evaluation::Deleted与Partial/NotFound/Failed同属SourceIncomplete，requested Deleted仍RequestedOnly。
- [visibility-filtering/post_evaluator/retweet.rs:731–737](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/retweet.rs#L731-L737) 逐hunk前后语境语义核对；source trace触发由Rpc改RetweetMerge，指标迁移；源Evaluation::Deleted与Partial/NotFound/Failed同属SourceIncomplete，requested Deleted仍RequestedOnly。
- [visibility-filtering/post_evaluator/retweet.rs:992–998](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/retweet.rs#L992-L998) 逐hunk前后语境语义核对；source trace触发由Rpc改RetweetMerge，指标迁移；源Evaluation::Deleted与Partial/NotFound/Failed同属SourceIncomplete，requested Deleted仍RequestedOnly。
- [visibility-filtering/post_evaluator/retweet.rs:1044–1050](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/retweet.rs#L1044-L1050) 逐hunk前后语境语义核对；source trace触发由Rpc改RetweetMerge，指标迁移；源Evaluation::Deleted与Partial/NotFound/Failed同属SourceIncomplete，requested Deleted仍RequestedOnly。
- [visibility-filtering/post_evaluator/retweet.rs:1116–1122](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/retweet.rs#L1116-L1122) 逐hunk前后语境语义核对；source trace触发由Rpc改RetweetMerge，指标迁移；源Evaluation::Deleted与Partial/NotFound/Failed同属SourceIncomplete，requested Deleted仍RequestedOnly。
- [visibility-filtering/post_evaluator/retweet.rs:1211–1217](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/retweet.rs#L1211-L1217) 逐hunk前后语境语义核对；source trace触发由Rpc改RetweetMerge，指标迁移；源Evaluation::Deleted与Partial/NotFound/Failed同属SourceIncomplete，requested Deleted仍RequestedOnly。
- [visibility-filtering/post_evaluator/retweet.rs:1275–1281](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/retweet.rs#L1275-L1281) 逐hunk前后语境语义核对；source trace触发由Rpc改RetweetMerge，指标迁移；源Evaluation::Deleted与Partial/NotFound/Failed同属SourceIncomplete，requested Deleted仍RequestedOnly。
- [visibility-filtering/post_evaluator/retweet.rs:1303–1309](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/retweet.rs#L1303-L1309) 逐hunk前后语境语义核对；source trace触发由Rpc改RetweetMerge，指标迁移；源Evaluation::Deleted与Partial/NotFound/Failed同属SourceIncomplete，requested Deleted仍RequestedOnly。
- [visibility-filtering/ingress.rs:207–242](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/ingress.rs#L207-L242) FilterTweets默认capability且Unmerged；EvaluateTweets解析client switches且Merged
- [visibility-filtering/treatment.rs:773–787](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/treatment.rs#L773-L787) EvaluateTweets把Deleted/BounceDeleted消费为NotFound(true,isBounceDeleted)，不同于一般NotFound

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。

### visibility-filtering/rules/catalog.rs

变化：catalog遍历全部rule_lists与通知post_kind折叠顺序并去重level名字；添加viewer-gated dashboard覆盖断言。

影响：目录生成/测试变化，不等于生产新规则自动启用。

关联：research-18。

- [visibility-filtering/rules/catalog.rs:45–58](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/catalog.rs#L45-L58) 逐hunk前后语境语义核对；catalog遍历全部rule_lists与通知post_kind折叠顺序并去重level名字；添加viewer-gated dashboard覆盖断言。
- [visibility-filtering/rules/catalog.rs:104–127](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/catalog.rs#L104-L127) 逐hunk前后语境语义核对；catalog遍历全部rule_lists与通知post_kind折叠顺序并去重level名字；添加viewer-gated dashboard覆盖断言。
- [visibility-filtering/rules/catalog.rs:149–189](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/catalog.rs#L149-L189) 逐hunk前后语境语义核对；catalog遍历全部rule_lists与通知post_kind折叠顺序并去重level名字；添加viewer-gated dashboard覆盖断言。
- [visibility-filtering/rules/mod.rs:2–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/mod.rs#L2-L11) catalog、fixtures、golden_corpus均cfg(test)，新增fixture本身不启用生产规则
- [visibility-filtering/rules/levels.rs:175–280](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/levels.rs#L175-L280) Mention/Reply绑定帖子安全规则；MediaTagged仅绑定社区外关注过滤及共用user规则

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。；仅静态读测试源码，未运行测试；不据语料存在宣称生产生效或回归通过。

### visibility-filtering/rules/context.rs

变化：edge断言改is_viewer_edge，删除PostCoreFacts::is_reply访问器。

影响：根屏蔽计算已移hydration，不能以删除is_reply推断非回复也受根屏蔽。

关联：research-02。

- [visibility-filtering/rules/context.rs:125–131](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/context.rs#L125-L131) 逐hunk前后语境语义核对；edge断言改is_viewer_edge，删除PostCoreFacts::is_reply访问器。
- [visibility-filtering/rules/context.rs:175–180](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/context.rs#L175-L180) 逐hunk前后语境语义核对；edge断言改is_viewer_edge，删除PostCoreFacts::is_reply访问器。
- [visibility-filtering/hydration/store/conversation_root.rs:72–113](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/conversation_root.rs#L72-L113) 根作者来源先以reply_to判断回复，再选pure-core/control/root-post，故非回复不会凭control误加根屏蔽
- [visibility-filtering/hydration/store/resolve.rs:287–290](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/resolve.rs#L287-L290) 所有根作者屏蔽边在hydration层归并为PostEntity布尔字段

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。

### visibility-filtering/rules/engine.rs

变化：新增PostKinds独立policy和ActorPosts联合hydration plan；admit_under按具体policy校验计划；新增post_kind evaluate/fold供通知与测试调用。

影响：以通知kind区分规则，不影响Home的consumer边界；无生产启用覆盖证明。

关联：research-18、research-22。

- [visibility-filtering/rules/engine.rs:1–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/engine.rs#L1-L11) 逐hunk前后语境语义核对；新增PostKinds独立policy和ActorPosts联合hydration plan；admit_under按具体policy校验计划；新增post_kind evaluate/fold供通知与测试调用。
- [visibility-filtering/rules/engine.rs:380–391](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/engine.rs#L380-L391) 逐hunk前后语境语义核对；新增PostKinds独立policy和ActorPosts联合hydration plan；admit_under按具体policy校验计划；新增post_kind evaluate/fold供通知与测试调用。
- [visibility-filtering/rules/engine.rs:398–430](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/engine.rs#L398-L430) 逐hunk前后语境语义核对；新增PostKinds独立policy和ActorPosts联合hydration plan；admit_under按具体policy校验计划；新增post_kind evaluate/fold供通知与测试调用。
- [visibility-filtering/rules/engine.rs:457–466](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/engine.rs#L457-L466) 逐hunk前后语境语义核对；新增PostKinds独立policy和ActorPosts联合hydration plan；admit_under按具体policy校验计划；新增post_kind evaluate/fold供通知与测试调用。
- [visibility-filtering/rules/engine.rs:612–636](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/engine.rs#L612-L636) 逐hunk前后语境语义核对；新增PostKinds独立policy和ActorPosts联合hydration plan；admit_under按具体policy校验计划；新增post_kind evaluate/fold供通知与测试调用。
- [visibility-filtering/rules/engine.rs:645–677](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/engine.rs#L645-L677) 逐hunk前后语境语义核对；新增PostKinds独立policy和ActorPosts联合hydration plan；admit_under按具体policy校验计划；新增post_kind evaluate/fold供通知与测试调用。
- [visibility-filtering/rules/engine.rs:682–688](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/engine.rs#L682-L688) 逐hunk前后语境语义核对；新增PostKinds独立policy和ActorPosts联合hydration plan；admit_under按具体policy校验计划；新增post_kind evaluate/fold供通知与测试调用。
- [visibility-filtering/rules/engine.rs:690–698](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/engine.rs#L690-L698) 逐hunk前后语境语义核对；新增PostKinds独立policy和ActorPosts联合hydration plan；admit_under按具体policy校验计划；新增post_kind evaluate/fold供通知与测试调用。
- [visibility-filtering/rules/engine.rs:703–715](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/engine.rs#L703-L715) 逐hunk前后语境语义核对；新增PostKinds独立policy和ActorPosts联合hydration plan；admit_under按具体policy校验计划；新增post_kind evaluate/fold供通知与测试调用。
- [visibility-filtering/rules/engine.rs:724–771](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/engine.rs#L724-L771) 逐hunk前后语境语义核对；新增PostKinds独立policy和ActorPosts联合hydration plan；admit_under按具体policy校验计划；新增post_kind evaluate/fold供通知与测试调用。
- [visibility-filtering/rules/engine.rs:777–783](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/engine.rs#L777-L783) 逐hunk前后语境语义核对；新增PostKinds独立policy和ActorPosts联合hydration plan；admit_under按具体policy校验计划；新增post_kind evaluate/fold供通知与测试调用。
- [visibility-filtering/rules/engine.rs:799–808](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/engine.rs#L799-L808) 逐hunk前后语境语义核对；新增PostKinds独立policy和ActorPosts联合hydration plan；admit_under按具体policy校验计划；新增post_kind evaluate/fold供通知与测试调用。
- [visibility-filtering/rules/engine.rs:811–825](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/engine.rs#L811-L825) 逐hunk前后语境语义核对；新增PostKinds独立policy和ActorPosts联合hydration plan；admit_under按具体policy校验计划；新增post_kind evaluate/fold供通知与测试调用。
- [visibility-filtering/rules/engine.rs:838–861](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/engine.rs#L838-L861) 逐hunk前后语境语义核对；新增PostKinds独立policy和ActorPosts联合hydration plan；admit_under按具体policy校验计划；新增post_kind evaluate/fold供通知与测试调用。
- [visibility-filtering/rules/engine.rs:865–894](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/engine.rs#L865-L894) 逐hunk前后语境语义核对；新增PostKinds独立policy和ActorPosts联合hydration plan；admit_under按具体policy校验计划；新增post_kind evaluate/fold供通知与测试调用。
- [visibility-filtering/rules/engine.rs:908–915](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/engine.rs#L908-L915) 逐hunk前后语境语义核对；新增PostKinds独立policy和ActorPosts联合hydration plan；admit_under按具体policy校验计划；新增post_kind evaluate/fold供通知与测试调用。
- [visibility-filtering/rules/engine.rs:1027–1036](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/engine.rs#L1027-L1036) 逐hunk前后语境语义核对；新增PostKinds独立policy和ActorPosts联合hydration plan；admit_under按具体policy校验计划；新增post_kind evaluate/fold供通知与测试调用。
- [visibility-filtering/rules/engine.rs:1063–1068](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/engine.rs#L1063-L1068) 逐hunk前后语境语义核对；新增PostKinds独立policy和ActorPosts联合hydration plan；admit_under按具体policy校验计划；新增post_kind evaluate/fold供通知与测试调用。
- [visibility-filtering/rules/engine.rs:1072–1106](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/engine.rs#L1072-L1106) 逐hunk前后语境语义核对；新增PostKinds独立policy和ActorPosts联合hydration plan；admit_under按具体policy校验计划；新增post_kind evaluate/fold供通知与测试调用。
- [visibility-filtering/rules/engine.rs:1592–1601](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/engine.rs#L1592-L1601) 逐hunk前后语境语义核对；新增PostKinds独立policy和ActorPosts联合hydration plan；admit_under按具体policy校验计划；新增post_kind evaluate/fold供通知与测试调用。
- [visibility-filtering/rules/engine.rs:1682–1688](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/engine.rs#L1682-L1688) 逐hunk前后语境语义核对；新增PostKinds独立policy和ActorPosts联合hydration plan；admit_under按具体policy校验计划；新增post_kind evaluate/fold供通知与测试调用。
- [visibility-filtering/rules/engine.rs:2068–2083](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/engine.rs#L2068-L2083) 逐hunk前后语境语义核对；新增PostKinds独立policy和ActorPosts联合hydration plan；admit_under按具体policy校验计划；新增post_kind evaluate/fold供通知与测试调用。
- [visibility-filtering/rules/engine.rs:2097–2106](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/engine.rs#L2097-L2106) 逐hunk前后语境语义核对；新增PostKinds独立policy和ActorPosts联合hydration plan；admit_under按具体policy校验计划；新增post_kind evaluate/fold供通知与测试调用。
- [visibility-filtering/rules/engine.rs:2139–2148](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/engine.rs#L2139-L2148) 逐hunk前后语境语义核对；新增PostKinds独立policy和ActorPosts联合hydration plan；admit_under按具体policy校验计划；新增post_kind evaluate/fold供通知与测试调用。
- [visibility-filtering/rules/engine.rs:2178–2190](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/engine.rs#L2178-L2190) 逐hunk前后语境语义核对；新增PostKinds独立policy和ActorPosts联合hydration plan；admit_under按具体policy校验计划；新增post_kind evaluate/fold供通知与测试调用。
- [visibility-filtering/filter_notifications.rs:22–142](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/filter_notifications.rs#L22-L142) 真实RPC将user/post请求分流，调用post evaluator，逐行经notification_result输出
- [visibility-filtering/rules/levels.rs:175–280](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/levels.rs#L175-L280) Mention/Reply绑定帖子安全规则；MediaTagged仅绑定社区外关注过滤及共用user规则
- [home-mixer/filters/vf_filter.rs:9–27](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/vf_filter.rs#L9-L27) Home真实消费者仅移除Drop/Tombstone/NotEvaluated，不把Downrank/Avoid转为数值乘子

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。

### visibility-filtering/rules/expansion.rs

变化：placed接受规则family切片，按family展平parent；仍将非withhold expansion放前、Drop/Tombstone放后并断言总长度。

影响：规则家族重组保留顺序策略，不引入新曝光权重。

关联：research-18。

- [visibility-filtering/rules/expansion.rs:43–57](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/expansion.rs#L43-L57) 逐hunk前后语境语义核对；placed接受规则family切片，按family展平parent；仍将非withhold expansion放前、Drop/Tombstone放后并断言总长度。
- [visibility-filtering/rules/expansion.rs:61–75](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/expansion.rs#L61-L75) 逐hunk前后语境语义核对；placed接受规则family切片，按family展平parent；仍将非withhold expansion放前、Drop/Tombstone放后并断言总长度。
- [visibility-filtering/rules/expansion.rs:113–119](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/expansion.rs#L113-L119) 逐hunk前后语境语义核对；placed接受规则family切片，按family展平parent；仍将非withhold expansion放前、Drop/Tombstone放后并断言总长度。
- [visibility-filtering/rules/tweet_rules.rs:860–875](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L860-L875) reaction gore现仅消费HIGH_PRECISION；成人传播仍NSFW_HIGH_PRECISION

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。

### visibility-filtering/rules/fixtures.rs

变化：ClientClass改switch集合，保留现代/legacy/安卓旧版默认；with_edge仅viewer边且禁止根边，新增root_author_blocks_viewer builder、删除reply builder。

影响：测试建模追随hydration归并，fixture不能证明生产设置。

关联：research-02、research-18。

- [visibility-filtering/rules/fixtures.rs:1–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/fixtures.rs#L1-L11) 逐hunk前后语境语义核对；ClientClass改switch集合，保留现代/legacy/安卓旧版默认；with_edge仅viewer边且禁止根边，新增root_author_blocks_viewer builder、删除reply builder。
- [visibility-filtering/rules/fixtures.rs:26–71](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/fixtures.rs#L26-L71) 逐hunk前后语境语义核对；ClientClass改switch集合，保留现代/legacy/安卓旧版默认；with_edge仅viewer边且禁止根边，新增root_author_blocks_viewer builder、删除reply builder。
- [visibility-filtering/rules/fixtures.rs:76–96](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/fixtures.rs#L76-L96) 逐hunk前后语境语义核对；ClientClass改switch集合，保留现代/legacy/安卓旧版默认；with_edge仅viewer边且禁止根边，新增root_author_blocks_viewer builder、删除reply builder。
- [visibility-filtering/rules/fixtures.rs:98–104](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/fixtures.rs#L98-L104) 逐hunk前后语境语义核对；ClientClass改switch集合，保留现代/legacy/安卓旧版默认；with_edge仅viewer边且禁止根边，新增root_author_blocks_viewer builder、删除reply builder。
- [visibility-filtering/rules/fixtures.rs:106–112](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/fixtures.rs#L106-L112) 逐hunk前后语境语义核对；ClientClass改switch集合，保留现代/legacy/安卓旧版默认；with_edge仅viewer边且禁止根边，新增root_author_blocks_viewer builder、删除reply builder。
- [visibility-filtering/rules/fixtures.rs:114–134](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/fixtures.rs#L114-L134) 逐hunk前后语境语义核对；ClientClass改switch集合，保留现代/legacy/安卓旧版默认；with_edge仅viewer边且禁止根边，新增root_author_blocks_viewer builder、删除reply builder。
- [visibility-filtering/rules/fixtures.rs:555–565](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/fixtures.rs#L555-L565) 逐hunk前后语境语义核对；ClientClass改switch集合，保留现代/legacy/安卓旧版默认；with_edge仅viewer边且禁止根边，新增root_author_blocks_viewer builder、删除reply builder。
- [visibility-filtering/rules/fixtures.rs:569–579](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/fixtures.rs#L569-L579) 逐hunk前后语境语义核对；ClientClass改switch集合，保留现代/legacy/安卓旧版默认；with_edge仅viewer边且禁止根边，新增root_author_blocks_viewer builder、删除reply builder。
- [visibility-filtering/rules/fixtures.rs:587–592](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/fixtures.rs#L587-L592) 逐hunk前后语境语义核对；ClientClass改switch集合，保留现代/legacy/安卓旧版默认；with_edge仅viewer边且禁止根边，新增root_author_blocks_viewer builder、删除reply builder。
- [visibility-filtering/rules/mod.rs:2–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/mod.rs#L2-L11) catalog、fixtures、golden_corpus均cfg(test)，新增fixture本身不启用生产规则
- [visibility-filtering/hydration/store/resolve.rs:287–290](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/resolve.rs#L287-L290) 所有根作者屏蔽边在hydration层归并为PostEntity布尔字段

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。；仅静态读测试源码，未运行测试；不据语料存在宣称生产生效或回归通过。

### visibility-filtering/rules/golden_corpus/age_gating.rs

变化：增加Immersive的17岁NSFW drop期望。

影响：补齐已有level条件证据，不是生产新开关。

关联：research-18。

- [visibility-filtering/rules/golden_corpus/age_gating.rs:54–67](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/age_gating.rs#L54-L67) 逐hunk前后语境语义核对；增加Immersive的17岁NSFW drop期望。
- [visibility-filtering/rules/mod.rs:2–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/mod.rs#L2-L11) catalog、fixtures、golden_corpus均cfg(test)，新增fixture本身不启用生产规则
- [visibility-filtering/rules/golden_corpus/mod.rs:186–204](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/mod.rs#L186-L204) golden case按kind调用evaluate_post_kind或普通evaluate/evaluate_user

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。；仅静态读测试源码，未运行测试；不据语料存在宣称生产生效或回归通过。

### visibility-filtering/rules/golden_corpus/age_verification.rs

变化：删除reported NSFW/gore heuristic的client class/国家期望；capability改ClientSwitch。

影响：反映已删除规则；剩余年龄验证仍按国家与client条件。

关联：research-18。

- [visibility-filtering/rules/golden_corpus/age_verification.rs:5–13](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/age_verification.rs#L5-L13) 逐hunk前后语境语义核对；删除reported NSFW/gore heuristic的client class/国家期望；capability改ClientSwitch。
- [visibility-filtering/rules/golden_corpus/age_verification.rs:243–248](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/age_verification.rs#L243-L248) 逐hunk前后语境语义核对；删除reported NSFW/gore heuristic的client class/国家期望；capability改ClientSwitch。
- [visibility-filtering/rules/golden_corpus/age_verification.rs:441–446](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/age_verification.rs#L441-L446) 逐hunk前后语境语义核对；删除reported NSFW/gore heuristic的client class/国家期望；capability改ClientSwitch。
- [visibility-filtering/rules/golden_corpus/age_verification.rs:661–669](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/age_verification.rs#L661-L669) 逐hunk前后语境语义核对；删除reported NSFW/gore heuristic的client class/国家期望；capability改ClientSwitch。
- [visibility-filtering/rules/tweet_rules.rs:850–947](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/visibility-filtering/rules/tweet_rules.rs#L850-L947) 基线存在reported heuristic年龄验证/现代与legacy模糊及双gore来源，目标移除这些绑定
- [visibility-filtering/rules/mod.rs:2–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/mod.rs#L2-L11) catalog、fixtures、golden_corpus均cfg(test)，新增fixture本身不启用生产规则
- [visibility-filtering/rules/golden_corpus/mod.rs:186–204](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/mod.rs#L186-L204) golden case按kind调用evaluate_post_kind或普通evaluate/evaluate_user
- [visibility-filtering/rules/tweet_rules.rs:860–875](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L860-L875) reaction gore现仅消费HIGH_PRECISION；成人传播仍NSFW_HIGH_PRECISION

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。；仅静态读测试源码，未运行测试；不据语料存在宣称生产生效或回归通过。

### visibility-filtering/rules/golden_corpus/author_state.rs

变化：补Recommendations/Immersive对封禁、注销、erased、offboarded及protected作者的drop期望。

影响：扩充每level覆盖，保留NonAuthors/NonFollowers边界。

关联：research-17。

- [visibility-filtering/rules/golden_corpus/author_state.rs:2–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/author_state.rs#L2-L11) 逐hunk前后语境语义核对；补Recommendations/Immersive对封禁、注销、erased、offboarded及protected作者的drop期望。
- [visibility-filtering/rules/golden_corpus/author_state.rs:55–70](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/author_state.rs#L55-L70) 逐hunk前后语境语义核对；补Recommendations/Immersive对封禁、注销、erased、offboarded及protected作者的drop期望。
- [visibility-filtering/rules/golden_corpus/author_state.rs:138–159](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/author_state.rs#L138-L159) 逐hunk前后语境语义核对；补Recommendations/Immersive对封禁、注销、erased、offboarded及protected作者的drop期望。
- [visibility-filtering/rules/golden_corpus/author_state.rs:207–228](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/author_state.rs#L207-L228) 逐hunk前后语境语义核对；补Recommendations/Immersive对封禁、注销、erased、offboarded及protected作者的drop期望。
- [visibility-filtering/rules/golden_corpus/author_state.rs:254–275](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/author_state.rs#L254-L275) 逐hunk前后语境语义核对；补Recommendations/Immersive对封禁、注销、erased、offboarded及protected作者的drop期望。
- [visibility-filtering/rules/golden_corpus/author_state.rs:300–315](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/author_state.rs#L300-L315) 逐hunk前后语境语义核对；补Recommendations/Immersive对封禁、注销、erased、offboarded及protected作者的drop期望。
- [visibility-filtering/rules/mod.rs:2–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/mod.rs#L2-L11) catalog、fixtures、golden_corpus均cfg(test)，新增fixture本身不启用生产规则
- [visibility-filtering/rules/golden_corpus/mod.rs:186–204](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/mod.rs#L186-L204) golden case按kind调用evaluate_post_kind或普通evaluate/evaluate_user
- [visibility-filtering/rules/levels.rs:175–280](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/levels.rs#L175-L280) Mention/Reply绑定帖子安全规则；MediaTagged仅绑定社区外关注过滤及共用user规则

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。；仅静态读测试源码，未运行测试；不据语料存在宣称生产生效或回归通过。

### visibility-filtering/rules/golden_corpus/community.rs

变化：ios旧版fixture以without(CommunityViewerRemovedLimits)代替bool。

影响：不改变旧版viewer-removed限制期望。

关联：research-18。

- [visibility-filtering/rules/golden_corpus/community.rs:1–7](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/community.rs#L1-L7) 逐hunk前后语境语义核对；ios旧版fixture以without(CommunityViewerRemovedLimits)代替bool。
- [visibility-filtering/rules/golden_corpus/community.rs:70–78](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/community.rs#L70-L78) 逐hunk前后语境语义核对；ios旧版fixture以without(CommunityViewerRemovedLimits)代替bool。
- [visibility-filtering/rules/mod.rs:2–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/mod.rs#L2-L11) catalog、fixtures、golden_corpus均cfg(test)，新增fixture本身不启用生产规则
- [visibility-filtering/rules/golden_corpus/mod.rs:186–204](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/mod.rs#L186-L204) golden case按kind调用evaluate_post_kind或普通evaluate/evaluate_user

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。；仅静态读测试源码，未运行测试；不据语料存在宣称生产生效或回归通过。

### visibility-filtering/rules/golden_corpus/exclusive_content.rs

变化：补Recommendations/Immersive non-follower exclusive drop期望。

影响：测试已有专属内容规则，不是新增通用关注门槛。

关联：research-17。

- [visibility-filtering/rules/golden_corpus/exclusive_content.rs:2–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/exclusive_content.rs#L2-L11) 逐hunk前后语境语义核对；补Recommendations/Immersive non-follower exclusive drop期望。
- [visibility-filtering/rules/golden_corpus/exclusive_content.rs:25–40](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/exclusive_content.rs#L25-L40) 逐hunk前后语境语义核对；补Recommendations/Immersive non-follower exclusive drop期望。
- [visibility-filtering/rules/mod.rs:2–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/mod.rs#L2-L11) catalog、fixtures、golden_corpus均cfg(test)，新增fixture本身不启用生产规则
- [visibility-filtering/rules/golden_corpus/mod.rs:186–204](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/mod.rs#L186-L204) golden case按kind调用evaluate_post_kind或普通evaluate/evaluate_user
- [visibility-filtering/rules/levels.rs:175–280](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/levels.rs#L175-L280) Mention/Reply绑定帖子安全规则；MediaTagged仅绑定社区外关注过滤及共用user规则

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。；仅静态读测试源码，未运行测试；不据语料存在宣称生产生效或回归通过。

### visibility-filtering/rules/golden_corpus/interstitial.rs

变化：补Recommendations logged-out/无年龄和Immersive无年龄drop，补NSFW author旗标对关注与非关注的drop。

影响：区分surface的drop与hydration blur，不外推所有NSFW全站删除。

关联：research-18。

- [visibility-filtering/rules/golden_corpus/interstitial.rs:4–13](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/interstitial.rs#L4-L13) 逐hunk前后语境语义核对；补Recommendations logged-out/无年龄和Immersive无年龄drop，补NSFW author旗标对关注与非关注的drop。
- [visibility-filtering/rules/golden_corpus/interstitial.rs:252–281](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/interstitial.rs#L252-L281) 逐hunk前后语境语义核对；补Recommendations logged-out/无年龄和Immersive无年龄drop，补NSFW author旗标对关注与非关注的drop。
- [visibility-filtering/rules/golden_corpus/interstitial.rs:306–327](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/interstitial.rs#L306-L327) 逐hunk前后语境语义核对；补Recommendations logged-out/无年龄和Immersive无年龄drop，补NSFW author旗标对关注与非关注的drop。
- [visibility-filtering/rules/golden_corpus/interstitial.rs:360–373](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/interstitial.rs#L360-L373) 逐hunk前后语境语义核对；补Recommendations logged-out/无年龄和Immersive无年龄drop，补NSFW author旗标对关注与非关注的drop。
- [visibility-filtering/rules/mod.rs:2–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/mod.rs#L2-L11) catalog、fixtures、golden_corpus均cfg(test)，新增fixture本身不启用生产规则
- [visibility-filtering/rules/golden_corpus/mod.rs:186–204](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/mod.rs#L186-L204) golden case按kind调用evaluate_post_kind或普通evaluate/evaluate_user

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。；仅静态读测试源码，未运行测试；不据语料存在宣称生产生效或回归通过。

### visibility-filtering/rules/golden_corpus/legacy_interstitial.rs

变化：删除两项reported-heuristics legacy interstitial fixture。

影响：相应旧规则被移除，不能推断legacy全部移除。

关联：research-18。

- [visibility-filtering/rules/golden_corpus/legacy_interstitial.rs:74–79](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/legacy_interstitial.rs#L74-L79) 逐hunk前后语境语义核对；删除两项reported-heuristics legacy interstitial fixture。
- [visibility-filtering/rules/tweet_rules.rs:850–947](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/visibility-filtering/rules/tweet_rules.rs#L850-L947) 基线存在reported heuristic年龄验证/现代与legacy模糊及双gore来源，目标移除这些绑定
- [visibility-filtering/rules/mod.rs:2–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/mod.rs#L2-L11) catalog、fixtures、golden_corpus均cfg(test)，新增fixture本身不启用生产规则
- [visibility-filtering/rules/golden_corpus/mod.rs:186–204](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/mod.rs#L186-L204) golden case按kind调用evaluate_post_kind或普通evaluate/evaluate_user
- [visibility-filtering/rules/tweet_rules.rs:860–875](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L860-L875) reaction gore现仅消费HIGH_PRECISION；成人传播仍NSFW_HIGH_PRECISION

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。；仅静态读测试源码，未运行测试；不据语料存在宣称生产生效或回归通过。

### visibility-filtering/rules/golden_corpus/mod.rs

变化：Role::Each复用相同期望；logged-out清除根屏蔽；CorpusCase含kind并分型求值；逐level/kind覆盖及六条blur被drop抢先的明确白名单。

影响：增强静态语料组织，证明测试意图而非测试执行或部署。

关联：research-18。

- [visibility-filtering/rules/golden_corpus/mod.rs:15–21](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/mod.rs#L15-L21) 逐hunk前后语境语义核对；Role::Each复用相同期望；logged-out清除根屏蔽；CorpusCase含kind并分型求值；逐level/kind覆盖及六条blur被drop抢先的明确白名单。
- [visibility-filtering/rules/golden_corpus/mod.rs:26–37](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/mod.rs#L26-L37) 逐hunk前后语境语义核对；Role::Each复用相同期望；logged-out清除根屏蔽；CorpusCase含kind并分型求值；逐level/kind覆盖及六条blur被drop抢先的明确白名单。
- [visibility-filtering/rules/golden_corpus/mod.rs:40–46](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/mod.rs#L40-L46) 逐hunk前后语境语义核对；Role::Each复用相同期望；logged-out清除根屏蔽；CorpusCase含kind并分型求值；逐level/kind覆盖及六条blur被drop抢先的明确白名单。
- [visibility-filtering/rules/golden_corpus/mod.rs:50–56](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/mod.rs#L50-L56) 逐hunk前后语境语义核对；Role::Each复用相同期望；logged-out清除根屏蔽；CorpusCase含kind并分型求值；逐level/kind覆盖及六条blur被drop抢先的明确白名单。
- [visibility-filtering/rules/golden_corpus/mod.rs:72–78](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/mod.rs#L72-L78) 逐hunk前后语境语义核对；Role::Each复用相同期望；logged-out清除根屏蔽；CorpusCase含kind并分型求值；逐level/kind覆盖及六条blur被drop抢先的明确白名单。
- [visibility-filtering/rules/golden_corpus/mod.rs:98–156](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/mod.rs#L98-L156) 逐hunk前后语境语义核对；Role::Each复用相同期望；logged-out清除根屏蔽；CorpusCase含kind并分型求值；逐level/kind覆盖及六条blur被drop抢先的明确白名单。
- [visibility-filtering/rules/golden_corpus/mod.rs:160–200](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/mod.rs#L160-L200) 逐hunk前后语境语义核对；Role::Each复用相同期望；logged-out清除根屏蔽；CorpusCase含kind并分型求值；逐level/kind覆盖及六条blur被drop抢先的明确白名单。
- [visibility-filtering/rules/golden_corpus/mod.rs:325–331](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/mod.rs#L325-L331) 逐hunk前后语境语义核对；Role::Each复用相同期望；logged-out清除根屏蔽；CorpusCase含kind并分型求值；逐level/kind覆盖及六条blur被drop抢先的明确白名单。
- [visibility-filtering/rules/golden_corpus/mod.rs:340–346](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/mod.rs#L340-L346) 逐hunk前后语境语义核对；Role::Each复用相同期望；logged-out清除根屏蔽；CorpusCase含kind并分型求值；逐level/kind覆盖及六条blur被drop抢先的明确白名单。
- [visibility-filtering/rules/golden_corpus/mod.rs:382–397](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/mod.rs#L382-L397) 逐hunk前后语境语义核对；Role::Each复用相同期望；logged-out清除根屏蔽；CorpusCase含kind并分型求值；逐level/kind覆盖及六条blur被drop抢先的明确白名单。
- [visibility-filtering/rules/golden_corpus/mod.rs:411–426](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/mod.rs#L411-L426) 逐hunk前后语境语义核对；Role::Each复用相同期望；logged-out清除根屏蔽；CorpusCase含kind并分型求值；逐level/kind覆盖及六条blur被drop抢先的明确白名单。
- [visibility-filtering/rules/golden_corpus/mod.rs:428–434](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/mod.rs#L428-L434) 逐hunk前后语境语义核对；Role::Each复用相同期望；logged-out清除根屏蔽；CorpusCase含kind并分型求值；逐level/kind覆盖及六条blur被drop抢先的明确白名单。
- [visibility-filtering/rules/golden_corpus/mod.rs:444–573](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/mod.rs#L444-L573) 逐hunk前后语境语义核对；Role::Each复用相同期望；logged-out清除根屏蔽；CorpusCase含kind并分型求值；逐level/kind覆盖及六条blur被drop抢先的明确白名单。
- [visibility-filtering/rules/mod.rs:2–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/mod.rs#L2-L11) catalog、fixtures、golden_corpus均cfg(test)，新增fixture本身不启用生产规则
- [visibility-filtering/rules/golden_corpus/mod.rs:186–204](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/mod.rs#L186-L204) golden case按kind调用evaluate_post_kind或普通evaluate/evaluate_user
- [visibility-filtering/rules/levels.rs:175–280](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/levels.rs#L175-L280) Mention/Reply绑定帖子安全规则；MediaTagged仅绑定社区外关注过滤及共用user规则
- [visibility-filtering/treatment.rs:800–840](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/treatment.rs#L800-L840) 通知消费：withheld为Dropped，shown为Allowed；缺数据或fail-open defaults为Failed

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。；仅静态读测试源码，未运行测试；不据语料存在宣称生产生效或回归通过。

### visibility-filtering/rules/golden_corpus/notifications.rs

变化：共用actor cases参数化only-followed规则；新增post_kind_cases，把actor关系/状态套入PostCandidate并保留self/follower场景。

影响：确认通知actor层适用于各post kind，帖子层另行判断。

关联：research-18。

- [visibility-filtering/rules/golden_corpus/notifications.rs:1–10](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/notifications.rs#L1-L10) 逐hunk前后语境语义核对；共用actor cases参数化only-followed规则；新增post_kind_cases，把actor关系/状态套入PostCandidate并保留self/follower场景。
- [visibility-filtering/rules/golden_corpus/notifications.rs:41–47](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/notifications.rs#L41-L47) 逐hunk前后语境语义核对；共用actor cases参数化only-followed规则；新增post_kind_cases，把actor关系/状态套入PostCandidate并保留self/follower场景。
- [visibility-filtering/rules/golden_corpus/notifications.rs:101–110](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/notifications.rs#L101-L110) 逐hunk前后语境语义核对；共用actor cases参数化only-followed规则；新增post_kind_cases，把actor关系/状态套入PostCandidate并保留self/follower场景。
- [visibility-filtering/rules/golden_corpus/notifications.rs:270–276](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/notifications.rs#L270-L276) 逐hunk前后语境语义核对；共用actor cases参数化only-followed规则；新增post_kind_cases，把actor关系/状态套入PostCandidate并保留self/follower场景。
- [visibility-filtering/rules/golden_corpus/notifications.rs:423–477](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/notifications.rs#L423-L477) 逐hunk前后语境语义核对；共用actor cases参数化only-followed规则；新增post_kind_cases，把actor关系/状态套入PostCandidate并保留self/follower场景。
- [visibility-filtering/rules/mod.rs:2–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/mod.rs#L2-L11) catalog、fixtures、golden_corpus均cfg(test)，新增fixture本身不启用生产规则
- [visibility-filtering/rules/golden_corpus/mod.rs:186–204](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/mod.rs#L186-L204) golden case按kind调用evaluate_post_kind或普通evaluate/evaluate_user
- [visibility-filtering/rules/levels.rs:175–280](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/levels.rs#L175-L280) Mention/Reply绑定帖子安全规则；MediaTagged仅绑定社区外关注过滤及共用user规则
- [visibility-filtering/treatment.rs:800–840](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/treatment.rs#L800-L840) 通知消费：withheld为Dropped，shown为Allowed；缺数据或fail-open defaults为Failed

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。；仅静态读测试源码，未运行测试；不据语料存在宣称生产生效或回归通过。

### visibility-filtering/rules/golden_corpus/oon_media.rs

变化：新增Immersive DMCA与geo restricted media drop期望。

影响：每level语料补齐，不代表其他surface新受影响。

关联：research-18。

- [visibility-filtering/rules/golden_corpus/oon_media.rs:24–37](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/oon_media.rs#L24-L37) 逐hunk前后语境语义核对；新增Immersive DMCA与geo restricted media drop期望。
- [visibility-filtering/rules/golden_corpus/oon_media.rs:202–215](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/oon_media.rs#L202-L215) 逐hunk前后语境语义核对；新增Immersive DMCA与geo restricted media drop期望。
- [visibility-filtering/rules/mod.rs:2–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/mod.rs#L2-L11) catalog、fixtures、golden_corpus均cfg(test)，新增fixture本身不启用生产规则
- [visibility-filtering/rules/golden_corpus/mod.rs:186–204](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/mod.rs#L186-L204) golden case按kind调用evaluate_post_kind或普通evaluate/evaluate_user

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。；仅静态读测试源码，未运行测试；不据语料存在宣称生产生效或回归通过。

### visibility-filtering/rules/golden_corpus/oon_tweet_label.rs

变化：用Role::Each保留follower/non-follower期望；增加Immersive malicious-url/do-not-amplify场景；FOSNR client改集合。

影响：没有新固定排名倍率，仍由标签、受众及具体level决定。

关联：research-18。

- [visibility-filtering/rules/golden_corpus/oon_tweet_label.rs:1–8](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/oon_tweet_label.rs#L1-L8) 逐hunk前后语境语义核对；用Role::Each保留follower/non-follower期望；增加Immersive malicious-url/do-not-amplify场景；FOSNR client改集合。
- [visibility-filtering/rules/golden_corpus/oon_tweet_label.rs:23–44](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/oon_tweet_label.rs#L23-L44) 逐hunk前后语境语义核对；用Role::Each保留follower/non-follower期望；增加Immersive malicious-url/do-not-amplify场景；FOSNR client改集合。
- [visibility-filtering/rules/golden_corpus/oon_tweet_label.rs:47–53](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/oon_tweet_label.rs#L47-L53) 逐hunk前后语境语义核对；用Role::Each保留follower/non-follower期望；增加Immersive malicious-url/do-not-amplify场景；FOSNR client改集合。
- [visibility-filtering/rules/golden_corpus/oon_tweet_label.rs:62–82](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/oon_tweet_label.rs#L62-L82) 逐hunk前后语境语义核对；用Role::Each保留follower/non-follower期望；增加Immersive malicious-url/do-not-amplify场景；FOSNR client改集合。
- [visibility-filtering/rules/golden_corpus/oon_tweet_label.rs:85–91](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/oon_tweet_label.rs#L85-L91) 逐hunk前后语境语义核对；用Role::Each保留follower/non-follower期望；增加Immersive malicious-url/do-not-amplify场景；FOSNR client改集合。
- [visibility-filtering/rules/golden_corpus/oon_tweet_label.rs:181–187](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/oon_tweet_label.rs#L181-L187) 逐hunk前后语境语义核对；用Role::Each保留follower/non-follower期望；增加Immersive malicious-url/do-not-amplify场景；FOSNR client改集合。
- [visibility-filtering/rules/golden_corpus/oon_tweet_label.rs:191–197](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/oon_tweet_label.rs#L191-L197) 逐hunk前后语境语义核对；用Role::Each保留follower/non-follower期望；增加Immersive malicious-url/do-not-amplify场景；FOSNR client改集合。
- [visibility-filtering/rules/golden_corpus/oon_tweet_label.rs:316–324](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/oon_tweet_label.rs#L316-L324) 逐hunk前后语境语义核对；用Role::Each保留follower/non-follower期望；增加Immersive malicious-url/do-not-amplify场景；FOSNR client改集合。
- [visibility-filtering/rules/mod.rs:2–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/mod.rs#L2-L11) catalog、fixtures、golden_corpus均cfg(test)，新增fixture本身不启用生产规则
- [visibility-filtering/rules/golden_corpus/mod.rs:186–204](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/mod.rs#L186-L204) golden case按kind调用evaluate_post_kind或普通evaluate/evaluate_user

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。；仅静态读测试源码，未运行测试；不据语料存在宣称生产生效或回归通过。

### visibility-filtering/rules/golden_corpus/oon_user_label.rs

变化：重复受众合并为Role::Each；补Immersive spam/compromised/read-only/impersonation/abusive/do-not-amplify期望。

影响：abusive及do-not-amplify关注者豁免仍保留，不把标签集合统一化。

关联：research-18。

- [visibility-filtering/rules/golden_corpus/oon_user_label.rs:1–9](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/oon_user_label.rs#L1-L9) 逐hunk前后语境语义核对；重复受众合并为Role::Each；补Immersive spam/compromised/read-only/impersonation/abusive/do-not-amplify期望。
- [visibility-filtering/rules/golden_corpus/oon_user_label.rs:14–20](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/oon_user_label.rs#L14-L20) 逐hunk前后语境语义核对；重复受众合并为Role::Each；补Immersive spam/compromised/read-only/impersonation/abusive/do-not-amplify期望。
- [visibility-filtering/rules/golden_corpus/oon_user_label.rs:30–36](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/oon_user_label.rs#L30-L36) 逐hunk前后语境语义核对；重复受众合并为Role::Each；补Immersive spam/compromised/read-only/impersonation/abusive/do-not-amplify期望。
- [visibility-filtering/rules/golden_corpus/oon_user_label.rs:45–65](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/oon_user_label.rs#L45-L65) 逐hunk前后语境语义核对；重复受众合并为Role::Each；补Immersive spam/compromised/read-only/impersonation/abusive/do-not-amplify期望。
- [visibility-filtering/rules/golden_corpus/oon_user_label.rs:68–88](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/oon_user_label.rs#L68-L88) 逐hunk前后语境语义核对；重复受众合并为Role::Each；补Immersive spam/compromised/read-only/impersonation/abusive/do-not-amplify期望。
- [visibility-filtering/rules/golden_corpus/oon_user_label.rs:91–111](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/oon_user_label.rs#L91-L111) 逐hunk前后语境语义核对；重复受众合并为Role::Each；补Immersive spam/compromised/read-only/impersonation/abusive/do-not-amplify期望。
- [visibility-filtering/rules/golden_corpus/oon_user_label.rs:114–134](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/oon_user_label.rs#L114-L134) 逐hunk前后语境语义核对；重复受众合并为Role::Each；补Immersive spam/compromised/read-only/impersonation/abusive/do-not-amplify期望。
- [visibility-filtering/rules/golden_corpus/oon_user_label.rs:137–143](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/oon_user_label.rs#L137-L143) 逐hunk前后语境语义核对；重复受众合并为Role::Each；补Immersive spam/compromised/read-only/impersonation/abusive/do-not-amplify期望。
- [visibility-filtering/rules/golden_corpus/oon_user_label.rs:152–158](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/oon_user_label.rs#L152-L158) 逐hunk前后语境语义核对；重复受众合并为Role::Each；补Immersive spam/compromised/read-only/impersonation/abusive/do-not-amplify期望。
- [visibility-filtering/rules/golden_corpus/oon_user_label.rs:173–200](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/oon_user_label.rs#L173-L200) 逐hunk前后语境语义核对；重复受众合并为Role::Each；补Immersive spam/compromised/read-only/impersonation/abusive/do-not-amplify期望。
- [visibility-filtering/rules/golden_corpus/oon_user_label.rs:216–234](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/oon_user_label.rs#L216-L234) 逐hunk前后语境语义核对；重复受众合并为Role::Each；补Immersive spam/compromised/read-only/impersonation/abusive/do-not-amplify期望。
- [visibility-filtering/rules/mod.rs:2–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/mod.rs#L2-L11) catalog、fixtures、golden_corpus均cfg(test)，新增fixture本身不启用生产规则
- [visibility-filtering/rules/golden_corpus/mod.rs:186–204](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/mod.rs#L186-L204) golden case按kind调用evaluate_post_kind或普通evaluate/evaluate_user

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。；仅静态读测试源码，未运行测试；不据语料存在宣称生产生效或回归通过。

### visibility-filtering/rules/golden_corpus/post_notifications.rs

变化：新增427行语料，Mention/Reply验证社区、stale、spam/PDNA/bounce、exclusive、takedown、年龄及低质/duplicate/UQF；MediaTagged不应用这些帖子规则但仍有actor规则。

影响：低质新日期不drop、UQF仅非关注且开启、社区例外均明确；仅为测试意图。

关联：research-18。

- [visibility-filtering/rules/golden_corpus/post_notifications.rs:1–427](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/post_notifications.rs#L1-L427) 逐hunk前后语境语义核对；新增427行语料，Mention/Reply验证社区、stale、spam/PDNA/bounce、exclusive、takedown、年龄及低质/duplicate/UQF；MediaTagged不应用这些帖子规则但仍有actor规则。
- [visibility-filtering/rules/mod.rs:2–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/mod.rs#L2-L11) catalog、fixtures、golden_corpus均cfg(test)，新增fixture本身不启用生产规则
- [visibility-filtering/rules/golden_corpus/mod.rs:186–204](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/mod.rs#L186-L204) golden case按kind调用evaluate_post_kind或普通evaluate/evaluate_user
- [visibility-filtering/rules/levels.rs:175–280](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/levels.rs#L175-L280) Mention/Reply绑定帖子安全规则；MediaTagged仅绑定社区外关注过滤及共用user规则
- [visibility-filtering/treatment.rs:800–840](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/treatment.rs#L800-L840) 通知消费：withheld为Dropped，shown为Allowed；缺数据或fail-open defaults为Failed

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。；仅静态读测试源码，未运行测试；不据语料存在宣称生产生效或回归通过。

### visibility-filtering/rules/golden_corpus/reaction_video.rs

变化：删除GORE_LABELS双源循环，改仅HIGH_PRECISION的reaction gore row。

影响：对应生产compound移除reported heuristic，不影响成人或保护作者传播规则。

关联：research-18。

- [visibility-filtering/rules/golden_corpus/reaction_video.rs:5–10](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/reaction_video.rs#L5-L10) 逐hunk前后语境语义核对；删除GORE_LABELS双源循环，改仅HIGH_PRECISION的reaction gore row。
- [visibility-filtering/rules/golden_corpus/reaction_video.rs:25–31](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/reaction_video.rs#L25-L31) 逐hunk前后语境语义核对；删除GORE_LABELS双源循环，改仅HIGH_PRECISION的reaction gore row。
- [visibility-filtering/rules/golden_corpus/reaction_video.rs:80–99](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/reaction_video.rs#L80-L99) 逐hunk前后语境语义核对；删除GORE_LABELS双源循环，改仅HIGH_PRECISION的reaction gore row。
- [visibility-filtering/rules/tweet_rules.rs:850–947](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/visibility-filtering/rules/tweet_rules.rs#L850-L947) 基线存在reported heuristic年龄验证/现代与legacy模糊及双gore来源，目标移除这些绑定
- [visibility-filtering/rules/mod.rs:2–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/mod.rs#L2-L11) catalog、fixtures、golden_corpus均cfg(test)，新增fixture本身不启用生产规则
- [visibility-filtering/rules/golden_corpus/mod.rs:186–204](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/mod.rs#L186-L204) golden case按kind调用evaluate_post_kind或普通evaluate/evaluate_user
- [visibility-filtering/rules/tweet_rules.rs:860–875](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L860-L875) reaction gore现仅消费HIGH_PRECISION；成人传播仍NSFW_HIGH_PRECISION

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。；仅静态读测试源码，未运行测试；不据语料存在宣称生产生效或回归通过。

### visibility-filtering/rules/golden_corpus/relationship.rs

变化：补Recommendations/Immersive block/mute/mute-retweet期望；根屏蔽改统一字段，删除原始根边变体。

影响：hydration仍负责区分reply来源，fixture合并不是扩大block范围。

关联：research-02。

- [visibility-filtering/rules/golden_corpus/relationship.rs:1–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/relationship.rs#L1-L11) 逐hunk前后语境语义核对；补Recommendations/Immersive block/mute/mute-retweet期望；根屏蔽改统一字段，删除原始根边变体。
- [visibility-filtering/rules/golden_corpus/relationship.rs:14–75](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/relationship.rs#L14-L75) 逐hunk前后语境语义核对；补Recommendations/Immersive block/mute/mute-retweet期望；根屏蔽改统一字段，删除原始根边变体。
- [visibility-filtering/rules/golden_corpus/relationship.rs:86–117](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/relationship.rs#L86-L117) 逐hunk前后语境语义核对；补Recommendations/Immersive block/mute/mute-retweet期望；根屏蔽改统一字段，删除原始根边变体。
- [visibility-filtering/rules/golden_corpus/relationship.rs:123–129](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/relationship.rs#L123-L129) 逐hunk前后语境语义核对；补Recommendations/Immersive block/mute/mute-retweet期望；根屏蔽改统一字段，删除原始根边变体。
- [visibility-filtering/rules/golden_corpus/relationship.rs:145–151](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/relationship.rs#L145-L151) 逐hunk前后语境语义核对；补Recommendations/Immersive block/mute/mute-retweet期望；根屏蔽改统一字段，删除原始根边变体。
- [visibility-filtering/rules/golden_corpus/relationship.rs:159–165](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/relationship.rs#L159-L165) 逐hunk前后语境语义核对；补Recommendations/Immersive block/mute/mute-retweet期望；根屏蔽改统一字段，删除原始根边变体。
- [visibility-filtering/rules/golden_corpus/relationship.rs:175–179](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/relationship.rs#L175-L179) 逐hunk前后语境语义核对；补Recommendations/Immersive block/mute/mute-retweet期望；根屏蔽改统一字段，删除原始根边变体。
- [visibility-filtering/rules/mod.rs:2–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/mod.rs#L2-L11) catalog、fixtures、golden_corpus均cfg(test)，新增fixture本身不启用生产规则
- [visibility-filtering/rules/golden_corpus/mod.rs:186–204](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/mod.rs#L186-L204) golden case按kind调用evaluate_post_kind或普通evaluate/evaluate_user
- [visibility-filtering/hydration/store/conversation_root.rs:72–113](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/conversation_root.rs#L72-L113) 根作者来源先以reply_to判断回复，再选pure-core/control/root-post，故非回复不会凭control误加根屏蔽
- [visibility-filtering/hydration/store/resolve.rs:287–290](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/resolve.rs#L287-L290) 所有根作者屏蔽边在hydration层归并为PostEntity布尔字段

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。；仅静态读测试源码，未运行测试；不据语料存在宣称生产生效或回归通过。

### visibility-filtering/rules/golden_corpus/takedown.rs

变化：补Recommendations/Immersive global legal及de local-laws drop期望。

影响：地区条件依旧是必要输入，不能解释为全球同一限制。

关联：research-18。

- [visibility-filtering/rules/golden_corpus/takedown.rs:3–12](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/takedown.rs#L3-L12) 逐hunk前后语境语义核对；补Recommendations/Immersive global legal及de local-laws drop期望。
- [visibility-filtering/rules/golden_corpus/takedown.rs:69–90](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/takedown.rs#L69-L90) 逐hunk前后语境语义核对；补Recommendations/Immersive global legal及de local-laws drop期望。
- [visibility-filtering/rules/golden_corpus/takedown.rs:192–213](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/takedown.rs#L192-L213) 逐hunk前后语境语义核对；补Recommendations/Immersive global legal及de local-laws drop期望。
- [visibility-filtering/rules/mod.rs:2–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/mod.rs#L2-L11) catalog、fixtures、golden_corpus均cfg(test)，新增fixture本身不启用生产规则
- [visibility-filtering/rules/golden_corpus/mod.rs:186–204](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/mod.rs#L186-L204) golden case按kind调用evaluate_post_kind或普通evaluate/evaluate_user

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。；仅静态读测试源码，未运行测试；不据语料存在宣称生产生效或回归通过。

### visibility-filtering/rules/golden_corpus/tweet_label.rs

变化：Role::Each折叠重复受众；补Recommendations/Immersive emergency/PDNA/bounce/spam及四FOSNR drop。

影响：作者豁免与emergency Everyone差异保留；增加语料不表示新生产规则。

关联：research-18。

- [visibility-filtering/rules/golden_corpus/tweet_label.rs:5–14](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/tweet_label.rs#L5-L14) 逐hunk前后语境语义核对；Role::Each折叠重复受众；补Recommendations/Immersive emergency/PDNA/bounce/spam及四FOSNR drop。
- [visibility-filtering/rules/golden_corpus/tweet_label.rs:68–96](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/tweet_label.rs#L68-L96) 逐hunk前后语境语义核对；Role::Each折叠重复受众；补Recommendations/Immersive emergency/PDNA/bounce/spam及四FOSNR drop。
- [visibility-filtering/rules/golden_corpus/tweet_label.rs:99–124](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/tweet_label.rs#L99-L124) 逐hunk前后语境语义核对；Role::Each折叠重复受众；补Recommendations/Immersive emergency/PDNA/bounce/spam及四FOSNR drop。
- [visibility-filtering/rules/golden_corpus/tweet_label.rs:127–133](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/tweet_label.rs#L127-L133) 逐hunk前后语境语义核对；Role::Each折叠重复受众；补Recommendations/Immersive emergency/PDNA/bounce/spam及四FOSNR drop。
- [visibility-filtering/rules/golden_corpus/tweet_label.rs:152–167](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/tweet_label.rs#L152-L167) 逐hunk前后语境语义核对；Role::Each折叠重复受众；补Recommendations/Immersive emergency/PDNA/bounce/spam及四FOSNR drop。
- [visibility-filtering/rules/golden_corpus/tweet_label.rs:170–189](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/tweet_label.rs#L170-L189) 逐hunk前后语境语义核对；Role::Each折叠重复受众；补Recommendations/Immersive emergency/PDNA/bounce/spam及四FOSNR drop。
- [visibility-filtering/rules/golden_corpus/tweet_label.rs:213–219](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/tweet_label.rs#L213-L219) 逐hunk前后语境语义核对；Role::Each折叠重复受众；补Recommendations/Immersive emergency/PDNA/bounce/spam及四FOSNR drop。
- [visibility-filtering/rules/golden_corpus/tweet_label.rs:231–261](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/tweet_label.rs#L231-L261) 逐hunk前后语境语义核对；Role::Each折叠重复受众；补Recommendations/Immersive emergency/PDNA/bounce/spam及四FOSNR drop。
- [visibility-filtering/rules/golden_corpus/tweet_label.rs:273–303](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/tweet_label.rs#L273-L303) 逐hunk前后语境语义核对；Role::Each折叠重复受众；补Recommendations/Immersive emergency/PDNA/bounce/spam及四FOSNR drop。
- [visibility-filtering/rules/golden_corpus/tweet_label.rs:323–353](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/tweet_label.rs#L323-L353) 逐hunk前后语境语义核对；Role::Each折叠重复受众；补Recommendations/Immersive emergency/PDNA/bounce/spam及四FOSNR drop。
- [visibility-filtering/rules/golden_corpus/tweet_label.rs:373–394](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/tweet_label.rs#L373-L394) 逐hunk前后语境语义核对；Role::Each折叠重复受众；补Recommendations/Immersive emergency/PDNA/bounce/spam及四FOSNR drop。
- [visibility-filtering/rules/mod.rs:2–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/mod.rs#L2-L11) catalog、fixtures、golden_corpus均cfg(test)，新增fixture本身不启用生产规则
- [visibility-filtering/rules/golden_corpus/mod.rs:186–204](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/mod.rs#L186-L204) golden case按kind调用evaluate_post_kind或普通evaluate/evaluate_user

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。；仅静态读测试源码，未运行测试；不据语料存在宣称生产生效或回归通过。

### visibility-filtering/rules/golden_corpus/tweet_state.rs

变化：补Recommendations nullcast与Recommendations/Immersive stale drop；stale-limits客户端改without。

影响：stale edit与账号年龄不是同概念，不增加发帖频率门槛。

关联：research-18。

- [visibility-filtering/rules/golden_corpus/tweet_state.rs:1–15](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/tweet_state.rs#L1-L15) 逐hunk前后语境语义核对；补Recommendations nullcast与Recommendations/Immersive stale drop；stale-limits客户端改without。
- [visibility-filtering/rules/golden_corpus/tweet_state.rs:29–39](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/tweet_state.rs#L29-L39) 逐hunk前后语境语义核对；补Recommendations nullcast与Recommendations/Immersive stale drop；stale-limits客户端改without。
- [visibility-filtering/rules/golden_corpus/tweet_state.rs:127–155](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/tweet_state.rs#L127-L155) 逐hunk前后语境语义核对；补Recommendations nullcast与Recommendations/Immersive stale drop；stale-limits客户端改without。
- [visibility-filtering/rules/mod.rs:2–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/mod.rs#L2-L11) catalog、fixtures、golden_corpus均cfg(test)，新增fixture本身不启用生产规则
- [visibility-filtering/rules/golden_corpus/mod.rs:186–204](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/golden_corpus/mod.rs#L186-L204) golden case按kind调用evaluate_post_kind或普通evaluate/evaluate_user

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。；仅静态读测试源码，未运行测试；不据语料存在宣称生产生效或回归通过。

### visibility-filtering/rules/mod.rs

变化：重新导出LevelError/LevelSpec/WireLevel与Rpc，SafetyLevel公开导出保留。

影响：模块接口组织变化；实际新行为由safety_level及ingress决定。

关联：无直接运营动作。

- [visibility-filtering/rules/mod.rs:32–39](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/mod.rs#L32-L39) 逐hunk前后语境语义核对；重新导出LevelError/LevelSpec/WireLevel与Rpc，SafetyLevel公开导出保留。
- [visibility-filtering/ingress.rs:207–242](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/ingress.rs#L207-L242) FilterTweets默认capability且Unmerged；EvaluateTweets解析client switches且Merged
- [visibility-filtering/filter_notifications.rs:22–142](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/filter_notifications.rs#L22-L142) 真实RPC将user/post请求分流，调用post evaluator，逐行经notification_result输出

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。

### visibility-filtering/rules/rule_spec.rs

变化：移除两个ReportedHeuristics RuleId；新增OnlyPeopleIFollowOutsideCommunity、LowQuality/DuplicateContent/Smyte及四个UQF RuleId；客户端测试改ClientHas。

影响：应补research-18具体删除/通知范围，不应改写成全部标签删除或全站惩罚。

关联：research-18、OP08。

- [visibility-filtering/rules/rule_spec.rs:42–48](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/rule_spec.rs#L42-L48) 逐hunk前后语境语义核对；移除两个ReportedHeuristics RuleId；新增OnlyPeopleIFollowOutsideCommunity、LowQuality/DuplicateContent/Smyte及四个UQF RuleId；客户端测试改ClientHas。
- [visibility-filtering/rules/rule_spec.rs:86–91](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/rule_spec.rs#L86-L91) 逐hunk前后语境语义核对；移除两个ReportedHeuristics RuleId；新增OnlyPeopleIFollowOutsideCommunity、LowQuality/DuplicateContent/Smyte及四个UQF RuleId；客户端测试改ClientHas。
- [visibility-filtering/rules/rule_spec.rs:103–115](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/rule_spec.rs#L103-L115) 逐hunk前后语境语义核对；移除两个ReportedHeuristics RuleId；新增OnlyPeopleIFollowOutsideCommunity、LowQuality/DuplicateContent/Smyte及四个UQF RuleId；客户端测试改ClientHas。
- [visibility-filtering/rules/rule_spec.rs:846–852](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/rule_spec.rs#L846-L852) 逐hunk前后语境语义核对；移除两个ReportedHeuristics RuleId；新增OnlyPeopleIFollowOutsideCommunity、LowQuality/DuplicateContent/Smyte及四个UQF RuleId；客户端测试改ClientHas。
- [visibility-filtering/rules/rule_spec.rs:951–962](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/rule_spec.rs#L951-L962) 逐hunk前后语境语义核对；移除两个ReportedHeuristics RuleId；新增OnlyPeopleIFollowOutsideCommunity、LowQuality/DuplicateContent/Smyte及四个UQF RuleId；客户端测试改ClientHas。
- [visibility-filtering/rules/rule_spec.rs:968–979](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/rule_spec.rs#L968-L979) 逐hunk前后语境语义核对；移除两个ReportedHeuristics RuleId；新增OnlyPeopleIFollowOutsideCommunity、LowQuality/DuplicateContent/Smyte及四个UQF RuleId；客户端测试改ClientHas。
- [visibility-filtering/rules/tweet_rules.rs:850–947](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/visibility-filtering/rules/tweet_rules.rs#L850-L947) 基线存在reported heuristic年龄验证/现代与legacy模糊及双gore来源，目标移除这些绑定
- [visibility-filtering/rules/tweet_rules.rs:961–1020](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L961-L1020) 通知低质需旧日期；重复/Smyte为NonAuthors；四UQF标签需NonFollowers与UQF开启
- [visibility-filtering/rules/levels.rs:175–280](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/levels.rs#L175-L280) Mention/Reply绑定帖子安全规则；MediaTagged仅绑定社区外关注过滤及共用user规则

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。

### visibility-filtering/rules/rule_spec/conditions.rs

变化：删除REACTED_TO_POST_HAS_GORE_MEDIA_LABEL中HIGH_PRECISION或REPORTED_HEURISTICS组合；规则遍历测试适配lists。

影响：reaction gore处理收窄到HIGH_PRECISION，其他安全条件不由此消失。

关联：research-18。

- [visibility-filtering/rules/rule_spec/conditions.rs:12–17](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/rule_spec/conditions.rs#L12-L17) 逐hunk前后语境语义核对；删除REACTED_TO_POST_HAS_GORE_MEDIA_LABEL中HIGH_PRECISION或REPORTED_HEURISTICS组合；规则遍历测试适配lists。
- [visibility-filtering/rules/rule_spec/conditions.rs:139–147](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/rule_spec/conditions.rs#L139-L147) 逐hunk前后语境语义核对；删除REACTED_TO_POST_HAS_GORE_MEDIA_LABEL中HIGH_PRECISION或REPORTED_HEURISTICS组合；规则遍历测试适配lists。
- [visibility-filtering/rules/tweet_rules.rs:850–947](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/visibility-filtering/rules/tweet_rules.rs#L850-L947) 基线存在reported heuristic年龄验证/现代与legacy模糊及双gore来源，目标移除这些绑定
- [visibility-filtering/rules/tweet_rules.rs:860–875](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L860-L875) reaction gore现仅消费HIGH_PRECISION；成人传播仍NSFW_HIGH_PRECISION

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。

### visibility-filtering/rules/rule_spec/features.rs

变化：ClientSwitch增加Payload文本映射；EdgeFeature REQUIRED断言限制viewer边。

影响：predicate展示名改变但客户端开关判定仍bool；根关系采用独立compound feature。

关联：research-18。

- [visibility-filtering/rules/rule_spec/features.rs:2–8](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/rule_spec/features.rs#L2-L8) 逐hunk前后语境语义核对；ClientSwitch增加Payload文本映射；EdgeFeature REQUIRED断言限制viewer边。
- [visibility-filtering/rules/rule_spec/features.rs:135–146](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/rule_spec/features.rs#L135-L146) 逐hunk前后语境语义核对；ClientSwitch增加Payload文本映射；EdgeFeature REQUIRED断言限制viewer边。
- [visibility-filtering/rules/rule_spec/features.rs:211–218](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/rule_spec/features.rs#L211-L218) 逐hunk前后语境语义核对；ClientSwitch增加Payload文本映射；EdgeFeature REQUIRED断言限制viewer边。
- [visibility-filtering/ingress.rs:207–242](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/ingress.rs#L207-L242) FilterTweets默认capability且Unmerged；EvaluateTweets解析client switches且Merged
- [visibility-filtering/hydration/store/resolve.rs:287–290](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/resolve.rs#L287-L290) 所有根作者屏蔽边在hydration层归并为PostEntity布尔字段

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。

### visibility-filtering/rules/rule_spec/features/compound.rs

变化：根屏蔽从direct||fetched||(control&&is_reply)改读统一字段，REQUIRED保留三个hydrator。

影响：业务归并移到store，先识别真实reply再读来源，不能丢弃来源/failure依赖解读。

关联：research-02、C17。

- [visibility-filtering/rules/rule_spec/features/compound.rs:2–12](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/rule_spec/features/compound.rs#L2-L12) 逐hunk前后语境语义核对；根屏蔽从direct||fetched||(control&&is_reply)改读统一字段，REQUIRED保留三个hydrator。
- [visibility-filtering/rules/rule_spec/features/compound.rs:14–33](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/rule_spec/features/compound.rs#L14-L33) 逐hunk前后语境语义核对；根屏蔽从direct||fetched||(control&&is_reply)改读统一字段，REQUIRED保留三个hydrator。
- [visibility-filtering/rules/rule_spec/features/compound.rs:70–78](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/rule_spec/features/compound.rs#L70-L78) 逐hunk前后语境语义核对；根屏蔽从direct||fetched||(control&&is_reply)改读统一字段，REQUIRED保留三个hydrator。
- [visibility-filtering/hydration/store/conversation_root.rs:72–113](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/conversation_root.rs#L72-L113) 根作者来源先以reply_to判断回复，再选pure-core/control/root-post，故非回复不会凭control误加根屏蔽
- [visibility-filtering/hydration/store/resolve.rs:287–290](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/resolve.rs#L287-L290) 所有根作者屏蔽边在hydration层归并为PostEntity布尔字段

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。

### visibility-filtering/rules/rule_spec/features/request.rs

变化：六个客户端RequestLeaf合并ClientHas(ClientSwitch)，解释器经has(switch)读取集合。

影响：同一resolved capability的表示重构，没有新的默认开关或额外模型加权。

关联：research-18。

- [visibility-filtering/rules/rule_spec/features/request.rs:1–6](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/rule_spec/features/request.rs#L1-L6) 逐hunk前后语境语义核对；六个客户端RequestLeaf合并ClientHas(ClientSwitch)，解释器经has(switch)读取集合。
- [visibility-filtering/rules/rule_spec/features/request.rs:28–34](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/rule_spec/features/request.rs#L28-L34) 逐hunk前后语境语义核对；六个客户端RequestLeaf合并ClientHas(ClientSwitch)，解释器经has(switch)读取集合。
- [visibility-filtering/rules/rule_spec/features/request.rs:54–61](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/rule_spec/features/request.rs#L54-L61) 逐hunk前后语境语义核对；六个客户端RequestLeaf合并ClientHas(ClientSwitch)，解释器经has(switch)读取集合。
- [visibility-filtering/ingress.rs:207–242](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/ingress.rs#L207-L242) FilterTweets默认capability且Unmerged；EvaluateTweets解析client switches且Merged

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。

### visibility-filtering/rules/rule_spec/laws.rs

变化：wired遍历post kinds；新增通知关注边best-effort白名单，客户端活性改枚举；fold/quote等断言适配LevelLists。

影响：静态测试约束随新通知policy扩展，本次未运行这些测试，不能据文件断言已验收。

关联：research-18。

- [visibility-filtering/rules/rule_spec/laws.rs:11–24](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/rule_spec/laws.rs#L11-L24) 逐hunk前后语境语义核对；wired遍历post kinds；新增通知关注边best-effort白名单，客户端活性改枚举；fold/quote等断言适配LevelLists。
- [visibility-filtering/rules/rule_spec/laws.rs:36–45](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/rule_spec/laws.rs#L36-L45) 逐hunk前后语境语义核对；wired遍历post kinds；新增通知关注边best-effort白名单，客户端活性改枚举；fold/quote等断言适配LevelLists。
- [visibility-filtering/rules/rule_spec/laws.rs:211–221](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/rule_spec/laws.rs#L211-L221) 逐hunk前后语境语义核对；wired遍历post kinds；新增通知关注边best-effort白名单，客户端活性改枚举；fold/quote等断言适配LevelLists。
- [visibility-filtering/rules/rule_spec/laws.rs:241–266](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/rule_spec/laws.rs#L241-L266) 逐hunk前后语境语义核对；wired遍历post kinds；新增通知关注边best-effort白名单，客户端活性改枚举；fold/quote等断言适配LevelLists。
- [visibility-filtering/rules/rule_spec/laws.rs:480–517](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/rule_spec/laws.rs#L480-L517) 逐hunk前后语境语义核对；wired遍历post kinds；新增通知关注边best-effort白名单，客户端活性改枚举；fold/quote等断言适配LevelLists。
- [visibility-filtering/rules/rule_spec/laws.rs:529–535](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/rule_spec/laws.rs#L529-L535) 逐hunk前后语境语义核对；wired遍历post kinds；新增通知关注边best-effort白名单，客户端活性改枚举；fold/quote等断言适配LevelLists。
- [visibility-filtering/rules/rule_spec/laws.rs:538–544](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/rule_spec/laws.rs#L538-L544) 逐hunk前后语境语义核对；wired遍历post kinds；新增通知关注边best-effort白名单，客户端活性改枚举；fold/quote等断言适配LevelLists。
- [visibility-filtering/rules/rule_spec/laws.rs:647–656](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/rule_spec/laws.rs#L647-L656) 逐hunk前后语境语义核对；wired遍历post kinds；新增通知关注边best-effort白名单，客户端活性改枚举；fold/quote等断言适配LevelLists。
- [visibility-filtering/rules/rule_spec/laws.rs:683–689](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/rule_spec/laws.rs#L683-L689) 逐hunk前后语境语义核对；wired遍历post kinds；新增通知关注边best-effort白名单，客户端活性改枚举；fold/quote等断言适配LevelLists。
- [visibility-filtering/rules/mod.rs:2–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/mod.rs#L2-L11) catalog、fixtures、golden_corpus均cfg(test)，新增fixture本身不启用生产规则
- [visibility-filtering/treatment.rs:800–840](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/treatment.rs#L800-L840) 通知消费：withheld为Dropped，shown为Allowed；缺数据或fail-open defaults为Failed

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。；仅静态读测试源码，未运行测试；不据语料存在宣称生产生效或回归通过。

### visibility-filtering/rules/safety_level.rs

变化：LevelSpec拆Posts/QuotePass/Notifications，parse区分Unknown/NotServed；WriterV2注册Mention/Reply/MediaTagged，kind映射Users或ActorPosts；Immersive不暴露EvaluateTweets thrift。

影响：明确服务入口和kind范围，保持已有FilterTweets/EvaluateTweets承载集合；新增仅通知帖子支持。

关联：research-18、research-22。

- [visibility-filtering/rules/safety_level.rs:1–20](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/safety_level.rs#L1-L20) 逐hunk前后语境语义核对；LevelSpec拆Posts/QuotePass/Notifications，parse区分Unknown/NotServed；WriterV2注册Mention/Reply/MediaTagged，kind映射Users或ActorPosts；Immersive不暴露EvaluateTweets thrift。
- [visibility-filtering/rules/safety_level.rs:28–70](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/safety_level.rs#L28-L70) 逐hunk前后语境语义核对；LevelSpec拆Posts/QuotePass/Notifications，parse区分Unknown/NotServed；WriterV2注册Mention/Reply/MediaTagged，kind映射Users或ActorPosts；Immersive不暴露EvaluateTweets thrift。
- [visibility-filtering/rules/safety_level.rs:105–313](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/safety_level.rs#L105-L313) 逐hunk前后语境语义核对；LevelSpec拆Posts/QuotePass/Notifications，parse区分Unknown/NotServed；WriterV2注册Mention/Reply/MediaTagged，kind映射Users或ActorPosts；Immersive不暴露EvaluateTweets thrift。
- [visibility-filtering/rules/safety_level.rs:316–327](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/safety_level.rs#L316-L327) 逐hunk前后语境语义核对；LevelSpec拆Posts/QuotePass/Notifications，parse区分Unknown/NotServed；WriterV2注册Mention/Reply/MediaTagged，kind映射Users或ActorPosts；Immersive不暴露EvaluateTweets thrift。
- [visibility-filtering/rules/safety_level.rs:347–357](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/safety_level.rs#L347-L357) 逐hunk前后语境语义核对；LevelSpec拆Posts/QuotePass/Notifications，parse区分Unknown/NotServed；WriterV2注册Mention/Reply/MediaTagged，kind映射Users或ActorPosts；Immersive不暴露EvaluateTweets thrift。
- [visibility-filtering/rules/safety_level.rs:370–388](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/safety_level.rs#L370-L388) 逐hunk前后语境语义核对；LevelSpec拆Posts/QuotePass/Notifications，parse区分Unknown/NotServed；WriterV2注册Mention/Reply/MediaTagged，kind映射Users或ActorPosts；Immersive不暴露EvaluateTweets thrift。
- [visibility-filtering/rules/safety_level.rs:391–397](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/safety_level.rs#L391-L397) 逐hunk前后语境语义核对；LevelSpec拆Posts/QuotePass/Notifications，parse区分Unknown/NotServed；WriterV2注册Mention/Reply/MediaTagged，kind映射Users或ActorPosts；Immersive不暴露EvaluateTweets thrift。
- [visibility-filtering/rules/safety_level.rs:403–431](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/safety_level.rs#L403-L431) 逐hunk前后语境语义核对；LevelSpec拆Posts/QuotePass/Notifications，parse区分Unknown/NotServed；WriterV2注册Mention/Reply/MediaTagged，kind映射Users或ActorPosts；Immersive不暴露EvaluateTweets thrift。
- [visibility-filtering/rules/safety_level.rs:441–447](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/safety_level.rs#L441-L447) 逐hunk前后语境语义核对；LevelSpec拆Posts/QuotePass/Notifications，parse区分Unknown/NotServed；WriterV2注册Mention/Reply/MediaTagged，kind映射Users或ActorPosts；Immersive不暴露EvaluateTweets thrift。
- [visibility-filtering/filter_notifications.rs:22–142](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/filter_notifications.rs#L22-L142) 真实RPC将user/post请求分流，调用post evaluator，逐行经notification_result输出
- [visibility-filtering/rules/levels.rs:175–280](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/levels.rs#L175-L280) Mention/Reply绑定帖子安全规则；MediaTagged仅绑定社区外关注过滤及共用user规则
- [visibility-filtering/ingress.rs:207–242](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/ingress.rs#L207-L242) FilterTweets默认capability且Unmerged；EvaluateTweets解析client switches且Merged

边界：公开代码中的规则/默认及静态调用链已核对；实际生产部署、运行时FS覆盖、请求标签与观看者状态未知。

### visibility-filtering/rules/levels.rs

变化：平铺规则重构为顺序family；保持Home、Recommendations、Immersive已有列表顺序，TimelineHomeHydration移除8条reported heuristic绑定；新增WriterV2 Mention/Reply整组帖子规则、MediaTagged仅社区外only-followed帖子规则，共用通知actor规则。

影响：research-18需明确通知kind与局部删除；重复/UQF不能外推Home统一降权。结构重排不等于推荐级别全面政策变化。

关联：research-18、C14、C17、OP08。

- [visibility-filtering/rules/levels.rs:5–92](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/levels.rs#L5-L92) 完整diff与前后规则families/条件核对：平铺规则重构为顺序family；保持Home、Recommendations、Immersive已有列表顺序，TimelineHomeHydration移除8条reported heuristic绑定；新增WriterV2 Mention/Reply整组帖子规则、MediaTagged仅社区外only-followed帖子规则，共用通知actor规则。
- [visibility-filtering/rules/levels.rs:99–445](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/levels.rs#L99-L445) 完整diff与前后规则families/条件核对：平铺规则重构为顺序family；保持Home、Recommendations、Immersive已有列表顺序，TimelineHomeHydration移除8条reported heuristic绑定；新增WriterV2 Mention/Reply整组帖子规则、MediaTagged仅社区外only-followed帖子规则，共用通知actor规则。
- [visibility-filtering/rules/levels.rs:450–477](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/levels.rs#L450-L477) 完整diff与前后规则families/条件核对：平铺规则重构为顺序family；保持Home、Recommendations、Immersive已有列表顺序，TimelineHomeHydration移除8条reported heuristic绑定；新增WriterV2 Mention/Reply整组帖子规则、MediaTagged仅社区外only-followed帖子规则，共用通知actor规则。
- [visibility-filtering/rules/levels.rs:481–489](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/levels.rs#L481-L489) 完整diff与前后规则families/条件核对：平铺规则重构为顺序family；保持Home、Recommendations、Immersive已有列表顺序，TimelineHomeHydration移除8条reported heuristic绑定；新增WriterV2 Mention/Reply整组帖子规则、MediaTagged仅社区外only-followed帖子规则，共用通知actor规则。
- [visibility-filtering/rules/tweet_rules.rs:850–947](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/visibility-filtering/rules/tweet_rules.rs#L850-L947) 删除前8条直接规则与gore reaction条件
- [visibility-filtering/rules/safety_level.rs:160–184](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/safety_level.rs#L160-L184) WriterV2绑定对应post kind
- [visibility-filtering/post_evaluator/notification.rs:20–89](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/notification.rs#L20-L89) 真实post-kind evaluator与actor一致性检查
- [visibility-filtering/treatment.rs:800–840](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/treatment.rs#L800-L840) 通知最终输出不等于Home数值评分
- [home-mixer/models/brand_safety.rs:82–114](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/models/brand_safety.rs#L82-L114) 两个reported heuristic标签仍进入MediumRisk集合并被compute_verdict消费
- [home-mixer/models/brand_safety.rs:133–170](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/models/brand_safety.rs#L133-L170) v2同样保留两标签及MediumRisk判断
- [home-mixer/candidate_hydrators/ads_brand_safety_vf_hydrator.rs:95–118](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_hydrators/ads_brand_safety_vf_hydrator.rs#L95-L118) 真实hydrator从VF读取标签并由运行时EnableAdsBrandSafetyVerdictV2选择计算路径
- [home-mixer/scored_posts_server.rs:237–247](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scored_posts_server.rs#L237-L247) 两标签仍有proto输出映射

边界：公开静态绑定已核对，实际生产部署、FS覆盖与标签存在性未知；无测试执行。

### visibility-filtering/rules/tweet_rules.rs

变化：新增社区外only-followed、旧日期LOW_QUALITY、DUPLICATE_CONTENT、SMYTE及四项UQF规则；删除NSFW reported的6条与gore reported的2条年龄/模糊规则；reaction gore由两个标签缩至HIGH_PRECISION；六客户端谓词等义改ClientHas。

影响：research-18应记录局部移除而非全站停用，两标签仍供Home品牌安全MediumRisk消费。C14公共利益日期之后的LOW_QUALITY/MISINFO标签interstitial与C17外部limited-actions边界未变。

关联：research-18、C14、C17、OP08。

- [visibility-filtering/rules/tweet_rules.rs:1–6](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L1-L6) 完整diff与前后规则families/条件核对：新增社区外only-followed、旧日期LOW_QUALITY、DUPLICATE_CONTENT、SMYTE及四项UQF规则；删除NSFW reported的6条与gore reported的2条年龄/模糊规则；reaction gore由两个标签缩至HIGH_PRECISION；六客户端谓词等义改ClientHas。
- [visibility-filtering/rules/tweet_rules.rs:18–30](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L18-L30) 完整diff与前后规则families/条件核对：新增社区外only-followed、旧日期LOW_QUALITY、DUPLICATE_CONTENT、SMYTE及四项UQF规则；删除NSFW reported的6条与gore reported的2条年龄/模糊规则；reaction gore由两个标签缩至HIGH_PRECISION；六客户端谓词等义改ClientHas。
- [visibility-filtering/rules/tweet_rules.rs:178–184](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L178-L184) 完整diff与前后规则families/条件核对：新增社区外only-followed、旧日期LOW_QUALITY、DUPLICATE_CONTENT、SMYTE及四项UQF规则；删除NSFW reported的6条与gore reported的2条年龄/模糊规则；reaction gore由两个标签缩至HIGH_PRECISION；六客户端谓词等义改ClientHas。
- [visibility-filtering/rules/tweet_rules.rs:189–195](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L189-L195) 完整diff与前后规则families/条件核对：新增社区外only-followed、旧日期LOW_QUALITY、DUPLICATE_CONTENT、SMYTE及四项UQF规则；删除NSFW reported的6条与gore reported的2条年龄/模糊规则；reaction gore由两个标签缩至HIGH_PRECISION；六客户端谓词等义改ClientHas。
- [visibility-filtering/rules/tweet_rules.rs:201–214](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L201-L214) 完整diff与前后规则families/条件核对：新增社区外only-followed、旧日期LOW_QUALITY、DUPLICATE_CONTENT、SMYTE及四项UQF规则；删除NSFW reported的6条与gore reported的2条年龄/模糊规则；reaction gore由两个标签缩至HIGH_PRECISION；六客户端谓词等义改ClientHas。
- [visibility-filtering/rules/tweet_rules.rs:234–243](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L234-L243) 完整diff与前后规则families/条件核对：新增社区外only-followed、旧日期LOW_QUALITY、DUPLICATE_CONTENT、SMYTE及四项UQF规则；删除NSFW reported的6条与gore reported的2条年龄/模糊规则；reaction gore由两个标签缩至HIGH_PRECISION；六客户端谓词等义改ClientHas。
- [visibility-filtering/rules/tweet_rules.rs:544–550](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L544-L550) 完整diff与前后规则families/条件核对：新增社区外only-followed、旧日期LOW_QUALITY、DUPLICATE_CONTENT、SMYTE及四项UQF规则；删除NSFW reported的6条与gore reported的2条年龄/模糊规则；reaction gore由两个标签缩至HIGH_PRECISION；六客户端谓词等义改ClientHas。
- [visibility-filtering/rules/tweet_rules.rs:568–574](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L568-L574) 完整diff与前后规则families/条件核对：新增社区外only-followed、旧日期LOW_QUALITY、DUPLICATE_CONTENT、SMYTE及四项UQF规则；删除NSFW reported的6条与gore reported的2条年龄/模糊规则；reaction gore由两个标签缩至HIGH_PRECISION；六客户端谓词等义改ClientHas。
- [visibility-filtering/rules/tweet_rules.rs:578–584](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L578-L584) 完整diff与前后规则families/条件核对：新增社区外only-followed、旧日期LOW_QUALITY、DUPLICATE_CONTENT、SMYTE及四项UQF规则；删除NSFW reported的6条与gore reported的2条年龄/模糊规则；reaction gore由两个标签缩至HIGH_PRECISION；六客户端谓词等义改ClientHas。
- [visibility-filtering/rules/tweet_rules.rs:630–636](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L630-L636) 完整diff与前后规则families/条件核对：新增社区外only-followed、旧日期LOW_QUALITY、DUPLICATE_CONTENT、SMYTE及四项UQF规则；删除NSFW reported的6条与gore reported的2条年龄/模糊规则；reaction gore由两个标签缩至HIGH_PRECISION；六客户端谓词等义改ClientHas。
- [visibility-filtering/rules/tweet_rules.rs:640–646](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L640-L646) 完整diff与前后规则families/条件核对：新增社区外only-followed、旧日期LOW_QUALITY、DUPLICATE_CONTENT、SMYTE及四项UQF规则；删除NSFW reported的6条与gore reported的2条年龄/模糊规则；reaction gore由两个标签缩至HIGH_PRECISION；六客户端谓词等义改ClientHas。
- [visibility-filtering/rules/tweet_rules.rs:661–667](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L661-L667) 完整diff与前后规则families/条件核对：新增社区外only-followed、旧日期LOW_QUALITY、DUPLICATE_CONTENT、SMYTE及四项UQF规则；删除NSFW reported的6条与gore reported的2条年龄/模糊规则；reaction gore由两个标签缩至HIGH_PRECISION；六客户端谓词等义改ClientHas。
- [visibility-filtering/rules/tweet_rules.rs:733–739](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L733-L739) 完整diff与前后规则families/条件核对：新增社区外only-followed、旧日期LOW_QUALITY、DUPLICATE_CONTENT、SMYTE及四项UQF规则；删除NSFW reported的6条与gore reported的2条年龄/模糊规则；reaction gore由两个标签缩至HIGH_PRECISION；六客户端谓词等义改ClientHas。
- [visibility-filtering/rules/tweet_rules.rs:743–749](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L743-L749) 完整diff与前后规则families/条件核对：新增社区外only-followed、旧日期LOW_QUALITY、DUPLICATE_CONTENT、SMYTE及四项UQF规则；删除NSFW reported的6条与gore reported的2条年龄/模糊规则；reaction gore由两个标签缩至HIGH_PRECISION；六客户端谓词等义改ClientHas。
- [visibility-filtering/rules/tweet_rules.rs:774–780](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L774-L780) 完整diff与前后规则families/条件核对：新增社区外only-followed、旧日期LOW_QUALITY、DUPLICATE_CONTENT、SMYTE及四项UQF规则；删除NSFW reported的6条与gore reported的2条年龄/模糊规则；reaction gore由两个标签缩至HIGH_PRECISION；六客户端谓词等义改ClientHas。
- [visibility-filtering/rules/tweet_rules.rs:805–811](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L805-L811) 完整diff与前后规则families/条件核对：新增社区外only-followed、旧日期LOW_QUALITY、DUPLICATE_CONTENT、SMYTE及四项UQF规则；删除NSFW reported的6条与gore reported的2条年龄/模糊规则；reaction gore由两个标签缩至HIGH_PRECISION；六客户端谓词等义改ClientHas。
- [visibility-filtering/rules/tweet_rules.rs:853–859](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L853-L859) 完整diff与前后规则families/条件核对：新增社区外only-followed、旧日期LOW_QUALITY、DUPLICATE_CONTENT、SMYTE及四项UQF规则；删除NSFW reported的6条与gore reported的2条年龄/模糊规则；reaction gore由两个标签缩至HIGH_PRECISION；六客户端谓词等义改ClientHas。
- [visibility-filtering/rules/tweet_rules.rs:868–876](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L868-L876) 完整diff与前后规则families/条件核对：新增社区外only-followed、旧日期LOW_QUALITY、DUPLICATE_CONTENT、SMYTE及四项UQF规则；删除NSFW reported的6条与gore reported的2条年龄/模糊规则；reaction gore由两个标签缩至HIGH_PRECISION；六客户端谓词等义改ClientHas。
- [visibility-filtering/rules/tweet_rules.rs:958–1024](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L958-L1024) 完整diff与前后规则families/条件核对：新增社区外only-followed、旧日期LOW_QUALITY、DUPLICATE_CONTENT、SMYTE及四项UQF规则；删除NSFW reported的6条与gore reported的2条年龄/模糊规则；reaction gore由两个标签缩至HIGH_PRECISION；六客户端谓词等义改ClientHas。
- [visibility-filtering/rules/tweet_rules.rs:1129–1135](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L1129-L1135) 完整diff与前后规则families/条件核对：新增社区外only-followed、旧日期LOW_QUALITY、DUPLICATE_CONTENT、SMYTE及四项UQF规则；删除NSFW reported的6条与gore reported的2条年龄/模糊规则；reaction gore由两个标签缩至HIGH_PRECISION；六客户端谓词等义改ClientHas。
- [visibility-filtering/rules/tweet_rules.rs:1214–1222](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L1214-L1222) 完整diff与前后规则families/条件核对：新增社区外only-followed、旧日期LOW_QUALITY、DUPLICATE_CONTENT、SMYTE及四项UQF规则；删除NSFW reported的6条与gore reported的2条年龄/模糊规则；reaction gore由两个标签缩至HIGH_PRECISION；六客户端谓词等义改ClientHas。
- [visibility-filtering/rules/tweet_rules.rs:1229–1244](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/tweet_rules.rs#L1229-L1244) 完整diff与前后规则families/条件核对：新增社区外only-followed、旧日期LOW_QUALITY、DUPLICATE_CONTENT、SMYTE及四项UQF规则；删除NSFW reported的6条与gore reported的2条年龄/模糊规则；reaction gore由两个标签缩至HIGH_PRECISION；六客户端谓词等义改ClientHas。
- [visibility-filtering/rules/tweet_rules.rs:850–947](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/visibility-filtering/rules/tweet_rules.rs#L850-L947) 删除前8条直接规则与gore reaction条件
- [visibility-filtering/rules/safety_level.rs:160–184](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/rules/safety_level.rs#L160-L184) WriterV2绑定对应post kind
- [visibility-filtering/post_evaluator/notification.rs:20–89](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/notification.rs#L20-L89) 真实post-kind evaluator与actor一致性检查
- [visibility-filtering/treatment.rs:800–840](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/treatment.rs#L800-L840) 通知最终输出不等于Home数值评分
- [home-mixer/models/brand_safety.rs:82–114](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/models/brand_safety.rs#L82-L114) 两个reported heuristic标签仍进入MediumRisk集合并被compute_verdict消费
- [home-mixer/models/brand_safety.rs:133–170](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/models/brand_safety.rs#L133-L170) v2同样保留两标签及MediumRisk判断
- [home-mixer/candidate_hydrators/ads_brand_safety_vf_hydrator.rs:95–118](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_hydrators/ads_brand_safety_vf_hydrator.rs#L95-L118) 真实hydrator从VF读取标签并由运行时EnableAdsBrandSafetyVerdictV2选择计算路径
- [home-mixer/scored_posts_server.rs:237–247](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/scored_posts_server.rs#L237-L247) 两标签仍有proto输出映射

边界：公开静态绑定已核对，实际生产部署、FS覆盖与标签存在性未知；无测试执行。

## visibility

### safety-label-source/connect.rs

变化：新增独立LabelClients初始化：并行Manhattan/twemcache、30秒单次超时与指数退避上限15秒，调用方提供总deadline；可选warmer与缓存容量/指标注入。原连接配置从server_deps搬入。

影响：连接可用性和启动并发改变；不改标签判罚、TTL或曝光系数。

关联：research-33。

- [safety-label-source/connect.rs:1–245](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/safety-label-source/connect.rs#L1-L245) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/server_deps.rs:359–423](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/server_deps.rs#L359-L423) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/safety_label_source/decode.rs

变化：重命名迁入 safety-label-source/decode.rs，不是逻辑删除。RawSafetyLabel缩至crate可见，测试编码复用testing辅助；cached value/Manhattan解码及过期字段转换未变。

影响：仅抽包；NOT_FOUND/DELETED缓存项仍为空标签，不能当作帖子删除结论。

关联：research-33。

- [visibility-filtering/safety_label_source/decode.rs:1–190](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/visibility-filtering/safety_label_source/decode.rs#L1-L190) 基线删除/迁出源码；配对目标实现而非只看hash
- [safety-label-source/decode.rs:1–65](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/safety-label-source/decode.rs#L1-L65) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### safety-label-source/decode.rs

变化：从 visibility-filtering/safety_label_source/decode.rs 重命名迁出。RawSafetyLabel缩至crate可见，测试编码复用testing辅助；cached value/Manhattan解码及过期字段转换未变。

影响：仅抽包；NOT_FOUND/DELETED缓存项仍为空标签，不能当作帖子删除结论。

关联：research-33。

- [safety-label-source/decode.rs:1–222](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/safety-label-source/decode.rs#L1-L222) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/safety_label_source/decode.rs:1–50](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/visibility-filtering/safety_label_source/decode.rs#L1-L50) 重命名前源码对照
- [safety-label-source/remote.rs:10–74](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/safety-label-source/remote.rs#L10-L74) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### safety-label-source/lib.rs

变化：建立独立crate，导出LabelClients/SafetyLabelSource/WarmFetcher/错误类型，内部decode/remote不再公开。

影响：模块边界及依赖调整，不是新的标签规则。

关联：research-33。

- [safety-label-source/lib.rs:1–65](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/safety-label-source/lib.rs#L1-L65) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/sources.rs:33–97](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/sources.rs#L33-L97) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### safety-label-source/metrics.rs

变化：标签指标改为显式可选StatsReceiver，计数/直方图保持；lookup成功失败两项移到VF端点。

影响：可观测性变化，无sink只不记指标，不改变结果。

关联：research-33。

- [safety-label-source/metrics.rs:1–139](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/safety-label-source/metrics.rs#L1-L139) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [safety-label-source/remote.rs:93–157](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/safety-label-source/remote.rs#L93-L157) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/safety_label_source/mh_client.rs

变化：重命名迁入 safety-label-source/mh_client.rs，不是逻辑删除。ManhattanLabelFetcher/MhLabelClient改crate可见；512扫描上限、200ms超时、一次重试和tenant不变。

影响：抽包与API收口；并无新的标签数量/处罚阈值。

关联：research-33。

- [visibility-filtering/safety_label_source/mh_client.rs:1–97](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/visibility-filtering/safety_label_source/mh_client.rs#L1-L97) 基线删除/迁出源码；配对目标实现而非只看hash
- [safety-label-source/mh_client.rs:1–65](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/safety-label-source/mh_client.rs#L1-L65) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### safety-label-source/mh_client.rs

变化：从 visibility-filtering/safety_label_source/mh_client.rs 重命名迁出。ManhattanLabelFetcher/MhLabelClient改crate可见；512扫描上限、200ms超时、一次重试和tenant不变。

影响：抽包与API收口；并无新的标签数量/处罚阈值。

关联：research-33。

- [safety-label-source/mh_client.rs:1–97](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/safety-label-source/mh_client.rs#L1-L97) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/safety_label_source/mh_client.rs:1–50](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/visibility-filtering/safety_label_source/mh_client.rs#L1-L50) 重命名前源码对照
- [safety-label-source/connect.rs:70–134](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/safety-label-source/connect.rs#L70-L134) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/safety_label_source/remote.rs

变化：重命名迁入 safety-label-source/remote.rs，不是逻辑删除。RemoteSource/Twemcache/Manhattan注入LabelMetrics；FailureKind与LookupError::new公开。命中、权威not-found、miss及错误fallback分支保持。

影响：读取来源和错误处理语义保持；只有真miss异步warm，缓存故障转Manhattan，不可推成免审。

关联：research-33。

- [visibility-filtering/safety_label_source/remote.rs:1–190](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/visibility-filtering/safety_label_source/remote.rs#L1-L190) 基线删除/迁出源码；配对目标实现而非只看hash
- [safety-label-source/remote.rs:1–65](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/safety-label-source/remote.rs#L1-L65) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### safety-label-source/remote.rs

变化：从 visibility-filtering/safety_label_source/remote.rs 重命名迁出。RemoteSource/Twemcache/Manhattan注入LabelMetrics；FailureKind与LookupError::new公开。命中、权威not-found、miss及错误fallback分支保持。

影响：读取来源和错误处理语义保持；只有真miss异步warm，缓存故障转Manhattan，不可推成免审。

关联：research-33。

- [safety-label-source/remote.rs:1–650](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/safety-label-source/remote.rs#L1-L650) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/safety_label_source/remote.rs:1–50](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/visibility-filtering/safety_label_source/remote.rs#L1-L50) 重命名前源码对照
- [safety-label-source/source.rs:126–190](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/safety-label-source/source.rs#L126-L190) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/safety_label_source/source.rs

变化：重命名迁入 safety-label-source/source.rs，不是逻辑删除。抽出Snowflake时间函数并注入LabelMetrics；本地10秒TTL与返回前按expires_at_msec剔除标签保持。

影响：research-33确认不变；cache_capacity可禁用L1，TTL不是标签寿命，过期不保证排名立即恢复。

关联：research-33。

- [visibility-filtering/safety_label_source/source.rs:1–190](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/visibility-filtering/safety_label_source/source.rs#L1-L190) 基线删除/迁出源码；配对目标实现而非只看hash
- [safety-label-source/source.rs:1–65](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/safety-label-source/source.rs#L1-L65) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### safety-label-source/source.rs

变化：从 visibility-filtering/safety_label_source/source.rs 重命名迁出。抽出Snowflake时间函数并注入LabelMetrics；本地10秒TTL与返回前按expires_at_msec剔除标签保持。

影响：research-33确认不变；cache_capacity可禁用L1，TTL不是标签寿命，过期不保证排名立即恢复。

关联：research-33。

- [safety-label-source/source.rs:1–428](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/safety-label-source/source.rs#L1-L428) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/safety_label_source/source.rs:1–50](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/visibility-filtering/safety_label_source/source.rs#L1-L50) 重命名前源码对照
- [visibility-filtering/get_safety_labels.rs:58–122](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/get_safety_labels.rs#L58-L122) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。；VF调用方容量公开默认1000000，环境配置可设0关闭L1；独立crate本身由调用方给容量，不应称所有消费者均开启缓存。

### safety-label-source/testing.rs

变化：新增FakeLabels builder与Thrift编码辅助，支持label/not_found/failing三类结果，无L1。

影响：fixture支撑抽包后调用链；非生产阈值或新运营规则。本审仅阅读未运行。

关联：无直接运营动作。

- [safety-label-source/testing.rs:1–117](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/safety-label-source/testing.rs#L1-L117) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/sources/fake_backends.rs:582–646](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/sources/fake_backends.rs#L582-L646) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：仅静态审查，未运行测试；生产部署与指标实际读数未知。

### visibility-filtering/safety_label_source/warmer.rs

变化：重命名迁入 safety-label-source/warmer.rs，不是逻辑删除。WarmFetcher公开，Strato适配器移到VF客户端；CacheWarmer注入指标。1024队列、500ms合并、50键分片不变。

影响：异步预热与读取分离，不写新的执法标签；runtime决定是否启用。

关联：research-33。

- [visibility-filtering/safety_label_source/warmer.rs:1–148](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/visibility-filtering/safety_label_source/warmer.rs#L1-L148) 基线删除/迁出源码；配对目标实现而非只看hash
- [safety-label-source/warmer.rs:1–65](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/safety-label-source/warmer.rs#L1-L65) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### safety-label-source/warmer.rs

变化：从 visibility-filtering/safety_label_source/warmer.rs 重命名迁出。WarmFetcher公开，Strato适配器移到VF客户端；CacheWarmer注入指标。1024队列、500ms合并、50键分片不变。

影响：异步预热与读取分离，不写新的执法标签；runtime决定是否启用。

关联：research-33。

- [safety-label-source/warmer.rs:1–129](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/safety-label-source/warmer.rs#L1-L129) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/safety_label_source/warmer.rs:1–50](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/visibility-filtering/safety_label_source/warmer.rs#L1-L50) 重命名前源码对照
- [visibility-filtering/clients/label_warm_client.rs:20–31](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/clients/label_warm_client.rs#L20-L31) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering-client/evaluated.rs

变化：decoder现在接受Thrift NotFound并检查其filtered_reason，仍拒绝Failed和NotEvaluated嵌套动作；into_result_state只替换原Found，保留原Filtered/NotFound/Failed。

影响：删除/查无与RPC失败须分开；不能把not-found一律称为网络故障或全站账号限制。

关联：research-17、research-18。

- [visibility-filtering-client/evaluated.rs:68–75](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering-client/evaluated.rs#L68-L75) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/treatment.rs:773–837](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/treatment.rs#L773-L837) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering-client/notifications.rs

变化：新增NonZeroU64 PostNotification及Mention/Reply/MediaTagged编码；filter_post_notifications固定NOTIFICATIONS_WRITER_V2(72)，共用计数和响应解码。

影响：扩展通知API，不是Home推荐或新曝光门槛。

关联：research-18。

- [visibility-filtering-client/notifications.rs:1–4](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering-client/notifications.rs#L1-L4) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering-client/notifications.rs:37–71](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering-client/notifications.rs#L37-L71) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering-client/notifications.rs:113–137](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering-client/notifications.rs#L113-L137) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering-client/notifications.rs:140–153](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering-client/notifications.rs#L140-L153) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering-client/notifications.rs:161–167](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering-client/notifications.rs#L161-L167) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/filter_notifications.rs:49–113](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/filter_notifications.rs#L49-L113) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering-client/vf_client.rs

变化：删除Strato lookup context的opt_in_blocking可选字段及编码测试；现有StratoVfClient此前固定传None。

影响：当前内置调用者字节语义保持省略字段；不再提供外部显式true/false入口，但不能宣称屏蔽规则全部移除。

关联：research-02、research-18。

- [visibility-filtering-client/vf_client.rs:67–72](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering-client/vf_client.rs#L67-L72) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering-client/vf_client.rs:91–96](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering-client/vf_client.rs#L91-L96) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering-client/vf_client.rs:204–209](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering-client/vf_client.rs#L204-L209) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering-client/vf_client.rs:666–671](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering-client/vf_client.rs#L666-L671) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering-client/vf_client.rs:204–268](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering-client/vf_client.rs#L204-L268) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/bin/vf-gate.rs

变化：命令行门禁改调用Case.ask，支持多RPC；仍仅CallFailed重试一次，timeout搬到verdict_gate。

影响：验收工具扩展，不自动启用生产policy；本审未运行门禁。

关联：无直接运营动作。

- [visibility-filtering/bin/vf-gate.rs:1–10](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/bin/vf-gate.rs#L1-L10) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/bin/vf-gate.rs:17–27](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/bin/vf-gate.rs#L17-L27) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/verdict_gate.rs:187–251](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/verdict_gate.rs#L187-L251) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：仅静态审查，未运行测试；生产部署与指标实际读数未知。

### visibility-filtering/clients/label_warm_client.rs

变化：从旧warmer提取StratoWarmFetcher，仍请求visibility/baseTweetSafetyLabelMap并计错误键数。

影响：保持既有cache warm语义，实际warm开关由config决定。

关联：research-33。

- [visibility-filtering/clients/label_warm_client.rs:1–31](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/clients/label_warm_client.rs#L1-L31) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/server_deps.rs:444–508](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/server_deps.rs#L444-L508) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/clients/mod.rs

变化：登记crate-private label_warm_client模块。

影响：只接入移出的Strato适配器，不改变rule或score。

关联：research-33。

- [visibility-filtering/clients/mod.rs:1–7](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/clients/mod.rs#L1-L7) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/server_deps.rs:4–68](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/server_deps.rs#L4-L68) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/evaluate_tweets.rs

变化：入口level/viewer/candidate规范化移到ingress，显式RequestMetrics；保留按key对齐、未判quote NotEvaluated、limited-actions投影和异步quote比较。新增缺失/删除状态预期与不支持247检查。

影响：运行结果变化经treatment送出NotFound/Deleted，不应当作统一Failed；level和客户端/国家仍影响结果。

关联：research-17、research-18。

- [visibility-filtering/evaluate_tweets.rs:1–21](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/evaluate_tweets.rs#L1-L21) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/evaluate_tweets.rs:48–70](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/evaluate_tweets.rs#L48-L70) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/evaluate_tweets.rs:76–90](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/evaluate_tweets.rs#L76-L90) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/evaluate_tweets.rs:92–107](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/evaluate_tweets.rs#L92-L107) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/evaluate_tweets.rs:122–128](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/evaluate_tweets.rs#L122-L128) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/evaluate_tweets.rs:130–140](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/evaluate_tweets.rs#L130-L140) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/ingress.rs:96–160](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/ingress.rs#L96-L160) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/explain.rs

变化：Explainer统一使用ingress批次构造和RequestViewer，注入Metrics；Deleted显示Judgement::NotFound(Tweet)，ClientSwitchSet公开用于解释。

影响：解释器与服务入口接线一致；解释输出not-found不保留删除细分类，不能单凭它区别删除与查无。

关联：research-17、research-18。

- [visibility-filtering/explain.rs:1–10](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/explain.rs#L1-L10) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/explain.rs:13–31](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/explain.rs#L13-L31) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/explain.rs:37–42](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/explain.rs#L37-L42) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/explain.rs:301–307](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/explain.rs#L301-L307) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/explain.rs:314–320](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/explain.rs#L314-L320) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/explain.rs:326–342](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/explain.rs#L326-L342) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/treatment.rs:773–837](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/treatment.rs#L773-L837) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/filter_notifications.rs

变化：新增user/post两种请求分流；posts按(post,kind,actor)去重评估后按原始行顺序回复，各kind独立计数；已知非通知level为Unimplemented。

影响：通知actor需与真实帖子作者匹配；Mention/Reply可读帖子标签而MediaTagged不一定读取，不能泛化Home。

关联：research-18。

- [visibility-filtering/filter_notifications.rs:1–15](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/filter_notifications.rs#L1-L15) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/filter_notifications.rs:23–141](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/filter_notifications.rs#L23-L141) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/post_evaluator/notification.rs:14–78](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator/notification.rs#L14-L78) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/filter_tweets.rs

变化：规范化与PostBatch生成移到ingress，比较器改收RequestViewer，显式传RequestMetrics；仍返回proto_action。

影响：FilterTweets明确Unmerged，区别EvaluateTweets Merged；Home动作保留/删除表未被此重构改变。

关联：research-18、research-22。

- [visibility-filtering/filter_tweets.rs:1–18](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/filter_tweets.rs#L1-L18) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/filter_tweets.rs:38–51](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/filter_tweets.rs#L38-L51) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/filter_tweets.rs:54–86](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/filter_tweets.rs#L54-L86) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/ingress.rs:206–270](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/ingress.rs#L206-L270) 真实caller/consumer或fixture调用点；用于核对影响范围
- [home-mixer/filters/vf_filter.rs:22–28](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/vf_filter.rs#L22-L28) Home实际消费者只按action保留/移除，无Downrank数值乘子

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/get_safety_labels.rs

变化：改用独立SafetyLabelSource并注入Metrics，lookup计数在endpoint按成功/失败分类；先去重ID的返回编码保持。

影响：研究33保持；标签读取失败与空标签仍可区分，不是隐形取消限制。

关联：research-33。

- [visibility-filtering/get_safety_labels.rs:1–5](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/get_safety_labels.rs#L1-L5) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/get_safety_labels.rs:9–27](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/get_safety_labels.rs#L9-L27) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/get_safety_labels.rs:30–40](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/get_safety_labels.rs#L30-L40) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/get_safety_labels.rs:42–48](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/get_safety_labels.rs#L42-L48) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/get_safety_labels.rs:52–76](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/get_safety_labels.rs#L52-L76) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [safety-label-source/source.rs:115–179](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/safety-label-source/source.rs#L115-L179) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/hydration/execute.rs

变化：增加TweetStates fetch/landing；合并Flock viewer与pair源为带owner/可选viewer的select；超时由plan按实际claimed edges提升到共享边最长预算；指标显式传递。

影响：防止best-effort root抢占must-have订阅边后提前超时；保留请求deadline限制。状态查询是补充信息非排名数值。

关联：research-02、research-18。

- [visibility-filtering/hydration/execute.rs:7–29](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/execute.rs#L7-L29) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/execute.rs:89–99](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/execute.rs#L89-L99) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/execute.rs:103–114](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/execute.rs#L103-L114) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/execute.rs:121–128](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/execute.rs#L121-L128) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/execute.rs:130–136](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/execute.rs#L130-L136) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/execute.rs:138–143](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/execute.rs#L138-L143) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/plan.rs:186–250](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/plan.rs#L186-L250) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/hydration/fallback_cache.rs

变化：resolve_hydration_batch新增Metrics参数，计数和占用量改typed family；fresh/partial/stale/not-found替换和清除逻辑不变。

影响：可观测性重构，不是改变fail-open或缓存权威性；不新增运营规则。

关联：research-18。

- [visibility-filtering/hydration/fallback_cache.rs:7–15](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/fallback_cache.rs#L7-L15) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/fallback_cache.rs:70–76](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/fallback_cache.rs#L70-L76) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/fallback_cache.rs:119–132](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/fallback_cache.rs#L119-L132) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/execute.rs:470–534](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/execute.rs#L470-L534) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/hydration/fetcher.rs

变化：删除Batch计量配置，保留asked_fields按request/related选择；Fetchers增加泛型key以存UserPair。

影响：允许关系edge按source/destination隔离；非用户信誉或新排名规则。

关联：research-02。

- [visibility-filtering/hydration/fetcher.rs:1–5](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/fetcher.rs#L1-L5) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/fetcher.rs:63–68](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/fetcher.rs#L63-L68) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/fetcher.rs:89–100](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/fetcher.rs#L89-L100) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/store/edges.rs:31–85](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/edges.rs#L31-L85) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/hydration/hydrator.rs

变化：新增TweetState(Absent BestEffort)和ActorPosts行；quote pair统一Edge但不需要viewer；明确root block节点集合，用户通知作者取GizmoduckActor。

影响：支持通知/缺帖状态并隔离quote与viewer关系；仍按node stake决定失败处理，非所有失败同一政策。

关联：research-02、research-18。

- [visibility-filtering/hydration/hydrator.rs:2–13](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/hydrator.rs#L2-L13) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/hydrator.rs:54–60](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/hydrator.rs#L54-L60) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/hydrator.rs:62–68](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/hydrator.rs#L62-L68) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/hydrator.rs:117–122](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/hydrator.rs#L117-L122) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/hydrator.rs:150–155](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/hydrator.rs#L150-L155) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/hydrator.rs:169–175](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/hydrator.rs#L169-L175) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/plan.rs:34–98](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/plan.rs#L34-L98) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/hydration/inventory.rs

变化：TesTweet重命名TesTweetForVisibility；新增TesTweetState，去除FlockUserPair和Batch元数据；decides_existence变方法。

影响：只有core/tweet/author/actor决定存在性；tweet-state不决定存在，防止把补充查询误作主判罚。

关联：research-18。

- [visibility-filtering/hydration/inventory.rs:69–85](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/inventory.rs#L69-L85) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/inventory.rs:96–125](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/inventory.rs#L96-L125) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/hydrator.rs:170–234](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/hydrator.rs#L170-L234) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/hydration/metrics.rs

变化：typed Metrics代替全局sink，标签client/method改backend/call并加rpc；新增tweet-state计数，删除hydrator_batch_size及旧直接记录辅助。

影响：监控分组/序列变化，非推荐规则；record_tweet_states返还原HydrationBatch不改答案。

关联：research-18。

- [visibility-filtering/hydration/metrics.rs:1–18](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/metrics.rs#L1-L18) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/metrics.rs:99–107](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/metrics.rs#L99-L107) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/metrics.rs:115–122](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/metrics.rs#L115-L122) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/metrics.rs:125–131](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/metrics.rs#L125-L131) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/metrics.rs:148–184](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/metrics.rs#L148-L184) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/metrics.rs:199–219](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/metrics.rs#L199-L219) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/execute.rs:324–388](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/execute.rs#L324-L388) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/hydration/mod.rs

变化：HydrationRequest携带RetweetMerge与RequestMetrics，HydratedTweet::Unresolved新增deletion字段；execute扩大crate可见。

影响：显式批次语义替代借用Rpc标识；HYDRATION_TIMEOUT1秒/BEST_EFFORT300ms未变且不是曝光门槛。

关联：research-18。

- [visibility-filtering/hydration/mod.rs:1–7](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/mod.rs#L1-L7) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/mod.rs:13–22](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/mod.rs#L13-L22) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/mod.rs:59–67](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/mod.rs#L59-L67) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/mod.rs:76–84](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/mod.rs#L76-L84) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/mod.rs:87–95](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/mod.rs#L87-L95) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/mod.rs:97–103](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/mod.rs#L97-L103) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/post_evaluator.rs:115–179](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/post_evaluator.rs#L115-L179) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/hydration/plan.rs

变化：EvaluateTweets可承载且读取Tweet时自动规划TweetState；新增ActorPosts；edge_ceilings按fetcher+edge取最长，call_deadline按实际claimed edge调整。

影响：合并关系查询时不因先发best-effort group降低must-have预算；实际tweet-state键仅缺失请求帖。

关联：research-18。

- [visibility-filtering/hydration/plan.rs:3–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/plan.rs#L3-L11) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/plan.rs:14–20](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/plan.rs#L14-L20) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/plan.rs:24–30](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/plan.rs#L24-L30) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/plan.rs:32–46](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/plan.rs#L32-L46) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/plan.rs:48–53](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/plan.rs#L48-L53) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/plan.rs:55–67](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/plan.rs#L55-L67) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/store/key_origin.rs:431–495](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/key_origin.rs#L431-L495) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/hydration/relation.rs

变化：RetweetSource的Role::Judged由RetweetMerge控制，不再直接检查Rpc；QuoteOuter对Flock拥有独立fetcher。

影响：EvaluateTweets仍Merged、FilterTweets仍Unmerged；quote关系不会与viewer边共享缓存所有者。

关联：research-02、research-18。

- [visibility-filtering/hydration/relation.rs:1–7](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/relation.rs#L1-L7) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/relation.rs:35–41](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/relation.rs#L35-L41) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/relation.rs:50–56](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/relation.rs#L50-L56) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/relation.rs:66–72](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/relation.rs#L66-L72) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/relation.rs:86–94](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/relation.rs#L86-L94) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/relation.rs:151–157](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/relation.rs#L151-L157) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/ingress.rs:227–291](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/ingress.rs#L227-L291) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/hydration/sources.rs

变化：ProdSources改独立安全标签crate，新增tweet_states经tweetState列解码；select_pair_edges合并到select_edges(owner,Option<viewer>,queries)。

影响：生产适配链明确，非只在fixture中增加状态；owner区分在store执行，后端按query source读取。

关联：research-18、research-33。

- [visibility-filtering/hydration/sources.rs:16–24](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/sources.rs#L16-L24) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/sources.rs:30–36](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/sources.rs#L30-L36) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/sources.rs:52–59](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/sources.rs#L52-L59) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/sources.rs:83–94](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/sources.rs#L83-L94) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/sources.rs:174–187](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/sources.rs#L174-L187) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/sources.rs:263–269](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/sources.rs#L263-L269) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/tweet_source.rs:16–80](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/tweet_source.rs#L16-L80) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/hydration/sources/fake_backends.rs

变化：FakeLabels替代本地Fake cache/Manhattan；加入BounceDeleted Strato模拟与NoteTweet trait适配；Flock按owner合并。

影响：只更新模拟后端以覆盖新接口；不能以fixture说明生产标签或删除率。

关联：无直接运营动作。

- [visibility-filtering/hydration/sources/fake_backends.rs:5–27](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/sources/fake_backends.rs#L5-L27) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/sources/fake_backends.rs:234–243](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/sources/fake_backends.rs#L234-L243) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/sources/fake_backends.rs:319–324](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/sources/fake_backends.rs#L319-L324) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/sources/fake_backends.rs:391–397](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/sources/fake_backends.rs#L391-L397) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/sources/fake_backends.rs:428–434](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/sources/fake_backends.rs#L428-L434) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/sources/fake_backends.rs:560–571](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/sources/fake_backends.rs#L560-L571) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/sources.rs:584–615](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/sources.rs#L584-L615) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：仅静态审查，未运行测试；生产部署与指标实际读数未知。

### visibility-filtering/hydration/sources/in_memory.rs

变化：新增tweet_states fixture map及builder；Flock recording按FetcherId owner隔离；TesTweet标识重命名。

影响：测试数据源变化，不改变真实生产默认；本审未执行测试。

关联：无直接运营动作。

- [visibility-filtering/hydration/sources/in_memory.rs:1–6](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/sources/in_memory.rs#L1-L6) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/sources/in_memory.rs:69–75](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/sources/in_memory.rs#L69-L75) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/sources/in_memory.rs:161–171](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/sources/in_memory.rs#L161-L171) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/sources/in_memory.rs:530–537](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/sources/in_memory.rs#L530-L537) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/sources/in_memory.rs:547–557](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/sources/in_memory.rs#L547-L557) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/sources/in_memory.rs:618–634](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/sources/in_memory.rs#L618-L634) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/scenario.rs:66–130](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/scenario.rs#L66-L130) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：仅静态审查，未运行测试；生产部署与指标实际读数未知。

### visibility-filtering/hydration/store.rs

变化：统一edge状态为按Edge/Owner/UserPair缓存，新增TweetState收集，移除Batch计量；root block失败集仅保留实际读取节点。

影响：影响失败归因和特定关系查询时序，避免无关root失败影响候选；不改Home动作消费。

关联：research-02、research-18。

- [visibility-filtering/hydration/store.rs:4–24](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store.rs#L4-L24) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/store.rs:30–36](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store.rs#L30-L36) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/store.rs:69–98](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store.rs#L69-L98) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/store.rs:114–126](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store.rs#L114-L126) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/store.rs:128–134](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store.rs#L128-L134) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/store.rs:147–158](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store.rs#L147-L158) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/store/resolve.rs:191–255](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/resolve.rs#L191-L255) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/hydration/store/conversation_root.rs

变化：新增RootAuthorBlock Unread/ReadBy/FailedBy，按pure-core/root-post/control来源指定唯一读取节点；second-degree读取使用edge_holds。 conversation_root_author首先要求reply_to存在，因此不是对非回复帖子新增限制。

影响：对实际root关系精确记录失败和edge，根帖/无需root的候选不受无关控制查询失败影响。

关联：research-02、research-18。

- [visibility-filtering/hydration/store/conversation_root.rs:1–7](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/conversation_root.rs#L1-L7) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/store/conversation_root.rs:14–70](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/conversation_root.rs#L14-L70) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/store/conversation_root.rs:127–133](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/conversation_root.rs#L127-L133) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/store.rs:767–831](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store.rs#L767-L831) 真实caller/consumer或fixture调用点；用于核对影响范围
- [visibility-filtering/hydration/store/conversation_root.rs:68–97](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/conversation_root.rs#L68-L97) root作者推导先检查reply_to；非回复直接None

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/hydration/store/edges.rs

变化：新增统一关系边claim/answer/land，以UserPair(source,destination)及owner作为缓存隔离键。

影响：修复quote作者关系与viewer关系潜在共享语义；必须按关系方向解释屏蔽/关注。

关联：research-02、research-18。

- [visibility-filtering/hydration/store/edges.rs:1–85](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/edges.rs#L1-L85) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/store.rs:435–499](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store.rs#L435-L499) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/hydration/store/key_origin.rs

变化：ControlArms合并重复枚举；quote pair来源显式化；MissingRequestTweet仅Merged、原始请求ID、Tweet权威NotFound；ActorPosts邮箱电话键取真实author且由viewer filter控制。

影响：不对所有帖子补查状态，不从request actor推断作者；关系通知机制受输入限定。

关联：research-17、research-18。

- [visibility-filtering/hydration/store/key_origin.rs:1–13](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/key_origin.rs#L1-L13) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/store/key_origin.rs:20–26](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/key_origin.rs#L20-L26) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/store/key_origin.rs:33–46](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/key_origin.rs#L33-L46) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/store/key_origin.rs:55–68](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/key_origin.rs#L55-L68) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/store/key_origin.rs:74–117](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/key_origin.rs#L74-L117) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/store/key_origin.rs:208–220](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/key_origin.rs#L208-L220) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/store/resolve.rs:34–98](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/resolve.rs#L34-L98) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/hydration/store/quotes.rs

变化：删除独立PairEdge缓存/landing，改共用owner-aware Edge fetcher；pair取向转交KeyOrigin，仍同作者无需查询、protected作者才查关注。

影响：重构保持quote pair判定方向及失败分支，隔离viewer关系；shadow不改主响应。

关联：research-02、research-18。

- [visibility-filtering/hydration/store/quotes.rs:1–18](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/quotes.rs#L1-L18) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/store/quotes.rs:52–57](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/quotes.rs#L52-L57) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/store/quotes.rs:83–111](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/quotes.rs#L83-L111) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/store/quotes.rs:115–143](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/quotes.rs#L115-L143) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/store/quotes.rs:146–152](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/quotes.rs#L146-L152) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/store/quotes.rs:166–180](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/quotes.rs#L166-L180) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/quote.rs:69–133](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/quote.rs#L69-L133) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/hydration/store/resolve.rs

变化：仅Tweet NotFound接受tweet_states.deletion；ActorPosts取actor资料；edges剔除未使用root节点并汇总conversation_root_author_blocks_viewer，删除旧is_reply字段填充。

影响：删除原因精细化、通知作者与root block事实来源更准确；不构成全站删除/限流推论。

关联：research-17、research-18。

- [visibility-filtering/hydration/store/resolve.rs:4–12](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/resolve.rs#L4-L12) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/store/resolve.rs:31–41](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/resolve.rs#L31-L41) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/store/resolve.rs:179–204](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/resolve.rs#L179-L204) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/store/resolve.rs:212–227](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/resolve.rs#L212-L227) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/store/resolve.rs:284–293](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/store/resolve.rs#L284-L293) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/treatment.rs:773–837](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/treatment.rs#L773-L837) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/hydration/tweet_source.rs

变化：新增tweetypie/federated/tweetState.Tweet读取，状态0/1/14/15译为Found/NotFound/Deleted/BounceDeleted，未知枚举报错。

影响：补充状态仅用于已缺失帖子；未知/失败不凭空断言删除，不变成新标签。

关联：research-17、research-18。

- [visibility-filtering/hydration/tweet_source.rs:1–7](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/tweet_source.rs#L1-L7) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/tweet_source.rs:13–19](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/tweet_source.rs#L13-L19) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/tweet_source.rs:21–82](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/tweet_source.rs#L21-L82) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/sources.rs:55–119](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/sources.rs#L55-L119) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/ingress.rs

变化：集中各RPC level/viewer/row规范化；通知支持posts/users且拒绝混合、0recipient、0post及0post-actor；FilterTweets Unmerged、EvaluateTweets Merged。

影响：RPC/surface限定是结论前提；公开API支持不等于生产覆盖。

关联：research-18、research-22。

- [visibility-filtering/ingress.rs:1–303](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/ingress.rs#L1-L303) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/filter_notifications.rs:36–100](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/filter_notifications.rs#L36-L100) 真实caller/consumer或fixture调用点；用于核对影响范围
- [home-mixer/filters/vf_filter.rs:22–28](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/vf_filter.rs#L22-L28) Home实际消费者只按action保留/移除，无Downrank数值乘子

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/lib.rs

变化：注册ingress，删除内部safety_label_source模块。

影响：内部标签实现已迁独立crate，不是关闭标签过滤。

关联：research-33。

- [visibility-filtering/lib.rs:60–66](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/lib.rs#L60-L66) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/hydration/sources.rs:33–97](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/hydration/sources.rs#L33-L97) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/metrics/families.rs

变化：集中typed Counter/Histogram/Gauge及request标签schema，新增tweet_state，声明无request标签的例外与文档pin。

影响：监控口径统一，不由计数家族推出真实流量、实验覆盖或算法参数。

关联：无直接运营动作。

- [visibility-filtering/metrics/families.rs:1–523](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/metrics/families.rs#L1-L523) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/metrics/mod.rs:160–224](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/metrics/mod.rs#L160-L224) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：仅静态审查，未运行测试；生产部署与指标实际读数未知。

### visibility-filtering/metrics.rs

变化：metrics.rs重命名到metrics/mod.rs；全局指标调用改实例注入，RequestMetrics绑定endpoint/level，Deleted计入Tweet NotFound；fixture由thread_local改Mutex recording。

影响：指标接线与API重构；无sink不影响裁决，不能将metric标签当成政策默认。

关联：无直接运营动作。

- [visibility-filtering/metrics.rs:1–190](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/visibility-filtering/metrics.rs#L1-L190) 基线删除/迁出源码；配对目标实现而非只看hash
- [visibility-filtering/server_deps.rs:159–223](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/server_deps.rs#L159-L223) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：仅静态审查，未运行测试；生产部署与指标实际读数未知。

### visibility-filtering/metrics/mod.rs

变化：metrics.rs重命名到metrics/mod.rs；全局指标调用改实例注入，RequestMetrics绑定endpoint/level，Deleted计入Tweet NotFound；fixture由thread_local改Mutex recording。

影响：指标接线与API重构；无sink不影响裁决，不能将metric标签当成政策默认。

关联：无直接运营动作。

- [visibility-filtering/metrics/mod.rs:1–842](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/metrics/mod.rs#L1-L842) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/metrics.rs:1–50](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/visibility-filtering/metrics.rs#L1-L50) 重命名前源码对照
- [visibility-filtering/server_deps.rs:159–223](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/server_deps.rs#L159-L223) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：仅静态审查，未运行测试；生产部署与指标实际读数未知。

### visibility-filtering/pinned.rs

变化：新增从dashboard.py解析字符串tuple为BTreeSet的辅助函数。

影响：测试pin辅助，不在生产判定路径；未运行测试。

关联：无直接运营动作。

- [visibility-filtering/pinned.rs:1–4](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/pinned.rs#L1-L4) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/pinned.rs:28–47](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/pinned.rs#L28-L47) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/treatment.rs:1591–1655](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/treatment.rs#L1591-L1655) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：仅静态审查，未运行测试；生产部署与指标实际读数未知。

### visibility-filtering/quote.rs

变化：PostBatch使用RequestViewer/RetweetMerge，quote author pass明确Unmerged；Deleted同NotFound处理；metrics归属QuotedTweetRules。

影响：Off/Shadow模式仍不修改已服务主结果；不能把shadow检查宣传为线上已执行quote处罚。

关联：research-18。

- [visibility-filtering/quote.rs:1–9](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/quote.rs#L1-L9) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/quote.rs:11–16](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/quote.rs#L11-L16) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/quote.rs:74–84](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/quote.rs#L74-L84) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/quote.rs:106–112](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/quote.rs#L106-L112) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/quote.rs:121–127](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/quote.rs#L121-L127) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/quote.rs:129–137](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/quote.rs#L129-L137) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/config.rs:109–173](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/config.rs#L109-L173) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。；公开默认VF_QUOTE_PASS=off，可环境改shadow；shadow只比较且不修改已服务响应，生产配置未知。

### visibility-filtering/safety_label_source/metrics.rs

变化：删除旧全局标签指标模块：内部source/cache指标迁safety-label-source/metrics.rs，lookup指标迁VF families/get_safety_labels。

影响：旧源码完整diff核对，属于拆分而非取消监控或标签功能。

关联：research-33。

- [visibility-filtering/safety_label_source/metrics.rs:1–163](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/visibility-filtering/safety_label_source/metrics.rs#L1-L163) 基线删除/迁出源码；配对目标实现而非只看hash
- [safety-label-source/metrics.rs:17–81](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/safety-label-source/metrics.rs#L17-L81) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/safety_label_source/mod.rs

变化：旧模块导出表删除，替代为独立xai_safety_label_source crate API。

影响：配对新lib.rs与ProdSources引用，不能误记为SafetyLabelSource删除。

关联：research-33。

- [visibility-filtering/safety_label_source/mod.rs:1–10](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/visibility-filtering/safety_label_source/mod.rs#L1-L10) 基线删除/迁出源码；配对目标实现而非只看hash
- [safety-label-source/lib.rs:62–65](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/safety-label-source/lib.rs#L62-L65) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/scenario.rs

变化：fixture场景rpc字段改RetweetMerge，统一RequestViewer/RequestMetrics并允许注入recording；Wire传Metrics。

影响：模拟场景适配新接口，不是生产默认开启实验或实测证据。

关联：无直接运营动作。

- [visibility-filtering/scenario.rs:2–11](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/scenario.rs#L2-L11) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/scenario.rs:69–77](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/scenario.rs#L69-L77) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/scenario.rs:105–113](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/scenario.rs#L105-L113) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/scenario.rs:126–133](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/scenario.rs#L126-L133) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/scenario.rs:136–146](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/scenario.rs#L136-L146) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/scenario.rs:155–164](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/scenario.rs#L155-L164) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/evaluate_tweets.rs:244–308](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/evaluate_tweets.rs#L244-L308) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：仅静态审查，未运行测试；生产部署与指标实际读数未知。

### visibility-filtering/server.rs

变化：变更全部位于测试模块：FakeLabels替代内联remote fake，缺失帖loopback预期改Some(NotFound)，Metrics::none注入。

影响：RPC server生产路由未改；测试说明新版客户端接受NotFound但本次未执行。

关联：research-17、research-18。

- [visibility-filtering/server.rs:163–187](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/server.rs#L163-L187) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/server.rs:209–218](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/server.rs#L209-L218) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/server.rs:253–265](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/server.rs#L253-L265) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/server.rs:288–302](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/server.rs#L288-L302) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering-client/evaluated.rs:30–94](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering-client/evaluated.rs#L30-L94) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/server_deps.rs

变化：后台客户端从串行改tokio::join并发连接并汇总错误；标签连接抽出LabelClients；指标和cache warm trait注入。

影响：启动行为改变，配置读取仍由环境和feature switch文件控制；不能推断生产部署。

关联：research-18、research-33。

- [visibility-filtering/server_deps.rs:1–7](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/server_deps.rs#L1-L7) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/server_deps.rs:16–31](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/server_deps.rs#L16-L31) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/server_deps.rs:33–46](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/server_deps.rs#L33-L46) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/server_deps.rs:49–54](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/server_deps.rs#L49-L54) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/server_deps.rs:72–78](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/server_deps.rs#L72-L78) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/server_deps.rs:94–100](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/server_deps.rs#L94-L100) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/config.rs:75–139](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/config.rs#L75-L139) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/staging/reference/mod.rs

变化：比较器接入RequestViewer，FilterTweets复制其ID/国家，EvaluateTweets传完整viewer给quote comparison。

影响：staging比较输入来源统一，不改服务裁决。

关联：research-18。

- [visibility-filtering/staging/reference/mod.rs:1–7](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/staging/reference/mod.rs#L1-L7) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/staging/reference/mod.rs:13–18](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/staging/reference/mod.rs#L13-L18) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/staging/reference/mod.rs:82–91](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/staging/reference/mod.rs#L82-L91) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/staging/reference/mod.rs:95–106](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/staging/reference/mod.rs#L95-L106) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/evaluate_tweets.rs:165–229](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/evaluate_tweets.rs#L165-L229) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/staging/reference/tweetypie.rs

变化：参考重算使用ingress/RequestMetrics；Deleted按NotFound比较和抽样；指标移typed families。

影响：只改参考对比口径/接线，不证明线上一致性或覆盖率。

关联：research-18。

- [visibility-filtering/staging/reference/tweetypie.rs:2–15](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/staging/reference/tweetypie.rs#L2-L15) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/staging/reference/tweetypie.rs:32–37](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/staging/reference/tweetypie.rs#L32-L37) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/staging/reference/tweetypie.rs:52–57](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/staging/reference/tweetypie.rs#L52-L57) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/staging/reference/tweetypie.rs:102–120](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/staging/reference/tweetypie.rs#L102-L120) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/staging/reference/tweetypie.rs:250–256](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/staging/reference/tweetypie.rs#L250-L256) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/staging/reference/tweetypie.rs:296–316](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/staging/reference/tweetypie.rs#L296-L316) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/staging/reference/mod.rs:84–148](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/staging/reference/mod.rs#L84-L148) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/staging/reference/tweetypie/quotes.rs

变化：quote比较从RequestViewer提取登录ID/context/国家，仍缺viewer则跳过；typed counter helper替换测试计数。

影响：保留staging shadow边界；不能推为所有匿名或所有quote线上均比较。

关联：research-18。

- [visibility-filtering/staging/reference/tweetypie/quotes.rs:2–8](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/staging/reference/tweetypie/quotes.rs#L2-L8) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/staging/reference/tweetypie/quotes.rs:35–46](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/staging/reference/tweetypie/quotes.rs#L35-L46) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/staging/reference/tweetypie/quotes.rs:48–59](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/staging/reference/tweetypie/quotes.rs#L48-L59) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/staging/reference/tweetypie/quotes.rs:114–120](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/staging/reference/tweetypie/quotes.rs#L114-L120) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/staging/reference/tweetypie/quotes.rs:166–172](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/staging/reference/tweetypie/quotes.rs#L166-L172) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/staging/reference/mod.rs:103–165](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/staging/reference/mod.rs#L103-L165) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/treatment.rs

变化：evaluate_tweets_state对NotFound/Deleted生成Thrift NotFound及删除flags；通知区分AuthorNotFound与PostNotFound；动作指标改enum。

影响：真实wire语义变化；与客户端into_result_state配对，保留既有原始Filtered/NotFound/Failed优先级。

关联：research-17、research-18、research-22。

- [visibility-filtering/treatment.rs:1–6](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/treatment.rs#L1-L6) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/treatment.rs:33–40](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/treatment.rs#L33-L40) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/treatment.rs:527–533](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/treatment.rs#L527-L533) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/treatment.rs:647–728](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/treatment.rs#L647-L728) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering-client/evaluated.rs:30–94](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering-client/evaluated.rs#L30-L94) 真实caller/consumer或fixture调用点；用于核对影响范围
- [home-mixer/filters/vf_filter.rs:22–28](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/filters/vf_filter.rs#L22-L28) Home实际消费者只按action保留/移除，无Downrank数值乘子

边界：公开源码静态差异审查；未运行上游测试/服务。生产部署、流量覆盖及运行时配置未知。

### visibility-filtering/verdict_gate.rs

变化：门禁支持可选viewer、国家/客户端、FilterTweets多个level及GetSafetyLabels期望；拒绝quote+FilterTweets组合，细分age_prompt，RPC5秒。

影响：验收工具扩大可检查场景，无运行时policy启用；测试描述不能代替生产实测。

关联：无直接运营动作。

- [visibility-filtering/verdict_gate.rs:1–77](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/verdict_gate.rs#L1-L77) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/verdict_gate.rs:81–102](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/verdict_gate.rs#L81-L102) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/verdict_gate.rs:107–231](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/verdict_gate.rs#L107-L231) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/verdict_gate.rs:239–262](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/verdict_gate.rs#L239-L262) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/verdict_gate.rs:265–308](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/verdict_gate.rs#L265-L308) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/verdict_gate.rs:312–372](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/verdict_gate.rs#L312-L372) 已阅读差异及相关上下文；该区段支撑本路径语义结论
- [visibility-filtering/bin/vf-gate.rs:22–30](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/visibility-filtering/bin/vf-gate.rs#L22-L30) 真实caller/consumer或fixture调用点；用于核对影响范围

边界：仅静态审查，未运行测试；生产部署与指标实际读数未知。

## account

### README.md

变化：README 新增 10/26 Brazil 专用过滤移除、10/13 retrieval 完整阅读训练、10/8 排名时长预测改进说明；旧 Brazil 描述改为过去式并从过滤表移除。

影响：文档与 research-19 移除结论一致；训练效果宣传不构成量化曝光或固定互动兑换规则。

关联：research-19、research-10。

- [README.md:5–13](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/README.md#L5-L13) 已阅读该变动块及前后上下文；具体语义见 summary。
- [README.md:31–48](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/README.md#L31-L48) 已阅读该变动块及前后上下文；具体语义见 summary。
- [README.md:52–58](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/README.md#L52-L58) 已阅读该变动块及前后上下文；具体语义见 summary。
- [README.md:397–402](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/README.md#L397-L402) 已阅读该变动块及前后上下文；具体语义见 summary。
- [home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs:421–476](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs#L421-L476) 当前过滤链无 Brazil 专用 filter；其余过滤仍独立存在。

边界：公开默认不等于生产配置；实际运行时覆盖、部署和实际输入未知。；README 的预测改善幅度无公开评估数据，模型训练详细审查由对应分组承担。

### abuse-enforcement-service/service-lib/src/action_control.rs

变化：页控 Suspend 映射新增 permanent/policy；SuspendAuthor 保留临时 PlatformManipulation。harsher_because 将永久升级或政策变更视为更严；新增选项/旧镜像/执行映射测试，feature version 6，author skip 仍 version 5。

影响：补充 research-32：可配置动作语义，不是默认全量永久封禁。

关联：research-32。

- [abuse-enforcement-service/service-lib/src/action_control.rs:15–22](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/action_control.rs#L15-L22) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/action_control.rs:148–154](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/action_control.rs#L148-L154) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/action_control.rs:172–184](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/action_control.rs#L172-L184) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/action_control.rs:838–864](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/action_control.rs#L838-L864) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/action_control.rs:2666–2676](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/action_control.rs#L2666-L2676) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/action_control.rs:4641–4647](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/action_control.rs#L4641-L4647) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/action_control.rs:4672–4678](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/action_control.rs#L4672-L4678) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/action_control.rs:4873–4879](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/action_control.rs#L4873-L4879) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/action_control.rs:5076–5082](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/action_control.rs#L5076-L5082) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/action_control.rs:6953–7097](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/action_control.rs#L6953-L7097) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/lib.rs:550–677](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/lib.rs#L550-L677) 页控调用 page_specs，仍经安全检查/recording/dry-run/状态检查。
- [abuse-enforcement-service/service-lib/src/service.rs:237–254](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/service.rs#L237-L254) ActionSpec 转实际执法动作，保留永久性和政策。
- [abuse-enforcement-service/service-lib/src/service.rs:317–333](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/service.rs#L317-L333) AIS suspendUser 请求序列化 perm/policy。
- [abuse-enforcement-service/service-lib/src/action_control.rs:2243–2277](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/action_control.rs#L2243-L2277) harsher 原因进入 confirm_required 检查，未绕过更严变更确认。

边界：公开默认不等于生产配置；实际运行时覆盖、部署和实际输入未知。

### abuse-enforcement-service/service-lib/src/action_control_path_tests.rs

变化：测试常量迁移为同义 SUSPEND；新增端到端路径断言永久 Cse 参数到 AIS、class=4、已封禁可升级、deactivated 跳过，普通 suspend 保留 class=3。

影响：测试代码静态佐证 research-32；未运行，不能称测试通过或生产有效。

关联：research-32。

- [abuse-enforcement-service/service-lib/src/action_control_path_tests.rs:13–19](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/action_control_path_tests.rs#L13-L19) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/action_control_path_tests.rs:999–1005](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/action_control_path_tests.rs#L999-L1005) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/action_control_path_tests.rs:2220–2334](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/action_control_path_tests.rs#L2220-L2334) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/lib.rs:35–46](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/lib.rs#L35-L46) 测试模块仅 cfg(test) 接入。

边界：

### abuse-enforcement-service/service-lib/src/action_control_rollback.rs

变化：rollback 测试构造从 Suspend {} 改为 SUSPEND；回滚实现未变。

影响：仅同义测试适配，不改变运行规则。

关联：research-32。

- [abuse-enforcement-service/service-lib/src/action_control_rollback.rs:121–127](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/action_control_rollback.rs#L121-L127) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/types/src/action_control.rs:263–273](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/types/src/action_control.rs#L263-L273) SUSPEND 保持原临时默认。

边界：

### abuse-enforcement-service/service-lib/src/backfill.rs

变化：already_applied 对永久封禁恒返回 false，不再仅凭 suspended 推断已执行；普通封禁仍读取 suspended。新 backfill record 按 actions 选择版本，其他替换为测试常量。

影响：补充 research-32 的重试/恢复语义，不产生推荐权重。

关联：research-32。

- [abuse-enforcement-service/service-lib/src/backfill.rs:238–250](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/backfill.rs#L238-L250) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/backfill.rs:831–837](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/backfill.rs#L831-L837) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/backfill.rs:1336–1342](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/backfill.rs#L1336-L1342) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/backfill.rs:1356–1362](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/backfill.rs#L1356-L1362) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/backfill.rs:1734–1740](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/backfill.rs#L1734-L1740) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/backfill.rs:1865–1871](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/backfill.rs#L1865-L1871) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/backfill.rs:2222–2228](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/backfill.rs#L2222-L2228) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/backfill.rs:2352–2358](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/backfill.rs#L2352-L2358) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/backfill.rs:2459–2465](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/backfill.rs#L2459-L2465) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/backfill.rs:2787–2793](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/backfill.rs#L2787-L2793) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/backfill.rs:3101–3107](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/backfill.rs#L3101-L3107) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/backfill.rs:3119–3126](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/backfill.rs#L3119-L3126) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/lib.rs:1088–1103](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/lib.rs#L1088-L1103) 仅 stale handed claim 恢复分支调用 already_applied。
- [abuse-enforcement-service/types/src/backfill.rs:5–14](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/types/src/backfill.rs#L5-L14) 含非默认封禁选项才写 v2。

边界：公开默认不等于生产配置；实际运行时覆盖、部署和实际输入未知。；Gizmoduck 仅 suspended 布尔不足区分现有封禁是否永久；永久动作能否重复仍受去重/claim/安全门控制。

### abuse-enforcement-service/service-lib/src/backfill_path_tests.rs

变化：backfill 路径测试仅将 PageAction::Suspend {} 改成等价 PageAction::SUSPEND。

影响：测试适配，不改变对应生产分支、门槛或评分。

关联：research-32。

- [abuse-enforcement-service/service-lib/src/backfill_path_tests.rs:15–21](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/backfill_path_tests.rs#L15-L21) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/types/src/action_control.rs:263–273](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/types/src/action_control.rs#L263-L273) 常量默认仍临时 PlatformManipulation。
- [abuse-enforcement-service/service-lib/src/lib.rs:35–46](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/lib.rs#L35-L46) cfg(test) 模块。

边界：

### abuse-enforcement-service/service-lib/src/confidence_adversarial_tests.rs

变化：confidence 对抗测试 high_row 构造仅将 PageAction::Suspend {} 改成等价 PageAction::SUSPEND。

影响：测试适配，不改变对应生产分支、门槛或评分。

关联：research-32。

- [abuse-enforcement-service/service-lib/src/confidence_adversarial_tests.rs:58–64](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/confidence_adversarial_tests.rs#L58-L64) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/types/src/action_control.rs:263–273](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/types/src/action_control.rs#L263-L273) 常量默认仍临时 PlatformManipulation。
- [abuse-enforcement-service/service-lib/src/lib.rs:35–46](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/lib.rs#L35-L46) cfg(test) 模块。

边界：

### abuse-enforcement-service/service-lib/src/confidence_path_tests.rs

变化：confidence 路径测试仅将 PageAction::Suspend {} 改成等价 PageAction::SUSPEND。

影响：测试适配，不改变对应生产分支、门槛或评分。

关联：research-32。

- [abuse-enforcement-service/service-lib/src/confidence_path_tests.rs:14–20](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/confidence_path_tests.rs#L14-L20) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/types/src/action_control.rs:263–273](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/types/src/action_control.rs#L263-L273) 常量默认仍临时 PlatformManipulation。
- [abuse-enforcement-service/service-lib/src/lib.rs:35–46](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/lib.rs#L35-L46) cfg(test) 模块。

边界：

### abuse-enforcement-service/service-lib/src/decision.rs

变化：SuspendUser 按 perm 分为永久 class=4、临时 class=3，其余标签/挑战类不变。

影响：永久封禁可超过已记录临时封禁等级，不是新增分类器阈值。

关联：research-32。

- [abuse-enforcement-service/service-lib/src/decision.rs:26–35](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/decision.rs#L26-L35) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/dedup_cache.rs:12–21](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/dedup_cache.rs#L12-L21) incoming_class <= held.class 才算重复。
- [abuse-enforcement-service/service-lib/src/lib.rs:331–353](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/lib.rs#L331-L353) 可达规则动作等级用于入站去重。

边界：公开默认不等于生产配置；实际运行时覆盖、部署和实际输入未知。

### abuse-enforcement-service/service-lib/src/dedup_cache.rs

变化：增加永久封禁最高等级4；旧成功/损坏/缺 class 记录保守映射4；update 对临时 class3 也检查已有更严写入栅栏；更新对应静态断言。

影响：补充去重保守行为，不能声称所有既有临时封禁必定升级：legacy 无等级会挡住升级。

关联：research-32。

- [abuse-enforcement-service/service-lib/src/dedup_cache.rs:12–18](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/dedup_cache.rs#L12-L18) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/dedup_cache.rs:36–42](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/dedup_cache.rs#L36-L42) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/dedup_cache.rs:56–67](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/dedup_cache.rs#L56-L67) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/dedup_cache.rs:423–429](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/dedup_cache.rs#L423-L429) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/dedup_cache.rs:809–821](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/dedup_cache.rs#L809-L821) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/dedup_cache.rs:823–829](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/dedup_cache.rs#L823-L829) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/dedup_cache.rs:832–841](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/dedup_cache.rs#L832-L841) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/dedup_cache.rs:843–851](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/dedup_cache.rs#L843-L851) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/dedup_cache.rs:861–867](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/dedup_cache.rs#L861-L867) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/dedup_cache.rs:869–886](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/dedup_cache.rs#L869-L886) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/decision.rs:26–41](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/decision.rs#L26-L41) 执行动作映射至等级。
- [abuse-enforcement-service/service-lib/src/dedup_cache.rs:418–441](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/dedup_cache.rs#L418-L441) 非最高等级写入先读并检查栅栏。

边界：公开默认不等于生产配置；实际运行时覆盖、部署和实际输入未知。

### abuse-enforcement-service/service-lib/src/facts.rs

变化：GizmoduckFacts 新增可选 user_type；旧审计 map 重建固定 None；fixture 构造补 None。

影响：仅事实/诊断维度，不见新增以 user_type 为条件的动作或排名规则。

关联：research-32。

- [abuse-enforcement-service/service-lib/src/facts.rs:208–214](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/facts.rs#L208-L214) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/facts.rs:417–423](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/facts.rs#L417-L423) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/facts.rs:703–709](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/facts.rs#L703-L709) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/gizmoduck.rs:77–145](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/gizmoduck.rs#L77-L145) hydrate user_type 并记 tracing；状态仍来自 safety。
- [abuse-enforcement-service/service-lib/src/facts.rs:400–425](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/facts.rs#L400-L425) 重建明确缺失 user_type，不可当作 Normal。

边界：公开默认不等于生产配置；实际运行时覆盖、部署和实际输入未知。

### abuse-enforcement-service/service-lib/src/fixtures/replay_no_records.golden

变化：golden 中 anchor_campaign_suspend_cse 与 cse_reports_embedding_v2 的去重等级3改4，成功摘要 hash 随输出变化；状态及原安全跳过场景保留。

影响：只是 replay 预期更新，不能以 hash 变化声称新增处罚策略或已通过执行测试。

关联：research-32。

- [abuse-enforcement-service/service-lib/src/fixtures/replay_no_records.golden:46–75](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/fixtures/replay_no_records.golden#L46-L75) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/fixtures/replay_no_records.golden:622–651](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/fixtures/replay_no_records.golden#L622-L651) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/fixtures/replay_no_records.golden:702–708](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/fixtures/replay_no_records.golden#L702-L708) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/replay_tests.rs:674–743](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/replay_tests.rs#L674-L743) golden 被 replay_no_records 断言消费。
- [abuse-enforcement-service/service-lib/src/decision.rs:26–33](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/decision.rs#L26-L33) 生产等级分叉是实际语义来源。

边界：

### abuse-enforcement-service/service-lib/src/gizmoduck.rs

变化：fetch_user 由无 LookupContext 改为 for_user_id=目标用户且 include_soft_users=true，hydrate/trace user_type；新增模拟 soft-user 测试。

影响：扩展可读取账号范围，减少把 soft user 误读为不存在；不表示 soft user 自动受罚。

关联：research-32。

- [abuse-enforcement-service/service-lib/src/gizmoduck.rs:3–12](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/gizmoduck.rs#L3-L12) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/gizmoduck.rs:70–89](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/gizmoduck.rs#L70-L89) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/gizmoduck.rs:113–119](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/gizmoduck.rs#L113-L119) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/gizmoduck.rs:142–148](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/gizmoduck.rs#L142-L148) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/gizmoduck.rs:175–316](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/gizmoduck.rs#L175-L316) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/strato.rs:130–132](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/strato.rs#L130-L132) fetch_user 包装转发。
- [abuse-enforcement-service/service-lib/src/lib.rs:440–451](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/lib.rs#L440-L451) 用户目标事实获取调用。
- [abuse-enforcement-service/service-lib/src/lib.rs:492–505](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/lib.rs#L492-L505) 帖子作者事实获取调用。

边界：公开默认不等于生产配置；实际运行时覆盖、部署和实际输入未知。；内部 Gizmoduck 实际响应和生产数据权限未知。

### abuse-enforcement-service/service-lib/src/lib.rs

变化：page_driven 执法新增永久动作 upgrades 检测；已 suspended 且无永久升级仍跳过，deactivated 仍跳过。

影响：限定页控永久升级分支；不能把 rule-driven 与 page-driven 或 deactivated 混为一谈。

关联：research-32。

- [abuse-enforcement-service/service-lib/src/lib.rs:642–657](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/lib.rs#L642-L657) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/lib.rs:550–677](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/lib.rs#L550-L677) 页控调用 page_specs，仍经安全检查/recording/dry-run/状态检查。
- [abuse-enforcement-service/service-lib/src/service.rs:237–254](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/service.rs#L237-L254) ActionSpec 转实际执法动作，保留永久性和政策。
- [abuse-enforcement-service/service-lib/src/service.rs:317–333](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/service.rs#L317-L333) AIS suspendUser 请求序列化 perm/policy。
- [abuse-enforcement-service/service-lib/src/lib.rs:313–329](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/lib.rs#L313-L329) 已有 strip_redundant_suspends 同样保留永久动作。

边界：公开默认不等于生产配置；实际运行时覆盖、部署和实际输入未知。

### abuse-enforcement-service/service-lib/src/safety_audit_tests.rs

变化：无 action-control 配置的安全审计测试仅将 PageAction::Suspend {} 改成等价 PageAction::SUSPEND。

影响：测试适配，不改变对应生产分支、门槛或评分。

关联：research-32。

- [abuse-enforcement-service/service-lib/src/safety_audit_tests.rs:66–72](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/safety_audit_tests.rs#L66-L72) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/types/src/action_control.rs:263–273](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/types/src/action_control.rs#L263-L273) 常量默认仍临时 PlatformManipulation。
- [abuse-enforcement-service/service-lib/src/lib.rs:35–46](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/lib.rs#L35-L46) cfg(test) 模块。

边界：

### abuse-enforcement-service/types/src/action_control.rs

变化：PageAction Suspend 新增 permanent=false 与 policy=PlatformManipulation 默认，可选 Cse；用户菜单四组合，post 菜单/High 默认不变；非默认选项 schema v6，author-skips v5；严格 serde 拒绝无效字段/政策。

影响：补充 research-32 的公共默认与 runtime 配置分离，旧 JSON 语义兼容；旧镜像不能安全降级消费新选项。

关联：research-32。

- [abuse-enforcement-service/types/src/action_control.rs:1–8](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/types/src/action_control.rs#L1-L8) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/types/src/action_control.rs:193–240](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/types/src/action_control.rs#L193-L240) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/types/src/action_control.rs:261–278](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/types/src/action_control.rs#L261-L278) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/types/src/action_control.rs:284–318](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/types/src/action_control.rs#L284-L318) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/types/src/action_control.rs:343–349](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/types/src/action_control.rs#L343-L349) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/types/src/action_control.rs:356–362](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/types/src/action_control.rs#L356-L362) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/types/src/action_control.rs:438–456](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/types/src/action_control.rs#L438-L456) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/types/src/action_control.rs:800–806](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/types/src/action_control.rs#L800-L806) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/types/src/action_control.rs:839–927](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/types/src/action_control.rs#L839-L927) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/types/src/action_control.rs:1055–1061](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/types/src/action_control.rs#L1055-L1061) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/types/src/action_control.rs:1313–1319](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/types/src/action_control.rs#L1313-L1319) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/lib.rs:550–677](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/lib.rs#L550-L677) 页控调用 page_specs，仍经安全检查/recording/dry-run/状态检查。
- [abuse-enforcement-service/service-lib/src/service.rs:237–254](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/service.rs#L237-L254) ActionSpec 转实际执法动作，保留永久性和政策。
- [abuse-enforcement-service/service-lib/src/service.rs:317–333](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/service.rs#L317-L333) AIS suspendUser 请求序列化 perm/policy。

边界：公开默认不等于生产配置；实际运行时覆盖、部署和实际输入未知。

### abuse-enforcement-service/types/src/backfill.rs

变化：Backfill 最高记录版本1升2；run_record_version 仅有非默认封禁选项时返回2，普通动作仍1；测试同义适配。

影响：版本协议扩展，不改变正常 backfill 门槛，也不直接作用推荐。

关联：research-32。

- [abuse-enforcement-service/types/src/backfill.rs:2–16](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/types/src/backfill.rs#L2-L16) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/types/src/backfill.rs:227–233](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/types/src/backfill.rs#L227-L233) 已阅读该变动块及前后上下文；具体语义见 summary。
- [abuse-enforcement-service/service-lib/src/backfill.rs:831–855](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/abuse-enforcement-service/service-lib/src/backfill.rs#L831-L855) 生产创建记录调用按动作版本函数。

边界：公开默认不等于生产配置；实际运行时覆盖、部署和实际输入未知。

### under-the-hood/jetfuel/gql/underTheHoodReport.gql

变化：GraphQL 新取帖子/账号申诉 rich text map 和 max_post_ids_per_label。

影响：为 research-34 展示扩展提供字段，不创建申诉、不改封禁或排名。

关联：research-34。

- [under-the-hood/jetfuel/gql/underTheHoodReport.gql:10–28](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/jetfuel/gql/underTheHoodReport.gql#L10-L28) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/strato/columns/underTheHoodReport.strato:8–30](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.strato#L8-L30) 仅认证 viewer 且 feature switch 允许调用 User 报告。
- [under-the-hood/strato/columns/underTheHoodReport.User.strato:606–621](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.User.strato#L606-L621) runtime FS 读入申诉与 ID 展示策略。
- [under-the-hood/jetfuel/routes/_lib/load.ts:63–89](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/jetfuel/routes/_lib/load.ts#L63-L89) GraphQL 结果解析后交给页面消费者。

边界：公开默认不等于生产配置；实际运行时覆盖、部署和实际输入未知。

### under-the-hood/jetfuel/routes/_lib/load.ts

变化：loadReport 传入服务端 ID 上限、解析申诉 map；新增 launch mock 并扩展状态；真实请求错误仍 unavailable。

影响：客户端接线不改变资格；公开树导入缺失 mock 模块，不能称可独立运行。

关联：research-34。

- [under-the-hood/jetfuel/routes/_lib/load.ts:1–61](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/jetfuel/routes/_lib/load.ts#L1-L61) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/jetfuel/routes/_lib/load.ts:77–86](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/jetfuel/routes/_lib/load.ts#L77-L86) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/strato/columns/underTheHoodReport.strato:8–30](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.strato#L8-L30) 仅认证 viewer 且 feature switch 允许调用 User 报告。
- [under-the-hood/strato/columns/underTheHoodReport.User.strato:606–621](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.User.strato#L606-L621) runtime FS 读入申诉与 ID 展示策略。
- [under-the-hood/jetfuel/routes/_lib/load.ts:63–89](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/jetfuel/routes/_lib/load.ts#L63-L89) GraphQL 结果解析后交给页面消费者。

边界：公开默认不等于生产配置；实际运行时覆盖、部署和实际输入未知。；目标树删除 ./mock.ts 且无配对 mock 模块；load.ts 静态 imports 和 MOCKS 初始化仍依赖该文件。

### under-the-hood/jetfuel/routes/_lib/mock.ts

变化：删除全部75行 mock.ts：旧 August 2026 eligibility、空/有标签报告及注释 rich text fixture。git diff 为 D，无 rename 配对。

影响：不是删除真实报告，但 load.ts 仍依赖旧和新增 MOCK_* 导出，公开树存在缺失依赖。

关联：research-34。

- [under-the-hood/jetfuel/routes/_lib/mock.ts:1–75](https://github.com/xai-org/x-algorithm/blob/2f252142b9284e692ac72851768c8072d045f0d5/under-the-hood/jetfuel/routes/_lib/mock.ts#L1-L75) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/jetfuel/routes/_lib/load.ts:4–59](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/jetfuel/routes/_lib/load.ts#L4-L59) 目标消费仍直接 import ./mock，并初始化 MOCKS。

边界：未运行构建；内部生成/未公开依赖是否补齐未知。

### under-the-hood/jetfuel/routes/_lib/report.ts

变化：报告 parser 加申诉文本、数字字符串 ID 校验/去重/数值升序排序、Snowflake 时间与链接、服务端上限末尾切片；showsMostRecent 依据 posts > max；新增 rich text maps。

影响：研究34需区分收集上限、服务端筛选和客户端显示；解析空 ID 并不等于无标签。

关联：research-34。

- [under-the-hood/jetfuel/routes/_lib/report.ts:1–19](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/jetfuel/routes/_lib/report.ts#L1-L19) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/jetfuel/routes/_lib/report.ts:26–32](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/jetfuel/routes/_lib/report.ts#L26-L32) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/jetfuel/routes/_lib/report.ts:44–85](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/jetfuel/routes/_lib/report.ts#L44-L85) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/jetfuel/routes/_lib/report.ts:92–98](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/jetfuel/routes/_lib/report.ts#L92-L98) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/jetfuel/routes/_lib/report.ts:102–116](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/jetfuel/routes/_lib/report.ts#L102-L116) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/jetfuel/routes/_lib/report.ts:118–135](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/jetfuel/routes/_lib/report.ts#L118-L135) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/jetfuel/routes/report.tsx:114–190](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/jetfuel/routes/report.tsx#L114-L190) 实际渲染验证后 ID 和按阈值判定的 mostRecent 提示。
- [under-the-hood/jetfuel/routes/_lib/load.ts:80–84](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/jetfuel/routes/_lib/load.ts#L80-L84) 从 GraphQL info 传入上限。

边界：公开默认不等于生产配置；实际运行时覆盖、部署和实际输入未知。；客户端未消费 JSON postIdsMostRecentNote，而按总量>配置上限判断；上游 ID 少于实际数量时提示可能不完整。

### under-the-hood/jetfuel/routes/index.tsx

变化：首页 mock query enum 新增 launch；真实首页逻辑未变。

影响：仅预览选择扩展，不放宽登录、feature gate 或报告资格。

关联：research-34。

- [under-the-hood/jetfuel/routes/index.tsx:7–15](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/jetfuel/routes/index.tsx#L7-L15) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/jetfuel/routes/_lib/load.ts:62–70](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/jetfuel/routes/_lib/load.ts#L62-L70) mock 仅非Prod或dogfood可用。

边界：公开 mock 模块缺失。

### under-the-hood/jetfuel/routes/report.tsx

变化：标签措辞改为期间任意时刻携带；新增可折叠 ID 列表（首10条、展开其余）、跳转/UTC日期、隐藏原因与 rich-text申诉；ID footer 另受 rweb FS 控制。

影响：历史携带不等于当前标签仍有效；前端关闭 ID 展示不代表 JSON 无 ID，下载直接使用 rawJson。

关联：research-34、research-33。

- [under-the-hood/jetfuel/routes/report.tsx:1–17](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/jetfuel/routes/report.tsx#L1-L17) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/jetfuel/routes/report.tsx:27–39](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/jetfuel/routes/report.tsx#L27-L39) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/jetfuel/routes/report.tsx:51–81](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/jetfuel/routes/report.tsx#L51-L81) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/jetfuel/routes/report.tsx:94–192](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/jetfuel/routes/report.tsx#L94-L192) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/jetfuel/routes/report.tsx:194–201](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/jetfuel/routes/report.tsx#L194-L201) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/jetfuel/routes/report.tsx:203–212](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/jetfuel/routes/report.tsx#L203-L212) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/jetfuel/routes/report.tsx:222–229](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/jetfuel/routes/report.tsx#L222-L229) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/jetfuel/routes/report.tsx:254–267](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/jetfuel/routes/report.tsx#L254-L267) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/jetfuel/routes/report.tsx:295–302](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/jetfuel/routes/report.tsx#L295-L302) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/jetfuel/routes/report.tsx:312–318](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/jetfuel/routes/report.tsx#L312-L318) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/jetfuel/routes/report.tsx:336–347](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/jetfuel/routes/report.tsx#L336-L347) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/jetfuel/routes/download.tsx:6–24](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/jetfuel/routes/download.tsx#L6-L24) 下载原始 JSON，不读取 rweb post_ids 开关。
- [under-the-hood/jetfuel/routes/report.tsx:331–346](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/jetfuel/routes/report.tsx#L331-L346) 网页独立 FS 展示门。

边界：公开默认不等于生产配置；实际运行时覆盖、部署和实际输入未知。；公开 mock 依赖缺失；未执行页面。

### under-the-hood/scalding/UnderTheHoodCommon.scala

变化：通用函数加入 postIdLabels CLI解析（none关闭）、默认存储上限500、distinct后倒序取最近ID。

影响：500为离线保留默认，不是UI 50默认，更不是处罚阈值。

关联：research-34。

- [under-the-hood/scalding/UnderTheHoodCommon.scala:132–150](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UnderTheHoodCommon.scala#L132-L150) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/scalding/UthDailyPostsJob.scala:388–409](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthDailyPostsJob.scala#L388-L409) 日聚合使用 newestPostIds。
- [under-the-hood/scalding/UthUserMonthMhPublisherJob.scala:289–315](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthUserMonthMhPublisherJob.scala#L289-L315) 月聚合再次限量。

边界：公开默认不等于生产配置；实际运行时覆盖、部署和实际输入未知。

### under-the-hood/scalding/UthDailyPostTakedownLabelsJob.scala

变化：takedown 日聚合携带 carried>0 且 reason在配置集合中的 tweetId，reduce计数同时保留最新ID；新增 CLI/配置上限。

影响：合规标签ID来源扩展，不改变 takedown 判定本身或 Home 权重。

关联：research-34。

- [under-the-hood/scalding/UthDailyPostTakedownLabelsJob.scala:136–157](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthDailyPostTakedownLabelsJob.scala#L136-L157) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/scalding/UthDailyPostTakedownLabelsJob.scala:162–169](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthDailyPostTakedownLabelsJob.scala#L162-L169) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/scalding/UthDailyPostTakedownLabelsJob.scala:244–252](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthDailyPostTakedownLabelsJob.scala#L244-L252) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/scalding/UthDailyPostTakedownLabelsJob.scala:264–274](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthDailyPostTakedownLabelsJob.scala#L264-L274) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/scalding/UthUserMonthMhPublisherJob.scala:44–59](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthUserMonthMhPublisherJob.scala#L44-L59) 月publisher读 takedown 日数据。

边界：公开默认不等于生产配置；实际运行时覆盖、部署和实际输入未知。；UthPostIdLabels.postTakedownReasons 的定义不在公开目标树；不能断言 fromArgs 实际默认集合等于所有导出理由。

### under-the-hood/scalding/UthDailyPostsBackfillJob.scala

变化：backfill 两条标签来源均传递 ID；事件 everApply 后以 logicalId收集，计数/removed 原判断不变，reduce 限量ID。

影响：回填历史带标签帖，不等于当前正在处罚；不改变 research-34 资格门。

关联：research-34。

- [under-the-hood/scalding/UthDailyPostsBackfillJob.scala:100–106](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthDailyPostsBackfillJob.scala#L100-L106) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/scalding/UthDailyPostsBackfillJob.scala:111–118](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthDailyPostsBackfillJob.scala#L111-L118) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/scalding/UthDailyPostsBackfillJob.scala:124–134](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthDailyPostsBackfillJob.scala#L124-L134) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/scalding/UthDailyPostsBackfillJob.scala:138–145](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthDailyPostsBackfillJob.scala#L138-L145) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/scalding/UthDailyPostsBackfillJob.scala:244–250](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthDailyPostsBackfillJob.scala#L244-L250) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/scalding/UthDailyPostsBackfillJob.scala:296–322](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthDailyPostsBackfillJob.scala#L296-L322) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/scalding/UthDailyPostsJob.scala:195–225](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthDailyPostsJob.scala#L195-L225) 共享 tweetFlagRows 扩展输出。
- [under-the-hood/scalding/UthUserMonthMhPublisherJob.scala:247–257](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthUserMonthMhPublisherJob.scala#L247-L257) 月聚合消费日记录 postIds。

边界：公开默认不等于生产配置；实际运行时覆盖、部署和实际输入未知。

### under-the-hood/scalding/UthDailyPostsJob.scala

变化：常规日任务在 tweet flag 与 label event 分支收集 logicalId，计数保持并使用限量去重ID；配置/CLI新增 postIdLabels/maxPostIdsPerLabel。

影响：扩展透明度证据，不改变风控标签写入或推荐候选评分。

关联：research-34。

- [under-the-hood/scalding/UthDailyPostsJob.scala:107–113](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthDailyPostsJob.scala#L107-L113) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/scalding/UthDailyPostsJob.scala:118–125](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthDailyPostsJob.scala#L118-L125) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/scalding/UthDailyPostsJob.scala:130–140](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthDailyPostsJob.scala#L130-L140) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/scalding/UthDailyPostsJob.scala:144–151](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthDailyPostsJob.scala#L144-L151) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/scalding/UthDailyPostsJob.scala:195–204](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthDailyPostsJob.scala#L195-L204) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/scalding/UthDailyPostsJob.scala:213–227](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthDailyPostsJob.scala#L213-L227) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/scalding/UthDailyPostsJob.scala:350–356](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthDailyPostsJob.scala#L350-L356) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/scalding/UthDailyPostsJob.scala:388–411](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthDailyPostsJob.scala#L388-L411) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/scalding/UthDailyPostsJob.scala:418–426](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthDailyPostsJob.scala#L418-L426) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/scalding/UthDailyPostsJob.scala:445–454](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthDailyPostsJob.scala#L445-L454) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/scalding/UthUserMonthMhPublisherJob.scala:247–315](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthUserMonthMhPublisherJob.scala#L247-L315) 日ID汇总入月标签聚合。

边界：公开默认不等于生产配置；实际运行时覆盖、部署和实际输入未知。；UthPostIdLabels.postLabels 定义在公开树未找到；case class 默认空与 fromArgs 默认引用不可混同。

### under-the-hood/scalding/UthUserMonthMhPublisherJob.scala

变化：月 publisher 全部日数据读取显式环境（默认Prod，可CLI覆盖）；按每日日行best选择保留其ID再跨日合并最新500；TSV多ID列，持久化月agg增加postIds。

影响：收集数据环境/截断影响报告完整度，不是实时标签或全量帖子清单保证。

关联：research-34。

- [under-the-hood/scalding/UthUserMonthMhPublisherJob.scala:15–21](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthUserMonthMhPublisherJob.scala#L15-L21) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/scalding/UthUserMonthMhPublisherJob.scala:41–59](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthUserMonthMhPublisherJob.scala#L41-L59) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/scalding/UthUserMonthMhPublisherJob.scala:67–74](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthUserMonthMhPublisherJob.scala#L67-L74) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/scalding/UthUserMonthMhPublisherJob.scala:140–147](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthUserMonthMhPublisherJob.scala#L140-L147) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/scalding/UthUserMonthMhPublisherJob.scala:158–164](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthUserMonthMhPublisherJob.scala#L158-L164) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/scalding/UthUserMonthMhPublisherJob.scala:224–231](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthUserMonthMhPublisherJob.scala#L224-L231) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/scalding/UthUserMonthMhPublisherJob.scala:250–258](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthUserMonthMhPublisherJob.scala#L250-L258) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/scalding/UthUserMonthMhPublisherJob.scala:289–315](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthUserMonthMhPublisherJob.scala#L289-L315) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/scalding/UthUserMonthMhPublisherJob.scala:373–381](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthUserMonthMhPublisherJob.scala#L373-L381) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/scalding/UthUserMonthMhPublisherJob.scala:413–426](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthUserMonthMhPublisherJob.scala#L413-L426) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/strato/columns/underTheHoodReport.User.strato:481–494](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.User.strato#L481-L494) 服务端消费 month aggregate 的 postIds。

边界：公开默认不等于生产配置；实际运行时覆盖、部署和实际输入未知。；实际 dailyDataEnvironment、CLI上限、数据任务运行/完整性未知。

### under-the-hood/strato/columns/underTheHoodReport.User.strato

变化：报告增加历史标签说明、按标签rich text/纯文本申诉及ID。FS关返回None；开时takedown直接限量，其余carried<=3优先展示，再按>5%隐藏，否则最多50；各数字由FS覆盖；账号申诉恒None。资格逻辑只提为showReport，未放宽。

影响：扩充 research-34：ID为空可由策略或数据截断造成；申诉说明不是申诉已提交/成功，帖子标签曾携带不等于当前有效。

关联：research-34、research-33。

- [under-the-hood/strato/columns/underTheHoodReport.User.strato:35–70](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.User.strato#L35-L70) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/strato/columns/underTheHoodReport.User.strato:84–96](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.User.strato#L84-L96) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/strato/columns/underTheHoodReport.User.strato:101–108](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.User.strato#L101-L108) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/strato/columns/underTheHoodReport.User.strato:120–129](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.User.strato#L120-L129) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/strato/columns/underTheHoodReport.User.strato:264–397](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.User.strato#L264-L397) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/strato/columns/underTheHoodReport.User.strato:399–411](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.User.strato#L399-L411) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/strato/columns/underTheHoodReport.User.strato:413–427](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.User.strato#L413-L427) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/strato/columns/underTheHoodReport.User.strato:436–442](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.User.strato#L436-L442) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/strato/columns/underTheHoodReport.User.strato:458–473](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.User.strato#L458-L473) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/strato/columns/underTheHoodReport.User.strato:487–496](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.User.strato#L487-L496) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/strato/columns/underTheHoodReport.User.strato:514–522](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.User.strato#L514-L522) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/strato/columns/underTheHoodReport.User.strato:527–535](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.User.strato#L527-L535) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/strato/columns/underTheHoodReport.User.strato:539–547](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.User.strato#L539-L547) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/strato/columns/underTheHoodReport.User.strato:551–559](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.User.strato#L551-L559) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/strato/columns/underTheHoodReport.User.strato:606–621](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.User.strato#L606-L621) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/strato/columns/underTheHoodReport.User.strato:662–670](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.User.strato#L662-L670) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/strato/columns/underTheHoodReport.User.strato:685–714](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.User.strato#L685-L714) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/strato/columns/underTheHoodReport.User.strato:738–749](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.User.strato#L738-L749) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/strato/columns/underTheHoodReport.strato:8–30](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.strato#L8-L30) 仅认证 viewer 且 feature switch 允许调用 User 报告。
- [under-the-hood/strato/columns/underTheHoodReport.User.strato:606–621](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.User.strato#L606-L621) runtime FS 读入申诉与 ID 展示策略。
- [under-the-hood/jetfuel/routes/_lib/load.ts:63–89](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/jetfuel/routes/_lib/load.ts#L63-L89) GraphQL 结果解析后交给页面消费者。
- [under-the-hood/scalding/UthUserMonthMhPublisherJob.scala:289–315](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthUserMonthMhPublisherJob.scala#L289-L315) 上游月ID已截断后供服务端再筛选。

边界：公开默认不等于生产配置；实际运行时覆盖、部署和实际输入未知。；展示≤3仍受 take(maxPerLabel)限制；配置异常/上游未携ID时不保证完整列表。

### under-the-hood/strato/graphql/under_the_hood.thrift

变化：GraphQL thrift ReportInfo新增两个可选申诉map和可选ID上限。

影响：向后兼容可选响应字段，不使账号申诉自动非空。

关联：research-34。

- [under-the-hood/strato/graphql/under_the_hood.thrift:7–19](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/graphql/under_the_hood.thrift#L7-L19) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/strato/columns/underTheHoodReport.User.strato:688–700](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.User.strato#L688-L700) 生产构造 accountLabelAppeals 始终 None。
- [under-the-hood/jetfuel/gql/underTheHoodReport.gql:13–27](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/jetfuel/gql/underTheHoodReport.gql#L13-L27) 前端查询消费。

边界：公开默认不等于生产配置；实际运行时覆盖、部署和实际输入未知。

### under-the-hood/strato/lib/params.strato

变化：新增 appeals、sensitive-media-appeal、post IDs 三个 boolean default false；始终展示小量默认3，占比阈值5，展示上限50，均FS参数并导出。

影响：公共默认不代表线上实验；这些是透明度展示设置，不是处罚阈值。

关联：research-34。

- [under-the-hood/strato/lib/params.strato:21–52](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/lib/params.strato#L21-L52) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/strato/columns/underTheHoodReport.User.strato:606–621](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.User.strato#L606-L621) 读参数为运行请求策略。

边界：公开默认不等于生产配置；实际运行时覆盖、部署和实际输入未知。

### under-the-hood/strato/lib/underTheHoodLabels.strato

变化：导出served labels/reasons集合；新增FOSNR/敏感媒体/BOUNCE/DMCA/国家withholding的申诉说明与URL映射；原标签effect不改。

影响：只是按既有标签生成说明；敏感媒体需独立开关，账号无申诉map，不能外推人人可申诉或任何国家同流程。

关联：research-34。

- [under-the-hood/strato/lib/underTheHoodLabels.strato:114–121](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/lib/underTheHoodLabels.strato#L114-L121) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/strato/lib/underTheHoodLabels.strato:188–194](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/lib/underTheHoodLabels.strato#L188-L194) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/strato/lib/underTheHoodLabels.strato:423–530](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/lib/underTheHoodLabels.strato#L423-L530) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/strato/lib/underTheHoodLabels.strato:546–557](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/lib/underTheHoodLabels.strato#L546-L557) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/strato/columns/underTheHoodReport.User.strato:267–311](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.User.strato#L267-L311) 在 appeals 和 takedowns 开关及allowlist判断后消费映射。

边界：公开默认不等于生产配置；实际运行时覆盖、部署和实际输入未知。；URL为固定提交源码引用，未查询网页验证当下表单可用；不提供法律结论。

### under-the-hood/thrift/uth_serving.thrift

变化：持久化 thrift UthPostLabelAggregate 加 optional postIds字段4，UthDailyPostLabel加 optional postIds字段10，标注TweetId个人数据。

影响：串联离线收集、月存储、报告输出；旧记录字段可缺，不能据缺失ID推断无标签。

关联：research-34。

- [under-the-hood/thrift/uth_serving.thrift:1–6](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/thrift/uth_serving.thrift#L1-L6) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/thrift/uth_serving.thrift:53–59](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/thrift/uth_serving.thrift#L53-L59) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/thrift/uth_serving.thrift:131–137](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/thrift/uth_serving.thrift#L131-L137) 已阅读该变动块及前后上下文；具体语义见 summary。
- [under-the-hood/scalding/UthDailyPostsJob.scala:107–124](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthDailyPostsJob.scala#L107-L124) 日写入者。
- [under-the-hood/scalding/UthUserMonthMhPublisherJob.scala:306–315](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/scalding/UthUserMonthMhPublisherJob.scala#L306-L315) 月写入者。
- [under-the-hood/strato/columns/underTheHoodReport.User.strato:481–494](https://github.com/xai-org/x-algorithm/blob/b220448766ab4ee4c83d58a67d51f0cb5bda86c2/under-the-hood/strato/columns/underTheHoodReport.User.strato#L481-L494) 报告读取者。

边界：公开默认不等于生产配置；实际运行时覆盖、部署和实际输入未知。

