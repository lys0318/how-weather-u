// 백그라운드 갱신 — 앱을 안 열어도 위젯/알림 내용이 낡지 않게.
// WorkManager(expo-background-fetch) 주기 태스크: 마지막 좌표로 날씨 재조회.
// 위치 API는 백그라운드 권한이 없어 호출 불가 → 포그라운드에서 저장한 좌표 재사용.
// Claude API는 호출하지 않음 (비용 0 — 날씨 API + 로컬 메시지만).

import { Platform } from 'react-native';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { fetchWeatherByCoords } from '../services/weather';
import { buildWidgetPayload } from '../services/widgetContent';
import { updateWidgetData, hasWidgets } from '../services/widget';
import { refreshNotificationsIfNeeded } from '../services/notification';
import { getNotificationsEnabled, getLastCoords, setLastWidgetWeather } from '../utils/storage';

const WIDGET_REFRESH_TASK = 'widget-refresh-task';
const LEGACY_TASK_NAME = 'weather-message-task'; // 구버전 잔재 — 발견 시 해제

// 구버전에서 등록된 채 남은 태스크가 실행돼도 안전하게 no-op.
TaskManager.defineTask(LEGACY_TASK_NAME, async () => BackgroundFetch.BackgroundFetchResult.NoData);

/** 위젯 또는 알림 중 하나라도 쓰면 백그라운드 갱신이 필요하다. */
async function needsRefresh(): Promise<{ widget: boolean; notif: boolean }> {
  const [widget, notif] = await Promise.all([
    hasWidgets().catch(() => false),
    getNotificationsEnabled().catch(() => false),
  ]);
  return { widget, notif };
}

TaskManager.defineTask(WIDGET_REFRESH_TASK, async () => {
  try {
    if (Platform.OS !== 'android') return BackgroundFetch.BackgroundFetchResult.NoData;
    const { widget, notif } = await needsRefresh();
    if (!widget && !notif) return BackgroundFetch.BackgroundFetchResult.NoData;

    const coords = await getLastCoords();
    if (!coords) return BackgroundFetch.BackgroundFetchResult.NoData;
    const weather = await fetchWeatherByCoords(coords.lat, coords.lon);
    await setLastWidgetWeather(weather);

    if (widget) {
      await updateWidgetData(await buildWidgetPayload(weather));
    }
    // 예약 알림 본문은 예약 시점에 고정되므로, 최신 날씨로 다시 예약해야
    // "27도 비"처럼 며칠 지난 내용이 발송되는 것을 막을 수 있다.
    if (notif) {
      await refreshNotificationsIfNeeded(weather);
    }
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// 앱 시작 시 호출: 위젯이나 알림을 쓰면 등록, 둘 다 아니면 해제. 구버전 태스크도 정리.
export async function syncWidgetRefreshTask(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(LEGACY_TASK_NAME)) {
      await BackgroundFetch.unregisterTaskAsync(LEGACY_TASK_NAME);
    }
    if (Platform.OS !== 'android') return;
    const { widget, notif } = await needsRefresh();
    const want = widget || notif;
    const registered = await TaskManager.isTaskRegisteredAsync(WIDGET_REFRESH_TASK);
    if (want && !registered) {
      await BackgroundFetch.registerTaskAsync(WIDGET_REFRESH_TASK, {
        minimumInterval: 60 * 60, // 1시간 — OS가 배터리 상황 따라 지연 가능
        stopOnTerminate: false,   // 앱 종료 후에도 유지
        startOnBoot: true,        // 재부팅 후 자동 재개
      });
    } else if (!want && registered) {
      await BackgroundFetch.unregisterTaskAsync(WIDGET_REFRESH_TASK);
    }
  } catch {
    // 무시 — 백그라운드 갱신 실패는 치명적이지 않음
  }
}
