// KST 기준 요일/계절 계산 (Edge Function 공용)
// 서버에서 현재 날짜로 계산 → 클라이언트 변경/재빌드 불필요

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

export interface KstContext {
  weekday: string;   // 예: "월"
  isWeekend: boolean;
  month: number;     // 1~12
  season: string;    // 봄/여름/가을/겨울
  seasonHint: string; // 제철 힌트
}

const SEASON_HINT: Record<string, string> = {
  봄: '봄 제철 — 냉이·달래·주꾸미·딸기 등',
  여름: '여름 제철 — 콩국수·초당옥수수·복숭아·민어 등',
  가을: '가을 제철 — 전어·대하·꽃게·햇사과·고구마 등',
  겨울: '겨울 제철 — 방어·굴·과메기·귤·시래기 등',
};

export function getKstContext(): KstContext {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const dow = kst.getUTCDay();
  const month = kst.getUTCMonth() + 1;
  let season = '겨울';
  if (month >= 3 && month <= 5) season = '봄';
  else if (month >= 6 && month <= 8) season = '여름';
  else if (month >= 9 && month <= 11) season = '가을';
  return {
    weekday: WEEKDAY_KO[dow],
    isWeekend: dow === 0 || dow === 6,
    month,
    season,
    seasonHint: SEASON_HINT[season],
  };
}
