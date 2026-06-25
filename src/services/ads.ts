// AdMob 광고 헬퍼 (전면 + 배너)

import { AppState } from 'react-native';

// 네이티브 모듈 안전 require
let admob: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  admob = require('react-native-google-mobile-ads');
} catch {
  admob = null;
}

// 실제 광고 사용 (출시 빌드).
// 개발 중 테스트하려면 임시로 true로 변경 (Google 테스트 광고)
const USE_TEST_ADS = false;

const REAL_INTERSTITIAL_ID = 'ca-app-pub-8051681065734198/7890150188';
const REAL_BANNER_ID = 'ca-app-pub-8051681065734198/4300688726';
const REAL_NATIVE_ID = 'ca-app-pub-8051681065734198/8375665103';

let interstitial: any = null;
let interstitialReady = false;
let interstitialLoading: Promise<boolean> | null = null;
let nativeReady = false;

export function getInterstitialUnitId(): string {
  if (!admob) return REAL_INTERSTITIAL_ID;
  if (USE_TEST_ADS || !REAL_INTERSTITIAL_ID) return admob.TestIds.INTERSTITIAL;
  return REAL_INTERSTITIAL_ID;
}

export function getBannerUnitId(): string {
  if (!admob) return '';
  if (USE_TEST_ADS || !REAL_BANNER_ID) return admob.TestIds.BANNER;
  return REAL_BANNER_ID;
}

export function getNativeUnitId(): string {
  if (!admob) return '';
  if (USE_TEST_ADS || !REAL_NATIVE_ID) return admob.TestIds.NATIVE;
  return REAL_NATIVE_ID;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForActiveApp(timeoutMs = 5000): Promise<boolean> {
  if (AppState.currentState === 'active') return Promise.resolve(true);

  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    let sub: { remove: () => void } | null = null;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { sub?.remove(); } catch {}
      resolve(ok);
    };

    timer = setTimeout(() => finish(AppState.currentState === 'active'), timeoutMs);
    sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') finish(true);
    });
  });
}

function loadInterstitial(): Promise<boolean> {
  if (!admob) return Promise.resolve(false);
  if (interstitialLoading) return interstitialLoading;

  interstitialLoading = (async () => {
    const active = await waitForActiveApp();
    if (!active) {
      console.warn('[ads] interstitial load skipped: app not active');
      return false;
    }

    await delay(450);

    return new Promise<boolean>((resolve) => {
      let resolved = false;
      const finish = (ok: boolean) => {
        if (resolved) return;
        resolved = true;
        resolve(ok);
      };

      const cleanup = () => {
        clearTimeout(timer);
        try { loadedSub?.(); } catch {}
        try { errorSub?.(); } catch {}
      };

      let loadedSub: (() => void) | undefined;
      let errorSub: (() => void) | undefined;
      const timer = setTimeout(() => {
        console.warn('[ads] interstitial load timeout');
        cleanup();
        finish(false);
      }, 8000);

      try {
        interstitial = admob.InterstitialAd.createForAdRequest(getInterstitialUnitId(), {
          requestNonPersonalizedAdsOnly: true,
        });
        interstitialReady = false;
        loadedSub = interstitial.addAdEventListener(admob.AdEventType.LOADED, () => {
          interstitialReady = true;
          console.log('[ads] interstitial loaded');
          cleanup();
          finish(true);
        });
        errorSub = interstitial.addAdEventListener(admob.AdEventType.ERROR, (e: unknown) => {
          interstitialReady = false;
          console.warn('[ads] interstitial load error:', e);
          cleanup();
          finish(false);
        });
        interstitial.load();
      } catch (e) {
        console.warn('[ads] loadInterstitial 실패:', e);
        cleanup();
        finish(false);
      }
    });
  })().finally(() => {
    interstitialLoading = null;
  });

  return interstitialLoading;
}

async function waitForInterstitialReady(timeoutMs = 6000): Promise<boolean> {
  if (interstitialReady && interstitial) return true;
  if (!admob || !nativeReady) return false;

  const loadPromise = loadInterstitial();
  return Promise.race([
    loadPromise,
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);
}

export async function initAds(): Promise<void> {
  if (!admob) {
    console.log('[ads] native module missing - ads disabled');
    return;
  }
  try {
    await admob.default().initialize();
    nativeReady = true;
    setTimeout(() => {
      loadInterstitial().catch((e) => console.warn('[ads] delayed interstitial preload failed:', e));
    }, 1200);
    console.log('[ads] 초기화 완료');
  } catch (e) {
    console.warn('[ads] 초기화 실패:', e);
    nativeReady = false;
  }
}

/**
 * 전면 광고 + callback (메시지/활동/음식/운세 생성용)
 * - skipAd=true면 광고 없이 바로 callback (오늘 첫 생성)
 * - 광고 실패 시에도 callback은 반드시 실행
 */
export async function showInterstitialThenRun(callback: () => void, skipAd = false): Promise<void> {
  if (skipAd) {
    console.log('[ads] interstitial skipped: first usage of day');
    callback();
    return;
  }

  const ready = await waitForInterstitialReady();
  if (!admob || !nativeReady || !interstitial || !ready) {
    console.warn('[ads] interstitial unavailable, continuing without ad');
    callback();
    return;
  }

  try {
    let fired = false;
    const closedSub = interstitial.addAdEventListener(admob.AdEventType.CLOSED, () => {
      if (fired) return;
      fired = true;
      try { closedSub(); } catch {}
      loadInterstitial();
      callback();
    });
    const errorSub = interstitial.addAdEventListener(admob.AdEventType.ERROR, () => {
      if (fired) return;
      fired = true;
      try { closedSub(); } catch {}
      try { errorSub(); } catch {}
      loadInterstitial();
      callback();
    });

    interstitialReady = false;
    console.log('[ads] interstitial show');
    interstitial.show();
  } catch (e) {
    console.warn('[ads] show 실패:', e);
    loadInterstitial();
    callback();
  }
}
