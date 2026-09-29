import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { ImageMagick, initializeImageMagick } from "npm:@imagemagick/magick-wasm@0.0.42";
const wasmBytes = await Deno.readFile(new URL("magick.wasm", import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.42")));
await initializeImageMagick(wasmBytes);
const PATH=/^contents\/[a-z0-9]+(?:-[a-z0-9]+)*\/(thumbnail|hero|body-[0-9]{2})(?:-[a-f0-9]{12})?\.webp$/;
Deno.serve(async(req)=>{
 if(req.method!=="POST") return out({error:"METHOD_NOT_ALLOWED"},405);
 try{
  const {storagePath,expectedSha256}=await req.json();
  if(typeof storagePath!=="string"||!PATH.test(storagePath)||typeof expectedSha256!=="string"||!/^[a-f0-9]{64}$/.test(expectedSha256)) return out({error:"VALIDATION_ERROR"},422);
  const base=Deno.env.get("SUPABASE_URL");
  const res=await fetch(`${base}/storage/v1/object/public/content-assets/${storagePath}?verify=${Date.now()}`,{cache:"no-store"});
  const mime=(res.headers.get("content-type")||"").split(";")[0].toLowerCase();
  if(!res.ok||mime!=="image/webp") return out({error:"PUBLIC_FETCH_FAILED",status:res.status,mime},422);
  const bytes=new Uint8Array(await res.arrayBuffer());
  const sig=bytes.length>=12&&new TextDecoder().decode(bytes.slice(0,4))==="RIFF"&&new TextDecoder().decode(bytes.slice(8,12))==="WEBP";
  if(!sig) return out({error:"WEBP_SIGNATURE_INVALID",bytes:bytes.length,headHex:Array.from(bytes.slice(0,16),x=>x.toString(16).padStart(2,"0")).join("")},422);
  let width=0,height=0;
  try{ ImageMagick.read(bytes,(img)=>{width=img.width;height=img.height;}); }
  catch(e){ return out({error:"WEBP_DECODE_FAILED",detail:String(e)},422); }
  if(width<1||height<1) return out({error:"WEBP_DECODE_FAILED",width,height},422);
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  const sha256=Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,"0")).join("");
  if(sha256!==expectedSha256)return out({error:"SHA256_MISMATCH",expectedSha256,actualSha256:sha256},422);
  return out({status:"PASS",httpStatus:res.status,mime,signature:"RIFF/WEBP",decode:"PASS",width,height,bytes:bytes.length,sha256},200);
 }catch(e){return out({error:"VERIFY_FAILED",detail:String(e)},500);}
});
function out(body:unknown,status:number){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});}