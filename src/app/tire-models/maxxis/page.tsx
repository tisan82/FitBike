import type { Metadata } from "next";

import { MaxxisTireModelList } from "@/features/tire-model-list";
import { getCachedActiveTireModelsByBrandName } from "@/services/tire-model-list.loader";

const title = "MAXXIS 타이어 모델";
const description = "MAXXIS의 활성 타이어 모델과 제품 특징, 판매 규격을 확인하세요.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/tire-models/maxxis" },
  robots: { index: true, follow: true },
  openGraph: { title, description, url: "/tire-models/maxxis", type: "website" },
};

export default async function MaxxisTireModelsPage() {
  const models = await getCachedActiveTireModelsByBrandName("맥시스");
  return <MaxxisTireModelList models={models} />;
}
