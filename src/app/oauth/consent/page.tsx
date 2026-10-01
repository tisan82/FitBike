import type { Metadata } from "next";
import { VisualMcpConsent } from "@/features/content-factory/components/VisualMcpConsent";
export const metadata: Metadata = { title: "콘텐츠 운영 연결", robots: { index: false, follow: false } };
export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ authorization_id?: string }> }) {
  const { authorization_id } = await searchParams;
  return <VisualMcpConsent authorizationId={authorization_id ?? ""} />;
}
