import type { Metadata } from "next";
import { BikeSelector } from "@/features/bike-selector";
export const metadata: Metadata = { title: "내 바이크 선택", description: "오토바이 브랜드, 모델, 연식을 순서대로 선택해 해당 바이크의 타이어, 배터리, 브레이크 규격을 확인하세요.", alternates: { canonical: "/bike-selector" } };
export default function BikeSelectorPage() { return <BikeSelector />; }
