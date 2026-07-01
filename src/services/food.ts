import { WeatherInfo, getTimeOfDay, Cuisine } from '../constants/weather';
import { callFunction } from './backend';
import { getCurrentLang } from '../i18n';

export interface FoodRecommendation {
  text: string;
  generatedAt: Date;
  used?: number;
  limit?: number;
}

export async function generateFood(
  weather: WeatherInfo,
  prefs?: { cuisine: Cuisine },
): Promise<FoodRecommendation> {
  const hour = new Date().getHours();
  // 향후 12시간 예보도 함께 전달 — condition enum (서버가 언어별 라벨링)
  const forecastPayload = (weather.forecast ?? []).map((f) => ({
    hour: f.hour,
    condition: f.condition,
    temp: f.temp,
    popPercent: Math.round(f.pop * 100),
  }));

  const res = await callFunction('generate-food', {
    condition: weather.condition,
    timeOfDay: getTimeOfDay(hour),
    hour,
    temp: weather.temp,
    tempMin: weather.tempMin,
    tempMax: weather.tempMax,
    forecast: forecastPayload,
    uvIndex: weather.uvIndex,
    pm10: weather.pm10,
    pm25: weather.pm25,
    rainfall: weather.rainfall,
    cuisine: prefs?.cuisine,
    tzOffsetMinutes: -new Date().getTimezoneOffset(), // 현지 UTC offset(분), KST=540
    southern: typeof weather.lat === 'number' ? weather.lat < 0 : false, // 남반구 계절 반전
    lang: getCurrentLang(),
  });

  return { text: res.text, generatedAt: new Date(), used: res.used, limit: res.limit };
}
