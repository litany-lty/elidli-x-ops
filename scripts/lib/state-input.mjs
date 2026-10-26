const values=value=>Object.values(value??{});
const clone=value=>value===undefined?undefined:structuredClone(value);

/** Canonical state projection shared by account analysis, coaching and review. */
export function canonicalStateInput(state,cutoff,{requested_scope}={}) {
 const input={
  contract_version:2,
  account:clone(state.account),
  analysis_cutoff:cutoff,
  post_entities:values(state.post_entities).map(clone),
  post_versions:values(state.post_versions).map(clone),
  post_aliases:clone(state.post_aliases??{}),
  snapshots:values(state.snapshots_v2).map(clone),
  source_series:values(state.source_series).map(clone),
  coverage:values(state.import_batches).map(batch=>({
   ...clone(batch.coverage??{}),
   import_batch_id:batch.import_batch_id,
   source_ref:batch.source_ref,
   artifact_sha256:batch.artifact_sha256,
   measurement_context:clone(batch.measurement_context??{})
  })),
  post_metadata_facts:clone(state.post_metadata_facts??{}),
  collection_receipts:clone(state.collection_receipts??{}),
  import_batches:clone(state.import_batches??{})
 };
 if(requested_scope!==undefined)input.requested_scope=clone(requested_scope);
 return input;
}
