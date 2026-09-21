// 날씨 맵 — 내 주변 관광지 + 혼잡 예측 + 장소별 날씨.
// 공공데이터 일 1,000회 한도 때문에 원본 API는 여기서만 부르고 결과를 DB에 캐시한다.
// 앱은 이 함수만 호출한다.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 이 함수는 개발 중 자주 배포해서 단일 파일로 둔다 (_shared를 끌어오면 매번 같이 올려야 함)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

/** 로그인(게스트 포함) 사용자만 — AI 생성이 아니라 일일 한도는 두지 않는다 */
async function requireUser(req: Request): Promise<{ id: string }> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('인증 토큰이 없습니다.');
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error('유효하지 않은 인증입니다.');
  return { id: data.user.id };
}

const DATA_KEY = Deno.env.get('DATA_GO_KR_KEY') ?? '';
const KMA_KEY = Deno.env.get('KMA_API_KEY') ?? '';
const TOUR_BASE = 'https://apis.data.go.kr/B551011';
const KMA_BASE = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0';
const TOUR_COMMON = 'MobileOS=ETC&MobileApp=howweatheryou&_type=json';

// 캐시 수명 — 장소는 잘 안 변하고, 혼잡 예측은 하루 1회 갱신, 날씨는 발표 주기(3시간)
const PLACE_TTL_MS = 7 * 24 * 3600e3;
const CROWD_TTL_MS = 24 * 3600e3;
const WEATHER_TTL_MS = 3 * 3600e3;

// 한 요청에서 새로 수집할 상한 (할당량 보호)
const MAX_NEW_REGIONS = 2;
const MAX_CROWD_PAGES = 3;
const MAX_WEATHER_GRIDS = 10;

const pad2 = (n: number) => String(n).padStart(2, '0');
const kstNow = () => new Date(Date.now() + 9 * 3600e3);
const fmtDate = (d: Date) => `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`;

/** 이름 매칭용 정규화 — 공백·기호 제거, 소문자 (SEA LIFE 부산아쿠아리움 ↔ 씨라이프부산아쿠아리움 대비) */
const norm = (s: string) => s.toLowerCase().replace(/[\s·,.\-_()[\]{}'"!?&]/g, '');

/** 위경도 → 기상청 격자 (기상청 dfs_xy_conv 이식) */
function dfsXyConv(lat: number, lon: number): { nx: number; ny: number } {
  const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0, XO = 43, YO = 136;
  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID, slat1 = SLAT1 * DEGRAD, slat2 = SLAT2 * DEGRAD, olon = OLON * DEGRAD, olat = OLAT * DEGRAD;
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);
  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;
  return { nx: Math.floor(ra * Math.sin(theta) + XO + 0.5), ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5) };
}

/**
 * 단기예보 발표 기준 (02,05,08,11,14,17,20,23시 + 10분).
 * 23시 발표는 '오늘' 예보가 없고 내일부터라, 23:10~24:00엔 직전 20시 발표를 쓴다.
 * (그 시간대에 지도의 '오늘' 기온이 통째로 비던 문제)
 */
function vilageBase(): { base_date: string; base_time: string } {
  const kst = kstNow();
  const h = kst.getUTCHours(), m = kst.getUTCMinutes();
  for (const t of [23, 20, 17, 14, 11, 8, 5, 2]) {
    if (h > t || (h === t && m >= 10)) {
      return { base_date: fmtDate(kst), base_time: pad2(t === 23 ? 20 : t) + '00' };
    }
  }
  return { base_date: fmtDate(new Date(kst.getTime() - 86400e3)), base_time: '2000' };
}

