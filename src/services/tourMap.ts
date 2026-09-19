// 날씨 맵 데이터 — 서버(tour-map)가 관광공사·기상청을 모아 캐시해 둔 걸 받아온다.
import { callFunction } from './backend';
import { WeatherCondition } from '../constants/weather';

export interface MapPlaceWeather {
  tempMin: number | null;
  tempMax: number | null;
  tempNow: number | null;
  sky: WeatherCondition;
  pop: number | null;
}

export interface MapPlace {
  id: string;
  title: string;
  lat: number;
  lon: number;
  distanceM: number;
  addr: string | null;
  image: string | null;
  indoor: boolean | null;
  contentTypeId: string;
  /** 0~100 혼잡 예측. 집중률 데이터에 없는 장소는 null */
  crowdRate: number | null;
  weather: MapPlaceWeather | null;
}

interface MapResponse {
  ymd: string;
  places: MapPlace[];
  stats?: { total: number; withCrowd: number; regions: number };
  error?: string;
}

export async function fetchMapPlaces(lat: number, lon: number, ymd: string): Promise<MapPlace[]> {
  const res = await callFunction<MapResponse>('tour-map', { lat, lon, ymd });
  if (res.error) throw new Error(res.error);
  return res.places ?? [];
}

// ── 혼잡도 등급 ──────────────────────────────────────────────
export type CrowdLevel = 'quiet' | 'normal' | 'busy' | 'unknown';

/** 집중률 0~100 → 3단계. 임계값은 데이터 분포(대부분 40~100)를 보고 정함 */
export function crowdLevel(rate: number | null): CrowdLevel {
  if (rate === null) return 'unknown';
  if (rate < 50) return 'quiet';
  if (rate < 80) return 'normal';
  return 'busy';
}

export const CROWD_COLOR: Record<CrowdLevel, string> = {
  quiet: '#4C6E6B',   // 차분한 청록 — 여유
  normal: '#C08A3E',  // 머스터드 — 보통
  busy: '#B25B4C',    // 점토색 — 붐빔
  unknown: '#9A9082', // 회색 — 정보 없음
};

// ── 날짜 선택 (오늘 / 내일 / 이번 주말) ────────────────────────
export type DayKey = 'today' | 'tomorrow' | 'weekend';

const pad2 = (n: number) => String(n).padStart(2, '0');
const toYmd = (d: Date) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;

export function ymdFor(key: DayKey, now = new Date()): string {
  if (key === 'today') return toYmd(now);
  if (key === 'tomorrow') return toYmd(new Date(now.getTime() + 86400e3));
  // 주말 = 다가오는 토요일 (오늘이 토·일이면 오늘)
  const day = now.getDay();
  if (day === 6 || day === 0) return toYmd(now);
  return toYmd(new Date(now.getTime() + (6 - day) * 86400e3));
}
