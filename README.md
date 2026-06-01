# 하우웨더유 (How Weather You) 🌤️

> 오늘의 날씨가 당신에게 건네는 한마디.
> 날씨 × 시간대를 분석해 AI가 위로·응원·조언 메시지와 활동·음식 추천을 들려주는 감성 앱입니다.
> "How **are** you?"의 are를 **weather**로 치환한 언어유희에서 출발했어요.

---

## ✨ 주요 기능

- **AI 감성 메시지** — 현재 날씨/요일/시간대에 맞춘 위로·응원·조언 메시지 (Claude AI)
- **활동·음식 추천** — 날씨와 향후 예보를 반영한 맞춤 추천 ("비 올 예정이니 따끈한 국물요리 어때요?")
- **정확한 날씨** — 한국은 기상청(KMA) 공식 단기예보(시/동 단위), 해외는 OpenWeather
- **메시지 기록 & 북마크** — 로컬 7일 자동 보관 + 마음에 든 메시지는 클라우드에 영구 보관
- **공유 카드** — 받은 메시지를 1080×1080 감성 카드 이미지로 SNS 공유
- **스마트 알림** — 시간대별 알림 (방해금지 시간 지원), ON/OFF 토글
- **합리적 사용량** — 하루 3회 무료 + 보상형 광고 시청 시 추가 충전

---

## 🛠️ 기술 스택

### 클라이언트 (모바일 앱)
| 분류 | 기술 |
|---|---|
| 프레임워크 | React Native + Expo SDK 54 |
| 언어 | TypeScript |
| 내비게이션 | React Navigation (Native Stack + Bottom Tabs) |
| 상태/저장 | React Hooks + AsyncStorage |
| 인증 | Supabase Auth (Google OAuth, PKCE) |
| 위치/날씨 | expo-location + 기상청 API / OpenWeatherMap |
| 알림 | expo-notifications (OS AlarmManager 기반 예약) |
| 광고 | react-native-google-mobile-ads (전면 + 보상형) |
| 자동 업데이트 | expo-in-app-updates |
| 이미지 공유 | react-native-view-shot + expo-sharing |
| 모니터링 | Sentry |

### 백엔드 (서버리스)
| 분류 | 기술 |
|---|---|
| BaaS | Supabase (PostgreSQL + Auth + Edge Functions) |
| 서버 로직 | Deno 기반 Edge Functions |
| AI | Anthropic Claude API (프롬프트 캐싱) |
| 보안 | Row-Level Security (RLS), API 키는 서버에만 보관 |

### 배포
- Google Play Console (Android)
- 업로드 키스토어 + Google Play App Signing

---

## 🏗️ 아키텍처

```
[React Native 앱]
      │
      │ (Supabase Auth - Google OAuth)
      ▼
[Supabase Edge Functions (Deno)]
      │  ├─ generate-message / activity / food  → Claude API 호출
      │  ├─ get-usage / redeem-ad-credit        → 사용량/광고 보상
      │  └─ delete-account                       → 계정 영구 삭제
      ▼
[PostgreSQL]  usage_log / bookmarks / ad_rewards (RLS 보호)

[날씨]  앱 → 기상청(한국) 또는 OpenWeather(해외) 직접 호출
[광고]  앱 → Google AdMob
```

핵심 설계 포인트:
- **API 키 보호**: Claude API 키는 Edge Function 환경변수로만 사용, 클라이언트에 노출 없음
- **비용 통제**: 일일 호출 한도 + 프롬프트 캐싱
- **graceful degrade**: 광고/모니터링 모듈이 없어도 앱이 정상 동작

---

## 📁 프로젝트 구조

```
src/
├── screens/      Home · History · Settings · Login · PermissionSetup
├── hooks/        useMessage · useActivity · useFood · useWeather
├── services/     weather · kma · ads · notification · usage · backend ...
├── contexts/     AuthContext (Google OAuth)
├── constants/    weather 타입 정의
├── utils/        storage (AsyncStorage)
└── lib/          supabase · sentry

supabase/functions/   Edge Functions (Deno)
docs/                 개인정보처리방침 · 스토어 등록 자료
```

> 더 자세한 개발 가이드는 [`CLAUDE.md`](./CLAUDE.md) 참고.

---

## 🚀 빌드

```bash
npm install
npx expo install --check        # 의존성 버전 정합성 확인

# Android 빌드
cd android
./gradlew bundleRelease          # AAB (Play Store 업로드용)
./gradlew assembleRelease        # APK (직접 설치/테스트용)
```

환경변수(`.env`)는 `EXPO_PUBLIC_` 접두사로 관리하며, 민감 키(Claude API 등)는
Supabase secret으로만 보관합니다. (`.env`, `*.jks`는 git 추적 제외)

---

## 📄 개인정보처리방침

https://lys0318.github.io/how-weather-u/privacy-policy.html

---

## 📬 문의

tosca0318@gmail.com

---

*Built with React Native, Supabase, and Claude AI.*
