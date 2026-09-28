import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { ImageMagick, initializeImageMagick, MagickFormat } from "npm:@imagemagick/magick-wasm@^0";

const wasmResponse = await fetch("https://cdn.jsdelivr.net/npm/@imagemagick/magick-wasm@0.0.31/dist/magick.wasm");
if (!wasmResponse.ok) throw new Error("MAGICK_WASM_LOAD_FAILED");
await initializeImageMagick(new Uint8Array(await wasmResponse.arrayBuffer()));
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const BUCKET = "content-assets";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "SERVER_CONFIG_ERROR" }, 500);
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let ingestId = 0;
  try {
    const body = await req.json(); ingestId = Number(body.ingestId); const token = String(body.token ?? "");
    if (!Number.isSafeInteger(ingestId) || ingestId <= 0 || !token) return json({ error: "VALIDATION_ERROR" }, 422);
    const { data: job, error } = await supabase.rpc("content_pipeline_consume_source_ingest_v1", { p_ingest_id: ingestId, p_token: token });
    if (error || !job) return json({ error: "INGEST_TOKEN_INVALID" }, 401);
    const source = await fetchSafe(String(job.sourceAssetUrl));
    if (!source.ok) throw new Error("SOURCE_HTTP_" + source.status);
    if (!(source.headers.get("content-type") ?? "").toLowerCase().startsWith("image/")) throw new Error("SOURCE_NOT_IMAGE");
    const input = new Uint8Array(await source.arrayBuffer());
    if (!input.length || input.length > MAX_SOURCE_BYTES) throw new Error("SOURCE_TOO_LARGE");
    const output = ImageMagick.read(input, (img): Uint8Array => {
      if (img.width > 1600 || img.height > 1600) { const s = Math.min(1600/img.width,1600/img.height); img.resize(Math.max(1,Math.round(img.width*s)),Math.max(1,Math.round(img.height*s))); }
      img.quality=82; return img.write(MagickFormat.WebP,(data)=>data);
    });
    const bytes=Uint8Array.from(output); if (!bytes.length || bytes.length>MAX_OUTPUT_BYTES) throw new Error("WEBP_TOO_LARGE");
    const path=`contents/${job.contentKey}/${job.assetKey}.webp`; const sha=await digest(bytes);
    const existing=await supabase.storage.from(BUCKET).download(path); let status="UPLOADED";
    if(existing.data&&!existing.error){ if(await digest(new Uint8Array(await existing.data.arrayBuffer()))!==sha) throw new Error("ASSET_CONFLICT"); status="REUSED"; }
    else { const up=await supabase.storage.from(BUCKET).upload(path,bytes,{contentType:"image/webp",upsert:false}); if(up.error) throw new Error("STORAGE_UPLOAD_FAILED:"+up.error.message); }
    const verify=await supabase.storage.from(BUCKET).download(path); if(!verify.data||verify.error||await digest(new Uint8Array(await verify.data.arrayBuffer()))!==sha) throw new Error("STORAGE_VERIFY_FAILED");
    const fin=await supabase.rpc("content_pipeline_finish_source_ingest_v1",{p_ingest_id:ingestId,p_status:status,p_storage_bucket:BUCKET,p_storage_path:path,p_sha256:sha,p_error:null});
    if(fin.error) throw new Error("INGEST_FINISH_FAILED:"+fin.error.message);
    return json({ingestId,status,bucket:BUCKET,storagePath:path,sha256:sha},200);
  } catch(e) {
    if(ingestId>0) await supabase.rpc("content_pipeline_finish_source_ingest_v1",{p_ingest_id:ingestId,p_status:"FAILED",p_storage_bucket:null,p_storage_path:null,p_sha256:null,p_error:String(e?.message??e).slice(0,1500)});
    return json({error:"INGEST_FAILED"},500);
  }
});
async function fetchSafe(input:string){let current=input;for(let i=0;i<4;i++){await assertPublicHttps(current);const r=await fetch(current,{redirect:"manual",headers:{"user-agent":"FitBike-Content-Asset-Ingest/1.0"}});if(![301,302,303,307,308].includes(r.status))return r;const loc=r.headers.get("location");if(!loc)return r;current=new URL(loc,current).toString();}throw new Error("TOO_MANY_REDIRECTS");}
async function assertPublicHttps(input:string){const u=new URL(input);if(u.protocol!=="https:"||u.username||u.password||u.port)throw new Error("SOURCE_URL_REJECTED");const h=u.hostname.toLowerCase();if(h==="localhost"||h.endsWith(".local")||h.endsWith(".internal")||/^\d+\.\d+\.\d+\.\d+$/.test(h)||h.includes(":"))throw new Error("SOURCE_HOST_REJECTED");for(const rr of ["A","AAAA"] as const){try{const ips=await Deno.resolveDns(h,rr);for(const ip of ips)if(isPrivateIp(ip))throw new Error("SOURCE_PRIVATE_ADDRESS");}catch(e){if(String(e?.message??e).includes("SOURCE_PRIVATE_ADDRESS"))throw e;}}}
function isPrivateIp(ip:string){const x=ip.toLowerCase();return x==="::1"||x.startsWith("fc")||x.startsWith("fd")||x.startsWith("fe80:")||x.startsWith("10.")||x.startsWith("127.")||x.startsWith("169.254.")||x.startsWith("192.168.")||/^172\.(1[6-9]|2\d|3[01])\./.test(x)||x.startsWith("0.");}
async function digest(bytes:Uint8Array){const h=await crypto.subtle.digest("SHA-256",bytes);return Array.from(new Uint8Array(h),b=>b.toString(16).padStart(2,"0")).join("");}
function json(body:unknown,status:number){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});}
