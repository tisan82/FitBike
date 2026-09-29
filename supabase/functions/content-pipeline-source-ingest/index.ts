import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
let magickReady=false;
async function magick(){const m=await import("npm:@imagemagick/magick-wasm@0.0.42");if(!magickReady){const wb=await Deno.readFile(new URL("magick.wasm",import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.42")));await m.initializeImageMagick(wb);magickReady=true;}return m;}
const MAX_SOURCE=8*1024*1024,MAX_FINAL=4*1024*1024,BUCKET="content-assets";
const KEY=/^[a-z0-9]+(?:-[a-z0-9]+)*$/,ASSET=/^(thumbnail|hero|body-[0-9]{2})$/;
Deno.serve(async(req)=>{
 if(req.method!=="POST")return out({error:"METHOD_NOT_ALLOWED"},405);
 try{
  const b=await req.json(), pipelineId=Number(b.pipelineId), imageId=Number(b.pipelineImageId);
  const contentKey=String(b.contentKey||""),assetKey=String(b.assetKey||""),source=String(b.sourceAssetUrl||"");
  const ticket=req.headers.get("x-fitbike-source-ingest-ticket")||"";
  if(!Number.isSafeInteger(pipelineId)||!Number.isSafeInteger(imageId)||!KEY.test(contentKey)||!ASSET.test(assetKey)||!ticket)
    return out({error:"VALIDATION_ERROR"},422);
  const u=new URL(source);
  if(!["https:","http:"].includes(u.protocol)||blockedHost(u.hostname))return out({error:"SOURCE_URL_BLOCKED"},422);
  const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
  const {data:ok,error:te}=await sb.rpc("content_pipeline_consume_source_ingest_ticket_v1",{
    p_pipeline_id:pipelineId,p_pipeline_image_id:imageId,p_content_key:contentKey,p_asset_key:assetKey,p_ticket:ticket});
  if(te||ok!==true)return out({error:"SOURCE_INGEST_TICKET_INVALID"},401);
  const ctrl=new AbortController();setTimeout(()=>ctrl.abort(),12000);
  const res=await fetch(u,{signal:ctrl.signal,redirect:"error",headers:{"user-agent":"FitBike-Content-Source-Ingest/1.0","accept":"image/webp,image/png,image/jpeg,image/*;q=0.8"}});
  if(!res.ok)return out({error:"SOURCE_HTTP_ERROR",status:res.status},502);
  const ct=(res.headers.get("content-type")||"").split(";")[0].toLowerCase();
  if(!["image/jpeg","image/png","image/webp"].includes(ct))return out({error:"SOURCE_CONTENT_TYPE_INVALID",contentType:ct},422);
  const ab=await res.arrayBuffer();if(ab.byteLength<1||ab.byteLength>MAX_SOURCE)return out({error:"SOURCE_FILE_SIZE_INVALID",bytes:ab.byteLength},422);
  let width=0,height=0;
  const sourceBytes=new Uint8Array(ab);
  // Remote MIME/extension is not proof of binary format. Decode and normalize every source.
  const {ImageMagick,MagickFormat}=await magick();
  let webp:Uint8Array;
  try{
    webp=ImageMagick.read(sourceBytes,(img)=>{
      width=img.width;height=img.height;
      if(width<1||height<1)throw new Error("SOURCE_DECODE_DIMENSIONS_INVALID");
      if(width>2000||height>2000){const r=Math.min(2000/width,2000/height);img.resize(Math.round(width*r),Math.round(height*r));width=img.width;height=img.height;}
      return img.write(MagickFormat.WebP,d=>Uint8Array.from(d));
    });
  }catch(e){return out({error:"SOURCE_DECODE_FAILED",detail:String(e)},422);}
  if(!webp||webp.length<12||webp.length>MAX_FINAL)return out({error:"FINAL_FILE_SIZE_INVALID",bytes:webp?.length||0},422);
  if(!(webp[0]===0x52&&webp[1]===0x49&&webp[2]===0x46&&webp[3]===0x46&&webp[8]===0x57&&webp[9]===0x45&&webp[10]===0x42&&webp[11]===0x50))
    return out({error:"FINAL_WEBP_SIGNATURE_INVALID"},422);
  try{ImageMagick.read(webp,(img)=>{if(img.width<1||img.height<1)throw new Error("FINAL_DECODE_DIMENSIONS_INVALID");});}
  catch(e){return out({error:"FINAL_WEBP_DECODE_FAILED",detail:String(e)},422);}
  const hash=await crypto.subtle.digest("SHA-256",webp),sha=Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,"0")).join("");
  const path=`contents/${contentKey}/${assetKey}-${sha.slice(0,12)}.webp`;
  const {data:old,error:oldErr}=await sb.storage.from(BUCKET).download(path);
  if(old&&!oldErr){const ob=new Uint8Array(await old.arrayBuffer());const oh=await crypto.subtle.digest("SHA-256",ob);const os=Array.from(new Uint8Array(oh),x=>x.toString(16).padStart(2,"0")).join("");if(os===sha)return out({status:"REUSED",bucket:BUCKET,storagePath:path,sha256:sha,width,height,bytes:webp.length},200);if(b.replaceExisting!==true)return out({error:"ASSET_CONFLICT"},409);const {error:re}=await sb.storage.from(BUCKET).upload(path,webp,{contentType:"image/webp",upsert:true,metadata:{sourceAssetUrl:source,sourcePageUrl:String(b.sourcePageUrl||""),sourceOwner:String(b.sourceOwner||""),rightsStatus:String(b.rightsStatus||"PENDING_OPERATOR_APPROVAL"),pipelineImageId:String(imageId)}});if(re)return out({error:"STORAGE_REPLACE_FAILED",detail:re.message},500);const {data:rv,error:rve}=await sb.storage.from(BUCKET).download(path);if(!rv||rve)return out({error:"STORAGE_VERIFY_FAILED"},500);const rb=new Uint8Array(await rv.arrayBuffer()),rh=await crypto.subtle.digest("SHA-256",rb),rs=Array.from(new Uint8Array(rh),x=>x.toString(16).padStart(2,"0")).join("");if(rs!==sha)return out({error:"STORAGE_VERIFY_FAILED"},500);return out({status:"REPLACED",bucket:BUCKET,storagePath:path,sha256:sha,width,height,bytes:webp.length},200);}
  const {error:ue}=await sb.storage.from(BUCKET).upload(path,webp,{contentType:"image/webp",upsert:false,metadata:{sourceAssetUrl:source,sourcePageUrl:String(b.sourcePageUrl||""),sourceOwner:String(b.sourceOwner||""),rightsStatus:String(b.rightsStatus||"PENDING_OPERATOR_APPROVAL"),pipelineImageId:String(imageId)}});
  if(ue)return out({error:"STORAGE_UPLOAD_FAILED",detail:ue.message},500);
  const {data:v,error:ve}=await sb.storage.from(BUCKET).download(path);if(!v||ve)return out({error:"STORAGE_VERIFY_FAILED"},500);
  const vb=new Uint8Array(await v.arrayBuffer()),vh=await crypto.subtle.digest("SHA-256",vb),vs=Array.from(new Uint8Array(vh),x=>x.toString(16).padStart(2,"0")).join("");
  if(vs!==sha)return out({error:"STORAGE_VERIFY_FAILED"},500);
  return out({status:"UPLOADED",bucket:BUCKET,storagePath:path,sha256:sha,width,height,bytes:webp.length},201);
 }catch(e){return out({error:"INGEST_FAILED",detail:String(e)},502);}
});
function blockedHost(h){h=h.toLowerCase();return h==="localhost"||h.endsWith(".local")||h.endsWith(".internal")||/^127\.|^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(h)||h==="::1";}
function out(b,s){return new Response(JSON.stringify(b),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});}
