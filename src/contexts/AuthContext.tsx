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

  const { access_token, refresh_token } = params;
  if (!access_token || !refresh_token) return null;

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
      if (url.includes('access_token') || url.includes('error')) {
        createSessionFromUrl(url).catch((err) => {
          setLastDebug((d) => d + `\n[link-err] ${err.message}`);
        });
      }
    });

    Linking.getInitialURL().then((url) => {
      if (url && (url.includes('access_token') || url.includes('error'))) {
        createSessionFromUrl(url).catch(() => {});
      }
    });

    return () => {
      sub.subscription.unsubscribe();
      linkingSub.remove();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    // Expo-AuthSession이 정확한 redirect URI 생성 (scheme + path)
    const redirectUrl = AuthSession.makeRedirectUri({
      scheme: 'howweateryou',
      path: 'auth/callback',
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
        lastDebug,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
