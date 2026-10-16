// Authoring supply is a byte source, never inherited pixel QA or approval.
type Spec = {
  sourceSupplyId?: string; sourcePageUrl?: string; sourceAssetUrl?: string; sourceOwner?: string;
  productionMethod?: unknown; composition?: unknown; resumeJobId?: unknown; sourcePdfPage?: unknown;
  preStagingQa?: unknown;
};
type Current = { pipelineId: number; pipelineImageId: number; contractHash: string; spec: Spec };
type Supply = {
  supply_id: string; pipeline_id: number; pipeline_image_id: number; contract_hash: string;
  status: string; selected: boolean; source_role: string;
  intent: { sourceKind: string; sourcePageUrl: string; sourceAssetUrl: string; sourceOwner: string;
    nativeEditRequired?: boolean; sourceObservation?: { pixelsInspected?: boolean; expectedSha?: string } };
  proof: { storageBucket: string; storagePath: string; sha256: string; mimeType: string; byteSize: number;
    width: number; height: number; decodeVerified: boolean; signatureVerified: boolean };
};
export async function readStoredSuppliedSource(
  current: Current, supply: Supply,
  read: (path: string) => Promise<{ bytes: Uint8Array; mime: string }>,
  verify: (bytes: Uint8Array, mime: string) => Promise<{ sha256: string; bytes: number }>,
) {
  const s = current.spec, intent = supply?.intent, proof = supply?.proof;
  if (!supply || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s.sourceSupplyId ?? "") ||
      s.sourceSupplyId !== supply.supply_id || !current.pipelineImageId ||
      current.pipelineId !== supply.pipeline_id || current.pipelineImageId !== supply.pipeline_image_id ||
      current.contractHash !== supply.contract_hash || supply.status !== "READY" ||
      supply.selected !== true || supply.source_role !== "PRODUCTION_INPUT" || intent?.sourceKind !== "REAL_SOURCE" || intent.nativeEditRequired === true ||
      intent.sourceObservation?.pixelsInspected !== true || !proof || proof.decodeVerified !== true || proof.signatureVerified !== true ||
      intent.sourceObservation?.expectedSha !== proof.sha256)
    throw Error("SOURCE_SUPPLY_ACCESS_DENIED");
  if (s.productionMethod !== undefined || s.composition !== undefined || s.resumeJobId !== undefined ||
      s.preStagingQa !== undefined || s.sourcePdfPage !== undefined)
    throw Error("SOURCE_SUPPLY_INPUT_CONFLICT");
  if (s.sourcePageUrl !== intent.sourcePageUrl || s.sourceAssetUrl !== intent.sourceAssetUrl ||
      s.sourceOwner !== intent.sourceOwner || !intent.sourceOwner?.trim())
    throw Error("SOURCE_SUPPLY_PROVENANCE_MISMATCH");
  const extension = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as Record<string, string>)[proof.mimeType];
  if (!extension || !/^[a-f0-9]{64}$/.test(proof.sha256) ||
      proof.storageBucket !== "content-pipeline-native-handoff" ||
      proof.storagePath !== `authoring-supply/${current.pipelineId}/${current.pipelineImageId}/${supply.supply_id}/${proof.sha256}.${extension}` ||
      !Number.isSafeInteger(proof.byteSize) || proof.byteSize <= 0 || proof.byteSize > 8 * 1024 * 1024 ||
      !Number.isSafeInteger(proof.width) || !Number.isSafeInteger(proof.height) || proof.width <= 0 || proof.height <= 0 || proof.width * proof.height > 24_000_000)
    throw Error("SOURCE_SUPPLY_ASSET_INVALID");
  const stored = await read(proof.storagePath);
  if (stored.mime !== proof.mimeType || stored.bytes.byteLength !== proof.byteSize)
    throw Error("SOURCE_SUPPLY_IDENTITY_MISMATCH");
  const checked = await verify(stored.bytes, stored.mime);
  if (checked.sha256 !== proof.sha256 || checked.bytes !== proof.byteSize)
    throw Error("SOURCE_SUPPLY_IDENTITY_MISMATCH");
  return { bytes: stored.bytes, mime: stored.mime, finalUrl: intent.sourceAssetUrl, redirects: [] as string[],
    sourceSupplyId: supply.supply_id, originalSha256: proof.sha256 };
}
