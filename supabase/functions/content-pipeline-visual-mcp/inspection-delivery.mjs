export const DELIVERY_VERSION = 'PIXEL_DELIVERY_V1';
export const INSPECTION_VIEWS = ['canonical', 'mobile390', 'card', 'hero'];
export const DELIVERY_CODES = ['RESPONSE_SHAPE_INVALID', 'IMAGE_BLOCK_MISSING', 'IMAGE_BLOCK_INVALID', 'CLIENT_PIXEL_RENDER_UNVERIFIED', 'AIO_RPC_ERROR', 'TRANSPORT_TIMEOUT', 'TRANSPORT_ERROR', 'DOWNLOAD_FAILED', 'DOWNLOAD_IDENTITY_MISMATCH', 'INSPECTION_RESPONSE_TOO_LARGE', 'PASS'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export class InspectionDeliveryError extends Error {
  constructor(code, stage) { super(code); this.name = 'InspectionDeliveryError'; this.code = code; this.stage = stage; }
}

// Only documented envelopes are accepted. Never scan arbitrary metadata for binary.
export function normalizeToolResponse(raw) {
  if (!object(raw)) throw new InspectionDeliveryError('RESPONSE_SHAPE_INVALID', 'CLIENT_PARSE');
  const envelope = object(raw.result) ? raw.result : raw;
  const lists = ['content', 'content_items'].filter(key => envelope[key] !== undefined && envelope[key] !== null);
  if (lists.some(key => !Array.isArray(envelope[key]))) throw new InspectionDeliveryError('RESPONSE_SHAPE_INVALID', 'CLIENT_PARSE');
  if (lists.length === 2 && envelope.content !== envelope.content_items) {
    const left = envelope.content, right = envelope.content_items;
    if (left.length !== right.length || left.some((item, index) => {
      const peer = right[index];
      return !object(item) || !object(peer) || item.type !== peer.type || item.data !== peer.data || item.mimeType !== peer.mimeType || item.text !== peer.text;
    })) throw new InspectionDeliveryError('RESPONSE_SHAPE_INVALID', 'CLIENT_PARSE');
  }
  const content = lists.length ? envelope[lists[0]] : [];
  if (content.some(item => !object(item) || typeof item.type !== 'string')) throw new InspectionDeliveryError('RESPONSE_SHAPE_INVALID', 'CLIENT_PARSE');
  let metadata = object(envelope.structuredContent) ? envelope.structuredContent : null;
  if (!metadata) {
    const text = content.find(item => item.type === 'text' && typeof item.text === 'string' && item.text.length <= 65536);
    if (text) { try { const parsed = JSON.parse(text.text); if (object(parsed)) metadata = parsed; } catch { /* Text is not necessarily metadata. */ } }
  }
  return { content, metadata: metadata ?? {}, isError: envelope.isError === true || object(raw.error), envelope };
}

export function normalizeInspectionResponse(raw, { requireImages = true } = {}) {
  const normalized = normalizeToolResponse(raw);
  const images = normalized.content.filter(item => item.type === 'image');
  if (images.some(item => !['image/png', 'image/webp', 'image/jpeg'].includes(item.mimeType) || typeof item.data !== 'string' || item.data.length < 16 || item.data.length > 16777216 || !/^[A-Za-z0-9+/]+={0,2}$/.test(item.data))) throw new InspectionDeliveryError('IMAGE_BLOCK_INVALID', 'CLIENT_PARSE');
  if (images.some(item => {
    if (item.data.length % 4 !== 0) return true;
    let header;
    try { header = atob(item.data.slice(0, 24)); } catch { return true; }
    return item.mimeType === 'image/png' ? !header.startsWith('\x89PNG\r\n\x1a\n') : item.mimeType === 'image/jpeg' ? !header.startsWith('\xff\xd8\xff') : !(header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP');
  })) throw new InspectionDeliveryError('IMAGE_BLOCK_INVALID', 'CLIENT_PARSE');
  if (requireImages && !images.length && !normalized.isError) throw new InspectionDeliveryError('IMAGE_BLOCK_MISSING', 'CLIENT_PARSE');
  return { ...normalized, images, clientReceived: true, clientParsed: true, clientImageOutput: 'NOT_SUBMITTED', clientPixelsInspected: 'NOT_REPORTED' };
}

// emit must be the actual host image function, e.g. block => image(block).
// Its return is output submission, never proof that the model inspected pixels.
export async function deliverInspectionResponse(raw, emit) {
  const normalized = normalizeInspectionResponse(raw);
  if (normalized.isError) return normalized;
  if (typeof emit !== 'function') throw new InspectionDeliveryError('CLIENT_PIXEL_RENDER_UNVERIFIED', 'CLIENT_IMAGE_OUTPUT');
  for (const block of normalized.images) {
    try { await emit(block); } catch { throw new InspectionDeliveryError('CLIENT_PIXEL_RENDER_UNVERIFIED', 'CLIENT_IMAGE_OUTPUT'); }
  }
  return { ...normalized, clientImageOutput: 'SUBMITTED', clientPixelsInspected: 'NOT_REPORTED' };
}

export async function downloadVerifiedCanonical(access, { expectedOrigin, fetchImpl = fetch, signal } = {}) {
  if (!object(access) || access.available !== true || !/^[a-f0-9]{64}$/.test(access.expectedSha) || !Number.isSafeInteger(access.expectedBytes) || access.expectedBytes < 12 || access.expectedBytes > 4194304) throw new InspectionDeliveryError('DOWNLOAD_IDENTITY_MISMATCH', 'CLIENT_DOWNLOAD');
  let parsed;
  try { parsed = new URL(access.canonicalDownloadUrl); } catch { throw new InspectionDeliveryError('DOWNLOAD_FAILED', 'CLIENT_DOWNLOAD'); }
  if (!expectedOrigin || parsed.origin !== new URL(expectedOrigin).origin || parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new InspectionDeliveryError('DOWNLOAD_FAILED', 'CLIENT_DOWNLOAD');
  let response;
  try { response = await fetchImpl(parsed, { redirect: 'error', signal: signal ?? AbortSignal.timeout(15000) }); } catch { throw new InspectionDeliveryError('DOWNLOAD_FAILED', 'CLIENT_DOWNLOAD'); }
  if (!response.ok || !response.body || response.redirected || response.headers.get('content-type')?.split(';')[0] !== 'image/webp') throw new InspectionDeliveryError('DOWNLOAD_FAILED', 'CLIENT_DOWNLOAD');
  const length = response.headers.get('content-length');
  if (length !== null && Number(length) !== access.expectedBytes) throw new InspectionDeliveryError('DOWNLOAD_IDENTITY_MISMATCH', 'CLIENT_DOWNLOAD');
  const reader = response.body.getReader(), chunks = []; let count = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; count += value.length; if (count > access.expectedBytes) throw new InspectionDeliveryError('DOWNLOAD_IDENTITY_MISMATCH', 'CLIENT_DOWNLOAD'); chunks.push(value); }
  } catch (error) { if (error instanceof InspectionDeliveryError) throw error; throw new InspectionDeliveryError('DOWNLOAD_FAILED', 'CLIENT_DOWNLOAD'); }
  finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(count); let offset = 0; for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
  const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
  if (count !== access.expectedBytes || sha !== access.expectedSha || new TextDecoder().decode(bytes.subarray(0, 4)) !== 'RIFF' || new TextDecoder().decode(bytes.subarray(8, 12)) !== 'WEBP') throw new InspectionDeliveryError('DOWNLOAD_IDENTITY_MISMATCH', 'CLIENT_DOWNLOAD');
  return { bytes, sha256: sha, mimeType: 'image/webp', clientPixelsInspected: 'NOT_REPORTED' };
}

export async function recoverClaimMutation(call, readReceipt) {
  try { return { response: await call(), outcome: 'RESPONSE_RECEIVED' }; }
  catch {
    try { return { receipt: await readReceipt(), outcome: 'READBACK_REQUIRED_BEFORE_REPLAY' }; }
    catch { throw new InspectionDeliveryError('TRANSPORT_ERROR', 'CLAIM_READBACK'); }
  }
}

export function deliveryDiagnostic(error, context) {
  const message = error instanceof Error ? error.message : '';
  const parsed = message.match(/^([A-Z][A-Z0-9_]{2,79})(?::|$)/)?.[1];
  const known = [...DELIVERY_CODES, 'INVALID_DELIVERY_EVENT', 'INVALID_DELIVERY_STAGE', 'INVALID_DELIVERY_RUNTIME', 'DELIVERY_EVENT_IMMUTABLE', 'PIXEL_INSPECTION_EVIDENCE_REQUIRED', 'PIXEL_QA_REQUIRED', 'VISUAL_REQUEST_INPUT_CONFLICT', 'VISUAL_CLAIM_RECEIPT_REQUIRED', 'STAGING_METADATA_INVALID', 'STAGING_IDENTITY_MISMATCH', 'STAGING_READBACK_FAILED', 'INSPECTION_IMAGE_BLOCK_MISSING', 'INSPECTION_SIGNED_URL_UNAVAILABLE', 'INSPECTION_URL_ORIGIN_MISMATCH', 'INSPECTION_SIGNED_DOWNLOAD_FAILED', 'SOURCE_JOB_ACCESS_DENIED', 'SOURCE_JOB_READ_FAILED', 'SOURCE_INSPECTION_NOT_READY', 'INVALID_WEBP', 'WEBP_DECODE_OR_DIMENSIONS_MISMATCH', 'INVALID_INSPECTION_VIEW', 'INVALID_INSPECTION_TRANSPORT', 'PIXEL_DELIVERY_PRECHECK_BLOCKED', 'DELIVERY_PROBE_REQUIRED', 'CLIENT_PIXEL_INSPECTION_REQUIRED'];
  const code = known.includes(error?.code) ? error.code : /AioRpcError/.test(message) || error?.name === 'AioRpcError' ? 'AIO_RPC_ERROR' : /timeout/i.test(error?.name ?? '') ? 'TRANSPORT_TIMEOUT' : known.includes(parsed) ? parsed : 'TRANSPORT_ERROR';
  const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value) ? value : null;
  return { traceId: uuid(context.traceId), tool: context.tool, requestId: uuid(context.requestId), jobId: uuid(context.jobId), stage: context.stage, code, elapsedMs: Math.max(0, Date.now() - context.startedAt), responseBytes: context.responseBytes ?? null, mutationOutcome: 'UNVERIFIED_REQUIRES_READBACK', clientPixelsInspected: 'NOT_REPORTED' };
}
