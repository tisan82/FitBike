import { createClient } from "@supabase/supabase-js";

const SEARCH_TERMS = ["오토바이 정비", "오토바이 수리", "바이크 정비", "스쿠터 수리"];

const TARGETS = [
  ...[
    "종로구", "중구", "용산구", "성동구", "광진구", "동대문구", "중랑구", "성북구", "강북구", "도봉구",
    "노원구", "은평구", "서대문구", "마포구", "양천구", "강서구", "구로구", "금천구", "영등포구", "동작구",
    "관악구", "서초구", "강남구", "송파구", "강동구",
  ].map((name) => ({ sido: "서울특별시", searchArea: `서울 ${name}` })),
  ...[
    "수원시", "성남시", "의정부시", "안양시", "부천시", "광명시", "평택시", "동두천시", "안산시", "고양시",
    "과천시", "구리시", "남양주시", "오산시", "시흥시", "군포시", "의왕시", "하남시", "용인시", "파주시",
    "이천시", "안성시", "김포시", "화성시", "광주시", "양주시", "포천시", "여주시", "연천군", "가평군", "양평군",
  ].map((name) => ({ sido: "경기도", searchArea: `경기 ${name}` })),
  ...["중구", "동구", "미추홀구", "연수구", "남동구", "부평구", "계양구", "서구", "강화군", "옹진군"]
    .map((name) => ({ sido: "인천광역시", searchArea: `인천 ${name}` })),
];

type KakaoPlace = {
  id: string;
  place_name: string;
  category_name: string;
  address_name: string;
  road_address_name: string;
  phone: string;
  x: string;
  y: string;
  place_url: string;
};

type Region = {
  sidoName: string | null;
  sigunguName: string | null;
  subdistrictName: string | null;
  dongName: string | null;
};

function splitRegion2(value: string | null) {
  const parts = (value ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && /시$/.test(parts[0]) && /구$/.test(parts[1])) {
    return { sigunguName: parts[0], subdistrictName: parts[1] };
  }
  return { sigunguName: parts.join(" ") || null, subdistrictName: null };
}

