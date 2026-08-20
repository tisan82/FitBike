"use client";

import { TireDetailError } from "@/features/tire-detail/components/TireDetailError";
import { TireDetailHeader } from "@/features/tire-detail/components/TireDetailHeader";
import { TireDetailInvalid } from "@/features/tire-detail/components/TireDetailInvalid";
import { TireDetailLoading } from "@/features/tire-detail/components/TireDetailLoading";
import { TireFitmentList } from "@/features/tire-detail/components/TireFitmentList";
import { TireOtherSkus } from "@/features/tire-detail/components/TireOtherSkus";
import { TirePurchaseCTA } from "@/features/tire-detail/components/TirePurchaseCTA";
import { TireProductSummary } from "@/features/tire-detail/components/TireProductSummary";
import { TireSizeGuide } from "@/features/tire-detail/components/TireSizeGuide";
import { TireSpecification } from "@/features/tire-detail/components/TireSpecification";
import { useTireDetailQuery } from "@/features/tire-detail/hooks/useTireDetailQuery";

type Props = {
  tireProductId: number | null;
};

export function TireDetail({ tireProductId }: Props) {
  const query = useTireDetailQuery(tireProductId);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:space-y-10 sm:px-5 sm:py-14">
      <TireDetailHeader />

      {tireProductId === null ? <TireDetailInvalid /> : null}
      {tireProductId !== null && query.isLoading ? <TireDetailLoading /> : null}
      {tireProductId !== null && query.error ? (
        <TireDetailError
          message={
            query.error instanceof Error
              ? query.error.message
              : "알 수 없는 오류가 발생했습니다."
          }
        />
      ) : null}

      {query.data ? (
        <div className="space-y-8 sm:space-y-16">
          <TireProductSummary product={query.data} />
          <TireSpecification product={query.data} />
          <TireSizeGuide />
          <TireFitmentList
            fitmentCount={query.data.fitmentCount}
            tireProductId={query.data.tireProductId}
          />
          <TirePurchaseCTA product={query.data} />
          <TireOtherSkus skus={query.data.otherSkus} />
        </div>
      ) : null}
    </main>
  );
}
