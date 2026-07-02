# 스펙 — 홈스크린 위젯 (순수 네이티브 재설계)

- 작성일: 2026-07-02
- 상태: 설계 승인됨 (구현 대기)
- 저장 위치: `howweateryou/specs/` (공개 `docs/` 아님)
- 대체: `2026-06-29-widget-design.md`(react-native-android-widget 기반)는 **폐기**. 그 라이브러리는 이 앱과 비호환(아래 참조).

## 배경 / 왜 재설계

- 1차 시도(`react-native-android-widget` 0.20.3)는 앱을 **간헐적으로 SIGABRT 크래시**시킴.
- 근본원인: 라이브러리의 `NativeAndroidWidget` **TurboModule 스펙**이 RN 코드젠(`libappmodules.so`)을 유발 → 이 앱은 `newArchEnabled:false` + prebuild 미사용(수기 android/)이라 그 so가 제대로 로드 안 됨 → 콜드스타트와 경쟁 시 코어 네이티브 모듈(`PlatformConstants`) 등록 실패 → 프로세스 전체 abort.
- 결론: **코드젠/TurboModule을 유발하지 않는 순수 네이티브 위젯**으로 구현. RN↔네이티브 통신은 **레거시 `ReactContextBaseJavaModule`**(코드젠 없음)만 사용.

## 목표

안드로이드 홈스크린에 오늘 날씨(+선택 메시지)를 띄우는 위젯. 앱 설정에서 추가하고, 표시할 메시지를 앱 안(설정/히스토리)에서 고른다. 탭하면 앱 열림. 재방문·가시성 레버.

## 비목표 (v1 밖)

- iOS 위젯(WidgetKit/Swift 별도).
- 위젯에서 직접 AI 메시지 생성(비용·한도).
- 백그라운드 자동 날씨 갱신(앱 열 때 갱신으로 충분).
- 네이티브 위젯 설정(config) 액티비티 — 메시지 선택은 **앱 안 RN UI**에서(사용자 결정).

## 현행 제약 (확인됨)

- Expo SDK54, RN 0.81.5, `newArchEnabled:false`(Old Architecture).
- **커스텀 android/ 폴더 수기 관리** → `expo prebuild` 재실행 금지.
- `MainApplication.kt`가 `PackageList(this).packages.apply { }` 사용 → 여기에 `add(WidgetPackage())`로 레거시 네이티브 패키지 **수동 등록 가능**(autolinking 밖, 코드젠 없음).
- 로컬 데이터: `utils/storage.getMessages()`(StoredMessage[]), 날씨 `WeatherInfo`, 브리핑 로직 `services/brief.ts.buildBriefLine()`(옷차림+우산, 이미 존재 — 재사용).

## 아키텍처

```
[RN 앱]                                  [네이티브 (Kotlin)]
services/widget.ts                       WidgetBridge (레거시 NativeModule)
  updateWidgetData(payload) ───────────▶  setData(jsonString)
                                            → SharedPreferences("hwy_widget")
                                            → AppWidgetManager.updateAppWidget(전 위젯)
  pinWidget('medium'|'small') ─────────▶  requestPin(size)
                                            → AppWidgetManager.requestPinAppWidget()

SettingsScreen "홈 위젯" 섹션             HwyWidgetMediumProvider (AppWidgetProvider)
  · [중형 추가] [소형 추가]               HwyWidgetSmallProvider (AppWidgetProvider)
  · 표시 메시지 픽커                        onUpdate(): SharedPreferences 읽어
HistoryScreen 항목                           RemoteViews 렌더 (반투명 배경 + 날씨 + 메시지)
  · [위젯에 표시] 아이콘                     루트 clickAction: 앱 실행 PendingIntent
```

### 컴포넌트별 책임

