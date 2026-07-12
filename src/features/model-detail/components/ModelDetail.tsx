"use client";

import { ModelDescription } from "@/features/model-detail/components/ModelDescription";
import { ModelDetailError } from "@/features/model-detail/components/ModelDetailError";
import { ModelDetailHeader } from "@/features/model-detail/components/ModelDetailHeader";
import { ModelDetailInvalid } from "@/features/model-detail/components/ModelDetailInvalid";
import { ModelDetailLoading } from "@/features/model-detail/components/ModelDetailLoading";
import { ModelSummary } from "@/features/model-detail/components/ModelSummary";
import { PartsSpecification } from "@/features/model-detail/components/PartsSpecification";
import { TireSpecification } from "@/features/model-detail/components/TireSpecification";
import { useModelDetailQuery } from "@/features/model-detail/hooks/useModelDetailQuery";

type Props = {
  bikeModelYearId: number | null;
};

export function ModelDetail({ bikeModelYearId }: Props) {
  const query = useModelDetailQuery(bikeModelYearId);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-5 py-10 sm:py-16">
      <ModelDetailHeader />

      {bikeModelYearId === null ? <ModelDetailInvalid /> : null}
      {bikeModelYearId !== null && query.isLoading ? <ModelDetailLoading /> : null}
      {bikeModelYearId !== null && query.error ? (
        <ModelDetailError
          message={query.error instanceof Error ? query.error.message : "알 수 없는 오류가 발생했습니다."}
        />
      ) : null}

      {query.data ? (
        <div className="space-y-8">
          <ModelSummary model={query.data} />
          <TireSpecification front={query.data.frontTire} rear={query.data.rearTire} />
          <PartsSpecification model={query.data} />
          <ModelDescription model={query.data} />
        </div>
      ) : null}
    </main>
  );
}
