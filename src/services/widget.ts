import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';
import React from 'react';
import { WeatherInfo } from '../constants/weather';
import { getMessages, getWidgetCache, setWidgetCache, WidgetCache } from '../utils/storage';
import { getCurrentLang } from '../i18n';
import { buildBriefLine } from './brief';
import { WeatherWidget } from '../widgets/WeatherWidget';

const WIDGET_NAME = 'WeatherWidget';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function resolveLine(weather: WeatherInfo): Promise<string> {
  try {
    const msgs = await getMessages();
    const todayMsg = msgs.find(
      (m) => (m.kind ?? 'message') === 'message' && m.generatedAt.slice(0, 10) === todayKey(),
    );
    if (todayMsg) return todayMsg.text;
  } catch {
    // 무시하고 브리핑으로 폴백
  }
  return buildBriefLine(weather, getCurrentLang(), new Date().getHours());
}

// 앱 실행 중(날씨 로드/메시지 생성 시) 호출 — 위젯 갱신 + 다음 헤드리스 렌더용 캐시 저장
export async function updateWidget(weather?: WeatherInfo): Promise<void> {
  if (Platform.OS !== 'android' || !weather) return;

  let line = await resolveLine(weather);
  if (line.length > 90) line = line.slice(0, 88) + '…';

  const data: WidgetCache = { emoji: weather.emoji, temp: `${weather.temp}°`, city: weather.city, line };
  await setWidgetCache(data);

  try {
    await requestWidgetUpdate({
      widgetName: WIDGET_NAME,
      renderWidget: () => React.createElement(WeatherWidget, data),
    });
  } catch {
    // 위젯 미추가 등 — 조용히 무시
  }
}

// 앱이 안 떠 있을 때 OS가 위젯을 그려야 할 때(추가/리사이즈/주기 갱신) — 마지막 캐시로 렌더
export async function renderWidgetFromCache(): Promise<React.JSX.Element> {
  const cache = await getWidgetCache();
  const en = getCurrentLang() === 'en';
  const data: WidgetCache = cache ?? {
    emoji: '🌤️',
    temp: '--',
    city: '',
    line: en ? 'Open the app to load today’s weather' : '앱을 열면 오늘 날씨가 표시돼요',
  };
  return React.createElement(WeatherWidget, data);
}
