import { TireDetail } from "@/features/tire-detail";

type Props = {
  params: Promise<{ tireProductId: string }>;
};

function parseTireProductId(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export default async function TireDetailPage({ params }: Props) {
  const { tireProductId } = await params;
  return <TireDetail tireProductId={parseTireProductId(tireProductId)} />;
}
