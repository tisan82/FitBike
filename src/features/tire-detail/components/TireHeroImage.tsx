"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

import { TIRE_IMAGE_FALLBACK_SRC } from "@/features/tire-detail/constants/tire-images";
import { getStoragePublicUrl } from "@/lib/supabase/storage";

type Props = {
  alt: string;
  sources: Array<string | null>;
  preload?: boolean;
};

export function TireHeroImage({ alt, sources, preload = false }: Props) {
  const candidates = useMemo(
    () => [
      ...sources
        .map((source) => getStoragePublicUrl(source))
        .filter((source): source is string => Boolean(source)),
      TIRE_IMAGE_FALLBACK_SRC,
    ],
    [sources],
  );
  const [failedIndex, setFailedIndex] = useState(0);
  const source = candidates[Math.min(failedIndex, candidates.length - 1)];
  const fallback = source === TIRE_IMAGE_FALLBACK_SRC;

  return (
    <div className="relative aspect-square overflow-hidden rounded-2xl bg-surface-secondary">
      <Image
        alt={fallback ? `${alt} 이미지 준비중` : alt}
        className={fallback ? "object-cover" : "object-contain"}
        fill
        onError={fallback ? undefined : () => setFailedIndex((index) => Math.min(index + 1, candidates.length - 1))}
        preload={preload}
        sizes="(max-width: 767px) calc(100vw - 40px), 480px"
        src={source}
        unoptimized={fallback}
      />
    </div>
  );
}
