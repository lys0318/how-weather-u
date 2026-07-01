# 스펙 — 안드로이드 홈스크린 위젯

- 작성일: 2026-06-29
- 상태: 설계 승인됨 (구현 대기)
- 저장 위치: `howweateryou/specs/` (공개 `docs/` 아님)

## 목표

안드로이드 홈스크린에 오늘 날씨 + 한 줄(AI 메시지 또는 날씨 브리핑)을 띄우는 위젯. 탭하면 앱 열림. 재방문/가시성 레버.

## 비목표 (v1 밖)
- iOS 위젯(WidgetKit/Swift 별도).
- 백그라운드 자동 갱신(expo-background-fetch 불안정) — 앱 열 때 갱신으로 충분.
- 위젯에서 직접 AI 메시지 생성(비용·한도).

## 현행 (확인됨)
- Expo SDK54, `newArchEnabled:false`. **커스텀 android/ 폴더 수기 관리** (AdMob meta-data·AD_ID 권한·인텐트필터) → `expo prebuild` 재실행 금지(덮어쓰기 위험, CLAUDE.md).
- 위젯 라이브러리 미설치. 네이티브 패키지 `com.howweatheryou.app`.
- 로컬 데이터: `utils/storage.getMessages()` (StoredMessage[], kind/generatedAt). 날씨 `WeatherInfo`(emoji/temp/tempMin/tempMax/city/condition...). 브리핑 로직 `notification.buildBriefContent`(옷차림+우산) — 재사용 대상.

## 1. 라이브러리 & 통합
- `react-native-android-widget` 설치 (`npx expo install react-native-android-widget` → `npx expo install --check`).
- config plugin이 자동으로 넣는 android/ 변경을 **수기 적용**(prebuild 금지):
  - `AndroidManifest.xml`: 위젯 `<receiver>` + `APPWIDGET_UPDATE` 인텐트필터 + meta-data(provider info xml 참조).
  - `res/xml/hww_widget_info.xml`: `appwidget-provider`(최소/기본 크기, resizeMode, updatePeriodMillis).
  - `build.gradle` 의존성(플러그인이 요구하는 것) — 라이브러리 문서 기준.
  - (라이브러리가 제공하는 `RNWidgetProvider`/리시버 클래스 등록.)
- **안드로이드 전용**. iOS 빌드엔 영향 없음(라이브러리 no-op).
- 새 네이티브 dep → **clean 빌드**(`cd android && ./gradlew clean bundleRelease`).

## 2. 위젯 UI — `src/widgets/WeatherWidget.tsx`
- `react-native-android-widget`의 `FlexWidget`/`TextWidget`/`ImageWidget`로 JS 정의.
- 레이아웃(4×2 기준):
  - 상단 행: `{emoji} {temp}°` (큰 글씨) + `{city}` (작게).
  - 하단: 한 줄(메시지/브리핑), 2줄까지.
  - 배경: 앱 페이퍼 톤(`COLORS.paper` 유사, 위젯은 색상 직접 지정).
  - 루트 `clickAction`: 앱 열기(딥링크 `howweateryou://` 또는 기본 실행).
- 크기 1종(4×2) 우선. 2×2 소형은 후속.

## 3. 데이터 흐름 — `src/services/widget.ts`
- `export async function updateWidget(weather?: WeatherInfo): Promise<void>`
  - 안드로이드 아니면 no-op(Platform.OS 체크).
  - `weather` 없으면 조용히 return(마지막 렌더 유지).
  - **한 줄** 결정:
    1. `getMessages()`에서 오늘(KST/로컬 날짜) 생성된 `kind==='message'` 최신 것 → 있으면 그 text(길면 자름).
    2. 없으면 `buildBriefLine(weather)` (옷차림+우산; `notification.ts`의 로직 공유 — 공통 헬퍼로 추출).
  - `requestWidgetUpdate({ widgetName:'WeatherWidget', renderWidget: () => <WeatherWidget ... /> })`.
- **비용 0** — 새 AI 호출 없음. 게스트/로그인 무관(로컬).

## 4. 갱신 시점 (호출부)
- `HomeScreen`: 날씨 로드 effect(이미 알림 갱신하는 그 자리)에서 `updateWidget(weather)`.
- 메시지 생성 직후(저장 useEffect)에서 `updateWidget(weather)`.
- 위젯 자체 `updatePeriodMillis`(≥1,800,000ms=30분)로 OS가 마지막 데이터 재렌더(보조).
- 결과: 앱 사용 때마다 위젯 최신화. 날씨는 느리게 변해 충분.

## 5. 공통 로직 추출
- `notification.buildBriefContent`의 옷차림+우산 문장 생성부를 `constants/weather.ts` 또는 `services/brief.ts`로 추출해 알림·위젯 공유(DRY). 시그니처: `buildBriefLine(weather, lang, hour): string`.

## 6. i18n
- 위젯은 `getCurrentLang()` 기준 한/영. 브리핑 문구는 공통 헬퍼가 처리. "지금/도시" 등 라벨 최소.

## 7. 검증
- `npx tsc --noEmit`, `npx expo install --check`.
- **실기기 필수**(위젯은 에뮬/실기기서만): 홈에 위젯 추가 → 날씨+한 줄 표시 / 탭 → 앱 열림 / 앱에서 메시지 생성 후 위젯 갱신 확인 / 게스트도 표시 / 언어 EN 확인.
- clean 빌드 성공.

## 변경/생성 파일
- 생성: `src/widgets/WeatherWidget.tsx`, `src/services/widget.ts`, `res/xml/hww_widget_info.xml`, (공통) `src/services/brief.ts` 또는 constants 헬퍼
- 수정: `package.json`(dep), `AndroidManifest.xml`, `android/app/build.gradle`(필요 시), `app.json`(플러그인 등록 — 단 prebuild 안 하므로 plugin 배열 넣을지 라이브러리 문서 확인), `src/services/notification.ts`(브리핑 공통화), `src/screens/HomeScreen.tsx`(updateWidget 호출), `App.tsx`(위젯 등록 `registerWidgetTaskHandler` 필요 시)
- 빌드: clean bundleRelease

## 미해결 없음
