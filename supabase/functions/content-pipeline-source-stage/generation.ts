import { downloadSource, sourceUrl } from "./source.ts";

export type ChatFile = { download_url: string; file_id: string; mime_type?: string; file_name?: string };
type Reference = {
  sourcePageUrl: string;
  sourceAssetUrl?: string;
  sourceOwner: string;
  verifiedFacts: string[];
  pixelsInspected: boolean;
  checkedAt: string;
};
export type GenerationSpec = {
  productionMethod: "NATIVE_FULL_GENERATION" | "REFERENCE_BASED_GENERATION" | "REAL_SOURCE_AI_EDIT";
  prompt: string;
  references: Reference[];
  inputAssetUrl?: string;
  generatedAssetUrl?: string;
  resumeJobId?: string;
  expectedGeneratedSha?: string;
  chatFile?: ChatFile;
  inputFile?: ChatFile;
  transform: Record<string, unknown>;
};
export function validateGenerationSpec(raw: unknown): GenerationSpec {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw Error("INVALID_GENERATION_SPEC");
  }
  const s = raw as GenerationSpec;
  const keys = [
    "resumeJobId",
    "productionMethod",
    "prompt",
    "references",
    "inputAssetUrl",
    "generatedAssetUrl",
    "expectedGeneratedSha",
    "transform",
    "visualMcpOperation",
    "preflightOnly",
    "preStagingQa",
    "chatFile",
    "inputFile",
  ];
  if (
    Object.keys(s).some((k) => !keys.includes(k)) ||
    !["NATIVE_FULL_GENERATION", "REFERENCE_BASED_GENERATION", "REAL_SOURCE_AI_EDIT"].includes(
      s.productionMethod,
    ) ||
    typeof s.prompt !== "string" || s.prompt.trim().length < 20 ||
    s.prompt.length > 6000 ||
    !Array.isArray(s.references) ||
    (s.productionMethod === "NATIVE_FULL_GENERATION" ? s.references.length !== 0 : s.references.length < 1 || s.references.length > 4)
  ) throw Error("INVALID_GENERATION_SPEC");
  for (const r of s.references) {
    if (
      !r || typeof r !== "object" || Array.isArray(r) ||
      Object.keys(r).some((k) =>
        ![
          "sourcePageUrl",
          "sourceAssetUrl",
          "sourceOwner",
          "verifiedFacts",
          "pixelsInspected",
          "checkedAt",
        ].includes(k)
      ) ||
      typeof r.sourceOwner !== "string" || !r.sourceOwner.trim() ||
      r.sourceOwner.length > 200 ||
      !Array.isArray(r.verifiedFacts) || !r.verifiedFacts.length ||
      r.verifiedFacts.length > 10 ||
      r.verifiedFacts.some((f) =>
        typeof f !== "string" || !f.trim() || f.length > 500
      ) ||
      r.pixelsInspected !== true || typeof r.checkedAt !== "string" ||
      !Number.isFinite(Date.parse(r.checkedAt))
    ) throw Error("VERIFIED_REFERENCE_EVIDENCE_REQUIRED");
    sourceUrl(r.sourcePageUrl);
    if (r.sourceAssetUrl !== undefined) sourceUrl(r.sourceAssetUrl);
  }
  if (s.productionMethod === "REAL_SOURCE_AI_EDIT") {
    sourceUrl(s.inputAssetUrl);
    if (!s.references.some((r) => r.sourceAssetUrl === s.inputAssetUrl)) {
      throw Error("AI_EDIT_INPUT_REFERENCE_REQUIRED");
    }
  } else if (s.inputAssetUrl !== undefined) {
    throw Error("GENERATION_INPUT_METHOD_CONFLICT");
  }
  if (
    s.resumeJobId !== undefined &&
    (!/^[a-f0-9-]{36}$/.test(s.resumeJobId) ||
      (s.generatedAssetUrl !== undefined || s.chatFile !== undefined || s.inputFile !== undefined))
  ) throw Error("INVALID_GENERATION_RESUME");
  if (s.generatedAssetUrl !== undefined) {
    sourceUrl(s.generatedAssetUrl);
    if (!/^[a-f0-9]{64}$/.test(s.expectedGeneratedSha ?? "")) {
      throw Error("GENERATED_ASSET_SHA_REQUIRED");
    }
  } else if (s.expectedGeneratedSha !== undefined) {
    // Native file input may include an optional integrity check without a URL.
    if (!s.chatFile) throw Error("GENERATED_ASSET_URL_REQUIRED");
    if (!/^[a-f0-9]{64}$/.test(s.expectedGeneratedSha)) {
      throw Error("GENERATED_ASSET_SHA_REQUIRED");
    }
  }
  if (s.chatFile) validateChatFile(s.chatFile);
  if (s.inputFile) validateChatFile(s.inputFile);
  if (s.chatFile && s.generatedAssetUrl) throw Error("MULTIPLE_GENERATED_INPUTS");
  if (s.inputFile && s.productionMethod !== "REAL_SOURCE_AI_EDIT") throw Error("GENERATION_INPUT_METHOD_CONFLICT");
  return s;
}

