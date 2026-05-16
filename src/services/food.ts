import { WeatherInfo, CONDITION_META, getTimeOfDay, TIME_OF_DAY_KO } from '../constants/weather';
import { callFunction } from './backend';

export interface FoodRecommendation {
  text: string;
  generatedAt: Date;
}

export async function generateFood(weather: WeatherInfo): Promise<FoodRecommendation> {
  const hour = new Date().getHours();
  const { text } = await callFunction<{ text: string }>('generate-food', {
    conditionKo: CONDITION_META[weather.condition].ko,
    timeOfDayKo: TIME_OF_DAY_KO[getTimeOfDay(hour)],
    hour,
    temp: weather.temp,
    tempMin: weather.tempMin,
    tempMax: weather.tempMax,
  });

  return { text, generatedAt: new Date() };
}
