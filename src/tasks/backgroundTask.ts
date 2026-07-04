// 위젯 백그라운드 갱신 — 앱을 안 열어도 위젯 날씨가 낡지 않게.
// WorkManager(expo-background-fetch) 주기 태스크: 마지막 좌표로 날씨 재조회 → 위젯 갱신.
// 위치 API는 백그라운드 권한이 없어 호출 불가 → 포그라운드에서 저장한 좌표 재사용.
// Claude API는 호출하지 않음 (비용 0 — 날씨 API + 로컬 메시지만).

import { Platform } from 'react-native';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { fetchWeatherByCoords } from '../services/weather';
import { buildWidgetPayload } from '../services/widgetContent';
import { updateWidgetData, hasWidgets } from '../services/widget';
import { getLastCoords, setLastWidgetWeather } from '../utils/storage';

const WIDGET_REFRESH_TASK = 'widget-refresh-task';
const LEGACY_TASK_NAME = 'weather-message-task'; // 구버전 잔재 — 발견 시 해제

// 구버전에서 등록된 채 남은 태스크가 실행돼도 안전하게 no-op.
TaskManager.defineTask(LEGACY_TASK_NAME, async () => BackgroundFetch.BackgroundFetchResult.NoData);

TaskManager.defineTask(WIDGET_REFRESH_TASK, async () => {
  try {
    if (Platform.OS !== 'android' || !(await hasWidgets())) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }
    const coords = await getLastCoords();
    if (!coords) return BackgroundFetch.BackgroundFetchResult.NoData;
    const weather = await fetchWeatherByCoords(coords.lat, coords.lon);
    await setLastWidgetWeather(weather);
    await updateWidgetData(await buildWidgetPayload(weather));
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// 앱 시작 시 호출: 위젯 있으면 등록, 없으면 해제. 구버전 태스크도 정리.
export async function syncWidgetRefreshTask(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(LEGACY_TASK_NAME)) {
      await BackgroundFetch.unregisterTaskAsync(LEGACY_TASK_NAME);
    }
    if (Platform.OS !== 'android') return;
    const want = await hasWidgets();
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
