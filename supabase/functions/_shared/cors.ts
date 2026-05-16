// CORS 헤더 (React Native 클라이언트는 사실 CORS 영향 적지만, 웹 미리보기/디버깅용으로 포함)
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
