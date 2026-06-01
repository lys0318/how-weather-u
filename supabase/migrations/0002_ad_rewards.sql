-- 광고 시청 보상 기록 테이블
-- 사용자가 보상형 광고 1편 시청 = 오늘 1회 추가 사용 가능
CREATE TABLE IF NOT EXISTS public.ad_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  earned_at timestamptz NOT NULL DEFAULT now(),
  ad_unit_id text
);

-- 자주 쓰는 쿼리: 특정 user_id의 오늘 보상 개수
CREATE INDEX IF NOT EXISTS ad_rewards_user_date_idx
  ON public.ad_rewards(user_id, earned_at);

-- RLS: 사용자는 자기 보상만 볼 수 있음 (insert는 service role에서만)
ALTER TABLE public.ad_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ad rewards"
  ON public.ad_rewards FOR SELECT
  USING (auth.uid() = user_id);
