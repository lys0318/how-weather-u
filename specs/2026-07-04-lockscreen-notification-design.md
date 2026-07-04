# 스펙 — 잠금화면 상시 알림 (날씨 + 오늘 메시지) + 권한 허용 시 자동 활성화

- 작성일: 2026-07-04
- 상태: **폐기** — 구현·실기기 검증까지 완료했으나 사용자 결정으로 제거(revert `ccb6d9e`). 이유: 일반 알림과 차별성 부족(다른 앱 알림과 섞임, 순서 보장 불가). 잠금화면 전체 교체 방식은 정책 리스크로 미채택.
- 저장 위치: `howweateryou/specs/` (공개 `docs/` 아님)

## 배경 / 기술 제약

사용자는 "폰 화면 켜자마자 잠금화면에서 날씨+오늘 메시지 보기"를 원함. 참고앱 "첫화면 날씨"는 **잠금화면 전체를 교체**하는 방식(잠금화면 광고 SDK). 그러나:

- **안드로이드는 서드파티 잠금화면 위젯을 지원 안 함**(Android 5.0에서 제거). 커스텀 잠금화면 교체 + 광고는 **구글 플레이/AdMob 정책 위반**(핵심목적이 잠금화면 앱이 아닌 경우) → 라이브 앱 정지 위험. **채택 안 함.**
- 모든 폰에서 정책 안전하게 잠금화면에 표시하는 유일한 방법 = **상시(ongoing) 알림**. 채택.

## 목표

1. 잠금화면·상단바에 상주하는 **조용한 상시 알림** 1개로 날씨+오늘 메시지 표시. 탭 시 앱 열림. 설정에서 on/off.
2. **알림 권한을 처음 허용하면 알림 자동 활성화**(현재는 허용해도 기본 OFF라 사용자가 또 켜야 함).

## 비목표
- 잠금화면 전체 교체 / 잠금화면 광고 (정책 위반).
- iOS(별도, expo-notifications 동일 API지만 잠금화면 상주 UX는 안드 중심).
- 커스텀 RemoteViews 알림 레이아웃(표준 title/body로 충분, v1).

## 현행 재활용 (확인됨)
- `services/notification.ts`: `requestNotificationPermission`(채널 생성 포함), `buildBriefContent`, 스케줄 알림.
- `services/widgetContent.ts`: `resolveWidgetLine(weather, choice, messages, lang, hour)` — "오늘 생성 메시지 / 없으면 브리핑" 계산. **재활용.**
- `utils/storage.ts`: `getNotificationsEnabled/setNotificationsEnabled`(예약 알림 on/off, 기본 false), `getMessages`.
- `screens/PermissionSetupScreen.tsx`: `handleStart`에서 위치+알림 권한 요청 후 온보딩 완료.
- `screens/HomeScreen.tsx`: 날씨 로드 effect·메시지 생성 effect에서 `pushWidget()` 호출(위젯 갱신) — 잠금 알림도 여기서 같이 갱신.

## 1. 잠금화면 상시 알림

### 컴포넌트: `services/notification.ts`에 추가
- 상수: `LOCK_NOTIF_ID = 'lock-weather'`, 채널 `'lock-weather'`.
- `ensureLockChannel()` — Android 채널 생성: importance **LOW**(무음·헤드업 없음), `lockscreenVisibility: PUBLIC`(잠금화면에 내용 표시), vibration 없음.
- `export async function updateLockNotification(weather?: WeatherInfo): Promise<void>`
  - `getLockNotifEnabled()` false거나 weather 없으면 return(no-op).
  - 권한 없으면 return.
  - `ensureLockChannel()`.
  - 내용:
    - `title = `${weather.emoji} ${weather.temp}° ${city}`` (city = 시/동, 없으면 '내 위치' 라벨)
    - `body = resolveWidgetLine(weather, { kind: 'auto' }, await getMessages(), getCurrentLang(), new Date().getHours())` (오늘 메시지 / 없으면 브리핑, 길면 자름)
  - `Notifications.scheduleNotificationAsync({ identifier: LOCK_NOTIF_ID, content: { title, body, sticky: true, sound: false, priority: LOW, ... , android channelId 'lock-weather' }, trigger: null })` — 같은 identifier 재게시 = 내용 갱신(중복 안 쌓임). `sticky:true` = 스와이프로 안 지워짐.
- `export async function clearLockNotification(): Promise<void>`
  - `Notifications.dismissNotificationAsync(LOCK_NOTIF_ID)` + `cancelScheduledNotificationAsync(LOCK_NOTIF_ID)`.

