# 新编辑规则包：启用范围与可追溯回退

## 已生效

默认安装包为 `x-algorithm-b220448-editorial-v1`，固定上游 `b220448766ab4ee4c83d58a67d51f0cb5bda86c2`。

- 内容哈希：`8e5e149166ce121103584e1af715f630529e204d61480e5a359a9044796137e1`。
- 激活事件：`knowledge-event-9806374de3f8dcb18176a99c`。
- 10条操作规则均经过独立语义审批和精确proposal审批，范围限定为 `editorial_only`。根据实际全文及有效语义证据提供内容建议；机制适用状态保持 `unknown`。
- 30条新版本事实、34条历史事实、72份材料及全部109个依赖保留。94个依赖公开、10个部分公开、5个未公开；15项缺口仍在激活记录中。
- 38条研究卡继续覆盖降权、分发机会、账号与上下文三类。它们是解释资料，不会自动变为处罚判定、推荐积分或增长保证。

已在隔离测试账号状态通过真实 `check → propose-update → activate-update` 事务，重载后确认新目录激活；默认包也已切换。新建状态消费新规则。已有账号状态不会静默迁移，须按下述受审流程更新。此次没有操作真实账号、发布推文、部署或改动main。

## 10条实际消费者

1. OP01：明确目标读者与读者收益，已经明确时保持原样。
2. OP02：让承诺与证据对应，必要时前移证据或收窄承诺。
3. OP03：补理解结论所需背景，保留真实交流语气。
4. OP04：提供可核查的标准、比较、步骤或纠错点。
5. OP05：只有实际历史正文经精确审核确认实质重复时，建议增加新案例、结果或限制。
6. OP06：核实事实、日期与素材，旧事件说明新增变化。
7. OP07：围绕真实问题或可读对话回复，再考虑原创总结。
8. OP08：补来源、日期与限制，只解释实际可见警示。
9. OP09：按信息需要选择图文，来源图必须先查看。
10. OP10：只有热点相关且确有个人贡献时提出判断、实测或实例，不伪造亲历。

OP07/OP10新增的4个语义信号已进入真实V5提取器。缺失证据不以关键词猜测补齐；缺失时保留unknown。规则选择拒绝pending/rejected；应用录入与交付均校验当前目录、规则审核状态、精确内容和选中上下文。逐规则依赖闭包参与溯源，未解决的依赖不能作为生产机制依据。`public_mechanism` 等依据不能升级本包的编辑权限。

## 已完成的定向验证

- 再次核对331条上游路径（321现存、10删除），覆盖固定248项diff，未审变化路径为0。
- 两轮独立审核：10条规则语义；精确proposal及20条旧/新规则回放。21份实际proposal/replay审核文件均经文件哈希、语义哈希及真实回执核验后激活。
- 20个旧/新版本共60个编辑谓词三态回放通过。这不是生产模型回放。
- OP07、OP10：完整正文 → 精确语义审核 → 信号提取 → 新规则选择/应用 → 独立guidance审核 → 保存重载 → 可交付，2/2通过。
- 交付负例：缺失语义、错误审核哈希、升级机制依据、旧catalog、自洽哈希的篡改selection均被拒绝，失败不写应用或推进状态revision。
- 新信号定向测试11项、scope测试3项、回退测试10项、历史激活加载测试4项、激活审核身份测试1项、研究状态与scope展示测试4项通过。未做无关完整回归。
- 最终独立只读核查：目录/激活/保存状态一致；21份审核材料逐字节及语义哈希匹配；新建状态可预览旧目录回退；即使人为传入机制true，10条机制状态仍unknown。

## 已有状态更新与回退

运行时代码升级也有兼容影响：即使既有账号未切换catalog，过去保存的V5 context没有本版新增的scope与依赖闭包字段，原有guidance可能转为 `needs_review`。旧证据不被删除或改写；须使用新run重新选择规则并完成应用/交付审核，不能仅复制旧审批或补字段冒充已审。V4历史行为仍由固定历史包验证，新的editorial_only规则必须走V5依据绑定流程。

已有状态按contract5 `knowledge-step` 流程执行：先以实际上游checkout完成check，再从新包propose-update，审核精确proposal与全部受影响版本的三态replays，最后activate-update。不会仅通过修改active标志替换包。不同旧状态或新上游变化必须重新生成相应proposal，不复用本次hash。

回退先调用 `rollback-preview`，指定已实际激活过的 `target_catalog_ref`，读取精确subject_ref/subject_hash/subject。独立审核该完整过渡，记录真实review_knowledge回执，然后调用 `rollback` 并指定 `review_receipt_ref`。

回退追加新的目录身份与激活事件，原证据与旧事件不变；当前或目标目录/任意规则的editorial_only限制都会保留。未知、未激活、损坏、未来、歧义目标，自审、缺失/篡改/过期主体回执均拒绝。默认包保留连续激活祖先，因此新建状态也能预览退回旧5版，但不能借回退扩大机制权限。

## 审计入口

- [当前目录](../assets/algorithm-knowledge/catalog.json)
- [激活事件](../assets/algorithm-knowledge/source-snapshots/events/activation-b220448-editorial-v1.json)
- [独立语义审批](../assets/algorithm-knowledge/source-snapshots/reviews/editorial-b220448/semantic-review.json)
- [精确proposal审批](../assets/algorithm-knowledge/source-snapshots/reviews/editorial-b220448/proposal-actual-review.json)
- [实际proposal](../assets/algorithm-knowledge/source-snapshots/reviews/editorial-b220448/proposal.json)
- [实际回放](../assets/algorithm-knowledge/source-snapshots/reviews/editorial-b220448/replays.json)
- [实际激活结果](../assets/algorithm-knowledge/source-snapshots/reviews/editorial-b220448/activation-result.json)
- [三类研究规则](algorithm-rules-2026-11-04.md)
- [完整候选的历史拒绝结果](algorithm-candidate-2026-11-04.md)
