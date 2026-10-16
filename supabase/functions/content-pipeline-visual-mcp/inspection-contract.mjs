// One request contract for MCP, pre-RPC validation and safe diagnostics.
const uuid = { type: 'string', format: 'uuid' };
const sha = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const enumeration = values => ({ type: 'string', enum: values });
export const pixelViews = ['CANONICAL', 'MOBILE390', 'CARD', 'HERO'];
export const deliveryEventSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    eventId: uuid, probeId: uuid, requestId: uuid, jobId: uuid, expectedSha: sha,
    scope: enumeration(['ENVIRONMENT', 'CANDIDATE']), runtime: enumeration(['WORK', 'CHAT', 'SCHEDULED']),
    stage: enumeration(['CLIENT_PARSE', 'CLIENT_IMAGE_OUTPUT', 'PIXELS_INSPECTED']),
    outcome: enumeration(['PASS', 'FAIL']), code: enumeration(['PASS', 'RESPONSE_SHAPE_INVALID', 'IMAGE_BLOCK_MISSING', 'IMAGE_BLOCK_INVALID', 'CLIENT_PIXEL_RENDER_UNVERIFIED', 'AIO_RPC_ERROR', 'TRANSPORT_TIMEOUT', 'TRANSPORT_ERROR', 'DOWNLOAD_FAILED', 'DOWNLOAD_IDENTITY_MISMATCH', 'INSPECTION_RESPONSE_TOO_LARGE']),
    view: enumeration(['PROBE', ...pixelViews]), pixelsInspected: { type: 'boolean' },
    pixelQa: enumeration(['PASS', 'FAIL']), evidence: { type: 'string', minLength: 20, maxLength: 1000 },
    traceId: uuid, responseBytes: { type: 'integer', minimum: 0, maximum: 33554432 }, elapsedMs: { type: 'integer', minimum: 0, maximum: 300000 },
  },
  required: ['eventId', 'scope', 'runtime', 'stage', 'outcome', 'code', 'expectedSha'],
};
export class InspectionInputError extends Error {
  constructor(field, reason) {
    super('DELIVERY_REQUEST_INVALID'); this.code = 'DELIVERY_REQUEST_INVALID';
    // Only schema-owned field names/reasons. Never echo unknown keys or values.
    this.field = Object.hasOwn(deliveryEventSchema.properties, field) ? field : 'event'; this.reason = reason;
  }
}
export function validateDeliveryEvent(event) {
  const fail = (field, reason) => { throw new InspectionInputError(field, reason); };
  if (!event || typeof event !== 'object' || Array.isArray(event)) fail('event', 'OBJECT_REQUIRED');
  if (Object.keys(event).some(key => !Object.hasOwn(deliveryEventSchema.properties, key))) fail('event', 'UNEXPECTED_FIELD');
  for (const key of deliveryEventSchema.required) if (event[key] == null) fail(key, 'REQUIRED');
  for (const [key, value] of Object.entries(event)) {
    if (value === null && !deliveryEventSchema.required.includes(key)) continue; // Legacy optional nulls.
    const rule = deliveryEventSchema.properties[key];
    if (rule.type === 'string' && typeof value !== 'string' || rule.type === 'boolean' && typeof value !== 'boolean' || rule.type === 'integer' && (!Number.isSafeInteger(value) || value < rule.minimum || value > rule.maximum)) fail(key, 'TYPE_OR_RANGE');
    if (rule.enum && !rule.enum.includes(value)) fail(key, 'ENUM');
    if (rule.format === 'uuid' && !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)) fail(key, 'UUID');
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) fail(key, 'SHA256');
    if (rule.minLength && (value.trim().length < rule.minLength || value.length > rule.maxLength)) fail(key, 'LENGTH');
  }
  if (event.scope === 'ENVIRONMENT' && !event.probeId) fail('probeId', 'REQUIRED');
  if (event.scope === 'CANDIDATE') for (const key of ['requestId', 'jobId', 'view']) if (!event[key]) fail(key, 'REQUIRED');
  if (event.scope === 'CANDIDATE' && !pixelViews.includes(event.view)) fail('view', 'CANDIDATE_VIEW');
  if (event.scope === 'ENVIRONMENT' && event.view && event.view !== 'PROBE') fail('view', 'PROBE_VIEW');
  if ((event.outcome === 'PASS') !== (event.code === 'PASS')) fail('code', 'OUTCOME_CONFLICT');
  if (event.stage === 'PIXELS_INSPECTED' && event.outcome === 'PASS') {
    if (event.pixelsInspected !== true) fail('pixelsInspected', 'ACTUAL_INSPECTION_REQUIRED');
    if (typeof event.evidence !== 'string') fail('evidence', 'REQUIRED');
    if (/(https?:\/\/|data:|bearer |download_url|[A-Za-z0-9+/]{120,})/i.test(event.evidence)) fail('evidence', 'SENSITIVE_CONTENT');
    if (event.scope === 'CANDIDATE' && !event.pixelQa) fail('pixelQa', 'REQUIRED');
  }
  return event;
}

