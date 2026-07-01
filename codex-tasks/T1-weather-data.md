# T1 — 날씨 데이터 확장 (시간별 1h + 주간 3~4일)

**의존 태스크**: 없음 (첫 번째로 작업)
**영향 받는 태스크**: T2, T3, T4 (이 타입을 사용)

## 목표

기존 `forecast` (3h×4슬롯, 엣지함수 payload용)는 **그대로 유지**하면서,
새로운 시간별(`hourly`) + 주간(`daily`) 필드를 `WeatherInfo`에 추가한다.
추가 API 없이 이미 받아오는 데이터에서 더 파싱한다.

## 수정 파일 1: `src/constants/weather.ts`

### 추가할 타입

```typescript
export interface HourlySlot {
  hour: number;           // KST 0~23
  condition: WeatherCondition;
  conditionKo: string;
  temp: number;
  pop: number;            // 0~1
}

export interface DailySlot {
  date: string;           // 'YYYYMMDD'
  weekdayIdx: number;     // 0(일)~6(토)
  tempMin: number;
  tempMax: number;
  condition: WeatherCondition;
  conditionKo: string;
  pop: number;            // 0~1, 하루 중 최대
}
```

### WeatherInfo에 필드 추가

기존 `forecast?: ForecastSlot[];` 아래에 추가:
```typescript
  hourly?: HourlySlot[];  // 1h 간격 ~24h (한국) 또는 3h 간격 (해외)
  daily?: DailySlot[];    // 오늘 포함 3~4일
```

### 생활지수 헬퍼 추가 (현재 HomeScreen에 있는 것을 이동)

HomeScreen에서 `computeUmbrella` 함수를 **이 파일로 이동**한다.
추가로 `laundryIndex`와 `maskIndex`를 신규 작성한다.

```typescript
/** 우산 필요 여부 (현재 + 향후 예보 기반) */
export function computeUmbrella(weather: WeatherInfo): { needed: boolean; reason: string } {
  // HomeScreen에서 이동 — 기존 로직 그대로
}

/** 빨래 지수 0~2 (0=좋음, 1=보통, 2=나쁨) */
export function laundryIndex(weather: WeatherInfo): { level: number; ko: string } {
  const rain = ['rain', 'drizzle', 'thunderstorm', 'snow'].includes(weather.condition);
  const highHumidity = weather.humidity > 75;
  if (rain) return { level: 2, ko: '비/눈으로 건조 어려움' };
  if (highHumidity) return { level: 1, ko: '습도 높아 건조 오래 걸림' };
  return { level: 0, ko: '건조하기 좋은 날' };
}

/** 마스크 필요도 0~2 (미세먼지 기반) */
export function maskIndex(weather: WeatherInfo): { level: number; ko: string } {
  const aq = airQualityGrade(weather.pm10, weather.pm25);
  if (!aq) return { level: 0, ko: '정보 없음' };
  if (aq.level >= 3) return { level: 2, ko: '마스크 필수' };
  if (aq.level >= 2) return { level: 1, ko: '마스크 권장' };
  return { level: 0, ko: '마스크 불필요' };
}
```

## 수정 파일 2: `src/services/kma.ts`

### 현재 코드 위치

`fetchKmaWeather` 함수 내부, 현재 `forecast` 빌드 부분 (라인 ~291~303):
```typescript
const forecast: ForecastSlot[] = [];
for (let i = 0; i < upcoming.length && forecast.length < 4; i += 3) {
  // 기존 코드 — 건드리지 말 것
}
```

### 추가할 코드 (forecast 빌드 직후에 추가)

