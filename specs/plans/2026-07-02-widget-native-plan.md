# 홈위젯 (순수 네이티브) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans로 태스크별 실행. 스펙 `specs/2026-07-02-widget-native-design.md` 참조. **위젯은 실기기에서만 검증됨.** 이 프로젝트는 테스트 러너가 없음 → 검증은 `npx tsc --noEmit` + 실기기(adb). 순수 로직(`resolveWidgetLine`)은 격리해 자명하게.

**Goal:** 안드 홈위젯(중 4×2·소 2×2)에 오늘 날씨 + 선택 메시지를 반투명 배경으로 표시. 앱 설정에서 추가, 표시 메시지는 앱 안에서 선택. 탭 시 앱 열림. **크래시 없음.**

**Architecture:** 순수 네이티브 `AppWidgetProvider` ×2 + RemoteViews. RN↔네이티브는 **레거시 `ReactContextBaseJavaModule`**(코드젠·TurboModule 아님 → `libappmodules.so` 미유발, old-arch 안전). RN이 표시 문자열을 SharedPreferences에 쓰고 `AppWidgetManager.updateAppWidget`로 즉시 갱신.

**Tech Stack:** RN/Expo SDK54(old arch), Kotlin AppWidgetProvider/RemoteViews, AsyncStorage, SharedPreferences.

## Global Constraints
- **prebuild 금지** — 커스텀 android/(AdMob·권한·인텐트필터) 덮어쓰기 위험. 네이티브 수기 편집.
- **react-native-android-widget 재도입 금지** — TurboModule 코드젠이 크래시 유발(1차 실패). 레거시 모듈만.
- **안드로이드 전용**(iOS/브리지 없으면 RN 호출 no-op). 새 AI 호출 없음(로컬).
- 새 네이티브 코드 → **clean 빌드**. 검증은 **실기기 콜드스타트 10회 크래시 0** 필수.
- 스샷은 `MSYS_NO_PATHCONV=1 adb shell screencap -p /sdcard/x.png; adb pull ...`. 광고 영역 탭 금지.
- working dir: `C:/Users/82108/Desktop/how-weather-you/howweateryou`.
- 패키지: `com.howweatheryou.app`. 메인 액티비티: `.MainActivity`.

---

### Task 1: 위젯 표시 선택 저장 + 표시 한 줄 계산 (RN 순수 로직)

**Files:**
- Modify: `src/utils/storage.ts` (KEYS에 WIDGET_MSG, WidgetChoice 타입 + get/set)
- Create: `src/services/widget.ts` (브리지 래퍼 — Task 2에서 채우지만 타입 먼저)
- Create: `src/services/widgetContent.ts`

**Interfaces:**
- Consumes: `buildBriefLine(weather: WeatherInfo, lang:'ko'|'en', hour:number): string` (`services/brief.ts`), `getMessages(): Promise<StoredMessage[]>`, `getCurrentLang()`, `translate(key, vars?)`.
- Produces:
  - `type WidgetChoice = { kind:'auto' } | { kind:'brief' } | { kind:'message'; id:string; text:string }`
  - `getWidgetChoice(): Promise<WidgetChoice>`, `setWidgetChoice(c: WidgetChoice): Promise<void>`
  - `interface WidgetPayload { head:string; city:string; range:string; message:string }` (in `services/widget.ts`)
  - `resolveWidgetLine(weather, choice, messages, lang, hour): string`
  - `buildWidgetPayload(weather: WeatherInfo): Promise<WidgetPayload>`

- [ ] **Step 1: storage.ts — WIDGET_MSG/WIDGET_WEATHER 키 + 타입 + get/set**

storage.ts 상단 import에 `WeatherInfo` 추가:
```ts
import { GenPrefs, DEFAULT_GEN_PREFS, WeatherInfo } from '../constants/weather';
```
`KEYS`에 추가 (PROFILE_PROMPTED 아래):
```ts
  WIDGET_MSG: 'widgetMsgChoice',                  // 홈위젯에 표시할 메시지 선택
  WIDGET_WEATHER: 'widgetWeather',                // 위젯 즉시 갱신용 마지막 날씨 캐시
```
파일 하단(setGenPrefs 근처)에 추가:
```ts
// ─── 홈위젯 표시 메시지 선택 ───────────────────────────────
export type WidgetChoice =
  | { kind: 'auto' }                                // 오늘 생성된 최신 메시지, 없으면 브리핑
  | { kind: 'brief' }                               // 항상 날씨 브리핑
  | { kind: 'message'; id: string; text: string };  // 고정 메시지(오늘/히스토리)

export async function getWidgetChoice(): Promise<WidgetChoice> {
  try {
    const v = await AsyncStorage.getItem(KEYS.WIDGET_MSG);
    if (!v) return { kind: 'auto' };
    return JSON.parse(v) as WidgetChoice;
  } catch {
    return { kind: 'auto' };
  }
}

export async function setWidgetChoice(c: WidgetChoice): Promise<void> {
  await AsyncStorage.setItem(KEYS.WIDGET_MSG, JSON.stringify(c)).catch(() => {});
}

// 위젯을 앱 밖(설정/히스토리)에서 즉시 갱신하려면 마지막 날씨가 필요 → 캐시.
export async function setLastWidgetWeather(w: WeatherInfo): Promise<void> {
  await AsyncStorage.setItem(KEYS.WIDGET_WEATHER, JSON.stringify(w)).catch(() => {});
}

export async function getLastWidgetWeather(): Promise<WeatherInfo | null> {
  try {
    const v = await AsyncStorage.getItem(KEYS.WIDGET_WEATHER);
    return v ? (JSON.parse(v) as WeatherInfo) : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: services/widget.ts — 타입 stub (Task 2에서 구현 채움)**

```ts
export interface WidgetPayload {
  head: string;    // "🌤️ 24°"
  city: string;    // "안양시 만안구"
  range: string;   // "최저 20° / 최고 29°"
  message: string; // 표시 한 줄
}

