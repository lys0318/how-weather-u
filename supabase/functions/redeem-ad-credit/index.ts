// 보상형 광고 시청 → 1회 충전 Edge Function
// - 클라이언트가 광고를 끝까지 본 직후 호출
// - ad_rewards 테이블에 기록 → 효과 한도 +1
// - 새로운 used/limit 반환해서 UI 즉시 반영

import { corsHeaders } from '../_shared/cors.ts';
import {
  requireUser,
  grantAdReward,
  getUsedTodayCount,
  getEffectiveLimit,
} from '../_shared/limit.ts';

interface RequestBody {
  adUnitId?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const user = await requireUser(req);

    let body: RequestBody = {};
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      // body 없어도 OK
    }

    await grantAdReward(user.id, body.adUnitId);

    // 새로운 사용량 / 한도 반환 (클라이언트에서 즉시 UI 업데이트용)
    const [used, limit] = await Promise.all([
      getUsedTodayCount(user.id),
      getEffectiveLimit(user.id),
    ]);

    return new Response(
      JSON.stringify({ ok: true, used, limit }),
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