function distanceM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000, dLat = ((bLat - aLat) * Math.PI) / 180, dLon = ((bLon - aLon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}

async function getJson(url: string, timeoutMs = 12000): Promise<any | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    const text = await res.text();
    try { return JSON.parse(text); } catch { return null; } // 오류는 XML로 옴
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const tourItems = (j: any): any[] => {
  if (j?.response?.header?.resultCode !== '0000') return [];
  const raw = j?.response?.body?.items?.item;
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
};

// ── 실내/실외 판정 (비·폭염일 때 추천 가산에 사용) ──────────────
// 문화시설(14)은 실내, 관광지(12)는 자연(A01)이면 실외로 본다.
function isIndoor(contentTypeId: string, cat1: string): boolean | null {
  if (contentTypeId === '14') return true;
  if (cat1 === 'A01') return false;
  return null;
}

function toPlaceRows(items: any[], fallbackType: string) {
  return items
    .filter((i) => i.mapx && i.mapy && i.lDongRegnCd && i.lDongSignguCd)
    .map((i) => {
      const pLat = Number(i.mapy), pLon = Number(i.mapx);
      const { nx, ny } = dfsXyConv(pLat, pLon);
      const typeId = String(i.contenttypeid ?? fallbackType);
      return {
        content_id: String(i.contentid),
        title: i.title,
        norm_title: norm(i.title),
        region_cd: `${i.lDongRegnCd}${i.lDongSignguCd}`,
        lat: pLat, lon: pLon, nx, ny,
        addr: i.addr1 ?? null,
        image_url: i.firstimage || null,
        content_type_id: typeId,
        cat1: i.cat1 ?? null, cat2: i.cat2 ?? null, cat3: i.cat3 ?? null,
        indoor: isIndoor(typeId, i.cat1 ?? ''),
        updated_at: new Date().toISOString(),
      };
    });
}

// ── 장소 수집 ────────────────────────────────────────────────
async function collectPlaces(lat: number, lon: number): Promise<void> {
  for (const contentTypeId of ['12', '14']) {
    const url = `${TOUR_BASE}/KorService2/locationBasedList2?serviceKey=${DATA_KEY}&${TOUR_COMMON}`
      + `&mapX=${lon}&mapY=${lat}&radius=20000&contentTypeId=${contentTypeId}&arrange=E&numOfRows=100&pageNo=1`;
    const items = tourItems(await getJson(url));
    if (items.length === 0) continue;
    const rows = toPlaceRows(items, contentTypeId);
    if (rows.length) await supabaseAdmin.from('tour_place').upsert(rows);
  }
}

/** 시군구 전체 장소 수집 — 혼잡도(집중률)가 시군구 단위라 목록을 맞춰야 매칭률이 오른다 */
async function collectPlacesByRegion(regionCd: string): Promise<number> {
  const regnCd = regionCd.slice(0, 2);
  const signguCd = regionCd.slice(2);
  let saved = 0;
  for (const contentTypeId of ['12', '14']) {
    for (let page = 1; page <= 3; page++) {
      const url = `${TOUR_BASE}/KorService2/areaBasedList2?serviceKey=${DATA_KEY}&${TOUR_COMMON}`
        + `&lDongRegnCd=${regnCd}&lDongSignguCd=${signguCd}&contentTypeId=${contentTypeId}`
        + `&numOfRows=100&pageNo=${page}&arrange=A`;
      const j = await getJson(url, 15000);
      const items = tourItems(j);
      if (items.length === 0) break;
      const rows = toPlaceRows(items, contentTypeId);
      if (rows.length) {
        await supabaseAdmin.from('tour_place').upsert(rows);
        saved += rows.length;
      }
      const total = j?.response?.body?.totalCount ?? 0;
      if (page * 100 >= total) break;
    }
  }
  await supabaseAdmin.from('tour_region').upsert({
    region_cd: regionCd, places_at: new Date().toISOString(), place_count: saved,
  });
  return saved;
}

// ── 집중률 수집 (시군구 단위, 30일치) ──────────────────────────
async function collectCrowd(regionCd: string): Promise<number> {
  const areaCd = regionCd.slice(0, 2);
  let saved = 0;
  for (let page = 1; page <= MAX_CROWD_PAGES; page++) {
    const url = `${TOUR_BASE}/TatsCnctrRateService/tatsCnctrRatedList?serviceKey=${DATA_KEY}&${TOUR_COMMON}`
      + `&areaCd=${areaCd}&signguCd=${regionCd}&numOfRows=1000&pageNo=${page}`;
    const j = await getJson(url, 15000);
    const items = tourItems(j);
    if (items.length === 0) break;
    const rows = items.map((i) => ({
      region_cd: regionCd, norm_name: norm(i.tAtsNm), ymd: i.baseYmd, rate: Number(i.cnctrRate),
    }));
    // 같은 관광지·날짜가 중복으로 오면 마지막 값만 남긴다 (upsert 충돌 방지)
    const dedup = new Map(rows.map((r) => [`${r.norm_name}|${r.ymd}`, r]));
    await supabaseAdmin.from('tour_crowd').upsert([...dedup.values()]);
    saved += dedup.size;
    const total = j?.response?.body?.totalCount ?? 0;
    if (page * 1000 >= total) break;
  }
  const meta = await getJson(
    `${TOUR_BASE}/TatsCnctrRateService/tatsCnctrRatedList?serviceKey=${DATA_KEY}&${TOUR_COMMON}&areaCd=${areaCd}&signguCd=${regionCd}&numOfRows=1&pageNo=1`,
  );
  const first = tourItems(meta)[0];
  await supabaseAdmin.from('tour_region').upsert({
    region_cd: regionCd,
    area_nm: first?.areaNm ?? null,
    signgu_nm: first?.signguNm ?? null,
    crowd_at: new Date().toISOString(),
    crowd_count: saved,
  });
  return saved;
}

// ── 격자 날씨 수집 ────────────────────────────────────────────
const skyFrom = (pty: string, sky: string): string => {
  if (pty === '1' || pty === '4' || pty === '5') return 'rain';
  if (pty === '2' || pty === '6') return 'rain';
  if (pty === '3' || pty === '7') return 'snow';
  return sky === '1' ? 'clear' : 'clouds';
};

async function collectWeather(nx: number, ny: number): Promise<void> {
  const { base_date, base_time } = vilageBase();
  const url = `${KMA_BASE}/getVilageFcst?serviceKey=${KMA_KEY}&dataType=JSON&numOfRows=1000&pageNo=1`
    + `&base_date=${base_date}&base_time=${base_time}&nx=${nx}&ny=${ny}`;
  const j = await getJson(url, 15000);
  const items = j?.response?.body?.items?.item;
  if (!Array.isArray(items)) return;

  const byDay = new Map<string, { tmps: number[]; pops: number[]; pty: string; sky: string; tmn?: number; tmx?: number; now?: number }>();
  const curHour = pad2(kstNow().getUTCHours()) + '00';
  for (const it of items) {
    const d = byDay.get(it.fcstDate) ?? { tmps: [], pops: [], pty: '0', sky: '1' };
    const v = it.fcstValue;
    if (it.category === 'TMP') {
      d.tmps.push(Number(v));
      if (it.fcstTime === curHour) d.now = Number(v);
    } else if (it.category === 'POP') d.pops.push(Number(v));
    else if (it.category === 'PTY' && v !== '0') d.pty = v;
    else if (it.category === 'SKY') d.sky = v;
    else if (it.category === 'TMN') d.tmn = Number(v);
    else if (it.category === 'TMX') d.tmx = Number(v);
    byDay.set(it.fcstDate, d);
  }

  const rows = [...byDay.entries()].map(([ymd, d]) => ({
    nx, ny, ymd,
    temp_min: d.tmn ?? (d.tmps.length ? Math.round(Math.min(...d.tmps)) : null),
    temp_max: d.tmx ?? (d.tmps.length ? Math.round(Math.max(...d.tmps)) : null),
    sky: skyFrom(d.pty, d.sky),
    pop: d.pops.length ? Math.max(...d.pops) : null,
    temp_now: d.now ?? null,
    fetched_at: new Date().toISOString(),
  }));
  if (rows.length) await supabaseAdmin.from('grid_weather').upsert(rows);
}

// ── 지역 목록 (시도/시군구) ─────────────────────────────────────
/** 처음 한 번만 관광공사 ldongCode2로 받아 region_code에 저장한다 (시도 17 + 시군구 250여 개) */
async function loadRegionCodes(): Promise<any[]> {
  const { data: cached } = await supabaseAdmin.from('region_code').select('*').order('region_cd');
  if (cached && cached.length > 100) return cached;

  const sido = tourItems(await getJson(
    `${TOUR_BASE}/KorService2/ldongCode2?serviceKey=${DATA_KEY}&${TOUR_COMMON}&numOfRows=50&pageNo=1`,
  ));
  const rows: any[] = [];
  for (const sd of sido) {
    const items = tourItems(await getJson(
      `${TOUR_BASE}/KorService2/ldongCode2?serviceKey=${DATA_KEY}&${TOUR_COMMON}&numOfRows=100&pageNo=1&lDongRegnCd=${sd.code}`,
    ));
    for (const sg of items) {
      rows.push({
        region_cd: `${sd.code}${sg.code}`,
        regn_cd: String(sd.code),
        regn_nm: sd.name,
        signgu_nm: sg.name,
        updated_at: new Date().toISOString(),
      });
    }
  }
  if (rows.length) await supabaseAdmin.from('region_code').upsert(rows);
  return rows.sort((a, b) => a.region_cd.localeCompare(b.region_cd));
}

/** 장소에 혼잡도·날씨를 붙여 응답 모양으로 만든다 (주변 모드/지역 모드 공용) */
async function attach(sorted: any[], regions: string[], ymd: string, now: number) {
  const { data: crowdRows } = await supabaseAdmin
    .from('tour_crowd').select('region_cd, norm_name, rate').in('region_cd', regions).eq('ymd', ymd);
  const crowdMap = new Map((crowdRows ?? []).map((c: any) => [`${c.region_cd}|${c.norm_name}`, Number(c.rate)]));
  const byRegion = new Map<string, { name: string; rate: number }[]>();
  for (const c of (crowdRows ?? []) as any[]) {
    const arr = byRegion.get(c.region_cd) ?? [];
    arr.push({ name: c.norm_name, rate: Number(c.rate) });
    byRegion.set(c.region_cd, arr);
  }
  // 정확히 안 맞으면 포함 관계로 한 번 더 찾는다 ('덕수궁' <-> '덕수궁 대한문')
  const crowdFor = (regionCd: string, normTitle: string): number | null => {
    const exact = crowdMap.get(`${regionCd}|${normTitle}`);
    if (exact !== undefined) return exact;
    if (normTitle.length < 4) return null;
    let best: { name: string; rate: number } | null = null;
    for (const c of byRegion.get(regionCd) ?? []) {
      if (c.name.length < 4) continue;
      if (!normTitle.includes(c.name) && !c.name.includes(normTitle)) continue;
      if (!best || c.name.length > best.name.length) best = c;
    }
    return best ? best.rate : null;
  };

  // 날씨 — 장소가 많이 몰린 격자부터 최대 N칸 (나머지는 앱이 가까운 값으로 채운다)
  const gridCount = new Map<string, number>();
  for (const p of sorted) gridCount.set(`${p.nx}:${p.ny}`, (gridCount.get(`${p.nx}:${p.ny}`) ?? 0) + 1);
  const grids = [...gridCount.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g).slice(0, MAX_WEATHER_GRIDS);
  const nxs = grids.map((g) => Number(g.split(':')[0]));
  const { data: wxRows } = await supabaseAdmin.from('grid_weather').select('*').eq('ymd', ymd).in('nx', nxs);
  const wxMap = new Map((wxRows ?? []).map((w: any) => [`${w.nx}:${w.ny}`, w]));
  for (const g of grids) {
    const w = wxMap.get(g);
    if (w && now - new Date(w.fetched_at).getTime() < WEATHER_TTL_MS) continue;
    const [nx, ny] = g.split(':').map(Number);
    await collectWeather(nx, ny);
  }
  const { data: wxFinal } = await supabaseAdmin.from('grid_weather').select('*').eq('ymd', ymd).in('nx', nxs);
  const wx = new Map((wxFinal ?? []).map((w: any) => [`${w.nx}:${w.ny}`, w]));

  return sorted.map((p: any) => {
    const w = wx.get(`${p.nx}:${p.ny}`);
    return {
      id: p.content_id,
      title: p.title,
      lat: p.lat, lon: p.lon,
      distanceM: p.distance_m,
      addr: p.addr,
      image: p.image_url,
      indoor: p.indoor,
      contentTypeId: p.content_type_id,
      crowdRate: crowdFor(p.region_cd, p.norm_title), // 0~100, 없으면 null
      weather: w ? { tempMin: w.temp_min, tempMax: w.temp_max, tempNow: w.temp_now, sky: w.sky, pop: w.pop } : null,
    };
  });
}

// ── 본체 ─────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    await requireUser(req);
    if (!DATA_KEY) return json({ error: 'DATA_GO_KR_KEY 미설정' }, 500);

    const body = await req.json();
    const ymd: string = /^\d{8}$/.test(body.ymd ?? '') ? body.ymd : fmtDate(kstNow());
    const now = Date.now();

    // ── 지역 목록 ──
    if (body.mode === 'regions') {
      const rows = await loadRegionCodes();
      const grouped = new Map<string, { regnCd: string; regnNm: string; list: { cd: string; nm: string }[] }>();
      for (const r of rows) {
        const g = grouped.get(r.regn_cd) ?? { regnCd: r.regn_cd, regnNm: r.regn_nm, list: [] };
        g.list.push({ cd: r.region_cd, nm: r.signgu_nm });
        grouped.set(r.regn_cd, g);
      }
      return json({ regions: [...grouped.values()] });
    }

    // ── 지역 모드: 고른 시군구의 장소 전체 ──
    if (body.mode === 'region') {
      const regionCd = String(body.regionCd ?? '');
      if (!/^\d{5}$/.test(regionCd)) return json({ error: 'regionCd 필요' }, 400);
      const { data: m } = await supabaseAdmin
        .from('tour_region').select('places_at, crowd_at').eq('region_cd', regionCd).maybeSingle();
      if (!m?.places_at || now - new Date(m.places_at).getTime() > PLACE_TTL_MS) await collectPlacesByRegion(regionCd);
      if (!m?.crowd_at || now - new Date(m.crowd_at).getTime() > CROWD_TTL_MS) await collectCrowd(regionCd);

      const { data: rows } = await supabaseAdmin.from('tour_place').select('*').eq('region_cd', regionCd).limit(300);
      const list = rows ?? [];
      if (list.length === 0) return json({ ymd, places: [], note: 'no places in region' });

      // 거리는 내 위치 기준(있으면), 정렬은 지역 중심에서 가까운 순
      const myLat = Number(body.lat), myLon = Number(body.lon);
      const hasMe = Number.isFinite(myLat) && Number.isFinite(myLon);
      const cLat = list.reduce((a: number, p: any) => a + p.lat, 0) / list.length;
      const cLon = list.reduce((a: number, p: any) => a + p.lon, 0) / list.length;
      const sorted = list
        .map((p: any) => ({
          ...p,
          distance_m: hasMe ? distanceM(myLat, myLon, p.lat, p.lon) : distanceM(cLat, cLon, p.lat, p.lon),
          _c: distanceM(cLat, cLon, p.lat, p.lon),
        }))
        .sort((a: any, b: any) => a._c - b._c)
        .slice(0, 120);
      const out = await attach(sorted, [regionCd], ymd, now);
      return json({
        ymd,
        center: { lat: cLat, lon: cLon },
        places: out,
        stats: { total: out.length, withCrowd: out.filter((p) => p.crowdRate !== null).length, regions: 1 },
      });
    }

    // ── 주변 모드 ──
    const lat = Number(body.lat), lon = Number(body.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return json({ error: 'lat/lon 필요' }, 400);

    // 1) 주변 장소 — 반드시 "거리순"으로 본다.
    //    네모 범위 + limit 만 쓰면 정렬이 없어 이미 쌓인 먼 지역(예: 서울) 데이터가 먼저 잡히고,
    //    "충분히 있다"고 판단해 정작 사용자 동네(예: 안양)를 수집하지 않는 문제가 있었다.
    const nearby = async () => {
      const { data } = await supabaseAdmin.rpc('nearby_places', { p_lat: lat, p_lon: lon, p_limit: 200 });
      return (data ?? []) as any[];
    };
    let places = await nearby();
    const closeCount = (rows: any[]) =>
      rows.filter((p) => distanceM(lat, lon, p.lat, p.lon) <= 15000).length;

    // 15km 안에 쓸 만큼 없으면 이 좌표 기준으로 새로 수집한다
    if (closeCount(places) < 8) {
      await collectPlaces(lat, lon);
      places = await nearby();
    }
    if (places.length === 0) return json({ places: [], note: 'no places nearby' });

    // 가까운 순으로 자르고, 그 장소들에 필요한 지역·격자만 채운다
    let sorted = places
      .map((p: any) => ({ ...p, distance_m: distanceM(lat, lon, p.lat, p.lon) }))
      .sort((a: any, b: any) => a.distance_m - b.distance_m)
      .slice(0, 60);

    // 2) 가까운 지역부터 장소 목록과 집중률을 채운다 (요청당 최대 2곳)
    //    장소를 시군구 전체로 받아야 집중률 목록과 겹쳐서 혼잡도가 붙는다.
    let regions = [...new Set(sorted.map((p: any) => p.region_cd))];
    const { data: regionRows } = await supabaseAdmin
      .from('tour_region').select('region_cd, crowd_at, places_at').in('region_cd', regions);
    const meta = new Map((regionRows ?? []).map((r: any) => [r.region_cd, r]));
    let filled = 0;
    let placesAdded = false;
    for (const rc of regions) {
      const m: any = meta.get(rc);
      const needPlaces = !m?.places_at || now - new Date(m.places_at).getTime() > PLACE_TTL_MS;
      const needCrowd = !m?.crowd_at || now - new Date(m.crowd_at).getTime() > CROWD_TTL_MS;
      if (!needPlaces && !needCrowd) continue;
      if (filled >= MAX_NEW_REGIONS) break;
      filled++;
      if (needPlaces) { await collectPlacesByRegion(rc as string); placesAdded = true; }
      if (needCrowd) await collectCrowd(rc as string);
    }
    if (placesAdded) {
      const r2 = { data: await nearby() };
      sorted = (r2.data ?? [])
        .map((p: any) => ({ ...p, distance_m: distanceM(lat, lon, p.lat, p.lon) }))
        .sort((a: any, b: any) => a.distance_m - b.distance_m)
        .slice(0, 60);
      regions = [...new Set(sorted.map((p: any) => p.region_cd))];
    }
    const out = await attach(sorted, regions as string[], ymd, now);

    return json({
      ymd,
      places: out,
      stats: { total: out.length, withCrowd: out.filter((p) => p.crowdRate !== null).length, regions: regions.length },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
});
