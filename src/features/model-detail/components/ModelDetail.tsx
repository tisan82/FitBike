"use client";

import { ModelDescription } from "@/features/model-detail/components/ModelDescription";
import { ModelDetailError } from "@/features/model-detail/components/ModelDetailError";
import { ModelDetailHeader } from "@/features/model-detail/components/ModelDetailHeader";
import { ModelDetailInvalid } from "@/features/model-detail/components/ModelDetailInvalid";
import { ModelDetailLoading } from "@/features/model-detail/components/ModelDetailLoading";
import { ModelSummary } from "@/features/model-detail/components/ModelSummary";
import { PartsHub } from "@/features/model-detail/components/PartsHub";
import { RelatedGuides } from "@/features/model-detail/components/RelatedGuides";
import { YearNavigation } from "@/features/model-detail/components/YearNavigation";
import { useModelDetailQuery } from "@/features/model-detail/hooks/useModelDetailQuery";
import type { ModelDetailData } from "@/features/model-detail/types/model-detail.types";

type Props = {
  bikeModelYearId: number | null;
  initialData?: ModelDetailData;
};

export function ModelDetail({ bikeModelYearId, initialData }: Props) {
  const query = useModelDetailQuery(bikeModelYearId, initialData);

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
          <section className="space-y-2"><p className="text-sm font-semibold text-foreground-secondary">{query.data.brandNameKo ?? query.data.brandNameEn}</p><h1 className="text-3xl font-bold tracking-tight text-foreground">{query.data.modelNameKo ?? query.data.modelNameEn} {query.data.yearRangeLabel}</h1></section>
          <YearNavigation currentId={query.data.bikeModelYearId} years={query.data.yearOptions} />
          <ModelSummary model={query.data} />
          <ModelDescription model={query.data} />
          <PartsHub model={query.data} />
          <RelatedGuides guides={query.data.relatedGuides} />
        </div>
      ) : null}
    </main>
  );
}
