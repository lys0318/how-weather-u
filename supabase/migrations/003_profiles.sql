-- User profile for message personalization (Spec B). One row per user.
-- All fields optional. Deleted automatically on account deletion via FK CASCADE.
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname    text,        -- how the user wants to be addressed
  age_band    text,        -- '10s'|'20s'|'30s'|'40s'|'50s'|'private'
  occupation  text,        -- 'student'|'worker'|'homemaker'|'jobseeker'|'etc'
  interests   text,        -- interests / hobbies (free text)
  concern     text,        -- current concern / what they want comfort about (free text)
  updated_at  timestamptz NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_profile" ON public.profiles;
CREATE POLICY "users_read_own_profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_insert_own_profile" ON public.profiles;
CREATE POLICY "users_insert_own_profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;
CREATE POLICY "users_update_own_profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_delete_own_profile" ON public.profiles;
CREATE POLICY "users_delete_own_profile" ON public.profiles
  FOR DELETE USING (auth.uid() = user_id);
