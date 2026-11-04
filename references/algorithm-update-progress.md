# X 算法更新与修复进度

## 当前任务

- 目标：核对上游更新，形成降权、增流、账号及上下文三类可追溯规则，修复更新检查漏报。
- 项目起点：`7cede9484035c3a8875271144d6508dc151243af`。
- 操作规则包起点：`2f252142b9284e692ac72851768c8072d045f0d5`。
- 本次上游：`b220448766ab4ee4c83d58a67d51f0cb5bda86c2`，提交时间 2026-11-03 02:56:51 UTC。
- 开发分支：`feat/x-algorithm-20261104`。不修改或合并 main。

## 本轮交叉核查修订

- 项目续接起点：`efcc30e7e02f7b0d0309c1f9d114dad7d9694f96`，开发分支未变；本次重新检查上游HEAD仍为`b220448…`。
- 已纳入完整审查报告，包含2353个文件盘点与各模块审查深度。原始报告文件SHA256为`450442f25ffd77c970a118164db942160d1250b15c871331924357b8e0eb3830`；原样保存为`algorithm-full-review-2026-11-04.md`。
- 当前研究35条：降权11条、分发机会12条、账号及上下文12条。新增15条，纠正原05/06/20，补齐其他关联规则的实际接线引用。
- 五组机器可读接线：Home请求明确启用VM重算；Home未显式传following count；Home VF动作仅保留/移除、不对Downrank/Avoid数值扣分；DPP部署与请求双gate；PageDecode/PageRL实验及其互斥条件。
- 当前71份来源：69份源码节选的完整文件SHA256、逐字节选和行号范围已核对，2份原有派生diff材料保留。两份短文件引用终点已纠正后复核通过。
- 旧20条研究manifest和文档按原内容保留；loader验证历史哈希、运行接线源引用及规则引用，避免默认值替代调用者条件。当前研究hash为`957a378047684712fbb92b1a32399e9c35904e8c1fcd92e7386c96e7993a240f`。
- 本轮5项定向测试通过：研究加载、只读操作、材料/时间校验、关键接线断言、历史和引用防篡改。上轮更新检查等11项证据复用，未因文档扩展重复执行；未做全回归、上游构建、真实账号测试或生产发布。
- 原操作目录及其历史材料无改动，234条变动仍未完成全面语义审查，未执行规则激活。

## 上轮已完成

- 已核对实际仓库与远端 HEAD；相比起点有 242 个文件变化，包括新增、删除及重命名。
- 已保存20条新版本研究规则：8条降权/减少可见机会、8条增流/排名机会、4条账号及上下文规则；逐条列出前提、默认开关、推论边界和固定提交来源。旧事实、规则和激活记录原样保留。
- 已修复全仓变动、调用者和配置漏报；未审路径明确形成 gap，不能仅凭文件读取或一般审批冒充完成审查。
- 真实上游检查：`changed`，HEAD与remote HEAD一致；校验330个源/调用者/配置文件，发现248条路径变动（242项中的6项重命名按旧/新路径拆分），现有10条规则均被标记受影响。
- 源码核对：28份源码节选与当前上游逐字相符、完整文件SHA256相符；另2份为明确标记的派生diff证据。研究清单保留234条未全面审查的变动路径。
- 定向测试：更新检查/影响/激活门禁/CLI相关11项通过；研究加载/只读操作/材料与时间校验3项通过。只检查本次修改和关联流程，未运行全量回归、构建、真实账号测试或发布。
- 实现语法检查和 `git diff --check` 通过。

## 保留边界

- 新研究可经 `knowledge-step` 的 contract5 `research` 操作读取，但没有激活替换旧操作目录。完整新版未逐文件审完，也没有生产开关或特定账号命中证据。
- 默认关闭的新观看者soft NSFW保护、页面解码重排、视频轮播等不能描述为全站已启用。Home与VM默认值分别记录；删除巴西2026名单过滤不等于取消巴西法律标签过滤。
- main未修改；线上发布、main合并和全量回归不在本次执行中。

## 2026-11-04 continuation: exact changed-path review

- Resumed from `ebc6844` on `feat/x-algorithm-20261104`; main remains unchanged.
- Reviewing all 248 add/modify/delete paths (242 rename-aware changes), including the 234 previously open paths, with before/after/diff hashes and concrete semantic impact.
- Added immutable public-diff review support. Deleted files and changed callers/configuration can be closed only by exact semantic records. Missing production inputs remain unknown, and explicit semantic blockers remain activation gaps.
- Focused validation: `node --test test/knowledge-change-review.test.mjs test/knowledge-repository-impact.test.mjs test/next23-knowledge-updates.test.mjs`: **8 passed**. No full regression, upstream execution, deployment or activation performed at this checkpoint.

### 248-path review checkpoint

- All 248 changed paths now have concrete static semantic reviews and before/after/patch hashes. This closes the original 234 open paths and completes the other 14 earlier targeted paths. All 1,860 source locators were checked. This is complete review of this fixed diff, not every branch of every repository file or production behavior.
- Research now contains 38 bounded rules and 97 sources: 95 exact source excerpts verified against committed file hashes and line slices, plus 2 explicitly derived diff materials. The prior 35-rule manifest and guide are preserved.
- Independent code review found and corrected replay-impact loss for reviewed callers, blocked-path precedence and the V4 downgrade route. A deleted caller only closes when its reference is actually removed. Full historical fact ancestry is now loaded oldest-first.
- Focused checks: changed-path review 6 cases, existing impact/update 5 cases, research 6 cases passed. No unrelated regression. A separate candidate materialization check passed, with 30 active candidate facts + 34 historical facts retained.
- Candidate preparation has checked 331 source files and evaluated 60 editorial three-state cases for 20 old/new rule versions. It remains **not activated**: pending independent approval and 10 affected partially public dependencies are not cleared by these replays. Candidate artifacts are being finalized separately.

### Final candidate handoff

- Candidate facts/materials and the preparation helper are now packaged without replacing the installed active catalog or any account state.
- Independent exact-proposal review confirmed the source bindings, prior-file preservation and bounded replay results. It identified an old OP05 derivation-text mismatch; the candidate now matches its substantive-repeat predicate. Only text/coverage metadata changed, so unchanged source and predicate evidence was explicitly reused, not claimed as rerun.
- Final proposal: `f6d4c6ba660db01842431811aeca7edbbc9cf5ec826f5995dbc35d349dac430e`; independent decision **revision_required**. The 10 affected partially public dependencies and pending approvals remain. Earlier proposal/review evidence is retained alongside the final records.
- Actual activation attempt was refused with `MISSING_EVIDENCE`; no activation event was written. V4 cannot bypass the V5 source-review flow. Safe activation is not claimed.
- Main, installed catalog and historical source/fact files remain unchanged. No full regression, deployment, upstream model/service execution or real-account action.

## Scoped activation work

- Added explicit editorial-only execution scope, approved-rule selection, transitive dependency provenance, and rejection of mechanism-basis upgrades. Missing private dependencies remain unknown.
- Added four missing OP07/OP10 semantic signals; 11 targeted extractor/context tests passed. No keyword-based or fabricated personal-experience inference.
- Added exact-reviewed, append-only rollback snapshots with non-widening scope. Seven targeted rollback cases passed across focused runs.
- Three targeted scope checks passed. End-to-end delivery tests are prepared and await the independently reviewed release; the installed catalog has not yet switched at this checkpoint.
