import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import { supabase } from '../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth는 AuthProvider 안에서 사용해야 합니다.');
  return ctx;
}

/**
 * 콜백 URL에서 토큰 파싱해서 세션 생성
 * Supabase는 토큰을 #fragment 또는 ?query 로 보냄 — getQueryParams가 둘 다 처리
 */
async function createSessionFromUrl(url: string): Promise<Session | null> {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) {
    throw new Error(`OAuth 에러: ${errorCode}`);
  }
  const { access_token, refresh_token } = params;
  if (!access_token || !refresh_token) {
    console.log('[Auth] 토큰 없음 in url:', url);
    return null;
  }
  const { data, error } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });
  if (error) throw error;
  return data.session;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. 앱 시작 시 저장된 세션 복원
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // 2. 세션 변경 구독 (setSession 호출되면 여기로 들어옴)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      console.log('[Auth] state change:', _event, !!newSession);
      setSession(newSession);
    });

    // 3. Deep link 리스너 — WebBrowser 외에 다른 경로로도 콜백 받기
    const linkingSub = Linking.addEventListener('url', ({ url }) => {
      console.log('[Auth] incoming deep link:', url);
      if (url.includes('access_token') || url.includes('error')) {
        createSessionFromUrl(url).catch((err) => {
          console.error('[Auth] createSessionFromUrl error:', err);
        });
      }
    });

    // 4. 콜드 스타트 시 초기 URL 확인 (앱이 deep link로 켜진 경우)
    Linking.getInitialURL().then((url) => {
      if (url && (url.includes('access_token') || url.includes('error'))) {
        console.log('[Auth] initial url:', url);
        createSessionFromUrl(url).catch((err) => {
          console.error('[Auth] initial url error:', err);
        });
      }
    });

    return () => {
      sub.subscription.unsubscribe();
      linkingSub.remove();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const redirectUrl = Linking.createURL('auth/callback');
    console.log('[Auth] redirectUrl:', redirectUrl);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true,
      },
    });
    if (error) throw error;
    if (!data?.url) throw new Error('OAuth URL 생성 실패');

    console.log('[Auth] opening browser:', data.url);

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

    console.log('[Auth] browser result:', result.type, 'url' in result ? result.url : 'no url');

    if (result.type === 'success' && result.url) {
      await createSessionFromUrl(result.url);
    } else if (result.type === 'cancel' || result.type === 'dismiss') {
      return;
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
