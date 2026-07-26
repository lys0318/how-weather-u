import {
  WeatherInfo,
  CONDITION_META,
  outfitFor,
  computeUmbrella,
  pickDayParts,
  pickDayPartSlots,
  dominantCondition,
  humidityLevel,
  isWideTempRange,
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

// ── 홈 화면용 상세 브리핑 (기상캐스터 톤) ─────────────────────

export type CasterLine = { kind: 'temp' | 'sky' | 'rain' | 'air' | 'closing'; text: string };

/**
 * 문장형 브리핑. 시각·기온을 짚어주고 하늘/습도/주의사항까지 이어서 말한다.
 * 알림·위젯은 여전히 buildBriefLine(축약형)을 쓴다.
 */
export function buildCasterBrief(weather: WeatherInfo, currentHour: number): CasterLine[] {
  const lines: CasterLine[] = [];
  const en = getCurrentLang() === 'en';

  // 1) 시간대별 기온 — "아침 8시에는 22도로 선선하고,"
  const slots = pickDayPartSlots(weather, currentHour);
  if (slots.length > 0) {
    const parts = slots.map((s, i) => {
      const o = outfitFor(s.temp);
      const mood = en ? o.en.name : o.ko.name;
      // 마지막 조각만 문장을 맺는 어미를 쓴다
      const last = i === slots.length - 1;
      return translate(`caster.part${cap(s.key)}${last ? 'End' : ''}`, {
        hour: s.hour,
        temp: s.temp,
        mood,
      });
    });
    lines.push({ kind: 'temp', text: parts.join(' ') });
  } else {
    lines.push({
      kind: 'temp',
      text: translate('caster.rangeOnly', { min: weather.tempMin, max: weather.tempMax }),
    });
  }

  // 일교차가 크면 한마디 덧붙임
  if (isWideTempRange(weather)) {
    lines.push({
      kind: 'temp',
      text: translate('caster.wideRange', { min: weather.tempMin, max: weather.tempMax }),
    });
  }

  // 2) 하늘 상태 — 오늘 대부분을 차지하는 컨디션
  const dom = dominantCondition(weather, currentHour);
  const meta = CONDITION_META[dom.condition];
  lines.push({
    kind: 'sky',
    // 70% 이상이면 "하루 종일", 아니면 "대체로"
    text: translate(dom.ratio >= 0.7 ? 'caster.skyAllDay' : 'caster.skyMostly', {
      sky: en ? meta.en.toLowerCase() : meta.ko,
    }),
  });

  // 3) 비 — 시각을 명시
  const u = computeUmbrella(weather, currentHour);
  if (u.raining) {
    lines.push({ kind: 'rain', text: translate('caster.rainNow') });
  } else if (u.needed) {
    const pct = Math.round(u.pop * 100);
    const h = u.hoursUntil ?? 0;
    const absHour = currentHour + h;
    if (h >= 1 && absHour <= 23) {
      lines.push({ kind: 'rain', text: translate('caster.rainFrom', { hour: absHour, pct }) });
    } else {
      lines.push({ kind: 'rain', text: translate('caster.rainSoon', { pct }) });
    }
  }

  // 4) 습도 — 체감에 영향이 큰 구간만 언급
  const hl = humidityLevel(weather.humidity);
  if (hl !== 1) {
    const key = hl === 0 ? 'humidDry' : hl === 2 ? 'humidMuggy' : 'humidVery';
    lines.push({ kind: 'air', text: translate(`caster.${key}`, { pct: weather.humidity }) });
  }

  // 5) 주의 항목 (자외선/미세먼지/바람)
  const alerts = collectAlerts(weather);
  if (alerts.length > 0) {
    const list = alerts.map((a) => translate(`brief.alert${cap(a)}`)).join(', ');
    lines.push({ kind: 'air', text: translate('caster.alertLine', { list }) });
  }

  // 6) 마무리 — 옷차림 한마디
  const o = outfitFor(weather.feelsLike);
  lines.push({
    kind: 'closing',
    text: translate('caster.closing', { advice: en ? o.en.desc : o.ko.desc }),
  });

  return lines;
}
