// AdMob 전면(Interstitial) 광고 헬퍼
// - 네이티브 모듈이 없는 빌드(예: 구버전 APK)에서도 graceful degrade
//   → 광고 못 보이면 그냥 바로 callback 실행
// - 광고를 미리 로드해두고, 호출 시 즉시 표시 → 다음 광고 다시 로드
// - 하루 첫 호출은 광고를 보여주지 않음 (선물 같은 느낌)

import AsyncStorage from '@react-native-async-storage/async-storage';
import { __DEV__ } from './_env';

const FREE_DAILY_KEY = 'lastAdFreeDate';

function kstTodayString(): string {
  // KST 자정 기준 yyyy-mm-dd
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 오늘 처음 호출인지 확인 + 호출 시 즉시 기록
 * @returns true면 광고 skip 대상 (오늘 첫 호출)
 */
async function isFirstCallOfDay(): Promise<boolean> {
  try {
    const today = kstTodayString();
    const last = await AsyncStorage.getItem(FREE_DAILY_KEY);
    if (last === today) return false; // 오늘 이미 한 번 사용
    await AsyncStorage.setItem(FREE_DAILY_KEY, today);
    return true; // 오늘 첫 호출
  } catch {
    return false;
  }
}

// 네이티브 모듈을 안전하게 require — 없으면 null로 두고 모든 호출을 skip
// 패키지가 설치 안 됐을 수도 있으므로 any 타입으로 처리
let admob: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  admob = require('react-native-google-mobile-ads');
} catch {
  admob = null;
}

// 실제 광고 단위 ID — 개발 모드에선 Google 테스트 광고 사용
const REAL_INTERSTITIAL_ID = 'ca-app-pub-8051681065734198/8755169596';

let interstitial: any = null;
let interstitialReady = false;
let nativeReady = false;

function getUnitId(): string {
  if (!admob) return REAL_INTERSTITIAL_ID;
  return __DEV__ ? admob.TestIds.INTERSTITIAL : REAL_INTERSTITIAL_ID;
}

function loadInterstitial(): void {
  if (!admob) return;
  try {
    interstitial = admob.InterstitialAd.createForAdRequest(getUnitId(), {
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

/**
 * 앱 시작 시 1회 호출
 */
export async function initAds(): Promise<void> {
  if (!admob) {
    console.log('[ads] 네이티브 모듈 없음 — 광고 비활성');
    return;
  }
  try {
    await admob.default().initialize();
    nativeReady = true;
    loadInterstitial();
    console.log('[ads] 초기화 완료');
  } catch (e) {
    console.warn('[ads] 초기화 실패:', e);
    nativeReady = false;
  }
}

/**
 * 전면 광고를 띄우고, 닫히면 callback 실행
 * - 광고 로드 안 됐거나 모듈 없으면 즉시 callback 실행 (UX 끊김 방지)
 * - 오늘의 첫 호출은 광고 없이 바로 실행 (하루 1회 선물)
 */
export async function showInterstitialThenRun(callback: () => void): Promise<void> {
  // 오늘 첫 호출이면 광고 skip
  const isFirst = await isFirstCallOfDay();
  if (isFirst) {
    callback();
    return;
  }

  if (!admob || !nativeReady || !interstitial || !interstitialReady) {
    // 광고 못 띄움 → 그냥 실행
    callback();
    // 다음 호출 대비해서 다시 로드 시도
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
      // 다음 광고 미리 로드
      loadInterstitial();
      // callback 실행
      callback();
    });
    // 사용자가 보지 않고 빠져나가는 경우도 보장 (LEFT_APPLICATION)
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
