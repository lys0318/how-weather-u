import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { translations, Lang } from './translations';

const STORAGE_KEY = 'appLanguage';

export type { Lang };

// ── 기기 언어 자동 감지 (한국어면 ko, 그 외 en) ──────────────
function detectDeviceLang(): Lang {
  try {
    const locales = Localization.getLocales();
    const code = locales?.[0]?.languageCode?.toLowerCase();
    return code === 'ko' ? 'ko' : 'en';
  } catch {
    return 'ko';
  }
}

// 모듈 레벨 현재 언어 — 훅을 쓸 수 없는 곳(서비스/알림)에서 사용.
let _lang: Lang = detectDeviceLang();

function resolvePath(lang: Lang, key: string): unknown {
  const path = key.split('.');
  let cur: unknown = translations[lang];
  for (const p of path) {
    if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) =>
    vars[k] !== undefined ? String(vars[k]) : `{${k}}`,
  );
}

function resolve(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  let v = resolvePath(lang, key);
  if (typeof v !== 'string') v = resolvePath('ko', key); // 누락 시 한국어 폴백
  return typeof v === 'string' ? interpolate(v, vars) : key;
}

// 훅 밖에서 쓰는 번역 (현재 언어 기준)
export function translate(key: string, vars?: Record<string, string | number>): string {
  return resolve(_lang, key, vars);
}
export function getCurrentLang(): Lang {
  return _lang;
}

interface I18nContextValue {
  lang: Lang;
  t: (key: string, vars?: Record<string, string | number>) => string;
  setLang: (l: Lang) => void;
  ready: boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(_lang);
  const [ready, setReady] = useState(false);

  // 저장된 사용자 선택이 있으면 자동 감지값을 덮어씀
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved === 'ko' || saved === 'en') {
          _lang = saved;
          setLangState(saved);
        }
      } catch {
        // 무시 — 감지된 기본값 유지
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const setLang = useCallback((l: Lang) => {
    _lang = l;
    setLangState(l);
    AsyncStorage.setItem(STORAGE_KEY, l).catch(() => {});
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => resolve(lang, key, vars),
    [lang],
  );

  return (
    <I18nContext.Provider value={{ lang, t, setLang, ready }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within LanguageProvider');
  return ctx;
}
