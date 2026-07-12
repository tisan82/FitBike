import type { Metadata } from "next";

import { BikeSelector } from "@/features/bike-selector";

export const metadata: Metadata = {
  title: "바이크 선택",
  description: "브랜드, 모델, 연식을 선택해 장착 가능한 부품을 확인하세요.",
};

export default function BikeSelectorPage() {
  return <BikeSelector />;
}
