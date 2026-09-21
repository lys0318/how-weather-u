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
  return fillMissingWeather(res.places ?? []);
}

// ── 지역 선택 ────────────────────────────────────────────────
export interface RegionItem { cd: string; nm: string }
export interface RegionGroup { regnCd: string; regnNm: string; list: RegionItem[] }

// 세종은 시도 코드 자체가 5자리라 시군구 체계에 안 맞는다 → 시청 좌표 기준 주변 보기로 대신한다
export const COORD_REGIONS: Record<string, { lat: number; lon: number }> = {
  '3611036110': { lat: 36.48, lon: 127.289 },
};

let regionCache: RegionGroup[] | null = null;

/** 시도/시군구 목록. 거의 안 바뀌므로 앱 실행 중엔 한 번만 받는다. */
export async function fetchRegions(): Promise<RegionGroup[]> {
  if (regionCache) return regionCache;
  const res = await callFunction<{ regions?: RegionGroup[]; error?: string }>('tour-map', { mode: 'regions' });
  if (res.error || !res.regions) throw new Error(res.error ?? 'regions');
  // '수원시'처럼 구를 가진 상위 시는 장소가 구 단위로만 달려 있어 고르면 비어 보인다 → 목록에서 뺀다
  regionCache = res.regions.map((g) => ({
    ...g,
    list: g.list.filter((r) => !g.list.some((o) => o !== r && o.nm.startsWith(`${r.nm} `))),
  }));
  return regionCache;
}

/** 고른 시군구의 장소 전체 (거리는 내 위치 기준) */
export async function fetchRegionPlaces(
  regionCd: string,
  ymd: string,
  me: { lat: number; lon: number } | null,
): Promise<MapPlace[]> {
  const res = await callFunction<MapResponse>('tour-map', {
    mode: 'region', regionCd, ymd, ...(me ? { lat: me.lat, lon: me.lon } : {}),
  });
  if (res.error) throw new Error(res.error);
  return fillMissingWeather(res.places ?? [], 12); // 군 단위는 넓어서 채우는 반경을 넓힌다
}

/** 장소들의 중앙값 좌표 — 평균은 원본의 튀는 좌표 하나에도 크게 끌려간다 */
export function medianCenter(places: MapPlace[]): { latitude: number; longitude: number } | null {
  if (places.length === 0) return null;
  const mid = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  return { latitude: mid(places.map((p) => p.lat)), longitude: mid(places.map((p) => p.lon)) };
}

/**
 * 서버는 기상청 호출을 아끼려고 격자 몇 칸만 받아온다.
 * 날씨가 빈 장소는 마커에 "--"로 보이므로, 5km 안의 가장 가까운 장소 날씨로 채운다.
 * (기상청 격자가 5km라 그 안에서는 사실상 같은 값)
 */
function fillMissingWeather(places: MapPlace[], maxKm = 5): MapPlace[] {
  const withWx = places.filter((p) => p.weather);
  if (withWx.length === 0) return places;
  return places.map((p) => {
    if (p.weather) return p;
    let best: MapPlace | null = null;
    let bestKm = maxKm;
    for (const q of withWx) {
      const km = Math.hypot((q.lat - p.lat) * 111, (q.lon - p.lon) * 88);
      if (km < bestKm) { bestKm = km; best = q; }
    }
    return best ? { ...p, weather: best.weather } : p;
  });
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
// 관광·기상 데이터가 모두 한국 시간 기준이라 기기 시간대와 무관하게 KST로 계산한다.
// (기기가 다른 시간대면 날짜가 하루 어긋나 날씨가 통째로 비어 보인다)
const kst = (now: Date) => new Date(now.getTime() + (9 * 60 + now.getTimezoneOffset()) * 60000);
const toYmd = (d: Date) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;

export function ymdFor(key: DayKey, now = new Date()): string {
  const k = kst(now);
  if (key === 'today') return toYmd(k);
  if (key === 'tomorrow') return toYmd(new Date(k.getTime() + 86400e3));
  // 주말 = 다가오는 토요일 (오늘이 토·일이면 오늘)
  const day = k.getDay();
  if (day === 6 || day === 0) return toYmd(k);
  return toYmd(new Date(k.getTime() + (6 - day) * 86400e3));
}

// ── 추천 (규칙 기반 — AI 호출 없음) ───────────────────────────
export type RecReason = 'rain' | 'hot' | 'cold' | 'quiet' | 'near';

export interface Recommendation {
  place: MapPlace;
  reason: RecReason;
}

/** 그 날 날씨가 실내를 부르는 상황인지 */
function weatherMood(w: MapPlaceWeather | null): RecReason | null {
  if (!w) return null;
  if (w.sky === 'rain' || w.sky === 'snow' || (w.pop ?? 0) >= 60) return 'rain';
  if ((w.tempMax ?? 0) >= 31) return 'hot';
  if ((w.tempMax ?? 99) <= 5) return 'cold';
  return null;
}

function score(p: MapPlace): number {
  let s = 0;

  // 한산할수록 좋다 — 이 기능의 핵심.
  // 혼잡을 모르는 곳은 "한산하다"고 말할 수 없으니 크게 깎는다(거리 점수에 밀려 뽑히던 문제).
  const lv = crowdLevel(p.crowdRate);
  s += lv === 'quiet' ? 30 : lv === 'normal' ? 12 : lv === 'busy' ? -12 : -25;

  // 날씨 궁합 — 비·폭염·추위엔 실내, 좋은 날엔 야외
  const mood = weatherMood(p.weather);
  if (mood) {
    if (p.indoor === true) s += mood === 'rain' ? 25 : 15;
    else if (p.indoor === false) s -= mood === 'rain' ? 20 : 10;
  } else if (p.weather) {
    if (p.indoor === false) s += 15;
    else if (p.indoor === true) s -= 5;
  }

  // 가까울수록 좋다 (30km에서 0점)
  s += 20 * (1 - Math.min(p.distanceM, 30000) / 30000);

  // 사진이 있으면 카드가 보기 좋다
  if (p.image) s += 3;

  return s;
}

/**
 * 상위 3곳 + 고른 이유.
 * - 지도를 멀리 옮겨도 추천은 "다녀올 만한 거리"여야 하므로 30km 안에서 고른다
 * - 혼잡을 아는 곳이 충분하면 그중에서만 고른다
 */
export function recommendPlaces(places: MapPlace[], maxKm = 30): Recommendation[] {
  const near = places.filter((p) => p.distanceM <= maxKm * 1000);
  const base = near.length >= 3 ? near : places;
  const known = base.filter((p) => p.crowdRate !== null);
  const pool = known.length >= 3 ? known : base;
  return [...pool]
    .sort((a, b) => score(b) - score(a))
    .slice(0, 3)
    .map((place) => {
      const mood = weatherMood(place.weather);
      if (mood && place.indoor === true) return { place, reason: mood };
      if (crowdLevel(place.crowdRate) === 'quiet') return { place, reason: 'quiet' as const };
      return { place, reason: 'near' as const };
    });
}
