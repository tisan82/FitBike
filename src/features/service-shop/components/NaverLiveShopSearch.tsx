"use client";

import { useEffect, useState } from "react";

type SearchItem = { title: string; link: string | null };

export function NaverLiveShopSearch({ district }: { district: string }) {
  const [items, setItems] = useState<SearchItem[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">(district ? "loading" : "idle");

  useEffect(() => {
    if (!district) return;
    const controller = new AbortController();
    fetch(`/api/v1/service-shops/naver-search?district=${encodeURIComponent(district)}`, {
      signal: controller.signal,
      cache: "no-store",
    }).then(async (response) => {
      if (!response.ok) throw new Error("Search unavailable");
      return response.json() as Promise<{ items: SearchItem[] }>;
    }).then((result) => {
      setItems(result.items);
      setState("ready");
    }).catch(() => {
      if (!controller.signal.aborted) setState("error");
    });
    return () => controller.abort();
  }, [district]);

  const displayedItems = state === "ready" ? items : [];
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm" aria-live="polite">
      <h2 className="text-xl font-bold">네이버 실시간 검색 결과</h2>
      <p className="mt-2 text-sm leading-6 text-foreground-secondary">선택한 구의 오토바이 정비 검색 결과를 최대 5곳 보여드립니다. 네이버 검색 결과이며 FitBike 검증 정비소와는 별개입니다.</p>
      {!district ? <p className="mt-4 text-sm">위에서 시·군·구를 선택해 주세요.</p> : null}
      {district && state === "loading" ? <p className="mt-4 text-sm">검색하고 있어요.</p> : null}
      {district && state === "error" ? <p className="mt-4 text-sm">검색 결과를 불러오지 못했습니다. 잠시 후 지역을 다시 선택해 주세요.</p> : null}
      {district && state === "ready" && displayedItems.length === 0 ? <p className="mt-4 text-sm">검색 결과가 없습니다.</p> : null}
      {displayedItems.length > 0 ? <ul className="mt-4 divide-y divide-border">{displayedItems.map((item, index) => (
        <li className="py-3" key={`${item.title}-${index}`}>
          {item.link ? <a className="font-semibold text-primary underline-offset-2 hover:underline" href={item.link} rel="noopener noreferrer" target="_blank">{item.title.replace(/<\/?b>/gi, "")}</a> : <span className="font-semibold">{item.title.replace(/<\/?b>/gi, "")}</span>}
        </li>
      ))}</ul> : null}
    </section>
  );
}
