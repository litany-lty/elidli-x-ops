# 指标、复盘与观察试验

## 指标边界

发布行为、期间发生的表现、截至采集时的累计表现分开。
public total、organic、promoted、媒体、账号和帖子指标不混算。
displayed views 不能无依据映射为 impressions。
只为同一快照内同范围的有效分子／分母算比率，报告有效样本数。

每个实体、source_id、aggregation_level 和 aggregation_window 独立选择整份快照。
MetricStats／PairedRatio／Comparison 明确保存聚合层级、原始聚合窗口、group_by 和 group_value；主题与帖子类型是不同观察维度，不能相加冒充更多帖子或独立样本。
多来源对比保持 source_id；区间聚合不与 cumulative 累计值合并。同帖龄选择遇等距观测取较早值，未走完整个容差窗时保持 pending。

优先报告中位数、总量、有效数、缺失数和代表帖子；不要只报容易被单条爆款抬高的均值。
最近 7 天是最近 28 天的子集，不把二者当独立实验组。
账号 followers 窗口变化不归因给单条帖子；单帖 attributed follows 另记。

## 观察窗口

在发布前声明目标指标和观察窗口。
普通比较优先使用成熟的 24h 同龄观测；长期行为可另请求 168h，但不自动扩大。
成熟按预先冻结窗口的上沿判断：新 24h 计划默认 `24h±2h`，须到发布后 26h；新 168h（7天）计划默认 `168h±12h`，须到 180h。既有计划明确保存的 target/tolerance 原样使用，不能因为已有 24h 或 72h 数值提前成熟。
帖龄窗口必须能从真实 PublicationRecord 解析可靠发布时间；缺失或冲突返回 `WINDOW_MISSING`。冻结 cutoff 尚未达到上沿返回 `WINDOW_PENDING`。账号 period 只有在 cutoff 达到 `end_exclusive` 后成熟。
SelectionPolicy.windows_days 固定为 [7,28]，表示发帖批次窗口；单帖24h观测由 age_windows 表达，不把 windows_days 写成 [1]。
缺基期或同龄记录时，报告描述性结果和实际限制，不补历史快照。

## 复盘

ReviewInput 必须指向真实 PublicationRecord／post_id、相关 snapshots、cutoff、目标和窗口。
`review` 复用账号统计模块，返回实际选择记录、描述统计、来源／角度关联和限制。
Agent 在此基础上写发现提案及下一轮一个主要试验；不重新发明计算。

记录：保留什么、停止什么、下轮只改变什么、何时检查以及什么结果支持继续。
一次观察不证明因果；同时变化很多时不能把结果归因给某一处改稿。
fixture 仅证明链路和计算，不能写成真实增长证据。
