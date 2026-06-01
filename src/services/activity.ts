import { WeatherInfo, CONDITION_META, getTimeOfDay, TIME_OF_DAY_KO } from '../constants/weather';
import { callFunction } from './backend';

export interface ActivityRecommendation {
  text: string;
  generatedAt: Date;
  used?: number;
  limit?: number;
}

export async function generateActivity(weather: WeatherInfo): Promise<ActivityRecommendation> {
  const hour = new Date().getHours();
  // 향후 12시간 예보 요약 (Edge Function에 전달해 활동 추천에 반영)
  // 형식: { hour, conditionKo, temp, popPercent }
  const forecastPayload = (weather.forecast ?? []).map((f) => ({
    hour: f.hour,
    conditionKo: f.conditionKo,
    temp: f.temp,
    popPercent: Math.round(f.pop * 100),
  }));

  const res = await callFunction('generate-activity', {
    conditionKo: CONDITION_META[weather.condition].ko,
    timeOfDayKo: TIME_OF_DAY_KO[getTimeOfDay(hour)],
    hour,
    temp: weather.temp,
    tempMin: weather.tempMin,
    tempMax: weather.tempMax,
    forecast: forecastPayload,
  });

  return { text: res.text, generatedAt: new Date(), used: res.used, limit: res.limit };
}
