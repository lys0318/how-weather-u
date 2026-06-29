// 구글 프로필 (스펙 B) — 메시지 개인화용
// Supabase RLS로 본인 1행만 접근. 전부 선택 항목. 인메모리 캐시(저장 시 갱신).

import { supabase } from '../lib/supabase';

export interface Profile {
  nickname?: string;     // 호칭
  ageBand?: string;      // '10s'|'20s'|'30s'|'40s'|'50s'|'private'
  occupation?: string;   // 'student'|'worker'|'homemaker'|'jobseeker'|'etc'
  interests?: string;    // 관심사·취미 (자유)
  concern?: string;      // 요즘 고민·위로받고싶은 주제 (자유)
}

// 'none' = 아직 조회 안 함, null = 조회했으나 없음/게스트
let _cache: Profile | null | 'none' = 'none';

function rowToProfile(r: Record<string, unknown>): Profile {
  return {
    nickname: (r.nickname as string) ?? undefined,
    ageBand: (r.age_band as string) ?? undefined,
    occupation: (r.occupation as string) ?? undefined,
    interests: (r.interests as string) ?? undefined,
    concern: (r.concern as string) ?? undefined,
  };
}

/** 본인 프로필 조회 (없거나 게스트/에러 → null) */
export async function getMyProfile(): Promise<Profile | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { _cache = null; return null; }
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (error) {
      console.warn('[profile] fetch error:', error.message);
      return null;
    }
    const p = data ? rowToProfile(data as Record<string, unknown>) : null;
    _cache = p;
    return p;
  } catch (e) {
    console.warn('[profile] fetch exception:', e);
    return null;
  }
}

/** 캐시 우선 조회 (생성 시 사용 — 매번 네트워크 X) */
export async function getCachedProfile(): Promise<Profile | null> {
  if (_cache !== 'none') return _cache;
  return getMyProfile();
}

/** 본인 프로필 저장(upsert) + 캐시 갱신 */
export async function upsertMyProfile(p: Profile): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('not signed in');
  const row = {
    user_id: session.user.id,
    nickname: p.nickname?.trim() || null,
    age_band: p.ageBand || null,
    occupation: p.occupation || null,
    interests: p.interests?.trim() || null,
    concern: p.concern?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('profiles').upsert(row, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
  _cache = p;
}

export function invalidateProfileCache(): void {
  _cache = 'none';
}
