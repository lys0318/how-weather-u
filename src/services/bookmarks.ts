// 북마크 클라우드 동기화 서비스
// - Supabase RLS로 본인 데이터만 접근
// - 토글 시: 로컬 즉시 반영(optimistic) + 클라우드 fire-and-forget
// - HistoryScreen에서 fetchCloudBookmarks()로 클라우드 데이터 조회

import { supabase } from '../lib/supabase';
import { StoredMessage } from '../utils/storage';

export interface CloudBookmark {
  id: string;
  local_id: string;
  text: string;
  weather_emoji: string | null;
  weather_condition: string | null;
  preference: string | null;
  generated_at: string;
  created_at: string;
}

/**
 * 클라우드 북마크 전체 조회 (생성일 최신순)
 * 로그인 안 됐거나 에러 시 빈 배열 반환 — UI 끊김 방지
 */
export async function fetchCloudBookmarks(): Promise<CloudBookmark[]> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return [];

    const { data, error } = await supabase
      .from('bookmarks')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[bookmarks] fetch error:', error.message);
      return [];
    }
    return (data ?? []) as CloudBookmark[];
  } catch (e) {
    console.warn('[bookmarks] fetch exception:', e);
    return [];
  }
}

/**
 * 메시지를 클라우드에 북마크로 업로드 (이미 있으면 무시 — UNIQUE 제약)
 */
export async function uploadBookmark(msg: StoredMessage): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다.');

  const { error } = await supabase.from('bookmarks').upsert(
    {
      user_id: user.id,
      local_id: msg.id,
      text: msg.text,
      weather_emoji: msg.weatherEmoji,
      weather_condition: msg.weatherCondition,
      generated_at: msg.generatedAt,
    },
    { onConflict: 'user_id,local_id' },
  );
  if (error) throw error;
}

/**
 * 로컬 ID로 클라우드 북마크 삭제
 */
export async function deleteCloudBookmark(localId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다.');

  const { error } = await supabase
    .from('bookmarks')
    .delete()
    .eq('user_id', user.id)
    .eq('local_id', localId);
  if (error) throw error;
}

/**
 * 클라우드 북마크 데이터를 화면에서 쓰기 좋은 StoredMessage 형태로 변환
 * (HistoryScreen이 동일한 MessageCard 컴포넌트를 재사용할 수 있도록)
 */
export function cloudToStoredMessage(b: CloudBookmark): StoredMessage {
  return {
    id: b.local_id,
    text: b.text,
    generatedAt: b.generated_at,
    weatherCondition: b.weather_condition ?? 'unknown',
    weatherEmoji: b.weather_emoji ?? '🌤️',
    isBookmarked: true,
  };
}
