-- 운세 개인화용 띠/별자리. 둘 다 선택 입력.
-- 생년월일은 저장하지 않는다 — 사용자가 12개 중 하나를 직접 고르는 방식이라
-- 개인 식별성이 낮고, 개인정보 수집 범위를 늘리지 않는다.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS zodiac_animal text,  -- 'rat'|'ox'|...|'pig'
  ADD COLUMN IF NOT EXISTS star_sign     text;  -- 'aries'|'taurus'|...|'pisces'
