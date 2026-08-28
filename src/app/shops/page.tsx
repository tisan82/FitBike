import type { Metadata } from "next";

import { ServiceShopMap } from "@/features/service-shop/components/ServiceShopMap";
import { getPublishedServiceShops } from "@/services/service-shop.service";

const title = "내 주변 오토바이 정비소 찾기";
const description = "현재 위치를 기준으로 주변 오토바이 정비소를 찾고 주소, 전화, 정비 항목과 공개 이용후기 요약을 확인하세요.";

export const revalidate = 60;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/shops" },
  robots: { index: true, follow: true },
  openGraph: { type: "website", title, description, url: "/shops" },
};

export default async function ServiceShopsPage() {
  const shops = await getPublishedServiceShops();
  const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID?.trim() || null;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-5 sm:py-14">
      <header className="mb-7 max-w-3xl sm:mb-9">
        <p className="text-sm font-bold text-primary">FitBike Service Shop</p>
        <h1 className="mt-2 text-2xl font-bold leading-9 sm:text-3xl sm:leading-10">내 주변 오토바이 정비소를 찾아보세요.</h1>
        <p className="mt-3 text-base leading-7 text-foreground-secondary">
          위치를 허용하면 가까운 정비소부터 보여드립니다. 정비 항목과 공개된 외부 이용후기 정보를 FitBike 기준으로 정리해 제공합니다.
        </p>
        <p className="mt-3 text-sm leading-6 text-foreground-secondary">
          현재는 서울 지역 검증 정비소부터 제공합니다. 영업시간과 실제 작업 가능 여부는 방문 전에 업체에 직접 확인하세요.
        </p>
      </header>
      <ServiceShopMap naverMapClientId={clientId} shops={shops} />
    </main>
  );
}
