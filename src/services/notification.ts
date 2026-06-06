import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getNotificationsEnabled, getNotifSlots, NotifSlot } from '../utils/storage';

// 시간대별 발송 시각 + 문구 (매일 반복)
export const SLOT_CONFIG: Record<
  NotifSlot,
  { label: string; hour: number; minute: number; title: string; body: string }
> = {
  morning: {
    label: '아침',
    hour: 8,
    minute: 0,
    title: '아침이에요 ☀️',
    body: '오늘의 날씨에 맞는 한마디, 받아보고 시작해요!',
  },
  lunch: {
    label: '점심',
    hour: 12,
    minute: 30,
    title: '점심 시간이에요 🍱',
    body: '잠깐 쉬어가며 메시지 한 줄 어떠세요?',
  },
  evening: {
    label: '저녁',
    hour: 19,
    minute: 0,
    title: '오늘 하루도 수고했어요 🌙',
    body: '제가 위로해드릴게요. 따뜻한 메시지 받아보세요.',
  },
};

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();

  if (existingStatus === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('weather-messages', {
      name: '날씨 메시지',
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
      title: `하우웨더유 ${emoji}`,
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
      title: '하우웨더유 🌤️',
      body: '테스트 알림이에요. 알림이 정상적으로 작동하고 있어요!',
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
export async function scheduleSlotNotifications(slots: NotifSlot[]): Promise<void> {
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
      try {
        await Notifications.scheduleNotificationAsync({
          content: { title: cfg.title, body: cfg.body, sound: false },
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
export async function refreshNotificationsIfNeeded(): Promise<void> {
  const enabled = await getNotificationsEnabled();
  if (!enabled) return;

  const slots = await getNotifSlots();
  if (slots.length === 0) return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  if (scheduled.length < slots.length) {
    await scheduleSlotNotifications(slots);
  }
}
