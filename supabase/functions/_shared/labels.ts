// Edge Function 공용 — 날씨/시간/지표 라벨 (ko/en)
// 클라이언트는 enum/숫자만 보내고, 서버가 lang에 맞춰 사람이 읽는 문자열로 변환.

export type Lang = 'ko' | 'en';

const CONDITION: Record<Lang, Record<string, string>> = {
  ko: {
    clear: '맑음', clouds: '흐림', rain: '비', drizzle: '이슬비',
    thunderstorm: '천둥번개', snow: '눈', mist: '안개', unknown: '알 수 없음',
  },
  en: {
    clear: 'clear', clouds: 'cloudy', rain: 'rain', drizzle: 'drizzle',
    thunderstorm: 'thunderstorm', snow: 'snow', mist: 'misty', unknown: 'unknown',
  },
};

const TIME_OF_DAY: Record<Lang, Record<string, string>> = {
  ko: { morning: '아침', afternoon: '오후', evening: '저녁', night: '밤' },
  en: { morning: 'morning', afternoon: 'afternoon', evening: 'evening', night: 'night' },
};

const DOW: Record<Lang, string[]> = {
  ko: ['일', '월', '화', '수', '목', '금', '토'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

export function conditionLabel(lang: Lang, c: string): string {
  return CONDITION[lang][c] ?? CONDITION[lang].unknown;
}
export function timeOfDayLabel(lang: Lang, t: string): string {
  return TIME_OF_DAY[lang][t] ?? ''; // 미지 입력 원문 echo 방지 (프롬프트 주입 차단)
}
export function dowLabel(lang: Lang, n: number): string {
  return DOW[lang][n] ?? '';
}

// ── 자외선 지수 단계 ─────────────────────────────────────────
export function uvLabel(lang: Lang, uv: number): string {
  const ko = uv < 3 ? '낮음' : uv < 6 ? '보통' : uv < 8 ? '높음' : uv < 11 ? '매우 높음' : '위험';
  const en = uv < 3 ? 'low' : uv < 6 ? 'moderate' : uv < 8 ? 'high' : uv < 11 ? 'very high' : 'extreme';
  return lang === 'ko' ? ko : en;
}

// ── 미세먼지 단계 (PM10/PM2.5 중 나쁜 쪽, 한국 기준) ──────────
export function pmLabel(lang: Lang, pm10?: number, pm25?: number): string | null {
  const lv: number[] = [];
  if (typeof pm10 === 'number') lv.push(pm10 <= 30 ? 0 : pm10 <= 80 ? 1 : pm10 <= 150 ? 2 : 3);
  if (typeof pm25 === 'number') lv.push(pm25 <= 15 ? 0 : pm25 <= 35 ? 1 : pm25 <= 75 ? 2 : 3);
  if (lv.length === 0) return null;
  const level = Math.max(...lv);
  const ko = ['좋음', '보통', '나쁨', '매우 나쁨'][level];
  const en = ['good', 'moderate', 'unhealthy', 'very unhealthy'][level];
  return lang === 'ko' ? ko : en;
}

// ── 추가 지표(UV/미세먼지/강수량)를 프롬프트 라인으로 ─────────
export interface Metrics {
  uvIndex?: number;
  pm10?: number;
  pm25?: number;
  rainfall?: number;
}

export function metricLines(lang: Lang, m: Metrics): string {
  const lines: string[] = [];
  if (typeof m.uvIndex === 'number') {
    lines.push(
      lang === 'ko'
        ? `- 자외선 지수: ${Math.round(m.uvIndex)} (${uvLabel('ko', m.uvIndex)})`
        : `- UV index: ${Math.round(m.uvIndex)} (${uvLabel('en', m.uvIndex)})`,
    );
  }
  const pm = pmLabel(lang, m.pm10, m.pm25);
  if (pm) {
    const detail: string[] = [];
    if (typeof m.pm10 === 'number') detail.push(`PM10 ${m.pm10}`);
    if (typeof m.pm25 === 'number') detail.push(`PM2.5 ${m.pm25}`);
    lines.push(
      lang === 'ko'
        ? `- 미세먼지: ${pm}${detail.length ? ` (${detail.join(', ')} ㎍/㎥)` : ''}`
        : `- Air quality: ${pm}${detail.length ? ` (${detail.join(', ')} µg/m³)` : ''}`,
    );
  }
  if (typeof m.rainfall === 'number' && m.rainfall > 0) {
    lines.push(
      lang === 'ko'
        ? `- 현재 강수량: ${m.rainfall}mm (지금 비가 내리는 중)`
        : `- Current rainfall: ${m.rainfall}mm (it's raining now)`,
    );
  }
  return lines.join('\n');
}
