import { WeatherInfo, CONDITION_META, getTimeOfDay, TIME_OF_DAY_KO } from '../constants/weather';
import { callFunction } from './backend';

export interface FoodRecommendation {
  text: string;
  generatedAt: Date;
  used?: number;
  limit?: number;
}

export async function generateFood(weather: WeatherInfo): Promise<FoodRecommendation> {
  const hour = new Date().getHours();
  // 향후 12시간 예보도 함께 전달 (예: 이따 비 올 예정 → 따뜻한 국물요리)
  const forecastPayload = (weather.forecast ?? []).map((f) => ({
    hour: f.hour,
    conditionKo: f.conditionKo,
    temp: f.temp,
    popPercent: Math.round(f.pop * 100),
  }));

  const res = await callFunction('generate-food', {
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
