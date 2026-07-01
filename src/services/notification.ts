import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getNotificationsEnabled, getNotifSlots, NotifSlot } from '../utils/storage';
import { translate, getCurrentLang } from '../i18n';
import { WeatherInfo, outfitFor, computeUmbrella } from '../constants/weather';

// 시간대별 발송 시각 (문구는 현재 언어로 translate)
export const SLOT_CONFIG: Record<NotifSlot, { hour: number; minute: number }> = {
  morning: { hour: 8, minute: 0 },
  lunch: { hour: 12, minute: 30 },
  evening: { hour: 19, minute: 0 },
};

// 슬롯별 알림 제목/본문 i18n 키
const SLOT_TEXT_KEY: Record<NotifSlot, { title: string; body: string }> = {
  morning: { title: 'notif.morningTitle', body: 'notif.morningBody' },
  lunch: { title: 'notif.lunchTitle', body: 'notif.lunchBody' },
  evening: { title: 'notif.eveningTitle', body: 'notif.eveningBody' },
};

// 날씨 기반 아침 브리핑 본문 (옷차림 + 우산 한 방에)
function buildBriefContent(weather: WeatherInfo, slot: NotifSlot): { title: string; body: string } {
  const en = getCurrentLang() === 'en';
  const cfg = SLOT_CONFIG[slot];
  const o = outfitFor(weather.tempMax);
  const outfitDesc = en ? o.en.desc : o.ko.desc;
  const u = computeUmbrella(weather, cfg.hour);
  const pct = Math.round(u.pop * 100);
  let umb = '';
  if (u.raining) {
    umb = en ? ' · Rain now — grab an umbrella ☂️' : ' · 지금 비 와요, 우산 챙겨요 ☂️';
  } else if (u.needed) {
    const h = u.hoursUntil ?? 0;
    umb = en
      ? ` · Rain in ${h}h${pct > 0 ? ` (${pct}%)` : ''} — umbrella ☂️`
      : ` · ${h}시간 뒤 비${pct > 0 ? ` ${pct}%` : ''}, 우산 챙겨요 ☂️`;
  }
  const range = `${weather.tempMin}~${weather.tempMax}°`;
  const title = `${translate('common.appName')} ${weather.emoji}`;
  const body = en ? `Today ${range} · ${outfitDesc}${umb}` : `오늘 ${range} · ${outfitDesc}${umb}`;
  return { title, body };
}

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();

  if (existingStatus === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('weather-messages', {
      name: translate('notif.channelName'),
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250],
      lightColor: '#FFFFFF',
    });
  }

  return status === 'granted';
}

export async function sendLocalNotification(message: string, emoji: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${translate('common.appName')} ${emoji}`,
      body: message,
      sound: false,
    },
    trigger: null, // 즉시 발송
  });
}

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function sendTestNotification(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${translate('common.appName')} 🌤️`,
      body: translate('notif.testBody'),
      sound: false,
    },
    trigger: null,
  });
}

/**
 * 동시 호출 방지 락 (module-level).
 * SettingsScreen 토글 + HomeScreen 마운트 + 포커스 등이
 * 동시에 scheduleSlotNotifications를 호출할 때 중복 예약 방지.
 */
let schedulingLock: Promise<void> | null = null;

/**
 * 선택된 시간대(slots)에 매일 반복되는 알림 예약.
 * - DAILY 트리거를 사용해 매일 자동 반복 (앱 종료 상태에서도 OS가 띄움)
 * - 호출 전 기존 예약은 모두 취소
 */
export async function scheduleSlotNotifications(slots: NotifSlot[], weather?: WeatherInfo): Promise<void> {
  if (schedulingLock) {
    try { await schedulingLock; } catch {}
    return;
  }

  schedulingLock = (async () => {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (slots.length === 0) return;

    for (const slot of slots) {
      const cfg = SLOT_CONFIG[slot];
      if (!cfg) continue;
      // 날씨 있으면 옷차림+우산 브리핑, 없으면 기존 정적 문구
      const content = weather
        ? buildBriefContent(weather, slot)
        : { title: translate(SLOT_TEXT_KEY[slot].title), body: translate(SLOT_TEXT_KEY[slot].body) };
      try {
        await Notifications.scheduleNotificationAsync({
          content: { title: content.title, body: content.body, sound: false },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: cfg.hour,
            minute: cfg.minute,
          },
        });
      } catch (err) {
        console.warn('[scheduleSlotNotifications] skip', slot, err);
      }
    }
  })();

  try { await schedulingLock; } finally { schedulingLock = null; }
}

/**
 * 앱 실행/포커스 시 호출. 알림이 켜져 있고 슬롯이 있는데
 * 실제 예약된 게 없거나 부족하면 자동으로 재예약.
 * (사용자가 끈 상태면 건너뜀)
 */
export async function refreshNotificationsIfNeeded(weather?: WeatherInfo): Promise<void> {
  const enabled = await getNotificationsEnabled();
  if (!enabled) return;

  const slots = await getNotifSlots();
  if (slots.length === 0) return;

  // 날씨가 있으면 최신 날씨로 브리핑 본문 갱신 재예약. 없으면 개수 부족 시에만 보충.
  if (weather) {
    await scheduleSlotNotifications(slots, weather);
    return;
  }
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  if (scheduled.length < slots.length) {
    await scheduleSlotNotifications(slots);
  }
}
