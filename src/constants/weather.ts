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

export const PREFERENCE_EN: Record<Preference, string> = {
  comfort: 'Comfort',
  cheer:   'Cheer',
  advice:  'Advice',
};

export const PREFERENCE_EMOJI: Record<Preference, string> = {
  comfort: '💖',
  cheer:   '🔥',
  advice:  '💡',
};

export interface ForecastSlot {
  hour: number;           // KST 0~23
  condition: WeatherCondition; // 내부 enum (서버에서 언어별 라벨링)
  conditionKo: string;    // "비", "맑음" 등 (클라 표시용)
  temp: number;
  pop: number;            // 강수 확률 0~1
}

export interface WeatherInfo {
  condition: WeatherCondition;
  conditionKo: string;
  emoji: string;
  temp: number;
  feelsLike: number;     // 체감 온도
  tempMin: number;
  tempMax: number;
  humidity: number;      // 습도 (%)
  windSpeed: number;     // 풍속 (m/s)
  city: string;
  description: string;
  // 향후 ~12시간 예보 요약 (활동/음식 추천에 사용)
  // 3시간 간격으로 최대 4개 슬롯
  forecast?: ForecastSlot[];
  // ── 추가 지표 (Open-Meteo air-quality + 강수) ──────────────
  uvIndex?: number;      // 자외선 지수 (0~11+)
  pm10?: number;         // 미세먼지 PM10 (㎍/㎥)
  pm25?: number;         // 초미세먼지 PM2.5 (㎍/㎥)
  rainfall?: number;     // 1시간 강수량 (mm)
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

export const CONDITION_META: Record<WeatherCondition, { ko: string; en: string; emoji: string }> = {
  clear: { ko: '맑음', en: 'Clear', emoji: '☀️' },
  clouds: { ko: '흐림', en: 'Cloudy', emoji: '☁️' },
  rain: { ko: '비', en: 'Rain', emoji: '🌧️' },
  drizzle: { ko: '이슬비', en: 'Drizzle', emoji: '🌦️' },
  thunderstorm: { ko: '천둥번개', en: 'Thunderstorm', emoji: '⛈️' },
  snow: { ko: '눈', en: 'Snow', emoji: '❄️' },
  mist: { ko: '안개', en: 'Mist', emoji: '🌫️' },
  unknown: { ko: '알 수 없음', en: 'Unknown', emoji: '🌡️' },
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

export const TIME_OF_DAY_EN: Record<TimeOfDay, string> = {
  morning: 'morning',
  afternoon: 'afternoon',
  evening: 'evening',
  night: 'night',
};

export const DAY_OF_WEEK_KO = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

export const DAY_OF_WEEK_EN = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

// 홈 화면 날짜 표기용 짧은 영어 라벨
export const DAY_OF_WEEK_EN_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTH_EN_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// ── 자외선 지수 단계 (WHO/기상청 기준) ──────────────────────
export interface Graded { level: number; ko: string; en: string }

export function uvGrade(uv: number): Graded {
  if (uv < 3)  return { level: 0, ko: '낮음', en: 'Low' };
  if (uv < 6)  return { level: 1, ko: '보통', en: 'Moderate' };
  if (uv < 8)  return { level: 2, ko: '높음', en: 'High' };
  if (uv < 11) return { level: 3, ko: '매우 높음', en: 'Very high' };
  return { level: 4, ko: '위험', en: 'Extreme' };
}

// ── 미세먼지 단계 (한국 환경부 4단계, PM10/PM2.5 중 나쁜 쪽) ──
const PM_LABELS: Graded[] = [
  { level: 0, ko: '좋음', en: 'Good' },
  { level: 1, ko: '보통', en: 'Moderate' },
  { level: 2, ko: '나쁨', en: 'Unhealthy' },
  { level: 3, ko: '매우 나쁨', en: 'Very unhealthy' },
];

function pm10Level(v: number): number {
  if (v <= 30) return 0;
  if (v <= 80) return 1;
  if (v <= 150) return 2;
  return 3;
}
function pm25Level(v: number): number {
  if (v <= 15) return 0;
  if (v <= 35) return 1;
  if (v <= 75) return 2;
  return 3;
}

/** PM10/PM2.5 중 더 나쁜 등급을 반환. 둘 다 없으면 null. */
export function airQualityGrade(pm10?: number, pm25?: number): Graded | null {
  const levels: number[] = [];
  if (typeof pm10 === 'number') levels.push(pm10Level(pm10));
  if (typeof pm25 === 'number') levels.push(pm25Level(pm25));
  if (levels.length === 0) return null;
  return PM_LABELS[Math.max(...levels)];
}