**네이티브 (`android/app/src/main/java/com/howweatheryou/app/widget/`)**
- `WidgetData.kt` — SharedPreferences(`hwy_widget`) 읽기/쓰기 헬퍼. 키: emoji/temp/city/tempMin/tempMax/line(표시할 한 줄). 순수 데이터, UI 없음.
- `HwyWidgetMediumProvider.kt` — `AppWidgetProvider`. 4×2. `onUpdate`/`onReceive`에서 `WidgetData` 읽어 `RemoteViews(R.layout.hwy_widget_medium)` 채움. 루트에 앱 실행 PendingIntent.
- `HwyWidgetSmallProvider.kt` — 위와 동일, 2×2, `hwy_widget_small` 레이아웃(날씨만).
- `WidgetBridge.kt` — `ReactContextBaseJavaModule`. `@ReactMethod setData(json)`, `@ReactMethod requestPin(size)`. **코드젠·TurboModule 아님.**
- `WidgetPackage.kt` — `ReactPackage`. `createNativeModules`에 `WidgetBridge`. `MainApplication.kt`에서 `add(WidgetPackage())`.

**네이티브 리소스 (`android/app/src/main/res/`)**
- `xml/hwy_widget_medium_info.xml`, `xml/hwy_widget_small_info.xml` — `appwidget-provider`(minWidth/Height, targetCell, `updatePeriodMillis=0`, resizeMode, `previewLayout`).
- `layout/hwy_widget_medium.xml`, `layout/hwy_widget_small.xml` — RemoteViews 레이아웃(지원 위젯: LinearLayout/TextView/ImageView만).
- `drawable/hwy_widget_bg.xml` — 반투명 차콜 라운드(`<shape>` solid `#B3141922`, corners 20dp).

**RN**
- `services/widget.ts` — `updateWidgetData(weather, resolvedLine)`, `pinWidget(size)`. Android 아니면 no-op. `NativeModules.WidgetBridge` 접근(없으면 graceful).
- `utils/storage.ts` — 위젯 표시 선택 저장: `WIDGET_MSG` 키. `getWidgetChoice()/setWidgetChoice(choice)`. choice = `{kind:'auto'}` | `{kind:'brief'}` | `{kind:'message', id, text}`.
- `services/widgetContent.ts` — 표시할 한 줄 계산: choice 읽어 → message.text / 오늘 최신 메시지 / `buildBriefLine`. (규칙 한 곳에.)
- `SettingsScreen.tsx` — "홈 위젯" 섹션(Platform.OS==='android'): 추가 버튼 2개 + 메시지 픽커 모달.
- `HistoryScreen.tsx` — 각 항목에 "위젯에 표시" 액션.

## 데이터 흐름 / 표시 규칙

1. 위젯에 실제 표시할 **한 줄**은 RN `widgetContent.resolveWidgetLine()`이 계산:
   - 선택 = `message` → 그 텍스트
   - 선택 = `auto`(기본) → 오늘(로컬 날짜) 생성된 `kind==='message'` 최신 것, 없으면 브리핑
   - 선택 = `brief` → `buildBriefLine(weather, lang, hour)`
   - 길면 자름(중형 ~90자).
2. RN이 `updateWidgetData({emoji,temp,city,tempMin,tempMax,line})` 호출 → 네이티브가 SharedPreferences 저장 + 모든 위젯 즉시 갱신.
3. 소형은 `line` 무시(날씨만). 중형은 `line` 표시.
4. **갱신 시점**: 앱 홈 날씨 로드 effect / 메시지 생성·선택 / 히스토리에서 꽂기 / 위젯 추가 직후. OS 주기갱신 `updatePeriodMillis=0`.

## 위젯 추가 (인앱)

- 설정의 `[중형/소형 위젯 추가]` → `WidgetBridge.requestPin(size)` → `AppWidgetManager.requestPinAppWidget(provider, null, null)`.
- **런처 미지원**(`isRequestPinAppWidgetSupported()==false`) → RN에서 알럿: "홈 화면을 길게 눌러 위젯 목록에서 하우웨더유를 추가해주세요."
- 추가 직후 위젯은 마지막 저장 데이터로 렌더(없으면 "앱을 열어 날씨를 불러오세요" placeholder line).

