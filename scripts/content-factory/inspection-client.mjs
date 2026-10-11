import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { downloadVerifiedCanonical, normalizeInspectionResponse, deliverInspectionResponse, recoverClaimMutation } from '../../supabase/functions/content-pipeline-visual-mcp/inspection-delivery.mjs';

export { normalizeInspectionResponse, deliverInspectionResponse, recoverClaimMutation };

// The host must display the returned absolute path with its actual image viewer.
// Saving verified bytes does not mark pixel inspection PASS.
export async function saveInspectionFallback(access, expectedOrigin, outputDirectory, options = {}) {
  const verified = await downloadVerifiedCanonical(access, { expectedOrigin, ...options });
  await mkdir(outputDirectory, { recursive: true });
  const path = resolve(outputDirectory, verified.sha256 + '.webp');
  await writeFile(path, verified.bytes);
  return { path, sha256: verified.sha256, bytes: verified.bytes.length, nextAction: 'VIEW_IMAGE_PATH_THEN_INSPECT_PIXELS', clientPixelsInspected: 'NOT_REPORTED' };
}

// Calls are injected by the actual MCP host. This adapter cannot change the host's
// internal RPC transport. Each image is requested separately to bound payloads.
export async function submitInspectionViews({ callTool, emitImage, renderFile, requestId, jobId, expectedSha, expectedOrigin, outputDirectory, views = ['CANONICAL', 'MOBILE390'] }) {
  const submitted = [];
  for (const view of views) {
    try {
      const response = await callTool('inspect_visual_source', { requestId, jobId, expectedSha, view });
      const normalized = normalizeInspectionResponse(response);
      const selected = { CANONICAL: 'canonical', MOBILE390: 'mobile390', CARD: 'card', HERO: 'hero' }[view];
      if (normalized.isError || normalized.metadata.sha256 !== expectedSha || normalized.metadata.selectedViews?.length !== 1 || normalized.metadata.selectedViews[0] !== selected) throw new Error('INSPECTION_DELIVERY_FAILED');
      await deliverInspectionResponse(response, emitImage);
      submitted.push({ view, traceId: normalized.metadata.traceId, path: 'MCP_IMAGE_CONTENT' });
    } catch (error) {
      // A canonical download cannot substitute for a mobile/crop inspection.
      if (view !== 'CANONICAL' || typeof renderFile !== 'function') throw error;
      const response = await callTool('inspect_visual_source', { requestId, jobId, expectedSha, view: 'METADATA' });
      const normalized = normalizeInspectionResponse(response, { requireImages: false });
      if (normalized.isError || normalized.metadata.sha256 !== expectedSha || normalized.metadata.inspectionAccess?.expectedSha !== expectedSha) throw new Error('DOWNLOAD_IDENTITY_MISMATCH');
      const saved = await saveInspectionFallback(normalized.metadata.inspectionAccess, expectedOrigin, outputDirectory);
      await renderFile(saved.path);
      submitted.push({ view, traceId: normalized.metadata.traceId, path: 'VERIFIED_CANONICAL_DOWNLOAD' });
    }
  }
  return { submitted, clientImageOutput: 'SUBMITTED', clientPixelsInspected: 'NOT_REPORTED', nextAction: 'INSPECT_ACTUAL_PIXELS_THEN_RECORD_PER_VIEW_OBSERVATION' };
}
