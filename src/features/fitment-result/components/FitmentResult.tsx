"use client";

import { FitmentResultEmpty } from "@/features/fitment-result/components/FitmentResultEmpty";
import { FitmentResultError } from "@/features/fitment-result/components/FitmentResultError";
import { FitmentResultHeader } from "@/features/fitment-result/components/FitmentResultHeader";
import { FitmentResultInvalid } from "@/features/fitment-result/components/FitmentResultInvalid";
import { FitmentResultLoading } from "@/features/fitment-result/components/FitmentResultLoading";
import { SelectedBikeSummary } from "@/features/fitment-result/components/SelectedBikeSummary";
import { TireFitmentSection } from "@/features/fitment-result/components/TireFitmentSection";
import { TireSpecificationSummary } from "@/features/fitment-result/components/TireSpecificationSummary";
import { useFitmentResultQuery } from "@/features/fitment-result/hooks/useFitmentResultQuery";

type Props = {
  bikeModelYearId: number | null;
};

export function FitmentResult({ bikeModelYearId }: Props) {
  const query = useFitmentResultQuery(bikeModelYearId);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-5 py-10 sm:py-16">
      <FitmentResultHeader />

      {bikeModelYearId === null ? <FitmentResultInvalid /> : null}
      {bikeModelYearId !== null && query.isLoading ? <FitmentResultLoading /> : null}
      {bikeModelYearId !== null && query.error ? (
        <FitmentResultError
          message={query.error instanceof Error ? query.error.message : "알 수 없는 오류가 발생했습니다."}
        />
      ) : null}

      {query.data ? (
        <div className="space-y-8">
          <SelectedBikeSummary bike={query.data.selectedBike} />
          <TireSpecificationSummary bike={query.data.selectedBike} />

          {query.data.tireProducts.length === 0 ? (
            <FitmentResultEmpty
              modelName={query.data.selectedBike.modelNameKo ?? query.data.selectedBike.modelNameEn}
            />
          ) : (
            <div className="space-y-10">
              <TireFitmentSection position="FRONT" products={query.data.tireProducts} />
              <TireFitmentSection position="REAR" products={query.data.tireProducts} />
            </div>
          )}
        </div>
      ) : null}
    </main>
  );
}
