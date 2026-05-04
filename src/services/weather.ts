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

  const res = await fetch(
    `${BASE_URL}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=kr`
  );

  if (!res.ok) {
    throw new Error(`날씨 데이터를 가져오지 못했습니다. (${res.status})`);
  }

  const data = await res.json();

  const weatherId: number = data.weather[0].id;
  const condition = getConditionFromId(weatherId);
  const meta = CONDITION_META[condition];

  const result: WeatherInfo = {
    condition,
    conditionKo: meta.ko,
    emoji: meta.emoji,
    temp: Math.round(data.main.temp),
    tempMin: Math.round(data.main.temp_min),
    tempMax: Math.round(data.main.temp_max),
    city: data.name,
    description: data.weather[0].description,
  };

  weatherCache = { data: result, fetchedAt: Date.now() };
  return result;
}
