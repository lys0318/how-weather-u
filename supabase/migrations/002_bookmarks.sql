-- 클라우드 북마크 동기화 테이블
-- 로컬 메시지의 id(local_id)와 user_id로 유일성 보장
CREATE TABLE IF NOT EXISTS public.bookmarks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_id           text NOT NULL,
  text               text NOT NULL,
  weather_emoji      text,
  weather_condition  text,
  preference         text,
  generated_at       timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, local_id)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user_created
  ON public.bookmarks (user_id, created_at DESC);

ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_bookmarks" ON public.bookmarks;
CREATE POLICY "users_read_own_bookmarks" ON public.bookmarks
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_insert_own_bookmarks" ON public.bookmarks;
CREATE POLICY "users_insert_own_bookmarks" ON public.bookmarks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_delete_own_bookmarks" ON public.bookmarks;
CREATE POLICY "users_delete_own_bookmarks" ON public.bookmarks
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_update_own_bookmarks" ON public.bookmarks;
CREATE POLICY "users_update_own_bookmarks" ON public.bookmarks
  FOR UPDATE USING (auth.uid() = user_id);
