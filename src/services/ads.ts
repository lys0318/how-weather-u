// AdMob 광고 헬퍼 (전면 + 보상형)

import { AppState } from 'react-native';
import { redeemAdCredit, UsageInfo } from './usage';

// 네이티브 모듈 안전 require
let admob: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  admob = require('react-native-google-mobile-ads');
} catch {
  admob = null;
}

// 실제 광고 사용 (출시 빌드).
// ⚠️ 본인 기기에서 실제 광고 클릭 금지 — AdMob 계정 정지 위험.
// 개발 중 테스트하려면 임시로 true (Google 테스트 광고)로 변경
const USE_TEST_ADS = false;

// 실제 광고 단위 ID (USE_TEST_ADS=false일 때만 사용)
const REAL_INTERSTITIAL_ID = 'ca-app-pub-8051681065734198/7890150188';
// 보상형 ID — AdMob 콘솔에서 발급 ("충전 보상형")
const REAL_REWARDED_ID = 'ca-app-pub-8051681065734198/3369583147';

let interstitial: any = null;
let interstitialReady = false;
let interstitialLoading: Promise<boolean> | null = null;
let rewarded: any = null;
let rewardedReady = false;
let nativeReady = false;

function getInterstitialUnitId(): string {
  if (!admob) return REAL_INTERSTITIAL_ID;
  // 테스트 모드이거나 실제 ID 없으면 테스트 광고
  if (USE_TEST_ADS || !REAL_INTERSTITIAL_ID) return admob.TestIds.INTERSTITIAL;
  return REAL_INTERSTITIAL_ID;
}

function getRewardedUnitId(): string {
  if (!admob) return '';
  if (USE_TEST_ADS || !REAL_REWARDED_ID) return admob.TestIds.REWARDED;
  return REAL_REWARDED_ID;
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

    // Give Android a small beat after foregrounding so the current Activity is attached.
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

function loadRewarded(): void {
  if (!admob) return;
  try {
    rewarded = admob.RewardedAd.createForAdRequest(getRewardedUnitId(), {
      requestNonPersonalizedAdsOnly: true,
    });
    rewardedReady = false;
    rewarded.addAdEventListener(admob.RewardedAdEventType.LOADED, () => {
      rewardedReady = true;
    });
    rewarded.addAdEventListener(admob.AdEventType.ERROR, () => {
      rewardedReady = false;
    });
    rewarded.load();
  } catch (e) {
    console.warn('[ads] loadRewarded 실패:', e);
  }
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
    loadRewarded();
    console.log('[ads] 초기화 완료');
  } catch (e) {
    console.warn('[ads] 초기화 실패:', e);
    nativeReady = false;
  }
}

/**
 * 전면 광고 + callback (메시지/활동/음식 생성용)
 * - 하루 전체 통틀어 첫 생성 1회는 광고 없이 무료
 * - 그 다음(같은 날 2·3회차)은 짧은 전면 광고 후 생성
 * - 광고 실패 시에도 callback은 반드시 실행 (UX 멈춤 방지)
 */
export async function showInterstitialThenRun(callback: () => void, skipAd = false): Promise<void> {
  if (skipAd) {
    console.log('[ads] interstitial skipped: first server usage of day');
    callback();
    return;
  }

  const ready = await waitForInterstitialReady();
  if (!admob || !nativeReady || !interstitial || !ready) {
    console.warn('[ads] interstitial unavailable, continuing without ad', {
      hasModule: !!admob,
      nativeReady,
      hasInterstitial: !!interstitial,
      interstitialReady,
    });
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

/**
 * 보상형 광고 표시 + 끝까지 보면 서버에 보상 기록
 * 성공: 새로운 { used, limit } 반환 → UI 즉시 업데이트
 * 실패/취소: null 반환 → 호출 측이 안내
 */
export async function showRewardedAndGrant(): Promise<UsageInfo | null> {
  if (!admob || !nativeReady || !rewarded || !rewardedReady) {
    // 광고 모듈 없거나 로드 실패 → 광고 없이는 충전 불가
    if (admob && nativeReady && !rewardedReady) {
      loadRewarded();
    }
    return null;
  }

  return new Promise<UsageInfo | null>((resolve) => {
    let resolved = false;
    let rewardEarned = false;

    const earnedSub = rewarded.addAdEventListener(
      admob.RewardedAdEventType.EARNED_REWARD,
      () => {
        rewardEarned = true;
      },
    );

    const closedSub = rewarded.addAdEventListener(admob.AdEventType.CLOSED, async () => {
      if (resolved) return;
      resolved = true;
      try { earnedSub(); } catch {}
      try { closedSub(); } catch {}
      try { errorSub(); } catch {}
      loadRewarded(); // 다음 광고 미리 로드

      if (rewardEarned) {
        // 서버에 보상 기록 → 새로운 used/limit 받기
        const result = await redeemAdCredit(getRewardedUnitId());
        resolve(result);
      } else {
        // 끝까지 안 봐서 보상 없음
        resolve(null);
      }
    });

    const errorSub = rewarded.addAdEventListener(admob.AdEventType.ERROR, () => {
      if (resolved) return;
      resolved = true;
      try { earnedSub(); } catch {}
      try { closedSub(); } catch {}
      try { errorSub(); } catch {}
      loadRewarded();
      resolve(null);
    });

    try {
      rewarded.show();
    } catch (e) {
      if (resolved) return;
      resolved = true;
      console.warn('[ads] rewarded show 실패:', e);
      resolve(null);
    }
  });
}

/**
 * 보상형 광고가 지금 보여줄 수 있는 상태인지 확인 (UI에서 버튼 활성화용)
 */
export function isRewardedAvailable(): boolean {
  return !!(admob && nativeReady && rewarded && rewardedReady);
}
