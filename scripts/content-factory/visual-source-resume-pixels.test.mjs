import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import vm from 'node:vm';import ts from 'typescript';import {webcrypto} from 'node:crypto';import test from 'node:test';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url), path=process.env.MAGICK_WASM_MODULE??require.resolve('@imagemagick/magick-wasm');
const magick=await import(path);await magick.initializeImageMagick(readFileSync(new URL('./magick.wasm','file://'+path)));
const src=readFileSync(new URL('../../supabase/functions/content-pipeline-source-stage/transform.ts',import.meta.url),'utf8');
const body=src.slice(src.indexOf('export function pdfFontFamily')).replaceAll('export ','');
const ctx={...magick,Uint8Array,TextDecoder,DataView,crypto:webcrypto,Error,Math,Array,Number,Object,Map,JSON};
// Shape renderer is isolated here: the real Magick transform/composite/encode and
// stored pixels are exercised; production SVG/font rendering has its own tests.
ctx.renderSvg=async svg=>{const width=Number(svg.match(/width="(\d+)"/)[1]),height=Number(svg.match(/height="(\d+)"/)[1]);return magick.ImageMagick.read(new magick.MagickColor('#facc15'),width,height,img=>img.write(magick.MagickFormat.Png,b=>Uint8Array.from(b)));};
vm.runInNewContext(ts.transpile(body,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}),ctx);
test('real cropped canonical dimensions and bytes preserved; annotation composite does not crop again',async()=>{
 const source=magick.ImageMagick.read(new magick.MagickColor('#334155'),1000,600,img=>img.write(magick.MagickFormat.Png,b=>Uint8Array.from(b)));
 const staged=await ctx.transformSource(source,'image/png',{crop:{x:.25,y:.25,width:.5,height:.5},maxWidth:390});
 const proof=await ctx.inspectWebp(staged.webp,'image/webp');assert.equal(proof.width,390);assert.equal(proof.height,234);
 const sourceCtx={Uint8Array,JSON,Error};const helper=readFileSync(new URL('../../supabase/functions/content-pipeline-source-stage/source-resume.ts',import.meta.url),'utf8').replace(/^import type .*;\n/gm,'').replaceAll('export ','');vm.runInNewContext(ts.transpile(helper,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}),sourceCtx);
 const spec={sourceAssetUrl:'https://official.example/a.pdf',sourcePageUrl:'https://official.example/page',sourceOwner:'Official',sourcePdfPage:79,transform:{crop:{x:.25,y:.25,width:.5,height:.5},maxWidth:390},visualMcpOperation:{workerKey:'worker'}};
 const parent={job_id:'parent',pipeline_id:5,pipeline_image_id:10,contract_hash:'hash',status:'STAGED',spec:{...spec,preflightOnly:true},result:{...proof,bucket:'content-pipeline-staging',path:`5/10/${proof.sha256}.webp`,preflightOnly:true,storageVerification:'PASS',preStagingSourceSha256:'a'.repeat(64)}};
 const current={pipelineId:5,pipelineImageId:10,contractHash:'hash',spec:{...spec,preStagingQa:{sourceJobId:'parent',sourceSha256:'a'.repeat(64)}}};
 const resumed=await sourceCtx.readStoredSourceCandidate(current,parent,async()=>({bytes:staged.webp,mime:'image/webp'}),ctx.inspectWebp);
 assert.deepEqual(resumed.bytes,staged.webp);assert.equal(resumed.canonicalSha256,proof.sha256);
 const annotated=await ctx.transformSource(resumed.bytes,'image/webp',{maxWidth:resumed.width,annotations:[{type:'circle',x:.5,y:.5,radius:.15}]});const final=await ctx.inspectWebp(annotated.webp,'image/webp');assert.equal(final.width,390);assert.equal(final.height,234);assert.notEqual(final.sha256,proof.sha256);
});
