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
const SEOUL_KEY = Deno.env.get('SEOUL_CITYDATA_KEY') ?? '';
const TOUR_BASE = 'https://apis.data.go.kr/B551011';
const KMA_BASE = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0';
const TOUR_COMMON = 'MobileOS=ETC&MobileApp=howweatheryou&_type=json';

// 캐시 수명 — 장소는 잘 안 변하고, 혼잡 예측은 하루 1회 갱신, 날씨는 발표 주기(3시간)
const PLACE_TTL_MS = 7 * 24 * 3600e3;
const CROWD_TTL_MS = 24 * 3600e3;
const WEATHER_TTL_MS = 3 * 3600e3;
const LIVE_TTL_MS = 10 * 60e3; // 서울 실시간 인구는 5분마다 갱신된다

// 한 요청에서 새로 수집할 상한 (할당량 보호)
const MAX_NEW_REGIONS = 2;
const MAX_CROWD_PAGES = 3;
const MAX_WEATHER_GRIDS = 10;
const MAX_LIVE_AREAS = 15;
const MAX_LOOKUPS = 20; // 지역당 누락 장소 검색 상한

const pad2 = (n: number) => String(n).padStart(2, '0');
const kstNow = () => new Date(Date.now() + 9 * 3600e3);
const fmtDate = (d: Date) => `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`;

/** 이름 매칭용 정규화 — 공백·기호 제거, 소문자 (SEA LIFE 부산아쿠아리움 ↔ 씨라이프부산아쿠아리움 대비) */
const norm = (s: string) => s.toLowerCase().replace(/[\s·,.\-_()[\]{}'"!?&]/g, '');
/** 괄호 속 지역명·부가설명을 뺀 이름 ('충렬사(부산)' → '충렬사', '종묘 [유네스코 세계유산]' → '종묘') */
const baseName = (s: string) => norm(s.replace(/\([^)]*\)|\[[^\]]*\]/g, ' '));

/**
 * 이름 매칭 점수 (0 = 다른 곳). 같으면 가장 높고, 그다음은 긴 이름끼리의 포함 관계.
 * - 3글자는 앞부분이 같을 때만 ('창덕궁' ↔ '창덕궁과 후원')
 * - '역'으로 끝나는 짧은 이름은 정확히 같을 때만 ('서울역' ↔ '서울역사박물관'은 다른 곳)
 */
function nameScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1000 + a.length;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.endsWith('역')) return 0;
  if (short.length >= 4 && long.includes(short)) return short.length;
  if (short.length === 3 && long.startsWith(short)) return short.length;
  return 0;
}

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
  const rawNames = new Set<string>();
  for (let page = 1; page <= MAX_CROWD_PAGES; page++) {
    const url = `${TOUR_BASE}/TatsCnctrRateService/tatsCnctrRatedList?serviceKey=${DATA_KEY}&${TOUR_COMMON}`
      + `&areaCd=${areaCd}&signguCd=${regionCd}&numOfRows=1000&pageNo=${page}`;
    const j = await getJson(url, 15000);
    const items = tourItems(j);
    if (items.length === 0) break;
    const rows = items.map((i) => ({
      region_cd: regionCd, norm_name: norm(i.tAtsNm), base_name: baseName(i.tAtsNm),
      ymd: i.baseYmd, rate: Number(i.cnctrRate),
    }));
    for (const i of items) rawNames.add(i.tAtsNm);
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
  // 응답을 늦추지 않도록 뒤에서 처리 — 다음 조회부터 반영된다
  background(fillCrowdPlaces(regionCd, [...rawNames]));
  return saved;
}

/** 응답을 보낸 뒤에도 이어서 실행 (Supabase Edge Runtime) */
function background(p: Promise<unknown>): void {
  const safe = p.catch(() => {});
  (globalThis as any).EdgeRuntime?.waitUntil?.(safe);
}

/**
 * 혼잡 예측 목록엔 있는데 장소 목록(관광지·문화시설)에 없는 곳 — 전통시장 등 — 을
 * 관광공사 키워드 검색으로 찾아 장소로 추가한다. 회색(혼잡 모름) 마커를 줄이기 위함.
 * 한 번 찾아본 이름은 crowd_lookup에 남겨 다시 검색하지 않는다.
 */