// Task 2에서 실제 브리지 연결. 지금은 no-op으로 타입만.
export async function updateWidgetData(_p: WidgetPayload): Promise<void> {}
export async function pinWidget(_size: 'medium' | 'small'): Promise<'ok' | 'unsupported' | 'error'> {
  return 'unsupported';
}
```

- [ ] **Step 3: services/widgetContent.ts — 순수 계산 + payload 조립**

```ts
import { WeatherInfo } from '../constants/weather';
import { StoredMessage, WidgetChoice, getMessages, getWidgetChoice, getLastWidgetWeather } from '../utils/storage';
import { buildBriefLine } from './brief';
import { getCurrentLang, translate } from '../i18n';
import { WidgetPayload, updateWidgetData } from './widget';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// 표시할 한 줄 결정 (순수 함수 — 테스트/추론 용이).
export function resolveWidgetLine(
  weather: WeatherInfo,
  choice: WidgetChoice,
  messages: StoredMessage[],
  lang: 'ko' | 'en',
  hour: number,
): string {
  if (choice.kind === 'message') return choice.text;
  if (choice.kind === 'auto') {
    const todayMsg = messages.find(
      (m) => (m.kind ?? 'message') === 'message' && m.generatedAt.slice(0, 10) === todayKey(),
    );
    if (todayMsg) return todayMsg.text;
  }
  return buildBriefLine(weather, lang, hour);
}

// 네이티브에 넘길 표시-준비 문자열 조립 (i18n은 여기서 처리).
export async function buildWidgetPayload(weather: WeatherInfo): Promise<WidgetPayload> {
  const lang = getCurrentLang();
  const [choice, messages] = await Promise.all([getWidgetChoice(), getMessages()]);
  let message = resolveWidgetLine(weather, choice, messages, lang, new Date().getHours());
  if (message.length > 90) message = message.slice(0, 88) + '…';
  const city = weather.city && weather.city !== '내 위치' ? weather.city : translate('weather.myLocation');
  return {
    head: `${weather.emoji} ${weather.temp}°`,
    city,
    range: translate('weather.tempRange', { min: weather.tempMin, max: weather.tempMax }),
    message,
  };
}

// 단일 진입점: 마지막 날씨 캐시로 위젯 즉시 갱신 (홈/설정/히스토리 공용).
// 날씨 캐시 없으면(앱 첫 실행 전) 조용히 skip — 다음 홈 방문 때 채워짐.
export async function pushWidget(): Promise<void> {
  const weather = await getLastWidgetWeather();
  if (!weather) return;
  await updateWidgetData(await buildWidgetPayload(weather));
}
```

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 출력 없음(PASS).

- [ ] **Step 5: 커밋**

```bash
git add src/utils/storage.ts src/services/widget.ts src/services/widgetContent.ts
git commit -m "feat(widget): 표시 메시지 선택/날씨 캐시 저장 + 표시 한 줄 계산 + pushWidget"
```

---

### Task 2: RN↔네이티브 브리지 래퍼

**Files:**
- Modify: `src/services/widget.ts` (stub → 실제 NativeModules 연결)

**Interfaces:**
- Consumes: `NativeModules.WidgetBridge`(Task 5에서 네이티브 등록): `setData(json: string): void`, `requestPin(size: string): Promise<string>`("ok"/"unsupported").
- Produces: `updateWidgetData(p: WidgetPayload): Promise<void>`, `pinWidget(size): Promise<'ok'|'unsupported'|'error'>` (Task 1의 시그니처 유지).

- [ ] **Step 1: services/widget.ts 실제 구현으로 교체**

```ts
import { NativeModules, Platform } from 'react-native';

export interface WidgetPayload {
  head: string;    // "🌤️ 24°"
  city: string;    // "안양시 만안구"
  range: string;   // "최저 20° / 최고 29°"
  message: string; // 표시 한 줄
}

