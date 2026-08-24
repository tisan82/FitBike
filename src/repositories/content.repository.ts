import { createServerSupabaseClient } from "@/lib/supabase/server";

const CONTENT_LIST_COLUMNS =
  "content_id,content_key,title,summary,content_type,thumbnail_image_storage_path,published_at";
const CONTENT_DETAIL_COLUMNS = `${CONTENT_LIST_COLUMNS},hero_image_storage_path,body_blocks,created_at,updated_at`;

export type ContentListRow = {
  content_id: number;
  content_key: string;
  title: string;
  summary: string;
  content_type: string;
  thumbnail_image_storage_path: string | null;
  published_at: string;
};

export type ContentDetailRow = ContentListRow & {
  hero_image_storage_path: string | null;
  body_blocks: unknown;
  created_at: string;
  updated_at: string;
};

export async function findPublishedContents(): Promise<ContentListRow[]> {
  const now = new Date().toISOString();
  const { data, error } = await createServerSupabaseClient()
    .from("12_content")
    .select(CONTENT_LIST_COLUMNS)
    .eq("is_active", true)
    .not("published_at", "is", null)
    .lte("published_at", now)
    .order("published_at", { ascending: false })
    .order("content_id", { ascending: false });

  if (error) throw new Error(`Failed to load published contents: ${error.message}`);
  return (data ?? []) as ContentListRow[];
}

export async function findPublishedContentByKey(
  contentKey: string,
): Promise<ContentDetailRow | null> {
  const now = new Date().toISOString();
  const { data, error } = await createServerSupabaseClient()
    .from("12_content")
    .select(CONTENT_DETAIL_COLUMNS)
    .eq("content_key", contentKey)
    .eq("is_active", true)
    .not("published_at", "is", null)
    .lte("published_at", now)
    .maybeSingle();

  if (error) throw new Error(`Failed to load published content: ${error.message}`);
  return data as ContentDetailRow | null;
}
