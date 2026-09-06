import { createContentFactorySupabaseClient } from "@/lib/supabase/content-factory";
import type { QueueUpdate } from "@/lib/content-factory/schemas";

export async function findAdminOperationsOverview() {
  const { data, error } = await createContentFactorySupabaseClient().rpc("admin_operations_overview_v1");
  if (error) throw new Error(`ADMIN_OPERATIONS_READ_FAILED:${error.message}`);
  return data;
}

export async function updateAdminOperationsTopic(topicKey: string, update: QueueUpdate) {
  const { data, error } = await createContentFactorySupabaseClient().rpc("content_factory_update_topic_v1", {
    p_topic_key: topicKey,
    p_expected_status: update.expectedStatus,
    p_next_status: update.status,
    p_last_error: update.lastError ?? null,
  });
  if (error) throw new Error(`ADMIN_TOPIC_UPDATE_FAILED:${error.message}`);
  return data;
}
