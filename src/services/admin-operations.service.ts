import type { OperationsOverview } from "@/features/admin/types/operations.types";
import type { QueueUpdate } from "@/lib/content-factory/schemas";
import { findAdminOperationsOverview, updateAdminOperationsTopic } from "@/repositories/admin-operations.repository";

export async function getAdminOperationsOverview(): Promise<OperationsOverview> {
  return await findAdminOperationsOverview() as OperationsOverview;
}

export async function transitionAdminOperationsTopic(topicKey: string, update: QueueUpdate) {
  return updateAdminOperationsTopic(topicKey, update);
}
