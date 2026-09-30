export type OperationsSummary = {
  publishedContents: number;
  plannedTopics: number;
  generatingTopics: number;
  reviewRequiredTopics: number;
  approvedTopics: number;
  blockedTopics: number;
  pendingSourceReviews: number;
};

export type OperationsTopic = {
  contentTopicId: number;
  topicKey: string;
  topic: string;
  contentType: string;
  partType: string | null;
  status: string;
  priority: number;
  riskLevel: string;
  automationLevel: string;
  attemptCount: number;
  lastError: string | null;
  contentId: number | null;
  updatedAt: string;
};

export type OperationsOverview = {
  summary: OperationsSummary;
  topics: OperationsTopic[];
  images?: {
    pipelineId: number; pipelineImageId: number; contentKey: string; imageId: string; assetKey: string;
    status: string; handoffPhase: string | null; stagingSha: string | null; productionSha: string | null;
    productionPath: string | null; mobileQa: string | null; imageQa: string | null; imageSeoQa: string | null;
    failureCode: string | null; lastError: string | null; contentStage: string;
  }[];
};
