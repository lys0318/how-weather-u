// 기상청(KMA) 단기예보 API 연동
// - 한국 지역에서 OpenWeather보다 훨씬 정확 (공식 기상 데이터)
// - 위경도 → 기상청 격자(nx, ny) 변환 후 호출
// - 실패(키 없음/네트워크/파싱 오류) 시 null 반환 → 호출자가 OpenWeather로 폴백
//
// 공공데이터포털 "기상청_단기예보 ((구) 동네예보) 조회서비스" 사용
// 환경변수: EXPO_PUBLIC_KMA_API_KEY (일반 인증키 Encoding 값)

import {
  WeatherInfo,
  WeatherCondition,
  ForecastSlot,
  HourlySlot,
  DailySlot,
  CONDITION_META,
} from '../constants/weather';

const KMA_KEY = process.env.EXPO_PUBLIC_KMA_API_KEY;
const BASE = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0';

// ── 한국 영역 판별 (대략적 bounding box) ──────────────────────
export function isInKorea(lat: number, lon: number): boolean {
  return lat >= 33.0 && lat <= 38.7 && lon >= 124.5 && lon <= 131.9;
}

// ── 위경도 → 기상청 격자(nx, ny) 변환 (LCC DFS) ──────────────
function dfsXyConv(lat: number, lon: number): { nx: number; ny: number } {
  const RE = 6371.00877; // 지구 반경(km)
  const GRID = 5.0; // 격자 간격(km)
  const SLAT1 = 30.0;
  const SLAT2 = 60.0;
  const OLON = 126.0;
  const OLAT = 38.0;
  const XO = 43;
  const YO = 136;
  const DEGRAD = Math.PI / 180.0;

  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn =
    Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
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

  const nx = Math.floor(ra * Math.sin(theta) + XO + 0.5);
  const ny = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);
  return { nx, ny };
}

// ── KST 시각 헬퍼 ────────────────────────────────────────────
function kstNow(): Date {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}
function fmtDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// 초단기실황: 매시각 정시 발표, 약 40분 후 제공
function ncstBase(): { base_date: string; base_time: string } {
  const kst = kstNow();
  let h = kst.getUTCHours();
  const m = kst.getUTCMinutes();
  let dateObj = kst;
  if (m < 40) {
    if (h === 0) {
      dateObj = new Date(kst.getTime() - 24 * 60 * 60 * 1000);
      h = 23;
    } else {
      h -= 1;
    }
  }
  return { base_date: fmtDate(dateObj), base_time: pad2(h) + '00' };
}

// 단기예보: 02,05,08,11,14,17,20,23시 발표 (약 10분 후 제공)
function vilageBase(): { base_date: string; base_time: string } {
  const kst = kstNow();
  const h = kst.getUTCHours();
  const m = kst.getUTCMinutes();
  const times = [23, 20, 17, 14, 11, 8, 5, 2];
  let chosen: number | null = null;
  for (const t of times) {
    if (h > t || (h === t && m >= 10)) {
      chosen = t;
      break;
    }
  }
  if (chosen === null) {
    // 02:10 이전 → 전날 23시 발표
    const prev = new Date(kst.getTime() - 24 * 60 * 60 * 1000);
    return { base_date: fmtDate(prev), base_time: '2300' };
  }
  return { base_date: fmtDate(kst), base_time: pad2(chosen) + '00' };
}

// 직전 단기예보 발표 기준 (최신 발표가 아직 미제공일 때 재시도용)
function prevVilageBase(): { base_date: string; base_time: string } {
  const cur = vilageBase();
  const times = [2, 5, 8, 11, 14, 17, 20, 23];
  const h = parseInt(cur.base_time.slice(0, 2), 10);
  const idx = times.indexOf(h);
  if (idx > 0) return { base_date: cur.base_date, base_time: pad2(times[idx - 1]) + '00' };
  // base_time이 0200이면 전날 2300
  const y = parseInt(cur.base_date.slice(0, 4), 10);
  const m = parseInt(cur.base_date.slice(4, 6), 10) - 1;
  const d = parseInt(cur.base_date.slice(6, 8), 10);
  const prev = new Date(Date.UTC(y, m, d) - 24 * 60 * 60 * 1000);
  return { base_date: fmtDate(prev), base_time: '2300' };
}

