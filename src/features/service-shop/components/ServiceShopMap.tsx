"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { ServiceShop } from "@/features/service-shop/types/service-shop.types";

type Props = {
  shops: ServiceShop[];
  naverMapClientId: string | null;
};

type Coordinates = { lat: number; lng: number };
type ResolvedShop = ServiceShop & Coordinates & { distanceKm: number | null };

type NaverLatLng = object;
type NaverMap = { setCenter(position: NaverLatLng): void; setZoom(zoom: number): void };
type NaverMarker = { setMap(map: NaverMap | null): void };
type NaverInfoWindow = { open(map: NaverMap, marker: NaverMarker): void; close(): void };
type GeocodeResponse = { v2?: { addresses?: Array<{ x: string; y: string }> } };
type NaverNamespace = {
  maps: {
    Map: new (element: HTMLElement, options: { center: NaverLatLng; zoom: number }) => NaverMap;
    LatLng: new (lat: number, lng: number) => NaverLatLng;
    Marker: new (options: { position: NaverLatLng; map: NaverMap; title?: string }) => NaverMarker;
    InfoWindow: new (options: { content: string }) => NaverInfoWindow;
    Event: { addListener(target: NaverMarker, eventName: string, handler: () => void): void };
    Service: {
      Status: { OK: string };
      geocode(options: { query: string }, callback: (status: string, response: GeocodeResponse) => void): void;
    };
  };
};

function getNaver(): NaverNamespace | null {
  return (window as Window & { naver?: NaverNamespace }).naver ?? null;
}

