import { Parser } from "npm:htmlparser2@10.0.0";
import { sourceUrl, downloadSource } from "../content-pipeline-source-stage/source.ts";
import { probeRaster } from "./inspection.ts";

function recordableUrl(value:string) {
  const url=sourceUrl(value);
  if (/[?&](token|signature|sig|x-amz-signature)=/i.test(url.search)) throw Error('SOURCE_CAPABILITY_URL_NOT_RECORDABLE');
  return url.href;
}
function checkRedirects(download:{finalUrl:string;redirects:string[]}) {
  for(const url of [...download.redirects,download.finalUrl]) recordableUrl(url);
}

type Candidate = {sourceAssetUrl:string; section:string; alt:string; attribute:string};
// Parse, never execute document scripts or follow guessed image names.
export function extractSourceAssets(html:string, finalUrl:string, sectionQuery="") {
  let base=recordableUrl(finalUrl), headingLevel=0, headingText="", ignored=0;
  const headings:string[]=[], items:Candidate[]=[]; const seen=new Set<string>();
  const add=(value:string, attribute:string, alt:string) => {
    if(items.length>=200 || !value || value.length>4096) return;
    try {
      const url=sourceUrl(new URL(value.trim(),base).href);
      if (/[?&](token|signature|sig|x-amz-signature)=/i.test(url.search)) return;
      const section=headings.filter(Boolean).join(" / ");
      if(sectionQuery && !section.toLowerCase().includes(sectionQuery.toLowerCase()))return;
      if(seen.has(url.href))return;
      seen.add(url.href);items.push({sourceAssetUrl:url.href,section:section.slice(0,1000),alt:alt.slice(0,300),attribute});
    } catch { /* unsafe/non-HTTPS/capability candidates are not fetched */ }
  };
  const parser=new Parser({
    onopentag(name:string,attrs:Record<string,string>){
      if(name==='script'||name==='style'){ignored++;return;} if(ignored)return;
      if(name==='base' && attrs.href){try{base=recordableUrl(new URL(attrs.href,finalUrl).href);}catch{} }
      if(/^h[1-6]$/.test(name)){headingLevel=Number(name[1]);headingText="";}
      if(name==='img'||name==='source'){
        for(const key of ['src','data-src','data-original','data-lazy-src'])if(attrs[key])add(attrs[key],key,attrs.alt??'');
        for(const key of ['srcset','data-srcset'])if(attrs[key])for(const entry of attrs[key].split(','))add(entry.trim().split(/\s+/)[0],key,attrs.alt??'');
      }
      if(name==='a' && attrs.href && /\.(png|jpe?g|webp)(?:[?#]|$)/i.test(attrs.href))add(attrs.href,'href',attrs.title??'');
    },
    ontext(text:string){if(!ignored&&headingLevel)headingText+=text;},
    onclosetag(name:string){
      if(name==='script'||name==='style'){ignored=Math.max(0,ignored-1);return;}
      if(headingLevel&&name==='h'+headingLevel){headings.length=headingLevel;headings[headingLevel-1]=headingText.replace(/\s+/g,' ').trim().slice(0,500);headingLevel=0;}
    }
  },{decodeEntities:true});parser.write(html);parser.end("");return items;
}

export async function resolveSourceAssets(pageUrl:unknown,sectionQuery:unknown,maxCandidates:unknown) {
  if(typeof pageUrl!=='string'||pageUrl.length>4096 || /[?&](token|signature|sig|x-amz-signature)=/i.test(pageUrl))throw Error('SOURCE_PAGE_URL_INVALID');
  if(sectionQuery!==undefined && (typeof sectionQuery!=='string'||sectionQuery.length>200))throw Error('INVALID_SECTION_QUERY');
  const limit=maxCandidates??3;
  if(!Number.isInteger(limit)||Number(limit)<1||Number(limit)>5)throw Error('INVALID_CANDIDATE_LIMIT');
  const doc=await downloadSource(pageUrl,false,true);
  checkRedirects(doc);
  if(!['text/html','application/xhtml+xml','application/xml','text/xml'].includes(doc.mime))throw Error('SOURCE_DOCUMENT_MIME_REQUIRED');
  const candidates=extractSourceAssets(new TextDecoder().decode(doc.bytes),doc.finalUrl,String(sectionQuery??''));
  const checked=[];const images=[];
  for(const candidate of candidates.slice(0,Number(limit))){
    try{
      const asset=await downloadSource(candidate.sourceAssetUrl);
      checkRedirects(asset);
      if(!['image/png','image/jpeg','image/webp'].includes(asset.mime))throw Error('SOURCE_RASTER_REQUIRED');
      const decoded=probeRaster(asset.bytes);
      const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(asset.bytes).buffer)),x=>x.toString(16).padStart(2,'0')).join('');
      checked.push({...candidate,status:'TECHNICAL_PASS',finalAssetUrl:asset.finalUrl,mimeType:asset.mime,bytes:asset.bytes.length,width:decoded.width,height:decoded.height,sha256,decode:'PASS',signature:'PASS',previewContentIndex:images.length+1});
      images.push(decoded.preview);
    }catch(e){checked.push({...candidate,status:'TECHNICAL_FAIL',error:e instanceof Error?e.message:'SOURCE_PROBE_FAILED'});}
  }
  return {result:{sourcePageUrl:pageUrl,finalPageUrl:doc.finalUrl,sectionQuery:sectionQuery??null,checkedAt:new Date().toISOString(),candidateCount:candidates.length,candidates:checked,unprobedCandidates:candidates.slice(Number(limit),Number(limit)+20),truncated:candidates.length>Number(limit)+20,semanticQa:'NOT_EVALUATED',pixelsInspected:false,claimCreated:false,stagingCreated:false,nextAction:'INSPECT_RETURNED_PREVIEW_THEN_DISPATCH_EXACT_ASSET_UNDER_CURRENT_CONTRACT'},images};
}
