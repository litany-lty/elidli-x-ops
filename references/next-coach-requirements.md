# NEXT coaching/review reliability traceability

本文件保留模块交接时的证明边界；跨模块与真实宿主缺口的最终闭合见[整体验收](next-acceptance.md)。不得将单文件的待集成记录误当最终产品状态。
This table maps plan cases E14–E26 to executable evidence. It does not claim Gate B or live-account validation.

| Case | Implemented contract | Deterministic assertion |
| --- | --- | --- |
| E14 | `prepareContentAnalysisV3` separates target work from the full resolved context pool; ingest re-resolves the same context | `E14/E15 target reply uses the same frozen current parent context through prepare and ingest` |
| E15 | `ContextSelectionV3.context_selection_hash` is order-stable and changes with the selected current parent | same assertion as E14/E15 |
| E16 | `analysis_proposal_hash` binds semantic fields; the newest exact receipt is authoritative; denied analyses are not reused | `E16 content approval...`; `E16 a later exact denial...` |
| E17 | target/baseline selectors share the requested scope and cutoff; future observations are excluded | `E17/E18 purpose-bound evidence...` |
| E18 | evidence roles carry purpose; background cannot enter target values; unrelated additions do not change the role hash | same E17/E18 assertion |
| E19 | consumers default to entity `current_version_ref`; historical versions require explicit comparison | `E19 consumer defaults...` |
| E20 | review computation and maturity use the same shared age-window selection | `E20/E21 review computation...` |
| E21 | exact 24h is selected; 72h is not substituted; pending and missing remain distinct | E20/E21 plus `E21 does not substitute...` |
| E22 | unfinished periods remain pending; account metrics use the real account entity and require an exact completed event period | `next-data-reliability.test.mjs` period boundary plus `E22 account event-period review...` |
| E23 | only strict/discriminated windows are usable; ambiguous legacy views remain repairable; incomplete data may close only as reviewed `inconclusive` | `E23 V2 plan windows...`; `E23 an incomplete planned window...` |
| E24 | host interpretation cannot refill deterministic values; selected corrections stale computation; unrelated observations do not | `E24 close rejects...`; `E24 unrelated observations...` |
| E25 | unsupported formulas/guarantees fail, while quotations, rebuttals and uncertainty are reviewable | `E25 honest rebuttals...` |
| E26 | active plans and legacy/untrusted reviews are not effect evidence; V3 results require `result_trust: verified` | `E26 old closed review...` |

Public recovery interfaces: `buildExperimentPlanView`, `validateExperimentPlanViewV3`, `RecordPlanViewPayloadV3`, `buildReviewComputation`, and `applyExperimentTransitionV3`.

