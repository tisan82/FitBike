"use client";

import Image from "next/image";
import { useState } from "react";

import { getStoragePublicUrl } from "@/lib/supabase/storage";

const FALLBACK_IMAGE = "/images/common/no-image-battery.svg";

export function BatteryProductCardImage({
  brandName,
  imagePath,
  specCode,
}: {
  brandName: string;
  imagePath: string | null;
  specCode: string;
}) {
  const [failed, setFailed] = useState(false);
  const productImage = getStoragePublicUrl(imagePath, "battery-assets");
  const useFallback = failed || !productImage;

  return (
    <div className="flex aspect-square items-center justify-center rounded-xl bg-surface-secondary p-3 sm:p-5">
      <Image
        alt={useFallback ? `${brandName} ${specCode} 이미지 준비중` : `${brandName} ${specCode} 배터리`}
        className="h-full w-full object-contain"
        height={480}
        onError={useFallback ? undefined : () => setFailed(true)}
        src={useFallback ? FALLBACK_IMAGE : productImage}
        unoptimized
        width={480}
      />
    </div>
  );
}
