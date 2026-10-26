# 算法知识覆盖

## 结论

当前目录固定到 `xai-org/x-algorithm@6258a1549ef808be88fba83d3b2d58364b587ee0`。已逐项读取固定 Home/For You 主链中登记的 query hydrator、9 个来源、candidate hydrator、filter、scorer、selector、post-selection hydrator/filter、side effect、可见性 action 消费端及必要训练标签。26 张起始卡扩充为 30 个当前事实版本。

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
