import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  WeatherInfo,
  ForecastSlot,
  HourlySlot,
  DailySlot,
  getConditionFromId,
  CONDITION_META,
} from '../constants/weather';
import { fetchKmaWeather, isInKorea, takeKmaFail } from './kma';
import { captureMessage } from '../lib/sentry';
import { translate } from '../i18n';
import { setLastCoords, getLastCoords } from '../utils/storage';

const API_KEY = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY;
const BASE_URL = 'https://api.openweathermap.org/data/2.5';

// 자외선/미세먼지: Open-Meteo Air Quality API (무료·무키, 전 세계)
// 한 번 호출로 UV 지수 + PM10 + PM2.5 모두 제공
const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

interface AirQuality {
  uvIndex?: number;
  pm10?: number;
  pm25?: number;
}

// 어제 같은 시각 기온 (Open-Meteo forecast + past_days=1, 무료·무키). 실패 시 undefined.
const FORECAST_OM_URL = 'https://api.open-meteo.com/v1/forecast';
async function fetchYesterdayTemp(lat: number, lon: number): Promise<number | undefined> {
  try {
    const url = `${FORECAST_OM_URL}?latitude=${lat}&longitude=${lon}&hourly=temperature_2m&past_days=1&forecast_days=1&timezone=auto`;
    // 4초 타임아웃 — 어제 기온은 부가정보라 느리면 그냥 생략(날씨 로딩을 막지 않음).
    const res = await Promise.race([
      fetch(url),
      new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
    ]);
    if (!res.ok) return undefined;
    const json = await res.json();
    const times: string[] = json?.hourly?.time ?? [];
    const temps: number[] = json?.hourly?.temperature_2m ?? [];
    if (!times.length || times.length !== temps.length) return undefined;
    // 어제, 지금과 같은 시(hour)의 값. Open-Meteo time 예: "2026-07-02T12:00" (timezone=auto=현지)
    const now = new Date();
    const y = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const p = (n: number) => String(n).padStart(2, '0');
    const yStr = `${y.getFullYear()}-${p(y.getMonth() + 1)}-${p(y.getDate())}T${p(now.getHours())}:00`;
    const idx = times.indexOf(yStr);
    if (idx >= 0 && typeof temps[idx] === 'number') return Math.round(temps[idx]);
    return undefined;
  } catch {
    return undefined;
  }
}

async function fetchAirQuality(lat: number, lon: number): Promise<AirQuality> {
  try {
    const url = `${AIR_QUALITY_URL}?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5,uv_index`;
    const res = await fetch(url);
    if (!res.ok) return {};
    const json = await res.json();
    const c = json?.current ?? {};
    const num = (v: unknown) => (typeof v === 'number' && !isNaN(v) ? v : undefined);
    const uv = num(c.uv_index);
    const pm10 = num(c.pm10);
    const pm25 = num(c.pm2_5);
    return {
      uvIndex: uv !== undefined ? Math.round(uv * 10) / 10 : undefined,
      pm10: pm10 !== undefined ? Math.round(pm10) : undefined,
      pm25: pm25 !== undefined ? Math.round(pm25) : undefined,
    };
  } catch {
    return {};
  }
}

// ── 10분 인메모리 캐시 ─────────────────────────────────────
const CACHE_TTL_MS = 10 * 60 * 1000; // 10분
let weatherCache: { data: WeatherInfo; fetchedAt: number } | null = null;

export function clearWeatherCache(): void {
  weatherCache = null;
}

/**
 * 위치 권한 거부 에러.
 * instanceof는 번들러/트랜스파일 조합에 따라 Error 상속이 깨질 수 있어 플래그로 판별한다.
 *
 * canAskAgain=false면 안드로이드가 시스템 권한 다이얼로그를 더 이상 띄우지 않는다.
 * 이때 "다시 시도"만 제공하면 눌러도 아무 일이 없어 앱이 영구 먹통이 되므로,
 * 호출부(UI)는 이 값을 보고 설정 앱으로 보내야 한다.
 */
