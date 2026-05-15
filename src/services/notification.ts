import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

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

// ── 시간대별 알림 메시지 ──────────────────────────────────────
function getNotificationBody(hour: number): string {
  if (hour >= 5 && hour < 9)  return '좋은 아침이에요 ☀️ 오늘 날씨에 맞게 옷을 챙겨보세요';
  if (hour >= 9 && hour < 12) return '오전 날씨 확인해볼까요? 🌤️';
  if (hour >= 12 && hour < 14) return '점심 시간이에요 🍱 오늘 날씨는 어때요?';
  if (hour >= 14 && hour < 18) return '오후 날씨 메시지가 도착했어요 🌈';
  if (hour >= 18 && hour < 21) return '저녁이에요 🌙 오늘 하루 날씨는 어떠셨나요?';
  return '오늘 하루도 수고하셨어요 🌟';
}

// ── DND 체크 헬퍼 ────────────────────────────────────────────
function isInDnd(hour: number, start: number, end: number): boolean {
  const h = ((hour % 24) + 24) % 24;
  return start > end
    ? h >= start || h < end   // 자정 넘는 경우 (예: 23~06)
    : h >= start && h < end;
}

/**
 * 앱이 종료된 상태에서도 알림이 오도록
 * OS AlarmManager 기반 Date 트리거 알림 48개 예약
 * → expo-background-fetch 보다 훨씬 안정적
 */
export async function scheduleUpcomingNotifications(
  intervalHours: 1 | 2 | 3,
  dndEnabled: boolean,
  dndStart: number,
  dndEnd: number,
): Promise<void> {
  // 기존 예약 알림 전부 취소
  await Notifications.cancelAllScheduledNotificationsAsync();

  let nextTime = new Date();
  let scheduled = 0;
  const MAX = 48; // 최대 예약 개수

  while (scheduled < MAX) {
    nextTime = new Date(nextTime.getTime() + intervalHours * 60 * 60 * 1000);
    const hour = nextTime.getHours();

    // DND 시간대면 건너뜀
    if (dndEnabled && isInDnd(hour, dndStart, dndEnd)) continue;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: '하우웨더유',
        body: getNotificationBody(hour),
        sound: false,
      },
      trigger: { date: nextTime } as Notifications.DateTriggerInput,
    });
    scheduled++;
  }
}

/**
 * 남은 예약 알림이 적으면 자동으로 재예약 (앱 실행 시 호출)
 */
export async function refreshNotificationsIfNeeded(
  intervalHours: 1 | 2 | 3,
  dndEnabled: boolean,
  dndStart: number,
  dndEnd: number,
): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  // 5개 미만으로 남으면 && 이전에 설정한 적 있을 때만 재예약
  if (scheduled.length > 0 && scheduled.length < 5) {
    await scheduleUpcomingNotifications(intervalHours, dndEnabled, dndStart, dndEnd);
  }
}
