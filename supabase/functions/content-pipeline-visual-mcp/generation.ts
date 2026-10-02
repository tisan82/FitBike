import { sourceUrl } from "./source.ts";

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
      s.generatedAssetUrl !== undefined)
  ) throw Error("INVALID_GENERATION_RESUME");
  if (s.generatedAssetUrl !== undefined) {
    sourceUrl(s.generatedAssetUrl);
    if (!/^[a-f0-9]{64}$/.test(s.expectedGeneratedSha ?? "")) {
      throw Error("GENERATED_ASSET_SHA_REQUIRED");
    }
  } else if (s.expectedGeneratedSha !== undefined) {
    throw Error("GENERATED_ASSET_URL_REQUIRED");
  }
  return s;
}
export function generationCapabilities(
  get: (key: string) => string | undefined,
) {
  const configuration = {
    enabled: get("FITBIKE_IMAGE_GENERATION_ENABLED") === "true",
    apiKeyPresent: Boolean(get("OPENAI_API_KEY")),
    modelPresent: Boolean(get("FITBIKE_IMAGE_MODEL")),
  };
  const configured = configuration.enabled && configuration.apiKeyPresent &&
    configuration.modelPresent;
  return {
    referenceBasedGeneration: configured,
    realSourceAiEdit: configured,
    generatedAssetUrlHandoff: true,
    providerConfigured: configured,
    configuration,
    requiredSettings: [
      ...(configuration.enabled
        ? []
        : ["FITBIKE_IMAGE_GENERATION_ENABLED=true"]),
      ...(configuration.apiKeyPresent ? [] : ["OPENAI_API_KEY"]),
      ...(configuration.modelPresent ? [] : ["FITBIKE_IMAGE_MODEL"]),
    ],
    provider: "OPENAI_IMAGES_API",
    chatImagegenBinaryBridge: false,
    referenceConditioning: "VERIFIED_FACTS_TEXT_NO_REFERENCE_IMAGE_BINARY",
    referenceVerification:
      "OPERATOR_PIXEL_AND_FACT_EVIDENCE_REQUIRED_NOT_AUTOMATED",
    nextAction: configured
      ? "CLAIM_AND_DISPATCH_VISUAL_GENERATION"
      : "CONFIGURE_PROVIDER_OR_SUPPLY_ACCESSIBLE_GENERATED_ASSET_URL",
  };
}
