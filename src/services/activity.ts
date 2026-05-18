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
  const res = await callFunction('generate-activity', {
    conditionKo: CONDITION_META[weather.condition].ko,
    timeOfDayKo: TIME_OF_DAY_KO[getTimeOfDay(hour)],
    hour,
    temp: weather.temp,
    tempMin: weather.tempMin,
    tempMax: weather.tempMax,
  });

  return { text: res.text, generatedAt: new Date(), used: res.used, limit: res.limit };
}
