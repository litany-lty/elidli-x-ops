# X 算法证据与运营推断

## 固定基线

- 仓库：`xai-org/x-algorithm`
- commit：`6258a1549ef808be88fba83d3b2d58364b587ee0`
- 核查日期：2026-10-26
- 本轮实际读取：该 commit 的 `README.md`、`xai-value-model/scoring.rs`、`home-mixer/scorers/author_cold_start.rs`；其余路径作为规则定位线索，使用前按具体任务读取。
- 主要适用面：For You 推荐流；搜索、Following、回复、广告和收益不自动适用。
- 线上状态：仓库说明存在动态配置、线上实验和未公开组件，单凭开源默认值不能确认某次线上请求的最终行为。

每次记录 RuleVersion：commit、文件／符号、读取来源、执行条件、推断边界、核查时间、替代版本。
规则变化时追加版本，不覆盖历史运行所用版本。

## 可采用的证据

| 机制 | 代码依据 | 可以转成的编辑动作 | 不可推出 |
|---|---|---|---|
| 候选召回 | `home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs`、`sources/*` | 明确目标读者、问题和独有信息 | 垂直发布几天就获得固定标签 |
| 多目标评分与负反馈 | `xai-value-model/scoring.rs` | 每条设主要目的；避免误导、重复推销 | 自行拼权重得到“算法总分” |
| 双向关注条件 | `xai-value-model/inputs.rs`、`weights.rs` | 从真实往返讨论提炼选题 | 批量互关可稳定提权 |
| 阅读／点击停留预测 | `phoenix/xrex/configs/xrecsys.py` | 让开头承诺与正文兑现 | 读满固定秒数必涨流量 |
| 同作者多样性 | `xai-value-model/scoring.rs` | 检查近期草稿是否重复角度 | 固定每天上限或间隔 |
| 新帖探索 | `home-mixer/scorers/author_cold_start.rs` | 统一观察窗口，保留早期低表现样本 | 每帖保底曝光或固定失效时间 |
| 可见性过滤 | `visibility-filtering/rules/` | 异常先核对真实账号状态与标签 | 低流量等同限流 |
| 动态重排 | `home-mixer/scorers/vm_ranker.rs`、`vm-ranker/ranking_config.rs` | 记录版本与条件 | 本地常量等于线上最终公式 |

DPP 相关代码可作为研究背景，不把未确认启用的相似度阈值写成运营规则。
外链只按可信度、正文自足和转化目标判断；没有证据要求所有普通外链移到回复区。

## 表达规则

输出时明确标注“源码事实”“官方说明”“账号观察”或“待验证假设”。
从源码事实到运营建议中间必须写适用条件和验证办法。
不输出推荐分、爆款概率、保证曝光、固定发帖频率或未经观察的因果归因。

固定来源：

- https://github.com/xai-org/x-algorithm/tree/6258a1549ef808be88fba83d3b2d58364b587ee0
- https://github.com/xai-org/x-algorithm/blob/6258a1549ef808be88fba83d3b2d58364b587ee0/README.md
- https://github.com/xai-org/x-algorithm/blob/6258a1549ef808be88fba83d3b2d58364b587ee0/xai-value-model/scoring.rs
- https://github.com/xai-org/x-algorithm/blob/6258a1549ef808be88fba83d3b2d58364b587ee0/home-mixer/scorers/author_cold_start.rs
