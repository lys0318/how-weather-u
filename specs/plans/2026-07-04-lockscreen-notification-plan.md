# 잠금화면 상시 알림 + 권한 자동 활성화 — 구현 계획

> **For agentic workers:** superpowers:executing-plans로 태스크별. 스펙 `specs/2026-07-04-lockscreen-notification-design.md`. 테스트 러너 없음 → `npx tsc --noEmit` + 실기기(adb). 잠금 알림은 실기기에서만 확인됨.

**Goal:** 잠금화면·상단바에 날씨+오늘 메시지를 조용한 상시(ongoing) 알림으로 표시(설정 토글), + 알림 권한 첫 허용 시 알림 자동 활성화.

**Architecture:** expo-notifications만 사용(네이티브 추가 없음). LOW importance 채널 `lock-weather`에 `sticky:true` 고정 identifier 알림 게시 → 재게시로 갱신. 내용은 위젯의 `resolveWidgetLine` 재활용. 홈 날씨/메시지 갱신 시 위젯과 함께 갱신.

**Tech Stack:** RN/Expo SDK54, expo-notifications, AsyncStorage.

## Global Constraints
- **잠금화면 광고/전체교체 금지**(정책 위반). 상시 알림만.
- 안드로이드 전용 실동작(iOS/권한없음/weather없음 → 모든 잠금알림 함수 no-op).
- **명시적 OFF 존중**: 자동 활성화는 `NOTIFICATIONS_ENABLED` 키가 `null`(미설정)일 때만.
- working dir `howweateryou`. 새 네이티브 없음 → clean 빌드 불필요.

---

### Task 1: storage — 잠금알림 플래그 + 설정여부 헬퍼

**Files:** Modify `src/utils/storage.ts`

**Interfaces:**
- Produces: `getLockNotifEnabled(): Promise<boolean>`, `setLockNotifEnabled(v: boolean): Promise<void>`, `isNotificationsEnabledSet(): Promise<boolean>`

- [ ] **Step 1: KEYS에 추가** (WIDGET_MSG 근처)
```ts
  LOCK_NOTIF: 'lockNotifEnabled',                 // 잠금화면 상시 알림 on/off
```
- [ ] **Step 2: 함수 추가** (setWidgetChoice 근처, 알림 플래그 섹션 어디든)
```ts
// ─── 잠금화면 상시 알림 ─────────────────────────────────────
export async function getLockNotifEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEYS.LOCK_NOTIF)) === 'true';
}
export async function setLockNotifEnabled(v: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.LOCK_NOTIF, v ? 'true' : 'false').catch(() => {});
}
// 알림 on/off가 한 번이라도 지정된 적 있는지(첫 허용 자동 활성화 판단용)
export async function isNotificationsEnabledSet(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEYS.NOTIFICATIONS_ENABLED)) !== null;
}
```
- [ ] **Step 3:** `npx tsc --noEmit` → PASS. 커밋 `feat(locknotif): storage 플래그 + 헬퍼`

---

### Task 2: notification.ts — 잠금 알림 게시/제거

**Files:** Modify `src/services/notification.ts`

**Interfaces:**
- Consumes: `resolveWidgetLine(weather, choice, messages, lang, hour): string` (`services/widgetContent.ts`), `getMessages()`, `getLockNotifEnabled()` (storage), `WeatherInfo`, `translate`, `getCurrentLang`.
- Produces: `updateLockNotification(weather?: WeatherInfo): Promise<void>`, `clearLockNotification(): Promise<void>`

- [ ] **Step 1: import 추가** (파일 상단 import 블록)
```ts
import { getNotificationsEnabled, getNotifSlots, NotifSlot, getMessages, getLockNotifEnabled } from '../utils/storage';
import { resolveWidgetLine } from './widgetContent';
```
> 기존 `import { getNotificationsEnabled, getNotifSlots, NotifSlot } from '../utils/storage';` 라인에 `getMessages, getLockNotifEnabled` 병합(중복 import 금지).

- [ ] **Step 2: 함수 추가** (파일 하단)
```ts
const LOCK_NOTIF_ID = 'lock-weather';
const LOCK_CHANNEL = 'lock-weather';

async function ensureLockChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(LOCK_CHANNEL, {
    name: translate('lockNotif.channelName'),
    importance: Notifications.AndroidImportance.LOW, // 무음·헤드업 없음
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    vibrationPattern: [0],
    showBadge: false,
  });
}

// 잠금화면 상시 알림 게시/갱신 (같은 identifier 재게시 = 내용 갱신).
export async function updateLockNotification(weather?: WeatherInfo): Promise<void> {
  if (Platform.OS !== 'android' || !weather) return;
  if (!(await getLockNotifEnabled())) return;
  const perm = await Notifications.getPermissionsAsync();
  if (perm.status !== 'granted') return;
  await ensureLockChannel();
  const lang = getCurrentLang();
  const city = weather.city && weather.city !== '내 위치' ? weather.city : translate('weather.myLocation');
  const title = `${weather.emoji} ${weather.temp}° ${city}`;
  let body = resolveWidgetLine(weather, { kind: 'auto' }, await getMessages(), lang, new Date().getHours());
  if (body.length > 100) body = body.slice(0, 98) + '…';
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: LOCK_NOTIF_ID,
      content: { title, body, sticky: true, autoDismiss: false, sound: false },
      trigger: { channelId: LOCK_CHANNEL }, // ChannelAwareTrigger: 즉시 + 지정 채널(LOW)
    });
  } catch {
    // 무시
  }
}

export async function clearLockNotification(): Promise<void> {
  try { await Notifications.dismissNotificationAsync(LOCK_NOTIF_ID); } catch {}
  try { await Notifications.cancelScheduledNotificationAsync(LOCK_NOTIF_ID); } catch {}
}
```
> `WeatherInfo`는 이미 이 파일에서 import됨(`import { WeatherInfo } from '../constants/weather';`). `translate`/`getCurrentLang`도 이미 import됨. 아니면 병합.

