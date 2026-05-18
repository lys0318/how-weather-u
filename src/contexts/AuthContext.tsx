import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as AuthSession from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import { supabase } from '../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  getDebug: () => string;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth는 AuthProvider 안에서 사용해야 합니다.');
  return ctx;
}

async function createSessionFromUrl(url: string): Promise<Session | null> {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) throw new Error(`OAuth 에러: ${errorCode}`);

  const { access_token, refresh_token, code } = params;

  // PKCE 플로우 (Supabase v2 기본): ?code=xxx
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return data.session;
  }

  // Implicit 플로우: #access_token=xxx
  if (access_token && refresh_token) {
    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    if (error) throw error;
    return data.session;
  }

  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // useRef로 디버그 로그 — 항상 최신 값을 read 가능 (state 비동기 이슈 회피)
  const debugRef = useRef<string>('');

  const log = useCallback((msg: string) => {
    debugRef.current += `\n${msg}`;
    console.log('[Auth]', msg);
  }, []);

  useEffect(() => {
    debugRef.current = '[mount]';

    supabase.auth.getSession().then(({ data }) => {
      log(`[getSession] ${!!data.session}`);
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      log(`[evt] ${event} session=${!!newSession}`);
      setSession(newSession);
    });

    const linkingSub = Linking.addEventListener('url', ({ url }) => {
      log(`[link] ${url.slice(0, 120)}`);
      if (url.includes('access_token') || url.includes('code=') || url.includes('error')) {
        createSessionFromUrl(url)
          .then((s) => log(`[link-session] ${!!s}`))
          .catch((err) => log(`[link-err] ${err.message}`));
      }
    });

    Linking.getInitialURL().then((url) => {
      if (url) {
        log(`[init-url] ${url.slice(0, 100)}`);
        if (url.includes('access_token') || url.includes('code=') || url.includes('error')) {
          createSessionFromUrl(url).catch(() => {});
        }
      }
    });

    return () => {
      sub.subscription.unsubscribe();
      linkingSub.remove();
    };
  }, [log]);

  const signInWithGoogle = useCallback(async () => {
    const redirectUrl = AuthSession.makeRedirectUri({
      scheme: 'howweateryou',
    });
    log(`[start] redirect=${redirectUrl}`);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true,
      },
    });
    if (error) {
      log(`[oauth-err] ${error.message}`);
      throw error;
    }
    if (!data?.url) throw new Error('OAuth URL 생성 실패');

    log(`[oauth-url-len] ${data.url.length}`);

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
        log(`[link-race-hit] ${url.slice(0, 80)}`);
        linkResolve(url);
        linkResolve = null;
      }
    });

    // WebBrowser promise
    const browserPromise = WebBrowser.openAuthSessionAsync(data.url, redirectUrl).then(
      (r) => ({ source: 'browser' as const, result: r }),
    );

    log(`[opening browser]`);
    const winner = (await Promise.race([browserPromise, linkPromise])) as
      | { source: 'browser'; result: WebBrowser.WebBrowserAuthSessionResult }
      | { source: 'link'; url: string };

    tempLinkSub.remove();

    if (winner.source === 'link') {
      log(`[winner=link]`);
      // dismissAuthSession은 iOS 전용 — Android에서 호출하면 throw
      // Android는 deep link 시 브라우저가 자동으로 닫히므로 명시적 호출 불필요
      try { WebBrowser.dismissAuthSession(); } catch {}
      const sess = await createSessionFromUrl(winner.url);
      log(`[link-result-session] ${!!sess}`);
      return;
    }

    log(`[winner=browser] type=${winner.result.type}` + ('url' in winner.result ? ` url=${winner.result.url?.slice(0, 80)}` : ''));

    if (winner.result.type === 'success' && winner.result.url) {
      const sess = await createSessionFromUrl(winner.result.url);
      log(`[browser-result-session] ${!!sess}`);
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

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const getDebug = useCallback(() => debugRef.current, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        signInWithGoogle,
        signOut,
        getDebug,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
