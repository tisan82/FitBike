import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const functionUrl = "https://farjyjcvduthawpdjuqe.supabase.co/functions/v1/content-local-image-migrate?token=fitbike-local-image-migrate-20260904-v2";
const storageBaseUrl = "https://farjyjcvduthawpdjuqe.supabase.co/storage/v1/object/public/content-assets";

async function callFunction(body) {
  const response = await fetch(functionUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const text = await response.text();
  let payload; try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
  if (!response.ok) throw new Error(`migration function ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

function chromeBin() {
  for (const c of ["google-chrome","google-chrome-stable","chromium","chromium-browser"]) {
    const r = spawnSync("bash", ["-lc", `command -v ${c}`], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  throw new Error("Chrome not found");
}
async function waitJson(url, timeout=15000) {
  const start=Date.now(); while(Date.now()-start<timeout){ try{ const r=await fetch(url); if(r.ok)return await r.json(); }catch{} await new Promise(r=>setTimeout(r,200)); }
  throw new Error("Chrome DevTools timeout");
}
class Cdp {
  constructor(url){ this.ws=new WebSocket(url); this.id=1; this.pending=new Map(); }
  async open(){ await new Promise((ok,fail)=>{this.ws.addEventListener("open",ok,{once:true});this.ws.addEventListener("error",fail,{once:true});}); this.ws.addEventListener("message",e=>{const m=JSON.parse(String(e.data));if(!m.id)return;const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}); }
  send(method,params={}){ const id=this.id++; return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.ws.send(JSON.stringify({id,method,params}));}); }
  close(){this.ws.close();}
}
async function toWebp(cdp, sourceUrl){
  const expr=`(async()=>{const u=${JSON.stringify(sourceUrl)};const img=new Image();img.crossOrigin='anonymous';img.referrerPolicy='no-referrer';const loaded=new Promise((r,j)=>{img.onload=r;img.onerror=()=>j(new Error('load failed '+u));});img.src=u;await loaded;const max=1200;const s=Math.min(1,max/img.naturalWidth);const w=Math.max(1,Math.round(img.naturalWidth*s));const h=Math.max(1,Math.round(img.naturalHeight*s));const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{alpha:false});x.drawImage(img,0,0,w,h);const b=await new Promise(r=>c.toBlob(r,'image/webp',0.82));const a=new Uint8Array(await b.arrayBuffer());let z='';for(let i=0;i<a.length;i+=32768)z+=String.fromCharCode(...a.subarray(i,i+32768));return {base64:btoa(z),width:w,height:h,size:a.length};})()`;
  const r=await cdp.send("Runtime.evaluate",{expression:expr,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}

const discovered=await callFunction({action:"discover"});
if(discovered.status!=="DISCOVERED") throw new Error(JSON.stringify(discovered));
if(!discovered.assets.length){ const f=await callFunction({action:"finalize"}); console.log(JSON.stringify(f,null,2)); process.exit(f.status==="LOCAL_IMAGE_MIGRATION_VERIFIED"?0:1); }

const dir=fs.mkdtempSync(path.join(os.tmpdir(),"fitbike-local-images-"));
const chrome=spawn(chromeBin(),["--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage","--disable-web-security","--remote-debugging-port=9222",`--user-data-dir=${dir}`,"about:blank"],{stdio:["ignore","ignore","pipe"]});
try{
  await waitJson("http://127.0.0.1:9222/json/version"); const targets=await waitJson("http://127.0.0.1:9222/json/list"); const t=targets.find(x=>x.type==="page"&&x.webSocketDebuggerUrl); if(!t)throw new Error("No page target");
  const cdp=new Cdp(t.webSocketDebuggerUrl); await cdp.open(); await cdp.send("Runtime.enable"); await cdp.send("Page.enable"); await cdp.send("Page.navigate",{url:"data:text/html,<html><body></body></html>"}); await new Promise(r=>setTimeout(r,300));
  for(const a of discovered.assets){
    const existing=await fetch(`${storageBaseUrl}/${a.storage_path}`,{method:"HEAD"}); if(existing.ok){console.log(JSON.stringify({stage:"REUSED",path:a.storage_path}));continue;}
    const w=await toWebp(cdp,a.fetch_url); const up=await callFunction({action:"upload",source_url:a.source_url,webp_base64:w.base64,width:w.width,height:w.height,byte_size:w.size}); if(up.status!=="UPLOADED")throw new Error(JSON.stringify(up)); console.log(JSON.stringify({stage:"MIGRATED",source:a.source_url,path:up.storage_path,bytes:w.size}));
  }
  cdp.close(); const final=await callFunction({action:"finalize"}); console.log(JSON.stringify(final,null,2)); if(final.status!=="LOCAL_IMAGE_MIGRATION_VERIFIED"||final.remaining_local_refs.length)throw new Error(JSON.stringify(final));
}finally{chrome.kill("SIGTERM");try{fs.rmSync(dir,{recursive:true,force:true});}catch{}}
