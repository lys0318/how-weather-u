// 앱 사용 기록 — 이벤트마다 하루 한 번만 남긴다 (실사용자·지도 사용 측정용).
// AI 생성(usage_log)만 기록하던 때는 날씨만 보고 나가는 사람이 보이지 않았다.
import { supabase } from '../lib/supabase';

export type AppEvent = 'open' | 'map';

const sent = new Set<string>();
const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

export async function logAppEvent(event: AppEvent): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return; // 로그인(게스트 포함) 전에는 남기지 않는다
    const day = kstDay();
    const key = `${session.user.id}:${event}:${day}`;
    if (sent.has(key)) return;
    sent.add(key);
    // 같은 날 두 번째부터는 기본키가 겹쳐 거절된다 — 그대로 무시
    await supabase.from('app_event').insert({ user_id: session.user.id, day, event });
  } catch {
    // 측정용이라 실패해도 앱 동작엔 영향 없게 조용히 넘어간다
  }
}