export interface LocationPermissionError extends Error {
  isLocationPermission: true;
  canAskAgain: boolean;
}
export function isLocationPermissionError(e: unknown): e is LocationPermissionError {
  return !!e && typeof e === 'object' && (e as LocationPermissionError).isLocationPermission === true;
}
function locationPermissionError(canAskAgain: boolean): LocationPermissionError {
  const err = new Error(translate('common.locationNeeded')) as LocationPermissionError;
  err.isLocationPermission = true;
  err.canAskAgain = canAskAgain;
  return err;
}

/** 권한 상태 조회 — 거부 시 재요청 가능 여부까지 같이 돌려준다. */
export async function requestLocationPermission(): Promise<{ granted: boolean; canAskAgain: boolean }> {
  // 이미 권한이 있으면 재요청하지 않음
  const existing = await Location.getForegroundPermissionsAsync();
  if (existing.status === 'granted') return { granted: true, canAskAgain: true };
  const res = await Location.requestForegroundPermissionsAsync();
  return { granted: res.status === 'granted', canAskAgain: res.canAskAgain };
}

export async function getCurrentCoords(): Promise<{ lat: number; lon: number }> {
  // 1) 최근(10분 내) 마지막 위치가 있으면 즉시 사용 → GPS fix 대기 없이 바로 로드.
  //    (두 번째 실행부터 대부분 여기서 즉시 반환 → 로딩 빠름)
  try {
    const recent = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 });
    if (recent) return { lat: recent.coords.latitude, lon: recent.coords.longitude };
  } catch {
    // 아래로
  }
  // 2) 최근 위치 없으면 신선한 fix(Balanced=빠름) 시도, 8초 타임아웃.
  try {
    const fresh = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
    ]);
    if (fresh) return { lat: fresh.coords.latitude, lon: fresh.coords.longitude };
  } catch {
    // 아래로
  }
  // 3) 타임아웃 → 오래된 마지막 위치라도 사용(무한대기 방지).
  const last = await Location.getLastKnownPositionAsync();
  if (last) return { lat: last.coords.latitude, lon: last.coords.longitude };
  // 4) 그것도 없으면(진짜 첫 실행) 결국 한 번 기다림.
  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { lat: loc.coords.latitude, lon: loc.coords.longitude };
}

/**
 * 좌표 → 한국 행정구역 문자열 (예: "안양시 박달동")
 * - expo-location의 reverseGeocodeAsync 사용 (OS 기본 geocoder, 인터넷 필요)
 * - 한국 주소가 안 나오면 빈 문자열 반환 → 호출자가 fallback 처리
 */
export async function reverseGeocodeKo(lat: number, lon: number): Promise<string> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
    if (!results || results.length === 0) return '';
    const r = results[0];
    // 한국 주소 우선 처리
    // - city: "수원시", subregion: "수원시", region: "경기도"
    // - district: "팔달구", street: "세류동", name: "세류동 123"
    // 시/구/동 조합으로 표시
    const city = r.city || r.subregion || '';
    // 동(neighborhood) 정보는 district 또는 street에 들어오는 경우가 있음
    const dong = r.district || r.street || r.name || '';
    if (city && dong && city !== dong) return `${city} ${dong}`;
    return city || dong || '';
  } catch {
    return '';
  }
}

// ── 오늘 관측 최고/최저 누적 보정 ───────────────────────────
// "오늘 최고" = max(예보 최고, 현재기온, 오늘 그동안 관측된 최고). 최저는 대칭.
// 같은 날·같은 위치면 저장값과 비교해 단조 갱신(최고는 오르기만/최저는 내리기만)
// → 새로고침해도 출렁이지 않고, '현재 > 최고' 모순도 없음. KST 자정/위치 이동 시 리셋.
const TEMP_EXTREME_KEY = 'dailyTempExtreme';
async function reconcileDailyExtremes(w: WeatherInfo, lat: number, lon: number): Promise<WeatherInfo> {
  let hi = Math.max(w.tempMax, w.temp);
  let lo = Math.min(w.tempMin, w.temp);
  try {
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const loc = `${lat.toFixed(1)},${lon.toFixed(1)}`; // ~11km 이내는 동일 위치로 간주
    const raw = await AsyncStorage.getItem(TEMP_EXTREME_KEY);
    if (raw) {
      const s = JSON.parse(raw) as { date: string; loc: string; hi: number; lo: number };
      if (s.date === today && s.loc === loc) {
        hi = Math.max(hi, s.hi);
        lo = Math.min(lo, s.lo);
      }
    }
    await AsyncStorage.setItem(TEMP_EXTREME_KEY, JSON.stringify({ date: today, loc, hi, lo }));
  } catch {
    // 저장 실패해도 현재기온과의 모순은 위 hi/lo 계산으로 이미 방지됨
  }
  return { ...w, tempMax: hi, tempMin: lo };
}