// 오늘의 TMN(06시)/TMX(15시)을 항상 포함하는 "이른 발표" 기준.
// 최신 발표는 오후·저녁이 되면 오늘 TMN/TMX가 응답에서 빠지므로(과거 시각),
// 오늘 0200 발표(자정~02:10엔 전날 2300 발표)를 별도로 조회해 보충한다.
function earlyVilageBase(): { base_date: string; base_time: string } {
  const kst = kstNow();
  const h = kst.getUTCHours();
  const m = kst.getUTCMinutes();
  if (h > 2 || (h === 2 && m >= 10)) {
    return { base_date: fmtDate(kst), base_time: '0200' };
  }
  const prev = new Date(kst.getTime() - 24 * 60 * 60 * 1000);
  return { base_date: fmtDate(prev), base_time: '2300' };
}

// ── 기상청 카테고리 → 앱 내부 condition ──────────────────────
function kmaToCondition(pty: string | number, sky: string | number): WeatherCondition {
  const p = Number(pty);
  if (p === 1 || p === 2 || p === 4) return 'rain'; // 비, 비/눈, 소나기
  if (p === 5 || p === 6) return 'drizzle'; // 빗방울, 빗방울눈날림
  if (p === 3 || p === 7) return 'snow'; // 눈, 눈날림
  // 강수 없음 → 하늘 상태
  const s = Number(sky);
  if (s === 1) return 'clear'; // 맑음
  return 'clouds'; // 구름많음(3) / 흐림(4)
}

// 호주식 체감온도 근사 (KMA는 체감온도 직접 제공 안 함)
// ── 체감온도 (기상청 공식 산출식, 2022.6.2~ 적용) ─────────────
// 출처: 기상자료개방포털 기후통계분석 > 응용기상분석 > 체감온도
// https://data.kma.go.kr/climate/windChill/selectWindChillChart.do
//
// 여름철(5~9월)과 겨울철(10~4월)이 서로 다른 공식을 쓰고, 겨울철은
// "기온 10도 이하 · 풍속 1.3m/s 이상"일 때만 별도 산출한다.
// 그 외 구간은 기상청도 체감온도를 따로 계산하지 않고 실제 기온을 쓴다.

// Stull(2011) 습구온도 근사식. atan은 라디안(JS Math.atan 그대로) —
// 도(degree) 단위로 잘못 쓰면 결과가 수천 도로 튀어 바로 드러남.
function stullWetBulb(tempC: number, humidity: number): number {
  const rh = humidity;
  return (
    tempC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
    Math.atan(tempC + rh) -
    Math.atan(rh - 1.67633) +
    0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) -
    4.686035
  );
}

// 여름철(5~9월) — 기온+습구온도 기반. 풍속은 쓰지 않음(공식에 없음).
function summerFeelsLike(tempC: number, humidity: number): number {
  const tw = stullWetBulb(tempC, humidity);
  return -0.2442 + 0.55399 * tw + 0.45535 * tempC - 0.0022 * tw * tw + 0.00278 * tw * tempC + 3.0;
}

// 겨울철(10~4월) 바람냉각 — V는 km/h (조건 판정은 m/s 기준이라 변환 필요).
function winterFeelsLike(tempC: number, windMs: number): number {
  const vKmh = windMs * 3.6;
  const v016 = Math.pow(vKmh, 0.16);
  return 13.12 + 0.6215 * tempC - 11.37 * v016 + 0.3965 * v016 * tempC;
}

function apparentTemp(temp: number, humidity: number, windMs: number): number {
  const month = new Date().getMonth() + 1; // 1~12, 기기 로컬 기준(국내 전용 함수라 KST와 사실상 동일)
  const isSummer = month >= 5 && month <= 9;
  if (isSummer) {
    return Math.round(summerFeelsLike(temp, humidity));
  }
  const isWinterConditionMet = temp <= 10 && windMs >= 1.3;
  if (isWinterConditionMet) {
    return Math.round(winterFeelsLike(temp, windMs));
  }
  // 적용 조건 밖 — 기상청도 별도 체감온도를 산출하지 않고 실제 기온을 그대로 씀
  return Math.round(temp);
}

interface KmaItem {
  category: string;
  obsrValue?: string;
  fcstValue?: string;
  fcstDate?: string;
  fcstTime?: string;
}

// 응답이 느리면(약전계 등) 무한 대기 대신 끊고 재시도 — 폴백 판단을 빠르게.
const KMA_TIMEOUT_MS = 12000;
const ROWS_PER_PAGE = 1000;

