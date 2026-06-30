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

// 1시간 간격 시간별 예보 슬롯
export interface HourlySlot {
  hour: number;           // KST 0~23
  condition: WeatherCondition;
  conditionKo: string;
  temp: number;
  pop: number;            // 0~1
}

// 일별 예보 슬롯 (3~4일)
export interface DailySlot {
  date: string;           // 'YYYYMMDD'
  weekdayIdx: number;     // 0(일)~6(토)
  tempMin: number;
  tempMax: number;
  condition: WeatherCondition;
  conditionKo: string;
  pop: number;            // 0~1, 하루 중 최대
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
  // 향후 ~12시간 예보 요약 (활동/음식 추천에 사용) — 3시간 간격 최대 4개
  forecast?: ForecastSlot[];
  // 시간별/주간 예보 (홈 화면 표시용)
  hourly?: HourlySlot[];  // 1h 간격 ~24h (한국), 3h 간격 (해외)
  daily?: DailySlot[];    // 오늘 포함 3~4일
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

// ── 생활지수 헬퍼 ────────────────────────────────────────────

export interface UmbrellaInfo {
  needed: boolean;
  raining: boolean;       // 지금 비가 오는 중
  hoursUntil: number | null; // 비까지 남은 시간 (0=곧, null=불필요)
  pop: number;            // 해당 시점 강수 확률 0~1
}

/** 우산 필요 여부 — 지금 비/향후 12시간 예보 기반 (hourly 1h 우선, forecast 폴백) */
export function computeUmbrella(weather: WeatherInfo, currentHour: number): UmbrellaInfo {
  // 1) 지금 비가 오는 중
  if (['rain', 'drizzle', 'thunderstorm'].includes(weather.condition)) {
    return { needed: true, raining: true, hoursUntil: 0, pop: 1 };
  }
  // 2) 향후 예보 스캔 — 1시간 간격(hourly) 우선, 없으면 3시간(forecast)
  const slots = (weather.hourly?.length ? weather.hourly : weather.forecast) ?? [];
  for (const slot of slots) {
    let h = slot.hour - currentHour;
    if (h < 0) h += 24;
    if (h > 12) break; // 12시간 밖은 우산 알림 의미 없음 (슬롯은 시간순)
    const rainy = slot.condition === 'rain' || slot.condition === 'drizzle' || slot.condition === 'thunderstorm';
    if (rainy || slot.pop >= 0.3) {
      return { needed: true, raining: false, hoursUntil: h, pop: slot.pop };
    }
  }
  return { needed: false, raining: false, hoursUntil: null, pop: 0 };
}

/** 빨래 지수 0~2 (0=좋음, 1=보통, 2=나쁨) */
export function laundryIndex(weather: WeatherInfo): { level: number; ko: string } {
  const rain = ['rain', 'drizzle', 'thunderstorm', 'snow'].includes(weather.condition);
  if (rain) return { level: 2, ko: '비·눈엔 실내 건조' };
  if (weather.humidity > 75) return { level: 1, ko: '습해서 더디게 마름' };
  return { level: 0, ko: '잘 마르는 날' };
}

/** 마스크 필요도 0~2 (미세먼지 기반) */
export function maskIndex(weather: WeatherInfo): { level: number; ko: string } {
  const aq = airQualityGrade(weather.pm10, weather.pm25);
  if (!aq) return { level: 0, ko: '정보 없음' };
  if (aq.level >= 3) return { level: 2, ko: '마스크 필수' };
  if (aq.level >= 2) return { level: 1, ko: '마스크 권장' };
  return { level: 0, ko: '마스크 불필요' };
}

// ── 옷차림 추천 (기상청 체감온도 기준, 8단계) ─────────────────
export interface Outfit {
  emoji: string;
  ko: { name: string; desc: string; items: string[] };
  en: { name: string; desc: string; items: string[] };
}

// 더운 쪽(0) → 추운 쪽(끝) 순. 각 구간 minTemp 이상이면 매칭.
const OUTFIT_TABLE: { min: number; outfit: Outfit }[] = [
  { min: 28, outfit: { emoji: '🥵',
    ko: { name: '무더위', desc: '가볍고 통풍 좋은 옷이 좋아요', items: ['민소매', '반팔', '반바지', '린넨'] },
    en: { name: 'Sweltering', desc: 'Light, breezy clothes are best', items: ['Tank top', 'Tee', 'Shorts', 'Linen'] } } },
  { min: 23, outfit: { emoji: '👕',
    ko: { name: '더움', desc: '가볍게 입기 좋은 날이에요', items: ['반팔', '얇은 셔츠', '반바지', '면바지'] },
    en: { name: 'Warm', desc: 'A good day to dress light', items: ['Tee', 'Light shirt', 'Shorts', 'Chinos'] } } },
  { min: 20, outfit: { emoji: '🧣',
    ko: { name: '따뜻', desc: '얇은 겉옷 하나면 충분해요', items: ['긴팔', '얇은 가디건', '면바지', '청바지'] },
    en: { name: 'Mild', desc: 'A light layer is enough', items: ['Long sleeve', 'Cardigan', 'Chinos', 'Jeans'] } } },
  { min: 17, outfit: { emoji: '🧶',
    ko: { name: '선선', desc: '살짝 도톰하게 입어요', items: ['니트', '맨투맨', '가디건', '청바지'] },
    en: { name: 'Cool', desc: 'Go a little cozy', items: ['Knit', 'Sweatshirt', 'Cardigan', 'Jeans'] } } },
  { min: 12, outfit: { emoji: '🧥',
    ko: { name: '쌀쌀', desc: '겉옷을 꼭 챙기세요', items: ['자켓', '야상', '후드', '청바지'] },
    en: { name: 'Chilly', desc: 'Bring a jacket', items: ['Jacket', 'Field coat', 'Hoodie', 'Jeans'] } } },
  { min: 9, outfit: { emoji: '🧥',
    ko: { name: '추움', desc: '두툼한 겉옷이 필요해요', items: ['코트', '트렌치', '니트', '청바지'] },
    en: { name: 'Cold', desc: 'A warm coat is needed', items: ['Coat', 'Trench', 'Knit', 'Jeans'] } } },
  { min: 5, outfit: { emoji: '🧣',
    ko: { name: '많이 추움', desc: '단단히 챙겨 입어요', items: ['두꺼운 코트', '히트텍', '목도리', '기모'] },
    en: { name: 'Very cold', desc: 'Layer up well', items: ['Heavy coat', 'Thermal', 'Scarf', 'Fleece'] } } },
  { min: -100, outfit: { emoji: '🥶',
    ko: { name: '한파', desc: '꽁꽁 싸매고 나가세요', items: ['패딩', '목도리', '장갑', '기모'] },
    en: { name: 'Freezing', desc: 'Bundle up tight', items: ['Padding', 'Scarf', 'Gloves', 'Fleece'] } } },
];

/** 체감/기온(℃) → 옷차림 추천 */
export function outfitFor(tempC: number): Outfit {
  for (const entry of OUTFIT_TABLE) {
    if (tempC >= entry.min) return entry.outfit;
  }
  return OUTFIT_TABLE[OUTFIT_TABLE.length - 1].outfit;
}

// 생성 시 개인화 입력 (스펙 A)
export type Place = 'indoor' | 'outdoor' | 'random';
export type Social = 'solo' | 'group';
export type Cuisine = 'korean' | 'japanese' | 'chinese' | 'western';

export interface GenPrefs {
  place: Place;
  social: Social;
  cuisine: Cuisine;
}

export const DEFAULT_GEN_PREFS: GenPrefs = {
  place: 'random',
  social: 'solo',
  cuisine: 'korean',
};

export interface MsgInputs {
  mood?: string;
  situation?: string;
}