export async function fetchWeather(forceRefresh = false): Promise<WeatherInfo> {
  // 캐시 유효하면 바로 반환
  if (!forceRefresh && weatherCache && Date.now() - weatherCache.fetchedAt < CACHE_TTL_MS) {
    return weatherCache.data;
  }

  const perm = await requestLocationPermission();
  if (!perm.granted) {
    // 지금까지 이 에러는 화면 문자열로만 소비되고 어디에도 보고되지 않아,
    // 몇 명이 권한 거부 상태로 갇혀 있는지 관측 자체가 불가능했다.
    const stale = await getLastCoords();
    captureMessage(
      `location permission denied${perm.canAskAgain ? '' : ' (permanent)'}`,
      {
        canAskAgain: perm.canAskAgain,
        lastCoordsAgeDays: stale?.savedAt
          ? Math.round((Date.now() - stale.savedAt) / 86400000)
          : stale ? 'unknown(pre-1.4.0)' : 'none',
      },
      { key: `loc-denied:${perm.canAskAgain}`, throttleMs: 60 * 60 * 1000 },
    );
    throw locationPermissionError(perm.canAskAgain);
  }

  const { lat, lon } = await getCurrentCoords();
  setLastCoords(lat, lon).catch(() => {}); // 위젯 백그라운드 갱신용
  return fetchWeatherByCoords(lat, lon);
}

