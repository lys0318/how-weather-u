// 구독(광고 제거) 상태 전역 관리.
// 구매/복원/만료 시 RevenueCat 리스너로 즉시 반영돼 광고가 바로 사라진다.

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  initPurchases,
  fetchIsPremium,
  onPremiumChange,
  linkPurchaseUser,
  unlinkPurchaseUser,
  isBillingAvailable,
} from '../services/purchases';
import { useAuth } from './AuthContext';

interface PremiumContextValue {
  isPremium: boolean;
  /** 결제 기능 자체를 쓸 수 있는지 (키 미설정/모듈 없음이면 false → 구독 UI 숨김) */
  billingAvailable: boolean;
  refresh: () => Promise<void>;
}

const PremiumContext = createContext<PremiumContextValue | null>(null);

export function usePremium(): PremiumContextValue {
  const ctx = useContext(PremiumContext);
  // Provider 밖에서 쓰여도 앱이 죽지 않도록 안전 기본값 (광고 유지 쪽)
  if (!ctx) return { isPremium: false, billingAvailable: false, refresh: async () => {} };
  return ctx;
}

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const [isPremium, setIsPremium] = useState(false);
  const { user } = useAuth();

  const refresh = useCallback(async () => {
    setIsPremium(await fetchIsPremium());
  }, []);

  // 초기화 + 상태 변경 구독
  useEffect(() => {
    let unsubscribe = () => {};
    (async () => {
      await initPurchases();
      await refresh();
      unsubscribe = onPremiumChange(setIsPremium);
    })();
    return () => unsubscribe();
  }, [refresh]);

  // 로그인/로그아웃에 맞춰 구독을 계정에 연결·해제 (기기 변경 시 구독 유지)
  useEffect(() => {
    (async () => {
      if (user?.id) await linkPurchaseUser(user.id);
      else await unlinkPurchaseUser();
      await refresh();
    })();
  }, [user?.id, refresh]);

  return (
    <PremiumContext.Provider
      value={{ isPremium, billingAvailable: isBillingAvailable(), refresh }}
    >
      {children}
    </PremiumContext.Provider>
  );
}
