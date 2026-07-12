"use client";

import { TireDetailError } from "@/features/tire-detail/components/TireDetailError";
import { TireDetailHeader } from "@/features/tire-detail/components/TireDetailHeader";
import { TireDetailInvalid } from "@/features/tire-detail/components/TireDetailInvalid";
import { TireDetailLoading } from "@/features/tire-detail/components/TireDetailLoading";
import { TireProductSummary } from "@/features/tire-detail/components/TireProductSummary";
import { TireSpecification } from "@/features/tire-detail/components/TireSpecification";
import { useTireDetailQuery } from "@/features/tire-detail/hooks/useTireDetailQuery";

type Props = {
  tireProductId: number | null;
};

export function TireDetail({ tireProductId }: Props) {
  const query = useTireDetailQuery(tireProductId);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-5 py-10 sm:py-16">
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
        <div className="space-y-8">
          <TireProductSummary product={query.data} />
          <TireSpecification product={query.data} />
        </div>
      ) : null}
    </main>
  );
}
