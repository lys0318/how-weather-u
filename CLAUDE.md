# 하우웨더유 (How Weather You) — 프로젝트 가이드

> 날씨 × AI 감성 메시지 앱. "How are you?"의 are를 weather로 치환한 언어유희.
> AI가 날씨/요일/시간대를 분석해 위로·응원·조언 메시지 + 활동·음식 추천을 제공.

## 기술 스택

- **클라이언트**: React Native + Expo SDK 54 + TypeScript (Old Architecture, `newArchEnabled: false`)
- **백엔드**: Supabase (Auth + PostgreSQL + Edge Functions) — project ref `uxjpsnkecvztwlcbwwuq`
- **AI**: Anthropic Claude API (메시지/활동/음식 전부 Sonnet, 프롬프트 캐싱 사용)
- **날씨**: 한국 = 기상청(KMA) 단기예보 API, 해외 = OpenWeatherMap (자동 폴백)
- **광고**: react-native-google-mobile-ads v15 (전면 + 보상형, 실제 광고 — v20부터)
- **모니터링**: Sentry
- **자동 업데이트**: expo-in-app-updates (강제 업데이트)
- **배포**: Google Play Console (비공개 테스트 14일 완료 → 프로덕션 출시 진행)

## 디렉터리 구조

```
src/
├── screens/          화면 컴포넌트
│   ├── HomeScreen.tsx        메인 (날씨/메시지/활동/음식/광고) ★가장 큼
│   ├── HistoryScreen.tsx     메시지 기록 + 북마크 (로컬 7일 + 클라우드)
│   ├── SettingsScreen.tsx    알림 토글/피드백/로그아웃/탈퇴
│   ├── LoginScreen.tsx       구글 로그인
│   └── PermissionSetupScreen.tsx  위치/알림 권한 온보딩
├── hooks/            useMessage / useActivity / useFood / useWeather
├── services/         비즈니스 로직
│   ├── weather.ts            날씨 진입점 (KMA 우선 → OpenWeather 폴백)
│   ├── kma.ts                기상청 API (격자 변환 + 실황/예보 파싱)
│   ├── message/activity/food.ts   Edge Function 호출 래퍼
│   ├── backend.ts            Edge Function 공통 fetch + LimitExceededError
│   ├── usage.ts              사용량 조회 + 광고 보상 충전
│   ├── ads.ts                AdMob 전면/보상형 (graceful degrade)
│   ├── inAppUpdate.ts        강제 업데이트
│   ├── notification.ts       OS 예약 알림 (스케줄 락 포함)
│   └── bookmarks.ts          북마크 클라우드 동기화
├── contexts/AuthContext.tsx  구글 OAuth (PKCE + WebBrowser/Linking race)
├── constants/weather.ts      WeatherCondition / WeatherInfo / ForecastSlot 타입
├── utils/storage.ts          AsyncStorage (메시지/북마크/설정/알림 플래그)
└── lib/                      supabase.ts, sentry.ts

supabase/functions/    Edge Functions (Deno)
├── _shared/
│   ├── claude.ts             Claude 호출 (MODEL=sonnet, MODEL_HAIKU 옵션)
│   ├── limit.ts              일일 한도(3회) + 광고 보상 + KST 자정 계산
│   └── cors.ts
├── generate-message/activity/food/   AI 생성 (전부 Sonnet)
├── get-usage/                오늘 사용량 조회 (기록 추가 X)
├── redeem-ad-credit/         보상형 광고 시청 → +1 충전
└── delete-account/           계정 영구 삭제
```

## 핵심 동작 규칙

### 일일 한도 & 광고
- 기본 한도: **하루 3회** (메시지+활동+음식 합산), KST 자정 기준
- 실효 한도 = 3 + 오늘 본 보상형 광고 수 (`ad_rewards` 테이블)
- **한도 이내**: 하루 첫 생성 1회만 무료(전체 통틀어), 2·3회차는 전면 광고 후 생성
- **한도 초과**: 생성 클릭 → 안내 Alert, 하단 "광고 보고 1회 충전하기"(보상형)로 충전
- **"충전하기" 버튼**: 보상형 광고 → +1 충전만, 다음 생성은 광고 생략(자유 선택)
- 광고 ID: `ads.ts`의 `USE_TEST_ADS = false` (실제 광고). 앱 ID `ca-app-pub-8051681065734198~5789260751` (manifest+app.json). 개발 테스트 시 임시 true로.

