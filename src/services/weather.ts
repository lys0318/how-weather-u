import * as Location from 'expo-location';
import {
  WeatherInfo,
  getConditionFromId,
  CONDITION_META,
} from '../constants/weather';

const API_KEY = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY;
const BASE_URL = 'https://api.openweathermap.org/data/2.5';

export async function requestLocationPermission(): Promise<boolean> {
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

export async function fetchWeather(): Promise<WeatherInfo> {
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

  return {
    condition,
    conditionKo: meta.ko,
    emoji: meta.emoji,
    temp: Math.round(data.main.temp),
    city: data.name,
    description: data.weather[0].description,
  };
}
