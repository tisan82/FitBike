// A preserved input is not a STAGED candidate or pixel-QA approval.
// Failed inputs require current server admission before their bytes are read.
type Spec = { productionMethod?: string; prompt?: string; references?: unknown;
  inputAssetUrl?: string; resumeJobId?: string; nativeAttemptId?: string;
  preflightOnly?: boolean; visualMcpOperation?: {workerKey?: string} };
type Input = {bucket?:string;path?:string;sha256?:string;bytes?:number;width?:number;height?:number;
  decode?:string;persistence?:{status?:string}};
type Parent = {job_id:string;pipeline_image_id:number;contract_hash:string;status:string;
  spec:Spec;result:{checkpoint?:string;generatedInput?:Input;semanticValidation?:{status?:string};generation?:unknown}};
type Current = {pipelineId:number;pipelineImageId:number;contractHash:string;spec:Spec};
export async function readStoredNativeInput(
  current: Current, previous: Parent,
  admitted: {sourceJobId?:string;sourceSha256?:string}|null,
  read: (path:string)=>Promise<{bytes:Uint8Array;mime:string}>,
  inspect: (bytes:Uint8Array,mime:string)=>Promise<{sha256:string;bytes:number;width:number;height:number}>,
) {
  const s=current.spec,p=previous.spec,r=previous.result,input=r?.generatedInput;
  if (!s.visualMcpOperation?.workerKey || p?.visualMcpOperation?.workerKey!==s.visualMcpOperation.workerKey ||
      previous.job_id!==s.resumeJobId || previous.pipeline_image_id!==current.pipelineImageId ||
      previous.contract_hash!==current.contractHash || r?.semanticValidation?.status==='FAIL' ||
      !['STAGED','FAILED'].includes(previous.status)) throw Error('GENERATION_RESUME_ACCESS_DENIED');
  for (const key of ['productionMethod','prompt','inputAssetUrl','nativeAttemptId'] as const)
    if ((s[key]??null)!==(p[key]??null)) throw Error('GENERATION_RESUME_ACCESS_DENIED');
  if (JSON.stringify(s.references)!==JSON.stringify(p.references)) throw Error('GENERATION_RESUME_ACCESS_DENIED');
  if (!input || input.bucket!=='content-pipeline-staging' || !/^[a-f0-9]{64}$/.test(input.sha256??'') ||
      input.path!==`${current.pipelineId}/${current.pipelineImageId}/${input.sha256}.webp`)
    throw Error('GENERATION_RESUME_ASSET_MISSING');
  if (previous.status==='FAILED' && (s.preflightOnly!==true || admitted?.sourceJobId!==previous.job_id ||
      admitted.sourceSha256!==input.sha256 ||
      !(input.persistence?.status==='READ_BACK_VERIFIED' || ['GENERATED_BINARY_PRESERVED','STORAGE_VERIFIED'].includes(r.checkpoint??''))))
    throw Error('GENERATION_RESUME_INPUT_NOT_ADMITTED');
  const stored=await read(input.path!);
  const proof=await inspect(stored.bytes,stored.mime);
  if (proof.sha256!==input.sha256 || proof.bytes!==input.bytes || proof.width!==input.width || proof.height!==input.height)
    throw Error('GENERATION_RESUME_IDENTITY_MISMATCH');
  return {bytes:stored.bytes,mime:'image/webp',finalUrl:null,redirects:[],generation:r.generation};
}