interface WidgetBridgeSpec {
  setData(json: string): void;
  requestPin(size: string): Promise<string>;
}
const Bridge: WidgetBridgeSpec | undefined = NativeModules.WidgetBridge;

// 위젯 데이터 갱신 (안드로이드/브리지 없으면 no-op).
export async function updateWidgetData(p: WidgetPayload): Promise<void> {
  if (Platform.OS !== 'android' || !Bridge) return;
  try {
    Bridge.setData(JSON.stringify(p));
  } catch {
    // 위젯 미추가 등 — 무해
  }
}

// 인앱 위젯 추가 요청. 'unsupported'면 RN에서 수동 추가 안내.
export async function pinWidget(size: 'medium' | 'small'): Promise<'ok' | 'unsupported' | 'error'> {
  if (Platform.OS !== 'android' || !Bridge) return 'unsupported';
  try {
    const r = await Bridge.requestPin(size);
    return r === 'ok' ? 'ok' : 'unsupported';
  } catch {
    return 'error';
  }
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: 커밋**

```bash
git add src/services/widget.ts
git commit -m "feat(widget): RN↔네이티브 브리지 래퍼(setData/requestPin)"
```

---

### Task 3: 네이티브 리소스 (배경·레이아웃·provider-info) + 데이터 헬퍼

**Files:**
- Create: `android/app/src/main/res/drawable/hwy_widget_bg.xml`
- Create: `android/app/src/main/res/layout/hwy_widget_medium.xml`
- Create: `android/app/src/main/res/layout/hwy_widget_small.xml`
- Create: `android/app/src/main/res/xml/hwy_widget_medium_info.xml`
- Create: `android/app/src/main/res/xml/hwy_widget_small_info.xml`
- Create: `android/app/src/main/java/com/howweatheryou/app/widget/WidgetData.kt`

**Interfaces:**
- Produces (Kotlin): `WidgetData` object — `data class Snapshot(head,city,range,message)`, `fun read(context): Snapshot`, `fun write(context, json: String)`. View id: 레이아웃의 `@+id/hwy_root/hwy_head/hwy_city/hwy_range/hwy_message`.

- [ ] **Step 1: drawable 반투명 배경**

`res/drawable/hwy_widget_bg.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="#B3141922" />
    <corners android:radius="20dp" />
</shape>
```

- [ ] **Step 2: 중형 레이아웃 4×2**

`res/layout/hwy_widget_medium.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/hwy_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:background="@drawable/hwy_widget_bg"
    android:padding="14dp"
    android:gravity="center_vertical">

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal"
        android:gravity="center_vertical">
        <TextView android:id="@+id/hwy_head"
            android:layout_width="wrap_content" android:layout_height="wrap_content"
            android:textColor="#FFFFFF" android:textSize="24sp" android:textStyle="bold"
            android:text="🌤️ --°" />
        <TextView android:id="@+id/hwy_city"
            android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1"
            android:layout_marginStart="8dp" android:gravity="end"
            android:textColor="#D8FFFFFF" android:textSize="13sp"
            android:maxLines="1" android:ellipsize="end" android:text="" />
    </LinearLayout>

    <TextView android:id="@+id/hwy_range"
        android:layout_width="wrap_content" android:layout_height="wrap_content"
        android:layout_marginTop="4dp"
        android:textColor="#B8FFFFFF" android:textSize="12sp" android:text="" />

    <TextView android:id="@+id/hwy_message"
        android:layout_width="match_parent" android:layout_height="wrap_content"
        android:layout_marginTop="8dp"
        android:textColor="#FFFFFF" android:textSize="14sp"
        android:maxLines="2" android:ellipsize="end" android:text="" />
</LinearLayout>
```

- [ ] **Step 3: 소형 레이아웃 2×2**

`res/layout/hwy_widget_small.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/hwy_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:background="@drawable/hwy_widget_bg"
    android:padding="12dp"
    android:gravity="center">

    <TextView android:id="@+id/hwy_head"
        android:layout_width="wrap_content" android:layout_height="wrap_content"
        android:textColor="#FFFFFF" android:textSize="22sp" android:textStyle="bold"
        android:text="🌤️ --°" />
    <TextView android:id="@+id/hwy_city"
        android:layout_width="wrap_content" android:layout_height="wrap_content"
        android:layout_marginTop="2dp" android:maxLines="1" android:ellipsize="end"
        android:textColor="#D8FFFFFF" android:textSize="12sp" android:text="" />
    <TextView android:id="@+id/hwy_range"
        android:layout_width="wrap_content" android:layout_height="wrap_content"
        android:layout_marginTop="2dp"
        android:textColor="#B8FFFFFF" android:textSize="11sp" android:text="" />
    <!-- 소형에도 message id 존재(렌더 코드 공유); 소형 provider는 GONE 처리 -->
    <TextView android:id="@+id/hwy_message"
        android:layout_width="wrap_content" android:layout_height="wrap_content"
        android:visibility="gone" android:text="" />
</LinearLayout>
```

- [ ] **Step 4: provider-info xml (중/소)**

`res/xml/hwy_widget_medium_info.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="250dp" android:minHeight="110dp"
    android:targetCellWidth="4" android:targetCellHeight="2"
    android:updatePeriodMillis="0"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen"
    android:initialLayout="@layout/hwy_widget_medium"
    android:previewLayout="@layout/hwy_widget_medium" />
```
`res/xml/hwy_widget_small_info.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="110dp" android:minHeight="110dp"
    android:targetCellWidth="2" android:targetCellHeight="2"
    android:updatePeriodMillis="0"
    android:resizeMode="none"
    android:widgetCategory="home_screen"
    android:initialLayout="@layout/hwy_widget_small"
    android:previewLayout="@layout/hwy_widget_small" />
```

- [ ] **Step 5: WidgetData.kt (SharedPreferences)**

`android/app/src/main/java/com/howweatheryou/app/widget/WidgetData.kt`:
```kotlin
package com.howweatheryou.app.widget

import android.content.Context
import org.json.JSONObject

object WidgetData {
    private const val PREFS = "hwy_widget"
    private const val KEY = "payload"

    data class Snapshot(
        val head: String,
        val city: String,
        val range: String,
        val message: String,
    )

    fun write(context: Context, json: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(KEY, json).apply()
    }

    fun read(context: Context): Snapshot {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)
        if (raw.isNullOrBlank()) {
            return Snapshot(head = "🌤️", city = "", range = "", message = "앱을 열어 날씨를 불러오세요")
        }
        return try {
            val o = JSONObject(raw)
            Snapshot(
                head = o.optString("head", "🌤️"),
                city = o.optString("city", ""),
                range = o.optString("range", ""),
                message = o.optString("message", ""),
            )
        } catch (e: Exception) {
            Snapshot(head = "🌤️", city = "", range = "", message = "")
        }
    }
}
```

- [ ] **Step 6: 커밋** (아직 provider 없어 빌드 대상 아님 — 리소스만)

```bash
git add android/app/src/main/res/drawable/hwy_widget_bg.xml \
        android/app/src/main/res/layout/hwy_widget_medium.xml \
        android/app/src/main/res/layout/hwy_widget_small.xml \
        android/app/src/main/res/xml/hwy_widget_medium_info.xml \
        android/app/src/main/res/xml/hwy_widget_small_info.xml \
        android/app/src/main/java/com/howweatheryou/app/widget/WidgetData.kt
git commit -m "feat(widget): 네이티브 리소스(반투명 배경/2레이아웃/provider-info) + 데이터 헬퍼"
```
> 참고: `/android`는 .gitignore 대상 — 커밋 안 잡혀도 정상(로컬 파일은 존재). 빌드는 로컬 파일로 됨.

---

### Task 4: 위젯 렌더러 + Provider ×2

**Files:**
- Create: `android/app/src/main/java/com/howweatheryou/app/widget/HwyWidgetRenderer.kt`
- Create: `android/app/src/main/java/com/howweatheryou/app/widget/HwyWidgetMediumProvider.kt`
- Create: `android/app/src/main/java/com/howweatheryou/app/widget/HwyWidgetSmallProvider.kt`

**Interfaces:**
- Consumes: `WidgetData.read(context)`, `R.layout.hwy_widget_medium/small`, `R.id.hwy_head/hwy_city/hwy_range/hwy_message/hwy_root`, `MainActivity`.
- Produces: `HwyWidgetRenderer.updateAll(context)` — 양 provider의 모든 위젯 갱신. Provider들의 `onUpdate`가 이를 호출.

- [ ] **Step 1: HwyWidgetRenderer.kt**

```kotlin
package com.howweatheryou.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.howweatheryou.app.MainActivity
import com.howweatheryou.app.R

object HwyWidgetRenderer {

    fun updateAll(context: Context) {
        val mgr = AppWidgetManager.getInstance(context)
        renderProvider(context, mgr, HwyWidgetMediumProvider::class.java, R.layout.hwy_widget_medium, true)
        renderProvider(context, mgr, HwyWidgetSmallProvider::class.java, R.layout.hwy_widget_small, false)
    }

    private fun renderProvider(
        context: Context,
        mgr: AppWidgetManager,
        cls: Class<*>,
        layoutRes: Int,
        showMessage: Boolean,
    ) {
        val ids = mgr.getAppWidgetIds(ComponentName(context, cls))
        if (ids == null || ids.isEmpty()) return
        val data = WidgetData.read(context)
        for (id in ids) {
            val views = RemoteViews(context.packageName, layoutRes)
            views.setTextViewText(R.id.hwy_head, data.head)
            views.setTextViewText(R.id.hwy_city, data.city)
            views.setTextViewText(R.id.hwy_range, data.range)
            if (showMessage) views.setTextViewText(R.id.hwy_message, data.message)
            views.setOnClickPendingIntent(R.id.hwy_root, openAppIntent(context))
            mgr.updateAppWidget(id, views)
        }
    }

    private fun openAppIntent(context: Context): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        return PendingIntent.getActivity(context, 0, intent, flags)
    }
}
```

- [ ] **Step 2: HwyWidgetMediumProvider.kt**

```kotlin
package com.howweatheryou.app.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context

class HwyWidgetMediumProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
        HwyWidgetRenderer.updateAll(context)
    }
}
```

- [ ] **Step 3: HwyWidgetSmallProvider.kt**

```kotlin
package com.howweatheryou.app.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context

class HwyWidgetSmallProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
        HwyWidgetRenderer.updateAll(context)
    }
}
```

- [ ] **Step 4: 커밋**

```bash
git add android/app/src/main/java/com/howweatheryou/app/widget/HwyWidgetRenderer.kt \
        android/app/src/main/java/com/howweatheryou/app/widget/HwyWidgetMediumProvider.kt \
        android/app/src/main/java/com/howweatheryou/app/widget/HwyWidgetSmallProvider.kt
git commit -m "feat(widget): RemoteViews 렌더러 + 중/소 AppWidgetProvider"
```

---

### Task 5: 브리지 모듈 + 패키지 등록 + Manifest receiver (빌드 성립)

**Files:**
- Create: `android/app/src/main/java/com/howweatheryou/app/widget/WidgetBridge.kt`
- Create: `android/app/src/main/java/com/howweatheryou/app/widget/WidgetPackage.kt`
- Modify: `android/app/src/main/java/com/howweatheryou/app/MainApplication.kt` (add WidgetPackage)
- Modify: `android/app/src/main/AndroidManifest.xml` (receiver ×2)

**Interfaces:**
- Consumes: `WidgetData.write`, `HwyWidgetRenderer.updateAll`, `HwyWidgetMediumProvider`/`HwyWidgetSmallProvider`.
- Produces (JS 노출): `NativeModules.WidgetBridge.setData(json)`, `NativeModules.WidgetBridge.requestPin(size): Promise<"ok"|"unsupported">`.

- [ ] **Step 1: WidgetBridge.kt (레거시 ReactContextBaseJavaModule)**

```kotlin
package com.howweatheryou.app.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class WidgetBridge(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "WidgetBridge"

    // 표시 데이터 저장 후 즉시 위젯 갱신.
    @ReactMethod
    fun setData(json: String) {
        WidgetData.write(reactContext, json)
        HwyWidgetRenderer.updateAll(reactContext)
    }

    // 인앱 위젯 추가 요청. 지원되면 "ok", 아니면 "unsupported".
    @ReactMethod
    fun requestPin(size: String, promise: Promise) {
        try {
            val mgr = AppWidgetManager.getInstance(reactContext)
            if (Build.VERSION.SDK_INT < 26 || !mgr.isRequestPinAppWidgetSupported) {
                promise.resolve("unsupported")
                return
            }
            val cls = if (size == "small") HwyWidgetSmallProvider::class.java
                      else HwyWidgetMediumProvider::class.java
            val ok = mgr.requestPinAppWidget(ComponentName(reactContext, cls), null, null)
            promise.resolve(if (ok) "ok" else "unsupported")
        } catch (e: Exception) {
            promise.reject("PIN_ERROR", e)
        }
    }
}
```

- [ ] **Step 2: WidgetPackage.kt**

```kotlin
package com.howweatheryou.app.widget

import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class WidgetPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(WidgetBridge(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<View, *>> =
        emptyList()
}
```

- [ ] **Step 3: MainApplication.kt — WidgetPackage 등록**

`getPackages()`의 `.apply { }` 안을 아래로 (import는 `com.howweatheryou.app.widget.WidgetPackage`가 같은 앱 패키지라 불필요):
```kotlin
          PackageList(this).packages.apply {
            // Packages that cannot be autolinked yet can be added manually here:
            add(com.howweatheryou.app.widget.WidgetPackage())
          }
```

- [ ] **Step 4: AndroidManifest.xml — receiver ×2**

`</application>` 바로 위에 추가:
```xml
    <!-- 홈위젯 (순수 네이티브 — 코드젠 없음) -->
    <receiver android:name=".widget.HwyWidgetMediumProvider" android:exported="false" android:label="하우웨더유 날씨·메시지">
      <intent-filter>
        <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
      </intent-filter>
      <meta-data android:name="android.appwidget.provider" android:resource="@xml/hwy_widget_medium_info" />
    </receiver>
    <receiver android:name=".widget.HwyWidgetSmallProvider" android:exported="false" android:label="하우웨더유 날씨">
      <intent-filter>
        <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
      </intent-filter>
      <meta-data android:name="android.appwidget.provider" android:resource="@xml/hwy_widget_small_info" />
    </receiver>
```

- [ ] **Step 5: 컴파일 확인 (clean 빌드)**

Run: `cd android && ./gradlew clean assembleRelease -x lintVitalRelease -x lintVitalAnalyzeRelease -x lintVitalReportRelease`
Expected: `BUILD SUCCESSFUL`. (Kotlin 컴파일 에러 없어야 함.)

- [ ] **Step 6: 커밋**

```bash
git add android/app/src/main/java/com/howweatheryou/app/widget/WidgetBridge.kt \
        android/app/src/main/java/com/howweatheryou/app/widget/WidgetPackage.kt
# MainApplication.kt, AndroidManifest.xml 은 /android(gitignore)라 커밋 안 잡힐 수 있음 — 정상
git commit -m "feat(widget): 레거시 브리지 모듈 + 패키지 등록 + manifest receiver" || echo "android/ gitignored — 로컬 변경만"
```

---

### Task 6: RN 배선 (홈 갱신 + 설정 섹션 + 히스토리 액션 + i18n)

**Files:**
- Modify: `src/i18n/translations.ts` (widget.* ko/en)
- Modify: `src/screens/HomeScreen.tsx` (날씨 로드 시 위젯 갱신)
- Modify: `src/screens/SettingsScreen.tsx` ("홈 위젯" 섹션)
- Modify: `src/screens/HistoryScreen.tsx` (항목에 "위젯에 표시")

**Interfaces:**
- Consumes: `buildWidgetPayload(weather)`, `updateWidgetData(payload)`, `pinWidget(size)`, `getWidgetChoice`/`setWidgetChoice`, `WidgetChoice`.

- [ ] **Step 1: i18n widget.* (ko/en) 추가**

`translations.ts`의 ko 최상위 객체에 섹션 추가(settings 근처):
```ts
    widget: {
      section: '홈 위젯',
      addMedium: '중형 위젯 추가',
      addSmall: '소형 위젯 추가',
      pickTitle: '위젯에 표시할 메시지',
      optAuto: '오늘의 메시지 자동',
      optBrief: '날씨 브리핑',
      show: '위젯에 표시',
      shown: '위젯에 표시했어요',
      unsupported: '홈 화면을 길게 눌러 위젯 목록에서 하우웨더유를 추가해주세요.',
      added: '위젯을 추가했어요. 홈 화면을 확인하세요.',
    },
```
en 최상위 객체에도:
```ts
    widget: {
      section: 'Home widget',
      addMedium: 'Add medium widget',
      addSmall: 'Add small widget',
      pickTitle: 'Message shown on widget',
      optAuto: "Today's message (auto)",
      optBrief: 'Weather briefing',
      show: 'Show on widget',
      shown: 'Added to your widget',
      unsupported: 'Long-press your home screen and add How Weather You from the widget list.',
      added: 'Widget added. Check your home screen.',
    },
```

- [ ] **Step 2: HomeScreen — 날씨 로드/메시지 생성 시 위젯 갱신**

import 추가(services import 근처):
```ts
import { pushWidget } from '../services/widgetContent';
```
storage import에 `setLastWidgetWeather` 추가(기존 storage import 라인에 병합):
```ts
import { saveMessage, isGuideDismissedToday, dismissGuideToday, isProfilePrompted, setProfilePrompted, recordTempPoint, getYesterdayTempDelta, setLastWidgetWeather } from '../utils/storage';
```
날씨 effect(이미 `refreshNotificationsIfNeeded` + `recordTempPoint` 하는 그 useEffect)에 캐시+갱신 추가:
```ts
  useEffect(() => {
    if (weather) {
      refreshNotificationsIfNeeded(weather).catch(() => {});
      (async () => {
        await recordTempPoint(weather.temp);
        setTempDelta(await getYesterdayTempDelta(weather.temp));
        await setLastWidgetWeather(weather);
        await pushWidget();
      })().catch(() => {});
    }
  }, [weather]);
```
메시지 저장 effect(`if (message && weather && !isGuest) saveMessage(...)`)에 위젯 갱신 추가(게스트도 위젯 갱신되게 `!isGuest` 밖에서):
```ts
  useEffect(() => {
    if (message && weather) {
      pushWidget().catch(() => {}); // 위젯 라인은 로컬 — 게스트도 갱신
      if (!isGuest) saveMessage(message, weather.emoji, lastInputs.current).catch(() => {});
    }
  }, [message]);
```

- [ ] **Step 3: 타입체크 후 커밋 1**

Run: `npx tsc --noEmit` → PASS.
```bash
git add src/i18n/translations.ts src/screens/HomeScreen.tsx
git commit -m "feat(widget): i18n + 홈 날씨 로드 시 위젯 갱신"
```

- [ ] **Step 4: SettingsScreen — "홈 위젯" 섹션**

상단 import에 추가:
```ts
import { Platform, ToastAndroid } from 'react-native';
import { pinWidget } from '../services/widget';
import { pushWidget } from '../services/widgetContent';
import { getWidgetChoice, setWidgetChoice, getMessages, WidgetChoice, StoredMessage } from '../utils/storage';
```
> `Platform`/`ToastAndroid`가 이미 import 되어 있으면 중복 추가하지 말 것. 기존 `react-native` import 라인에 병합.

컴포넌트 상태 추가:
```ts
  const [widgetChoice, setWidgetChoiceState] = useState<WidgetChoice>({ kind: 'auto' });
  const [widgetPickerOpen, setWidgetPickerOpen] = useState(false);
  const [widgetMsgs, setWidgetMsgs] = useState<StoredMessage[]>([]);
  useEffect(() => { getWidgetChoice().then(setWidgetChoiceState); }, []);
```
핸들러:
```ts
  const handleAddWidget = async (size: 'medium' | 'small') => {
    const r = await pinWidget(size);
    if (r === 'ok') ToastAndroid.show(t('widget.added'), ToastAndroid.LONG);
    else Alert.alert(t('widget.section'), t('widget.unsupported'));
  };
  const openWidgetPicker = async () => {
    setWidgetMsgs((await getMessages()).filter((m) => (m.kind ?? 'message') === 'message'));
    setWidgetPickerOpen(true);
  };
  const chooseWidget = async (c: WidgetChoice) => {
    await setWidgetChoice(c);
    setWidgetChoiceState(c);
    setWidgetPickerOpen(false);
    await pushWidget(); // 즉시 위젯 반영
  };
```
JSX — 알림 섹션 아래에 (안드로이드 전용). `Alert`가 이미 import 안 됐으면 추가:
```tsx
      {Platform.OS === 'android' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('widget.section')}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity style={[styles.widgetBtn]} onPress={() => handleAddWidget('medium')}>
              <Text style={styles.widgetBtnText}>{t('widget.addMedium')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.widgetBtn]} onPress={() => handleAddWidget('small')}>
              <Text style={styles.widgetBtnText}>{t('widget.addSmall')}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.widgetPickRow} onPress={openWidgetPicker}>
            <Text style={styles.widgetPickLabel}>{t('widget.pickTitle')}</Text>
            <Text style={styles.widgetPickValue}>
              {widgetChoice.kind === 'auto' ? t('widget.optAuto')
                : widgetChoice.kind === 'brief' ? t('widget.optBrief')
                : widgetChoice.text}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal transparent visible={widgetPickerOpen} animationType="fade" onRequestClose={() => setWidgetPickerOpen(false)}>
        <Pressable style={styles.widgetModalBg} onPress={() => setWidgetPickerOpen(false)}>
          <View style={styles.widgetModalCard}>
            <TouchableOpacity style={styles.widgetOpt} onPress={() => chooseWidget({ kind: 'auto' })}>
              <Text style={styles.widgetOptText}>{t('widget.optAuto')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.widgetOpt} onPress={() => chooseWidget({ kind: 'brief' })}>
              <Text style={styles.widgetOptText}>{t('widget.optBrief')}</Text>
            </TouchableOpacity>
            {widgetMsgs.map((m) => (
              <TouchableOpacity key={m.id} style={styles.widgetOpt}
                onPress={() => chooseWidget({ kind: 'message', id: m.id, text: m.text })}>
                <Text style={styles.widgetOptText} numberOfLines={2}>{m.text}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
```
스타일 추가(StyleSheet.create 안):
```ts
  widgetBtn: { flex: 1, backgroundColor: COLORS.ember, borderRadius: RADII.btn, paddingVertical: 13, alignItems: 'center' },
  widgetBtnText: { color: COLORS.emberText, fontFamily: FONTS.serifKoBold, fontSize: 14 },
  widgetPickRow: { marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  widgetPickLabel: { color: COLORS.ink, fontSize: 14 },
  widgetPickValue: { color: COLORS.ink2, fontSize: 13, flex: 1, textAlign: 'right', marginLeft: 12 },
  widgetModalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 24 },
  widgetModalCard: { backgroundColor: COLORS.card, borderRadius: RADII.sheet, padding: 12, maxHeight: '70%' },
  widgetOpt: { paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: COLORS.line2 },
  widgetOptText: { color: COLORS.ink, fontSize: 14 },
```
> `Modal`/`Pressable`/`Alert`/`COLORS`/`FONTS`/`RADII`/`styles.section`/`styles.sectionTitle`가 SettingsScreen에 이미 있는지 확인하고 없으면 import/정의. (SettingsScreen은 이미 Modal·섹션 패턴 사용 중.)

- [ ] **Step 5: HistoryScreen — 항목에 "위젯에 표시"**

import:
```ts
import { setWidgetChoice } from '../utils/storage';
import { pushWidget } from '../services/widgetContent';
```
(안드로이드에서 ToastAndroid, Platform 필요 — 기존 import에 병합.)
각 메시지 항목의 액션 영역(공유 버튼 근처)에 추가:
```tsx
            {Platform.OS === 'android' && (
              <TouchableOpacity
                onPress={async () => {
                  await setWidgetChoice({ kind: 'message', id: item.id, text: item.text });
                  await pushWidget();
                  ToastAndroid.show(t('widget.shown'), ToastAndroid.SHORT);
                }}
                style={styles.widgetPin}
              >
                <Ionicons name="phone-portrait-outline" size={18} color={COLORS.ink2} />
              </TouchableOpacity>
            )}
```
스타일:
```ts
  widgetPin: { padding: 6, marginLeft: 4 },
```
> `Ionicons`가 HistoryScreen에 이미 import 되어 있는지 확인(대부분 됨). `item`은 해당 리스트 렌더의 메시지 변수명에 맞출 것(현 코드 확인).

- [ ] **Step 6: 타입체크 후 커밋 2**

Run: `npx tsc --noEmit` → PASS.
```bash
git add src/screens/SettingsScreen.tsx src/screens/HistoryScreen.tsx
git commit -m "feat(widget): 설정 홈위젯 섹션(추가/메시지선택) + 히스토리 위젯 꽂기"
```

---

### Task 7: 버전업 + clean 빌드 + 실기기 검증 + 배포

**Files:**
- Modify: `android/app/build.gradle` (vc41/1.2.3), `app.json`, `src/screens/SettingsScreen.tsx`(표시 v1.2.3)

- [ ] **Step 1: 버전 3곳**

`android/app/build.gradle`: `versionCode 41` / `versionName "1.2.3"`.
`app.json`: `"version": "1.2.3"`, android `"versionCode": 41`.
`SettingsScreen.tsx`: `v1.2.2` → `v1.2.3`.

- [ ] **Step 2: clean 빌드 (APK, 실기기용)**

Run: `cd android && ./gradlew clean assembleRelease -x lintVitalRelease -x lintVitalAnalyzeRelease -x lintVitalReportRelease`
Expected: `BUILD SUCCESSFUL`, APK at `android/app/build/outputs/apk/release/app-release.apk`.

- [ ] **Step 3: 설치 (서명 다르면 uninstall 후)**

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk \
  || (adb uninstall com.howweatheryou.app && adb install android/app/build/outputs/apk/release/app-release.apk)
adb shell pm grant com.howweatheryou.app android.permission.ACCESS_FINE_LOCATION
adb shell pm grant com.howweatheryou.app android.permission.POST_NOTIFICATIONS
```

- [ ] **Step 4: 콜드스타트 10회 크래시 0 (최우선)**

```bash
adb logcat -c; C=0
for i in $(seq 1 10); do
  adb shell am force-stop com.howweatheryou.app
  adb shell monkey -p com.howweatheryou.app -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
  adb shell sleep 4
  adb logcat -d | grep -q "runtime not ready\|Fatal signal 6" && C=$((C+1))
  adb logcat -c
done
echo "crashes: $C"
```
Expected: `crashes: 0`.

- [ ] **Step 5: 위젯 육안 검증 (사용자 협조 — 잠금 해제/위젯 추가)**

- 앱 홈 열어 날씨 로드(위젯 데이터 채움).
- 설정 → **중형 위젯 추가** → OS "추가?" → 홈에 배치. `MSYS_NO_PATHCONV=1`로 스샷: 반투명 배경 + `🌤️ 24°`/도시/최저최고/메시지 표시.
- **소형 위젯 추가** → 날씨만.
- 설정 픽커에서 **날씨 브리핑** 선택 → 위젯 메시지 바뀜 확인.
- 히스토리 항목 **위젯에 표시** → 그 메시지로 바뀜 + 토스트.
- 위젯 탭 → 앱 열림.
- 설정에서 언어 EN → 위젯 문구 영어(다음 갱신 시).

- [ ] **Step 6: AAB 빌드 + 커밋 + push**

```bash
cd android && ./gradlew bundleRelease -x lintVitalRelease -x lintVitalAnalyzeRelease -x lintVitalReportRelease
cd .. && git add app.json src/screens/SettingsScreen.tsx
git commit -m "chore(widget): 1.2.3/vc41 (홈위젯 순수 네이티브)"
git push
```
Expected: `BUILD SUCCESSFUL`, AAB at `android/app/build/outputs/bundle/release/app-release.aab`.

## 검증 (스펙 §검증 대응)
- 선택저장·표시계산: T1. 브리지: T2. 리소스: T3. 렌더·provider: T4. 브리지등록·manifest·컴파일: T5. RN 배선·i18n: T6. clean빌드+콜드스타트10회+육안+배포: T7.

## 후속 (범위 밖)
iOS 위젯, 위젯 3사이즈, 위젯에서 직접 생성, OS 주기 자동갱신.