const authoringOnly = new Set(['claim_content_authoring','complete_content_authoring','fail_content_authoring','open_authoring_source_supply','preview_authoring_source','persist_authoring_source','get_authoring_source_supply']);
const producerOnly = new Set(['dispatch_visual_supplied_source','claim_visual_production', 'handoff_visual_review', 'open_visual_file_upload', 'validate_visual_generation_call', 'validate_visual_generation_result', 'record_visual_generation_attempt', 'resolve_visual_source_assets']);
const reviewerOnly = new Set(['claim_visual_review', 'record_visual_source_qa', 'approve_visual_source']);
export function toolAllowedForRole(name, role) {
  if (!role) return true; // Existing shared endpoint stays compatible.
  if (role === 'AUTHORING') return authoringOnly.has(name) || ['get_visual_generation_capabilities','resolve_visual_source_assets'].includes(name);
  if (authoringOnly.has(name)) return false;
  if (name === 'claim_visual_image') return false;
  return role === 'PRODUCER' ? !reviewerOnly.has(name) : role === 'REVIEWER' ? !producerOnly.has(name) : false;
}
export function roleToolDefinition(tool, role) {
  if (role !== 'REVIEWER' || tool.name !== 'dispatch_visual_generation') return tool;
  const original = tool.inputSchema.properties.spec;
  const meta = { ...tool._meta }; delete meta['openai/fileParams'];
  return { ...tool, _meta: meta,
    description: 'Finalize only an existing inspected Native candidate. resumeJobId must match the current candidate/recovery, preflightOnly=false. No new generation/file/input/URL. Preserve original method/prompt/references/native attempt and recorded QA.',
    inputSchema: { ...tool.inputSchema, properties: {
      ...Object.fromEntries(Object.entries(tool.inputSchema.properties).filter(([key]) => !['file', 'inputFile'].includes(key))),
      spec: { ...original,
        properties: { ...Object.fromEntries(Object.entries(original.properties).filter(([key]) => !['generatedAssetUrl', 'chatFile', 'inputFile'].includes(key))), resumeJobId: uuid, preflightOnly: { type: 'boolean', const: false } },
        required: [...new Set([...original.required, 'resumeJobId', 'preflightOnly'])],
      },
    } },
  };
}
export function requiredPixelViews(contract) {
  return ['CANONICAL', 'MOBILE390', ...(['THUMBNAIL', 'THUMBNAIL_HERO'].includes(contract?.asset_role) ? ['CARD'] : []), ...(['HERO', 'THUMBNAIL_HERO'].includes(contract?.asset_role) ? ['HERO'] : [])];
}
export function inspectionRecovery(current, jobId, expectedSha, events) {
  const contract = current.claim?.generationContract ?? {};
  const required = requiredPixelViews(contract);
  // Events are scoped by worker + current receipt + Job + SHA before this helper.
  const latest = new Map();
  for (const event of events) if (!latest.has(event.view_name)) latest.set(event.view_name, event);
  const views = required.map(view => {
    const event = latest.get(view);
    const passed = event?.stage === 'PIXELS_INSPECTED' && event.outcome === 'PASS' && event.pixels_inspected === true && event.pixel_qa === 'PASS';
    return { view, eventId: event?.event_id ?? null, recorded: Boolean(event), pixelQa: passed ? 'PASS' : 'NOT_PASSED', nextAction: passed ? 'RECORDED_FOR_THIS_RECEIPT' : 'INSPECT_THEN_RECORD_NEW_EVENT' };
  });
  return { requestId: current.requestId, executionRole: current.executionRole, activeClaim: current.activeClaim === true, jobId, expectedSha,
    runtime: current.claim?.deliveryRuntime ?? null, resumeFrom: current.resumeFrom, views,
    nextAction: current.activeClaim !== true ? current.nextAction : views.every(v => v.pixelQa === 'PASS') ? current.executionRole === 'PRODUCER' ? 'HANDOFF_VISUAL_REVIEW' : 'CONTINUE_REVIEW_QA' : 'INSPECT_MISSING_VIEWS',
    previousClaimPixelsReusable: false, regenerate: false };
}

