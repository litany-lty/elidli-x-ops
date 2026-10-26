import { createHash } from 'node:crypto';
import { ContractError } from './contracts.mjs';
import { getPack } from './content.mjs';
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
/** A portable, inert preview built from the frozen pack and actual verified image bytes. */
export function renderContentPreview(state,packRef,assetBytes) {
 const pack=getPack(state,packRef);if(!pack)throw new ContractError('MISSING_EVIDENCE','/pack_ref','Saved pack required before rendering');
 const draft=state.drafts[pack.draft_ref.draft_id]?.revisions[pack.draft_ref.revision];if(!draft)throw new ContractError('MISSING_EVIDENCE','/draft_ref','Exact text revision missing');
 const posts=draft.texts.map((text,index)=>{
  const slots=pack.media_slots.filter(s=>s.draft_text_index===index).sort((a,b)=>a.position_in_post-b.position_in_post);
  return `<article><p>${escape(text)}</p>${slots.map(slot=>{
   const asset=slot.asset_ref&&state.media_assets[slot.asset_ref.asset_id]?.versions[slot.asset_ref.asset_version];
   if(!asset)return `<aside>图片未完成：${escape(slot.slot_id)}</aside>`;
   const bytes=assetBytes.get(asset.artifact_ref);if(!bytes||createHash('sha256').update(bytes).digest('hex')!==asset.byte_sha256)throw new ContractError('PERSIST_FAILED','/asset_ref',`图片无法恢复：${slot.slot_id}`);
   return `<figure data-slot="${escape(slot.slot_id)}"><img src="data:${asset.mime_type};base64,${Buffer.from(bytes).toString('base64')}" alt="${escape(slot.alt)}"><figcaption>${escape(slot.alt)}</figcaption></figure>`;
  }).join('')}<small>来源：${escape([...new Set(slots.flatMap(s=>s.used_evidence_versions))].map(ref=>Object.values(state.sources).flatMap(source=>Object.values(source.versions)).find(v=>v.source_version_id===ref)?.final_url??state.sources[ref]?.record.description??'已登记来源').join('；')||'方法说明，无账号数据或效果数字')}</small></article>`;
 }).join('');
 return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>图文预览</title><meta name="x-ops-pack-ref" content="${escape(packRef)}"><meta name="x-ops-content-hash" content="${escape(pack.pack_content_hash)}"><style>body{margin:0;background:#f6f7f7;color:#132b42;font:17px/1.65 system-ui,sans-serif}main{max-width:430px;margin:24px auto;padding:0 14px}article{border:1px solid #dfe5e5;border-radius:16px;background:white;padding:18px;margin-bottom:20px}p{white-space:pre-wrap;margin:0 0 20px}figure{margin:0 0 22px}img{display:block;width:100%;height:auto;border-radius:10px}figcaption,small{display:block;font-size:13px;line-height:1.5;color:#536579;margin-top:8px}header{font-size:13px;margin:12px 2px;color:#536579;overflow-wrap:anywhere}aside{padding:20px;background:#fff5e9}</style><main><header>稿件预览 · 尚未发布到 X</header>${posts}</main></html>`;
}
