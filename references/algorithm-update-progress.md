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

### Scope review hardening checkpoint

- Independent review identified per-rule rollback scope preservation and self-review rejection. Both are now enforced; proposal/replay activation receipts must identify distinct reviewer and generator for editorial releases.
- Application recording now checks the current catalog and recomputes the selected context before accepting actions. Final delivery retains its independent revalidation.
- Rollback focused suite: 10 passed, including current/target rule-level scope and six invalid reviewer identity cases. Changed activation identity test: 1 passed.
- Fresh upstream check again verified 331 source paths and the fixed 248-path diff. A 10-rule editorial-only package has been prepared with all 109 dependencies unchanged (94 public, 10 partially public, 5 external unpublished). It remains pending independent approval and is not installed at this checkpoint.

### Restricted editorial release activated

- Independently approved exact proposal `ef9834b68d8221454ae7215c39a65b938c63b03127f15e07eea2ef607e77f6ed`, 20 old/new versions and 60 three-state predicate cases. Actual review files and 21 verified receipts were consumed by `activate-update`, not a hand-written active flag.
- Isolated fixture account state reloaded at revision 5 with event `knowledge-event-9806374de3f8dcb18176a99c`. Default package now installs `x-algorithm-b220448-editorial-v1`, hash `8e5e149166ce121103584e1af715f630529e204d61480e5a359a9044796137e1`. Existing real account states were not migrated.
- OP07/OP10 complete extraction-to-persisted-delivery flows: 2 passed, including stale/tampered context, missing signal, mismatched semantic hash and forbidden mechanism upgrade rejection. No actual publication.
- Continuous historical activation loading: 4 passed; rollback suite: 10 passed. Research/current release metadata: 4 affected checks passed; prior research and guide archived. Fresh state rollback-preview retains editorial scope.
- Final independent read-only verification confirmed actual catalog/event/state/review hashes and forced mechanism unknown. All 15 non-public/partially-public gaps remain; no private data, production weights, deployment flags or account observations were invented.
- Only changed/associated tests were run. No main change, deployment, upstream service/model execution or complete regression.
- After the default package switch, the directly affected scope/history/rollback tests were run against the new installed bundle: 17/17 passed. This checks changed package compatibility rather than an unrelated full regression.

## Pre-merge compatibility review

- Read-only merge review found direct fixture drift that prior new-path validation did not cover: obsolete active IDs/counts, old test clocks loading new evidence, and historical V4 tests accidentally using the V5-only editorial release. CI has not passed for this branch; no merge is claimed.
- Historical protocol tests now use a complete, hash-verified immutable old package rather than cherry-picking old IDs from the new catalog. Current-package tests retain real new identities, scope and ancestry checks. No production rule, guard or approval requirement is relaxed.
- Added a controlled runtime-upgrade case: a persisted pre-scope V5 context is incompatible even with its original catalog unchanged; stale application is rejected, a new run can select and validate again, and prior evidence remains unchanged. Focused case: 1 passed.
- This invalidation is a real upgrade effect: old guidance can need review again. Documentation now explains it explicitly; historical account catalog preservation does not imply old guidance remains ready.
- Compatibility repairs: 29 cases across the five changed legacy knowledge/guidance files passed; 6 affected V5 cases passed (signals 2, support A05 1, update CLI 2, preference 1); the new upgrade case passed. Another 12 unchanged coach cases passed in the initial related run and were not repeated. Total evidence: 48 distinct related cases, not a full-project run.
- The CLI fixture now reads its local state file directly, avoiding an unrelated child stdout buffer truncating a larger serialized state. Runtime code and the approved catalog remain unchanged.
- CI is available through the existing pull_request workflow (Node 24, npm ci, npm test), or a later main push. No workflow_dispatch exists. No PR, main merge, full-suite CI trigger or deployment was performed in this repair step.

### PR #2: first complete CI and focused repair

- User approved PR creation and complete CI. Draft PR #2 targets main without merging; tested head `f017afa17589fbf3de4ae3ec59f9fe61573d3d32`, temporary PR merge `c6333fb`, run `41811139842`, job `126510390714`.
- GitHub Ubuntu 24.04.5 / Node 24.22.1 / npm 11.19.1: checkout, environment and npm ci passed. Complete npm test: **367 tests, 357 passed, 10 failed, 0 skipped/cancelled**, 89.849 seconds. This result is a failed CI run, not a full pass.
- Nine failures came from test helpers reading account-state through a bounded child stdout stream, truncating the now-larger package state. One source-verification fixture lacked required catalog/upstream metadata. No source gate or production behavior is weakened to address these failures.
- The source-check fixture now supplies its exact local committed head in prior/candidate catalog metadata; its failing dirty-source rejection case passed in a focused rerun. The remaining nine fixture cases are being repaired separately; complete CI will rerun on the corrected PR head.
- Focused repair verification completed: the nine original failing runtime/visual cases passed (23.8s); the previously passing E32 case was not repeated. Together with the source-verification case, all 10 original CI failures now pass locally. Changes are limited to three test fixtures plus this progress record. The next complete PR CI is still pending; no main merge or deployment has occurred.
