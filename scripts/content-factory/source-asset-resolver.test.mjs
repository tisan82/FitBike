import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const {Parser}=require(process.env.HTMLPARSER_MODULE ?? 'htmlparser2');
const source=readFileSync(new URL('../../supabase/functions/content-pipeline-visual-mcp/source-resolver.ts',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
function harness(downloadSource=async()=>{throw Error('unexpected fetch');}){
 const ctx={Parser,URL,TextDecoder,Uint8Array,crypto:webcrypto,Number,String,Date,Error,Set,sourceUrl:v=>{const u=new URL(v);if(u.protocol!=='https:'||u.hostname==='127.0.0.1'||u.username)throw Error('UNSAFE');return u;},downloadSource,probeRaster:()=>({width:1503,height:1040,preview:Uint8Array.from([1,2,3])})};
 vm.runInNewContext(ts.transpile(source,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}),ctx);return ctx;
}
const html='<base href="https://docs.example/assets/"><h2>3.3.6 Instrument Cluster</h2><img src="a.png" alt="Cluster &amp; lamp"><img data-src="b.png"><source srcset="a.png 1x, c.webp 2x"><img src="https://127.0.0.1/x.png"><img src="d.png?token=secret"><script><img src="evil.png"></script><h2>Other</h2><img src="other.png">';
test('real HTML extraction handles base, lazy src, srcset, headings and rejects unsafe/capability URLs',()=>{
 const r=harness().extractSourceAssets(html,'https://docs.example/manual','instrument cluster');
 assert.deepEqual(Array.from(r,x=>x.sourceAssetUrl),['https://docs.example/assets/a.png','https://docs.example/assets/b.png','https://docs.example/assets/c.webp']);
 assert.equal(r[0].alt,'Cluster & lamp');
});
test('probe binds actual bytes/SHA and preview, never creates Claim/Staging or semantic PASS',async()=>{
 const calls=[];const ctx=harness(async(url,_,doc)=>{calls.push({url,doc});return {mime:doc?'text/html':'image/png',bytes:doc?new TextEncoder().encode(html):Uint8Array.from([1,2,3]),finalUrl:url,redirects:[]};});
 const r=await ctx.resolveSourceAssets('https://docs.example/manual','instrument cluster',2);
 assert.equal(calls.length,3);assert.equal(r.images.length,2);assert.equal(r.result.candidates[0].previewContentIndex,1);
 assert.equal(r.result.candidates[0].sha256,'039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81');
 assert.equal(r.result.claimCreated,false);assert.equal(r.result.stagingCreated,false);assert.equal(r.result.semanticQa,'NOT_EVALUATED');
});
test('signed redirect targets are rejected and never emitted',async()=>{
 const ctx=harness(async(url,_,doc)=>({mime:doc?'text/html':'image/png',bytes:new TextEncoder().encode(html),finalUrl:'https://docs.example/x?token=private',redirects:[]}));
 await assert.rejects(ctx.resolveSourceAssets('https://docs.example/manual','',1),/SOURCE_CAPABILITY_URL_NOT_RECORDABLE/);
});
test('probe failure preserves extracted candidate with exact error, no preview',async()=>{
 const ctx=harness(async(url,_,doc)=>{if(!doc)throw Error('SOURCE_HTTP_403');return{mime:'text/html',bytes:new TextEncoder().encode(html),finalUrl:url,redirects:[]};});
 const r=await ctx.resolveSourceAssets('https://docs.example/manual','instrument cluster',1);
 assert.equal(r.result.candidates[0].error,'SOURCE_HTTP_403');assert.equal(r.images.length,0);
});
test('invalid limits and capability input are rejected before network',async()=>{
 const ctx=harness();for(const n of [0,6,1.5])await assert.rejects(ctx.resolveSourceAssets('https://docs.example/manual','',n),/INVALID_CANDIDATE_LIMIT/);
 await assert.rejects(ctx.resolveSourceAssets('https://docs.example/manual?token=private','',1),/SOURCE_PAGE_URL_INVALID/);
});

test('official Polaris section fixture yields exact observed cluster raster links', {skip:!process.env.POLARIS_HTML_FIXTURE},()=>{
 const raw=readFileSync(process.env.POLARIS_HTML_FIXTURE,'utf8');
 const r=harness().extractSourceAssets(raw,'https://publications.polaris.com/owner/owners-manuals/0000886880.xml?onepage=true','3.3.6');
 assert.deepEqual(Array.from(r,x=>x.sourceAssetUrl),['https://publications.polaris.com/owner/owners-manuals/0000559948.png','https://publications.polaris.com/owner/owners-manuals/0000559947.png']);
});
