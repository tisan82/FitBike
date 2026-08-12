"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";

import { BikeSelectorSubmit } from "@/features/bike-selector/components/BikeSelectorSubmit";
import { BrandSelect } from "@/features/bike-selector/components/BrandSelect";
import { ModelSelect } from "@/features/bike-selector/components/ModelSelect";
import { StepIndicator } from "@/features/bike-selector/components/StepIndicator";
import { YearSelect } from "@/features/bike-selector/components/YearSelect";
import { useBikeSelector } from "@/features/bike-selector/hooks/useBikeSelector";
import {
  useBrandOptionsQuery,
  useModelOptionsQuery,
  useYearOptionsQuery,
} from "@/features/bike-selector/hooks/useBikeSelectorQueries";

export function BikeSelector() {
  const router = useRouter();
  const selector = useBikeSelector();
  const brands = useBrandOptionsQuery();
  const models = useModelOptionsQuery(selector.selectedBrandId);
  const years = useYearOptionsQuery(selector.selectedModelId);
  const error = brands.error ?? models.error ?? years.error;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selector.selectedModelYearId) return;
    router.push(`/model-detail/${selector.selectedModelYearId}`);
  };

  const handlePrevious = () => {
    if (selector.selectedModelId !== null) {
      selector.selectModel(null);
      return;
    }

    if (selector.selectedBrandId !== null) {
      selector.selectBrand(null);
    }
  };

  // Determine current step
  let currentStep: 1 | 2 | 3 = 1;
  if (selector.selectedBrandId) currentStep = 2;
  if (selector.selectedModelId) currentStep = 3;

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-surface px-5 py-6 sm:py-8">
        <div className="mx-auto max-w-2xl">
          <div className="mb-6 text-center">
            <p className="text-2xl font-bold text-foreground">FitBike</p>
          </div>
          <StepIndicator currentStep={currentStep} />
        </div>
      </header>

      {/* Content */}
      <div className="px-5 py-8 sm:py-12">
        <div className="mx-auto max-w-2xl">
          <form className="space-y-8" onSubmit={handleSubmit}>
            {/* Step 1: Brand Selection */}
            <section>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-foreground">
                  {currentStep === 1
                    ? "1단계. 브랜드 선택"
                    : "선택된 브랜드"}
                </h2>
                <p className="mt-2 text-sm text-foreground-secondary">
                  {currentStep === 1
                    ? "내 바이크의 브랜드를 선택하세요."
                    : (() => {
                        const brand = brands.data?.find(
                          (item) => item.brandId === selector.selectedBrandId,
                        );
                        return brand
                          ? (brand.brandNameKo ?? brand.brandNameEn)
                          : "";
                      })()}
                </p>
              </div>
              <BrandSelect
                brands={brands.data ?? []}
                value={selector.selectedBrandId}
                loading={brands.isLoading}
                onChange={selector.selectBrand}
                selectedOnly={currentStep !== 1}
              />
            </section>

            {/* Step 2: Model Selection */}
            {selector.selectedBrandId && currentStep >= 2 && (
              <section>
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-foreground">
                    {currentStep === 2
                      ? "2단계. 모델 선택"
                      : "선택된 모델"}
                  </h2>
                  <p className="mt-2 text-sm text-foreground-secondary">
                    {currentStep === 2
                      ? "선택한 브랜드의 모델을 선택하세요."
                      : (() => {
                          const model = models.data?.find(
                            (item) => item.bikeModelId === selector.selectedModelId,
                          );
                          return model
                            ? (model.modelNameKo ?? model.modelNameEn)
                            : "";
                        })()}
                  </p>
                </div>
                <ModelSelect
                  models={models.data ?? []}
                  value={selector.selectedModelId}
                  disabled={selector.selectedBrandId === null}
                  loading={models.isFetching}
                  onChange={selector.selectModel}
                  selectedOnly={currentStep !== 2}
                />
              </section>
            )}

            {/* Step 3: Year Selection */}
            {selector.selectedModelId && currentStep >= 3 && (
              <section>
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-foreground">
                    3단계. 연식 선택
                  </h2>
                  <p className="mt-2 text-sm text-foreground-secondary">
                    선택한 모델의 연식을 선택하세요.
                  </p>
                </div>
                <YearSelect
                  years={years.data ?? []}
                  value={selector.selectedModelYearId}
                  disabled={selector.selectedModelId === null}
                  loading={years.isFetching}
                  onChange={selector.selectModelYear}
                />
              </section>
            )}

            {/* Error */}
            {error ? (
              <div
                className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                role="alert"
              >
                {error instanceof Error
                  ? error.message
                  : "데이터를 불러오지 못했습니다."}
              </div>
            ) : null}

            {/* Submit Button */}
            {selector.selectedBrandId !== null && (
              <div className="sticky bottom-0 -mx-5 -mb-8 border-t border-border bg-surface px-5 py-4 sm:py-6">
                <BikeSelectorSubmit
                  disabled={!selector.canSubmit}
                  onPrevious={handlePrevious}
                />
              </div>
            )}
          </form>
        </div>
      </div>
    </main>
  );
}