### 날씨
- `weather.ts.fetchWeather()`가 진입점. 한국(`isInKorea`)이면 기상청, 아니면 OpenWeather
- 최저/최고 기온 = 향후 24시간 예보 범위 (밤에도 의미 있게)
- 10분 인메모리 캐시

### 알림
- OS AlarmManager 기반 Date 트리거 48개 예약 (`scheduleUpcomingNotifications`)
- 동시 호출 방지 락(`schedulingLock`)으로 중복 알림 버그 방지
- `notificationsEnabled` 플래그 false면 자동 재예약 안 함

## 빌드 & 배포

```bash
# 의존성 버전 정합성 (중요! 추가 설치 후 항상 실행)
npx expo install --check

# AAB (Play Store 업로드용)
cd android && ./gradlew bundleRelease
# → android/app/build/outputs/bundle/release/app-release.aab

# APK (폰 직접 테스트용, ADB)
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk

# 네이티브 의존성 추가했으면 clean 먼저
cd android && ./gradlew clean bundleRelease
```

- **버전 올릴 때**: `android/app/build.gradle`의 versionCode/versionName + `app.json`의 version/versionCode + `SettingsScreen.tsx` 표시 버전, 3곳 동시
- **Edge Function 배포**: `SUPABASE_ACCESS_TOKEN=... npx supabase functions deploy <name> --project-ref uxjpsnkecvztwlcbwwuq --no-verify-jwt`
- **DB 마이그레이션**: Supabase Management API 또는 대시보드 SQL Editor (`supabase/migrations/`)

## 주의사항 (과거 트러블)

- **패키지 추가 시 버전 충돌 주의**: `@expo/vector-icons` 설치가 `expo-font@56`(SDK56용)을 끌어와 앱이 시작 시 크래시한 적 있음 → `expo install --fix` + expo-font를 SDK54용 `~14.0.12`로 고정해 해결. **새 패키지 설치 후 `npx expo install --check` 필수.**
- **config plugin 없는 expo-module**: `expo-in-app-updates`는 app.json plugins 배열에 넣으면 안 됨 (autolinking으로 자동 연결). 넣으면 SyntaxError.
- **AdMob manifest 충돌**: `tools:replace="android:value"`로 라이브러리 기본값 덮어씀.
- **크래시 디버깅**: 네이티브 초기 크래시는 Sentry로 안 잡힘(JS 로드 전). ADB logcat 사용:
  `adb logcat -d | grep -A 20 "FATAL EXCEPTION"`
- **prebuild 주의**: android 폴더에 커스텀(AdMob meta-data, AD_ID 권한, 인텐트 필터) 있어서 `expo prebuild` 재실행 시 덮어쓰기 위험. 직접 수정 선호.

## 알려진 개선 여지 (출시 후 정리 권장)

- 중복: `useActivity`≈`useFood`, `activity.ts`≈`food.ts` → 제네릭 팩토리로 통합 가능
- `HomeScreen.tsx`(1039줄) → 광고/공유/날씨 로직 분리
- ESLint v9 flat config 마이그레이션 (현재 lint 미작동)
- 구글 로그인 → 네이티브 `@react-native-google-signin`으로 UX 개선
- AI 비용: 사용자 1000명+ 시 Gemini 2.5 Flash 비교 검토 (Sonnet 대비 ~1/23)

## 보안 (절대 클라이언트 노출 금지)

- Claude API 키 → Supabase secret (`CLAUDE_API_KEY`)만
- 업로드 키스토어(`android/app/upload-keystore.jks`) + 비번 → 분실 시 앱 업데이트 영구 불가, 다중 백업 필수
- `.env`의 키들은 `EXPO_PUBLIC_` = 클라이언트 번들 포함됨 (OpenWeather/KMA/Supabase anon은 공개 가능 키라 OK)
