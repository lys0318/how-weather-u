import { WeatherInfo, outfitFor, computeUmbrella } from '../constants/weather';

// "오늘 3~11° · 따뜻하게 입어요 · 14시 뒤 비 70%, 우산 챙겨요 ☂️"
export function buildBriefLine(weather: WeatherInfo, lang: 'ko' | 'en', hour: number): string {
  const en = lang === 'en';
  const o = outfitFor(weather.tempMax);
  const outfitDesc = en ? o.en.desc : o.ko.desc;
  const u = computeUmbrella(weather, hour);
  const pct = Math.round(u.pop * 100);
  let umb = '';
  if (u.raining) {
    umb = en ? ' · Rain now, umbrella ☂️' : ' · 지금 비, 우산 챙겨요 ☂️';
  } else if (u.needed) {
    const h = u.hoursUntil ?? 0;
    umb = en
      ? ` · Rain in ${h}h${pct > 0 ? ` (${pct}%)` : ''} ☂️`
      : ` · ${h}시간 뒤 비${pct > 0 ? ` ${pct}%` : ''}, 우산 ☂️`;
  }
  const range = `${weather.tempMin}~${weather.tempMax}°`;
  return en ? `Today ${range} · ${outfitDesc}${umb}` : `오늘 ${range} · ${outfitDesc}${umb}`;
}
