import {canonicalHash,ContractError} from './contracts.mjs';
import {actionPlanContent} from './actions.mjs';
import {resolveInspirationRef} from './inspiration.mjs';

const fail=()=>{throw new ContractError('MISSING_EVIDENCE','/subject_ref','The exact saved subject does not exist');};

/** Shared, pure resolver: every consumer sees the same exact stored content. */
export function resolveSubject(state,ref){
  const accountRef=state.account?.user_id?`x-user:${state.account.user_id}`:`handle:${state.account?.handle}`;
  const base={ref,account_ref:accountRef,texts:[],format:'unknown',post_type:'unknown',surface:null,media:[],full_text:false,read_status:'unread',source_refs:[],observed_at:null};
  if(ref==='account'||ref===accountRef||ref===state.account?.user_id)return{...base,content_hash:canonicalHash(state.account),source_refs:[accountRef]};
  const key=state.post_aliases?.[ref]??ref,entity=state.post_entities?.[key],versionRef=state.post_versions?.[ref]?ref:entity?.current_version_ref,post=state.post_versions?.[versionRef];
  if(post){
    const text=typeof post.text==='string'?post.text:null,complete=text!==null&&post.context_coverage?.full_text!==false;
    const media=(post.media_refs??[]).map(id=>state.media_assets?.[id]).filter(Boolean).map(asset=>{const a=asset.versions?.[asset.latest_version]??asset;return{asset_ref:a.asset_id??a.media_asset_id,mime_type:a.mime_type??null};});
    return{...base,content_hash:post.content_hash??canonicalHash(post),texts:text===null?[]:[text],format:post.post_type==='reply'?'reply':'short_post',post_type:post.post_type??'unknown',media,full_text:complete,read_status:text===null?'unread':complete?'read':'partial',source_refs:[versionRef,post.source_ref].filter(Boolean),observed_at:post.created_at??null};
  }
  const split=ref?.lastIndexOf(':')??-1,id=ref?.slice(0,split),revision=ref?.slice(split+1);
  const draft=state.drafts?.[id]?.revisions?.[revision];
  if(draft)return{...base,content_hash:canonicalHash(draft),texts:[...draft.texts],format:draft.format,post_type:draft.format==='reply'?'reply':'original',full_text:true,read_status:'read',source_refs:[ref]};
  const pack=state.content_packs?.[id]?.revisions?.[revision];
  if(pack){const d=resolveSubject(state,`${pack.draft_ref.draft_id}:${pack.draft_ref.revision}`);return{...d,ref,content_hash:pack.pack_content_hash,media:(pack.media_slots??[]).filter(s=>s.asset_ref).map(s=>({asset_ref:s.asset_ref,mime_type:null})),source_refs:[ref,...d.source_refs]};}
  if(ref?.startsWith('inspiration:')){
    const {candidate:value}=resolveInspirationRef(state,ref);
    return{...base,content_hash:value.candidate_hash??canonicalHash(value),texts:[value.new_information,value.reader_value,value.author_contribution_basis].filter(v=>typeof v==='string'),full_text:true,read_status:'read',source_refs:[ref,...(value.source_refs??[])]};
  }
  const report=state.coaching_reports?.[ref];
  if(report)return{...base,content_hash:canonicalHash({report,action_plans:(report.actions??[]).map(a=>state.actions?.[a.action_id]?actionPlanContent(state.actions[a.action_id]):{missing_action:a.action_id})}),texts:[...report.findings.map(f=>f.statement??f.finding??'')],read_status:'read',full_text:true,source_refs:[ref]};
  for(const collection of ['review_computations','experiment_reviews','topic_cards','analyses','runs','coaching_runs'])if(state[collection]?.[ref])return{...base,content_hash:canonicalHash(state[collection][ref]),source_refs:[ref]};
  return fail();
}
export const resolveSubjectV5=resolveSubject;
