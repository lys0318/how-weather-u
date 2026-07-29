# 카카오 로그인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 구글 로그인(Supabase OAuth PKCE + WebBrowser/Linking race)과 동일한 방식으로 카카오 로그인을 추가한다.

**Architecture:** `AuthContext.tsx`의 구글 전용 OAuth race 로직을 provider-파라미터화된 `runOAuthFlow(provider)` 헬퍼로 추출하고, `signInWithGoogle`/`signInWithKakao` 둘 다 이를 호출하는 얇은 래퍼로 만든다. `LoginScreen.tsx`에 카카오 버튼을 구글 버튼 위에 추가한다.

**Tech Stack:** React Native + Expo SDK 54, TypeScript, Supabase Auth (`@supabase/supabase-js`), `expo-auth-session`, `expo-web-browser`, `expo-linking` — 전부 기존 의존성, 신규 패키지 없음.

## Global Constraints

- 신규 npm 의존성 추가 금지 (기존 expo-auth-session/expo-web-browser/expo-linking만 사용)
- `android/` prebuild, AndroidManifest 변경 없음 (네이티브 모듈 아님)
- 실제 카카오 REST API 키/시크릿 값은 코드·커밋·대화 어디에도 입력하지 않음 — 사용자가 Kakao Developers/Supabase 대시보드에 직접 입력
- `src/i18n/translations.ts`는 ko/en 키 대칭 유지 — 신규 키는 항상 양쪽에 추가
- 기존 에러 문구(`로그인이 완료되지 않았어요...` 등)는 provider 무관하므로 문구 변경 없이 그대로 재사용
- 카카오 버튼 브랜드 컬러: 배경 `#FEE500`, 텍스트 `#191919` (카카오 브랜드 가이드 — 노란 배경엔 어두운 텍스트)
- 이 프로젝트엔 테스트 러너(Jest 등)가 없음 — 각 태스크의 검증은 `npx tsc --noEmit` 타입체크 + 수동 실행 확인으로 한다 (이 세션에서 계속 써온 방식)

---

## Task 1: AuthContext에 카카오 OAuth 플로우 추가

**Files:**
- Modify: `src/contexts/AuthContext.tsx`

**Interfaces:**
- Produces: `useAuth().signInWithKakao: () => Promise<void>` — Task 2의 `LoginScreen.tsx`가 이 함수를 소비한다.
- Produces (내부): `runOAuthFlow(provider: 'google' | 'kakao') => Promise<void>` — 컴포넌트 내부 전용, 외부에서 직접 쓰지 않음.

- [ ] **Step 1: `AuthContextValue` 인터페이스에 `signInWithKakao` 추가**

`src/contexts/AuthContext.tsx`의 14~24번 줄(인터페이스 정의)을 아래로 교체:

```typescript
interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isGuest: boolean; // 익명(로그인 없이 둘러보기) 세션 여부
  signInWithGoogle: () => Promise<void>;
  signInWithKakao: () => Promise<void>;
  signInAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  getDebug: () => string;
}
```

- [ ] **Step 2: `signInWithGoogle` 바디를 `runOAuthFlow(provider)`로 추출**

`src/contexts/AuthContext.tsx`의 111~185번 줄(기존 `signInWithGoogle` 전체)을 아래로 교체:

