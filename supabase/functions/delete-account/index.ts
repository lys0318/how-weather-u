// 계정 탈퇴 Edge Function
// 사용자 JWT를 검증한 뒤 본인 계정을 영구 삭제
// auth.users.id가 삭제되면 usage_log는 FK ON DELETE CASCADE로 자동 정리됨

import { corsHeaders } from '../_shared/cors.ts';
import { requireUser, supabaseAdmin } from '../_shared/limit.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. 인증된 사용자 확인 (본인만 삭제 가능)
    const user = await requireUser(req);

    // 2. Supabase Auth에서 사용자 영구 삭제
    //    → auth.users 행 삭제 → 연쇄로 usage_log 등 관련 데이터 모두 삭제
    const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (error) throw error;

    return new Response(
      JSON.stringify({ success: true, deletedUserId: user.id }),
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
