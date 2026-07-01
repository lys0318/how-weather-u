# 안드로이드 홈위젯 — 구현 계획

> **For agentic workers:** superpowers:executing-plans로 태스크별. 스펙 `specs/2026-06-29-widget-design.md` 참조. **위젯은 실기기에서만 검증됨**(에뮬/실기기).

**Goal:** 안드 홈위젯에 오늘 날씨 + 한 줄(오늘 메시지 or 날씨 브리핑), 탭 시 앱 열림.

**Architecture:** `react-native-android-widget`(JS로 위젯 UI + `requestWidgetUpdate`로 갱신). 커스텀 android/라 prebuild 금지 → 네이티브 통합 수기. 한 줄 = 로컬 데이터(비용 0). 앱 열 때 갱신.

**Tech Stack:** RN/Expo SDK54, react-native-android-widget, AsyncStorage.

## Global Constraints
- **prebuild 금지** — 커스텀 android/(AdMob·권한·인텐트필터) 덮어쓰기 위험. 플러그인이 넣는 것 수기 병합.
- **안드로이드 전용**(iOS no-op). 새 AI 호출 없음(로컬 데이터).
- 새 네이티브 dep → `expo install --check` + **clean 빌드**.
- 검증은 **실기기** 필수. working dir `howweateryou`.

---

### Task 1: 라이브러리 설치
**Files:** Modify `package.json`
- [ ] Step 1: `npx expo install react-native-android-widget`
- [ ] Step 2: `npx expo install --check` → 버전 충돌 없음 확인. (충돌 시 expo 권장 버전으로.)
- [ ] Step 3: `npx tsc --noEmit` → PASS
- [ ] Step 4: 커밋 `chore(widget): react-native-android-widget 설치`

### Task 2: 브리핑 한 줄 공통 헬퍼 (알림·위젯 공유)
**Files:** Create `src/services/brief.ts`; Modify `src/services/notification.ts`
**Interfaces:** Produces `buildBriefLine(weather: WeatherInfo, lang: 'ko'|'en', hour: number): string`
- [ ] Step 1: `src/services/brief.ts` 작성 (notification.buildBriefContent의 본문 로직 이관):
```ts
import { WeatherInfo, outfitFor, computeUmbrella } from '../constants/weather';

// "오늘 3~11° · 따뜻하게 입어요 · 14시 뒤 비 70%, 우산 챙겨요 ☂️"
export function buildBriefLine(weather: WeatherInfo, lang: 'ko' | 'en', hour: number): string {
  const en = lang === 'en';
  const o = outfitFor(weather.tempMax);
  const outfitDesc = en ? o.en.desc : o.ko.desc;
  const u = computeUmbrella(weather, hour);
  const pct = Math.round(u.pop * 100);
  let umb = '';
  if (u.raining) umb = en ? ' · Rain now, umbrella ☂️' : ' · 지금 비, 우산 챙겨요 ☂️';
  else if (u.needed) {
    const h = u.hoursUntil ?? 0;
    umb = en ? ` · Rain in ${h}h${pct > 0 ? ` (${pct}%)` : ''} ☂️` : ` · ${h}시간 뒤 비${pct > 0 ? ` ${pct}%` : ''}, 우산 ☂️`;
  }
  const range = `${weather.tempMin}~${weather.tempMax}°`;
  return en ? `Today ${range} · ${outfitDesc}${umb}` : `오늘 ${range} · ${outfitDesc}${umb}`;
}
```
- [ ] Step 2: `notification.ts`의 `buildBriefContent`가 `buildBriefLine` 재사용하도록 수정(본문 = `buildBriefLine(weather, getCurrentLang(), SLOT_CONFIG[slot].hour)`, 제목은 그대로). 중복 로직 제거.
- [ ] Step 3: `npx tsc --noEmit` → PASS. 커밋 `refactor(widget): 브리핑 한 줄 공통 헬퍼 추출`

### Task 3: 위젯 UI 컴포넌트
**Files:** Create `src/widgets/WeatherWidget.tsx`
**Interfaces:** Produces `WeatherWidget` (props `{ emoji; temp; city; line }`)
- [ ] Step 1: 작성 (lib의 `FlexWidget`/`TextWidget`):
```tsx
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

export interface WeatherWidgetProps {
  emoji: string;
  temp: string;   // 예 "24°"
  city: string;
  line: string;
}

export function WeatherWidget({ emoji, temp, city, line }: WeatherWidgetProps) {
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent', width: 'match_parent',
        flexDirection: 'column', justifyContent: 'center',
        backgroundColor: '#F3ECDF', borderRadius: 20, padding: 14,
      }}
    >
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TextWidget text={`${emoji} ${temp}`} style={{ fontSize: 26, color: '#2B2620', fontWeight: '700' }} />
        <TextWidget text={`  ${city}`} style={{ fontSize: 13, color: '#6B6253' }} />
      </FlexWidget>
      <TextWidget text={line} maxLines={2} style={{ fontSize: 14, color: '#2B2620', marginTop: 6 }} />
    </FlexWidget>
  );
}
```
- [ ] Step 2: `npx tsc --noEmit` → PASS. 커밋 `feat(widget): 위젯 UI 컴포넌트`