```typescript
  const runOAuthFlow = useCallback(async (provider: 'google' | 'kakao') => {
    const redirectUrl = AuthSession.makeRedirectUri({
      scheme: 'howweateryou',
    });
    log(`[start:${provider}] redirect=${redirectUrl}`);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true,
      },
    });
    if (error) {
      log(`[oauth-err:${provider}] ${error.message}`);
      throw error;
    }
    if (!data?.url) throw new Error('OAuth URL 생성 실패');

    log(`[oauth-url-len:${provider}] ${data.url.length}`);

    // Linking 리스너 promise (브라우저 닫기 전에 deep link로 들어올 수도)
    let linkResolve: ((url: string) => void) | null = null;
    const linkPromise = new Promise<{ source: 'link'; url: string }>((resolve) => {
      linkResolve = (url) => resolve({ source: 'link', url });
    });
    const tempLinkSub = Linking.addEventListener('url', ({ url }) => {
      if (
        (url.includes('code=') || url.includes('access_token') || url.includes('error')) &&
        linkResolve
      ) {
        log(`[link-race-hit:${provider}] ${url.slice(0, 80)}`);
        linkResolve(url);
        linkResolve = null;
      }
    });

    // WebBrowser promise
    const browserPromise = WebBrowser.openAuthSessionAsync(data.url, redirectUrl).then(
      (r) => ({ source: 'browser' as const, result: r }),
    );

    log(`[opening browser:${provider}]`);
    const winner = (await Promise.race([browserPromise, linkPromise])) as
      | { source: 'browser'; result: WebBrowser.WebBrowserAuthSessionResult }
      | { source: 'link'; url: string };

    tempLinkSub.remove();

    if (winner.source === 'link') {
      log(`[winner=link:${provider}]`);
      // dismissAuthSession은 iOS 전용 — Android에서 호출하면 throw
      // Android는 deep link 시 브라우저가 자동으로 닫히므로 명시적 호출 불필요
      try { WebBrowser.dismissAuthSession(); } catch {}
      const sess = await createSessionFromUrl(winner.url);
      log(`[link-result-session:${provider}] ${!!sess}`);
      return;
    }

    log(`[winner=browser:${provider}] type=${winner.result.type}` + ('url' in winner.result ? ` url=${winner.result.url?.slice(0, 80)}` : ''));

    if (winner.result.type === 'success' && winner.result.url) {
      const sess = await createSessionFromUrl(winner.result.url);
      log(`[browser-result-session:${provider}] ${!!sess}`);
    } else if (winner.result.type === 'cancel') {
      return;
    } else if (winner.result.type === 'dismiss') {
      // 사용자가 직접 닫았거나, 콜백 URL이 앱으로 라우팅 안 됨
      throw new Error(
        '로그인이 완료되지 않았어요. 잠시 후 다시 시도해보시거나, 진단 정보를 확인해주세요.'
      );
    } else {
      throw new Error(`로그인 실패: ${winner.result.type}`);
    }
  }, [log]);

  const signInWithGoogle = useCallback(() => runOAuthFlow('google'), [runOAuthFlow]);
  const signInWithKakao = useCallback(() => runOAuthFlow('kakao'), [runOAuthFlow]);
```

- [ ] **Step 3: Provider value 객체에 `signInWithKakao` 추가**

`src/contexts/AuthContext.tsx`의 `AuthContext.Provider`의 `value={{ ... }}` 블록에서 `signInWithGoogle,` 다음 줄에 추가:

```typescript
        signInWithGoogle,
        signInWithKakao,
        signInAsGuest,
```

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (기존에 있던 에러가 아니라면)

- [ ] **Step 5: 커밋**

```bash
git add src/contexts/AuthContext.tsx
git commit -m "feat(auth): 카카오 OAuth 로그인 플로우 추가 (runOAuthFlow로 구글 로직 재사용)"
```

---

## Task 2: LoginScreen에 카카오 버튼 추가

**Files:**
- Modify: `src/i18n/translations.ts`
- Modify: `src/screens/LoginScreen.tsx`

**Interfaces:**
- Consumes: `useAuth().signInWithKakao: () => Promise<void>` (Task 1에서 생성)
- Consumes: `t('login.kakaoStart')` (이 태스크 Step 1~2에서 생성)

- [ ] **Step 1: i18n 한국어 키 추가**

`src/i18n/translations.ts`의 52번 줄(`googleStart: '구글로 시작하기',`) 바로 다음 줄에 추가:

```typescript
      kakaoStart: '카카오로 시작하기',
```

- [ ] **Step 2: i18n 영어 키 추가**

`src/i18n/translations.ts`의 392번 줄(`googleStart: 'Continue with Google',`) 바로 다음 줄에 추가:

```typescript
      kakaoStart: 'Continue with Kakao',
```

- [ ] **Step 3: ko/en 키 대칭 확인**

Run: `grep -n "kakaoStart" src/i18n/translations.ts`
Expected: 2줄 출력 (ko 섹션 1개, en 섹션 1개)

- [ ] **Step 4: `LoginScreen.tsx`에 `signInWithKakao` 및 `kakaoLoading` 상태 추가**

`src/screens/LoginScreen.tsx`의 16~20번 줄을 아래로 교체:

```typescript
export default function LoginScreen() {
  const { signInWithGoogle, signInWithKakao, signInAsGuest } = useAuth();
  const { t, lang } = useI18n();
  const [loading, setLoading] = useState(false);
  const [kakaoLoading, setKakaoLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const anyLoading = loading || kakaoLoading || guestLoading;
```

