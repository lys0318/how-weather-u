// AdMob 광고 헬퍼 (전면 + 보상형)
// - 네이티브 모듈이 없는 빌드(예: Expo Go)에서도 graceful degrade
//   → 광고 못 보이면 그냥 바로 callback 실행
// - 광고를 미리 로드해두고, 호출 시 즉시 표시 → 다음 광고 다시 로드
// - 전면: 하루 첫 호출은 광고 스킵 (선물)
// - 보상형: 사용자가 직접 "광고 보고 충전" 클릭 시 호출

import AsyncStorage from '@react-native-async-storage/async-storage';
import { __DEV__ } from './_env';
import { redeemAdCredit, UsageInfo } from './usage';

const FREE_DAILY_KEY = 'lastAdFreeDate';

function kstTodayString(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function isFirstCallOfDay(): Promise<boolean> {
  try {
    const today = kstTodayString();
    const last = await AsyncStorage.getItem(FREE_DAILY_KEY);
    if (last === today) return false;
    await AsyncStorage.setItem(FREE_DAILY_KEY, today);
    return true;
  } catch {
    return false;
  }
}

// 네이티브 모듈 안전 require
let admob: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  admob = require('react-native-google-mobile-ads');
} catch {
  admob = null;
}

// ⚠️ 출시 전까지 true — 항상 Google 테스트 광고 사용
// AdMob "스토어 추가" 검증 통과 후 false로 바꾸고 실제 ID 입력하면 진짜 광고 게재
const USE_TEST_ADS = true;

// 실제 광고 단위 ID (USE_TEST_ADS=false일 때만 사용)
const REAL_INTERSTITIAL_ID = 'ca-app-pub-8051681065734198/8755169596';
// 보상형 — AdMob 콘솔에서 발급 ("충전 보상형")
const REAL_REWARDED_ID = 'ca-app-pub-8051681065734198/3369583147';

let interstitial: any = null;
let interstitialReady = false;
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

function loadInterstitial(): void {
  if (!admob) return;
  try {
    interstitial = admob.InterstitialAd.createForAdRequest(getInterstitialUnitId(), {
      requestNonPersonalizedAdsOnly: true,
    });
    interstitialReady = false;
    interstitial.addAdEventListener(admob.AdEventType.LOADED, () => {
      interstitialReady = true;
    });
    interstitial.addAdEventListener(admob.AdEventType.ERROR, () => {
      interstitialReady = false;
    });
    interstitial.load();
  } catch (e) {
    console.warn('[ads] loadInterstitial 실패:', e);
  }
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
    console.log('[ads] 네이티브 모듈 없음 — 광고 비활성');
    return;
  }
  try {
    await admob.default().initialize();
    nativeReady = true;
    loadInterstitial();
    loadRewarded();
    console.log('[ads] 초기화 완료');
  } catch (e) {
    console.warn('[ads] 초기화 실패:', e);
    nativeReady = false;
  }
}

/**
 * 전면 광고 + callback (메시지/활동/음식 생성용)
 * @param allowDailyFreebie true면 "하루 첫 호출 광고 없이 무료" 적용 (메시지 전용)
 * - 광고 안 떠도 callback은 반드시 실행 (UX 끊김 방지)
 */
export async function showInterstitialThenRun(
  callback: () => void,
  allowDailyFreebie = false,
): Promise<void> {
  // 메시지 첫 호출만 무료 (활동/음식은 매번 광고)
  if (allowDailyFreebie) {
    const isFirst = await isFirstCallOfDay();
    if (isFirst) {
      callback();
      return;
    }
  }

  if (!admob || !nativeReady || !interstitial || !interstitialReady) {
    callback();
    if (admob && nativeReady && !interstitialReady) {
      loadInterstitial();
    }
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

    interstitial.show();
  } catch (e) {
    console.warn('[ads] show 실패:', e);
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
    // 광고 모듈 없거나 로드 실패 — 광고 없이는 충전 불가
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
        // 끝까지 안 봄 → 보상 없음
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
