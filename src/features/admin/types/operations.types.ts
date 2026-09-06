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
};