`anyLoading`을 추가하는 이유: 버튼이 2개(구글+카카오)에서 3개(카카오+구글+게스트)로 늘면서, 한 OAuth 플로우가 진행 중일 때 다른 버튼을 눌러 `WebBrowser.openAuthSessionAsync`가 동시에 두 번 열리는 상황을 막아야 한다.

- [ ] **Step 5: `handleKakaoLogin` 함수 추가**

`src/screens/LoginScreen.tsx`의 `handleGoogleLogin` 함수(28~38번 줄) 바로 다음에 추가:

```typescript
  const handleKakaoLogin = async () => {
    setKakaoLoading(true);
    try {
      await signInWithKakao();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('login.genericError');
      Alert.alert(t('login.failTitle'), msg);
    } finally {
      setKakaoLoading(false);
    }
  };
```

- [ ] **Step 6: 카카오 버튼 JSX 추가 + 기존 버튼 disabled 로직을 `anyLoading` 기준으로 통일**

`src/screens/LoginScreen.tsx`의 `actions` 블록 내부(69~95번 줄)를 아래로 교체:

```typescript
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.kakaoButton, anyLoading && styles.disabled]}
              onPress={handleKakaoLogin}
              disabled={anyLoading}
            >
              {kakaoLoading ? (
                <ActivityIndicator color="#191919" size="small" />
              ) : (
                <>
                  <Text style={styles.kakaoMark}>K</Text>
                  <Text style={styles.kakaoButtonText}>{t('login.kakaoStart')}</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.googleButton, styles.googleSpacing, anyLoading && styles.disabled]}
              onPress={handleGoogleLogin}
              disabled={anyLoading}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.ink} size="small" />
              ) : (
                <>
                  <Text style={styles.googleG}>G</Text>
                  <Text style={styles.googleButtonText}>{t('login.googleStart')}</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.guestButton, anyLoading && styles.disabled]}
              onPress={handleGuest}
              disabled={anyLoading}
            >
              {guestLoading ? (
                <ActivityIndicator color={COLORS.ink2} size="small" />
              ) : (
                <Text style={styles.guestButtonText}>{t('login.guestStart')}</Text>
              )}
            </TouchableOpacity>
```

(이 블록 뒤에 이어지는 `fineprint`/`legalRow`/`guestNote` JSX는 그대로 유지)

- [ ] **Step 7: 카카오 버튼 스타일 + 구글 버튼 간격 스타일 추가**

`src/screens/LoginScreen.tsx`의 `googleButton` 스타일(152~164번 줄) 바로 앞에 추가:

```typescript
  kakaoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE500',
    borderRadius: RADII.btn,
    paddingVertical: 17,
    paddingHorizontal: 24,
    width: '100%',
    gap: 11,
  },
  kakaoMark: { fontFamily: FONTS.serifEn, fontSize: 19, color: '#191919', fontWeight: '500' },
  kakaoButtonText: { fontSize: 15.5, color: '#191919', fontWeight: '600' },
  googleSpacing: { marginTop: 12 },
```

- [ ] **Step 8: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 9: 커밋**

```bash
git add src/i18n/translations.ts src/screens/LoginScreen.tsx
git commit -m "feat(auth): 로그인 화면에 카카오 버튼 추가 (구글 버튼 위)"
```

---

## 수동 검증 (사용자 — 콘솔 설정 완료 후)

아래는 에이전트가 대신 할 수 없는 단계다 (외부 콘솔 로그인 + 실기기/에뮬레이터 조작 필요). Task 1~2 커밋 후, 사용자가 직접 진행:

1. **Kakao Developers** (developers.kakao.com): 앱 생성 → "카카오 로그인" 활성화 → Redirect URI에 `https://uxjpsnkecvztwlcbwwuq.supabase.co/auth/v1/callback` 등록 → 동의항목에서 "카카오계정(이메일)" 활성화
2. **Supabase 대시보드** → Authentication → Providers → Kakao 활성화 → REST API 키(+시크릿) 입력
3. dev build 실행 후 로그인 화면에서 카카오 버튼 클릭 → 카카오 로그인 페이지 완주 → 앱으로 정상 복귀 및 세션 수립 확인
4. 카카오로 로그인한 계정에서 메시지 생성/북마크/프로필/구독 등 기존 기능이 구글 계정과 동일하게 동작하는지 확인
5. 카카오 로그인 페이지에서 뒤로가기(취소) 시 에러 없이 로그인 화면으로 복귀하는지 확인

## 범위 밖

- 네이티브 카카오 SDK (카톡 앱 전환 로그인)
- 구글-카카오 계정 연동(동일인 다중 provider 병합)
