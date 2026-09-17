import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getNotificationsEnabled, getNotifSlots, NotifSlot } from '../utils/storage';
import { translate, getCurrentLang } from '../i18n';
import { WeatherInfo, MONTH_EN_SHORT } from '../constants/weather';
import { buildBriefLine } from './brief';

// 시간대별 발송 시각 (문구는 현재 언어로 translate)
export const SLOT_CONFIG: Record<NotifSlot, { hour: number; minute: number }> = {
  morning: { hour: 7, minute: 0 },
  lunch: { hour: 12, minute: 30 },
  evening: { hour: 19, minute: 0 },
};

// 슬롯별 알림 제목/본문 i18n 키
const SLOT_TEXT_KEY: Record<NotifSlot, { title: string; body: string }> = {
  morning: { title: 'notif.morningTitle', body: 'notif.morningBody' },
  lunch: { title: 'notif.lunchTitle', body: 'notif.lunchBody' },
  evening: { title: 'notif.eveningTitle', body: 'notif.eveningBody' },
};

// 날씨 기반 아침 브리핑 본문 (옷차림 + 우산 한 방에) — 본문 로직은 위젯과 공유(brief.ts)
function buildBriefContent(weather: WeatherInfo, slot: NotifSlot): { title: string; body: string } {
  const title = `${translate('common.appName')} ${weather.emoji}`;
  const body = buildBriefLine(weather, SLOT_CONFIG[slot].hour);
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

// ── 구독 갱신 안내 (첫 갱신 2일 전 1회) ─────────────────────
// 날씨 알림과 달리 결제 관련 안내라, 날씨 알림을 끄거나 재예약해도 지워지지 않게 식별자로 분리한다.
const RENEWAL_ID = 'renewal-reminder';
const DAY_MS = 24 * 60 * 60 * 1000;

/** 날씨 알림만 취소 (갱신 안내는 유지) */
export async function cancelSlotNotifications(): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    all
      .filter((n) => n.identifier !== RENEWAL_ID)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

/** 첫 갱신 2일 전 오전 10시 발송 시각. 보낼 상황이 아니면 null. */
export function renewalReminderAt(
  state: { isPremium: boolean; expiresAt: number | null; willRenew: boolean; firstPeriod: boolean },
  now = Date.now(),
): Date | null {
  // 해지했거나(willRenew=false) 이미 한 번 갱신된 구독엔 보내지 않는다 — 매달 알리면 이탈만 늘어남
  if (!state.isPremium || !state.willRenew || !state.firstPeriod || state.expiresAt === null) return null;
  const at = new Date(state.expiresAt - 2 * DAY_MS);
  at.setHours(10, 0, 0, 0);
  return at.getTime() > now ? at : null; // 이미 지났으면 늦게 보내지 않음
}

/**
 * 구독 상태가 바뀔 때마다(앱 실행·구매·해지 감지) 호출.
 * 항상 기존 예약을 지우고 다시 판단하므로, 해지가 확인되면 안내도 사라진다.
 * ponytail: 앱을 안 열고 스토어에서 해지하면 예약이 남아 있을 수 있음 → 문구를 "구독 중이라면"으로 완곡하게.
 * 서버 푸시(RevenueCat 웹훅)로 옮기면 해결되며, 구독자가 늘면 그때 전환.
 */
export async function syncRenewalReminder(
  state: Parameters<typeof renewalReminderAt>[0],
): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(RENEWAL_ID);
    const at = renewalReminderAt(state);
    if (!at || state.expiresAt === null) return;
    const renew = new Date(state.expiresAt);
    const date = getCurrentLang() === 'en'
      ? `${MONTH_EN_SHORT[renew.getMonth()]} ${renew.getDate()}`
      : `${renew.getMonth() + 1}월 ${renew.getDate()}일`;
    await Notifications.scheduleNotificationAsync({
      identifier: RENEWAL_ID,
      content: {
        title: translate('notif.renewalTitle'),
        body: translate('notif.renewalBody', { date }),
        sound: false,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
    });
  } catch (e) {
    console.warn('[syncRenewalReminder] skip', e);
  }
}

// 아침 브리핑 미리보기 — 현재 날씨로 브리핑 알림 즉시 발송 (테스트/확인용)
export async function sendBriefPreview(weather?: WeatherInfo): Promise<void> {
  const h = new Date().getHours();
  const slot: NotifSlot = h < 11 ? 'morning' : h < 16 ? 'lunch' : 'evening';
  const content = weather
    ? buildBriefContent(weather, slot)
    : { title: `${translate('common.appName')} 🌤️`, body: translate('notif.testBody') };
  await Notifications.scheduleNotificationAsync({
    content: { title: content.title, body: content.body, sound: false },
    trigger: null, // 즉시
  });
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
    await cancelSlotNotifications();
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
  const scheduled = (await Notifications.getAllScheduledNotificationsAsync())
    .filter((n) => n.identifier !== RENEWAL_ID); // 갱신 안내는 개수에서 제외
  if (scheduled.length < slots.length) {
    await scheduleSlotNotifications(slots);
  }
}
