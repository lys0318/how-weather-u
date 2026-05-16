// Supabase Edge Function 호출 공통 헬퍼
// 로그인된 경우 사용자 JWT 사용, 아니면 anon key (백워드 호환)

import { supabase } from '../lib/supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export async function callFunction<T = { text: string }>(
  functionName: string,
  payload: Record<string, unknown>,
): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase 환경변수가 설정되지 않았습니다.');
  }

  // 현재 세션의 access token 가져오기 (로그인 안 되어 있으면 anon key)
  const { data: { session } } = await supabase.auth.getSession();
  const authToken = session?.access_token ?? SUPABASE_ANON_KEY;

  const res = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let errMsg = `요청 실패 (${res.status})`;
    try {
      const errData = await res.json();
      if (errData?.error) errMsg = errData.error;
    } catch {}
    throw new Error(errMsg);
  }

  return (await res.json()) as T;
}
