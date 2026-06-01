// 오늘 사용량 조회 Edge Function
// — 사용자 인증된 요청에 대해 { used, limit } 반환
// — 사용 기록은 추가하지 않음 (조회 전용)

import { corsHeaders } from '../_shared/cors.ts';
import { requireUser, getUsedTodayCount, getEffectiveLimit } from '../_shared/limit.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const user = await requireUser(req);
    // 실효 한도 (기본 + 광고 시청 보너스)
    const [used, limit] = await Promise.all([
      getUsedTodayCount(user.id),
      getEffectiveLimit(user.id),
    ]);
    return new Response(
      JSON.stringify({ used, limit }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
