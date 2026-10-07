import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
// Set MAGICK_WASM_MODULE to a separately installed matching package when testing.
const require=createRequire(import.meta.url);
const magickPath=process.env.MAGICK_WASM_MODULE ?? require.resolve('@imagemagick/magick-wasm');
const {ImageMagick,initializeImageMagick,MagickFormat,MagickColors,MagickGeometry}=await import(magickPath);
await initializeImageMagick(readFileSync(new URL('./magick.wasm','file://'+magickPath)));
const src=readFileSync(new URL('../../supabase/functions/content-pipeline-visual-mcp/inspection.ts',import.meta.url),'utf8');
const body=src.slice(src.indexOf('export async function')).replace('export ','');
const ctx={ImageMagick,MagickFormat,MagickGeometry,Uint8Array,TextDecoder,crypto:webcrypto,Error,Math,Array};
vm.runInNewContext(ts.transpile(body,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}),ctx);
test('canonical PNG preserves decoded pixels and 390px preview aspect ratio; altered SHA rejected',async()=>{
 const bytes=ImageMagick.read(MagickColors.Red,800,600,img=>img.write(MagickFormat.WebP,d=>Uint8Array.from(d)));
 const expected={sha256:Buffer.from(await webcrypto.subtle.digest('SHA-256',bytes)).toString('hex'),bytes:bytes.length,width:800,height:600};
 const r=await ctx.inspectPixels(bytes,expected);
 const pixels=b=>ImageMagick.read(b,img=>({width:img.width,height:img.height,pixels:Buffer.from(img.getPixels(p=>p.toByteArray(0,0,img.width,img.height,"RGBA")))}));
 const original=pixels(bytes),png=pixels(r.canonical),mobile=pixels(r.mobile);
 assert.equal(png.width,800);assert.equal(png.height,600);assert.deepEqual(png.pixels,original.pixels);
 assert.equal(mobile.width,390);assert.equal(mobile.height,293);
 await assert.rejects(ctx.inspectPixels(bytes,{...expected,sha256:'0'.repeat(64)}),/IDENTITY_MISMATCH/);
});

test('service cover crops remove outer bands and preserve center, without changing canonical',async()=>{
 const bytes=ImageMagick.read(MagickColors.Red,800,600,img=>{
  img.getPixels(p=> { for(let y=0;y<600;y++) for(let x=0;x<800;x++) p.setPixel(x,y,y<75||y>=525?[0,0,255]:[255,0,0]); });
  return img.write(MagickFormat.WebP,d=>Uint8Array.from(d));
 });
 const expected={sha256:Buffer.from(await webcrypto.subtle.digest('SHA-256',bytes)).toString('hex'),bytes:bytes.length,width:800,height:600};
 const r=await ctx.inspectPixels(bytes,expected);
 assert.deepEqual(JSON.parse(JSON.stringify(r.crop)),{x:0,y:75,width:800,height:450});
 for(const [data,w,h] of [[r.cardCrop,390,219],[r.heroCrop,768,432]]) ImageMagick.read(data,img=>{
  assert.equal(img.width,w);assert.equal(img.height,h);
  img.getPixels(p=>{ const center=p.getPixel(Math.floor(w/2),Math.floor(h/2)); assert.ok(center[0]>200 && center[2]<30); });
 });
 assert.equal(r.metadata.sha256,expected.sha256);
});