```typescript
// ── 시간별 예보 (1h 간격, ~24h) ─────────────────────────────
const hourly: HourlySlot[] = upcoming.slice(0, 24).map((s) => {
  const cond = kmaToCondition(s.pty ?? '0', s.sky ?? '1');
  return {
    hour: parseInt(s.time.slice(0, 2), 10),
    condition: cond,
    conditionKo: CONDITION_META[cond].ko,
    temp: Math.round(s.tmp ?? temp),
    pop: (s.pop ?? 0) / 100,
  };
});

// ── 주간 예보 (날짜별 묶기, 3~4일) ──────────────────────────
const dayMap = new Map<string, { tmps: number[]; pops: number[]; sky: string; pty: string }>();
for (const s of sortedSlots) {
  if (!dayMap.has(s.date)) dayMap.set(s.date, { tmps: [], pops: [], sky: '1', pty: '0' });
  const d = dayMap.get(s.date)!;
  if (s.tmp !== undefined) d.tmps.push(s.tmp);
  if (s.pop !== undefined) d.pops.push(s.pop);
  if (s.sky) d.sky = s.sky;
  if (s.pty && s.pty !== '0') d.pty = s.pty;
}
const daily: DailySlot[] = Array.from(dayMap.entries())
  .slice(0, 4)
  .map(([date, d]) => {
    const cond = kmaToCondition(d.pty, d.sky);
    const jsDate = new Date(
      parseInt(date.slice(0, 4)), parseInt(date.slice(4, 6)) - 1, parseInt(date.slice(6, 8))
    );
    return {
      date,
      weekdayIdx: jsDate.getDay(),
      tempMin: Math.round(Math.min(...d.tmps)),
      tempMax: Math.round(Math.max(...d.tmps)),
      condition: cond,
      conditionKo: CONDITION_META[cond].ko,
      pop: Math.max(...d.pops) / 100,
    };
  });
```

### return 문 수정

기존 `return { ... forecast: ... }` 에 두 필드 추가:
```typescript
return {
  // ... 기존 필드들 ...
  forecast: forecast.length > 0 ? forecast : undefined,
  hourly: hourly.length > 0 ? hourly : undefined,   // 추가
  daily: daily.length > 0 ? daily : undefined,       // 추가
  // ... 기존 나머지 ...
};
```

### import 추가 필요

`kma.ts` 상단 import에 `HourlySlot`, `DailySlot` 추가:
```typescript
import {
  WeatherInfo,
  WeatherCondition,
  ForecastSlot,
  HourlySlot,   // 추가
  DailySlot,    // 추가
  CONDITION_META,
} from '../constants/weather';
```

## 수정 파일 3: `src/services/weather.ts` (OpenWeather 폴백)

`/forecast` 호출에서 cnt를 16→40으로 늘리고,
3h 슬롯에서 `hourly`(3h 간격)와 `daily`(날짜별 묶기)를 생성한다.

현재 `/forecast` 파라미터 부분을 찾아 `cnt=16` → `cnt=40`으로 변경한다.

그리고 기존 `forecast` 빌드 로직 뒤에 아래를 추가한다:

```typescript
// OpenWeather hourly (3h 간격)
const hourly: HourlySlot[] = list.slice(0, 8).map((item: any) => {
  const localHour = new Date(item.dt * 1000).getHours();
  const cond = getConditionFromId(item.weather?.[0]?.id ?? 800);
  return {
    hour: localHour,
    condition: cond,
    conditionKo: CONDITION_META[cond].ko,
    temp: Math.round(item.main?.temp ?? 0),
    pop: item.pop ?? 0,
  };
});

// OpenWeather daily (날짜별 묶기)
const owDayMap = new Map<string, { tmps: number[]; pops: number[]; cond: WeatherCondition }>();
for (const item of list) {
  const d = new Date(item.dt * 1000);
  const key = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  if (!owDayMap.has(key)) owDayMap.set(key, { tmps: [], pops: [], cond: 'clear' });
  const day = owDayMap.get(key)!;
  day.tmps.push(item.main?.temp ?? 0);
  day.pops.push(item.pop ?? 0);
  day.cond = getConditionFromId(item.weather?.[0]?.id ?? 800);
}
const daily: DailySlot[] = Array.from(owDayMap.entries()).slice(0, 4).map(([date, d]) => {
  const jsDate = new Date(parseInt(date.slice(0,4)), parseInt(date.slice(4,6))-1, parseInt(date.slice(6,8)));
  return {
    date,
    weekdayIdx: jsDate.getDay(),
    tempMin: Math.round(Math.min(...d.tmps)),
    tempMax: Math.round(Math.max(...d.tmps)),
    condition: d.cond,
    conditionKo: CONDITION_META[d.cond].ko,
    pop: Math.max(...d.pops),
  };
});
```

return 문에 `hourly`, `daily` 추가 (기존 `forecast` 옆에).

## 완료 기준

- `npx tsc --noEmit` 오류 없음
- `weather.hourly`에 ~24개 슬롯 (한국), `weather.daily`에 3~4개 슬롯
- 기존 `weather.forecast` (3h×4)는 변함없음
