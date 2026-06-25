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
function apparentTemp(temp: number, humidity: number, windMs: number): number {
  const e = (humidity / 100) * 6.105 * Math.exp((17.27 * temp) / (237.7 + temp));
  const at = temp + 0.33 * e - 0.7 * windMs - 4.0;
  return Math.round(at);
}

interface KmaItem {
  category: string;
  obsrValue?: string;
  fcstValue?: string;
  fcstDate?: string;
  fcstTime?: string;
}

async function callKma(
  endpoint: string,
  params: Record<string, string>,
): Promise<KmaItem[] | null> {
  if (!KMA_KEY) return null;
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  // serviceKey는 이미 인코딩된 값이라 raw로 append
  const url = `${BASE}/${endpoint}?serviceKey=${KMA_KEY}&dataType=JSON&numOfRows=1000&pageNo=1&${qs}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const code = json?.response?.header?.resultCode;
    if (code !== '00') return null;
    const items = json?.response?.body?.items?.item;
    if (!Array.isArray(items)) return null;
    return items as KmaItem[];
  } catch {
    return null;
  }
}

/**
 * 기상청 날씨 조회 (한국 전용)
 * 성공 시 WeatherInfo(city 제외), 실패 시 null
 */
export async function fetchKmaWeather(
  lat: number,
  lon: number,
): Promise<WeatherInfo | null> {
  if (!KMA_KEY) return null;
  if (!isInKorea(lat, lon)) return null;

  const { nx, ny } = dfsXyConv(lat, lon);
  const ncst = ncstBase();
  const vilage = vilageBase();

  // 실황(현재) + 단기예보(하늘/강수확률/최저최고/예보) 병렬 호출
  const [ncstItems, fcstItems] = await Promise.all([
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

  if (!ncstItems && !fcstItems) return null;

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

  // 현재 시각 이후 가장 가까운 슬롯에서 하늘상태 가져오기
  const nowKey = todayStr + pad2(kstNow().getUTCHours()) + '00';
  const upcoming = sortedSlots.filter((s) => `${s.date}${s.time}` >= nowKey);
  const nearest = upcoming[0] ?? sortedSlots[sortedSlots.length - 1];
  if (nearest?.sky) skyNow = nearest.sky;

  // 실황에 기온 없으면 예보 기온으로 대체
  if (isNaN(temp) && nearest?.tmp !== undefined) temp = nearest.tmp;
  if (isNaN(temp)) return null; // 기온조차 못 구하면 폴백

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

  // ── 시간별 예보 (1h 간격, ~24h) ─────────────────────────
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
