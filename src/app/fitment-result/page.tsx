import { FitmentResult } from "@/features/fitment-result";

type Props = {
  searchParams: Promise<{
    bikeModelYearId?: string | string[];
  }>;
};

function parseBikeModelYearId(value: string | string[] | undefined) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export default async function FitmentResultPage({ searchParams }: Props) {
  const params = await searchParams;
  return <FitmentResult bikeModelYearId={parseBikeModelYearId(params.bikeModelYearId)} />;
}