function distanceKm(from: Coordinates, to: Coordinates) {
  const r = 6371;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((from.lat * Math.PI) / 180) * Math.cos((to.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function serviceLabel(value: string) {
  const labels: Record<string, string> = {
    TIRE: "타이어",
    BATTERY: "배터리",
    BRAKE: "브레이크",
    ENGINE_OIL: "엔진오일",
    CHAIN: "체인",
    COOLANT: "냉각수",
    GENERAL_REPAIR: "일반정비",
  };
  return labels[value] ?? value;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function unique(values: Array<string | null>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "ko"));
}

function geocode(naverApi: NaverNamespace, query: string): Promise<Coordinates | null> {
  return new Promise((resolve) => {
    naverApi.maps.Service.geocode({ query }, (status, response) => {
      if (status !== naverApi.maps.Service.Status.OK) return resolve(null);
      const first = response.v2?.addresses?.[0];
      if (!first) return resolve(null);
      const lat = Number(first.y);
      const lng = Number(first.x);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return resolve(null);
      resolve({ lat, lng });
    });
  });
}

export function ServiceShopMap({ shops, naverMapClientId }: Props) {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const [resolvedShops, setResolvedShops] = useState<ResolvedShop[]>([]);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [selectedShopId, setSelectedShopId] = useState<number | null>(null);
  const [locationMessage, setLocationMessage] = useState("내 위치를 허용하면 가까운 정비소부터 보여드려요.");
  const [sido, setSido] = useState("");
  const [sigungu, setSigungu] = useState("");
  const [subdistrict, setSubdistrict] = useState("");
  const [dong, setDong] = useState("");

  const sidoOptions = useMemo(() => unique(shops.map((shop) => shop.sidoName)), [shops]);
  const sigunguOptions = useMemo(() => unique(shops.filter((shop) => !sido || shop.sidoName === sido).map((shop) => shop.sigunguName)), [shops, sido]);
  const subdistrictOptions = useMemo(() => unique(shops.filter((shop) => (!sido || shop.sidoName === sido) && (!sigungu || shop.sigunguName === sigungu)).map((shop) => shop.subdistrictName)), [shops, sido, sigungu]);
  const dongOptions = useMemo(() => unique(shops.filter((shop) => (!sido || shop.sidoName === sido) && (!sigungu || shop.sigunguName === sigungu) && (!subdistrict || shop.subdistrictName === subdistrict)).map((shop) => shop.dongName)), [shops, sido, sigungu, subdistrict]);

  const filteredBaseShops = useMemo(() => shops.filter((shop) =>
    (!sido || shop.sidoName === sido) &&
    (!sigungu || shop.sigunguName === sigungu) &&
    (!subdistrict || shop.subdistrictName === subdistrict) &&
    (!dong || shop.dongName === dong)
  ), [shops, sido, sigungu, subdistrict, dong]);

  useEffect(() => {
    if (!naverMapClientId) return;
    if (getNaver()) {
      setMapReady(true);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>("script[data-fitbike-naver-map]");
    if (existing) {
      existing.addEventListener("load", () => setMapReady(true), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.async = true;
    script.dataset.fitbikeNaverMap = "true";
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(naverMapClientId)}&submodules=geocoder`;
    script.addEventListener("load", () => setMapReady(true), { once: true });
    document.head.appendChild(script);
  }, [naverMapClientId]);

  useEffect(() => {
    if (!mapReady || !mapElementRef.current) return;
    const candidate = getNaver();
    if (!candidate) return;
    const naverApi: NaverNamespace = candidate;
    let cancelled = false;
    const markers: NaverMarker[] = [];
    const infoWindows: NaverInfoWindow[] = [];
    const map = new naverApi.maps.Map(mapElementRef.current, { center: new naverApi.maps.LatLng(37.5665, 126.978), zoom: 11 });

    async function resolveAndDraw() {
      const candidateShops = await Promise.all(filteredBaseShops.map(async (shop): Promise<ResolvedShop | null> => {
        const coordinates = shop.latitude !== null && shop.longitude !== null ? { lat: shop.latitude, lng: shop.longitude } : await geocode(naverApi, shop.roadAddress ?? shop.address);
        if (!coordinates) return null;
        return { ...shop, ...coordinates, distanceKm: userLocation ? distanceKm(userLocation, coordinates) : null };
      }));
      if (cancelled) return;
      const available = candidateShops.filter((shop): shop is ResolvedShop => shop !== null).sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
      setResolvedShops(available);
      for (const shop of available) {
        const marker = new naverApi.maps.Marker({ map, position: new naverApi.maps.LatLng(shop.lat, shop.lng), title: shop.shopName });
        const info = new naverApi.maps.InfoWindow({ content: `<div style="padding:10px 12px;min-width:150px;font-size:13px"><strong>${escapeHtml(shop.shopName)}</strong><br/><span>${escapeHtml(shop.roadAddress ?? shop.address)}</span></div>` });
        naverApi.maps.Event.addListener(marker, "click", () => {
          infoWindows.forEach((item) => item.close());
          info.open(map, marker);
          setSelectedShopId(shop.serviceShopId);
        });
        markers.push(marker);
        infoWindows.push(info);
      }
    }
    void resolveAndDraw();
    return () => {
      cancelled = true;
      markers.forEach((marker) => marker.setMap(null));
      infoWindows.forEach((info) => info.close());
    };
  }, [mapReady, filteredBaseShops, userLocation]);

  const visibleShops = useMemo(() => {
    if (naverMapClientId && resolvedShops.length > 0) return resolvedShops;
    return filteredBaseShops.map((shop): ResolvedShop => ({ ...shop, lat: shop.latitude ?? 0, lng: shop.longitude ?? 0, distanceKm: userLocation && shop.latitude !== null && shop.longitude !== null ? distanceKm(userLocation, { lat: shop.latitude, lng: shop.longitude }) : null }))
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  }, [filteredBaseShops, naverMapClientId, resolvedShops, userLocation]);

  function requestLocation() {
    if (!navigator.geolocation) {
      setLocationMessage("이 기기에서는 위치 정보를 사용할 수 없습니다.");
      return;
    }
    setLocationMessage("현재 위치를 확인하고 있어요.");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocationMessage("현재 위치에서 가까운 순서로 정렬했습니다.");
      },
      () => setLocationMessage("위치 권한이 없어 선택한 지역의 정비소를 기본 순서로 보여드립니다."),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
        <div className="flex items-start justify-between gap-4 p-4 sm:p-5">
          <div>
            <h2 className="text-lg font-bold">내 주변 오토바이 정비소</h2>
            <p className="mt-1 text-sm leading-6 text-foreground-secondary">{locationMessage}</p>
          </div>
          <button className="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white" onClick={requestLocation} type="button">내 위치</button>
        </div>
        {naverMapClientId ? <div className="h-[360px] w-full bg-surface-secondary sm:h-[460px]" ref={mapElementRef} /> : <div className="flex h-44 items-center justify-center bg-surface-secondary px-6 text-center text-sm leading-6 text-foreground-secondary">네이버 지도 Client ID 설정 후 지도가 표시됩니다. 지역별 정비소 목록은 지금도 확인할 수 있습니다.</div>}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select aria-label="시도" className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm" value={sido} onChange={(event) => { setSido(event.target.value); setSigungu(""); setSubdistrict(""); setDong(""); }}>
            <option value="">시·도 전체</option>{sidoOptions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select aria-label="시군구" className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm" value={sigungu} onChange={(event) => { setSigungu(event.target.value); setSubdistrict(""); setDong(""); }}>
            <option value="">시·군·구 전체</option>{sigunguOptions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select aria-label="하위 구" className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm" disabled={subdistrictOptions.length === 0} value={subdistrict} onChange={(event) => { setSubdistrict(event.target.value); setDong(""); }}>
            <option value="">구 전체</option>{subdistrictOptions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select aria-label="동" className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm" disabled={dongOptions.length === 0} value={dong} onChange={(event) => setDong(event.target.value)}>
            <option value="">동 전체</option>{dongOptions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
        <p className="mt-2 text-xs leading-5 text-foreground-secondary">지역 데이터는 시·도 → 시/군/구 → 하위 구 → 동 순으로 관리합니다. 예: 경기도 → 안산시 → 상록구 → 본오동.</p>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div><p className="text-sm font-bold text-primary">VERIFIED SHOPS</p><h2 className="mt-1 text-xl font-bold">정비소 {visibleShops.length}곳</h2></div>
          <p className="text-xs text-foreground-secondary">정보는 방문 전 업체에 재확인하세요.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {visibleShops.map((shop) => (
            <article className={`rounded-2xl border bg-surface p-4 shadow-sm ${selectedShopId === shop.serviceShopId ? "border-primary ring-2 ring-selected-background" : "border-border"}`} id={`shop-${shop.serviceShopId}`} key={shop.serviceShopId}>
              <div className="flex items-start justify-between gap-3">
                <div><h3 className="text-lg font-bold">{shop.shopName}</h3><p className="mt-1 text-sm leading-6 text-foreground-secondary">{shop.roadAddress ?? shop.address}</p></div>
                {shop.distanceKm !== null ? <span className="shrink-0 text-sm font-bold text-primary">{shop.distanceKm.toFixed(1)}km</span> : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">{shop.services.map((service) => <span className="rounded-full bg-surface-secondary px-2.5 py-1 text-xs font-semibold" key={service}>{serviceLabel(service)}</span>)}</div>
              {shop.externalRating !== null ? <p className="mt-4 text-sm font-semibold">외부 공개 평점 {shop.externalRating.toFixed(1)} · 후기 {shop.externalReviewCount}건</p> : null}
              {shop.reviewSummary ? <p className="mt-2 text-sm leading-6 text-foreground-secondary">{shop.reviewSummary}</p> : null}
              <div className="mt-4 flex gap-2">
                {shop.phone ? <a className="flex-1 rounded-xl border border-border px-3 py-2.5 text-center text-sm font-bold" href={`tel:${shop.phone}`}>전화</a> : null}
                <a className="flex-1 rounded-xl bg-primary px-3 py-2.5 text-center text-sm font-bold text-white" href={`https://map.naver.com/p/search/${encodeURIComponent(shop.shopName)}`} rel="noopener noreferrer" target="_blank">네이버 지도</a>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
