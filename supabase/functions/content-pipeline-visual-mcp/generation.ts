import { sourceUrl } from "./source.ts";

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
  productionMethod: "REFERENCE_BASED_GENERATION" | "REAL_SOURCE_AI_EDIT";
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
    "chatFile",
    "inputFile",
  ];
  if (
    Object.keys(s).some((k) => !keys.includes(k)) ||
    !["REFERENCE_BASED_GENERATION", "REAL_SOURCE_AI_EDIT"].includes(
      s.productionMethod,
    ) ||
    typeof s.prompt !== "string" || s.prompt.trim().length < 20 ||
    s.prompt.length > 6000 ||
    !Array.isArray(s.references) || s.references.length < 1 ||
    s.references.length > 4
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
    executionMode: "NATIVE_CHATGPT_FILE_HANDOFF",
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