- [ ] **Step 3:** `npx tsc --noEmit` → (lockNotif.* i18n 키는 Task 4에서 추가하지만 `translate`는 문자열 인자라 타입에러 안 남). PASS. 커밋 `feat(locknotif): 상시 알림 게시/제거 서비스`

---

### Task 3: HomeScreen — 날씨/메시지 갱신 시 잠금 알림 동기 갱신

**Files:** Modify `src/screens/HomeScreen.tsx`

**Interfaces:** Consumes `updateLockNotification(weather)`.

- [ ] **Step 1: import 추가**
```ts
import { refreshNotificationsIfNeeded, updateLockNotification } from '../services/notification';
```
> 기존 `import { refreshNotificationsIfNeeded } from '../services/notification';`에 병합.

- [ ] **Step 2: 날씨 effect에 추가** (setLastWidgetWeather/pushWidget 하는 그 async 블록)
```ts
      (async () => {
        await setLastWidgetWeather(weather);
        await pushWidget();
        await updateLockNotification(weather);
      })().catch(() => {});
```
- [ ] **Step 3: 메시지 effect에 추가**
```ts
  useEffect(() => {
    if (message && weather) {
      pushWidget().catch(() => {});
      updateLockNotification(weather).catch(() => {});
      if (!isGuest) saveMessage(message, weather.emoji, lastInputs.current).catch(() => {});
    }
  }, [message]);
```
- [ ] **Step 4:** `npx tsc --noEmit` → PASS. 커밋 `feat(locknotif): 홈 갱신 시 잠금 알림 동기화`

---

### Task 4: i18n + 설정 토글

**Files:** Modify `src/i18n/translations.ts`, `src/screens/SettingsScreen.tsx`

**Interfaces:** Consumes `getLockNotifEnabled/setLockNotifEnabled` (storage), `updateLockNotification/clearLockNotification` (notification), `requestNotificationPermission` (notification).

- [ ] **Step 1: i18n `lockNotif.*` (ko/en)** — ko `widget` 객체 뒤에 추가:
```ts
    lockNotif: {
      channelName: '잠금화면 날씨',
      title: '잠금화면에 날씨·메시지 표시',
      desc: '폰을 켜면 잠금화면에서 바로 확인해요',
      permDenied: '알림 권한이 필요해요',
    },
```
en `widget` 객체 뒤에:
```ts
    lockNotif: {
      channelName: 'Lock screen weather',
      title: 'Show weather & message on lock screen',
      desc: 'See it right on your lock screen',
      permDenied: 'Notification permission is required',
    },
```

- [ ] **Step 2: SettingsScreen import 추가**
```ts
import { getLockNotifEnabled, setLockNotifEnabled } from '../utils/storage';
import { updateLockNotification, clearLockNotification, requestNotificationPermission } from '../services/notification';
```
> `requestNotificationPermission`이 기존 notification import 블록에 이미 있으면 병합. `NotifSlot` 등 기존 import 유지.

- [ ] **Step 3: 상태 + 핸들러 추가** (widgetSetupOpen state 근처)
```ts
  const [lockNotifOn, setLockNotifOn] = useState(false);
  useEffect(() => { getLockNotifEnabled().then(setLockNotifOn); }, []);

  const toggleLockNotif = async (v: boolean) => {
    if (v) {
      const granted = await requestNotificationPermission();
      if (!granted) { Alert.alert(t('lockNotif.title'), t('lockNotif.permDenied')); return; }
      await setLockNotifEnabled(true);
      setLockNotifOn(true);
      await updateLockNotification(weather ?? undefined);
    } else {
      await setLockNotifEnabled(false);
      setLockNotifOn(false);
      await clearLockNotification();
    }
  };
```

- [ ] **Step 4: JSX — "위젯 추가" 버튼 아래(같은 android 블록 안)에 토글 행 추가**
```tsx
          <View style={styles.lockRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.lockTitle}>{t('lockNotif.title')}</Text>
              <Text style={styles.lockDesc}>{t('lockNotif.desc')}</Text>
            </View>
            <Switch
              value={lockNotifOn}
              onValueChange={toggleLockNotif}
              trackColor={{ false: COLORS.paper3, true: COLORS.ember }}
              thumbColor={'#ffffff'}
            />
          </View>
```
> `styles.widgetHint`(위젯 힌트) 다음, `</>` 닫기 전에 삽입.

