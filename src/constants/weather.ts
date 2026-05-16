export type WeatherCondition =
  | 'clear'
  | 'clouds'
  | 'rain'
  | 'drizzle'
  | 'thunderstorm'
  | 'snow'
  | 'mist'
  | 'unknown';

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export type Preference = 'comfort' | 'cheer' | 'advice';

export const PREFERENCE_KO: Record<Preference, string> = {
  comfort: '위로',
  cheer:   '응원',
  advice:  '조언',
};

export const PREFERENCE_EMOJI: Record<Preference, string> = {
  comfort: '💖',
  cheer:   '🔥',
  advice:  '💡',
};

export interface WeatherInfo {
  condition: WeatherCondition;
  conditionKo: string;
  emoji: string;
  temp: number;
  tempMin: number;
  tempMax: number;
  city: string;
  description: string;
}

// OpenWeatherMap weather ID → 앱 내부 condition 매핑
export function getConditionFromId(weatherId: number): WeatherCondition {
  if (weatherId >= 200 && weatherId < 300) return 'thunderstorm';
  if (weatherId >= 300 && weatherId < 400) return 'drizzle';
  if (weatherId >= 500 && weatherId < 600) return 'rain';
  if (weatherId >= 600 && weatherId < 700) return 'snow';
  if (weatherId >= 700 && weatherId < 800) return 'mist';
  if (weatherId === 800) return 'clear';
  if (weatherId > 800) return 'clouds';
  return 'unknown';
}

export const CONDITION_META: Record<WeatherCondition, { ko: string; emoji: string }> = {
  clear: { ko: '맑음', emoji: '☀️' },
  clouds: { ko: '흐림', emoji: '☁️' },
  rain: { ko: '비', emoji: '🌧️' },
  drizzle: { ko: '이슬비', emoji: '🌦️' },
  thunderstorm: { ko: '천둥번개', emoji: '⛈️' },
  snow: { ko: '눈', emoji: '❄️' },
  mist: { ko: '안개', emoji: '🌫️' },
  unknown: { ko: '알 수 없음', emoji: '🌡️' },
};

export function getTimeOfDay(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

export const TIME_OF_DAY_KO: Record<TimeOfDay, string> = {
  morning: '아침',
  afternoon: '오후',
  evening: '저녁',
  night: '밤',
};

export const DAY_OF_WEEK_KO = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
