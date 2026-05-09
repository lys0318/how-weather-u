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

  // 현재 날씨 + 당일 예보 병렬 요청
  const [res, forecastRes] = await Promise.all([
    fetch(`${BASE_URL}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=kr`),
    fetch(`${BASE_URL}/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&cnt=8`),
  ]);

  if (!res.ok) {
    throw new Error(`날씨 데이터를 가져오지 못했습니다. (${res.status})`);
  }

  const data = await res.json();

  const weatherId: number = data.weather[0].id;
  const condition = getConditionFromId(weatherId);
  const meta = CONDITION_META[condition];

  // 예보 데이터로 오늘의 실제 최저/최고 계산
  let tempMin = Math.round(data.main.temp);
  let tempMax = Math.round(data.main.temp);

  if (forecastRes.ok) {
    try {
      const forecastData = await forecastRes.json();
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);

      type ForecastItem = { dt: number; main: { temp_min: number; temp_max: number } };
      const todayItems = (forecastData.list as ForecastItem[])
        .filter(item => new Date(item.dt * 1000) <= endOfToday);

      if (todayItems.length > 0) {
        const mins = todayItems.map(i => i.main.temp_min);
        const maxs = todayItems.map(i => i.main.temp_max);
        tempMin = Math.round(Math.min(data.main.temp, ...mins));
        tempMax = Math.round(Math.max(data.main.temp, ...maxs));
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
    tempMin,
    tempMax,
    city: data.name,
    description: data.weather[0].description,
  };

  weatherCache = { data: result, fetchedAt: Date.now() };
  return result;
}