// This adapter only ingests files created in native ChatGPT. It never invokes a model.
export function validateChatFile(raw: unknown): ChatFile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("INVALID_CHAT_FILE");
  const f = raw as ChatFile;
  if (Object.keys(f).some(k => !["download_url","file_id","mime_type","file_name"].includes(k)) ||
      typeof f.file_id !== "string" || !f.file_id.trim() || f.file_id.length > 200 ||
      typeof f.download_url !== "string" || f.download_url.length > 4000 ||
      (f.mime_type !== undefined && !["image/png","image/jpeg","image/webp"].includes(f.mime_type)) ||
      (f.file_name !== undefined && (typeof f.file_name !== "string" || f.file_name.length > 255))) throw Error("INVALID_CHAT_FILE");
  sourceUrl(f.download_url); // Download also validates DNS/IP and every redirect.
  return f;
}
export function generationCapabilities() {
  return {
    sourceTextAnnotationSupported: true,
    sourceAnnotationTypes: ["circle", "arrow", "label"],
    sourceLabelLanguages: ["ko", "en"],
    sourceLabelMaxCharacters: 16,
    sourceLabelFontSizeAt390px: { minimum: 14, maximum: 24, default: 16 },
    executionMode: "NATIVE_CHATGPT_FILE_HANDOFF",
    visualContractVersions: [4, 5],
    visualPolicyVersion: "VISUAL_COMMON_V1",
    nativeProductionMethods: ["NATIVE_FULL_GENERATION", "REFERENCE_BASED_GENERATION", "REAL_SOURCE_AI_EDIT"],
    externalGenerationApiAllowed: false,
    referenceBasedGeneration: false,
    realSourceAiEdit: false,
    serverGenerationSupported: false,
    nativeGenerationAvailability: "CHECK_CURRENT_CHAT",
    nativeFileHandoff: true,
    fileParamsSupported: true,
    userFileUploadSupported: true,
    generatedAssetUrlHandoff: true,
    providerConfigured: false,
    provider: "NONE",
    requiredSettings: [],
    chatImagegenBinaryBridge: false,
    automaticGeneratedFileHandoff: "UNVERIFIED_REQUIRES_CHAT_TEST",
    nextAction: "VERIFY_NATIVE_CHAT_GENERATION_AND_FILE_INPUT_OR_OPEN_UPLOAD_WIDGET",
  };
}

export async function generateAsset(spec: GenerationSpec) {
  validateGenerationSpec(spec);
  if (!spec.chatFile && !spec.generatedAssetUrl) throw Error("NATIVE_GENERATED_FILE_REQUIRED");
  const d = await downloadSource(spec.chatFile?.download_url ?? spec.generatedAssetUrl, Boolean(spec.chatFile));
  if (!["image/png","image/jpeg","image/webp"].includes(d.mime)) throw Error("NATIVE_FILE_MUST_BE_IMAGE");
  if (spec.chatFile?.mime_type && spec.chatFile.mime_type !== d.mime) throw Error("CHAT_FILE_MIME_MISMATCH");
  const hash = async (b: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(b).buffer)), n=>n.toString(16).padStart(2,"0")).join("");
  const inputSha256 = await hash(d.bytes);
  if (spec.expectedGeneratedSha && inputSha256 !== spec.expectedGeneratedSha) throw Error("GENERATED_ASSET_IDENTITY_MISMATCH");
  let inputSourceSha256: string | null = null;
  if (spec.productionMethod === "REAL_SOURCE_AI_EDIT") {
    if (!spec.inputFile) throw Error("NATIVE_EDIT_INPUT_FILE_REQUIRED");
    const [original, attached] = await Promise.all([downloadSource(spec.inputAssetUrl), downloadSource(spec.inputFile.download_url, true)]);
    if (original.mime === "application/pdf" || attached.mime === "application/pdf") throw Error("AI_EDIT_INPUT_MUST_BE_REAL_PHOTO");
    inputSourceSha256 = await hash(original.bytes);
    if (inputSourceSha256 !== await hash(attached.bytes)) throw Error("NATIVE_EDIT_INPUT_IDENTITY_MISMATCH");
  }
  return {
    ...d,
    finalUrl: null, redirects: [], // Do not publish temporary authorized download URLs.
    generation: {
      transport: spec.chatFile ? "CHATGPT_FILE_PARAMS" : "GENERATED_ASSET_URL",
      provider: "CHATGPT_NATIVE_OPERATOR_SUPPLIED", externalApiUsed: false,
      productionMethod: spec.productionMethod,
      inputSha256, inputMime: d.mime, inputSourceSha256,
      fileId: spec.chatFile?.file_id ?? null,
      referenceConditioning: spec.productionMethod === "NATIVE_FULL_GENERATION" ? "NONE_CURRENT_TASK_SCENE" : spec.productionMethod === "REAL_SOURCE_AI_EDIT" ? "OPERATOR_ATTESTED_NATIVE_INPUT_BINARY" : "OPERATOR_VERIFIED_REFERENCE_FACTS",
    },
  };
}
