import { WeatherInfo, getTimeOfDay, Place, Social } from '../constants/weather';
import { callFunction } from './backend';
import { getCurrentLang } from '../i18n';

export interface ActivityRecommendation {
  text: string;
  generatedAt: Date;
  used?: number;
  limit?: number;
}

export async function generateActivity(
  weather: WeatherInfo,
  prefs?: { place: Place; social: Social },
): Promise<ActivityRecommendation> {
  const hour = new Date().getHours();
  // 향후 12시간 예보 요약 — condition enum으로 전달 (서버가 언어별 라벨링)
  const forecastPayload = (weather.forecast ?? []).map((f) => ({
    hour: f.hour,
    condition: f.condition,
    temp: f.temp,
    popPercent: Math.round(f.pop * 100),
  }));

  const res = await callFunction('generate-activity', {
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
    place: prefs?.place,
    social: prefs?.social,
    tzOffsetMinutes: -new Date().getTimezoneOffset(), // 현지 UTC offset(분), KST=540
    lang: getCurrentLang(),
  });

  return { text: res.text, generatedAt: new Date(), used: res.used, limit: res.limit };
}
