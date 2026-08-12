"use client";

import { useState } from "react";

import { getStoragePublicUrl } from "@/lib/supabase/storage";
import type { BrandOption } from "@/features/bike-selector/types/bike-selector.types";

type BrandSelectProps = {
  brands: BrandOption[];
  value: number | null;
  loading: boolean;
  onChange: (value: number | null) => void;
  selectedOnly?: boolean;
};

type BrandImageProps = {
  imagePath: string | null;
  brandName: string;
};

function BrandImage({ imagePath, brandName }: BrandImageProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const publicUrl = getStoragePublicUrl(imagePath);

  if (publicUrl && failedUrl !== publicUrl) {
    return (
      <div className="flex h-12 w-full max-w-16 flex-shrink-0 items-center justify-center">
        <img
          src={publicUrl}
          alt={brandName}
          className="max-h-full max-w-full origin-center scale-[1.15] object-contain"
          onError={() => setFailedUrl(publicUrl)}
        />
      </div>
    );
  }

  return (
    <div className="flex h-12 w-full max-w-16 flex-shrink-0 items-center justify-center rounded-lg bg-surface-secondary">
      <span className="text-xs font-semibold text-foreground-secondary">
        {brandName.substring(0, 1)}
      </span>
    </div>
  );
}

export function BrandSelect({ brands, value, loading, onChange, selectedOnly = false }: BrandSelectProps) {
  const selectedBrand = brands.find((b) => b.brandId === value);

  // Show selected brand only if selectedOnly mode
  if (selectedOnly) {
    if (!selectedBrand) return null;
    return (
      <div className="rounded-2xl border-2 border-selected-border bg-selected-background p-4">
        <div className="flex items-center gap-4">
          <BrandImage
            imagePath={selectedBrand.logoImageUrl}
            brandName={selectedBrand.brandNameEn}
          />
          <div className="flex flex-1 flex-col items-start">
            <p className="text-sm font-semibold text-foreground">
              {selectedBrand.brandNameKo ?? selectedBrand.brandNameEn}
            </p>
            <p className="text-xs text-foreground-secondary">{selectedBrand.brandNameEn}</p>
          </div>
          <button
            onClick={() => onChange(null)}
            className="text-xs text-primary underline hover:text-primary-hover"
            type="button"
          >
            변경
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">브랜드를 선택하세요</p>
        <div className="grid gap-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-2xl border border-border bg-surface-secondary"
            />
          ))}
        </div>
      </div>
    );
  }

  if (brands.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">브랜드를 선택하세요</p>
        <p className="text-sm text-foreground-secondary">등록된 브랜드가 없습니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-foreground">브랜드를 선택하세요</p>
      <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
        {brands.map((brand) => (
          <button
            key={brand.brandId}
            onClick={() => onChange(brand.brandId)}
            aria-pressed={value === brand.brandId}
            className={`relative flex min-h-24 min-w-0 flex-col items-center justify-center gap-1 rounded-lg border-2 p-1.5 text-center transition-all sm:min-h-28 sm:gap-2 sm:p-3 ${
              value === brand.brandId
                ? "border-selected-border bg-selected-background"
                : "border-border bg-surface hover:border-primary"
            }`}
            type="button"
          >
            <BrandImage
              imagePath={brand.logoImageUrl}
              brandName={brand.brandNameEn}
            />
            <div className="flex w-full min-w-0 flex-col items-center">
              <p
                className="w-full truncate text-[11px] font-semibold text-foreground sm:text-sm"
                title={brand.brandNameKo ?? brand.brandNameEn}
              >
                {brand.brandNameKo ?? brand.brandNameEn}
              </p>
              <p
                className="w-full truncate text-[9px] text-foreground-secondary sm:text-xs"
                title={brand.brandNameEn}
              >
                {brand.brandNameEn}
              </p>
            </div>
            {value === brand.brandId && (
              <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-sm text-primary-foreground">
                ✓
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
