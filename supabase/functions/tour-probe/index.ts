// 관광 데이터 진단용 (임시). 관광공사 2종 + 서울 실시간 도시데이터가
// 실제로 어떤 모양·규모로 오는지 확인하고 설계를 정하기 위한 함수.
// 확인이 끝나면 비활성화한다.

const DATA_KEY = Deno.env.get('DATA_GO_KR_KEY') ?? '';
const SEOUL_KEY = Deno.env.get('SEOUL_CITYDATA_KEY') ?? '';

const TOUR_BASE = 'https://apis.data.go.kr/B551011';
const COMMON = 'MobileOS=ETC&MobileApp=howweatheryou&_type=json';

const cut = (s: string, n = 400) => s.slice(0, n);

async function getJson(url: string, timeoutMs = 12000): Promise<{ ok: boolean; status: number; body: unknown; raw?: string }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    const text = await res.text();
    try {
      return { ok: res.ok, status: res.status, body: JSON.parse(text) };
    } catch {
      // data.go.kr은 키/파라미터 오류를 XML로 돌려준다 → 원문 일부를 그대로 본다
      return { ok: false, status: res.status, body: null, raw: cut(text) };
    }
  } catch (e) {
    return { ok: false, status: 0, body: null, raw: String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/** Decoding/Encoding 키 어느 쪽이 들어 있어도 되도록 두 형태를 모두 시도 */
async function callTour(path: string, params: string) {
  const forms: { form: string; key: string }[] = [
    { form: 'as-is', key: DATA_KEY },
    { form: 'encoded', key: encodeURIComponent(DATA_KEY) },
  ];
  for (const { form, key } of forms) {
    const url = `${TOUR_BASE}/${path}?serviceKey=${key}&${COMMON}&${params}`;
    const r = await getJson(url);
    const header = (r.body as any)?.response?.header;
    if (r.ok && header?.resultCode === '0000') return { form, ...r };
    // 마지막 시도면 실패 내용을 그대로 돌려준다
    if (form === 'encoded') {
      return { form, ...r, headerMsg: header?.resultMsg ?? null };
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  const out: Record<string, unknown> = {
    keys: { dataGoKr: DATA_KEY ? `set(${DATA_KEY.length}자)` : 'MISSING', seoul: SEOUL_KEY ? `set(${SEOUL_KEY.length}자)` : 'MISSING' },
  };

  const url = new URL(req.url);
  const only = url.searchParams.get('only');

  // 1) 관광지 목록 (국문 관광정보 서비스) — 전국 관광지(contentTypeId=12) 총 개수
  if (!only || only === 'tour') {
    const r = await callTour('KorService2/areaBasedList2', 'numOfRows=3&pageNo=1&contentTypeId=12&arrange=A');
    const b = (r?.body as any)?.response?.body;
    out.korService2 = {
      keyForm: r?.form,
      status: r?.status,
      totalCount: b?.totalCount ?? null,
      sample: (b?.items?.item ?? []).map((i: any) => ({
        title: i.title, mapx: i.mapx, mapy: i.mapy, areaCode: i.areacode, sigungu: i.sigungucode, img: !!i.firstimage,
      })),
      error: (r as any)?.headerMsg ?? r?.raw ?? null,
    };
  }

  // 2) 관광지 집중률 예측 — 관광지별 향후 30일
  if (!only || only === 'rate') {
    const r = await callTour('TatsCnctrRateService/tatsCnctrRatedList', 'numOfRows=5&pageNo=1');
    const b = (r?.body as any)?.response?.body;
    out.concentration = {
      keyForm: r?.form,
      status: r?.status,
      totalCount: b?.totalCount ?? null,
      sample: (b?.items?.item ?? []).slice(0, 5),
      error: (r as any)?.headerMsg ?? r?.raw ?? null,
      rawDump: url.searchParams.get('debug') ? cut(JSON.stringify(r?.body ?? r?.raw ?? null), 1800) : undefined,
    };
  }

  // 3) 서울 실시간 도시데이터 — 장소 1곳 (혼잡도/날씨 필드 확인)
  if (!only || only === 'seoul') {
    const place = url.searchParams.get('place') ?? '광화문·덕수궁';
    const sUrl = `http://openapi.seoul.go.kr:8088/${SEOUL_KEY}/json/citydata/1/1/${encodeURIComponent(place)}`;
    const r = await getJson(sUrl, 15000);
    const city = (r.body as any)?.['CITYDATA'];
    const ppltn = city?.LIVE_PPLTN_STTS?.[0];
    const wx = city?.WEATHER_STTS?.[0];
    out.seoulCityData = {
      status: r.status,
      place: city?.AREA_NM ?? null,
      congestion: ppltn ? { level: ppltn.AREA_CONGEST_LVL, msg: ppltn.AREA_CONGEST_MSG, min: ppltn.AREA_PPLTN_MIN, max: ppltn.AREA_PPLTN_MAX, time: ppltn.PPLTN_TIME, forecastCount: ppltn.FCST_PPLTN?.length ?? 0 } : null,
      weather: wx ? { temp: wx.TEMP, sky: wx.SKY_STTS, pm10: wx.PM10, pcpMsg: wx.PCP_MSG } : null,
      error: city ? null : (r.raw ?? cut(JSON.stringify(r.body ?? {}))),
    };
  }

  return new Response(JSON.stringify(out, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
});
