import { WeatherInfo, getTimeOfDay } from '../constants/weather';
import { callFunction } from './backend';
import { getCurrentLang } from '../i18n';

export interface FortuneResult {
  text: string;
  generatedAt: Date;
  used?: number;
  limit?: number;
}

export async function generateFortune(weather: WeatherInfo): Promise<FortuneResult> {
  const hour = new Date().getHours();
  const res = await callFunction('generate-fortune', {
    condition: weather.condition,
    timeOfDay: getTimeOfDay(hour),
    hour,
    temp: weather.temp,
    tempMin: weather.tempMin,
    tempMax: weather.tempMax,
    uvIndex: weather.uvIndex,
    pm10: weather.pm10,
    pm25: weather.pm25,
    rainfall: weather.rainfall,
    lang: getCurrentLang(),
  });
  return { text: res.text, generatedAt: new Date(), used: res.used, limit: res.limit };
}
