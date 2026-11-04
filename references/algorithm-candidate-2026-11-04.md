# 操作候选验证与启用边界

## 当前结论

- 上游固定到 `b220448766ab4ee4c83d58a67d51f0cb5bda86c2`。
- 38条研究规则和全部248条变动语义审查已完成；范围是固定两提交之间的公开diff，不是全仓全分支或生产验证。
- 新操作候选含30条新版本事实、10条操作规则、72份材料；保留34条历史事实，包括4条时间勘误的祖先。默认安装目录 `catalog.json` 没有替换。
- **候选未激活，现有账号状态也未迁移。** 旧操作目录仍为 `x-algorithm-2f252142-signals-candidate-v5`。

## 实际验证

1. 核对331条源路径：321个现存文件、10个删除文件，均绑定固定Git对象。
2. 全248路径逐项有变化解释、影响映射、调用/消费证据及before/after/patch哈希；1860条行范围有效。
3. 研究95份代码节选逐字匹配，另外2份明确为派生diff材料。
4. 所有20个旧/新受影响规则版本的编辑谓词执行60个三态案例，结果通过。它们只证明编辑判断，不是生产算法回放或真实曝光测试。
5. 候选加载、schema、旧文件保留、历史事实递归装载和不覆盖输出目录检查通过。
6. 独立复核发现OP05旧推导文案仍含已不用的主题重合阈值。本候选已修为实际历史语义审核 `substantive_repeat`，未改变谓词或编辑动作。该文字修订不使原生产缺口消失。

## 为什么不能整包启用

10个受影响的部分公开依赖仍未决：

- `EvaluateTweetsTreatment`、`LimitedActionsPolicies`、`LimitedActionsPolicyResolver`。
- `PhoenixMOESource`、`PhoenixSource`、`PhoenixTopicsSource`、`SidSource`、`SimclustersSource`、`ThunderSource`、`TweetMixerSource`。

其中4个实现本体发生变化；其余6个因共享pipeline调用变化进入影响集。Resolver的局部变化是指标迁移，但EvaluateTweets/treatment还包含状态与通知消费变化，Thunder改了请求路由，不能统一称为无行为影响。各模块有部分公开实现，不等于生产策略、响应和完整私有依赖已知。

10条候选操作规则仍为pending。普通用户同意、源码哈希一致或60条编辑回放不能替代缺失证据，也不能把未知配置改成public。独立结果为 `revision_required`，所以保留门禁，不写伪激活事件。未来需补齐与实际规则依赖相关的证据，或另行设计并审核不依赖这些缺口的有限规则子集；本次没有放宽这一门槛。

## 准备候选包

下面命令只复制可审查候选，不改现有账号状态、不启用规则、不运行上游服务。输出目录必须不存在：

```bash
node scripts/prepare-knowledge-candidate.mjs --output /tmp/x-ops-candidate-b220448
```

输出可用于现有contract5 `knowledge-step check` / `propose-update`流程。含diff账本的候选禁止通过V4旧更新/激活入口，必须由V5实际源码检查和独立审查流程处理。当前候选预期不能通过激活门禁。

## 可追溯材料

- [候选目录](../assets/algorithm-knowledge/source-snapshots/catalogs/candidate-b220448.json)
- [事实与依赖迁移清单](../assets/algorithm-knowledge/source-snapshots/reviews/b220448/candidate-audit.json)
- [实际检查、影响与回放](../assets/algorithm-knowledge/source-snapshots/reviews/b220448/candidate-verification.json)
- [独立精确候选审查](../assets/algorithm-knowledge/source-snapshots/reviews/b220448/candidate-independent-review.json)
- [完整变化账本](algorithm-diff-review-2026-11-04.md)

未修改main、未部署、未执行上游模型/服务、未做全量回归或真实账号测试。
