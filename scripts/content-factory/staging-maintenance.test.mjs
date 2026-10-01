import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
const src=readFileSync(new URL('../../supabase/functions/content-pipeline-staging-maintenance/index.ts',import.meta.url),'utf8').replace(/^import .*;$/gm,'');
const RUN='11111111-1111-4111-8111-111111111111';
async function harness({valid=true,dryRun=false,canonical=false,mismatch=false,liveProtected=false}={}){
 const bytes=new Uint8Array([1,2,3]), hash=Buffer.from(await webcrypto.subtle.digest('SHA-256',bytes)).toString('hex');
 const asset={path:'probes/job/hash.webp',reason:canonical?'VERIFIED_DONE':'TERMINAL_CANDIDATE',expectedSha:canonical?hash:null,expectedBytes:3,productionPath:canonical?'contents/test/hero-hash.webp':null};
 let handler,removed=false,plans=0;const calls=[];
 const sb={rpc:async(name,args)=>{calls.push({name,args});if(name.includes('consume_maintenance'))return {data:valid?{dryRun}:null,error:null};if(name.includes('cleanup_plan')){plans++;return {data:removed||(liveProtected&&plans>1)?[]:[asset],error:null};}if(name.includes('reserve_staging'))return {data:liveProtected?null:asset,error:null};if(name.includes('finish_staging'))return {data:{status:args.p_status},error:null};if(name.includes('storage_usage'))return {data:{storageBytes:100},error:null};return {data:0,error:null};},storage:{from:bucket=>({download:async path=>{calls.push({download:bucket,path});return {data:new Blob([mismatch&&bucket==='content-assets'?new Uint8Array([4,5,6]):bytes]),error:null};},remove:async paths=>{calls.push({remove:bucket,paths});removed=true;return {data:[],error:null};},list:async()=>({data:[],error:null})})}};
 vm.runInNewContext(ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,{createClient:()=>sb,Deno:{env:{get:()=>''},serve:fn=>handler=fn},fetch,AbortSignal,Response,Uint8Array,Array,Number,String,Error,Date,crypto:webcrypto});
 return {calls,send:async()=>handler(new Request('https://example.test',{method:'POST',headers:{'content-type':'application/json','x-fitbike-maintenance-ticket':'ticket'},body:JSON.stringify({runId:RUN})}))};
}
test('invalid ticket never reads usage or deletes',async()=>{const h=await harness({valid:false});assert.equal((await h.send()).status,401);assert.equal(h.calls.length,1);});
test('dry run reports candidates without Storage/chunk deletion',async()=>{const h=await harness({dryRun:true});const b=await(await h.send()).json();assert.equal(b.status,'PASS');assert.equal(b.summary.eligibleCount,1);assert.equal(h.calls.some(c=>c.remove||c.name?.includes('cleanup_inspection')),false);});
test('canonical identity is read from both buckets but only staging is deleted',async()=>{const h=await harness({canonical:true});const b=await(await h.send()).json();assert.equal(b.summary.deleted.length,1);assert.deepEqual(h.calls.filter(c=>c.download).map(c=>c.download),['content-assets','content-pipeline-staging']);assert.equal(h.calls.find(c=>c.remove).remove,'content-pipeline-staging');});
test('production mismatch preserves staging and records PARTIAL',async()=>{const h=await harness({canonical:true,mismatch:true});const b=await(await h.send()).json();assert.equal(b.status,'PARTIAL');assert.equal(b.summary.failures[0].code,'CLEANUP_IDENTITY_MISMATCH');assert.equal(h.calls.some(c=>c.remove),false);});
test('new protected reference between planning and removal is preserved',async()=>{const h=await harness({liveProtected:true});const b=await(await h.send()).json();assert.equal(b.status,'PARTIAL');assert.equal(b.summary.skipped.length,1);assert.equal(h.calls.some(c=>c.remove),false);});
