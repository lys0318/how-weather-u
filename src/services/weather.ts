import * as Location from 'expo-location';
import {
  WeatherInfo,
  getConditionFromId,
  CONDITION_META,
} from '../constants/weather';

const API_KEY = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY;
const BASE_URL = 'https://api.openweathermap.org/data/2.5';

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
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return {
    lat: location.coords.latitude,
    lon: location.coords.longitude,
  };
}

export async function fetchWeather(forceRefresh = false): Promise<WeatherInfo> {
  // 캐시 유효하면 바로 반환
  if (!forceRefresh && weatherCache && Date.now() - weatherCache.fetchedAt < CACHE_TTL_MS) {
    return weatherCache.data;
  }

  const granted = await requestLocationPermission();
  if (!granted) {
    throw new Error('위치 권한이 필요합니다.');
  }

  const { lat, lon } = await getCurrentCoords();

  // 현재 날씨 + 48시간 예보 (16개 × 3시간 간격)
  const [res, forecastRes] = await Promise.all([
    fetch(`${BASE_URL}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=kr`),
    fetch(`${BASE_URL}/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&cnt=16`),
  ]);

  if (!res.ok) {
    throw new Error(`날씨 데이터를 가져오지 못했습니다. (${res.status})`);
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

  if (forecastRes.ok) {
    try {
      const forecastData = await forecastRes.json();
      type ForecastItem = {
        dt: number;
        main: { temp: number; temp_min: number; temp_max: number };
      };
      const list = forecastData.list as ForecastItem[];

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
    city: data.name,
    description: data.weather[0].description,
  };

  weatherCache = { data: result, fetchedAt: Date.now() };
  return result;
}