### 저장: `utils/storage.ts`
- 키 `LOCK_NOTIF: 'lockNotifEnabled'`.
- `getLockNotifEnabled(): Promise<boolean>` (기본 false), `setLockNotifEnabled(v): Promise<void>`.

### 갱신 시점: `screens/HomeScreen.tsx`
- 날씨 로드 effect(현재 `setLastWidgetWeather`+`pushWidget` 하는 자리)에 `updateLockNotification(weather).catch(()=>{})` 추가.
- 메시지 생성 effect(`pushWidget` 하는 자리)에 `updateLockNotification(weather).catch(()=>{})` 추가.
- → 위젯이랑 항상 같은 내용으로 동기 갱신. 비용 0(로컬).

### 설정 토글: `screens/SettingsScreen.tsx`
- "홈 위젯" 근처(Android만)에 Switch 행: **"잠금화면에 날씨·메시지 표시"** (`t('lockNotif.title')`) + 짧은 설명(`lockNotif.desc`).
- 상태: `getLockNotifEnabled()`로 초기화.
- ON: `requestNotificationPermission()` → 허용되면 `setLockNotifEnabled(true)` + `updateLockNotification(weather)`(설정 화면의 `useWeather` weather 사용). 거부 시 스위치 원복 + 안내.
- OFF: `setLockNotifEnabled(false)` + `clearLockNotification()`.

## 2. 알림 권한 허용 시 자동 활성화

### `screens/PermissionSetupScreen.tsx` `handleStart`
- `requestNotificationPermission()` 결과가 granted이고, **알림 설정이 한 번도 지정된 적 없으면**(첫 설치/재설치) 자동 ON:
  - `AsyncStorage.getItem(KEYS.NOTIFICATIONS_ENABLED)`가 `null`(미설정)일 때만 → `setNotificationsEnabled(true)` + `scheduleSlotNotifications(getNotifSlots())`(기본 아침/점심/저녁).
  - `setLockNotifEnabled(true)` (잠금 알림도 자동 ON — 다음 홈 진입 시 weather 로드되며 표시됨).
- **명시적 OFF 존중**: 키가 이미 있으면(사용자가 예전에 껐으면) 건드리지 않음 → 예전 "알림 꺼짐 버그" 재발 방지. 온보딩은 1회성이라 자연히 첫 허용 때만 실행.
- 헬퍼: `utils/storage.ts`에 `isNotificationsEnabledSet(): Promise<boolean>`(키 존재 여부) 추가하거나, PermissionSetupScreen에서 직접 `AsyncStorage.getItem` 확인.

## i18n (`translations.ts`, ko/en)
- `lockNotif.title` = "잠금화면에 날씨·메시지 표시" / "Show weather & message on lock screen"
- `lockNotif.desc` = "폰을 켜면 잠금화면에서 바로 확인해요" / "See it right on your lock screen"
- `lockNotif.permDenied` = "알림 권한이 필요해요" / "Notification permission is required"

## 에러 처리
- 권한 없음/iOS/실패 → 모든 잠금알림 함수 no-op(크래시 X).
- weather 없음(첫 실행 전) → 갱신 skip, 다음 홈 방문 시 표시.
- 재부팅 → ongoing 알림 사라짐 → 앱 한 번 열면 복구(BOOT 리시버는 범위 밖, YAGNI).

## 검증
- `npx tsc --noEmit`.
- 실기기:
  1. 설정 토글 ON → 잠금화면·상단바에 "🌤️ 23° 안양시 · 오늘 메시지" 상시 알림. 무음.
  2. 알림 탭 → 앱 열림.
  3. 앱에서 메시지 생성 → 잠금 알림 본문 갱신.
  4. 토글 OFF → 알림 사라짐(스와이프로도 안 지워지지만 토글로 제거됨).
  5. **재설치 + 온보딩에서 알림 허용 → 알림(예약+잠금) 자동 ON** 확인.
  6. 콜드스타트 크래시 0.

## 변경/생성 파일
- 수정: `services/notification.ts`(updateLockNotification/clearLockNotification/채널), `utils/storage.ts`(LOCK_NOTIF + 헬퍼), `screens/HomeScreen.tsx`(갱신 호출 2곳), `screens/SettingsScreen.tsx`(토글), `screens/PermissionSetupScreen.tsx`(자동 활성화), `i18n/translations.ts`.
- 버전: 1.2.6 / vc44 (또는 사용자 확정).

## 미해결 없음
