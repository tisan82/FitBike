"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export const MY_BIKE_STORAGE_KEY = "fitbike:selected-bike";
export const MY_BIKE_CHANGED_EVENT = "fitbike:bike-changed";

export type StoredBike = {
  bikeModelYearId: number;
  brandName: string;
  modelName: string;
  yearRangeLabel: string;
};

export function storeSessionBike(bike: StoredBike) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(MY_BIKE_STORAGE_KEY, JSON.stringify(bike));
    window.dispatchEvent(new Event(MY_BIKE_CHANGED_EVENT));
  } catch {
    // Session persistence is a UX convenience. Navigation must still work if storage is unavailable.
  }
}

export function MyBikeLink() {
  const [bike, setBike] = useState<StoredBike | null>(null);

  useEffect(() => {
    const read = () => {
      try {
        const raw = window.sessionStorage.getItem(MY_BIKE_STORAGE_KEY);
        setBike(raw ? (JSON.parse(raw) as StoredBike) : null);
      } catch {
        setBike(null);
      }
    };

    read();
    window.addEventListener(MY_BIKE_CHANGED_EVENT, read);
    return () => window.removeEventListener(MY_BIKE_CHANGED_EVENT, read);
  }, []);

  if (!bike) {
    return <Link className="whitespace-nowrap transition hover:text-primary" href="/bike-selector">내 바이크</Link>;
  }

  return (
    <Link
      aria-label={`${bike.brandName} ${bike.modelName} ${bike.yearRangeLabel} 내 바이크 보기`}
      className="max-w-32 truncate rounded-full bg-selected-background px-3 py-2 font-bold text-primary transition hover:bg-primary hover:text-primary-foreground sm:max-w-48"
      href={`/model-detail/${bike.bikeModelYearId}`}
      title={`${bike.brandName} ${bike.modelName} ${bike.yearRangeLabel}`}
    >
      {bike.modelName} {bike.yearRangeLabel}
    </Link>
  );
}
