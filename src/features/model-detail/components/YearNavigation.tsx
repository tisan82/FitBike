import Link from "next/link";
import type { ModelYearOption } from "@/features/model-detail/types/model-detail.types";

export function YearNavigation({ years, currentId, modelPagePath }: { years: ModelYearOption[]; currentId: number; modelPagePath?: string }) {
  return (
    <nav aria-label="모델 연식 선택" className="overflow-x-auto pb-1">
      <ul className="flex w-max gap-2">
        {years.map((year) => {
          const selected = year.bikeModelYearId === currentId;
          const href = modelPagePath && year.bikeModelYearId === years[0]?.bikeModelYearId
            ? modelPagePath
            : `/model-detail/${year.bikeModelYearId}`;
          return <li key={year.bikeModelYearId}><Link aria-current={selected ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full border px-4 text-base font-semibold ${selected ? "border-selected-border bg-selected-background text-primary" : "border-border bg-surface text-foreground hover:border-primary"}`} href={href}>{year.yearRangeLabel}</Link></li>;
        })}
      </ul>
    </nav>
  );
}
