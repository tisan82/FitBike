export type DuplicateCandidate = { topicKey: string; status?: string | null; contentId?: number | null };

const TERMINAL_CONTENT_STATUSES = new Set(["PUBLISHED", "APPROVED", "GENERATING", "REVIEW_REQUIRED"]);

export function isDuplicateTopic(topicKey: string, existing: DuplicateCandidate[]) {
  const normalized = topicKey.trim().toLowerCase();
  return existing.some((item) => item.topicKey.trim().toLowerCase() === normalized && (Boolean(item.contentId) || TERMINAL_CONTENT_STATUSES.has(item.status ?? "")));
}

export function assertUniqueTopic(topicKey: string, existing: DuplicateCandidate[]) {
  if (isDuplicateTopic(topicKey, existing)) throw new Error(`Duplicate content topic: ${topicKey}`);
}
