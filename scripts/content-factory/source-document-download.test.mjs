import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const ipaddr=require(process.env.IPADDR_MODULE ?? 'ipaddr.js');
const source=readFileSync(new URL('../../supabase/functions/content-pipeline-source-stage/source.ts',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
function harness({length=4,privateDns=false}={}){
 const wire=new TextEncoder().encode(`HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: ${length}\r\n\r\nHTML`);let offset=0,dials=0;
 const conn={write:async b=>b.length,close(){},read:async b=>{if(offset>=wire.length)return null;const n=Math.min(b.length,wire.length-offset);b.set(wire.subarray(offset,offset+n));offset+=n;return n;}};
 const ctx={ipaddr,URL,TextEncoder,TextDecoder,Uint8Array,AbortSignal,Promise,Number,JSON,Error,parseInt,Deno:{connect:async()=>{dials++;return conn;},startTls:async c=>c},fetch:async()=>({ok:true,text:async()=>JSON.stringify({Status:0,Answer:[{type:1,data:privateDns?'127.0.0.1':'8.8.8.8'}]})})};
 vm.runInNewContext(ts.transpile(source,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}),ctx);return {ctx,dials:()=>dials};
}
test('HTML accepted only in explicit document mode; legacy raster rejects HTML',async()=>{
 const h=harness();const r=await h.ctx.downloadSource('https://docs.example.org/manual',false,true);assert.equal(r.mime,'text/html');assert.equal(new TextDecoder().decode(r.bytes),'HTML');
 await assert.rejects(harness().ctx.downloadSource('https://docs.example.org/manual'),/SOURCE_MIME_INVALID/);
});
test('document response over 2MiB refused from headers',async()=>{
 await assert.rejects(harness({length:2097153}).ctx.downloadSource('https://docs.example.org/manual',false,true),/SOURCE_TOO_LARGE/);
});
test('private DNS is blocked before TLS connection',async()=>{
 const h=harness({privateDns:true});await assert.rejects(h.ctx.downloadSource('https://docs.example.org/manual',false,true),/SOURCE_IP_UNSAFE/);assert.equal(h.dials(),0);
});
