// Supabase Edge Function 호출 공통 헬퍼

import { supabase } from '../lib/supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export class LimitExceededError extends Error {
  used: number;
  limit: number;
  constructor(message: string, used: number, limit: number) {
    super(message);
    this.name = 'LimitExceededError';
    this.used = used;
    this.limit = limit;
  }
}

export interface BackendResponse {
  text: string;
  used?: number;
  limit?: number;
}

export async function callFunction<T extends BackendResponse = BackendResponse>(
  functionName: string,
  payload: Record<string, unknown>,
): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase 환경변수가 설정되지 않았습니다.');
  }

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
    let errBody: any = {};
    try { errBody = await res.json(); } catch {}

    // 한도 초과
    if (res.status === 429 && errBody?.code === 'LIMIT_EXCEEDED') {
      throw new LimitExceededError(
        errBody.error ?? '오늘의 한도를 모두 사용했어요.',
        errBody.used ?? 0,
        errBody.limit ?? 5,
      );
    }

    throw new Error(errBody?.error ?? `요청 실패 (${res.status})`);
  }

  return (await res.json()) as T;
}
