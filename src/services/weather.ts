import * as Location from 'expo-location';
import {
  WeatherInfo,
  ForecastSlot,
  getConditionFromId,
  CONDITION_META,
} from '../constants/weather';
import { fetchKmaWeather, isInKorea } from './kma';
import { translate } from '../i18n';

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

export async function requestLocationPermission(): Promise<boolean> {
  // 이미 권한이 있으면 재요청하지 않음
  const { status: existing } = await Location.getForegroundPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

export async function getCurrentCoords(): Promise<{ lat: number; lon: number }> {
  // High 정확도(GPS): 약 10m 오차. Balanced(100m)보다 정확하지만 배터리 약간 더 씀.
  // 날씨 앱 특성상 시/동을 정확히 구분해야 해서 High 사용.
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  return {
    lat: location.coords.latitude,
    lon: location.coords.longitude,
  };
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

export async function fetchWeather(forceRefresh = false): Promise<WeatherInfo> {
  // 캐시 유효하면 바로 반환
  if (!forceRefresh && weatherCache && Date.now() - weatherCache.fetchedAt < CACHE_TTL_MS) {
    return weatherCache.data;
  }

  const granted = await requestLocationPermission();
  if (!granted) {
    throw new Error(translate('common.locationNeeded'));
  }

  const { lat, lon } = await getCurrentCoords();

  // 행정구역(시/동) + 자외선/미세먼지를 병렬 조회 — 어느 날씨 소스를 쓰든 공통
  const [koPlace, airQuality] = await Promise.all([
    reverseGeocodeKo(lat, lon),
    fetchAirQuality(lat, lon),
  ]);

  // ── 1순위: 한국이면 기상청(KMA) — 가장 정확 ──────────────
  if (isInKorea(lat, lon)) {
    try {
      const kma = await fetchKmaWeather(lat, lon);
      if (kma) {
        // kma는 rainfall(RN1)까지 채워 옴. uv/pm은 Open-Meteo로 보강.
        const result: WeatherInfo = {
          ...kma,
          city: koPlace || kma.city || '내 위치',
          ...airQuality,
        };
        weatherCache = { data: result, fetchedAt: Date.now() };
        return result;
      }
    } catch {
      // 기상청 실패 → OpenWeather로 폴백
    }
  }

  // ── 2순위: OpenWeather (해외 또는 기상청 실패 시) ─────────
  // 현재 날씨 + 48시간 예보 동시 요청
  const [res, forecastRes] = await Promise.all([
    fetch(`${BASE_URL}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=kr`),
    fetch(`${BASE_URL}/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&cnt=16`),
  ]);

  if (!res.ok) {
    throw new Error(`${translate('common.weatherFail')} (${res.status})`);
  }

  const data = await res.json();

  const weatherId: number = data.weather[0].id;
  const condition = getConditionFromId(weatherId);
  const meta = CONDITION_META[condition];

  // ── 오늘의 최저/최고 기온 계산 ───────────────────────────
  // OpenWeatherMap의 forecast는 3시간 간격 예보를 줌
  // - "오늘"의 정의: KST 자정 ~ 다음 KST 자정
  // - 오늘 안의 예보 데이터 + 현재 기온을 모두 합쳐서 min/max 계산
  // - 만약 오늘 남은 예보 포인트가 부족하면(저녁 호출 등),
  //   가장 가까운 24시간 데이터로 fallback
  let tempMin = Math.round(data.main.temp);
  let tempMax = Math.round(data.main.temp);
  // 향후 12시간 예보 슬롯 (3시간 간격 × 4개)
  let forecastSummary: ForecastSlot[] = [];

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

      // ── 향후 12시간 (4슬롯) 예보 요약 ─────────────────
      forecastSummary = list.slice(0, 4).map((it) => {
        const dt = new Date(it.dt * 1000);
        // KST 시각으로 변환 (UTC+9)
        const kstHour = (dt.getUTCHours() + 9) % 24;
        const cond = getConditionFromId(it.weather[0]?.id ?? 800);
        return {
          hour: kstHour,
          condition: cond,
          conditionKo: CONDITION_META[cond].ko,
          temp: Math.round(it.main.temp),
          pop: it.pop ?? 0,
        };
      });

      // KST 기준 "오늘 끝(자정)" 계산
      const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const endOfTodayKstMs = Date.UTC(
        nowKst.getUTCFullYear(),
        nowKst.getUTCMonth(),
        nowKst.getUTCDate() + 1, // 다음 날 자정
      ) - 9 * 60 * 60 * 1000;

      // 오늘에 해당하는 예보 항목
      const todayItems = list.filter(item => item.dt * 1000 <= endOfTodayKstMs);

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
    forecast: forecastSummary.length > 0 ? forecastSummary : undefined,
    rainfall,
    ...airQuality,
  };

  weatherCache = { data: result, fetchedAt: Date.now() };
  return result;
}
