const SEOUL_DISTRICTS = new Set([
  "종로구", "중구", "용산구", "성동구", "광진구", "동대문구", "중랑구", "성북구", "강북구", "도봉구",
  "노원구", "은평구", "서대문구", "마포구", "양천구", "강서구", "구로구", "금천구", "영등포구", "동작구",
  "관악구", "서초구", "강남구", "송파구", "강동구",
]);

type NaverItem = { title?: string; link?: string };

export async function GET(request: Request) {
  const district = new URL(request.url).searchParams.get("district") ?? "";
  if (!SEOUL_DISTRICTS.has(district)) {
    return Response.json({ error: "INVALID_DISTRICT" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const clientId = process.env.NAVER_SEARCH_CLIENT_ID;
  const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return Response.json({ error: "SEARCH_NOT_CONFIGURED" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const url = new URL("https://naverapihub.apigw.ntruss.com/search/v1/local");
  url.searchParams.set("query", `서울 ${district} 오토바이 정비`);
  url.searchParams.set("display", "5");
  url.searchParams.set("start", "1");
  url.searchParams.set("format", "json");

  try {
    const response = await fetch(url, {
      headers: { "X-NCP-APIGW-API-KEY-ID": clientId, "X-NCP-APIGW-API-KEY": clientSecret },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return Response.json({ error: response.status === 401 || response.status === 403 || response.status === 429 ? "SEARCH_UNAVAILABLE" : "SEARCH_FAILED" }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
    const data = await response.json() as { items?: NaverItem[] };
    const items = (data.items ?? []).slice(0, 5).map((item) => ({
      title: item.title ?? "",
      link: item.link && /^https?:\/\//.test(item.link) ? item.link : null,
    }));
    return Response.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "SEARCH_FAILED" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
