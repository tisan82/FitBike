export type DuplicateCandidate = { topicKey: string; status?: string | null; contentId?: number | null };

const ACTIVE_OR_TERMINAL_STATUSES = new Set(["PUBLISHED", "APPROVED", "GENERATING", "REVIEW_REQUIRED"]);

export function isDuplicateTopic(topicKey: string, existing: DuplicateCandidate[]) {
  const normalized = topicKey.trim().toLowerCase();
  return existing.some((item) => item.topicKey.trim().toLowerCase() === normalized && (Boolean(item.contentId) || ACTIVE_OR_TERMINAL_STATUSES.has(item.status ?? "")));
}

export function assertUniqueTopic(topicKey: string, existing: DuplicateCandidate[]) {
  if (isDuplicateTopic(topicKey, existing)) throw new Error(`Duplicate content topic: ${topicKey}`);
}
