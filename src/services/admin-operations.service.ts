import type { OperationsOverview } from "@/features/admin/types/operations.types";
import type { QueueUpdate } from "@/lib/content-factory/schemas";
import { findAdminOperationsOverview, findAdminImageHandoffs, updateAdminOperationsTopic } from "@/repositories/admin-operations.repository";

export async function getAdminOperationsOverview(): Promise<OperationsOverview> {
  const [overview, images] = await Promise.all([findAdminOperationsOverview(), findAdminImageHandoffs()]);
  return { ...overview, images } as OperationsOverview;
}

export async function transitionAdminOperationsTopic(topicKey: string, update: QueueUpdate) {
  return updateAdminOperationsTopic(topicKey, update);
}
