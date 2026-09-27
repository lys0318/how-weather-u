-- 시간대별 기온 ({"0900": 19, ...}) — 조금 전에 받은 예보로도 '지금 기온'을 맞게 꺼내 쓰려고
-- (tour-map이 3~12시간 된 예보는 기다리지 않고 바로 쓰고 뒤에서 새로 받는다)
alter table public.grid_weather add column if not exists hourly jsonb;
