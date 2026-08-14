"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { TireBrandLogo } from "@/features/model-detail/components/TireBrandLogo";
import { getModelDetailProducts } from "@/features/model-detail/services/model-detail.service";
import type {
  ConnectedProduct,
  ModelDetailData,
  TireSpecification,
} from "@/features/model-detail/types/model-detail.types";
import { getTireProductDisplayName } from "@/features/model-detail/utils/tire-product-display";

type ProductStateProps = {
  error: boolean;
  items?: ConnectedProduct[];
  label: string;
  loading: boolean;
};

function Products({ label, items, loading, error }: ProductStateProps) {
  const [all, setAll] = useState(false);

  if (loading) {
    return <div aria-label={`${label} 불러오는 중`} className="h-16 animate-pulse rounded-xl bg-surface-secondary" role="status" />;
  }
  if (error) {
    return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">상품 정보를 불러오지 못했습니다.</p>;
  }
  if (!items?.length) {
    return <p className="rounded-xl bg-surface-secondary p-4 text-sm text-foreground-secondary">등록된 상품이 없습니다.</p>;
  }

  return (
    <div className="space-y-2">
      {(all ? items : items.slice(0, 3)).map((item) => {
        const body = (
          <>
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-foreground-secondary">{item.brandName}</span>
              <span className="block truncate font-semibold" title={item.productName}>{item.productName}</span>
              {item.secondaryInformation ? <span className="block text-sm text-foreground-secondary">{item.secondaryInformation}</span> : null}
            </span>
            {item.detailHref ? <span aria-hidden className="ml-3 flex-none">›</span> : null}
          </>
        );
        const className = "flex min-h-16 items-center justify-between rounded-xl border border-border bg-surface p-4";

        return item.detailHref ? (
          <Link aria-label={`${item.brandName} ${item.productName} 상세 보기`} className={`${className} hover:border-primary`} href={item.detailHref} key={item.id}>{body}</Link>
        ) : (
          <div className={className} key={item.id}>{body}</div>
        );
      })}
      {items.length > 3 ? (
        <button className="min-h-11 w-full rounded-xl border border-border text-sm font-semibold" onClick={() => setAll(!all)} type="button">
          {all ? "접기" : `${label} ${items.length - 3}개 더보기`}
        </button>
      ) : null}
    </div>
  );
}

function TireProducts({ items, loading, error, label }: ProductStateProps) {
  if (loading) {
    return (
      <div aria-label={`${label} 불러오는 중`} className="flex gap-3 overflow-hidden sm:grid sm:grid-cols-3" role="status">
        {[0, 1, 2].map((item) => <div className="h-28 w-[76vw] max-w-64 flex-none animate-pulse rounded-xl bg-surface-secondary sm:w-auto" key={item} />)}
      </div>
    );
  }
  if (error) {
    return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">상품 정보를 불러오지 못했습니다.</p>;
  }
  if (!items?.length) {
    return <p className="rounded-xl bg-surface-secondary p-4 text-sm text-foreground-secondary">등록된 상품이 없습니다.</p>;
  }

  return (
      <div aria-label={`${label} 상품 ${items.length}개`} className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0">
        {items.map((item) => {
          const displayName = getTireProductDisplayName(item.brandName, item.productName);
          const cardContent = (
            <>
              <span className="space-y-2">
                <TireBrandLogo brandName={item.brandName} />
                <span className="block truncate text-lg font-bold" title={item.productName}>{displayName}</span>
              </span>
              {item.detailHref ? <span className="mt-2 text-sm font-semibold text-primary">상세보기 <span aria-hidden>›</span></span> : null}
            </>
          );
          const className = "flex min-h-24 w-[76vw] max-w-64 flex-none snap-start flex-col justify-between rounded-xl border border-border bg-surface p-3 transition-colors sm:w-auto sm:max-w-none";

          return item.detailHref ? (
            <Link
              aria-label={`${item.brandName} ${displayName} 상세 보기`}
              className={`${className} hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
              href={item.detailHref}
              key={item.id}
            >
              {cardContent}
            </Link>
          ) : (
            <div className={className} key={item.id}>{cardContent}</div>
          );
        })}
      </div>
  );
}

function tireSpecification(spec: TireSpecification) {
  if (spec.fullSize) return spec.fullSize;
  if (spec.width === null || spec.diameter === null) return "규격 정보 없음";

  const size = `${spec.width}${spec.ratio === null ? "" : `/${spec.ratio}`}-${spec.diameter}`;
  const serviceDescription = spec.loadIndex === null && !spec.speedIndex ? null : `${spec.loadIndex ?? ""}${spec.speedIndex ?? ""}`;

  return [size, serviceDescription, spec.tubeType].filter(Boolean).join(" · ");
}

function Tire({ label, spec, items, loading, error }: ProductStateProps & { spec: TireSpecification }) {
  return (
    <article className="space-y-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="font-bold">{label}</h3>
          {!loading && !error && items?.length ? <span className="text-xs font-medium text-foreground-secondary">{items.length}개</span> : null}
        </div>
        <p className="break-words text-sm font-semibold text-foreground">{tireSpecification(spec)}</p>
      </div>
      <TireProducts error={error} items={items} label={label} loading={loading} />
    </article>
  );
}

export function PartsHub({ model }: { model: ModelDetailData }) {
  const ref = useRef<HTMLElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setEnabled(true);
        observer.disconnect();
      }
    }, { rootMargin: "240px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const query = useQuery({ queryKey: ["model-detail-products", model.bikeModelYearId], queryFn: () => getModelDetailProducts(model.bikeModelYearId), enabled });
  const loading = !enabled || query.isLoading;
  const failed = query.isError;

  return (
    <section className="space-y-6" ref={ref}>
      <h2 className="text-xl font-bold">이 바이크의 부품 규격</h2>
      <section className="space-y-4 rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-lg font-bold">타이어</h2>
        <Tire error={failed} items={query.data?.tire.front} label="앞 타이어" loading={loading} spec={model.frontTire} />
        <Tire error={failed} items={query.data?.tire.rear} label="뒤 타이어" loading={loading} spec={model.rearTire} />
      </section>
      <Part error={failed} label="배터리" loading={loading} products={query.data?.battery} spec={model.batteryStandardCode} sub={model.batteryVoltage} />
      <section className="space-y-4 rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-lg font-bold">브레이크</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Part error={failed} label="앞 브레이크" loading={loading} products={query.data?.brake.front} spec={model.frontBrakeSpec} sub={model.frontBrakeCaliperType} nested />
          <Part error={failed} label="뒤 브레이크" loading={loading} products={query.data?.brake.rear} spec={model.rearBrakeSpec} sub={model.rearBrakeCaliperType} nested />
        </div>
      </section>
    </section>
  );
}

function Part({ label, spec, sub, products, loading, error, nested = false }: { label: string; spec: string | null; sub: string | null; products?: ConnectedProduct[]; loading: boolean; error: boolean; nested?: boolean }) {
  const content = (
    <>
      <div className="rounded-xl bg-surface-secondary p-4">
        <h3 className="font-semibold">{label}</h3>
        <p className="mt-1">{spec ?? "규격 정보 없음"}</p>
        {sub ? <p className="text-sm text-foreground-secondary">{sub}</p> : null}
      </div>
      <Products error={error} items={products} label={`${label} 상품`} loading={loading} />
    </>
  );

  return nested ? <div className="space-y-3">{content}</div> : (
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-lg font-bold">{label}</h2>
      {content}
    </section>
  );
}
