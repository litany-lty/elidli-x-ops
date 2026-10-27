# 算法知识覆盖

## 结论

当前目录固定到 `xai-org/x-algorithm@2f252142b9284e692ac72851768c8072d045f0d5`。原 110 项 Home/For You 依赖审查仍固定于 `6258a154…`；本次只增量审核内容特征、Home mixer 去偏输入传输及 VM Ranker 用户去偏参数/调用路径五个文件，不把同一提交其余变化冒充已审。

目录共登记 110 项依赖：

- 105 项公开或部分公开依赖已读到实际定义主体、接线、配置读取和效果/消费者；
- 65 项为 `dependency_only`，因为它们只提供观看者私有上下文、内部特征或下游输入；
- 16 项为 `no_operational_action`，因为它们只做完整性过滤、合规、遥测或缓存，不能导出作者动作；
- 21 项连接现有或新增事实卡；
- 8 项仍因外部依赖受阻，其中包含 5 个明确未公开的顶层依赖。

`unreviewed_public_dependency_ids` 为空，因此当前目录可称“固定 SHA 的已登记公开范围审查完成”；这不表示外部服务、生产配置、隐藏分类器或每次线上决策公开。

## 明确外部缺口

- TweetMixer、Phoenix、MOE、SID、SimClusters、Thunder 的服务内部实现与当次响应不在本仓库。
- `visibility-filtering/params.rs` 引用的 `../../visibility-limited-actions/main/limited_actions_policy.yml` 不在固定仓库；只能确认解析器、reason、可能动作类型和 treatment 消费，不能给出 LOW_QUALITY/MISINFO 的精确生产动作矩阵。
- 隐藏标签分类器、部分 Grok prompts、botmaker rules、部署材料及每请求实验配置未公开。
- 公开时间和代码相容性不能替代生产生效证据；历史适用性和具体账号命中仍保持 `unknown`。

## 纠错与证据口径

README 指向的旧 `registry.rs` 在固定提交不存在；实际调用以 `rules/safety_level.rs`、`rules/levels.rs`、`rules/engine.rs`、`evaluate_tweets.rs` 和 `treatment.rs` 为准。每项依赖在 `source-snapshots/dependencies.json` 中保存固定路径、文件 hash、接线状态、配置可见性、公开程度、审查深度、处置与具体行段理由。

源码节选与 Apache-2.0 许可保存在 `assets/algorithm-knowledge/source-snapshots/`；x-ops 自有规则仍按项目许可。目录材料可离线验 hash，但不冒充本次联网生产观测。

## 时间勘误

`x-algorithm-public-v2` 曾把目录、激活事件、C16–C19 事实及对应材料的审查时间预置为 `2026-10-27T00:00:00Z`，晚于当时实际时钟。原件作为不利历史证据保留，但不再具有 active 资格。`x-algorithm-public-v3` 使用新的 artifact/fact/rule ID，以实际复核时间追加 C16–C19 勘误；新事实通过 `supersedes` 精确指向旧事实，并明确机制解释未变。OP08-v3 与 OP09-v3 仅切换到勘误事实，未宣称算法升级。`x-algorithm-public-v4` 再把生命周期事件移出稳定内容哈希，采用 `exclude-lifecycle-v1`，使审核或激活时间变化不会伪装成知识内容变化；v2/v3 仍按原哈希策略验证。加载器会拒绝任何非回放用途的未来 active 目录；显式 errata 模式只允许读取旧目录以提出修复，不能用于规则选择或指导。

## 2026-10-27 上游候选差异边界

实际比较 `6258a154…` 与 `2f252142…` 后，相关范围确认包含：Home mixer 将 `VMRankerSendDebiasInputs` 默认值由 false 改为 true，并增加一组 Phoenix shadow traffic；VM Ranker 新增用户去偏模型、参数和重排路径，但 `UserDebiasEnabled` 默认 false、`UserDebiasAlpha` 默认 0；内容长度提取实现重写并以测试维持既有参考行为。该提交同时有大量安全与可见性代码变化，本次未逐项审核，不能只替换 catalog commit，也不能声称全仓影响已批准。

修正版目录已绑定实际 remote HEAD 检查、保存候选、独立 proposal 审核、24 个真实 SignalSet 路径案例及 54 个完整三态 replay 后正式激活。旧 V4 catalog、规则和 lifecycle 文件仍保存在 history；未审的同提交范围、生产开关、模型可用性与逐请求效果继续保持未知。
