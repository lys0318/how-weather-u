import {
  WeatherInfo,
  outfitFor,
  computeUmbrella,
  pickDayParts,
  collectAlerts,
} from '../constants/weather';
import { translate, getCurrentLang } from '../i18n';

// ── 문구 조립 (판정 로직은 constants/weather.ts) ──────────────

export type BriefLine = { kind: 'temp' | 'rain' | 'alert'; text: string };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * 오늘의 요약 브리핑 — 시간대별 기온 / 비 / 주의 항목.
 * 홈은 전체를, 알림·위젯은 buildBriefLine으로 앞 2줄만 쓴다.
 */
export function buildDailySummary(weather: WeatherInfo, currentHour: number): BriefLine[] {
  const lines: BriefLine[] = [];
  const en = getCurrentLang() === 'en';

  // 1) 시간대별 기온 흐름. 남은 시간대가 없으면(늦은 밤) 오늘 범위로 폴백.
  const parts = pickDayParts(weather, currentHour);
  if (parts.length > 0) {
    const text = parts
      .map((p) => {
        const o = outfitFor(p.temp);
        return translate(`brief.part${cap(p.key)}`, {
          temp: p.temp,
          mood: en ? o.en.name : o.ko.name,
        });
      })
      .join(' · ');
    lines.push({ kind: 'temp', text });
  } else {
    lines.push({
      kind: 'temp',
      text: translate('brief.range', { min: weather.tempMin, max: weather.tempMax }),
    });
  }

  // 2) 비 — 우산 판정은 기존 computeUmbrella 재사용(홈 배너와 동일 임계).
  const u = computeUmbrella(weather, currentHour);
  if (u.raining) {
    lines.push({ kind: 'rain', text: translate('brief.rainNow') });
  } else if (u.needed) {
    const pct = Math.round(u.pop * 100);
    const h = u.hoursUntil ?? 0;
    const absHour = currentHour + h;
    if (h >= 1 && absHour <= 23) {
      // 오늘 안이면 "15시부터", 자정을 넘으면 아래 "곧/시간 뒤" 표현으로
      lines.push({
        kind: 'rain',
        text: pct > 0
          ? translate('brief.rainFrom', { hour: absHour, pct })
          : translate('brief.rainFromNoPct', { hour: absHour }),
      });
    } else {
      lines.push({
        kind: 'rain',
        text: pct > 0 ? translate('brief.rainSoon', { pct }) : translate('brief.rainSoonNoPct'),
      });
    }
  }

  // 3) 주의 항목 (자외선/미세먼지/바람)
  const alerts = collectAlerts(weather);
  if (alerts.length > 0) {
    const list = alerts.map((a) => translate(`brief.alert${cap(a)}`)).join(' · ');
    lines.push({ kind: 'alert', text: translate('brief.alertLine', { list }) });
  }

  return lines;
}

/** 알림·위젯용 한 줄 요약 — 기온 흐름 + 비 소식까지만 (주의 항목은 길어서 제외) */
export function buildBriefLine(weather: WeatherInfo, currentHour: number): string {
  return buildDailySummary(weather, currentHour)
    .filter((l) => l.kind !== 'alert')
    .map((l) => l.text)
    .join(' · ');
}