async function fillCrowdPlaces(regionCd: string, rawNames: string[]): Promise<void> {
  const [{ data: places }, { data: looked }] = await Promise.all([
    supabaseAdmin.from('tour_place').select('title, norm_title').eq('region_cd', regionCd),
    supabaseAdmin.from('crowd_lookup').select('norm_name').eq('region_cd', regionCd),
  ]);
  const done = new Set((looked ?? []).map((l: any) => l.norm_name));
  const have = (places ?? []).map((p: any) => [p.norm_title, baseName(p.title)]);
  const missing = rawNames
    .filter((n) => !done.has(norm(n)))
    .filter((n) => !have.some(([t, b]) => nameScore(t, norm(n)) > 0 || nameScore(b, baseName(n)) > 0))
    .slice(0, MAX_LOOKUPS);
  if (missing.length === 0) return;

  const regnCd = regionCd.slice(0, 2), signguCd = regionCd.slice(2);
  const ALLOWED = new Set(['12', '14', '28', '38']); // 관광지·문화시설·레포츠·쇼핑(시장) — 숙박·음식점 제외
  for (let i = 0; i < missing.length; i += 5) {
    await Promise.all(missing.slice(i, i + 5).map(async (name) => {
      const keyword = encodeURIComponent(name.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').trim());
      const items = tourItems(await getJson(
        `${TOUR_BASE}/KorService2/searchKeyword2?serviceKey=${DATA_KEY}&${TOUR_COMMON}`
          + `&keyword=${keyword}&lDongRegnCd=${regnCd}&lDongSignguCd=${signguCd}&numOfRows=10&pageNo=1&arrange=A`,
      ));
      let best: any = null, bestScore = 0;
      for (const it of items) {
        if (!ALLOWED.has(String(it.contenttypeid))) continue;
        const sc = Math.max(nameScore(norm(it.title), norm(name)), nameScore(baseName(it.title), baseName(name)));
        if (sc > bestScore) { best = it; bestScore = sc; }
      }
      const rows = best ? toPlaceRows([best], String(best.contenttypeid)) : [];
      if (rows.length) await supabaseAdmin.from('tour_place').upsert(rows);
      await supabaseAdmin.from('crowd_lookup').upsert({
        region_cd: regionCd, norm_name: norm(name), content_id: rows[0]?.content_id ?? null,
        looked_at: new Date().toISOString(),
      });
    }));
  }
}

// ── 서울 실시간 도시데이터 (121곳, 5분 갱신) ────────────────────
// 혼잡 단계 → 0~100 (앱의 한산<50 / 보통<80 / 붐빔 기준에 맞춤)
const LIVE_RATE: Record<string, number> = { '여유': 30, '보통': 65, '약간 붐빔': 85, '붐빔': 95 };

/**
 * '광화문·덕수궁' → ['광화문','덕수궁'], 'DDP(동대문디자인플라자)' → ['ddp','동대문디자인플라자'],
 * '광장(전통)시장' → ['광장시장']
 */
function areaTokens(areaNm: string): string[] {
  return areaNm
    .replace('관광특구', '')
    .replace(/\(\d+호선\)/g, '')
    .replace(/\([^)]*\)(?=.)/g, '') // 가운데 괄호는 빼고 잇는다
    .replace(/\(([^)]*)\)$/, '·$1') // 끝 괄호는 다른 이름
    .split('·')
    .map(norm)
    .filter((t) => t.length >= 2);
}

async function fetchSeoulArea(areaCd: string): Promise<{ lvl: string; time: string | null } | null> {
  if (!SEOUL_KEY) return null;
  const j = await getJson(`http://openapi.seoul.go.kr:8088/${SEOUL_KEY}/json/citydata_ppltn/1/5/${areaCd}`, 8000);
  const row = j?.['SeoulRtd.citydata_ppltn']?.[0];
  return row?.AREA_CONGEST_LVL ? { lvl: row.AREA_CONGEST_LVL, time: row.PPLTN_TIME ?? null } : null;
}

