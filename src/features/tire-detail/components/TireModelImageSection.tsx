"use client";

import Image from "next/image";
import { useState } from "react";

import { getStoragePublicUrl } from "@/lib/supabase/storage";

type Props = {
  imageUrl: string | null;
  alt: string;
};

export function TireModelImageSection({ imageUrl, alt }: Props) {
  const [failed, setFailed] = useState(false);
  const storedImageUrl = getStoragePublicUrl(imageUrl);
  if (failed || !storedImageUrl) return null;

  return (
    <section aria-label={alt}>
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-surface-secondary">
        <Image
          alt={alt}
          className="object-contain p-3 sm:p-6"
          fill
          onError={() => setFailed(true)}
          sizes="(max-width: 1024px) calc(100vw - 40px), 984px"
          src={storedImageUrl}
        />
      </div>
    </section>
  );
}
