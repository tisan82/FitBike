import { BatteryDetail } from "@/features/battery-detail";

type Props = {
  params: Promise<{ batteryProductId: string }>;
};

function parseBatteryProductId(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export default async function BatteryDetailPage({ params }: Props) {
  const { batteryProductId } = await params;
  return (
    <BatteryDetail
      batteryProductId={parseBatteryProductId(batteryProductId)}
    />
  );
}
