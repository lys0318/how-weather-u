import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getNotificationsEnabled } from '../utils/storage';

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

// ── 시간대별 알림 메시지 (메시지 생성 유도형) ─────────────────
function getNotificationContent(hour: number): { title: string; body: string } {
  if (hour >= 5 && hour < 9) {
    return {
      title: '아침이에요 ☀️',
      body: '오늘의 메시지를 받아보세요! 응원 한마디 어떠세요?',
    };
  }
  if (hour >= 9 && hour < 12) {
    return {
      title: '오전 한 잔 어떠세요? ☕',
      body: '날씨에 맞는 메시지를 받아보세요',
    };
  }
  if (hour >= 12 && hour < 14) {
    return {
      title: '점심 시간이에요 🍱',
      body: '잠깐 쉬어가며 메시지 한 줄 어떠세요?',
    };
  }
  if (hour >= 14 && hour < 18) {
    return {
      title: '오후엔 조언 한 줄? 💡',
      body: '오늘 어떻게 보내면 좋을지 추천 받아보세요',
    };
  }
  if (hour >= 18 && hour < 21) {
    return {
      title: '수고했어요 🌙',
      body: '제가 위로해드릴게요. 위로 메시지를 받아보세요!',
    };
  }
  return {
    title: '오늘 하루도 수고했어요 🌟',
    body: '잠들기 전 따뜻한 메시지 한 줄 받아보세요',
  };
}

// ── DND 체크 헬퍼 ────────────────────────────────────────────
function isInDnd(hour: number, start: number, end: number): boolean {
  const h = ((hour % 24) + 24) % 24;
  return start > end
    ? h >= start || h < end   // 자정 넘는 경우 (예: 23~06)
    : h >= start && h < end;
}

/**
 * 동시 호출 방지 락 (module-level).
 * HomeScreen 마운트 + SettingsScreen 마운트 + Pull-to-refresh 등이
 * 동시에 scheduleUpcomingNotifications를 호출할 때,
 * 두 loop이 cancelAll → 새로 schedule 하는 사이의 race로
 * 같은 시각 근처에 알림이 2~3개씩 중복 예약되는 버그가 있었음.
 * 락으로 단일 실행 보장.
 */
let schedulingLock: Promise<void> | null = null;

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
  // 이미 다른 호출이 진행 중이면 그 결과를 기다린 뒤 종료
  // (이 호출은 중복 작업이므로 새로 schedule 하지 않음)
  if (schedulingLock) {
    try { await schedulingLock; } catch {}
    return;
  }

  schedulingLock = (async () => {
    // 기존 예약 알림 전부 취소
    await Notifications.cancelAllScheduledNotificationsAsync();

    let nextTime = new Date();
    let scheduled = 0;
    let attempts = 0;
    const MAX = 48; // 최대 예약 개수
    const MAX_ATTEMPTS = 200; // 무한루프 방지

    while (scheduled < MAX && attempts < MAX_ATTEMPTS) {
      attempts++;
      nextTime = new Date(nextTime.getTime() + intervalHours * 60 * 60 * 1000);
      const hour = nextTime.getHours();

      // DND 시간대면 건너뜀
      if (dndEnabled && isInDnd(hour, dndStart, dndEnd)) continue;

      try {
        const { title, body } = getNotificationContent(hour);
        await Notifications.scheduleNotificationAsync({
          content: {
            title,
            body,
            sound: false,
          },
          // expo-notifications 0.32.x 정식 트리거 포맷
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: nextTime,
          },
        });
        scheduled++;
      } catch (err) {
        // 개별 알림 실패는 무시하고 다음으로
        console.warn('[scheduleUpcomingNotifications] skip:', err);
      }
    }
  })();

  try {
    await schedulingLock;
  } finally {
    schedulingLock = null;
  }
}

/**
 * 남은 예약 알림이 적으면 자동으로 재예약 (앱 실행 시 호출)
 * — 사용자가 명시적으로 알림을 끈 상태(notificationsEnabled=false)면 건너뜀
 */
export async function refreshNotificationsIfNeeded(
  intervalHours: 1 | 2 | 3,
  dndEnabled: boolean,
  dndStart: number,
  dndEnd: number,
): Promise<void> {
  // 사용자가 명시적으로 끈 상태면 손대지 않음
  const enabled = await getNotificationsEnabled();
  if (!enabled) return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  // 5개 미만으로 남으면 자동 보충 (첫 사용 시 0개여도 셋업)
  if (scheduled.length < 5) {
    await scheduleUpcomingNotifications(intervalHours, dndEnabled, dndStart, dndEnd);
  }
}
