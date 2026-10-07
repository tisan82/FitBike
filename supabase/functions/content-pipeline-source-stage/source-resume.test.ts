import { readStoredSourceCandidate } from "./source-resume.ts";
import { inspectWebp, transformSource } from "./transform.ts";
import { ImageMagick, MagickColor, MagickFormat } from "npm:@imagemagick/magick-wasm@0.0.42";
Deno.test("stored cropped PDF raster is reused unchanged; annotation preserves geometry without reapplying crop", async () => {
  const input = ImageMagick.read(new MagickColor("#334155"), 1000, 600,
    img => img.write(MagickFormat.Png, b => Uint8Array.from(b)));
  const transform = { crop: {x:.25,y:.25,width:.5,height:.5}, maxWidth:390 };
  const staged = await transformSource(input, "image/png", transform);
  const proof = await inspectWebp(staged.webp, "image/webp");
  const original = "a".repeat(64);
  const spec = {sourceAssetUrl:"https://official.example/manual.pdf",sourcePageUrl:"https://official.example/page",sourceOwner:"Official",sourcePdfPage:79,transform,visualMcpOperation:{workerKey:"worker"}};
  const parent = {job_id:"parent",pipeline_id:5,pipeline_image_id:10,contract_hash:"hash",status:"STAGED",spec:{...spec,preflightOnly:true},result:{...proof,bucket:"content-pipeline-staging",path:`5/10/${proof.sha256}.webp`,preflightOnly:true,storageVerification:"PASS",preStagingSourceSha256:original,provenance:{sourceMime:"application/pdf"}}};
  const current = {pipelineId:5,pipelineImageId:10,contractHash:"hash",spec:{...spec,preStagingQa:{sourceJobId:"parent",sourceSha256:original}}};
  const resumed = await readStoredSourceCandidate(current,parent, async()=>({bytes:staged.webp,mime:"image/webp"}),inspectWebp);
  if (resumed.canonicalSha256 !== proof.sha256 || resumed.bytes !== staged.webp || resumed.sourceSha256 !== original) throw Error("identity changed");
  const annotated = await transformSource(resumed.bytes,"image/webp",{maxWidth:resumed.width,annotations:[{type:"circle",x:.5,y:.5,radius:.15}]});
  const final = await inspectWebp(annotated.webp,"image/webp");
  if(final.width !== proof.width || final.height !== proof.height || final.sha256 === proof.sha256) throw Error("annotation resized or double-cropped stored raster");
});
