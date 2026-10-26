# NEXT-2.1 数据可靠性验收映射（E01–E13）

本文件保留模块交接时的证明边界；跨模块与真实宿主缺口的最终闭合见[整体验收](next-acceptance.md)。不得将单文件的待集成记录误当最终产品状态。
本页只记录 `x-ops-next-professional-reliability-and-visual-content-plan-2026-10-26.md` 中 E01–E13 的实现入口和已实际执行的证据。它不是全套 52 项验收报告，也不替代真实账号门禁。

| ID | 实现入口 | 已执行断言 | 结果与边界 |
| --- | --- | --- | --- |
| E01 | `decodeImportMaterial`、CLI `data-import` | `next-import-cli.test.mjs` 真实执行 archive object preview→commit→reload→`account-analyze`；校验原始字节及 SHA-256；非法 JSON 不改 state | 通过 |
| E02 | `appendPostMetadataEvidence`、`resolvePostMetadataView` | `next-data-reliability.test.mjs` 双向导入同正文，metadata facts 一致；`created_at` 可用于同帖龄选择且不改旧 PostVersion | 通过；CLI 场景另由 E01 覆盖单向材料 |
| E03 | `resolvePostMetadataView` | 同一版本两份冲突 `created_at` 均保留，并解析为冲突而非最后写入获胜 | 通过 |
| E04 | `resolvePostIdentity`、`resolveVersionPostKey`、观测选择归因 | 新正文与旧 ID 观测分别经 CLI 导入并 reload：仅一个 canonical 实体、旧引用仍有效；未绑定具体版本的观测明确为 `content_attribution: unknown` | 通过 |
| E05 | `sourceDefinitionFingerprint`、导入批次身份 | 相同原始字节在不同真实 `observed_at` 下追加两个观测；相同上下文重试幂等；稳定系列相同，实际定义改变形成新系列；观测时间保持材料上下文原值 | 通过 |
| E06 | `resolvePostIdentity`、state 引用校验 | 合法多级链解析；循环和悬空 alias 被拒绝 | 通过（纯函数与 state 守卫分别负责） |
| E07 | `selectMetricObservations`、`analyzeAccountV2` | 七日总览 24,000 与单日 3,500 只选一个，不得相加成 27,500 | 通过 |
| E08 | `calendarEndExclusive`、period selector、账号期间聚合 | 七个非重叠来源日历日合法求和；重叠/跨界行排除；边界跨月、跨年及 `America/New_York` 夏令时周保持纯日期计算，不虚构 UTC | 通过 |
| E09 | `computeComparison`、`compatibilityKey` | organic 100 与 promoted 200 判为不兼容，不给涨幅 | 通过 |
| E10 | `compatibilityKey`、`buildObservationIndex` | 不同 measurement scope 不兼容；既有 V2-08 证明跨来源同定义等价证据归并 | 通过；自定义等价定义仍需显式版本化定义，不靠来源名推断 |
| E11 | collection coverage + account deliverable status | 有值但来源 `partial/has_more/failed_items` 时，账号期间仍为 partial，不给完整期间完成状态 | 通过 |
| E12 | `evaluateDeliverableCoverage` | 明确请求的实体全部覆盖时该请求可 complete，同时输出“全账号覆盖仍未验证”限制 | 通过 |
| E13 | host observation coverage、分页策略、未结束期间判定 | 同一 host API 返回中的成功值与 errors 同时保留，失败数/`has_more` 进入完成状态；分页预算停止保留 continuation token；未结束当天和共享 period selector 均保持 partial/pending | 通过（合成材料；非真实 API） |

## 本轮实际执行

- `node --test test/next-data-reliability.test.mjs test/next-import-cli.test.mjs`：18/18 通过。
- 此结果只覆盖上述定向数据路径；未在本页宣称全量测试、真实账号流程或 52 项总门禁通过。
