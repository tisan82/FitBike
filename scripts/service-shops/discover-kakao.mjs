import { createClient } from "@supabase/supabase-js";

const kakaoKey = process.env.KAKAO_REST_API_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!kakaoKey || !supabaseUrl || !serviceRoleKey) {
  throw new Error("KAKAO_REST_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY are required.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SEARCH_TERMS = ["오토바이 정비", "오토바이 수리", "바이크 정비", "스쿠터 수리"];

const AREAS = {
  seoul: [
    "종로구", "중구", "용산구", "성동구", "광진구", "동대문구", "중랑구", "성북구", "강북구", "도봉구",
    "노원구", "은평구", "서대문구", "마포구", "양천구", "강서구", "구로구", "금천구", "영등포구", "동작구",
    "관악구", "서초구", "강남구", "송파구", "강동구",
  ].map((name) => ({ sido: "서울특별시", searchArea: `서울 ${name}` })),
  incheon: ["중구", "동구", "미추홀구", "연수구", "남동구", "부평구", "계양구", "서구", "강화군", "옹진군"]
    .map((name) => ({ sido: "인천광역시", searchArea: `인천 ${name}` })),
  gyeonggi: [
    "수원시", "성남시", "의정부시", "안양시", "부천시", "광명시", "평택시", "동두천시", "안산시", "고양시",
    "과천시", "구리시", "남양주시", "오산시", "시흥시", "군포시", "의왕시", "하남시", "용인시", "파주시",
    "이천시", "안성시", "김포시", "화성시", "광주시", "양주시", "포천시", "여주시", "연천군", "가평군", "양평군",
  ].map((name) => ({ sido: "경기도", searchArea: `경기 ${name}` })),
};

function arg(name, fallback = null) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

const scope = arg("scope", "all");
const dryRun = process.argv.includes("--dry-run");
const targets = scope === "all" ? [...AREAS.seoul, ...AREAS.gyeonggi, ...AREAS.incheon] : AREAS[scope];
if (!targets) throw new Error(`Unknown scope: ${scope}`);

async function kakao(path, params) {
  const url = new URL(`https://dapi.kakao.com${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const response = await fetch(url, { headers: { Authorization: `KakaoAK ${kakaoKey}` } });
  if (!response.ok) throw new Error(`Kakao ${response.status}: ${await response.text()}`);
  return response.json();
}

async function keywordSearch(query) {
  const results = [];
  for (let page = 1; page <= 3; page += 1) {
    const data = await kakao("/v2/local/search/keyword.json", { query, size: 15, page });
    results.push(...(data.documents ?? []));
    if (data.meta?.is_end) break;
  }
  return results;
}

function splitRegion2(value) {
  const parts = (value ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && /시$/.test(parts[0]) && /구$/.test(parts[1])) {
    return { sigunguName: parts[0], subdistrictName: parts[1] };
  }
  return { sigunguName: parts.join(" ") || null, subdistrictName: null };
}

async function resolveRegion(place) {
  const query = place.road_address_name || place.address_name;
  const data = await kakao("/v2/local/search/address.json", { query, size: 1 });
  const doc = data.documents?.[0];
  const address = doc?.address;
  const road = doc?.road_address;
  if (!address && !road) return null;
  const region1 = address?.region_1depth_name || road?.region_1depth_name || null;
  const region2 = address?.region_2depth_name || road?.region_2depth_name || null;
  const region3 = address?.region_3depth_h_name || address?.region_3depth_name || road?.region_3depth_name || null;
  const { sigunguName, subdistrictName } = splitRegion2(region2);
  return {
    sidoName: region1,
    sigunguName,
    subdistrictName,
    dongName: region3,
  };
}

function looksMotorcycleRelated(place) {
  const haystack = `${place.place_name} ${place.category_name}`.toLowerCase();
  return /(오토바이|모터사이클|바이크|스쿠터|motorcycle|motorrad|moto)/i.test(haystack);
}

async function upsertCandidate(place, region, discoveryQuery) {
  const payload = {
    shop_name: place.place_name,
    address: place.address_name || place.road_address_name,
    road_address: place.road_address_name || null,
    latitude: Number(place.y),
    longitude: Number(place.x),
    phone: place.phone || null,
    naver_place_url: null,
    website_url: null,
    source_type: "KAKAO_LOCAL",
    source_reference: place.id,
    kakao_place_id: place.id,
    kakao_place_url: place.place_url || null,
    kakao_category_name: place.category_name || null,
    discovery_query: discoveryQuery,
    discovered_at: new Date().toISOString(),
    verification_status: "DISCOVERED",
    is_active: true,
    sido_name: region?.sidoName ?? null,
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
    const update = { ...payload };
    if (existing.verification_status === "VERIFIED") delete update.verification_status;
    const { error } = await supabase.from("20_service_shop").update(update).eq("service_shop_id", existing.service_shop_id);
    if (error) throw error;
    return "updated";
  }

  const { error } = await supabase.from("20_service_shop").insert(payload);
  if (error) throw error;
  return "inserted";
}

const seen = new Map();
for (const target of targets) {
  for (const term of SEARCH_TERMS) {
    const query = `${target.searchArea} ${term}`;
    const places = await keywordSearch(query);
    for (const place of places) {
      if (!looksMotorcycleRelated(place)) continue;
      if (!seen.has(place.id)) seen.set(place.id, { place, query });
    }
  }
}

let inserted = 0;
let updated = 0;
let failed = 0;
for (const { place, query } of seen.values()) {
  try {
    const region = await resolveRegion(place);
    if (dryRun) {
      console.log(JSON.stringify({ id: place.id, name: place.place_name, region, query }));
      continue;
    }
    const result = await upsertCandidate(place, region, query);
    if (result === "inserted") inserted += 1;
    else updated += 1;
  } catch (error) {
    failed += 1;
    console.error(place.place_name, error);
  }
}

console.log(JSON.stringify({ scope, discovered: seen.size, inserted, updated, failed, dryRun }, null, 2));
