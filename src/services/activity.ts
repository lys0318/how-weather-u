import { WeatherInfo, CONDITION_META, getTimeOfDay, TIME_OF_DAY_KO } from '../constants/weather';
import { callFunction } from './backend';

export interface ActivityRecommendation {
  text: string;
  generatedAt: Date;
}

export async function generateActivity(weather: WeatherInfo): Promise<ActivityRecommendation> {
  const hour = new Date().getHours();
  const { text } = await callFunction<{ text: string }>('generate-activity', {
    conditionKo: CONDITION_META[weather.condition].ko,
    timeOfDayKo: TIME_OF_DAY_KO[getTimeOfDay(hour)],
    hour,
    temp: weather.temp,
    tempMin: weather.tempMin,
    tempMax: weather.tempMax,
  });

  return { text, generatedAt: new Date() };
}
