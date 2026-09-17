// RevenueCat 구독 결제 (광고 제거 프리미엄)
// 네이티브 모듈 없는 빌드에서도 앱이 죽지 않도록 ads.ts와 동일하게 안전 require.

import { Platform } from 'react-native';
import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';
import { captureMessage } from '../lib/sentry';

let RNPurchases: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  RNPurchases = require('react-native-purchases').default;
} catch {
  RNPurchases = null;
}

// RevenueCat 대시보드의 Entitlement 식별자. 이게 활성이면 광고 제거.
export const ENTITLEMENT_ID = 'premium';

const API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

let configured = false;
let initPromise: Promise<void> | null = null;

// 결제 실패는 console.warn만으론 Sentry에 안 잡혀 원인을 모른다 → 메시지로 보고.
// 사용자가 스스로 닫은 취소는 실패가 아니므로 호출부에서 걸러서 부른다.
function report(what: string, e: unknown) {
  const err = e as { code?: unknown; readableErrorCode?: unknown; message?: unknown };
  const detail = [err?.readableErrorCode ?? err?.code, err?.message ?? String(e)].filter(Boolean).join(' ');
  console.warn(`[purchases] ${what}:`, e);
  captureMessage(`purchases: ${what} | ${detail}`.slice(0, 300), undefined, {
    key: `purchases:${what}`,
    throttleMs: 10 * 60 * 1000,
  });
}

/** 결제 기능 사용 가능 여부 (모듈 + 키 + 플랫폼) */
export function isBillingAvailable(): boolean {
  return !!RNPurchases && !!API_KEY && Platform.OS === 'android';
}

/**
 * 앱 시작 시 1회. 키가 없으면 조용히 skip — 구독 UI만 숨고 나머지는 정상 동작.
 * 같은 Promise를 돌려주므로, 다른 함수들이 await하면 초기화 완료를 기다린다
 * (예전엔 계정 연결이 초기화보다 먼저 돌면 조용히 건너뛰어졌음).
 */
export function initPurchases(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      if (!isBillingAvailable()) return;
      try {
        await RNPurchases.configure({ apiKey: API_KEY });
        configured = true;
      } catch (e) {
        report('init failed', e);
      }
    })();
  }
  return initPromise;
}

export function isPremiumFrom(info: CustomerInfo | null | undefined): boolean {
  return !!info?.entitlements?.active?.[ENTITLEMENT_ID];
}

export interface PremiumState {
  isPremium: boolean;
  /** 다음 갱신(또는 해지 시 만료) 시각 ms. 모르면 null */
  expiresAt: number | null;
  /** 자동 갱신 예정 여부. false면 해지됨(만료일까지는 이용 가능) */
  willRenew: boolean;
  /** 아직 한 번도 갱신되지 않은 첫 결제 기간인지 */
  firstPeriod: boolean;
}

export const NO_PREMIUM: PremiumState = { isPremium: false, expiresAt: null, willRenew: false, firstPeriod: false };

export function premiumStateFrom(info: CustomerInfo | null | undefined): PremiumState {
  const ent = info?.entitlements?.active?.[ENTITLEMENT_ID];
  if (!ent) return NO_PREMIUM;
  return {
    isPremium: true,
    expiresAt: ent.expirationDateMillis ?? null,
    willRenew: ent.willRenew,
    // 갱신되면 latestPurchaseDate가 갱신일로 바뀐다. 하루 이내 차이면 최초 결제 그대로.
    firstPeriod: Math.abs(ent.latestPurchaseDateMillis - ent.originalPurchaseDateMillis) < 24 * 60 * 60 * 1000,
  };
}

/** 현재 구독 상태 조회. 조회 실패면 null(=모름) — 호출부는 기존 상태를 유지한다. */
export async function fetchPremiumState(): Promise<PremiumState | null> {
  await initPurchases();
  if (!configured) return NO_PREMIUM;
  try {
    return premiumStateFrom(await RNPurchases.getCustomerInfo());
  } catch (e) {
    // 오프라인이면 흔히 실패 — SDK 캐시가 있어 드물지만 노이즈라 보고하지 않음
    console.warn('[purchases] 상태 조회 실패:', e);
    return null;
  }
}

/** 구독 상태 변경 구독(구매/갱신/만료 시 호출). 해제 함수 반환. */
export function onPremiumChange(cb: (state: PremiumState) => void): () => void {
  if (!configured) return () => {};
  const listener = (info: CustomerInfo) => cb(premiumStateFrom(info));
  RNPurchases.addCustomerInfoUpdateListener(listener);
  return () => {
    try { RNPurchases.removeCustomerInfoUpdateListener(listener); } catch {}
  };
}

/** 판매 중인 월 구독 상품. 없으면 null(대시보드 Offering 미설정 등). */
export async function getMonthlyPackage(): Promise<PurchasesPackage | null> {
  if (!configured) return null;
  try {
    const offerings = await RNPurchases.getOfferings();
    return offerings?.current?.availablePackages?.[0] ?? null;
  } catch (e) {
    console.warn('[purchases] 상품 조회 실패:', e);
    return null;
  }
}

export type PurchaseResult = 'purchased' | 'cancelled' | 'failed';

/** 구매 진행. 사용자가 결제창을 닫은 경우는 에러가 아니라 'cancelled'. */
export async function purchasePackage(pkg: PurchasesPackage): Promise<PurchaseResult> {
  if (!configured) return 'failed';
  try {
    const { customerInfo } = await RNPurchases.purchasePackage(pkg);
    if (isPremiumFrom(customerInfo)) return 'purchased';
    // 결제는 끝났는데 권한이 안 켜짐 — 대시보드 Entitlement/상품 연결이 어긋난 경우
    report('purchased but entitlement inactive', new Error(pkg.product.identifier));
    return 'failed';
  } catch (e: any) {
    if (e?.userCancelled) return 'cancelled';
    report('purchase failed', e);
    return 'failed';
  }
}

/** 구매 복원 (기기 변경·재설치용). Play 정책상 필수 기능. */
export async function restorePurchases(): Promise<boolean> {
  if (!configured) return false;
  try {
    return isPremiumFrom(await RNPurchases.restorePurchases());
  } catch (e) {
    report('restore failed', e);
    return false;
  }
}

/**
 * 구독을 로그인 계정에 연결. 기기를 바꿔도 같은 계정이면 구독이 따라옴.
 * 게스트는 익명 ID로 두고, 나중에 로그인할 때 이 함수가 병합해 준다.
 */
export async function linkPurchaseUser(userId: string): Promise<void> {
  await initPurchases();
  if (!configured) return;
  try {
    await RNPurchases.logIn(userId);
  } catch (e) {
    report('link failed', e);
  }
}

export async function unlinkPurchaseUser(): Promise<void> {
  await initPurchases();
  if (!configured) return;
  try {
    await RNPurchases.logOut();
  } catch (e) {
    console.warn('[purchases] 계정 해제 실패:', e);
  }
}
