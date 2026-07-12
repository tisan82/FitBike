import { SelectorField } from "@/features/bike-selector/components/SelectorField";
import type { ModelOption } from "@/features/bike-selector/types/bike-selector.types";

type ModelSelectProps = {
  models: ModelOption[];
  value: number | null;
  disabled: boolean;
  loading: boolean;
  onChange: (value: number | null) => void;
};

export function ModelSelect({ models, value, disabled, loading, onChange }: ModelSelectProps) {
  return (
    <SelectorField id="model" label="모델" value={value} disabled={disabled} loading={loading} placeholder="모델을 선택하세요" emptyMessage={disabled ? "브랜드를 먼저 선택하세요" : "등록된 모델이 없습니다"} hasOptions={models.length > 0} onChange={onChange}>
      {models.map((model) => (
        <option key={model.bikeModelId} value={model.bikeModelId}>
          {model.modelNameKo ?? model.modelNameEn}{model.engineCc ? ` · ${model.engineCc}cc` : ""}
        </option>
      ))}
    </SelectorField>
  );
}
