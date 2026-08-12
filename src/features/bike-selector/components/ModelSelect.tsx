"use client";

import { useState } from "react";

import { getStoragePublicUrl } from "@/lib/supabase/storage";
import type { ModelOption } from "@/features/bike-selector/types/bike-selector.types";

type ModelSelectProps = {
  models: ModelOption[];
  value: number | null;
  disabled: boolean;
  loading: boolean;
  onChange: (value: number | null) => void;
  selectedOnly?: boolean;
};

type ModelImageProps = {
  imagePath: string | null;
  modelName: string;
};

function ModelImage({ imagePath, modelName }: ModelImageProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const publicUrl = getStoragePublicUrl(imagePath);

  if (publicUrl && failedUrl !== publicUrl) {
    return (
      <div className="flex h-16 w-28 flex-shrink-0 items-center justify-center overflow-hidden">
        <img
          src={publicUrl}
          alt={modelName}
          className="max-h-full max-w-full origin-center scale-[1.35] object-contain"
          onError={() => setFailedUrl(publicUrl)}
        />
      </div>
    );
  }

  return (
    <div className="flex h-16 w-28 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-secondary">
      <svg
        aria-hidden="true"
        className="h-6 w-6 text-foreground-secondary"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    </div>
  );
}

export function ModelSelect({
  models,
  value,
  disabled,
  loading,
  onChange,
  selectedOnly = false,
}: ModelSelectProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const selectedModel = models.find((m) => m.bikeModelId === value);

  // Show selected model only if selectedOnly mode
  if (selectedOnly) {
    if (!selectedModel) return null;
    return (
      <div className="rounded-xl border-2 border-selected-border bg-selected-background p-3">
        <div className="flex items-center gap-4">
          <ModelImage
            imagePath={selectedModel.modelImageUrl}
            modelName={selectedModel.modelNameEn}
          />
          <div className="flex min-w-0 flex-1 flex-col items-start">
            <p className="text-sm font-semibold text-foreground">
              {selectedModel.modelNameKo ?? selectedModel.modelNameEn}
            </p>
            <p className="text-xs text-foreground-secondary">
              {selectedModel.category}
              {selectedModel.engineCc && ` · ${selectedModel.engineCc}cc`}
            </p>
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

  const filteredModels = models.filter((model) => {
    const query = searchQuery.trim().toLowerCase();
    const modelNameKo = model.modelNameKo?.toLowerCase() ?? "";
    const modelNameEn = model.modelNameEn.toLowerCase();
    const engineCc = model.engineCc ? `${model.engineCc}cc` : "";
    return (
      modelNameKo.includes(query) ||
      modelNameEn.includes(query) ||
      engineCc.includes(query)
    );
  });

  if (disabled) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">모델을 선택하세요</p>
        <p className="text-sm text-foreground-secondary">브랜드를 먼저 선택하세요</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-foreground">모델을 선택하세요</p>

      {/* Search Input */}
      <div className="relative">
        <svg
          aria-hidden="true"
          className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-foreground-secondary"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          aria-label="모델명 또는 배기량 검색"
          type="text"
          placeholder="모델명을 검색하세요"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-xl border border-border bg-surface py-3 pl-10 pr-4 text-sm text-foreground outline-none transition focus:border-primary"
          disabled={loading}
        />
      </div>

      {/* Models List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl border border-border bg-surface-secondary"
            />
          ))}
        </div>
      ) : filteredModels.length === 0 ? (
        <p className="text-sm text-foreground-secondary">
          {models.length === 0 ? "등록된 모델이 없습니다" : "검색 결과가 없습니다"}
        </p>
      ) : (
        <div className="max-h-96 space-y-1.5 overflow-y-auto">
          {filteredModels.map((model) => (
            <button
              key={model.bikeModelId}
              onClick={() => onChange(model.bikeModelId)}
              aria-pressed={value === model.bikeModelId}
              className={`flex h-20 w-full items-center gap-2 rounded-xl border-2 px-2 py-1.5 transition-all sm:gap-3 ${
                value === model.bikeModelId
                  ? "border-selected-border bg-selected-background"
                  : "border-border bg-surface hover:border-primary"
              }`}
              type="button"
            >
              <ModelImage
                imagePath={model.modelImageUrl}
                modelName={model.modelNameEn}
              />
              <div className="flex min-w-0 flex-1 flex-col items-start text-left">
                <p
                  className="w-full truncate text-sm font-semibold text-foreground"
                  title={model.modelNameKo ?? model.modelNameEn}
                >
                  {model.modelNameKo ?? model.modelNameEn}
                </p>
                <p className="w-full truncate text-xs text-foreground-secondary">
                  {model.category}
                  {model.engineCc && ` · ${model.engineCc}cc`}
                </p>
              </div>
              {value === model.bikeModelId && (
                <div className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                  ✓
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