// 기상청 실패 사유 — weather.ts가 폴백 시 Sentry로 올려 원인을 남긴다.
// (지금까지 catch로 삼켜져서 폴백된 사실조차 관측 불가였음)
//
// kind는 값이 한정된 짧은 분류 토큰이라 Sentry 메시지 제목에 그대로 실을 수 있다.
// detail이 스크러빙으로 가려지더라도 최소한 실패 유형은 남는다.
// (실제로 detail을 통째로 [Filtered] 당해 한 달치 리포트가 무용지물이었음)
export interface KmaFail {
  kind: string;
  detail: string;
}
let lastFail: KmaFail | null = null;
export function takeKmaFail(): KmaFail | null {
  const f = lastFail;
  lastFail = null;
  return f;
}
function noteFail(endpoint: string, kind: string, detail?: string): null {
  lastFail = { kind, detail: sanitizeDiag(`${endpoint}: ${detail ?? kind}`) };
  return null;
}

/**
 * 진단 문자열에서 자격증명처럼 보이는 부분 제거.
 * data.go.kr은 오류 본문에 요청 URL을 그대로 되돌려주기도 해서 serviceKey가 섞일 수 있고,
 * 그런 값이 섞이면 Sentry가 필드를 통째로 가려버려 진단 자체가 불가능해진다.
 */
function sanitizeDiag(s: string): string {
  return (
    s
      // 1) 키를 값으로 갖는 쿼리 파라미터 — 문자 구성과 무관하게 통째로 제거
      .replace(/(serviceKey|authKey|apikey|api_key|token|secret)=[^&\s»]*/gi, '$1=***')
      // 2) 긴 16진수 = 우리 KMA 키 형태(64자)
      .replace(/\b[0-9a-fA-F]{32,}\b/g, '***')
      // 3) 밑줄·하이픈이 없는 긴 랜덤 토큰(base64 등).
      //    밑줄을 문자군에서 빼는 게 핵심 — 넣으면 SERVICE_KEY_IS_NOT_REGISTERED_ERROR 같은
      //    에러 코드까지 지워져 정작 필요한 진단이 사라진다(실제로 그랬음).
      .replace(/\b[A-Za-z0-9+/=]{24,}\b/g, '***')
  );
}

/** 오류 본문 앞부분만 태그 제거해 요약 — 원인 파악용, 리포트 비대화 방지. */
function snippet(text: string): string {
  const clean = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return clean ? `«${clean.slice(0, 200)}»` : '«empty body»';
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** 한 페이지 조회. 성공 시 items + totalCount, 실패 시 null(사유 기록). */
async function callKmaPage(
  endpoint: string,
  params: Record<string, string>,
  pageNo: number,
): Promise<{ items: KmaItem[]; totalCount: number } | null> {
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  // serviceKey는 이미 인코딩된 값이라 raw로 append
  const url = `${BASE}/${endpoint}?serviceKey=${KMA_KEY}&dataType=JSON&numOfRows=${ROWS_PER_PAGE}&pageNo=${pageNo}&${qs}`;
  let res: Response;
  try {
    res = await fetchWithTimeout(url, KMA_TIMEOUT_MS);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return msg.includes('abort')
      ? noteFail(endpoint, 'timeout', `timeout after ${KMA_TIMEOUT_MS}ms`)
      : noteFail(endpoint, 'network', `network(${msg})`);
  }
  // 본문은 한 번만 읽을 수 있으므로 text로 받아두고 파싱한다.
  // (data.go.kr은 4xx·오류 시 JSON이 아니라 XML/HTML로 진짜 사유를 담아 보냄)
  let text: string;
  try {
    text = await res.text();
  } catch (e) {
    return noteFail(endpoint, 'body read fail', `body read fail (${e instanceof Error ? e.message : String(e)})`);
  }
  if (!res.ok) {
    // 폰 브라우저로는 같은 URL이 정상인데 앱에서만 400이 나는 상태.
    // 응답 주체를 가리기 위해 server/content-type도 같이 남긴다
    // (중간 프록시·캡티브포털이 가로챈 경우 여기서 정체가 드러남).
    const via = [res.headers.get('server'), res.headers.get('content-type')]
      .filter(Boolean)
      .join(' | ');
    return noteFail(endpoint, `http ${res.status}`, `http ${res.status} [${via || 'no server hdr'}] ${snippet(text)}`);
  }
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return noteFail(endpoint, 'non-json', `non-json response ${snippet(text)}`);
  }
  const code = json?.response?.header?.resultCode;
  if (code !== '00') {
    return noteFail(endpoint, `resultCode ${code}`, `resultCode ${code} (${json?.response?.header?.resultMsg ?? '?'})`);
  }
  const items = json?.response?.body?.items?.item;
  if (!Array.isArray(items)) return noteFail(endpoint, 'items missing', 'items missing');
  const totalCount = Number(json?.response?.body?.totalCount ?? items.length);
  return { items: items as KmaItem[], totalCount: isNaN(totalCount) ? items.length : totalCount };
}

