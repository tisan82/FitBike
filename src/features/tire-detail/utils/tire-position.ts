import type { TirePositionType } from "@/features/tire-detail/types/tire-detail.types";

const TIRE_POSITION_LABELS: Record<TirePositionType, string> = {
  FRONT: "앞 타이어",
  REAR: "뒤 타이어",
  BOTH: "앞/뒤 공용",
  COMMON: "공용",
};

export function getTirePositionLabel(position: TirePositionType | null) {
  return position ? TIRE_POSITION_LABELS[position] : null;
}
