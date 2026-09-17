// 구독(광고 제거) 상태 전역 관리.
// 구매/복원/만료 시 RevenueCat 리스너로 즉시 반영돼 광고가 바로 사라진다.

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  initPurchases,
  fetchPremiumState,
  onPremiumChange,
  linkPurchaseUser,
  unlinkPurchaseUser,
  isBillingAvailable,
  PremiumState,
  NO_PREMIUM,
} from '../services/purchases';
import { syncRenewalReminder } from '../services/notification';
import { useAuth } from './AuthContext';

interface PremiumContextValue {
  isPremium: boolean;
  /** 다음 결제일·해지 여부 (설정 화면 표시용) */
  premium: PremiumState;
  /** 결제 기능 자체를 쓸 수 있는지 (키 미설정/모듈 없음이면 false → 구독 UI 숨김) */
  billingAvailable: boolean;
  refresh: () => Promise<void>;
}

const PremiumContext = createContext<PremiumContextValue | null>(null);

export function usePremium(): PremiumContextValue {
  const ctx = useContext(PremiumContext);
  // Provider 밖에서 쓰여도 앱이 죽지 않도록 안전 기본값 (광고 유지 쪽)
  if (!ctx) return { isPremium: false, premium: NO_PREMIUM, billingAvailable: false, refresh: async () => {} };
  return ctx;
}

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const [premium, setPremium] = useState<PremiumState>(NO_PREMIUM);
  // 실제로 조회된 적이 있는지 — 초기값/조회 실패 상태로 갱신 안내를 지우지 않기 위함
  const [known, setKnown] = useState(false);
  const { user, loading } = useAuth();

  const refresh = useCallback(async () => {
    const s = await fetchPremiumState();
    if (!s) return; // 조회 실패 → 기존 상태 유지 (처음이면 광고 유지 쪽)
    setPremium(s);
    setKnown(true);
  }, []);

  // 초기화 + 상태 변경 구독
  useEffect(() => {
    let unsubscribe = () => {};
    (async () => {
      await initPurchases();
      await refresh();
      unsubscribe = onPremiumChange((s) => {
        setPremium(s);
        setKnown(true);
      });
    })();
    return () => unsubscribe();
  }, [refresh]);

  // 로그인/로그아웃에 맞춰 구독을 계정에 연결·해제 (기기 변경 시 구독 유지)
  // 세션 복원 전(loading)엔 user가 잠깐 null이라, 그때 해제하면 매 실행마다
  // RevenueCat 로그아웃→재로그인이 반복되고 광고가 깜빡인다 → 복원 끝난 뒤에만 판단.
  useEffect(() => {
    if (loading) return;
    (async () => {
      if (user?.id) await linkPurchaseUser(user.id);
      else await unlinkPurchaseUser();
      await refresh();
    })();
  }, [user?.id, loading, refresh]);

  // 첫 갱신 2일 전 안내 — 구독 상태가 바뀔 때마다 다시 판단(해지 감지 시 취소)
  useEffect(() => {
    if (!known || !isBillingAvailable()) return;
    syncRenewalReminder(premium);
  }, [known, premium.isPremium, premium.expiresAt, premium.willRenew, premium.firstPeriod]);

  return (
    <PremiumContext.Provider
      value={{ isPremium: premium.isPremium, premium, billingAvailable: isBillingAvailable(), refresh }}
    >
      {children}
    </PremiumContext.Provider>
  );
}
