// RevenueCat 구독 결제 (광고 제거 프리미엄)
// 네이티브 모듈 없는 빌드에서도 앱이 죽지 않도록 ads.ts와 동일하게 안전 require.

import { Platform } from 'react-native';
import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';

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

/** 결제 기능 사용 가능 여부 (모듈 + 키 + 플랫폼) */
export function isBillingAvailable(): boolean {
  return !!RNPurchases && !!API_KEY && Platform.OS === 'android';
}

/** 앱 시작 시 1회. 키가 없으면 조용히 skip — 구독 UI만 숨고 나머지는 정상 동작. */
export async function initPurchases(): Promise<void> {
  if (configured || !isBillingAvailable()) return;
  try {
    await RNPurchases.configure({ apiKey: API_KEY });
    configured = true;
  } catch (e) {
    console.warn('[purchases] 초기화 실패:', e);
  }
}

export function isPremiumFrom(info: CustomerInfo | null | undefined): boolean {
  return !!info?.entitlements?.active?.[ENTITLEMENT_ID];
}

/** 현재 구독 상태 조회. 실패 시 false(=광고 유지)로 폴백. */
export async function fetchIsPremium(): Promise<boolean> {
  if (!configured) return false;
  try {
    return isPremiumFrom(await RNPurchases.getCustomerInfo());
  } catch (e) {
    console.warn('[purchases] 상태 조회 실패:', e);
    return false;
  }
}

/** 구독 상태 변경 구독(구매/갱신/만료 시 호출). 해제 함수 반환. */
export function onPremiumChange(cb: (isPremium: boolean) => void): () => void {
  if (!configured) return () => {};
  const listener = (info: CustomerInfo) => cb(isPremiumFrom(info));
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
    return isPremiumFrom(customerInfo) ? 'purchased' : 'failed';
  } catch (e: any) {
    if (e?.userCancelled) return 'cancelled';
    console.warn('[purchases] 구매 실패:', e);
    return 'failed';
  }
}

/** 구매 복원 (기기 변경·재설치용). Play 정책상 필수 기능. */
export async function restorePurchases(): Promise<boolean> {
  if (!configured) return false;
  try {
    return isPremiumFrom(await RNPurchases.restorePurchases());
  } catch (e) {
    console.warn('[purchases] 복원 실패:', e);
    return false;
  }
}

/**
 * 구독을 로그인 계정에 연결. 기기를 바꿔도 같은 계정이면 구독이 따라옴.
 * 게스트는 익명 ID로 두고, 나중에 로그인할 때 이 함수가 병합해 준다.
 */
export async function linkPurchaseUser(userId: string): Promise<void> {
  if (!configured) return;
  try {
    await RNPurchases.logIn(userId);
  } catch (e) {
    console.warn('[purchases] 계정 연결 실패:', e);
  }
}

export async function unlinkPurchaseUser(): Promise<void> {
  if (!configured) return;
  try {
    await RNPurchases.logOut();
  } catch (e) {
    console.warn('[purchases] 계정 해제 실패:', e);
  }
}
