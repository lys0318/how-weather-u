// ⚠️ 이 파일은 더 이상 Claude API를 호출하지 않습니다.
// 알림은 services/notification.ts 의 scheduleUpcomingNotifications()가
// OS AlarmManager 기반 예약 알림으로 처리하며,
// 사용자가 앱을 열어 직접 메시지를 생성하도록 유도합니다 (비용 통제).
//
// 백그라운드 태스크 정의만 남겨두지만 등록은 하지 않습니다.

import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

export const BACKGROUND_TASK_NAME = 'weather-message-task';

// 빈 태스크 — 등록되더라도 아무 작업도 하지 않음
TaskManager.defineTask(BACKGROUND_TASK_NAME, async () => {
  return BackgroundFetch.BackgroundFetchResult.NoData;
});

// 이전 버전에서 등록되어 있던 태스크가 있다면 해제
export async function unregisterBackgroundTask(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK_NAME);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_TASK_NAME);
    }
  } catch {
    // 무시
  }
}
