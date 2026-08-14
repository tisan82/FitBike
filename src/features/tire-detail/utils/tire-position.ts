import type { TirePositionType } from "@/features/tire-detail/types/tire-detail.types";

const TIRE_POSITION_LABELS: Record<TirePositionType, string> = {
  FRONT: "앞 타이어",
  REAR: "뒤 타이어",
  BOTH: "앞·뒤 사용 가능",
  COMMON: "장착 위치 확인 필요",
};

export function getTirePositionLabel(position: TirePositionType | null) {
  return position ? TIRE_POSITION_LABELS[position] : "장착 위치 정보 없음";
}
