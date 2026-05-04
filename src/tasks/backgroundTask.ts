import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { fetchWeather } from '../services/weather';
import { generateMessage } from '../services/message';
import { sendLocalNotification } from '../services/notification';
import { saveMessage, getPreference, getDndRange } from '../utils/storage';
import { getTimeOfDay, CONDITION_META } from '../constants/weather';

export const BACKGROUND_TASK_NAME = 'weather-message-task';

function isWithinDnd(hour: number, start: number, end: number): boolean {
  // 방해금지 시간대 체크 (ex: 23~7시)
  if (start > end) {
    // 자정을 넘어가는 경우 (예: 23 ~ 07)
    return hour >= start || hour < end;
  }
  return hour >= start && hour < end;
}

// 백그라운드 태스크 정의
TaskManager.defineTask(BACKGROUND_TASK_NAME, async () => {
  try {
    const now = new Date();
    const currentHour = now.getHours();

    // 방해금지 시간대 확인
    const { enabled: dndEnabled, start, end } = await getDndRange();
    if (dndEnabled && isWithinDnd(currentHour, start, end)) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // 날씨 가져오기
    const weather = await fetchWeather();

    // 취향 가져오기
    const preference = await getPreference();

    // 메시지 생성
    const message = await generateMessage({
      condition: weather.condition,
      timeOfDay: getTimeOfDay(currentHour),
      dayOfWeek: now.getDay(),
      preference,
    });

    // 로컬 알림 발송
    await sendLocalNotification(message.text, weather.emoji);

    // AsyncStorage에 저장
    await saveMessage(message, weather.emoji);

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.error('[BackgroundTask] 오류:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundTask(intervalHours: 1 | 2 | 3): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK_NAME);
  if (isRegistered) {
    await BackgroundFetch.unregisterTaskAsync(BACKGROUND_TASK_NAME);
  }

  await BackgroundFetch.registerTaskAsync(BACKGROUND_TASK_NAME, {
    minimumInterval: intervalHours * 60 * 60, // 초 단위
    stopOnTerminate: false,
    startOnBoot: true,
  });
}

export async function unregisterBackgroundTask(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK_NAME);
  if (isRegistered) {
    await BackgroundFetch.unregisterTaskAsync(BACKGROUND_TASK_NAME);
  }
}
