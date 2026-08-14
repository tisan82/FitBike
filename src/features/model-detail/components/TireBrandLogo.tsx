"use client";

import Image from "next/image";
import { useState } from "react";

import { getTireBrandLogo } from "@/features/model-detail/utils/tire-brand-logo";

export function TireBrandLogo({ brandName }: { brandName: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = getTireBrandLogo(brandName);

  if (!src || failedSrc === src) {
    return (
      <span className="block text-xs font-semibold text-foreground-secondary">
        {brandName}
      </span>
    );
  }

  return (
    <Image
      alt={`${brandName} 로고`}
      className="h-6 w-auto max-w-20 object-contain object-left"
      height={600}
      onError={() => setFailedSrc(src)}
      sizes="80px"
      src={src}
      width={600}
    />
  );
}
