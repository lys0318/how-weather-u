# 카카오 로그인 추가 설계

## 배경

현재 `AuthContext.tsx`는 구글 로그인만 지원 (Supabase Auth OAuth provider `'google'`, PKCE + `expo-web-browser`/`expo-linking` race 패턴). 한국 사용자 비중이 높은 앱 특성상 카카오 로그인 추가 요청.

## 목표

- 구글 로그인과 동일한 신뢰도/UX로 카카오 로그인 제공
- 기존 세션/프로필/메시지 등 하위 로직은 provider 무관하게 그대로 동작

## 접근 방식

**웹 OAuth 방식 채택** (네이티브 카카오 SDK 방식은 기각).

- Supabase Auth가 Kakao를 표준 OAuth provider로 지원 — Google과 동일한 `signInWithOAuth()` 흐름 재사용 가능
- 새 네이티브 의존성/prebuild 변경 없음
- 대안(네이티브 SDK, 카톡 앱 전환 로그인)은 Supabase가 Kakao ID 토큰 네이티브 검증을 지원하지 않아 커스텀 Edge Function 브릿지가 필요 — 작업량/리스크 대비 이득 적어 기각

## 아키텍처 변경

### `src/contexts/AuthContext.tsx`

현재 `signInWithGoogle`은 ~70줄짜리 PKCE + WebBrowser/Linking race 로직을 인라인으로 가짐. 카카오용으로 통째로 복제하면 동일 버그를 두 곳에서 관리해야 하는 문제가 생기므로, 공통 로직을 private 헬퍼로 추출:

```
async function runOAuthFlow(provider: 'google' | 'kakao'): Promise<void>
```

- 기존 `signInWithGoogle` 바디를 그대로 이 헬퍼로 이동 (provider 하드코딩 부분만 파라미터화)
- `signInWithGoogle = () => runOAuthFlow('google')`
- `signInWithKakao = () => runOAuthFlow('kakao')` 신규 추가
- `AuthContextValue` 인터페이스에 `signInWithKakao: () => Promise<void>` 추가
- `createSessionFromUrl`, `onAuthStateChange`, Sentry 컨텍스트 등은 이미 provider 무관 — 수정 없음

로그 메시지(`log('[start] ...')` 등)에 provider 식별자 포함해 디버그 로그에서 구분 가능하게 함.

### `src/screens/LoginScreen.tsx`

- 카카오 버튼을 구글 버튼 **위**에 배치 (사용자 확정)
- 카카오 공식 브랜드 컬러 적용: 배경 `#FEE500`, 텍스트 어두운색 (카카오 가이드라인 톤)
- `kakaoLoading` state 신규 (기존 `loading`/`guestLoading`과 동일 패턴)
- `handleKakaoLogin` 함수: `handleGoogleLogin`과 동일 구조 (try/catch, 에러 시 `Alert.alert`)
- 세 버튼(카카오/구글/게스트) 중 하나라도 로딩 중이면 나머지 비활성화 (기존 `disabled={guestLoading || loading}` 패턴 확장)

### `src/i18n/translations.ts`

- `login.kakaoStart` 키 ko/en 추가
  - ko: `'카카오로 시작하기'`
  - en: `'Continue with Kakao'`
- 기존 로그인 에러 문구(`login.failTitle`, `login.genericError` 등)는 이미 provider 무관 — 재사용, 신규 키 불필요

## 데이터 흐름

Google과 완전히 동일한 경로:

```
signInWithOAuth({ provider: 'kakao', redirectTo, skipBrowserRedirect: true })
  → data.url (카카오 로그인 페이지)
  → WebBrowser.openAuthSessionAsync 와 Linking 'url' 이벤트 race
  → 승자의 URL을 createSessionFromUrl()에 전달
  → PKCE면 exchangeCodeForSession, implicit면 setSession
  → onAuthStateChange가 session 갱신 → 하위 화면들 그대로 반응
```

## 에러 처리

Google 경로의 cancel / dismiss / error 분기를 그대로 재사용 (이미 provider를 언급하지 않는 일반 문구라 그대로 사용 가능).

## 외부 설정 (코드 범위 밖, 사용자가 직접 진행)

1. **Kakao Developers** (developers.kakao.com): 앱 생성 → "카카오 로그인" 활성화 → Redirect URI에 `https://uxjpsnkecvztwlcbwwuq.supabase.co/auth/v1/callback` 등록 → 동의항목에서 "카카오계정(이메일)" 활성화 (비즈니스 앱 전환/심사가 필요할 수 있음 — 이메일 없으면 Supabase가 계정 생성 못 함)
2. **Supabase 대시보드** → Authentication → Providers → Kakao 활성화, REST API 키(및 설정 시 시크릿) 입력
3. 이 두 단계 완료 전까지는 코드가 완성돼도 실제 로그인은 실패함 (provider 미등록 상태)

API 키/시크릿 값은 사용자가 직접 각 콘솔에 입력 — 코드/대화 어디에도 실제 값 노출 없음.

## 테스트 계획

콘솔 설정 완료 후:
- dev build에서 카카오 버튼 클릭 → 카카오 로그인 페이지 완주 → 앱으로 복귀 및 세션 수립 확인
- `user.app_metadata.provider === 'kakao'` (또는 `identities` 배열) 확인
- 카카오로 로그인한 계정에서 메시지 생성/북마크/프로필/구독 등 기존 기능이 구글 계정과 동일하게 동작하는지 확인
- 취소/실패 케이스(카카오 로그인 페이지에서 뒤로가기 등) 에러 처리 확인

## 범위 밖

- 네이티브 카카오 SDK (카톡 앱 전환 로그인)
- 구글-카카오 계정 연동(동일인 다중 provider 병합) — 현재 구글도 별도 계정 취급, 카카오도 동일 정책 유지
