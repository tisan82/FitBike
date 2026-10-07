// Reuse only an unchanged, unannotated preflight. The original source attestation
// hash remains distinct from the canonical WebP hash verified from Storage.
import type { Transform } from "./transform.ts";
type Spec = { sourceAssetUrl?: string; sourcePageUrl?: string; sourceOwner?: string; sourcePdfPage?: number;
  transform?: Transform; productionMethod?: string; composition?: unknown; preflightOnly?: boolean;
  visualMcpOperation?: {workerKey?: string}; preStagingQa?: {sourceJobId?: string;sourceSha256?: string} };
type Provenance = {sourceCheckedAt?: string;sourceMime?: string;sourceRedirects?: string[];finalSourceAssetUrl?: string|null;[key:string]:unknown};
type Result = {semanticValidation?: {status?:string};preflightOnly?:boolean;storageVerification?:string;decode?:string;
  annotationApplied?:boolean;preStagingSourceSha256?:string;bucket?:string;sha256?:string;path?:string;
  bytes?:number;width?:number;height?:number;provenance?:Provenance};
type Row = { pipelineId: number; pipelineImageId: number; contractHash: string; spec: Spec };
type Parent = { job_id: string; pipeline_id: number; pipeline_image_id: number; contract_hash: string; status: string; spec: Spec; result: Result };
export async function readStoredSourceCandidate(
  current: Row, previous: Parent,
  read: (path: string) => Promise<{ bytes: Uint8Array; mime: string }>,
  inspect: (bytes: Uint8Array, mime: string) => Promise<{sha256:string;bytes:number;width:number;height:number}>,
) {
  const s = current.spec, p = previous.spec, r = previous.result;
  const worker = s.visualMcpOperation?.workerKey;
  if (!worker || p.visualMcpOperation?.workerKey !== worker ||
      previous.pipeline_id !== current.pipelineId || previous.pipeline_image_id !== current.pipelineImageId ||
      previous.contract_hash !== current.contractHash || previous.status !== "STAGED" ||
      s.preStagingQa?.sourceJobId !== previous.job_id || p.productionMethod || p.composition ||
      r.semanticValidation?.status === "FAIL" || !(p.preflightOnly === true || r.preflightOnly === true) ||
      r.storageVerification !== "PASS" || r.decode !== "PASS") throw Error("SOURCE_RESUME_ACCESS_DENIED");
  for (const key of ["sourceAssetUrl", "sourcePageUrl", "sourceOwner", "sourcePdfPage"]) {
    if ((s[key] ?? null) !== (p[key] ?? null)) throw Error("SOURCE_RESUME_PROVENANCE_MISMATCH");
  }
  const crop = (t?: Transform) => t?.crop ? [t.crop.x,t.crop.y,t.crop.width,t.crop.height] : null;
  if (JSON.stringify(crop(s.transform)) !== JSON.stringify(crop(p.transform)) ||
      (s.transform?.maxWidth ?? 780) !== (p.transform?.maxWidth ?? 780) ||
      p.transform?.annotations?.length || r.annotationApplied === true)
    throw Error("SOURCE_RESUME_BASE_TRANSFORM_CHANGED");
  const sourceSha256 = r.preStagingSourceSha256;
  if (!/^[a-f0-9]{64}$/.test(sourceSha256 ?? "") || s.preStagingQa?.sourceSha256 !== sourceSha256)
    throw Error("SOURCE_RESUME_SOURCE_IDENTITY_MISMATCH");
  if (r.bucket !== "content-pipeline-staging" || !/^[a-f0-9]{64}$/.test(r.sha256 ?? "") ||
      r.path !== `${current.pipelineId}/${current.pipelineImageId}/${r.sha256}.webp`)
    throw Error("SOURCE_RESUME_ASSET_MISSING");
  const stored = await read(r.path!);
  const proof = await inspect(stored.bytes, stored.mime);
  if (proof.sha256 !== r.sha256 || proof.bytes !== r.bytes || proof.width !== r.width || proof.height !== r.height)
    throw Error("SOURCE_RESUME_CANONICAL_IDENTITY_MISMATCH");
  return { bytes: stored.bytes, width: proof.width, height: proof.height,
    sourceSha256: sourceSha256!, canonicalSha256: proof.sha256, provenance: r.provenance ?? {} };
}
