// 일일 호출 제한 헬퍼
// 사용자별로 KST(한국시간) 자정 기준으로 제한 카운트

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// 서비스 키 사용 (RLS 우회, usage_log 쓰기 권한)
export const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export type Feature = 'message' | 'activity' | 'food' | 'fortune';
// ponytail: 하드 한도 제거. 스크립트 남용 방지용 상한만 유지 (UI 미노출).
export const ABUSE_CAP = 50;
const MAX_AD_REWARDS_PER_DAY = 10;

/**
 * Authorization 헤더에서 JWT 추출해 사용자 검증
 * 실패 시 throw
 */
export async function requireUser(req: Request): Promise<{ id: string; email?: string }> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('인증 토큰이 없습니다.');

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error('유효하지 않은 인증입니다.');
  return { id: data.user.id, email: data.user.email };
}

/**
 * KST 오늘 자정(UTC 기준) 반환
 * 예: KST 5월 19일 03:00 → UTC 5월 18일 18:00 → 자정은 KST 5월 19일 00:00 = UTC 5월 18일 15:00
 */
function kstMidnightUtc(): Date {
  const now = new Date();
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const kstNow = new Date(kstMs);
  // KST 자정의 UTC 시각
  const y = kstNow.getUTCFullYear();
  const m = kstNow.getUTCMonth();
  const d = kstNow.getUTCDate();
  // KST 자정 = UTC 전날 15시
  return new Date(Date.UTC(y, m, d) - 9 * 60 * 60 * 1000);
}

/**
 * 사용자의 오늘(KST 자정 기준) 전체 사용 횟수 카운트 (메시지+활동+음식 합산)
 */
export async function getUsedTodayCount(userId: string): Promise<number> {
  const since = kstMidnightUtc().toISOString();
  const { count, error } = await supabaseAdmin
    .from('usage_log')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('used_at', since);
  if (error) throw error;
  return count ?? 0;
}

/**
 * 사용자의 오늘 보상형 광고 시청 횟수
 * - 테이블이 아직 마이그레이션 안 됐을 수도 있으니 방어적으로 0 반환
 */
export async function getAdRewardsToday(userId: string): Promise<number> {
  try {
    const since = kstMidnightUtc().toISOString();
    const { count, error } = await supabaseAdmin
      .from('ad_rewards')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('earned_at', since);
    if (error) return 0; // 테이블 없거나 권한 문제 시 — 보너스 0
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function getEffectiveLimit(_userId: string): Promise<number> {
  return ABUSE_CAP;
}

/**
 * 광고 시청 보상 기록 추가
 * - 테이블 없으면 에러 throw (클라이언트에 알려야 함)
 */
export async function grantAdReward(userId: string, adUnitId?: string): Promise<void> {
  // 일일 상한 체크 (무한 충전 방지)
  // ponytail: 동시호출 시 상한을 살짝 넘을 수 있으나, 비용 바운드 목적엔 충분.
  const today = await getAdRewardsToday(userId);
  if (today >= MAX_AD_REWARDS_PER_DAY) {
    throw new Error(`오늘 광고 충전 한도(${MAX_AD_REWARDS_PER_DAY}회)에 도달했어요. 내일 다시 이용해주세요 🌙`);
  }

  const { error } = await supabaseAdmin
    .from('ad_rewards')
    .insert({ user_id: userId, ad_unit_id: adUnitId ?? null });
  if (error) throw error;
}

/**
 * 사용 기록 추가
 */
export async function logUsage(userId: string, feature: Feature): Promise<void> {
  const { error } = await supabaseAdmin
    .from('usage_log')
    .insert({ user_id: userId, feature });
  if (error) throw error;
}

/**
 * 제한 체크 + 기록 (모든 기능 합산 하루 3회)
 * @returns { ok, used, limit }  ok=false면 한도 초과
 */
export async function checkAndLog(
  userId: string,
  feature: Feature,
): Promise<{ ok: boolean; used: number; limit: number }> {
  // 실효 한도 = 기본 + 광고 보너스
  const limit = await getEffectiveLimit(userId);
  const used = await getUsedTodayCount(userId);
  if (used >= limit) {
    return { ok: false, used, limit };
  }
  await logUsage(userId, feature);
  return { ok: true, used: used + 1, limit };
}

/**
 * 한도 초과 응답 (HTTP 429)
 */
export function limitExceededResponse(used: number, limit: number, corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      error: `잠시 후 다시 시도해주세요 🌙`,
      code: 'LIMIT_EXCEEDED',
      used,
      limit,
    }),
    { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}