## UI 상세

**중형 4×2** (`hwy_widget_medium.xml`)
- 배경 `@drawable/hwy_widget_bg`, padding 14dp.
- 상단 행: `{emoji} {temp}°`(큰, 흰색) + `{city}`(작게, 우측).
- `최저 {min}° / 최고 {max}°`(작게).
- 메시지 한 줄(최대 2줄, ellipsize).

**소형 2×2** (`hwy_widget_small.xml`)
- 배경 동일. `{emoji} {temp}°` + `{city}`(작게) + `{min}/{max}`.

**색**: 배경 `#B3141922`(반투명 차콜), 글자 `#FFFFFF`/`#D8FFFFFF`. 앱 페이퍼톤 대신 위젯은 어두운 반투명(바탕화면 대비·가독성).

**설정 "홈 위젯" 섹션**: 알림 섹션 아래. 추가 버튼 2개 + "위젯에 표시할 메시지" 행(탭 → 모달: 자동/브리핑/메시지 목록). 현재 선택 표시.

**히스토리 항목 액션**: 기존 공유(↗)·북마크 옆에 위젯 아이콘. 탭 → `setWidgetChoice({kind:'message',...})` + `updateWidgetData` + 토스트.

## i18n
`widget.*` ko/en: 섹션 제목, 추가 버튼(중/소), 픽커 옵션(자동/브리핑), "위젯에 표시", 미지원 안내, placeholder line, 토스트.

## 에러 처리
- `NativeModules.WidgetBridge` 없음(iOS/구버전) → 모든 RN 위젯 호출 no-op.
- SharedPreferences 파싱 실패 → 네이티브가 placeholder 렌더(크래시 X).
- `requestPin` 예외 → catch 후 안내 알럿.
- 위젯 미추가 상태에서 `updateAppWidget` → 대상 0개, 무해.

## 검증
- `npx tsc --noEmit`, `npx expo install --check`(새 JS dep 없음).
- **clean 빌드**(`./gradlew clean assembleRelease`) — 네이티브 추가.
- **실기기 필수**:
  1. **콜드스타트 10회 크래시 0** (최우선 — 1차 실패 지점).
  2. 설정 → 중형 추가 / 소형 추가 → 홈에 표시.
  3. 반투명 배경이 바탕화면에 자연스럽게.
  4. 앱에서 메시지 생성/선택 → 위젯 반영. 히스토리에서 꽂기 → 반영.
  5. 위젯 탭 → 앱 열림.
  6. 게스트도 표시. EN 로케일 문구.
- 회귀: 기존 홈/알림/공유/히스토리 정상.

## 변경/생성 파일 요약
- **생성(네이티브)**: `widget/WidgetData.kt`, `widget/HwyWidgetMediumProvider.kt`, `widget/HwyWidgetSmallProvider.kt`, `widget/WidgetBridge.kt`, `widget/WidgetPackage.kt`; `res/xml/hwy_widget_medium_info.xml`, `res/xml/hwy_widget_small_info.xml`; `res/layout/hwy_widget_medium.xml`, `res/layout/hwy_widget_small.xml`; `res/drawable/hwy_widget_bg.xml`.
- **생성(RN)**: `services/widget.ts`, `services/widgetContent.ts`.
- **수정**: `MainApplication.kt`(add WidgetPackage), `AndroidManifest.xml`(receiver 2개 수기), `utils/storage.ts`(WIDGET_MSG), `screens/SettingsScreen.tsx`, `screens/HistoryScreen.tsx`, `i18n/translations.ts`, `screens/HomeScreen.tsx`(날씨 로드 시 updateWidgetData 호출).
- **버전**: 1.2.3 / vc41 (또는 사용자 확정).

## 미해결 없음
