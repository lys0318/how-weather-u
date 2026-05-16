import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
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
  lastDebug: string;
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

  // PKCE 플로우: ?code=xxx → exchange for session (Supabase v2 default)
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return data.session;
  }

  // Implicit 플로우: #access_token=xxx → set session directly
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
  const [lastDebug, setLastDebug] = useState<string>('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setLastDebug((d) => d + `\n[evt] ${event} session=${!!newSession}`);
      setSession(newSession);
    });

    const linkingSub = Linking.addEventListener('url', ({ url }) => {
      setLastDebug((d) => d + `\n[link] ${url.slice(0, 100)}`);
      if (url.includes('access_token') || url.includes('code=') || url.includes('error')) {
        createSessionFromUrl(url)
          .then((sess) => setLastDebug((d) => d + `\n[link-session] ${!!sess}`))
          .catch((err) => setLastDebug((d) => d + `\n[link-err] ${err.message}`));
      }
    });

    Linking.getInitialURL().then((url) => {
      if (url && (url.includes('access_token') || url.includes('code=') || url.includes('error'))) {
        setLastDebug((d) => d + `\n[init-url] ${url.slice(0, 80)}`);
        createSessionFromUrl(url).catch(() => {});
      }
    });

    return () => {
      sub.subscription.unsubscribe();
      linkingSub.remove();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    // 가장 안정적인 redirect URI 형태 (path 없이 scheme만)
    const redirectUrl = AuthSession.makeRedirectUri({
      scheme: 'howweateryou',
    });

    setLastDebug(`[start] redirect=${redirectUrl}`);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true,
      },
    });
    if (error) throw error;
    if (!data?.url) throw new Error('OAuth URL 생성 실패');

    setLastDebug((d) => d + `\n[opening browser]`);
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
    setLastDebug((d) => d + `\n[result] type=${result.type}` + ('url' in result ? ` url=${result.url?.slice(0, 80)}` : ''));

    if (result.type === 'success' && result.url) {
      const sess = await createSessionFromUrl(result.url);
      setLastDebug((d) => d + `\n[session-set] ${!!sess}`);
    } else if (result.type === 'cancel') {
      return;
    } else if (result.type === 'dismiss') {
      // 브라우저가 콜백 매칭 없이 닫힌 경우 — 가장 흔한 원인: Google 테스트 사용자 미등록
      throw new Error(
        '로그인이 완료되지 않았어요.\n\n' +
        '구글 로그인 화면에서 "Access blocked" 또는 ' +
        '"확인되지 않은 앱" 경고가 떴나요?\n\n' +
        '해결: https://console.cloud.google.com/auth/audience\n' +
        '→ 테스트 사용자에 본인 이메일을 추가하고 다시 시도해주세요.'
      );
    } else {
      throw new Error(`로그인 실패: ${result.type}`);
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        signInWithGoogle,
        signOut,
        lastDebug,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
