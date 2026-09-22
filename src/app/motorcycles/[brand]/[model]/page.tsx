import { permanentRedirect } from "next/navigation";
import { findModelSearchEntries } from "@/repositories/model-detail.repository";
import { toSeoSlug } from "@/lib/seo/motorcycle";

type Props = { params: Promise<{ brand: string; model: string }> };

export default async function ModelSearchEntryPage({ params }: Props) {
  const { brand, model } = await params;
  const entries = await findModelSearchEntries();
  const matches = entries.filter((entry) =>
    toSeoSlug(entry.brand_en) === brand &&
    [entry.model_name_en, entry.model_name_ko, entry.model_key].filter(Boolean).some((value) => toSeoSlug(String(value)) === model),
  );
  const latest = matches[0];
  if (!latest) permanentRedirect("/bike-selector");
  permanentRedirect("/model-detail/" + latest.bike_model_year_id);
}