/**
 * 기상청 조회 — 타임아웃/1회 재시도 + 페이지 이어받기.
 * 단기예보 totalCount가 1000을 넘는 발표시각이 있어(관측: 2000 발표 1016건)
 * 1페이지만 받으면 뒷부분 예보가 잘린다 → 남으면 다음 페이지를 이어붙인다.
 */
async function callKma(
  endpoint: string,
  params: Record<string, string>,
): Promise<KmaItem[] | null> {
  if (!KMA_KEY) return noteFail(endpoint, 'no api key', 'no api key');

  let first = await callKmaPage(endpoint, params, 1);
  if (!first) {
    // 일시적 네트워크/서버 오류일 수 있으니 1회만 재시도
    first = await callKmaPage(endpoint, params, 1);
    if (!first) return null; // 사유는 callKmaPage가 기록해둠
  }

  const all = first.items;
  const totalPages = Math.ceil(first.totalCount / ROWS_PER_PAGE);
  // 잘린 경우에만 추가 요청 (보통 2페이지, 수십 건이라 가벼움)
  for (let p = 2; p <= totalPages && p <= 3; p++) {
    const next = await callKmaPage(endpoint, params, p);
    if (!next) break; // 뒷페이지는 실패해도 앞부분으로 진행
    all.push(...next.items);
  }
  return all;
}

/**
 * 기상청 날씨 조회 (한국 전용)
 * 성공 시 WeatherInfo(city 제외), 실패 시 null
 */