function looksMotorcycleRelated(place: KakaoPlace) {
  const haystack = `${place.place_name} ${place.category_name}`;
  return /(오토바이|모터사이클|바이크|스쿠터|motorcycle|motorrad|moto)/i.test(haystack);
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const kakaoKey = process.env.KAKAO_REST_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!kakaoKey || !supabaseUrl || !serviceRoleKey) {
    return Response.json({ success: false, error: "MISSING_ENV" }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: checkpoint, error: checkpointError } = await supabase
    .from("22_service_shop_discovery_checkpoint")
    .select("checkpoint_id,target_index,cycle_no,last_status")
    .eq("checkpoint_id", 1)
    .single();
  if (checkpointError) throw checkpointError;

  if (checkpoint.last_status === "RUNNING") {
    return Response.json({ success: false, error: "BATCH_ALREADY_RUNNING" }, { status: 409 });
  }

  const targetIndex = Math.max(0, Math.min(Number(checkpoint.target_index ?? 0), TARGETS.length - 1));
  const target = TARGETS[targetIndex];
  const startedAt = new Date().toISOString();
  await supabase.from("22_service_shop_discovery_checkpoint").update({
    last_target: target.searchArea,
    last_started_at: startedAt,
    last_status: "RUNNING",
    last_error: null,
    updated_at: startedAt,
  }).eq("checkpoint_id", 1);

  async function kakao(path: string, params: Record<string, string | number>) {
    const url = new URL(`https://dapi.kakao.com${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const response = await fetch(url, { headers: { Authorization: `KakaoAK ${kakaoKey}` }, cache: "no-store" });
    if (!response.ok) throw new Error(`Kakao ${response.status}: ${await response.text()}`);
    return response.json();
  }

  async function resolveRegion(place: KakaoPlace): Promise<Region | null> {
    const query = place.road_address_name || place.address_name;
    if (!query) return null;
    const data = await kakao("/v2/local/search/address.json", { query, size: 1 });
    const doc = data.documents?.[0];
    const address = doc?.address;
    const road = doc?.road_address;
    if (!address && !road) return null;
    const region1 = address?.region_1depth_name || road?.region_1depth_name || null;
    const region2 = address?.region_2depth_name || road?.region_2depth_name || null;
    const region3 = address?.region_3depth_h_name || address?.region_3depth_name || road?.region_3depth_name || null;
    const { sigunguName, subdistrictName } = splitRegion2(region2);
    return { sidoName: region1, sigunguName, subdistrictName, dongName: region3 };
  }

  let inserted = 0;
  let updated = 0;
  let failed = 0;
  const seen = new Map<string, { place: KakaoPlace; query: string }>();

  try {
    for (const term of SEARCH_TERMS) {
      const query = `${target.searchArea} ${term}`;
      for (let page = 1; page <= 3; page += 1) {
        const data = await kakao("/v2/local/search/keyword.json", { query, size: 15, page });
        for (const place of (data.documents ?? []) as KakaoPlace[]) {
          if (!looksMotorcycleRelated(place)) continue;
          if (!seen.has(place.id)) seen.set(place.id, { place, query });
        }
        if (data.meta?.is_end) break;
      }
    }

    for (const { place, query } of seen.values()) {
      try {
        const region = await resolveRegion(place);
        const payload = {
          shop_name: place.place_name,
          address: place.address_name || place.road_address_name,
          road_address: place.road_address_name || null,
          latitude: Number(place.y),
          longitude: Number(place.x),
          phone: place.phone || null,
          source_type: "KAKAO_LOCAL",
          source_reference: place.id,
          kakao_place_id: place.id,
          kakao_place_url: place.place_url || null,
          kakao_category_name: place.category_name || null,
          discovery_query: query,
          discovered_at: new Date().toISOString(),
          is_active: true,
          sido_name: region?.sidoName ?? target.sido,
          sigungu_name: region?.sigunguName ?? null,
          subdistrict_name: region?.subdistrictName ?? null,
          dong_name: region?.dongName ?? null,
        };

        const { data: existing, error: findError } = await supabase
          .from("20_service_shop")
          .select("service_shop_id,verification_status")
          .eq("kakao_place_id", place.id)
          .maybeSingle();
        if (findError) throw findError;

        if (existing) {
          const update: Record<string, unknown> = { ...payload };
          if (existing.verification_status !== "VERIFIED") update.verification_status = "DISCOVERED";
          const { error } = await supabase.from("20_service_shop").update(update).eq("service_shop_id", existing.service_shop_id);
          if (error) throw error;
          updated += 1;
        } else {
          const { error } = await supabase.from("20_service_shop").insert({ ...payload, verification_status: "DISCOVERED" });
          if (error) throw error;
          inserted += 1;
        }
      } catch (error) {
        failed += 1;
        console.error("service-shop-candidate-failed", place.place_name, error);
      }
    }

    const nextIndex = (targetIndex + 1) % TARGETS.length;
    const nextCycle = nextIndex === 0 ? Number(checkpoint.cycle_no ?? 1) + 1 : Number(checkpoint.cycle_no ?? 1);
    const completedAt = new Date().toISOString();
    await supabase.from("22_service_shop_discovery_checkpoint").update({
      target_index: nextIndex,
      cycle_no: nextCycle,
      last_completed_at: completedAt,
      last_status: failed > 0 ? "PARTIAL" : "PASS",
      last_discovered: seen.size,
      last_inserted: inserted,
      last_updated: updated,
      last_failed: failed,
      last_error: null,
      updated_at: completedAt,
    }).eq("checkpoint_id", 1);

    return Response.json({
      success: true,
      cycle: Number(checkpoint.cycle_no ?? 1),
      target: target.searchArea,
      discovered: seen.size,
      inserted,
      updated,
      failed,
      nextTarget: TARGETS[nextIndex].searchArea,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.from("22_service_shop_discovery_checkpoint").update({
      last_status: "FAILED",
      last_failed: failed,
      last_error: message.slice(0, 1000),
      updated_at: new Date().toISOString(),
    }).eq("checkpoint_id", 1);
    return Response.json({ success: false, target: target.searchArea, error: message }, { status: 500 });
  }
}
