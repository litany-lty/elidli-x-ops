# x-ops 输入模板

这些模板展示输入形态；替换占位内容后再运行，不能把示例当真实账号或新闻。

目录：CLI 外壳；规范账号 JSON；V2 数据导入；原稿 DraftInput；CSV ColumnMapping；新闻任务；运行时 ID 与任务关联。

## 规范账号 JSON

`account-analyze` 的 payload 为 `{format:"json",account_input:下面对象}`。以下为完全虚构、可修改的最小样本，不是目标账号数据。所有实际素材需使用真实作者、来源和采集时刻；MetricValue 的未知与真实零值不同。

```json
{
  "schema_version":1,
  "account":{"handle":"fixture_example","profile_url":"https://x.com/fixture_example","user_id":null,"identity_basis":"user_provided"},
  "analysis_cutoff":"2026-10-26T04:00:00Z",
  "requested_scope":{
    "mode":"sample",
    "selection_policy":{"cutoff":"2026-10-26T04:00:00Z","windows_days":[7,28],"age_windows":[{"target_hours":24,"tolerance_hours":2}],"group_by":["post_type","primary_topic"],"requested_metrics":["likes","impressions"],"metric_scope":"public_total","source_selection":["source-example"]},
    "requested_outputs":["content","latest","age_matched"]
  },
  "coverage":{"requested_start":null,"requested_end":"2026-10-26T04:00:00Z","observed_oldest":"2026-10-24T03:00:00Z","observed_newest":"2026-10-24T03:00:00Z","source_mode":"user_sample","status":"sample","pages_read":0,"has_more":false,"stop_reason":"user_sample","raw_item_count":1,"deduplicated_count":1,"metric_available_counts":{"likes":1}},
  "posts":[{"post_key":"x:123456789","post_id":"123456789","account_id":null,"author_handle":"fixture_example","url":"https://x.com/fixture_example/status/123456789","created_at":"2026-10-24T03:00:00Z","text":"虚构示例：先把流程写清楚，再考虑自动化。","post_type":"original","edit_history_ids":[],"thread_root_id":null,"primary_topic":"workflow","topic_tags":["workflow"],"source_ref":"source-example"}],
  "snapshots":[{"snapshot_id":"snapshot-example","entity_type":"post","entity_id":"x:123456789","account_id":null,"captured_at":"2026-10-25T03:00:00Z","source_ref":"source-example","metric_scope":"public_total","aggregation_level":"post","aggregation_window":"cumulative","metrics":{"likes":{"value":0,"availability":"observed","precision":"exact","raw_value":"0"},"impressions":{"value":null,"availability":"not_provided","precision":"unknown","raw_value":null}}}],
  "source_refs":[{"source_id":"source-example","kind":"fixture","locator":"input-templates.md#规范账号-json","retrieved_at":"2026-10-26T04:00:00Z","description":"明确虚构的输入示例","metric_mapping":{},"raw_material":"此处1条帖子及观测均为虚构教学数据"}],
  "data_mode":"fixture"
}
```

CSV payload 为 `{format:"csv",csv_path:"绝对CSV路径",mapping:ColumnMapping,account_context:账号外壳}`；account_context 使用上面对象去掉 posts、snapshots，source_refs 设为不含本次 CSV 来源的其他来源数组（单一 CSV 时为 []），本次来源由 mapping.source_record 加入。CSV 只按明确映射导入，指标规范键为 `metric.指标名`；有指标时必须声明 captured_at。每个时间列的 format 与 IANA timezone 必须按真实来源填写。

## CLI 外壳

```json
{
  "schema_version": 1,
  "run_id": null,
  "expected_revision": null,
  "payload": {}
}
```

## 原稿 DraftInput

首次先令 `semantic_review` 为 null，取得 hashes 后对完整稿复核，再把实际结果填回。

```json
{
  "draft_id": null,
  "revision": 1,
  "parent_revision": null,
  "card_id": null,
  "personal_context_hash": null,
  "original_text": "用户原文",
  "original_ref": "source-user-material",
  "format": "short_post",
  "texts": ["最终完整推文"],
  "fact_mapping": [
    {
      "text_index": 0,
      "start": 0,
      "end": 6,
      "claim_ids": [],
      "user_fact_ids": ["fact-实际ID"]
    }
  ],
  "semantic_review": null
}
```

新闻卡产生的草稿后续改稿时，继续使用代码返回的 `draft_id`，`revision` 加一并把 `parent_revision` 指向当前最新版。可以省略本次输入中的卡片值（使用 `card_id:null`），代码会继承父版本的精确 `card_id`；不能改绑另一张卡。

## V2 数据导入

以下结构只展示虚构材料的预览请求。`material_path` 必须是实际受限材料路径，`source_ref` 必须对应已经登记的原始材料；示例值不代表任何真实账号或已验证的 Analytics 格式。

```json
{
  "schema_version": 1,
  "run_id": null,
  "expected_revision": null,
  "payload": {
    "contract_version": 2,
    "operation": "preview",
    "material_path": "/private/path/to/synthetic-example.csv",
    "material_kind": "analytics_csv",
    "source_ref": "source-synthetic-export",
    "declared_context": {
      "account_identity_ref": "x-handle:fixture_example",
      "measurement_context": {
        "observed_at": null,
        "selected_period": {"start": null, "end_exclusive": null},
        "source_timezone": null,
        "basis": "user_export"
      },
      "mapping": {},
      "constants": {},
      "imported_at": "2026-10-26T04:00:00Z"
    }
  }
}
```

