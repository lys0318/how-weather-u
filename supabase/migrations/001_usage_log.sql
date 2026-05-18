-- 사용자별 일일 호출 제한을 위한 사용 기록 테이블
CREATE TABLE IF NOT EXISTS public.usage_log (
  id        BIGSERIAL PRIMARY KEY,
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature   TEXT NOT NULL CHECK (feature IN ('message', 'activity', 'food')),
  used_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 조회 빠르게: 특정 유저의 특정 기능 사용 이력
CREATE INDEX IF NOT EXISTS idx_usage_log_lookup
  ON public.usage_log (user_id, feature, used_at DESC);

-- RLS: 자기 기록만 조회 가능
ALTER TABLE public.usage_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_read_own_usage" ON public.usage_log;
CREATE POLICY "users_read_own_usage" ON public.usage_log
  FOR SELECT USING (auth.uid() = user_id);
