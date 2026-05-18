// 일일 호출 제한 헬퍼
// 사용자별로 KST(한국시간) 자정 기준으로 제한 카운트

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// 서비스 키 사용 (RLS 우회, usage_log 쓰기 권한)
export const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export type Feature = 'message' | 'activity' | 'food';
// 메시지/활동/음식 합산 하루 5회
export const DAILY_LIMIT_TOTAL = 5;

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
 * 사용 기록 추가
 */
export async function logUsage(userId: string, feature: Feature): Promise<void> {
  const { error } = await supabaseAdmin
    .from('usage_log')
    .insert({ user_id: userId, feature });
  if (error) throw error;
}

/**
 * 제한 체크 + 기록 (모든 기능 합산 하루 5회)
 * @returns { ok, used, limit }  ok=false면 한도 초과
 */
export async function checkAndLog(
  userId: string,
  feature: Feature,
): Promise<{ ok: boolean; used: number; limit: number }> {
  const limit = DAILY_LIMIT_TOTAL;
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
      error: `오늘의 한도 ${limit}회를 모두 사용하셨어요.\n내일 다시 만나요 🌙`,
      code: 'LIMIT_EXCEEDED',
      used,
      limit,
    }),
    { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}
