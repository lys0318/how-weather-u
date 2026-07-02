import { WeatherInfo } from '../constants/weather';
import { StoredMessage, WidgetChoice, getMessages, getWidgetChoice, getLastWidgetWeather } from '../utils/storage';
import { buildBriefLine } from './brief';
import { getCurrentLang, translate } from '../i18n';
import { WidgetPayload, updateWidgetData } from './widget';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// 표시할 한 줄 결정 (순수 함수 — 테스트/추론 용이).
export function resolveWidgetLine(
  weather: WeatherInfo,
  choice: WidgetChoice,
  messages: StoredMessage[],
  lang: 'ko' | 'en',
  hour: number,
): string {
  if (choice.kind === 'message') return choice.text;
  if (choice.kind === 'auto') {
    const todayMsg = messages.find(
      (m) => (m.kind ?? 'message') === 'message' && m.generatedAt.slice(0, 10) === todayKey(),
    );
    if (todayMsg) return todayMsg.text;
  }
  return buildBriefLine(weather, lang, hour);
}

// 네이티브에 넘길 표시-준비 문자열 조립 (i18n은 여기서 처리).
export async function buildWidgetPayload(weather: WeatherInfo): Promise<WidgetPayload> {
  const lang = getCurrentLang();
  const [choice, messages] = await Promise.all([getWidgetChoice(), getMessages()]);
  let message = resolveWidgetLine(weather, choice, messages, lang, new Date().getHours());
  if (message.length > 90) message = message.slice(0, 88) + '…';
  const city = weather.city && weather.city !== '내 위치' ? weather.city : translate('weather.myLocation');
  return {
    head: `${weather.emoji} ${weather.temp}°`,
    city,
    range: translate('weather.tempRange', { min: weather.tempMin, max: weather.tempMax }),
    message,
  };
}

// 단일 진입점: 마지막 날씨 캐시로 위젯 즉시 갱신 (홈/설정/히스토리 공용).
// 날씨 캐시 없으면(앱 첫 실행 전) 조용히 skip — 다음 홈 방문 때 채워짐.
export async function pushWidget(): Promise<void> {
  const weather = await getLastWidgetWeather();
  if (!weather) return;
  await updateWidgetData(await buildWidgetPayload(weather));
}
