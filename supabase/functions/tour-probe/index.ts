// 개발 중 공공데이터 API 모양을 확인하던 임시 진단 함수. 지금은 막아둠.
Deno.serve(() => new Response('{"error":"disabled"}', { status: 403, headers: { 'Content-Type': 'application/json' } }));