/** 서울 장소 중 실시간 지역과 이름이 이어지는 곳 → 지금 혼잡 단계 */
async function seoulLive(places: any[], now: number): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const seoul = places.filter((p) => String(p.region_cd).startsWith('11'));
  if (seoul.length === 0 || !SEOUL_KEY) return out;

  const { data: areas } = await supabaseAdmin.from('seoul_area').select('*');
  const toks = (areas ?? []).flatMap((a: any) => areaTokens(a.area_nm).map((t) => ({ t, a })));
  const placeArea = new Map<string, any>();
  for (const p of seoul) {
    const b = baseName(p.title);
    let best: any = null, bestScore = 0;
    for (const { t, a } of toks) {
      const sc = Math.max(nameScore(b, t), nameScore(p.norm_title, t));
      if (sc > bestScore) { best = a; bestScore = sc; }
    }
    if (best) placeArea.set(p.content_id, best);
  }

  const stale = [...new Set(placeArea.values())]
    .filter((a: any) => !a.fetched_at || now - new Date(a.fetched_at).getTime() > LIVE_TTL_MS)
    .slice(0, MAX_LIVE_AREAS);
  await Promise.all(stale.map(async (a: any) => {
    const r = await fetchSeoulArea(a.area_cd);
    if (!r) return;
    a.lvl = r.lvl; a.ppltn_time = r.time; a.fetched_at = new Date().toISOString();
    await supabaseAdmin.from('seoul_area').update({ lvl: r.lvl, ppltn_time: r.time, fetched_at: a.fetched_at })
      .eq('area_cd', a.area_cd);
  }));

  for (const [id, a] of placeArea) {
    // 1시간 넘게 못 받은 값은 '지금'이라 부를 수 없어 쓰지 않는다
    const fresh = a.fetched_at && now - new Date(a.fetched_at).getTime() < 3600e3;
    if (fresh && a.lvl && LIVE_RATE[a.lvl] !== undefined) out.set(id, a.lvl);
  }
  return out;
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

/**
 * 장소에 혼잡도·날씨를 붙여 응답 모양으로 만든다 (주변 모드/지역 모드 공용).
 * limit개만 돌려줄 때는 혼잡을 아는 곳부터 담는다 — 회색(모름) 마커를 줄이려고.
 */
async function attach(all: any[], regions: string[], ymd: string, now: number, limit = all.length) {
  const { data: crowdRows } = await supabaseAdmin
    .from('tour_crowd').select('region_cd, norm_name, base_name, rate').in('region_cd', regions).eq('ymd', ymd);
  const crowdMap = new Map((crowdRows ?? []).map((c: any) => [`${c.region_cd}|${c.norm_name}`, Number(c.rate)]));
  const byRegion = new Map<string, { name: string; base: string; rate: number }[]>();
  for (const c of (crowdRows ?? []) as any[]) {
    const arr = byRegion.get(c.region_cd) ?? [];
    arr.push({ name: c.norm_name, base: c.base_name ?? c.norm_name, rate: Number(c.rate) });
    byRegion.set(c.region_cd, arr);
  }
  // 정확히 안 맞으면 괄호를 뺀 이름·포함 관계로 한 번 더 찾는다 ('충렬사(부산)' ↔ '충렬사')
  const crowdFor = (regionCd: string, normTitle: string, title: string): number | null => {
    const exact = crowdMap.get(`${regionCd}|${normTitle}`);
    if (exact !== undefined) return exact;
    const b = baseName(title);
    let best: { rate: number } | null = null, bestScore = 0;
    for (const c of byRegion.get(regionCd) ?? []) {
      const sc = Math.max(nameScore(normTitle, c.name), nameScore(b, c.base));
      if (sc > bestScore) { best = c; bestScore = sc; }
    }
    return best ? best.rate : null;
  };

  // 서울은 '오늘'이면 예측 대신 실시간 혼잡을 쓴다
  const live = ymd === fmtDate(kstNow()) ? await seoulLive(all, now) : new Map<string, string>();
  const rated = all.map((p: any) => {
    const lv = live.get(p.content_id);
    return { p, rate: lv ? LIVE_RATE[lv] : crowdFor(p.region_cd, p.norm_title, p.title), isLive: !!lv };
  });
  // 같은 조건 안에서는 들어온 순서(거리순)를 지킨다
  const picked = [...rated.filter((x) => x.rate !== null), ...rated.filter((x) => x.rate === null)].slice(0, limit);
  const sorted = picked.map((x) => x.p);

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

  return picked.map(({ p, rate, isLive }) => {
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
      crowdRate: rate, // 0~100, 없으면 null. 서울 실시간이 있으면 그 값이 우선
      crowdLive: isLive,
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

      const { data: rows } = await supabaseAdmin.from('tour_place').select('*').eq('region_cd', regionCd).limit(1000);
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
        .sort((a: any, b: any) => a._c - b._c);
      const out = await attach(sorted, [regionCd], ymd, now, 120);
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
      .slice(0, 100);

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
        .slice(0, 100);
      regions = [...new Set(sorted.map((p: any) => p.region_cd))];
    }
    const out = await attach(sorted, regions as string[], ymd, now, 60);

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