- [ ] **Step 5: 스타일 추가** (widgetHint 근처)
```ts
  lockRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  lockTitle: { color: COLORS.ink, fontSize: 15, fontWeight: '600' },
  lockDesc: { color: COLORS.ink3, fontSize: 12, marginTop: 3, lineHeight: 17 },
```

- [ ] **Step 6:** `npx tsc --noEmit` → PASS. 커밋 `feat(locknotif): 설정 토글 + i18n`

---

### Task 5: 권한 첫 허용 시 자동 활성화

**Files:** Modify `src/screens/PermissionSetupScreen.tsx`

**Interfaces:** Consumes `isNotificationsEnabledSet/setNotificationsEnabled/getNotifSlots/setLockNotifEnabled` (storage), `scheduleSlotNotifications` (notification).

- [ ] **Step 1: import 추가/수정**
```ts
import { requestNotificationPermission, scheduleSlotNotifications } from '../services/notification';
import { setHasOnboarded, isNotificationsEnabledSet, setNotificationsEnabled, getNotifSlots, setLockNotifEnabled } from '../utils/storage';
```
> 기존 `import { requestNotificationPermission } from '../services/notification';` 와 `import { setHasOnboarded } from '../utils/storage';` 를 위처럼 확장.

- [ ] **Step 2: `handleStart` 수정** — 알림 권한 결과로 자동 활성화(첫 설정일 때만)
```ts
  const handleStart = async () => {
    setLoading(true);
    try {
      await requestLocationPermission();
      const notifGranted = await requestNotificationPermission();
      // 알림을 한 번도 지정 안 한 상태(첫 설치/재설치)에서 허용하면 자동 ON
      if (notifGranted && !(await isNotificationsEnabledSet())) {
        await setNotificationsEnabled(true);
        await scheduleSlotNotifications(await getNotifSlots());
        await setLockNotifEnabled(true);
      }
      await setHasOnboarded(true);
      onDone();
    } catch (e) {
      await setHasOnboarded(true);
      onDone();
    } finally {
      setLoading(false);
    }
  };
```
> `requestNotificationPermission()`는 boolean(granted) 반환. `getNotifSlots()`는 기본 `['morning','lunch','evening']`.

- [ ] **Step 3:** `npx tsc --noEmit` → PASS. 커밋 `feat(locknotif): 알림 권한 첫 허용 시 자동 활성화`

---

### Task 6: 버전업 + 빌드 + 실기기 검증 + 배포

**Files:** Modify `android/app/build.gradle`, `app.json`, `src/screens/SettingsScreen.tsx`(표시 버전)

- [ ] **Step 1: 버전 3곳** → 1.2.6 / vc44. (build.gradle versionCode 44/versionName "1.2.6"; app.json version "1.2.6"/versionCode 44; SettingsScreen `v1.2.5`→`v1.2.6`.)
- [ ] **Step 2: APK 빌드**(네이티브 미변경 → clean 불필요)
```
cd android && ./gradlew assembleRelease -x lintVitalRelease -x lintVitalAnalyzeRelease -x lintVitalReportRelease
```
Expected: BUILD SUCCESSFUL.
- [ ] **Step 3: 설치**(서명 다르면 uninstall 후) + 권한 부여
```
adb install -r android/app/build/outputs/apk/release/app-release.apk || (adb uninstall com.howweatheryou.app && adb install android/app/build/outputs/apk/release/app-release.apk)
adb shell pm grant com.howweatheryou.app android.permission.POST_NOTIFICATIONS
adb shell pm grant com.howweatheryou.app android.permission.ACCESS_FINE_LOCATION
```
- [ ] **Step 4: 검증** (MSYS_NO_PATHCONV=1 스샷, 광고 탭 금지)
  - 설정 → "잠금화면에 날씨·메시지 표시" ON → 잠금화면/상단바에 "🌤️ N° 도시 · 메시지" 무음 상시 알림.
  - 알림 탭 → 앱 열림.
  - 앱에서 메시지 생성 → 알림 본문 갱신.
  - 토글 OFF → 알림 사라짐.
  - 재설치 + 온보딩 알림 허용 → 알림(예약+잠금) 자동 ON 확인.
  - 콜드스타트 크래시 0.
- [ ] **Step 5: AAB + 커밋 + push**
```
cd android && ./gradlew bundleRelease -x lintVitalRelease -x lintVitalAnalyzeRelease -x lintVitalReportRelease
cd .. && git add app.json src/screens/SettingsScreen.tsx && git commit -m "chore: 1.2.6/vc44 (잠금화면 알림)" && git push
```

## 검증 (스펙 §검증 대응)
- 플래그/헬퍼: T1. 게시/제거: T2. 홈 갱신: T3. i18n·토글: T4. 자동 활성화: T5. 빌드·실기기·배포: T6.

## 후속 (범위 밖)
재부팅 후 BOOT 리시버 자동 복구, 커스텀 알림 레이아웃(RemoteViews), iOS 잠금화면 위젯(WidgetKit).
