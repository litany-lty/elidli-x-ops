#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {loadState} from './lib/state.mjs';
import {renderContentPreview} from './lib/preview.mjs';
const [stateDir,packRef,output]=process.argv.slice(2);
if(!stateDir||!packRef||!output)throw Error('Usage: node scripts/render-preview.mjs STATE_DIR PACK_REF OUTPUT.html');
const state=await loadState(stateDir),bytes=new Map();
for(const entry of Object.values(state.media_assets??{}))for(const asset of Object.values(entry.versions))bytes.set(asset.artifact_ref,await readFile(asset.artifact_ref));
await writeFile(output,renderContentPreview(state,packRef,bytes),{mode:0o600});
console.log(JSON.stringify({preview_path:output,pack_ref:packRef}));
