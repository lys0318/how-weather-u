// 오늘 사용량 조회 — get-usage Edge Function 래퍼
// 메시지/활동/음식 생성을 누르지 않아도 홈 화면에서 잔여 횟수 표시 가능

import { supabase } from '../lib/supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export interface UsageInfo {
  used: number;
  limit: number;
}

/**
 * 보상형 광고 시청 후 호출 → 1회 충전
 * 성공 시 새로운 used/limit 반환, 실패 시 null
 */
export async function redeemAdCredit(adUnitId?: string): Promise<UsageInfo | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/redeem-ad-credit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ adUnitId }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data?.used !== 'number' || typeof data?.limit !== 'number') return null;
    return { used: data.used, limit: data.limit };
  } catch {
    return null;
  }
}

/**
 * 오늘 사용량 조회 (인증 필요)
 * 실패 시 null 반환 — 호출 측이 fallback 처리
 */
export async function fetchTodayUsage(): Promise<UsageInfo | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/get-usage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({}),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data?.used !== 'number' || typeof data?.limit !== 'number') return null;
    return { used: data.used, limit: data.limit };
  } catch {
    return null;
  }
}
