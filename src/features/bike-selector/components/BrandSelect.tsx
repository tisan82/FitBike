import { SelectorField } from "@/features/bike-selector/components/SelectorField";
import type { BrandOption } from "@/features/bike-selector/types/bike-selector.types";

type BrandSelectProps = {
  brands: BrandOption[];
  value: number | null;
  loading: boolean;
  onChange: (value: number | null) => void;
};

export function BrandSelect({ brands, value, loading, onChange }: BrandSelectProps) {
  return (
    <SelectorField id="brand" label="브랜드" value={value} loading={loading} placeholder="브랜드를 선택하세요" emptyMessage="등록된 브랜드가 없습니다" hasOptions={brands.length > 0} onChange={onChange}>
      {brands.map((brand) => (
        <option key={brand.brandId} value={brand.brandId}>
          {brand.brandNameKo ?? brand.brandNameEn}
        </option>
      ))}
    </SelectorField>
  );
}