// 좌표 기반 조회 — 위치 권한/GPS 없이 재사용 가능 (위젯 백그라운드 갱신용).
export async function fetchWeatherByCoords(lat: number, lon: number): Promise<WeatherInfo> {
  // 행정구역(시/동) + 자외선/미세먼지 + 어제 기온을 병렬 조회 — 어느 날씨 소스를 쓰든 공통
  const [koPlace, airQuality, tempYesterday] = await Promise.all([
    reverseGeocodeKo(lat, lon),
    fetchAirQuality(lat, lon),
    fetchYesterdayTemp(lat, lon),
  ]);

  // ── 1순위: 한국이면 기상청(KMA) — 가장 정확 ──────────────
  if (isInKorea(lat, lon)) {
    let kmaThrew: unknown = null;
    try {
      const kma = await fetchKmaWeather(lat, lon);
      if (kma) {
        // kma는 rainfall(RN1)까지 채워 옴. uv/pm은 Open-Meteo로 보강.
        const result = await reconcileDailyExtremes({
          ...kma,
          city: koPlace || kma.city || '내 위치',
          lat,
          tempYesterday,
          ...airQuality,
        }, lat, lon);
        weatherCache = { data: result, fetchedAt: Date.now() };
        return result;
      }
    } catch (e) {
      kmaThrew = e;
    }
    // 여기 도달 = 기상청 실패 → OpenWeather 폴백.
    // 한국에서 OpenWeather는 기상청보다 몇 도씩 어긋나므로(관측: 실황 35.1도 vs OW 30.9도)
    // 폴백 사실과 사유를 반드시 남긴다. 예전엔 무음이라 폴백된 줄도 몰랐음.
    const fail = takeKmaFail();
    const kind = fail?.kind ?? (kmaThrew ? 'threw' : 'unknown');
    const detail = fail?.detail ?? (kmaThrew instanceof Error ? kmaThrew.message : '알 수 없음');
    console.warn(`[weather] 기상청 실패 → OpenWeather 폴백: ${kind} / ${detail}`);
    // kind를 제목에 실어 유형별로 이슈가 갈리게 한다.
    // 상세(detail)가 데이터 스크러빙으로 가려져도 제목만으로 원인 분류가 가능해야 함.
    captureMessage(`KMA fallback: ${kind}`, { diag: detail, lat, lon }, {
      key: `kma-fallback:${kind}`,
      throttleMs: 5 * 60 * 1000,
    });
  }

  // ── 2순위: OpenWeather (해외 또는 기상청 실패 시) ─────────
  // 현재 날씨 + 48시간 예보 동시 요청
  const [res, forecastRes] = await Promise.all([
    fetch(`${BASE_URL}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=kr`),
    fetch(`${BASE_URL}/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&cnt=40`),
  ]);

  if (!res.ok) {
    throw new Error(`${translate('common.weatherFail')} (${res.status})`);
  }

  const data = await res.json();

  const weatherId: number = data.weather[0].id;
  const condition = getConditionFromId(weatherId);
  const meta = CONDITION_META[condition];

  // 해외 로컬 시간대(초) — OpenWeather가 위치 기준 UTC offset 제공. 없으면 KST(+9).
  // 시간별/주간/오늘 경계 계산에 사용 (KST 하드코딩 시 해외에서 시간·요일 어긋남)
  const tzSec = typeof data.timezone === 'number' ? data.timezone : 9 * 3600;

  // ── 오늘의 최저/최고 기온 계산 ───────────────────────────
  // OpenWeatherMap의 forecast는 3시간 간격 예보를 줌
  // - "오늘"의 정의: KST 자정 ~ 다음 KST 자정
  // - 오늘 안의 예보 데이터 + 현재 기온을 모두 합쳐서 min/max 계산
  // - 만약 오늘 남은 예보 포인트가 부족하면(저녁 호출 등),
  //   가장 가까운 24시간 데이터로 fallback
  let tempMin = Math.round(data.main.temp);
  let tempMax = Math.round(data.main.temp);
  let forecastSummary: ForecastSlot[] = [];
  let owHourly: HourlySlot[] = [];
  let owDaily: DailySlot[] = [];

  if (forecastRes.ok) {
    try {
      const forecastData = await forecastRes.json();
      type ForecastItem = {
        dt: number;
        main: { temp: number; temp_min: number; temp_max: number };
        weather: { id: number }[];
        pop?: number;
      };
      const list = forecastData.list as ForecastItem[];

      // ── 향후 12시간 (4슬롯) 예보 요약 — 엣지함수 payload용 ──
      forecastSummary = list.slice(0, 4).map((it) => {
        const localHour = new Date((it.dt + tzSec) * 1000).getUTCHours();
        const cond = getConditionFromId(it.weather[0]?.id ?? 800);
        return {
          hour: localHour,
          condition: cond,
          conditionKo: CONDITION_META[cond].ko,
          temp: Math.round(it.main.temp),
          pop: it.pop ?? 0,
        };
      });

      // ── 시간별 예보 (3h 간격, ~24h) — 맨 앞에 '지금'(현재) 보장 ──
      owHourly = list.slice(0, 8).map((it: any) => {
        const localHour = new Date((it.dt + tzSec) * 1000).getUTCHours();
        const cond = getConditionFromId(it.weather[0]?.id ?? 800);
        return {
          hour: localHour,
          condition: cond,
          conditionKo: CONDITION_META[cond].ko,
          temp: Math.round(it.main?.temp ?? 0),
          pop: it.pop ?? 0,
        };
      });
      const curLocalHour = new Date(Date.now() + tzSec * 1000).getUTCHours();
      if (owHourly.length === 0 || owHourly[0].hour !== curLocalHour) {
        owHourly.unshift({
          hour: curLocalHour, condition, conditionKo: meta.ko,
          temp: Math.round(data.main.temp), pop: owHourly[0]?.pop ?? 0,
        });
      }

      // ── 주간 예보 (날짜별 묶기, ~4일) ─────────────────────
      const owDayMap = new Map<string, { tmps: number[]; pops: number[]; cond: ReturnType<typeof getConditionFromId> }>();
      for (const it of list as any[]) {
        const localD = new Date((it.dt + tzSec) * 1000);
        const key = `${localD.getUTCFullYear()}${String(localD.getUTCMonth() + 1).padStart(2, '0')}${String(localD.getUTCDate()).padStart(2, '0')}`;
        if (!owDayMap.has(key)) owDayMap.set(key, { tmps: [], pops: [], cond: getConditionFromId(it.weather[0]?.id ?? 800) });
        const day = owDayMap.get(key)!;
        day.tmps.push(it.main?.temp ?? 0);
        day.pops.push(it.pop ?? 0);
        day.cond = getConditionFromId(it.weather[0]?.id ?? 800);
      }
      owDaily = Array.from(owDayMap.entries()).slice(0, 4).map(([date, d]) => {
        const yr = parseInt(date.slice(0, 4), 10);
        const mo = parseInt(date.slice(4, 6), 10) - 1;
        const dy = parseInt(date.slice(6, 8), 10);
        return {
          date,
          weekdayIdx: new Date(yr, mo, dy).getDay(),
          tempMin: d.tmps.length > 0 ? Math.round(Math.min(...d.tmps)) : 0,
          tempMax: d.tmps.length > 0 ? Math.round(Math.max(...d.tmps)) : 0,
          condition: d.cond,
          conditionKo: CONDITION_META[d.cond].ko,
          pop: d.pops.length > 0 ? Math.max(...d.pops) : 0,
        };
      });

      // 로컬 기준 "오늘 끝(자정)" 계산 (해외는 현지 자정)
      const nowLocal = new Date(Date.now() + tzSec * 1000);
      const endOfTodayMs = Date.UTC(
        nowLocal.getUTCFullYear(),
        nowLocal.getUTCMonth(),
        nowLocal.getUTCDate() + 1, // 다음 날 자정
      ) - tzSec * 1000;

      // 오늘에 해당하는 예보 항목
      const todayItems = list.filter(item => item.dt * 1000 <= endOfTodayMs);

      // 사용할 항목 결정: 오늘 데이터가 3개 이상이면 오늘만, 부족하면 다음 24시간(8개)
      const itemsToUse =
        todayItems.length >= 3
          ? todayItems
          : list.slice(0, Math.min(8, list.length));

      if (itemsToUse.length > 0) {
        // 실제 기온(temp)과 함께 슬롯별 min/max도 같이 고려해서 정확도 ↑
        const allTemps: number[] = [];
        for (const it of itemsToUse) {
          allTemps.push(it.main.temp, it.main.temp_min, it.main.temp_max);
        }
        allTemps.push(data.main.temp); // 현재 기온도 포함
        tempMin = Math.round(Math.min(...allTemps));
        tempMax = Math.round(Math.max(...allTemps));
      }
    } catch {
      // 예보 파싱 실패 → 현재 기온 그대로 유지
    }
  }

  // 1시간 강수량 (OpenWeather는 rain['1h'] 제공, 없으면 0)
  const rainfall =
    typeof data.rain?.['1h'] === 'number' ? Math.round(data.rain['1h'] * 10) / 10 : 0;

  const result: WeatherInfo = {
    condition,
    conditionKo: meta.ko,
    emoji: meta.emoji,
    temp: Math.round(data.main.temp),
    feelsLike: Math.round(data.main.feels_like ?? data.main.temp),
    tempMin,
    tempMax,
    humidity: Math.round(data.main.humidity ?? 0),
    windSpeed: Math.round((data.wind?.speed ?? 0) * 10) / 10,
    // 한국 행정구역(시/동)이 잡히면 그걸 우선 사용 (예: "안양시 박달동")
    // 못 잡으면 OpenWeather가 준 city 이름 fallback (예: "Anyang")
    city: koPlace || data.name,
    description: data.weather[0].description,
    lat,
    forecast: forecastSummary.length > 0 ? forecastSummary : undefined,
    hourly: owHourly.length > 0 ? owHourly : undefined,
    daily: owDaily.length > 0 ? owDaily : undefined,
    rainfall,
    tempYesterday,
    ...airQuality,
  };

  const finalResult = await reconcileDailyExtremes(result, lat, lon);
  weatherCache = { data: finalResult, fetchedAt: Date.now() };
  return finalResult;
}
