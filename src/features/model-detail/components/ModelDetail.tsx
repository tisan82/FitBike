"use client";

import Link from "next/link";

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

type Props = { bikeModelYearId: number | null; initialData?: ModelDetailData };

export function ModelDetail({ bikeModelYearId, initialData }: Props) {
  const query = useModelDetailQuery(bikeModelYearId, initialData);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-5 py-8 sm:py-14">
      <ModelDetailHeader />
      {bikeModelYearId === null ? <ModelDetailInvalid /> : null}
      {bikeModelYearId !== null && query.isLoading ? <ModelDetailLoading /> : null}
      {bikeModelYearId !== null && query.error ? <ModelDetailError message={query.error instanceof Error ? query.error.message : "알 수 없는 오류가 발생했습니다."} /> : null}

      {query.data ? (
        <div className="space-y-8">
          <section>
            <p className="text-sm font-semibold text-primary">내 바이크</p>
            <p className="mt-1 text-sm font-semibold text-foreground-secondary">{query.data.brandNameKo ?? query.data.brandNameEn}</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">{query.data.modelNameKo ?? query.data.modelNameEn} {query.data.yearRangeLabel}</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-foreground-secondary">이 모델의 기본 정보와 실제 등록된 부품 규격을 확인하고, 필요한 경우 관리 가이드나 주변 정비소로 이동할 수 있습니다.</p>
          </section>

          <nav aria-label="내 바이크 바로가기" className="grid grid-cols-3 gap-2 rounded-2xl bg-surface-secondary p-2 sm:gap-3 sm:p-3">
            <a className="flex min-h-14 items-center justify-center rounded-xl bg-surface px-2 text-center text-sm font-bold shadow-sm transition hover:text-primary" href="#parts">부품 규격</a>
            <Link className="flex min-h-14 items-center justify-center rounded-xl bg-surface px-2 text-center text-sm font-bold shadow-sm transition hover:text-primary" href="/contents">관리 가이드</Link>
            <Link className="flex min-h-14 items-center justify-center rounded-xl bg-surface px-2 text-center text-sm font-bold shadow-sm transition hover:text-primary" href="/shops">정비소 찾기</Link>
          </nav>

          <YearNavigation currentId={query.data.bikeModelYearId} years={query.data.yearOptions} />
          <ModelSummary model={query.data} />
          <ModelDescription model={query.data} />
          <div id="parts" className="scroll-mt-24"><PartsHub model={query.data} /></div>
          <RelatedGuides guides={query.data.relatedGuides} />
          <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <p className="text-sm font-semibold text-primary">정비가 필요하다면</p>
            <h2 className="mt-1 text-xl font-bold">주변 오토바이 정비소를 확인하세요.</h2>
            <p className="mt-2 text-base leading-7 text-foreground-secondary">직접 작업하기 어렵거나 정확한 점검이 필요한 경우 지역별 정비소 정보를 확인할 수 있습니다.</p>
            <Link className="mt-4 inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground transition hover:bg-primary-hover" href="/shops">정비소 찾기</Link>
          </section>
        </div>
      ) : null}
    </main>
  );
}