### Task 4: 위젯 갱신 서비스 + 태스크 핸들러 등록
**Files:** Create `src/services/widget.ts`; Modify `App.tsx` (또는 `index.js` 엔트리)
**Interfaces:** Produces `updateWidget(weather?: WeatherInfo): Promise<void>`
- [ ] Step 1: `src/services/widget.ts`:
```ts
import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';
import React from 'react';
import { WeatherInfo } from '../constants/weather';
import { getMessages } from '../utils/storage';
import { getCurrentLang } from '../i18n';
import { buildBriefLine } from './brief';
import { WeatherWidget } from '../widgets/WeatherWidget';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function updateWidget(weather?: WeatherInfo): Promise<void> {
  if (Platform.OS !== 'android' || !weather) return;
  // 한 줄: 오늘 받은 메시지 있으면 그거, 없으면 브리핑
  let line: string;
  try {
    const msgs = await getMessages();
    const todayMsg = msgs.find(
      (m) => (m.kind ?? 'message') === 'message' && m.generatedAt.slice(0, 10) === todayKey(),
    );
    line = todayMsg ? todayMsg.text : buildBriefLine(weather, getCurrentLang(), new Date().getHours());
  } catch {
    line = buildBriefLine(weather, getCurrentLang(), new Date().getHours());
  }
  if (line.length > 90) line = line.slice(0, 88) + '…';
  try {
    await requestWidgetUpdate({
      widgetName: 'WeatherWidget',
      renderWidget: () =>
        React.createElement(WeatherWidget, {
          emoji: weather.emoji, temp: `${weather.temp}°`, city: weather.city, line,
        }),
    });
  } catch {}
}
```
- [ ] Step 2: 엔트리(App.tsx 최상단 또는 index.js)에 태스크 핸들러 등록 — lib 문서의 `registerWidgetTaskHandler` 패턴:
```ts
import { registerWidgetTaskHandler } from 'react-native-android-widget';
// 위젯이 OS로부터 갱신 요청받을 때: 마지막 앱 데이터가 없으면 그대로 둠(빈 갱신 no-op)
registerWidgetTaskHandler(async () => { /* 데이터는 앱에서 push. 여기선 유지 */ });
```
> 정확한 시그니처/등록 위치는 `react-native-android-widget` 문서(Task Handler) 기준. 위젯 이름 `WeatherWidget` 일치시킬 것.
- [ ] Step 3: `npx tsc --noEmit` → PASS. 커밋 `feat(widget): updateWidget 서비스 + 태스크 핸들러`

### Task 5: 네이티브 수기 통합 (prebuild 금지)
**Files:** Modify `android/app/src/main/AndroidManifest.xml`; Create `android/app/src/main/res/xml/hww_widget_info.xml`; (필요 시) `android/app/build.gradle`
- [ ] Step 1: 플러그인이 생성하는 네이티브를 확인 — 임시 사본에서 `npx expo prebuild --platform android` 실행해 **생성 결과만 참고**(receiver 이름·xml 형식·gradle 라인), 실제 android/엔 **수동 이식**. (원본 android/는 prebuild 하지 말 것.)
- [ ] Step 2: `res/xml/hww_widget_info.xml` 생성:
```xml
<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="250dp" android:minHeight="110dp"
    android:targetCellWidth="4" android:targetCellHeight="2"
    android:updatePeriodMillis="1800000"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen" />
```
- [ ] Step 3: `AndroidManifest.xml` `<application>` 안에 receiver 추가 (클래스명은 라이브러리 제공 provider — Step1 확인값):
```xml
<receiver android:name="com.reactnativeandroidwidget.RNWidgetProvider" android:exported="false">
  <intent-filter>
    <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
  </intent-filter>
  <meta-data android:name="android.appwidget.provider"
    android:resource="@xml/hww_widget_info" />
</receiver>
```
> receiver `android:name`은 라이브러리 실제 클래스로(Step1). 위젯 이름 매핑(`WeatherWidget`)은 lib 규약 따름.
- [ ] Step 4: (필요 시) autolinking이 gradle 처리 — clean 빌드로 확인.
- [ ] Step 5: 커밋 `feat(widget): 네이티브 receiver + provider 수기 통합`

### Task 6: 갱신 호출 연결
**Files:** Modify `src/screens/HomeScreen.tsx`
- [ ] Step 1: import `import { updateWidget } from '../services/widget';`
- [ ] Step 2: 날씨 effect(알림 갱신하는 그 useEffect)에 추가: `updateWidget(weather).catch(() => {});`
- [ ] Step 3: 메시지 저장 useEffect(`if (message && weather && !isGuest) saveMessage(...)`)에 `updateWidget(weather).catch(()=>{})` 추가(게스트도 위젯은 갱신되게 `!isGuest` 밖에서 호출 가능 — 위젯 라인은 로컬이므로).
- [ ] Step 4: `npx tsc --noEmit` → PASS. 커밋 `feat(widget): 앱에서 위젯 갱신 호출`

### Task 7: clean 빌드 + 실기기 검증 + 버전
- [ ] Step 1: 버전업 3곳(build.gradle·app.json·SettingsScreen) → 1.2.0/vc38.
- [ ] Step 2: `cd android && ./gradlew clean bundleRelease` (네이티브 dep라 clean 필수) → BUILD SUCCESSFUL.
- [ ] Step 3: (APK로 실기기) `./gradlew assembleRelease` → `adb install -r`. 홈에 위젯 추가:
  - 날씨+한 줄 표시 / 탭→앱 열림 / 앱에서 메시지 생성 후 위젯 갱신 / 게스트 표시 / EN 로케일.
- [ ] Step 4: 커밋 `chore: 1.2.0/vc38 (홈위젯)` + push.

## 검증 (스펙 §7 대응)
- 설치/충돌: T1. 브리핑 공유: T2. UI: T3. 데이터·폴백: T4. 네이티브: T5. 갱신 시점: T6. clean빌드+실기기: T7.

## 후속 (범위 밖)
iOS 위젯, 백그라운드 자동갱신(WorkManager/background-fetch), 2×2 소형, 위젯에서 직접 생성.