export async function fetchKmaWeather(
  lat: number,
  lon: number,
): Promise<WeatherInfo | null> {
  if (!KMA_KEY) return noteFail('fetchKmaWeather', 'no api key', 'no api key');
  if (!isInKorea(lat, lon)) return null; // 해외 — 실패가 아니라 정상 분기

  const { nx, ny } = dfsXyConv(lat, lon);
  const ncst = ncstBase();
  const vilage = vilageBase();

  // 실황(현재) + 단기예보(하늘/강수확률/최저최고/예보) 병렬 호출
  const [ncstItems, fcstItemsRaw] = await Promise.all([
    callKma('getUltraSrtNcst', {
      base_date: ncst.base_date,
      base_time: ncst.base_time,
      nx: String(nx),
      ny: String(ny),
    }),
    callKma('getVilageFcst', {
      base_date: vilage.base_date,
      base_time: vilage.base_time,
      nx: String(nx),
      ny: String(ny),
    }),
  ]);

  // 최신 발표가 아직 안 올라왔으면(빈 응답) 직전 발표로 재시도 → 3h 폴백 빈도↓
  let fcstItems = fcstItemsRaw;
  if (!fcstItems || fcstItems.length === 0) {
    const pv = prevVilageBase();
    fcstItems = await callKma('getVilageFcst', {
      base_date: pv.base_date,
      base_time: pv.base_time,
      nx: String(nx),
      ny: String(ny),
    });
  }

  if (!ncstItems && !fcstItems) {
    // 마지막 엔드포인트 실패 사유를 그대로 승계 — 여기서 덮어쓰면 진짜 원인이 사라진다
    const inner = lastFail;
    return noteFail('fetchKmaWeather', inner?.kind ?? 'all endpoints failed',
      `실황·예보 모두 실패 (${inner?.detail ?? '?'})`);
  }

  // ── 실황 파싱 (현재 기온/습도/풍속/강수형태) ──────────────
  let temp = NaN;
  let humidity = 0;
  let windMs = 0;
  let ptyNow = '0';
  let rn1 = NaN; // 1시간 강수량 (mm)
  if (ncstItems) {
    for (const it of ncstItems) {
      const v = it.obsrValue ?? '';
      if (it.category === 'T1H') temp = parseFloat(v);
      else if (it.category === 'REH') humidity = parseFloat(v);
      else if (it.category === 'WSD') windMs = parseFloat(v);
      else if (it.category === 'PTY') ptyNow = v;
      else if (it.category === 'RN1') rn1 = parseFloat(v); // "강수없음"이면 NaN → 0 처리
    }
  }

  // ── 단기예보 파싱 (하늘상태/강수확률/최저최고/시간별) ──────
  // fcstDate+fcstTime 별로 카테고리 묶기
  const slotMap = new Map<
    string,
    { tmp?: number; sky?: string; pty?: string; pop?: number; date: string; time: string }
  >();
  let skyNow = '1';
  let tmn = NaN;
  let tmx = NaN;
  const todayStr = fmtDate(kstNow());

  if (fcstItems) {
    for (const it of fcstItems) {
      const key = `${it.fcstDate}${it.fcstTime}`;
      if (!slotMap.has(key)) {
        slotMap.set(key, { date: it.fcstDate ?? '', time: it.fcstTime ?? '' });
      }
      const slot = slotMap.get(key)!;
      const val = it.fcstValue ?? '';
      switch (it.category) {
        case 'TMP':
          slot.tmp = parseFloat(val);
          break;
        case 'SKY':
          slot.sky = val;
          break;
        case 'PTY':
          slot.pty = val;
          break;
        case 'POP':
          slot.pop = parseFloat(val);
          break;
        case 'TMN':
          if (it.fcstDate === todayStr) tmn = parseFloat(val);
          break;
        case 'TMX':
          if (it.fcstDate === todayStr) tmx = parseFloat(val);
          break;
      }
    }
  }

  // 시간순 정렬된 슬롯
  const sortedSlots = Array.from(slotMap.values())
    .filter((s) => s.tmp !== undefined)
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));

  // 예보 슬롯이 전무하면(발표 모두 실패) OpenWeather로 폴백
  if (sortedSlots.length === 0) return noteFail('fetchKmaWeather', 'no forecast slots', 'TMP 예보 슬롯 0개');

  // 현재 시각 이후 가장 가까운 슬롯에서 하늘상태 가져오기
  const nowKey = todayStr + pad2(kstNow().getUTCHours()) + '00';
  const upcoming = sortedSlots.filter((s) => `${s.date}${s.time}` >= nowKey);
  const nearest = upcoming[0] ?? sortedSlots[sortedSlots.length - 1];
  if (nearest?.sky) skyNow = nearest.sky;

  // 실황에 기온 없으면 예보 기온으로 대체
  if (isNaN(temp) && nearest?.tmp !== undefined) temp = nearest.tmp;
  if (isNaN(temp)) return noteFail('fetchKmaWeather', 'no temp', '기온 없음(실황·예보 모두)'); // 폴백

  // 현재 condition: 실황 PTY 우선, 없으면 예보 SKY
  const condition = kmaToCondition(ptyNow, skyNow);
  const meta = CONDITION_META[condition];

  // ── 향후 예보 슬롯 (3시간 간격 4개, 엣지함수 payload용) ──
  const forecast: ForecastSlot[] = [];
  for (let i = 0; i < upcoming.length && forecast.length < 4; i += 3) {
    const s = upcoming[i];
    if (s.tmp === undefined) continue;
    const cond = kmaToCondition(s.pty ?? '0', s.sky ?? '1');
    forecast.push({
      hour: parseInt(s.time.slice(0, 2), 10),
      condition: cond,
      conditionKo: CONDITION_META[cond].ko,
      temp: Math.round(s.tmp),
      pop: (s.pop ?? 0) / 100,
    });
  }

  // ── 시간별 예보 (1h 간격, ~24h) — 맨 앞에 '지금'(실황) 보장 ──
  const hourly: HourlySlot[] = upcoming.slice(0, 24).map((s) => {
    const cond = kmaToCondition(s.pty ?? '0', s.sky ?? '1');
    return {
      hour: parseInt(s.time.slice(0, 2), 10),
      condition: cond,
      conditionKo: CONDITION_META[cond].ko,
      temp: Math.round(s.tmp ?? temp),
      pop: (s.pop ?? 0) / 100,
    };
  });
  // 발표 지연으로 현재 시각 슬롯이 빠지면 실황 기온/날씨로 '지금' 주입
  const curHour = kstNow().getUTCHours();
  if (hourly.length === 0 || hourly[0].hour !== curHour) {
    hourly.unshift({
      hour: curHour, condition, conditionKo: meta.ko,
      temp: Math.round(temp), pop: hourly[0]?.pop ?? 0,
    });
    if (hourly.length > 24) hourly.length = 24;
  }

  // ── 주간 예보 (날짜별 묶기, 3~4일) ──────────────────────
  const dayMap = new Map<string, { tmps: number[]; pops: number[]; sky: string; pty: string }>();
  for (const s of sortedSlots) {
    if (!dayMap.has(s.date)) dayMap.set(s.date, { tmps: [], pops: [], sky: '1', pty: '0' });
    const d = dayMap.get(s.date)!;
    if (s.tmp !== undefined) d.tmps.push(s.tmp);
    if (s.pop !== undefined) d.pops.push(s.pop);
    if (s.sky) d.sky = s.sky;
    if (s.pty && s.pty !== '0') d.pty = s.pty;
  }
  const daily: DailySlot[] = Array.from(dayMap.entries())
    .slice(0, 4)
    .map(([date, d]) => {
      const cond = kmaToCondition(d.pty, d.sky);
      const yr = parseInt(date.slice(0, 4), 10);
      const mo = parseInt(date.slice(4, 6), 10) - 1;
      const dy = parseInt(date.slice(6, 8), 10);
      return {
        date,
        weekdayIdx: new Date(yr, mo, dy).getDay(),
        tempMin: d.tmps.length > 0 ? Math.round(Math.min(...d.tmps)) : Math.round(temp),
        tempMax: d.tmps.length > 0 ? Math.round(Math.max(...d.tmps)) : Math.round(temp),
        condition: cond,
        conditionKo: CONDITION_META[cond].ko,
        pop: d.pops.length > 0 ? Math.max(...d.pops) / 100 : 0,
      };
    });

  // ── 오늘 최저(TMN)/최고(TMX) 보충 ────────────────────────
  // 최신 발표는 오후·저녁이 되면 오늘 TMN(06시)/TMX(15시)이 응답에서 빠진다.
  // → 오늘 0200 발표를 추가 조회해 채운다. (둘 중 하나라도 없을 때만)
  if (isNaN(tmn) || isNaN(tmx)) {
    const eb = earlyVilageBase();
    const earlyItems = await callKma('getVilageFcst', {
      base_date: eb.base_date,
      base_time: eb.base_time,
      nx: String(nx),
      ny: String(ny),
    });
    if (earlyItems) {
      for (const it of earlyItems) {
        if (it.fcstDate !== todayStr) continue;
        const v = parseFloat(it.fcstValue ?? '');
        if (isNaN(v)) continue;
        if (it.category === 'TMN' && isNaN(tmn)) tmn = v;
        else if (it.category === 'TMX' && isNaN(tmx)) tmx = v;
      }
    }
  }

  // ── 오늘 최저/최고 기온 ─────────────────────────────────
  // 오늘의 공식 최저(TMN)/최고(TMX)를 그대로 사용 — 하루 종일 고정값.
  // 관측 현재기온(temp)은 섞지 않는다: 섞으면 새로고침마다 최고/최저가 출렁임.
  // TMN/TMX를 못 구한 극단적 경우만 오늘 예보 기온 범위로 폴백 (관측값 제외).
  const todayFcstTemps = sortedSlots
    .filter((s) => s.date === todayStr && s.tmp !== undefined)
    .map((s) => s.tmp as number);

  const tempMax = !isNaN(tmx)
    ? Math.round(tmx)
    : Math.round(todayFcstTemps.length ? Math.max(...todayFcstTemps) : temp);
  const tempMin = !isNaN(tmn)
    ? Math.round(tmn)
    : Math.round(todayFcstTemps.length ? Math.min(...todayFcstTemps) : temp);

  return {
    condition,
    conditionKo: meta.ko,
    emoji: meta.emoji,
    temp: Math.round(temp),
    feelsLike: apparentTemp(temp, humidity, windMs),
    tempMin,
    tempMax,
    humidity: Math.round(humidity),
    windSpeed: Math.round(windMs * 10) / 10,
    city: '', // weather.ts에서 reverseGeocode 결과로 채움
    description: meta.ko,
    forecast: forecast.length > 0 ? forecast : undefined,
    hourly: hourly.length > 0 ? hourly : undefined,
    daily: daily.length > 0 ? daily : undefined,
    rainfall: isNaN(rn1) ? 0 : Math.round(rn1 * 10) / 10,
    // uv/pm은 weather.ts에서 Open-Meteo로 채움
  };
}
