import { ModelDetail } from "@/features/model-detail";

type Props = {
  params: Promise<{ bikeModelYearId: string }>;
};

function parseBikeModelYearId(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export default async function ModelDetailPage({ params }: Props) {
  const { bikeModelYearId } = await params;
  return <ModelDetail bikeModelYearId={parseBikeModelYearId(bikeModelYearId)} />;
}