先读取 `preview_id`、`preview_hash`、账号依据、缺列、未知定义和 adapter 状态。只有 `recognized` 且身份、期间和必要映射正确时才提交 `commit`；提交使用最新状态 revision，并带回同一材料 hash 与 preview hash。真实 CSV 样本未经验证时，adapter 必须保持 `unverified` 或 `mapping_required`，不能因为合成样本可解析就改成已验证。

V2 教练流程按 `coach-step prepare → ingest content_analysis/evidence_scope → ingest coaching_proposal → ingest semantic_review → finalize` 推进。每次都复用返回的正式 `run_id`、最新 state revision、当前 `bundle_hash` 和 `proposal_hash`。正文、证据包或提案发生实质变化后，旧语义复核不能继续使用。

## 账号采集回执

真实宿主成功读取 Analytics、正常导出、历史帖子或官方 API 后，保存未改写的原始结果，再以 `record` 登记对应能力。下面是 fixture 结构示例；hash、位置和路径必须从实际原始结果计算。

```json
{
  "schema_version": 1,
  "run_id": null,
  "expected_revision": 2,
  "payload": {
    "contract_version": 2,
    "operation": "collection_receipt",
    "data": {
      "receipt_id": "collection-receipt-synthetic",
      "binding_id": "actual-host-binding-id",
      "capability": "analytics_export",
      "status": "succeeded",
      "account_identity_ref": "x-handle:fixture_example",
      "tool_name": "actual-tool-name",
      "host_call_ref": "actual-call-ref",
      "actual_result_ref": "/absolute/private/path/synthetic-result.json",
      "actual_result_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "identity_locator": {"start": 0, "end": 15, "exact_text": "fixture_example"},
      "material_locator": {"start": 20, "end": 29, "exact_text": "synthetic"},
      "captured_at": "2026-10-26T04:00:00Z",
      "data_mode": "fixture"
    }
  }
}
```

fixture 回执不会把真实能力标为 verified。登录墙、错号或失败使用对应状态并保留原始返回；不能把它们登记为成功或零数据。

## CSV ColumnMapping

```json
{
  "schema_version": 1,
  "mapping_id": "mapping-example",
  "columns": {
    "post_id": "Post ID",
    "created_at": "Created At",
    "text": "Text",
    "captured_at": "Captured At",
    "metric.impressions": "Impressions"
  },
  "constants": {
    "author_handle": "fixture_example",
    "metric_scope": "public_total"
  },
  "time_formats": {
    "created_at": {"format": "iso8601", "timezone": "UTC"},
    "captured_at": {"format": "iso8601", "timezone": "UTC"}
  },
  "missing_tokens": ["", "N/A", "unknown"],
  "source_record": {
    "source_id": "source-example",
    "kind": "user_csv",
    "locator": "persistent-artifact-id",
    "retrieved_at": "2026-10-26T00:00:00Z",
    "description": "示例 CSV",
    "metric_mapping": {},
    "raw_material": {"artifact_id": "persistent-artifact-id"}
  }
}
```

## 新闻任务

```json
{
  "task_text": "为 API 开发者找过去 24 小时值得讨论的工具动态",
  "requested_at": "2026-10-26T04:00:00Z",
  "scope_patch": null,
  "requested_outputs": ["cards", "drafts"],
  "data_mode": "live"
}
```

真实宿主结果必须完整保存并通过 `news-step ingest` 导入；不要手写看似真实的搜索返回。

## 运行时 ID 与任务关联

`news-step init` 的请求外壳 run_id=null，随后从返回的 `data.run.run_id` 取得代码生成的 ID；后续外壳与 SearchPlan.run_id 都用它。不要自拟 run 别名。

先 plan discovery 任务并 reserve/ingest 搜索；候选正式 ID 返回后，再追加以该 ID 为 scope_refs 的 verify/read 任务。尚不存在的候选不能预先引用。一次 reserve 最多三个待返回任务；其返回完成后再签下一批。每个 coverage 条目只能列出 plan task.coverage_ids 明确覆盖它的成功 tickets。

新闻首稿同样需要原始材料引用，original_ref 可用真实 SourceRecord 或 SourceVersion ID。card_id 必须和 finalize 提交的选题卡一致；草稿修改保留该卡、事件和主张关系。第一次 draft_id=null，读取检查返回的正式 ID 和 hashes，再对同一全文做语义复核。最终文本改变时追加 revision 并重新计数。

SourceTimes 提案若提供，包含 source_version_id 及 published_at、updated_at、event_at；未知时使用完整 TimeEvidence：`{raw:null,instant:null,timezone:null,precision:"unknown",source_ref:"实际来源版本ID"}`，不补造时间。程序会从有依据的 event_time 判断窗口。

地区限定的 EventAssessment.region_assessment 结构为 `{status:"matched",matched_regions:["有效配置中的实际地区"],locators:[{source_version_id:"实际ID",start:0,end:实际结束位置,text:"逐字原文"}],reason:"原文如何支持地区范围",reviewer:"实际判断者",assessed_at:"实际时刻"}`。没有正文支持时使用 unknown，不能填写 matched。默认 global 不要求此额外地区判断。
