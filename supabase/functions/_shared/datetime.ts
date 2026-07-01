// KST 기준 요일/계절 계산 (Edge Function 공용)
// 서버에서 현재 날짜로 계산 → 클라이언트 변경/재빌드 불필요

import type { Lang } from './labels.ts';

const WEEKDAY: Record<Lang, string[]> = {
  ko: ['일', '월', '화', '수', '목', '금', '토'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

export interface KstContext {
  weekday: string;    // ko "월" / en "Monday"
  isWeekend: boolean;
  month: number;      // 1~12
  season: string;     // 봄/여름/... or Spring/Summer/...
  seasonHint: string; // 제철 힌트
}

const SEASON: Record<Lang, Record<string, { name: string; hint: string }>> = {
  ko: {
    spring: { name: '봄', hint: '봄 제철 — 냉이·달래·주꾸미·딸기 등' },
    summer: { name: '여름', hint: '여름 제철 — 콩국수·초당옥수수·복숭아·민어 등' },
    autumn: { name: '가을', hint: '가을 제철 — 전어·대하·꽃게·햇사과·고구마 등' },
    winter: { name: '겨울', hint: '겨울 제철 — 방어·굴·과메기·귤·시래기 등' },
  },
  en: {
    spring: { name: 'spring', hint: 'spring produce — strawberries, fresh greens, spring vegetables' },
    summer: { name: 'summer', hint: 'summer produce — corn, peaches, cold noodles, watermelon' },
    autumn: { name: 'autumn', hint: 'autumn produce — apples, sweet potato, pumpkin, seafood' },
    winter: { name: 'winter', hint: 'winter produce — citrus, oysters, root vegetables, hot stews' },
  },
};

// offsetMinutes = 현지 UTC offset(분). 기본 540(KST). 국내/구버전 클라는 540으로 동일 동작.
// southern = 남반구면 계절 반전(봄↔가을, 여름↔겨울).
export function getKstContext(lang: Lang = 'ko', offsetMinutes = 540, southern = false): KstContext {
  const off = typeof offsetMinutes === 'number' && Number.isFinite(offsetMinutes) ? offsetMinutes : 540;
  const local = new Date(Date.now() + off * 60 * 1000);
  const dow = local.getUTCDay();
  const month = local.getUTCMonth() + 1;
  let key = 'winter';
  if (month >= 3 && month <= 5) key = 'spring';
  else if (month >= 6 && month <= 8) key = 'summer';
  else if (month >= 9 && month <= 11) key = 'autumn';
  if (southern) {
    key = key === 'spring' ? 'autumn' : key === 'autumn' ? 'spring'
        : key === 'summer' ? 'winter' : 'summer';
  }
  const s = SEASON[lang][key];
  return {
    weekday: WEEKDAY[lang][dow],
    isWeekend: dow === 0 || dow === 6,
    month,
    season: s.name,
    seasonHint: s.hint,
  };
}
